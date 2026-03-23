"""
Study meme pipeline: Gemini brief → Imgflip caption (fast) or Gemini image (fallback / reimagine).
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from config import Settings
from gemini_client import extract_json_blob, generate_image_bytes_rest, generate_text

logger = logging.getLogger(__name__)

ALLOWED_TEMPLATES = frozenset(
    {
        "drake",
        "distracted_boyfriend",
        "among_us_emergency",
        "this_is_fine",
        "galaxy_brain",
        "custom",
    }
)

# Imgflip template_id strings (api.imgflip.com/caption_image).
IMGFLIP_TEMPLATE_IDS: dict[str, str] = {
    "drake": "181913649",
    "distracted_boyfriend": "129242436",
    "among_us_emergency": "268378464",
    "this_is_fine": "55365341",
    "galaxy_brain": "93895088",
}

MEME_BRIEF_PROMPT = """You are helping students remember material with a single study-related meme.

Return JSON only (no markdown fences) with exactly these keys:
- "template": one of "drake", "distracted_boyfriend", "among_us_emergency", "this_is_fine", "galaxy_brain"
- "top_text": short string for the top of the meme (student-safe, no slurs)
- "bottom_text": short string for the bottom (can be empty string if the template uses one panel)
- "fallback_prompt": a single string: "A highly detailed meme-style illustration of [scene description] with bold impact font text saying [text]"
  where [scene description] matches the meme idea and [text] summarizes the joke (include top/bottom wording if relevant).

Concept title: {concept_title}
Summary: {summary}

JSON only."""


def _coerce_brief(raw: Any, *, concept_title: str) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise ValueError("meme brief is not a JSON object")
    template = str(raw.get("template") or "custom").strip().lower().replace(" ", "_")
    if template not in ALLOWED_TEMPLATES:
        template = "custom"
    top = str(raw.get("top_text") or "")[:200]
    bottom = str(raw.get("bottom_text") or "")[:200]
    fallback = str(raw.get("fallback_prompt") or "").strip()
    if not fallback:
        safe_title = concept_title[:120]
        fallback = (
            f"A highly detailed meme-style illustration of a student studying "
            f"the concept \"{safe_title}\" with bold impact font "
            f"text saying {top!r} and {bottom!r}"
        )
    return {
        "template": template,
        "top_text": top,
        "bottom_text": bottom,
        "fallback_prompt": fallback[:2000],
    }


def build_meme_brief(*, concept_title: str, summary: str) -> dict[str, str]:
    prompt = MEME_BRIEF_PROMPT.format(concept_title=concept_title, summary=summary)
    raw_text = generate_text(
        prompt + "\n\nRespond with valid JSON only. No markdown, no commentary.",
        temperature=0.85,
    )
    data = extract_json_blob(raw_text)
    brief = _coerce_brief(data, concept_title=concept_title)
    return brief


def caption_imgflip(
    settings: Settings,
    template_key: str,
    top_text: str,
    bottom_text: str,
) -> str | None:
    tid = IMGFLIP_TEMPLATE_IDS.get(template_key)
    user = (settings.imgflip_username or "").strip()
    password = (settings.imgflip_password or "").strip()
    if not tid or not user or not password:
        return None
    try:
        r = httpx.post(
            "https://api.imgflip.com/caption_image",
            data={
                "template_id": tid,
                "username": user,
                "password": password,
                "text0": top_text,
                "text1": bottom_text,
            },
            timeout=45.0,
        )
        r.raise_for_status()
        body = r.json()
    except Exception as e:  # noqa: BLE001
        logger.warning("Imgflip caption failed: %s", e)
        return None
    if not body.get("success"):
        logger.warning("Imgflip error: %s", body.get("error_message"))
        return None
    data = body.get("data") or {}
    url = data.get("url")
    return str(url) if url else None


def _brief_from_client_payload(raw: dict[str, Any] | None, *, concept_title: str) -> dict[str, str] | None:
    if not raw or not isinstance(raw, dict):
        return None
    try:
        return _coerce_brief(raw, concept_title=concept_title)
    except ValueError:
        return None


def run_meme_pipeline(
    *,
    concept_title: str,
    summary: str,
    force_image: bool,
    prior_brief: dict[str, Any] | None,
    settings: Settings,
) -> dict[str, Any]:
    brief: dict[str, str] | None = None
    if force_image and prior_brief:
        brief = _brief_from_client_payload(prior_brief, concept_title=concept_title)
    if brief is None:
        brief = build_meme_brief(concept_title=concept_title, summary=summary)
    template = brief["template"]

    use_imgflip = (
        not force_image
        and template != "custom"
        and template in IMGFLIP_TEMPLATE_IDS
    )
    if use_imgflip:
        url = caption_imgflip(
            settings,
            template,
            brief["top_text"],
            brief["bottom_text"],
        )
        if url:
            return {
                "brief": brief,
                "source": "imgflip",
                "image_url": url,
            }

    raw, mime = generate_image_bytes_rest(
        brief["fallback_prompt"],
        model_id=settings.gemini_meme_image_model,
    )
    return {
        "brief": brief,
        "source": "gemini",
        "image_base64": base64.b64encode(raw).decode("ascii"),
        "mime": mime,
    }
