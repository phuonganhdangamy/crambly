"""
ingestion_agent
-----------------
Accepts uploaded academic files, sends bytes to Gemini multimodal, extracts
structured concepts, embeds text for pgvector, and updates `uploads.status`.
"""

from __future__ import annotations

import logging
import mimetypes
from typing import Any
from uuid import uuid4

from config import get_settings
from db import ensure_demo_user, supabase_client, vector_to_pg
from gemini_client import embed_texts, extract_json_blob, generate_multimodal
from redis_util import enqueue_ingestion

logger = logging.getLogger(__name__)

INGESTION_PROMPT = """You are an academic content parser. Extract all key concepts from the following
content. For each concept return: title, 2-sentence summary, and exam_importance
score from 1 (low) to 5 (critical). Return as JSON array with objects:
{"title": string, "summary": string, "exam_importance": number}.
Do not include markdown. Only the JSON array."""


def _guess_mime(file_name: str, declared: str | None) -> str:
    if declared:
        return declared
    mt, _ = mimetypes.guess_type(file_name)
    return mt or "application/octet-stream"


def _normalize_concepts(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict) and "concepts" in raw:
        raw = raw["concepts"]
    if not isinstance(raw, list):
        raise ValueError("Model did not return a JSON array of concepts")
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        summary = str(item.get("summary", "")).strip()
        imp = int(item.get("exam_importance", 3))
        imp = max(1, min(5, imp))
        if title and summary:
            out.append({"title": title, "summary": summary, "exam_importance": imp})
    return out


def run_ingestion(
    *,
    user_id: str,
    file_name: str,
    file_bytes: bytes,
    file_type: str,
    content_type: str | None = None,
) -> dict[str, Any]:
    """
    Persist file to Supabase Storage, parse with Gemini, write `concepts` rows.
    Returns `{ "upload_id": str, "concepts_count": int }`.
    """
    ensure_demo_user()
    sb = supabase_client()
    s = get_settings()
    bucket = s.supabase_upload_bucket
    storage_path = f"{user_id}/{uuid4().hex}_{file_name}"

    # Storage upload
    try:
        sb.storage.from_(bucket).upload(
            storage_path,
            file_bytes,
            file_options={"content-type": _guess_mime(file_name, content_type)},
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("Storage upload failed")
        msg = str(e)
        if "Bucket not found" in msg or "404" in msg:
            msg += (
                f" — Create a Storage bucket named '{bucket}' in Supabase (Dashboard → Storage → New bucket), "
                "or run supabase/migrations/20250323000000_storage_uploads_bucket.sql in the SQL Editor."
            )
        raise RuntimeError(f"Storage upload failed: {msg}") from e

    upload_row = {
        "user_id": user_id,
        "file_name": file_name,
        "file_url": storage_path,
        "file_type": file_type,
        "status": "processing",
    }
    up = sb.table("uploads").insert(upload_row).execute()
    upload_id = str(up.data[0]["id"])

    enqueue_ingestion({"upload_id": upload_id, "user_id": user_id})

    mime = _guess_mime(file_name, content_type)
    if file_type == "pdf":
        mime = "application/pdf"
    elif file_type == "text":
        mime = "text/plain"
    elif file_type == "image" and not mime.startswith("image/"):
        mime = "image/png"
    elif file_type == "audio":
        if not mime.startswith("audio/"):
            mime = "audio/mpeg"

    try:
        raw_text = generate_multimodal(
            INGESTION_PROMPT,
            mime_type=mime,
            data=file_bytes,
        )
        concepts = _normalize_concepts(extract_json_blob(raw_text))
    except Exception as e:  # noqa: BLE001
        logger.exception("Ingestion Gemini failed")
        sb.table("uploads").update({"status": "error"}).eq("id", upload_id).execute()
        raise RuntimeError(f"Ingestion failed: {e}") from e

    if not concepts:
        sb.table("uploads").update({"status": "error"}).eq("id", upload_id).execute()
        raise RuntimeError("No concepts extracted")

    embed_inputs = [f"{c['title']}\n{c['summary']}" for c in concepts]
    embeddings = embed_texts(embed_inputs)

    for c, emb in zip(concepts, embeddings, strict=True):
        base = {
            "upload_id": upload_id,
            "title": c["title"],
            "summary": c["summary"],
            "exam_importance": c["exam_importance"],
        }
        try:
            sb.table("concepts").insert({**base, "embedding": emb}).execute()
        except Exception:  # noqa: BLE001
            try:
                sb.table("concepts").insert({**base, "embedding": vector_to_pg(emb)}).execute()
            except Exception:  # noqa: BLE001
                sb.table("concepts").insert(base).execute()

    sb.table("uploads").update({"status": "ready"}).eq("id", upload_id).execute()

    return {"upload_id": upload_id, "concepts_count": len(concepts)}
