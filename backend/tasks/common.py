from __future__ import annotations

import hashlib
import logging
from difflib import SequenceMatcher
from typing import Any

from config import Settings, get_settings
from db import supabase_client

logger = logging.getLogger(__name__)

TASK_KEYS = ("meme", "audio", "wordle", "puzzle", "youtube")


def default_tasks_status() -> dict[str, str]:
    return {k: "pending" for k in TASK_KEYS}


def merge_tasks_status(current: Any, updates: dict[str, str]) -> dict[str, str]:
    """Merge task keys; preserve extra string fields on `tasks_status` (e.g. audio_provider)."""
    base: dict[str, str] = {}
    if isinstance(current, dict):
        for k, v in current.items():
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


def _norm_ws(text: str) -> str:
    return " ".join(text.lower().split())


def _summary_fingerprint(title: str, summary: str) -> str:
    blob = f"{_norm_ws(title)}\n{_norm_ws(summary)}".encode()
    return hashlib.sha256(blob).hexdigest()


def _summary_similarity(a: str, b: str) -> float:
    na, nb = _norm_ws(a), _norm_ws(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _is_subset_redundant(summary: str, accepted_summaries: list[str]) -> bool:
    """Drop TOC-style repeats where one blurb is almost entirely inside a longer one we already kept."""
    sn = summary.strip().lower()
    if len(sn) < 72:
        return False
    for prev in accepted_summaries:
        pn = prev.strip().lower()
        if len(pn) < 72:
            continue
        if sn in pn and len(sn) <= len(pn) * 0.92:
            return True
        if pn in sn and len(pn) <= len(sn) * 0.92:
            return True
    return False


# Near-duplicate lecture outline / repeated slide intros (e.g. same TOC text on many slides).
_AUDIO_SUMMARY_SIMILARITY_DEDUP = 0.86
_AUDIO_MAX_PARAGRAPHS = 12
_AUDIO_MAX_CONCEPTS_SCAN = 48


def audio_summary_script(concepts: list[dict[str, Any]], max_chars: int = 9000) -> tuple[str, str]:
    """Return (script for TTS, transcript text).

    Deduplicates concepts so repeated table-of-contents / outline slides are not read aloud
    many times. Concepts are already sorted by ``exam_importance`` (see ``fetch_concepts_for_upload``).

    ``max_chars`` caps the *assembled* script before the audio task applies its own TTS cap
    (see ``run_audio_task``: typically 4800 chars sent to ElevenLabs / Gemini TTS).
    """
    lines: list[str] = []
    accepted_summaries: list[str] = []
    seen_fp: set[str] = set()

    for c in concepts[:_AUDIO_MAX_CONCEPTS_SCAN]:
        if len(lines) >= _AUDIO_MAX_PARAGRAPHS:
            break
        t = str(c.get("title", "")).strip()
        s = str(c.get("summary", "")).strip()
        if not t or not s:
            continue

        fp = _summary_fingerprint(t, s)
        if fp in seen_fp:
            continue

        if _is_subset_redundant(s, accepted_summaries):
            continue

        if any(
            _summary_similarity(s, prev) >= _AUDIO_SUMMARY_SIMILARITY_DEDUP for prev in accepted_summaries
        ):
            continue

        # Same title repeated with a near-identical pitch (outline slide series).
        same_title = _norm_ws(t)
        dup_title_pitch = False
        for line in lines:
            if ". " not in line:
                continue
            prev_title, prev_sum = line.split(". ", 1)
            if _norm_ws(prev_title) != same_title:
                continue
            if _summary_similarity(s, prev_sum) >= 0.78:
                dup_title_pitch = True
                break
        if dup_title_pitch:
            continue

        seen_fp.add(fp)
        accepted_summaries.append(s)
        lines.append(f"{t}. {s}")

    transcript = "\n\n".join(lines).strip()
    if not transcript:
        transcript = "No concept summaries available for this upload."
    script = transcript[:max_chars]
    return script, transcript[:12000]
