"""
Gemini wrapper: one place for retries, JSON extraction, and multimodal calls.
Judges: swap model names via env without touching agent logic.
"""

from __future__ import annotations

import json
import logging
import re
import time
import base64
from typing import Any

import google.generativeai as genai
import httpx
from google.api_core import exceptions as google_api_exceptions

from config import get_settings

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 4


def _normalize_model_id(model_id: str) -> str:
    """Normalize model id for GenerativeModel (strip optional 'models/' prefix)."""
    name = model_id.strip()
    if name.startswith("models/"):
        return name[7:]
    return name


def _text_model_id() -> str:
    return _normalize_model_id(get_settings().gemini_text_model)


def _ingestion_model_id() -> str:
    return _normalize_model_id(get_settings().gemini_ingestion_model)
_BASE_DELAY_S = 0.8


def configure_gemini() -> None:
    s = get_settings()
    if not s.gemini_api_key:
        logger.warning("GEMINI_API_KEY missing — LLM calls will fail until set.")
    genai.configure(api_key=s.gemini_api_key or "missing")


def _sleep_backoff(attempt: int) -> None:
    time.sleep(_BASE_DELAY_S * (2**attempt))


def _sleep_for_rate_limit(exc: Exception) -> None:
    """Honor Gemini 429 retry hints when present (RPM / quota)."""
    msg = str(exc)
    m = re.search(r"retry in ([\d.]+)\s*s", msg, re.I)
    if m:
        delay = float(m.group(1))
        time.sleep(min(max(delay + 0.25, 0.5), 90.0))
        return
    time.sleep(6.0)


def extract_json_blob(text: str) -> Any:
    """Parse first JSON object or array from model output (strips ``` fences)."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.I)
    if fence:
        cleaned = fence.group(1).strip()
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start_obj, start_arr = cleaned.find("{"), cleaned.find("[")
        starts = [i for i in (start_obj, start_arr) if i >= 0]
        if not starts:
            raise
        start = min(starts)
        snippet = cleaned[start:]
        return json.loads(snippet)


def generate_text(
    prompt: str,
    *,
    temperature: float = 0.35,
    max_attempts: int | None = None,
    max_output_tokens: int | None = None,
) -> str:
    """Plain text generation with retries.

    `max_attempts` is useful for optional/latency-sensitive calls (e.g. building a small
    concept graph during ingestion) so the upload API doesn't hang for too long.
    """
    configure_gemini()
    model = genai.GenerativeModel(_text_model_id())
    last_err: Exception | None = None
    attempts = int(max_attempts) if max_attempts is not None else _MAX_ATTEMPTS
    attempts = max(1, attempts)
    for attempt in range(attempts):
        try:
            gen_cfg: dict[str, Any] = {"temperature": temperature}
            if max_output_tokens is not None:
                gen_cfg["max_output_tokens"] = max_output_tokens
            resp = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(**gen_cfg),
            )
            return (resp.text or "").strip()
        except google_api_exceptions.ResourceExhausted as e:
            last_err = e
            logger.warning(
                "Gemini generate_text rate limited (429), attempt %s — waiting before retry",
                attempt,
            )
            if attempt < attempts - 1:
                _sleep_for_rate_limit(e)
        except google_api_exceptions.DeadlineExceeded as e:
            last_err = e
            logger.warning(
                "Gemini generate_text deadline exceeded (504), attempt %s — waiting before retry",
                attempt,
            )
            if attempt < attempts - 1:
                _sleep_backoff(attempt)
        except Exception as e:  # noqa: BLE001 — demo: broad catch + retry
            last_err = e
            logger.exception("Gemini generate_text attempt %s failed", attempt)
            if attempt < attempts - 1:
                _sleep_backoff(attempt)
    raise RuntimeError("Gemini generate_text failed after retries") from last_err


def generate_json(prompt: str, *, temperature: float = 0.2) -> Any:
    """Ask model for JSON; parse robustly."""
    text = generate_text(
        prompt
        + "\n\nRespond with valid JSON only. No markdown fences, no commentary.",
        temperature=temperature,
    )
    return extract_json_blob(text)


def generate_multimodal(
    prompt: str,
    *,
    mime_type: str,
    data: bytes,
    temperature: float = 0.25,
) -> str:
    """Multimodal single-part inline data (PDF, image, audio where supported)."""
    configure_gemini()
    model = genai.GenerativeModel(_ingestion_model_id())
    last_err: Exception | None = None
    part = {"mime_type": mime_type, "data": data}
    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = model.generate_content(
                [prompt, part],
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                ),
            )
            return (resp.text or "").strip()
        except google_api_exceptions.ResourceExhausted as e:
            last_err = e
            logger.warning(
                "Gemini multimodal rate limited (429), attempt %s — waiting before retry",
                attempt,
            )
            if attempt < _MAX_ATTEMPTS - 1:
                _sleep_for_rate_limit(e)
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.exception("Gemini multimodal attempt %s failed", attempt)
            if attempt < _MAX_ATTEMPTS - 1:
                _sleep_backoff(attempt)
    raise RuntimeError("Gemini multimodal failed after retries") from last_err


_working_embed_model: str | None = None


def _normalize_embed_model_id(mid: str) -> str:
    mid = mid.strip()
    if not mid:
        return mid
    if mid.startswith("models/"):
        return mid
    return f"models/{mid}" if "/" not in mid else mid


def _embedding_model_candidates() -> list[str]:
    """Ordered list. text-embedding-004 retired Jan 2026 — not included."""
    s = get_settings()
    primary = s.gemini_embedding_model.strip()
    if not primary:
        primary = "models/gemini-embedding-001"
    else:
        primary = _normalize_embed_model_id(primary)
    seen: set[str] = set()
    out: list[str] = []
    for m in (primary, "models/gemini-embedding-001", "models/gemini-embedding-2-preview"):
        if m not in seen:
            out.append(m)
            seen.add(m)
    return out


def _embedding_target_dim() -> int:
    d = int(get_settings().gemini_embedding_output_dimensionality)
    return max(0, min(d, 3072))


def _truncate_embedding(vec: list[float], dim: int) -> list[float]:
    if dim <= 0:
        return vec
    if len(vec) > dim:
        return vec[:dim]
    return vec


def _embed_one_call(model: str, text: str) -> list[float]:
    """Matryoshka: prefer output_dimensionality for gemini-embedding-* (matches pgvector column)."""
    dim = _embedding_target_dim()
    is_gemini_embed = "gemini-embedding" in model.lower()

    attempts: list[dict[str, object]] = []
    if is_gemini_embed and dim > 0:
        attempts.append(
            {"model": model, "content": text, "output_dimensionality": dim},
        )
        attempts.append(
            {
                "model": model,
                "content": text,
                "output_dimensionality": dim,
                "task_type": "retrieval_document",
            },
        )
    attempts.append({"model": model, "content": text, "task_type": "retrieval_document"})
    attempts.append({"model": model, "content": text})

    last_err: Exception | None = None
    for kwargs in attempts:
        try:
            res = genai.embed_content(**kwargs)  # type: ignore[arg-type]
            vec = res.get("embedding")
            if not vec:
                continue
            out = list(vec)
            out = _truncate_embedding(out, dim)
            if dim > 0 and len(out) != dim:
                last_err = RuntimeError(
                    f"Embedding length {len(out)} does not match target dimension {dim}",
                )
                continue
            return out
        except TypeError as e:
            last_err = e
            continue
        except Exception as e:  # noqa: BLE001
            last_err = e
            continue

    if last_err is not None:
        raise last_err
    raise RuntimeError("Empty embedding from Gemini")


def _embed_one(text: str) -> list[float]:
    """Try candidate models until one works; cache the winner for the rest of the process."""
    global _working_embed_model
    candidates = _embedding_model_candidates()
    if _working_embed_model and _working_embed_model in candidates:
        candidates = [_working_embed_model] + [c for c in candidates if c != _working_embed_model]
    last_err: Exception | None = None
    for model in candidates:
        try:
            vec = _embed_one_call(model, text)
            _working_embed_model = model
            return vec
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.debug("embed_content failed for %s: %s", model, e)
    assert last_err is not None
    raise last_err


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch embeddings for pgvector storage (_embed_one already tries several model ids)."""
    configure_gemini()
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            return [_embed_one(t) for t in texts]
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.exception("Gemini embed batch attempt %s failed", attempt)
            if attempt < 1:
                _sleep_backoff(attempt)
    raise RuntimeError("Gemini embed failed after retries") from last_err


def _normalize_generate_model_id(model_id: str) -> str:
    mid = model_id.strip()
    if mid.startswith("models/"):
        return mid[7:]
    return mid


def generate_image_bytes_rest(
    prompt: str,
    *,
    model_id: str | None = None,
    timeout_s: float = 120.0,
) -> tuple[bytes, str]:
    """
    Image output via Generative Language REST API (responseModalities: IMAGE).
    The deprecated google-generativeai client does not expose response modalities; we use HTTP here.
    """
    s = get_settings()
    key = (s.gemini_api_key or "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is required for image generation")

    mid = _normalize_generate_model_id(model_id or s.gemini_meme_image_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{mid}:generateContent"
    body: dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
        },
    }
    last_err: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            r = httpx.post(
                url,
                params={"key": key},
                json=body,
                timeout=timeout_s,
            )
            r.raise_for_status()
            payload = r.json()
            img = _extract_inline_image_from_rest_response(payload)
            if img:
                return img
            raise RuntimeError("Model response contained no image data (NO_IMAGE or text-only)")
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.exception("Gemini image REST attempt %s failed", attempt)
            if attempt < _MAX_ATTEMPTS - 1:
                _sleep_backoff(attempt)
    raise RuntimeError("Gemini image generation failed after retries") from last_err


def _extract_inline_image_from_rest_response(payload: dict[str, Any]) -> tuple[bytes, str] | None:
    """Return (raw_bytes, mime_type) from first inlineData image part, or None."""
    cands = payload.get("candidates")
    if not isinstance(cands, list) or not cands:
        return None
    content = cands[0].get("content") or {}
    parts = content.get("parts")
    if not isinstance(parts, list):
        return None
    for p in parts:
        if not isinstance(p, dict):
            continue
        inline = p.get("inlineData") or p.get("inline_data")
        if not isinstance(inline, dict):
            continue
        mime = str(inline.get("mimeType") or inline.get("mime_type") or "image/png")
        b64 = inline.get("data")
        if not b64:
            continue
        try:
            raw = base64.b64decode(b64, validate=True)
        except Exception:  # noqa: BLE001
            raw = base64.b64decode(b64)
        if raw:
            return raw, mime
    return None


def embed_texts_optional(texts: list[str]) -> list[list[float]] | None:
    """
    Like embed_texts but returns None if no embedding model works.
    Callers can persist concepts without vectors so ingestion still succeeds.
    """
    try:
        return embed_texts(texts)
    except Exception as e:  # noqa: BLE001
        logger.warning("All embedding models failed — continuing without vectors: %s", e)
        return None
