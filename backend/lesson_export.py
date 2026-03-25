"""
Email a lesson pack: personalized summary (from study_cache when available), sections text,
concept list, deck audio transcript, and audio file attachment when present.
"""

from __future__ import annotations

import html
import logging
import re
from typing import Any

import httpx
import resend

from agents.transformation_agent import transform_study_cache_key
from config import get_settings
from db import supabase_client
from email_text_sanitize import email_html_from_study_text, email_html_paragraphs
from tasks.common import fetch_concepts_for_upload

logger = logging.getLogger(__name__)


def _slug_filename(name: str, ext: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-")[:80] or "lesson"
    return f"{base}-audio.{ext}"


def _pick_audio_extension(url: str | None) -> str:
    if not url:
        return "mp3"
    u = url.lower()
    if ".wav" in u.split("?", 1)[0]:
        return "wav"
    return "mp3"


def _fetch_audio_bytes(url: str) -> bytes | None:
    try:
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            return r.content
    except Exception:  # noqa: BLE001
        logger.exception("Failed to download audio for lesson email attachment")
        return None


# Resend attachment limits vary by plan; keep conservative to avoid send failures.
_MAX_AUDIO_ATTACHMENT_BYTES = 18 * 1024 * 1024


def _build_attachments(audio_url: str | None, upload_name: str) -> list[dict[str, Any]]:
    if not audio_url:
        return []
    ext = _pick_audio_extension(audio_url)
    fn = _slug_filename(upload_name, ext)
    raw = _fetch_audio_bytes(audio_url)
    if not raw:
        return []
    if len(raw) > _MAX_AUDIO_ATTACHMENT_BYTES:
        logger.warning("Deck audio too large to attach (%s bytes); email will link only", len(raw))
        return []
    # Resend accepts content as list of byte ints
    return [{"filename": fn, "content": list(raw)}]


def _section_to_html(sec: dict[str, Any]) -> str:
    h = html.escape(str(sec.get("header", "") or ""))
    b = html.escape(str(sec.get("body", "") or ""))
    return f"<h3 style=\"margin:20px 0 8px;font-size:15px;color:#00d9ff;\">{h}</h3><p style=\"margin:0 0 12px;line-height:1.6;\">{b}</p>"


def build_lesson_email_html(
    *,
    upload_name: str,
    cache_payload: dict[str, Any] | None,
    concepts: list[dict[str, Any]],
    audio_transcript: str | None,
    has_audio_attachment: bool,
    audio_url: str | None,
    base_url: str,
) -> str:
    summary = ""
    cmap = ""
    terms: list[str] = []
    sections_html = ""
    if cache_payload and isinstance(cache_payload, dict):
        summary = str(cache_payload.get("summary") or "").strip()
        cmap = str(cache_payload.get("concept_map") or "").strip()
        kt = cache_payload.get("key_terms")
        if isinstance(kt, list):
            terms = [str(x) for x in kt if x]
        secs = cache_payload.get("sections")
        if isinstance(secs, list):
            parts = []
            for s in secs:
                if isinstance(s, dict):
                    parts.append(_section_to_html(s))
            sections_html = "\n".join(parts)

    if not summary:
        summary = "Your personalized summary for this mode wasn’t found in cache. Open Crambly and let personalization finish, then export again—or use the concept list below."

    study_link = f"{base_url.rstrip('/')}/study/"
    concepts_lines = "".join(
        "<li>"
        f"<strong>{email_html_from_study_text(str(c.get('title', '')), max_len=200)}</strong> — "
        f"{email_html_from_study_text(str(c.get('summary', '')), max_len=400)}"
        "</li>"
        for c in concepts[:20]
    )
    transcript = (audio_transcript or "").strip()
    transcript_inner = (
        email_html_from_study_text(transcript, max_len=24000).replace("\n", "<br/>")
        if transcript
        else ""
    )
    transcript_block = (
        "<h2 style=\"font-size:15px;margin:24px 0 8px;\">Audio transcript</h2>"
        "<div style=\"font-size:13px;line-height:1.55;background:#161b22;padding:16px;border-radius:8px;border:1px solid #30363d;\">"
        f"{transcript_inner}</div>"
        if transcript
        else "<p style=\"color:#8b949e;\">No deck audio transcript yet. Generate the study deck audio from the study page.</p>"
    )

    audio_note = ""
    if has_audio_attachment:
        audio_note = "<p style=\"color:#7ee787;\">The deck audio summary is attached to this email.</p>"
    elif audio_url:
        audio_note = (
            f"<p style=\"color:#8b949e;\">Audio link (may expire): "
            f"<a href=\"{html.escape(audio_url, quote=True)}\" style=\"color:#00d9ff;\">download / play</a></p>"
        )
    else:
        audio_note = "<p style=\"color:#8b949e;\">No deck audio URL yet.</p>"

    terms_html = (
        "<ul style=\"margin:8px 0;padding-left:20px;\">"
        + "".join(f"<li>{email_html_from_study_text(t, max_len=500)}</li>" for t in terms[:40])
        + "</ul>"
        if terms
        else "<p style=\"color:#8b949e;\">—</p>"
    )

    cmap_block = (
        "<h2 style=\"font-size:15px;margin:24px 0 8px;\">Concept map (text)</h2>"
        + email_html_paragraphs(cmap[:8000], style="font-size:13px;line-height:1.55;")
        if cmap
        else ""
    )

    return f"""
<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;background:#0d1117;color:#e6edf3;padding:24px;border-radius:12px;">
  <p style="color:#00d9ff;font-weight:700;font-size:18px;">Crambly</p>
  <h1 style="font-size:20px;margin:8px 0 16px;">Lesson export · {html.escape(upload_name)}</h1>
  <p style="color:#8b949e;font-size:13px;">Saved from your study hub. <a href="{html.escape(study_link)}" style="color:#00d9ff;">Open Crambly</a></p>

  <h2 style="font-size:15px;margin:24px 0 8px;">Summary</h2>
  <div style="font-size:14px;line-height:1.65;">{email_html_from_study_text(summary[:12000]).replace(chr(10), "<br/>")}</div>

  <h2 style="font-size:15px;margin:24px 0 8px;">Key terms</h2>
  {terms_html}

  {cmap_block}

  <h2 style="font-size:15px;margin:24px 0 8px;">Sections</h2>
  {sections_html or '<p style="color:#8b949e;">No cached sections for this mode/dial.</p>'}

  <h2 style="font-size:15px;margin:24px 0 8px;">Concepts (source)</h2>
  <ul style="font-size:13px;line-height:1.5;padding-left:18px;">{concepts_lines or "<li>—</li>"}</ul>

  <h2 style="font-size:15px;margin:24px 0 8px;">Audio</h2>
  {audio_note}
  {transcript_block}
</div>
"""


def resolve_lesson_recipient_email(user_id: str, override: str | None) -> str:
    if override and override.strip():
        return override.strip()
    sb = supabase_client()
    try:
        res = (
            sb.table("notification_preferences")
            .select("email")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if res.data and (res.data[0].get("email") or "").strip():
            return str(res.data[0]["email"]).strip()
    except Exception:  # noqa: BLE001
        pass
    return (get_settings().crambly_demo_user_email or "").strip() or "demo@crambly.app"


def send_lesson_export_email(
    *,
    user_id: str,
    upload_id: str,
    to_email: str | None,
    learner_mode: str,
    complexity_dial: float | None,
) -> dict[str, Any]:
    s = get_settings()
    key = (s.resend_api_key or "").strip()
    if not key:
        raise RuntimeError("RESEND_API_KEY is not set")

    sb = supabase_client()
    up = (
        sb.table("uploads")
        .select("id,file_name,study_cache")
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not up.data:
        raise ValueError("upload not found")

    upload_name = str(up.data[0].get("file_name") or "lecture")
    study_cache = up.data[0].get("study_cache")
    cache_key = transform_study_cache_key(learner_mode, complexity_dial)
    cache_payload: dict[str, Any] | None = None
    if isinstance(study_cache, dict):
        entry = study_cache.get(cache_key)
        if isinstance(entry, dict):
            cache_payload = entry

    deck = (
        sb.table("study_deck")
        .select("audio_url,audio_transcript")
        .eq("upload_id", upload_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    audio_url: str | None = None
    audio_transcript: str | None = None
    if deck.data:
        audio_url = deck.data[0].get("audio_url")
        audio_transcript = deck.data[0].get("audio_transcript")
        if audio_url is not None:
            audio_url = str(audio_url).strip() or None
        if audio_transcript is not None:
            audio_transcript = str(audio_transcript).strip() or None

    concepts = fetch_concepts_for_upload(upload_id)
    recipient = resolve_lesson_recipient_email(user_id, to_email)

    attachments = _build_attachments(audio_url, upload_name)
    has_att = bool(attachments)

    body_html = build_lesson_email_html(
        upload_name=upload_name,
        cache_payload=cache_payload,
        concepts=concepts,
        audio_transcript=audio_transcript,
        has_audio_attachment=has_att,
        audio_url=audio_url if not has_att else audio_url,
        base_url=s.crambly_public_web_url,
    )

    subject = f"Crambly lesson · {upload_name}"[:200]
    resend.api_key = key
    params: dict[str, Any] = {
        "from": s.resend_from_email,
        "to": recipient,
        "subject": subject,
        "html": body_html,
    }
    if attachments:
        params["attachments"] = attachments

    audio_attached_sent = False
    try:
        resend.Emails.send(params)
        audio_attached_sent = bool(attachments)
    except Exception as e:  # noqa: BLE001
        if attachments:
            logger.warning("Lesson email with attachment failed (%s); retrying without attachment", e)
            params.pop("attachments", None)
            resend.Emails.send(params)
            audio_attached_sent = False
        else:
            raise
    logger.info(
        "Lesson export emailed to %s for upload %s (audio_attached=%s)",
        recipient,
        upload_id,
        audio_attached_sent,
    )
    return {
        "ok": True,
        "to": recipient,
        "audio_attached": audio_attached_sent,
        "used_transform_cache": cache_payload is not None,
    }
