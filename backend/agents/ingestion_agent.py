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
from gemini_client import (
    embed_texts_optional,
    extract_json_blob,
    generate_multimodal,
    generate_text,
)
from redis_util import enqueue_ingestion

logger = logging.getLogger(__name__)

INGESTION_PROMPT = """You are an academic content parser. Extract all key concepts from the following
content. For each concept return: title, 2-sentence summary, exam_importance
score from 1 (low) to 5 (critical), and has_math (boolean) if the concept involves equations,
symbols, or quantitative STEM notation.
Return as JSON array with objects:
{"title": string, "summary": string, "exam_importance": number, "has_math": boolean}.
Do not include markdown. Only the JSON array."""

GRAPH_PROMPT = """You map relationships between course concepts for an interactive graph (max 10 nodes).

Return JSON ONLY:
{{"nodes": [{{"id": "<UUID>", "label": "short label"}}], "edges": [{{"source": "<UUID>", "target": "<UUID>", "relationship": "short verb phrase"}}]}}

Rules:
- Every node "id" MUST be copied exactly from the UUIDs listed below (no invented ids).
- At most 10 nodes and 20 edges.
- Prefer pedagogically important links (prerequisite, enables, contrasts, derives from).

CONCEPTS (id | title | summary snippet):
{concept_lines}

JSON only, no markdown."""


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
            hm = item.get("has_math")
            has_math = bool(hm) if hm is not None else False
            out.append(
                {
                    "title": title,
                    "summary": summary,
                    "exam_importance": imp,
                    "has_math": has_math,
                }
            )
    return out


def _fallback_concept_graph(inserted_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Deterministic graph when LLM output is missing or invalid (always uses real concept UUIDs)."""
    rows = inserted_rows[:10]
    nodes = [
        {
            "id": str(r["id"]),
            "label": str(r.get("title", "Concept"))[:120] or str(r["id"])[:8],
        }
        for r in rows
    ]
    edges: list[dict[str, str]] = []
    for i in range(len(nodes) - 1):
        edges.append(
            {
                "source": nodes[i]["id"],
                "target": nodes[i + 1]["id"],
                "relationship": "related topic",
            }
        )
    return {"nodes": nodes, "edges": edges}


def _build_concept_graph(inserted_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Gemini builds a small relationship graph; node ids must be real concept UUIDs."""
    if not inserted_rows:
        return None
    if len(inserted_rows) == 1:
        r0 = inserted_rows[0]
        return {
            "nodes": [{"id": str(r0["id"]), "label": str(r0.get("title", "Concept"))[:80]}],
            "edges": [],
        }
    lines = "\n".join(
        f"- {row['id']} | {row.get('title', '')} | {str(row.get('summary', ''))[:200]}"
        for row in inserted_rows[:12]
    )
    prompt = GRAPH_PROMPT.format(concept_lines=lines)
    try:
        raw = generate_text(
            prompt + "\n\nRespond with valid JSON only. No markdown fences.",
            temperature=0.2,
            # This graph is optional; cap attempts so /api/upload doesn't hang
            # when Gemini is slow or rate-limited.
            max_attempts=2,
            # 512 was too small — truncated JSON caused parse failures and empty graphs.
            max_output_tokens=2048,
        )
        data = extract_json_blob(raw)
        if not isinstance(data, dict):
            logger.warning("Concept graph model returned non-object JSON; using fallback graph")
            return _fallback_concept_graph(inserted_rows)
        allowed = {str(r["id"]) for r in inserted_rows}
        raw_nodes = data.get("nodes") or []
        nodes: list[dict[str, str]] = []
        for n in raw_nodes:
            if not isinstance(n, dict):
                continue
            nid = str(n.get("id", "")).strip()
            if nid in allowed:
                nodes.append(
                    {
                        "id": nid,
                        "label": str(n.get("label", ""))[:120] or nid[:8],
                    }
                )
        nodes = nodes[:10]
        node_ids = {n["id"] for n in nodes}
        raw_edges = data.get("edges") or []
        edges: list[dict[str, str]] = []
        for e in raw_edges:
            if not isinstance(e, dict):
                continue
            s, t = str(e.get("source", "")), str(e.get("target", ""))
            if s in node_ids and t in node_ids and s != t:
                edges.append(
                    {
                        "source": s,
                        "target": t,
                        "relationship": str(e.get("relationship", "relates to"))[:80],
                    }
                )
        edges = edges[:20]
        if not nodes:
            logger.warning("Concept graph had no valid nodes (wrong UUIDs?); using fallback graph")
            return _fallback_concept_graph(inserted_rows)
        return {"nodes": nodes, "edges": edges}
    except Exception:  # noqa: BLE001
        logger.warning("Concept graph generation failed; using fallback graph", exc_info=True)
        return _fallback_concept_graph(inserted_rows)


def run_ingestion(
    *,
    user_id: str,
    file_name: str,
    file_bytes: bytes,
    file_type: str,
    content_type: str | None = None,
    course_id: str | None = None,
) -> dict[str, Any]:
    """
    Persist file to Supabase Storage, parse with Gemini, write `concepts` rows.
    Returns `{ "upload_id": str, "concepts_count": int }`.
    """
    ensure_demo_user()
    sb = supabase_client()
    s = get_settings()
    if course_id:
        cr = (
            sb.table("courses")
            .select("id")
            .eq("id", course_id.strip())
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not cr.data:
            raise ValueError("course_id not found or does not belong to this user")
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

    upload_row: dict[str, Any] = {
        "user_id": user_id,
        "file_name": file_name,
        "file_url": storage_path,
        "file_type": file_type,
        "status": "processing",
    }
    if course_id:
        upload_row["course_id"] = course_id.strip()
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
    embeddings = embed_texts_optional(embed_inputs)

    inserted_rows: list[dict[str, Any]] = []
    for i, c in enumerate(concepts):
        emb = embeddings[i] if embeddings is not None else None
        base = {
            "upload_id": upload_id,
            "title": c["title"],
            "summary": c["summary"],
            "exam_importance": c["exam_importance"],
            "has_math": bool(c.get("has_math", False)),
        }
        row_out: dict[str, Any] = dict(base)
        try:
            if emb is None:
                ins = sb.table("concepts").insert(base).execute()
            else:
                try:
                    ins = sb.table("concepts").insert({**base, "embedding": emb}).execute()
                except Exception:  # noqa: BLE001
                    try:
                        ins = sb.table("concepts").insert(
                            {**base, "embedding": vector_to_pg(emb)}
                        ).execute()
                    except Exception:  # noqa: BLE001
                        ins = sb.table("concepts").insert(base).execute()
            if ins.data:
                row_out["id"] = ins.data[0]["id"]
                inserted_rows.append(row_out)
        except Exception:  # noqa: BLE001
            logger.exception("Concept insert failed")
            raise

    graph = _build_concept_graph(inserted_rows)
    if graph:
        try:
            sb.table("concepts").update({"graph_data": graph}).eq("upload_id", upload_id).execute()
        except Exception:  # noqa: BLE001
            logger.warning("Could not persist graph_data on concepts", exc_info=True)

    sb.table("uploads").update({"status": "ready"}).eq("id", upload_id).execute()

    return {"upload_id": upload_id, "concepts_count": len(concepts)}
