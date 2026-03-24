"""
ingestion_agent
-----------------
Accepts uploaded academic files, sends bytes to Gemini multimodal, extracts
structured concepts, embeds text for pgvector, and updates `uploads.status`.
"""

from __future__ import annotations

import logging
import mimetypes
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import uuid4

import google.generativeai as genai
from google.api_core import exceptions as google_api_exceptions

from config import get_settings
from db import ensure_demo_user, supabase_client, vector_to_pg
from gemini_client import (
    configure_gemini,
    embed_texts_optional,
    extract_json_blob,
    generate_text,
)
from redis_util import enqueue_ingestion
from utils.content_blocks_to_markdown import blocks_to_markdown
from utils.gemini_vision_extract import extract_slide_from_png
from utils.pdf_to_images import pdf_to_page_images

logger = logging.getLogger(__name__)

INGESTION_PROMPT = """You are an academic content parser. Extract all sections from the following content.
For each section return:
{
  "title": string,
  "raw_content": string,
  "summary": string,
  "exam_importance": number,
  "has_math": boolean,
  "has_code": boolean,
  "key_terms": string[]
}

Rules:
- raw_content: verbatim paragraph text from the source — do not paraphrase.
- summary: exactly two sentences summarizing the section.
- exam_importance: integer 1 (low) to 5 (critical).
- has_math: true if the section contains formulas or mathematical notation.
- has_code: true if the section contains code snippets.
- key_terms: important technical terms in this section.

Return as a JSON array only. Do not add commentary outside the JSON.
For raw_content: if the source contains LaTeX math expressions, wrap them in $...$ for inline and $$...$$ for block expressions.
CRITICAL for valid JSON: inside every string value, any literal backslash must be written as \\\\ (e.g. LaTeX \\theta must appear as \\\\theta in the JSON text)."""

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
            hc = item.get("has_code")
            has_code = bool(hc) if hc is not None else False
            raw_content = str(item.get("raw_content", "")).strip()
            if not raw_content:
                raw_content = summary
            out.append(
                {
                    "title": title,
                    "summary": summary,
                    "raw_content": raw_content,
                    "exam_importance": imp,
                    "has_math": has_math,
                    "has_code": has_code,
                }
            )
    return out


def _slide_payload_to_markdown(payload: dict[str, Any]) -> str:
    """Vision JSON → markdown body (headings, bullets, tables, equations)."""
    blocks = list(payload.get("content_blocks") or [])
    title = payload.get("slide_title")
    t_str = str(title).strip() if title else ""

    body = blocks_to_markdown(blocks)
    parts: list[str] = []
    if t_str:
        first = blocks[0] if blocks else None
        first_text = ""
        ft = ""
        if isinstance(first, dict):
            first_text = str(first.get("text") or "").strip()
            ft = str(first.get("type") or "").lower()
        dup = first_text == t_str and ft in ("heading", "subheading")
        if not dup:
            parts.append(f"### {t_str}")
    if body:
        parts.append(body)
    return "\n\n".join(parts).strip()


def _enrich_slide_metadata(
    *,
    title_hint: str,
    raw_content: str,
    has_math_guess: bool,
    has_code_guess: bool,
) -> dict[str, Any]:
    """Text-only Gemini: title, summary, flags — raw_content stays vision markdown."""
    snip = (raw_content or "")[:2800]
    if not snip.strip():
        snip = title_hint
    prompt = (
        "You annotate a lecture slide for a study app.\n"
        "Given the slide content (markdown below), return JSON ONLY:\n"
        '{ "title": string (short display title, <= 100 chars),\n'
        '  "summary": string (exactly two sentences),\n'
        '  "exam_importance": number (integer 1-5),\n'
        '  "has_math": boolean,\n'
        '  "has_code": boolean\n'
        "}\n\n"
        f"Slide hint: {title_hint}\n"
        f"Extraction hints (trust markdown if they disagree): has_math_guess={has_math_guess}, "
        f"has_code_guess={has_code_guess}\n\n"
        "Content:\n---\n"
        f"{snip}\n"
        "---\n\n"
        "Rules: title names the topic (not generic “Slide”). Summary is what a student should recall.\n"
        "Respond with valid JSON only. No markdown fences."
    )
    try:
        raw = generate_text(
            prompt,
            temperature=0.2,
            max_output_tokens=1024,
            max_attempts=2,
        )
        meta = extract_json_blob(raw)
        if not isinstance(meta, dict):
            raise ValueError("metadata not an object")
    except Exception:  # noqa: BLE001
        logger.warning("Slide metadata enrichment failed; using fallbacks", exc_info=True)
        return {
            "title": title_hint[:200],
            "summary": f"This section covers {title_hint}."[:500],
            "exam_importance": 3,
            "has_math": has_math_guess,
            "has_code": has_code_guess,
        }

    title = str(meta.get("title", "")).strip() or title_hint
    summary = str(meta.get("summary", "")).strip()
    if not summary:
        summary = f"Key ideas from {title}."
    imp = int(meta.get("exam_importance", 3))
    imp = max(1, min(5, imp))
    hm = meta.get("has_math")
    has_math = bool(hm) if hm is not None else has_math_guess
    hc = meta.get("has_code")
    has_code = bool(hc) if hc is not None else has_code_guess
    return {
        "title": title[:200],
        "summary": summary,
        "exam_importance": imp,
        "has_math": has_math,
        "has_code": has_code,
    }


def _concepts_from_pdf_pages(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One concept per PDF page: Gemini Vision → raw_content (for pipelines) + metadata."""
    if not pages:
        raise RuntimeError("PDF has no pages")

    def extract_one(png: bytes) -> dict[str, Any]:
        return extract_slide_from_png(png)

    payloads: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(extract_one, p["png_bytes"]) for p in pages]
        for fut in futures:
            payloads.append(fut.result())

    concepts: list[dict[str, Any]] = []
    for i, payload in enumerate(payloads, start=1):
        md = _slide_payload_to_markdown(payload)
        if not md.strip():
            md = str(payload.get("raw_text") or "").strip()
        if not md.strip():
            md = f"_(No text extracted for slide {i})_"
        title_hint = str(payload.get("slide_title") or "").strip() or f"Slide {i}"
        meta = _enrich_slide_metadata(
            title_hint=title_hint,
            raw_content=md,
            has_math_guess=bool(payload.get("has_math")),
            has_code_guess=bool(payload.get("has_code")),
        )
        concepts.append(
            {
                "title": meta["title"],
                "summary": meta["summary"],
                "raw_content": md,
                "exam_importance": meta["exam_importance"],
                "has_math": meta["has_math"],
                "has_code": meta["has_code"],
            }
        )
    return concepts


def _store_pdf_page_images(sb: Any, bucket: str, upload_id: str, pages: list[dict[str, Any]]) -> None:
    """Upload each page PNG to storage and insert upload_pages rows (concept_id set later)."""
    for p in pages:
        page_num = int(p["page_number"])
        path = f"page_images/{upload_id}/page_{page_num}.png"
        try:
            sb.storage.from_(bucket).upload(
                path,
                p["png_bytes"],
                file_options={"content-type": "image/png", "upsert": "true"},
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Page %s PNG upload failed: %s", page_num, e)
            continue
        try:
            sb.table("upload_pages").insert(
                {
                    "upload_id": upload_id,
                    "page_number": page_num,
                    "storage_path": path,
                    "width": int(p["width"]),
                    "height": int(p["height"]),
                }
            ).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning("upload_pages insert failed (run migration 20250331000000_upload_pages.sql?): %s", e)


def _ingest_multimodal(prompt: str, *, mime_type: str, data: bytes, temperature: float = 0.25) -> str:
    """Multimodal PDF/image parse; model id from `GEMINI_INGESTION_MODEL` (see config.Settings)."""
    configure_gemini()
    model = genai.GenerativeModel(get_settings().gemini_ingestion_model)
    part = {"mime_type": mime_type, "data": data}
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            resp = model.generate_content(
                [prompt, part],
                generation_config=genai.types.GenerationConfig(temperature=temperature),
            )
            return (resp.text or "").strip()
        except google_api_exceptions.ResourceExhausted as e:
            last_err = e
            if attempt < 3:
                time.sleep(min(30.0, 2.0 * (attempt + 1)))
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < 3:
                time.sleep(0.8 * (2**attempt))
    raise RuntimeError("Ingestion multimodal failed after retries") from last_err


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

    pdf_pages: list[dict[str, Any]] | None = None
    try:
        if file_type == "pdf":
            pdf_pages = pdf_to_page_images(file_bytes)
            _store_pdf_page_images(sb, bucket, upload_id, pdf_pages)
            concepts = _concepts_from_pdf_pages(pdf_pages)
        else:
            raw_text = _ingest_multimodal(
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
            "has_code": bool(c.get("has_code", False)),
            "raw_content": c.get("raw_content"),
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

    if file_type == "pdf" and pdf_pages:
        for idx, row_out in enumerate(inserted_rows):
            cid = str(row_out.get("id", ""))
            if not cid:
                continue
            try:
                sb.table("upload_pages").update({"concept_id": cid}).eq("upload_id", upload_id).eq(
                    "page_number", idx + 1
                ).execute()
            except Exception:  # noqa: BLE001
                logger.warning("upload_pages concept_id link failed for page %s", idx + 1, exc_info=True)

    graph = _build_concept_graph(inserted_rows)
    if graph:
        try:
            sb.table("concepts").update({"graph_data": graph}).eq("upload_id", upload_id).execute()
        except Exception:  # noqa: BLE001
            logger.warning("Could not persist graph_data on concepts", exc_info=True)

    sb.table("uploads").update({"status": "ready"}).eq("id", upload_id).execute()

    return {"upload_id": upload_id, "concepts_count": len(concepts)}
