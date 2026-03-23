"""
Crambly FastAPI entrypoint — wires HTTP routes to agent modules.
Run from /backend: `uvicorn main:app --reload`

Agent orchestration is explicit Python calls for the MVP demo. Google ADK can wrap
these same functions later (tool boundaries already align 1:1 with routes).
"""

from __future__ import annotations

import logging
from typing import Any
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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
from agents.transformation_agent import run_transform
from config import Settings, get_settings
from db import ensure_demo_user, supabase_client
from elevenlabs_client import synthesize_speech

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Crambly API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SyllabusTextBody(BaseModel):
    text: str


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
    # When reimagine=True, pass the prior brief to skip Step 1 and reuse fallback_prompt.
    brief: dict[str, Any] | None = None


@app.on_event("startup")
def _startup() -> None:
    try:
        ensure_demo_user()
    except Exception as e:  # noqa: BLE001
        logger.warning("Demo user bootstrap skipped: %s", e)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload")
async def api_upload(
    file: UploadFile = File(...),
    file_type: str = Form("pdf"),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    ft = file_type.lower().strip()
    if ft not in {"pdf", "image", "audio", "text"}:
        raise HTTPException(400, "file_type must be pdf|image|audio|text")
    try:
        return run_ingestion(
            user_id=user_id,
            file_name=file.filename or "upload",
            file_bytes=data,
            file_type=ft,
            content_type=file.content_type,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("upload failed")
        raise HTTPException(500, str(e)) from e


@app.post("/api/syllabus")
async def api_syllabus(
    file: UploadFile | None = File(None),
    settings: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    user_id = str(settings.crambly_demo_user_id)
    if file is None:
        raise HTTPException(400, "Attach syllabus file")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty syllabus")
    mime = file.content_type or "application/pdf"
    try:
        return run_deadline_from_bytes(
            user_id=user_id,
            file_name=file.filename or "syllabus.pdf",
            file_bytes=data,
            content_type=mime,
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
    try:
        return run_deadline_from_text(user_id=user_id, syllabus_text=body.text)
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
    try:
        return run_transform(
            user_id=user_id,
            upload_id=body.upload_id,
            learner_mode=body.mode,
            complexity_dial=body.complexity_dial,
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("transform failed")
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
    out: list[dict[str, Any]] = []
    for u in ups.data or []:
        cnt = (
            sb.table("concepts")
            .select("id", count="exact")
            .eq("upload_id", u["id"])
            .execute()
        )
        n = int(cnt.count or 0)
        row = dict(u)
        row["concepts_count"] = n
        out.append(row)
    return out


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
    try:
        audio = synthesize_speech(body.text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, str(e)) from e
    import base64

    return {"audio_base64": base64.b64encode(audio).decode("ascii"), "mime": "audio/mpeg"}


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
