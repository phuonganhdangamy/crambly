"""
Gemini wrapper: one place for retries, JSON extraction, and multimodal calls.
Judges: swap model names via env without touching agent logic.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import google.generativeai as genai

from config import get_settings

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 4


def _generative_model_id() -> str:
    """Normalize model id for GenerativeModel (strip optional 'models/' prefix)."""
    name = get_settings().gemini_model.strip()
    if name.startswith("models/"):
        return name[7:]
    return name
_BASE_DELAY_S = 0.8


def configure_gemini() -> None:
    s = get_settings()
    if not s.gemini_api_key:
        logger.warning("GEMINI_API_KEY missing — LLM calls will fail until set.")
    genai.configure(api_key=s.gemini_api_key or "missing")


def _sleep_backoff(attempt: int) -> None:
    time.sleep(_BASE_DELAY_S * (2**attempt))


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


def generate_text(prompt: str, *, temperature: float = 0.35) -> str:
    """Plain text generation with retries."""
    configure_gemini()
    model = genai.GenerativeModel(_generative_model_id())
    last_err: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            resp = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                ),
            )
            return (resp.text or "").strip()
        except Exception as e:  # noqa: BLE001 — demo: broad catch + retry
            last_err = e
            logger.exception("Gemini generate_text attempt %s failed", attempt)
            if attempt < _MAX_ATTEMPTS - 1:
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
    model = genai.GenerativeModel(_generative_model_id())
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
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.exception("Gemini multimodal attempt %s failed", attempt)
            if attempt < _MAX_ATTEMPTS - 1:
                _sleep_backoff(attempt)
    raise RuntimeError("Gemini multimodal failed after retries") from last_err


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch embeddings for pgvector storage."""
    configure_gemini()
    s = get_settings()
    last_err: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            out: list[list[float]] = []
            for t in texts:
                res = genai.embed_content(
                    model=s.gemini_embedding_model,
                    content=t,
                    task_type="retrieval_document",
                )
                vec = res.get("embedding")
                if not vec:
                    raise RuntimeError("Empty embedding from Gemini")
                out.append(list(vec))
            return out
        except Exception as e:  # noqa: BLE001
            last_err = e
            logger.exception("Gemini embed attempt %s failed", attempt)
            if attempt < _MAX_ATTEMPTS - 1:
                _sleep_backoff(attempt)
    raise RuntimeError("Gemini embed failed after retries") from last_err
