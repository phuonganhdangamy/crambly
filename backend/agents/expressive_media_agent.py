"""
Study meme pipeline: Gemini brief → Imgflip caption (fast) or Gemini image (fallback / reimagine).
"""

from __future__ import annotations

import base64
import logging
import random
from html import escape as html_escape
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
        "change_my_mind",
        "is_this_a_pigeon",
        "custom",
    }
)

# Imgflip template_id strings (api.imgflip.com/caption_image).
# Only two-caption templates: caption_image maps text0/text1 and does not fill multi-panel layouts.
IMGFLIP_TEMPLATE_IDS: dict[str, str] = {
    "drake": "181913649",
    "distracted_boyfriend": "129242436",
    "among_us_emergency": "268378464",
    "this_is_fine": "55365341",
    "change_my_mind": "149430545",
    "is_this_a_pigeon": "100777631",
}

MEME_BRIEF_PROMPT = """You are helping students remember material with a single study-related meme.

Return JSON only (no markdown fences) with exactly these keys:
- "template": one of "drake", "distracted_boyfriend", "among_us_emergency", "this_is_fine", "change_my_mind", "is_this_a_pigeon", "custom"
  Pick the template that best fits the joke (vary your choice across memes). Every option except "custom" uses exactly two text boxes via Imgflip.
- "top_text": short string for the first caption (student-safe, no slurs)
- "bottom_text": short string for the second caption (both should carry the punchline when the format needs two lines)
- "fallback_prompt": a single string: "A highly detailed meme-style illustration of [scene description] with bold impact font text saying [text]"
  where [scene description] matches the meme idea and [text] summarizes the joke (include top/bottom wording if relevant).

Concept title: {concept_title}
Summary: {summary}

JSON only."""


def _fallback_brief(
    *,
    concept_title: str,
    summary: str,
    forbid_template: str | None = None,
) -> dict[str, str]:
    """Deterministic local fallback when Gemini text briefing is temporarily unavailable."""
    ft = (forbid_template or "").strip().lower().replace(" ", "_")
    choices = [k for k in IMGFLIP_TEMPLATE_IDS.keys() if k != ft] if ft else list(IMGFLIP_TEMPLATE_IDS.keys())
    template = random.choice(choices) if choices else "custom"
    title = " ".join(concept_title.split())[:80] or "Key concept"
    snippet = " ".join(summary.split())[:140] if summary.strip() else "Focus on the key idea and avoid common confusion."
    top = f"When the exam asks about {title[:44]}"
    bottom = snippet[:110] if snippet else f"{title} in plain English"
    fallback_prompt = (
        "A highly detailed meme-style illustration of a student in a lecture hall realizing "
        f"the concept '{title}' with bold impact font text saying '{top}' and '{bottom}'."
    )
    return {
        "template": template,
        "top_text": top,
        "bottom_text": bottom,
        "fallback_prompt": fallback_prompt[:2000],
    }


def _fallback_svg_meme_bytes(*, top_text: str, bottom_text: str) -> tuple[bytes, str]:
    """Generate a simple local meme image so regenerate never hard-fails."""
    top = html_escape((top_text or "Study smarter").strip())[:120]
    bottom = html_escape((bottom_text or "Key idea, remembered.").strip())[:140]
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#0f172a"/>
    <stop offset="100%" stop-color="#111827"/>
  </linearGradient>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<rect x="40" y="40" width="944" height="944" rx="24" fill="none" stroke="#22d3ee" stroke-opacity="0.35" stroke-width="3"/>
<text x="512" y="140" text-anchor="middle" fill="#f8fafc" font-family="Impact, Arial Black, sans-serif" font-size="64">{top}</text>
<text x="512" y="916" text-anchor="middle" fill="#f8fafc" font-family="Impact, Arial Black, sans-serif" font-size="52">{bottom}</text>
<text x="512" y="525" text-anchor="middle" fill="#93c5fd" font-family="Inter, Arial, sans-serif" font-size="40">Crambly fallback meme</text>
</svg>"""
    return svg.encode("utf-8"), "image/svg+xml"


def _coerce_brief(
    raw: Any,
    *,
    concept_title: str,
    forbid_template: str | None = None,
) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise ValueError("meme brief is not a JSON object")
    template = str(raw.get("template") or "custom").strip().lower().replace(" ", "_")
    # Legacy: galaxy_brain has four panels but Imgflip only fills two boxes.
    if template == "galaxy_brain":
        alts = list(IMGFLIP_TEMPLATE_IDS.keys())
        template = random.choice(alts) if alts else "custom"
    if template not in ALLOWED_TEMPLATES:
        template = "custom"
    ft = (forbid_template or "").strip().lower().replace(" ", "_")
    if ft and template == ft and ft in IMGFLIP_TEMPLATE_IDS:
        alts = [k for k in IMGFLIP_TEMPLATE_IDS if k != ft]
        if alts:
            template = random.choice(alts)
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


def build_meme_brief(
    *,
    concept_title: str,
    summary: str,
    forbid_template: str | None = None,
    temperature: float | None = None,
) -> dict[str, str]:
    prompt = MEME_BRIEF_PROMPT.format(concept_title=concept_title, summary=summary)
    ft = (forbid_template or "").strip().lower().replace(" ", "_")
    if ft and ft in ALLOWED_TEMPLATES and ft != "custom":
        prompt += (
            f'\n\nRegenerate constraint: do NOT use the "{ft}" meme template again. '
            "Pick a different template from the allowed list and write fresh top/bottom text for it."
        )
    temp = 0.95 if ft else (temperature if temperature is not None else 0.85)
    try:
        raw_text = generate_text(
            prompt + "\n\nRespond with valid JSON only. No markdown, no commentary.",
            temperature=temp,
        )
        data = extract_json_blob(raw_text)
        brief = _coerce_brief(data, concept_title=concept_title, forbid_template=ft or None)
        return brief
    except Exception:  # noqa: BLE001
        logger.warning("Gemini meme brief generation failed; using local fallback brief", exc_info=True)
        return _fallback_brief(
            concept_title=concept_title,
            summary=summary,
            forbid_template=ft or None,
        )


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


def run_meme_pipeline(
    *,
    concept_title: str,
    summary: str,
    force_image: bool,
    prior_brief: dict[str, Any] | None,
    settings: Settings,
) -> dict[str, Any]:
    """
    Always generates a new text brief (template + captions + fallback_prompt).

    When force_image is True (client \"regenerate\" / reimagine), we still build a fresh brief.
    If prior_brief is passed, its template name is avoided so the next meme is a different theme
    when using classic Imgflip templates.
    """
    forbid: str | None = None
    if force_image and prior_brief and isinstance(prior_brief, dict):
        t = str(prior_brief.get("template") or "").strip().lower().replace(" ", "_")
        if t in ALLOWED_TEMPLATES and t != "custom":
            forbid = t
    brief = build_meme_brief(concept_title=concept_title, summary=summary, forbid_template=forbid)
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

    try:
        raw, mime = generate_image_bytes_rest(
            brief["fallback_prompt"],
            model_id=settings.gemini_meme_image_model,
        )
    except Exception:  # noqa: BLE001
        logger.warning("Gemini image generation failed; using local SVG meme fallback", exc_info=True)
        raw, mime = _fallback_svg_meme_bytes(
            top_text=brief.get("top_text", ""),
            bottom_text=brief.get("bottom_text", ""),
        )
    return {
        "brief": brief,
        "source": "gemini",
        "image_base64": base64.b64encode(raw).decode("ascii"),
        "mime": mime,
    }
