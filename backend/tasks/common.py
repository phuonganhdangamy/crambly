from __future__ import annotations

import logging
from typing import Any

from config import Settings, get_settings
from db import supabase_client

logger = logging.getLogger(__name__)

TASK_KEYS = ("meme", "audio", "wordle", "puzzle", "youtube")


def default_tasks_status() -> dict[str, str]:
    return {k: "pending" for k in TASK_KEYS}


def merge_tasks_status(current: Any, updates: dict[str, str]) -> dict[str, str]:
    base: dict[str, str] = {}
    if isinstance(current, dict):
        for k in TASK_KEYS:
            v = current.get(k)
            if isinstance(v, str):
                base[k] = v
    for k in TASK_KEYS:
        if k not in base:
            base[k] = "pending"
    base.update(updates)
    return base


def patch_study_deck(
    upload_id: str,
    *,
    fields: dict[str, Any] | None = None,
    task_updates: dict[str, str] | None = None,
) -> None:
    sb = supabase_client()
    patch: dict[str, Any] = dict(fields or {})
    if task_updates:
        row = (
            sb.table("study_deck")
            .select("tasks_status")
            .eq("upload_id", upload_id)
            .limit(1)
            .execute()
        )
        cur = row.data[0].get("tasks_status") if row.data else {}
        patch["tasks_status"] = merge_tasks_status(cur, task_updates)
    if patch:
        sb.table("study_deck").update(patch).eq("upload_id", upload_id).execute()


def storage_signed_url(settings: Settings, path: str, expires_s: int = 604800) -> str:
    sb = supabase_client()
    bucket = settings.supabase_upload_bucket
    res = sb.storage.from_(bucket).create_signed_url(path, expires_s)
    if isinstance(res, dict):
        url = res.get("signedURL") or res.get("signedUrl")
        if url:
            return str(url)
    raise RuntimeError("Could not create signed URL for storage object")


def upload_bytes_to_storage(
    settings: Settings,
    path: str,
    data: bytes,
    content_type: str,
) -> str:
    sb = supabase_client()
    bucket = settings.supabase_upload_bucket
    sb.storage.from_(bucket).upload(
        path,
        data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return storage_signed_url(settings, path)


def fetch_concepts_for_upload(upload_id: str) -> list[dict[str, Any]]:
    sb = supabase_client()
    res = (
        sb.table("concepts")
        .select("id,title,summary,exam_importance")
        .eq("upload_id", upload_id)
        .execute()
    )
    rows = list(res.data or [])
    rows.sort(key=lambda r: int(r.get("exam_importance") or 0), reverse=True)
    return rows


def top_concept_for_meme(concepts: list[dict[str, Any]]) -> tuple[str, str]:
    if not concepts:
        return "Study recap", "Key ideas from your upload."
    c0 = concepts[0]
    return str(c0.get("title", "Concept")), str(c0.get("summary", ""))


def audio_summary_script(concepts: list[dict[str, Any]], max_chars: int = 9000) -> tuple[str, str]:
    """Return (script for TTS, transcript text)."""
    lines: list[str] = []
    for c in concepts[:12]:
        t = str(c.get("title", "")).strip()
        s = str(c.get("summary", "")).strip()
        if t and s:
            lines.append(f"{t}. {s}")
    transcript = "\n\n".join(lines).strip()
    if not transcript:
        transcript = "No concept summaries available for this upload."
    script = transcript[:max_chars]
    return script, transcript[:12000]
