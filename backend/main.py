"""
Crambly FastAPI entrypoint — wires HTTP routes to agent modules.
Run from /backend: `uvicorn main:app --reload`

Agent orchestration is explicit Python calls for the MVP demo. Google ADK can wrap
these same functions later (tool boundaries already align 1:1 with routes).
"""

from __future__ import annotations

import logging
from typing import Any, Iterator, Literal
from datetime import datetime, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents.deadline_agent import (
    recompute_priorities_for_user,
    run_deadline_from_bytes,
    run_deadline_from_text,
)
from agents.delivery_agent import build_pulse
from agents.digital_twin_agent import apply_quiz_result
from agents.ingestion_agent import run_ingestion
from agents.study_dna_agent import run_study_dna
from agents.expressive_media_agent import run_meme_pipeline
from agents.transformation_agent import iter_transform_ndjson, run_transform, transform_study_cache_key
from api.routes import api_router
from config import Settings, get_settings
from db import ensure_demo_user, supabase_client
from tasks.common import storage_signed_url
from scheduler import start_notification_scheduler
from tts_synthesis import synthesize_study_audio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Crambly API", version="0.1.0")

app.include_router(api_router, prefix="/api")


def _cors_middleware_kwargs() -> dict[str, Any]:
    s = get_settings()
    raw = (s.cors_origins or "*").strip()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    origins = parts if parts else ["*"]
    wildcard = len(origins) == 1 and origins[0] == "*"
    allow_credentials = bool(s.cors_allow_credentials) and not wildcard
    if s.cors_allow_credentials and wildcard:
        logger.warning(
            "CORS_ALLOW_CREDENTIALS is true but CORS_ORIGINS is *; using allow_credentials=False (browser rules)."
        )
    return {
        "allow_origins": origins,
        "allow_credentials": allow_credentials,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }


app.add_middleware(CORSMiddleware, **_cors_middleware_kwargs())


class SyllabusTextBody(BaseModel):
    text: str
    course_id: str | None = None


class TransformBody(BaseModel):
    upload_id: str
    mode: str = Field(
        description="adhd | visual | global_scholar | audio | exam_cram",
    )
    complexity_dial: float | None = Field(default=None, ge=0, le=1)


class StudyDnaBody(BaseModel):
    notes: str


class QuizResultBody(BaseModel):
    concept_id: str
    correct: bool


class PreferencesBody(BaseModel):
    preferred_format: str | None = None
    complexity_dial: float | None = Field(default=None, ge=0, le=1)


class TtsBody(BaseModel):
    text: str


class MemeBody(BaseModel):
    concept_title: str
    summary: str
    reimagine: bool = False
    # When reimagine=True: new meme template + captions; optional prior brief is used only to avoid repeating the same Imgflip template.
    brief: dict[str, Any] | None = None


class MemeBriefStored(BaseModel):
    template: str
    top_text: str = ""
    bottom_text: str = ""
    fallback_prompt: str = ""


class MemeRecapStoredBody(BaseModel):
    brief: MemeBriefStored
    source: Literal["imgflip", "gemini"]
    image_url: str | None = None
    image_base64: str | None = None
    mime: str | None = None


@app.on_event("startup")
def _startup() -> None:
    try:
        ensure_demo_user()
    except Exception as e:  # noqa: BLE001
        logger.warning("Demo user bootstrap skipped: %s", e)
    if get_settings().enable_notification_scheduler:
        try:
            start_notification_scheduler()
        except Exception:  # noqa: BLE001
            logger.warning("Notification scheduler not started (missing deps or DB tables?)", exc_info=True)
    else:
        logger.info("Notification scheduler disabled (ENABLE_NOTIFICATION_SCHEDULER=false)")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload")
async def api_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    file_type: str = Form("pdf"),
    course_id: str | None = Form(None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    ft = file_type.lower().strip()
    if ft not in {"pdf", "image", "audio", "text"}:
        raise HTTPException(400, "file_type must be pdf|image|audio|text")
    cid = (course_id or "").strip() or None
    try:
        result = run_ingestion(
            user_id=user_id,
            file_name=file.filename or "upload",
            file_bytes=data,
            file_type=ft,
            content_type=file.content_type,
            course_id=cid,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("upload failed")
        raise HTTPException(500, str(e)) from e
    upload_id = str(result.get("upload_id", ""))
    if upload_id:
        from tasks.orchestrator import prepare_study_deck_row, run_study_deck_workers

        try:
            prepare_study_deck_row(upload_id, user_id, reset=False)
            background_tasks.add_task(run_study_deck_workers, upload_id, user_id)
        except Exception:  # noqa: BLE001
            logger.warning("study_deck kickoff failed (table missing?)", exc_info=True)
    return result


@app.post("/api/syllabus")
async def api_syllabus(
    file: UploadFile | None = File(None),
    course_id: str | None = Form(None),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    user_id = str(settings.crambly_demo_user_id)
    if file is None:
        raise HTTPException(400, "Attach syllabus file")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty syllabus")
    mime = file.content_type or "application/pdf"
    cid = (course_id or "").strip() or None
    try:
        return run_deadline_from_bytes(
            user_id=user_id,
            file_name=file.filename or "syllabus.pdf",
            file_bytes=data,
            content_type=mime,
            course_id=cid,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("syllabus failed")
        raise HTTPException(500, str(e)) from e


@app.post("/api/syllabus-text")
def api_syllabus_text(
    body: SyllabusTextBody,
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    user_id = str(settings.crambly_demo_user_id)
    cid = (body.course_id or "").strip() or None
    try:
        return run_deadline_from_text(user_id=user_id, syllabus_text=body.text, course_id=cid)
    except Exception as e:  # noqa: BLE001
        logger.exception("syllabus text failed")
        raise HTTPException(500, str(e)) from e


@app.get("/api/assessments/{uid}")
def api_assessments(uid: str, settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    if uid != str(settings.crambly_demo_user_id):
        raise HTTPException(403, "Demo only supports configured user id")
    try:
        return recompute_priorities_for_user(uid)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


@app.post("/api/transform")
def api_transform(
    body: TransformBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()

    allowed_modes = {"adhd", "visual", "global_scholar", "audio", "exam_cram"}
    mode_key = body.mode if body.mode in allowed_modes else "adhd"
    cache_key = transform_study_cache_key(mode_key, body.complexity_dial)

    try:
        sb = supabase_client()
        study_cache: dict[str, Any] = {}
        use_cache = True
        try:
            upload_row = (
                sb.table("uploads")
                .select("study_cache")
                .eq("id", body.upload_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if upload_row.data:
                maybe_cache = upload_row.data[0].get("study_cache")
                if isinstance(maybe_cache, dict):
                    study_cache = maybe_cache
        except Exception:
            # Column might not exist yet (migration not applied). Keep app usable.
            use_cache = False
            logger.warning("study_cache unavailable; running transform without cache", exc_info=True)

        if use_cache:
            cached_payload = study_cache.get(cache_key)
            if isinstance(cached_payload, dict):
                graph = cached_payload.get("concept_graph")
                has_graph = (
                    isinstance(graph, dict)
                    and isinstance(graph.get("nodes"), list)
                    and len(graph.get("nodes") or []) > 0
                )
                # Backfill old cache entries that were generated before graph improvements.
                # If cached payload has no graph, regenerate once and refresh cache.
                if not has_graph:
                    logger.info("Cached transform has no graph; regenerating upload=%s", body.upload_id)
                else:
                    # Update learner_mode/dial so the deck "remembers" the last viewed mode,
                    # even when we serve from cache.
                    sb.table("uploads").update(
                        {"learner_mode": mode_key, "complexity_dial": body.complexity_dial},
                    ).eq("id", body.upload_id).eq("user_id", user_id).execute()
                    return cached_payload

        payload = run_transform(
            user_id=user_id,
            upload_id=body.upload_id,
            learner_mode=mode_key,
            complexity_dial=body.complexity_dial,
        )

        if use_cache:
            study_cache[cache_key] = payload
            sb.table("uploads").update({"study_cache": study_cache}).eq("id", body.upload_id).eq("user_id", user_id).execute()
        return payload
    except Exception as e:  # noqa: BLE001
        logger.exception("transform failed")
        raise HTTPException(500, str(e)) from e


def _study_transform_cache_ready(entry: Any) -> bool:
    """Aligned with cached hit path in api_transform (complete + non-empty concept graph)."""
    if not isinstance(entry, dict):
        return False
    if entry.get("partial") is True:
        return False
    graph = entry.get("concept_graph")
    return (
        isinstance(graph, dict)
        and isinstance(graph.get("nodes"), list)
        and len(graph.get("nodes") or []) > 0
    )


@app.get("/api/transform/cache")
def api_transform_cache(
    upload_id: str,
    mode: str,
    complexity_dial: float | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    allowed_modes = {"adhd", "visual", "global_scholar", "audio", "exam_cram"}
    mode_key = mode if mode in allowed_modes else "adhd"
    cache_key = transform_study_cache_key(mode_key, complexity_dial)
    try:
        sb = supabase_client()
        try:
            upload_row = (
                sb.table("uploads")
                .select("study_cache")
                .eq("id", upload_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
        except Exception:
            logger.warning("transform cache probe: study_cache column missing?", exc_info=True)
            return {"cached": False, "payload": None}
        if not upload_row.data:
            raise HTTPException(404, "Upload not found")
        study_cache = upload_row.data[0].get("study_cache")
        if not isinstance(study_cache, dict):
            return {"cached": False, "payload": None}
        entry = study_cache.get(cache_key)
        if isinstance(entry, dict) and _study_transform_cache_ready(entry):
            sb.table("uploads").update(
                {"learner_mode": mode_key, "complexity_dial": complexity_dial},
            ).eq("id", upload_id).eq("user_id", user_id).execute()
            return {"cached": True, "payload": entry}
        return {"cached": False, "payload": None}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("transform cache probe failed")
        raise HTTPException(500, str(e)) from e


@app.post("/api/transform/stream")
def api_transform_stream(
    body: TransformBody,
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    allowed_modes = {"adhd", "visual", "global_scholar", "audio", "exam_cram"}
    mode_key = body.mode if body.mode in allowed_modes else "adhd"
    try:
        sb = supabase_client()
        chk = sb.table("concepts").select("id").eq("upload_id", body.upload_id).limit(1).execute()
        if not chk.data:
            raise HTTPException(404, "No concepts found for upload")

        def gen() -> Iterator[str]:
            yield from iter_transform_ndjson(
                user_id=user_id,
                upload_id=body.upload_id,
                learner_mode=mode_key,
                complexity_dial=body.complexity_dial,
            )

        return StreamingResponse(gen(), media_type="application/x-ndjson")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("transform stream failed")
        raise HTTPException(500, str(e)) from e


@app.get("/api/upload-meta/{upload_id}")
def api_upload_meta(upload_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    if not upload_id.strip():
        raise HTTPException(400, "upload_id required")
    try:
        ensure_demo_user()
        sb = supabase_client()
        res = (
            sb.table("uploads")
            .select("learner_mode,complexity_dial")
            .eq("id", upload_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "upload not found")
        row = res.data[0]
        return {"learner_mode": row.get("learner_mode"), "complexity_dial": row.get("complexity_dial")}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e


@app.post("/api/study-dna")
def api_study_dna(
    body: StudyDnaBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    try:
        return run_study_dna(user_id=user_id, notes_text=body.notes)
    except Exception as e:  # noqa: BLE001
        logger.exception("study dna failed")
        raise HTTPException(500, str(e)) from e


@app.post("/api/quiz/result")
def api_quiz_result(
    body: QuizResultBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    try:
        return apply_quiz_result(user_id=user_id, concept_id=body.concept_id, correct=body.correct)
    except Exception as e:  # noqa: BLE001
        logger.exception("quiz result failed")
        raise HTTPException(500, str(e)) from e


@app.get("/api/pulse/{uid}")
def api_pulse(uid: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    if uid != str(settings.crambly_demo_user_id):
        raise HTTPException(403, "Demo only supports configured user id")
    try:
        return build_pulse(uid)
    except Exception as e:  # noqa: BLE001
        logger.exception("pulse failed")
        raise HTTPException(500, str(e)) from e


@app.get("/api/twin/{uid}")
def api_twin(uid: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    if uid != str(settings.crambly_demo_user_id):
        raise HTTPException(403, "Demo only supports configured user id")
    ensure_demo_user()
    sb = supabase_client()
    res = sb.table("digital_twin").select("*").eq("user_id", uid).limit(1).execute()
    if not res.data:
        sb.table("digital_twin").insert({"user_id": uid}).execute()
        res = sb.table("digital_twin").select("*").eq("user_id", uid).limit(1).execute()
    return {"digital_twin": res.data[0] if res.data else {}}


@app.get("/api/uploads/{uid}")
def api_uploads(uid: str, settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    if uid != str(settings.crambly_demo_user_id):
        raise HTTPException(403, "Demo only supports configured user id")
    ensure_demo_user()
    sb = supabase_client()
    ups = sb.table("uploads").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
    upload_rows: list[dict[str, Any]] = list(ups.data or [])
    upload_ids = [str(u["id"]) for u in upload_rows]

    # Per upload: concept count + whether every row has non-empty raw_content (Focus Mode / verbatim text).
    agg: dict[str, dict[str, int]] = {i: {"total": 0, "with_raw": 0} for i in upload_ids}
    if upload_ids:
        cons = (
            sb.table("concepts")
            .select("upload_id, raw_content")
            .in_("upload_id", upload_ids)
            .execute()
        )
        for c in cons.data or []:
            uid_row = str(c.get("upload_id", ""))
            if uid_row not in agg:
                continue
            agg[uid_row]["total"] += 1
            raw = c.get("raw_content")
            if isinstance(raw, str) and raw.strip():
                agg[uid_row]["with_raw"] += 1

    out: list[dict[str, Any]] = []
    for u in upload_rows:
        uid_u = str(u["id"])
        a = agg.get(uid_u, {"total": 0, "with_raw": 0})
        n = a["total"]
        row = dict(u)
        row["concepts_count"] = n
        row["has_raw_content"] = n > 0 and a["with_raw"] == n
        if u.get("course_id"):
            cr = (
                sb.table("courses")
                .select("code,name,color")
                .eq("id", str(u["course_id"]))
                .limit(1)
                .execute()
            )
            if cr.data:
                row["course_code"] = cr.data[0].get("code")
                row["course_name"] = cr.data[0].get("name")
                row["course_color"] = cr.data[0].get("color")
        out.append(row)
    return out


@app.get("/api/upload/{upload_id}/view-url")
def api_upload_view_url(
    upload_id: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Signed URL for the original file in Storage (Focus Mode / slide-accurate viewing).
    Path is relative (uploads.file_url); never expose service role to the client.
    """
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    if not upload_id.strip():
        raise HTTPException(400, "upload_id required")
    sb = supabase_client()
    res = (
        sb.table("uploads")
        .select("file_url,file_type,file_name")
        .eq("id", upload_id.strip())
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Upload not found")
    row = res.data[0]
    path = row.get("file_url")
    if not path or not str(path).strip():
        raise HTTPException(404, "No file stored for this upload")
    try:
        url = storage_signed_url(settings, str(path).strip(), expires_s=3600)
    except Exception as e:  # noqa: BLE001
        logger.exception("signed url failed")
        raise HTTPException(500, f"Could not sign file URL: {e}") from e
    return {
        "url": url,
        "file_type": str(row.get("file_type") or "pdf"),
        "file_name": str(row.get("file_name") or "file"),
    }


@app.get("/api/upload/{upload_id}/pages")
def api_upload_pages(
    upload_id: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Signed URLs for per-page slide PNGs (PDF ingestion). Paths stay server-side."""
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    uid = upload_id.strip()
    if not uid:
        raise HTTPException(400, "upload_id required")
    sb = supabase_client()
    up = (
        sb.table("uploads")
        .select("id")
        .eq("id", uid)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not up.data:
        raise HTTPException(404, "upload not found")
    pages_res = (
        sb.table("upload_pages")
        .select("page_number, storage_path, width, height, concept_id")
        .eq("upload_id", uid)
        .order("page_number")
        .execute()
    )
    bucket = settings.supabase_upload_bucket
    out: list[dict[str, Any]] = []
    for row in pages_res.data or []:
        path = str(row.get("storage_path") or "").strip()
        if not path:
            continue
        try:
            signed = sb.storage.from_(bucket).create_signed_url(path, 3600)
        except Exception as e:  # noqa: BLE001
            logger.warning("signed url for page image failed: %s", e)
            continue
        url: str | None = None
        if isinstance(signed, dict):
            url = signed.get("signedURL") or signed.get("signedUrl")
            if url is not None:
                url = str(url)
        if not url:
            continue
        cid = row.get("concept_id")
        out.append(
            {
                "page_number": int(row["page_number"]),
                "signed_url": url,
                "width": int(row.get("width") or 0),
                "height": int(row.get("height") or 0),
                "concept_id": str(cid) if cid else None,
            }
        )
    return {"pages": out}


@app.post("/api/preferences")
def api_preferences(
    body: PreferencesBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    patch: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.preferred_format is not None:
        patch["preferred_format"] = body.preferred_format
    if body.complexity_dial is not None:
        patch["complexity_dial"] = body.complexity_dial
    existing = sb.table("digital_twin").select("id").eq("user_id", user_id).execute()
    if not existing.data:
        sb.table("digital_twin").insert({"user_id": user_id}).execute()
    sb.table("digital_twin").update(patch).eq("user_id", user_id).execute()
    return {"ok": True}


@app.post("/api/tts")
def api_tts(body: TtsBody, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    _ = settings
    import base64

    try:
        audio, mime, provider = synthesize_study_audio(body.text, max_chars=2500)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e
    return {
        "audio_base64": base64.b64encode(audio).decode("ascii"),
        "mime": mime,
        "provider": provider,
    }


@app.post("/api/meme")
def api_meme(body: MemeBody, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    try:
        return run_meme_pipeline(
            concept_title=body.concept_title,
            summary=body.summary,
            force_image=body.reimagine,
            prior_brief=body.brief,
            settings=settings,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("meme pipeline failed")
        raise HTTPException(500, str(e)) from e


@app.get("/api/meme/stored/{upload_id}")
def api_meme_stored_get(
    upload_id: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    if not upload_id.strip():
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
    sb = supabase_client()
    res = (
        sb.table("uploads")
        .select("meme_recap")
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "upload not found")
    return {"meme_recap": res.data[0].get("meme_recap")}


@app.put("/api/meme/stored/{upload_id}")
def api_meme_stored_put(
    upload_id: str,
    body: MemeRecapStoredBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    if not upload_id.strip():
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
    sb = supabase_client()
    payload = body.model_dump(exclude_none=True)
    up = (
        sb.table("uploads")
        .update({"meme_recap": payload})
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not up.data:
        raise HTTPException(404, "upload not found")
    return {"ok": True}


@app.get("/api/audio-clips/{uid}")
def api_audio_clips(uid: str, settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    if uid != str(settings.crambly_demo_user_id):
        raise HTTPException(403, "Demo only supports configured user id")
    sb = supabase_client()
    res = (
        sb.table("audio_clips")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .execute()
    )
    return list(res.data or [])


@app.post("/api/audio-clips")
def api_audio_clips_save(
    body: dict[str, Any],
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Store metadata for a generated explainer (MVP: optional blob URL)."""
    user_id = str(settings.crambly_demo_user_id)
    sb = supabase_client()
    row = {
        "user_id": user_id,
        "concept_id": body.get("concept_id"),
        "title": body.get("title") or "Explainer",
        "transcript": body.get("transcript") or "",
        "audio_url": body.get("audio_url"),
    }
    ins = sb.table("audio_clips").insert(row).execute()
    return {"clip": ins.data[0] if ins.data else row}


@app.get("/api/concepts/by-upload/{upload_id}")
def api_concepts_by_upload(
    upload_id: str,
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    user_id = str(settings.crambly_demo_user_id)
    sb = supabase_client()
    up = sb.table("uploads").select("user_id").eq("id", upload_id).limit(1).execute()
    if not up.data or str(up.data[0]["user_id"]) != user_id:
        raise HTTPException(404, "Upload not found")
    res = sb.table("concepts").select("*").eq("upload_id", upload_id).execute()
    return list(res.data or [])
