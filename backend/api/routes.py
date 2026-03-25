from __future__ import annotations

import base64
import logging
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from agents.delivery_agent import build_quiz_burst_for_upload
from agents.notification_agent import send_daily_digest
from lesson_export import send_lesson_export_email
from agents.expressive_media_agent import run_meme_pipeline
from config import Settings, get_settings
from db import ensure_demo_user, supabase_client
from tasks.common import fetch_concepts_for_upload, patch_study_deck, top_concept_for_meme, upload_bytes_to_storage
from tasks.orchestrator import prepare_study_deck_row, run_study_deck_workers

logger = logging.getLogger(__name__)

api_router = APIRouter()


class CreateCourseBody(BaseModel):
    name: str
    code: str
    color: str = Field(default="#6366f1", max_length=32)


@api_router.post("/courses")
def post_course(
    body: CreateCourseBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    name = body.name.strip()
    code = body.code.strip().upper()
    if not name or not code:
        raise HTTPException(400, "name and code required")
    color = (body.color or "#6366f1").strip() or "#6366f1"
    try:
        ins = (
            sb.table("courses")
            .insert({"user_id": user_id, "name": name, "code": code, "color": color})
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("course insert failed")
        raise HTTPException(400, f"Could not create course (duplicate code?): {e}") from e
    if not ins.data:
        raise HTTPException(500, "course insert returned no row")
    return ins.data[0]


@api_router.get("/courses/{course_id}/uploads")
def get_course_uploads(course_id: str, settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    c = (
        sb.table("courses")
        .select("id")
        .eq("id", course_id.strip())
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not c.data:
        raise HTTPException(404, "course not found")
    res = (
        sb.table("uploads")
        .select("*")
        .eq("course_id", course_id.strip())
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    out: list[dict[str, Any]] = []
    for u in res.data or []:
        cnt = (
            sb.table("concepts")
            .select("id", count="exact")
            .eq("upload_id", u["id"])
            .execute()
        )
        row = dict(u)
        row["concepts_count"] = int(cnt.count or 0)
        out.append(row)
    return out


@api_router.get("/courses/{course_id}/aggregate")
def get_course_aggregate(course_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    c = (
        sb.table("courses")
        .select("*")
        .eq("id", course_id.strip())
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not c.data:
        raise HTTPException(404, "course not found")
    course = c.data[0]
    code = str(course.get("code", ""))

    ups = (
        sb.table("uploads")
        .select("id")
        .eq("course_id", course_id.strip())
        .eq("user_id", user_id)
        .execute()
    )
    upload_ids = [str(u["id"]) for u in (ups.data or [])]
    titles: set[str] = set()
    for uid in upload_ids:
        cons = sb.table("concepts").select("title").eq("upload_id", uid).execute()
        for row in cons.data or []:
            t = str(row.get("title", "")).strip()
            if t:
                titles.add(t)

    asm = (
        sb.table("assessments")
        .select("*")
        .eq("user_id", user_id)
        .eq("course_id", course_id.strip())
        .execute()
    )
    today = datetime.now(timezone.utc).date()
    next_assessment: str | None = None
    future_dates: list[date] = []
    for a in asm.data or []:
        try:
            d = date.fromisoformat(str(a.get("due_date", "")))
            if d >= today:
                future_dates.append(d)
        except ValueError:
            continue
    if future_dates:
        next_assessment = min(future_dates).isoformat()

    twin = sb.table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    weak_topics: list[str] = []
    if twin.data:
        wbc = twin.data[0].get("weak_topics_by_course") or {}
        if isinstance(wbc, dict) and code in wbc:
            raw = wbc.get(code)
            if isinstance(raw, list):
                weak_topics = [str(x) for x in raw if str(x).strip()]

    from agents.deadline_agent import recompute_priorities_for_user

    cards = recompute_priorities_for_user(user_id)
    id_set = {str(a["id"]) for a in (asm.data or [])}
    course_cards = [x for x in cards if str(x.get("assessment_id", "")) in id_set]

    return {
        "course": course,
        "key_terms": sorted(titles, key=str.lower),
        "assessment_cards": course_cards,
        "next_assessment_date": next_assessment,
        "weak_topics": weak_topics,
    }


@api_router.get("/courses/{uid}")
def list_courses_for_user(uid: str, settings: Settings = Depends(get_settings)) -> list[dict[str, Any]]:
    if uid != str(settings.crambly_demo_user_id):
        raise HTTPException(403, "Demo only supports configured user id")
    ensure_demo_user()
    sb = supabase_client()
    res = sb.table("courses").select("*").eq("user_id", uid).order("code").execute()
    today = datetime.now(timezone.utc).date()
    enriched: list[dict[str, Any]] = []
    for row in res.data or []:
        cid = str(row["id"])
        cnt = (
            sb.table("uploads")
            .select("id", count="exact")
            .eq("course_id", cid)
            .eq("user_id", uid)
            .execute()
        )
        n = int(cnt.count or 0)
        asm = sb.table("assessments").select("due_date").eq("course_id", cid).eq("user_id", uid).execute()
        future_dates: list[date] = []
        for a in asm.data or []:
            try:
                d = date.fromisoformat(str(a.get("due_date", "")))
                if d >= today:
                    future_dates.append(d)
            except ValueError:
                continue
        next_a = min(future_dates).isoformat() if future_dates else None
        r = dict(row)
        r["uploads_count"] = n
        r["next_assessment_date"] = next_a
        enriched.append(r)
    return enriched


class DeckGenerateBody(BaseModel):
    upload_id: str


class MemeRegenerateBody(BaseModel):
    upload_id: str


@api_router.post("/deck/generate")
def post_deck_generate(
    body: DeckGenerateBody,
    background_tasks: BackgroundTasks,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    uid = body.upload_id.strip()
    if not uid:
        raise HTTPException(400, "upload_id required")
    try:
        prepare_study_deck_row(uid, user_id, reset=True)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("prepare study_deck failed")
        raise HTTPException(500, str(e)) from e
    background_tasks.add_task(run_study_deck_workers, uid, user_id)
    return {"ok": True, "upload_id": uid}


@api_router.get("/deck/{upload_id}")
def get_deck(upload_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    if not upload_id.strip():
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
    sb = supabase_client()
    res = (
        sb.table("study_deck")
        .select("*")
        .eq("upload_id", upload_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "study_deck not found")
    return res.data[0]


@api_router.delete("/deck/{upload_id}")
def delete_deck(upload_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Remove the study_deck row for an upload (upload + concepts stay)."""
    user_id = str(settings.crambly_demo_user_id)
    uid = upload_id.strip()
    if not uid:
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
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
    sb.table("study_deck").delete().eq("upload_id", uid).eq("user_id", user_id).execute()
    return {"ok": True}


@api_router.delete("/course/{course_id}")
def delete_course(course_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Delete a course; assessments for that course cascade, uploads lose course_id."""
    user_id = str(settings.crambly_demo_user_id)
    cid = course_id.strip()
    if not cid:
        raise HTTPException(400, "course_id required")
    ensure_demo_user()
    sb = supabase_client()
    c = (
        sb.table("courses")
        .select("id,code")
        .eq("id", cid)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not c.data:
        raise HTTPException(404, "course not found")
    code = str(c.data[0].get("code", ""))

    twin = sb.table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    if twin.data:
        row = twin.data[0]
        cbc = row.get("confusion_by_course") if isinstance(row.get("confusion_by_course"), dict) else {}
        wbc = row.get("weak_topics_by_course") if isinstance(row.get("weak_topics_by_course"), dict) else {}
        cbc = dict(cbc)
        wbc = dict(wbc)
        cbc.pop(code, None)
        wbc.pop(code, None)
        sb.table("digital_twin").update(
            {"confusion_by_course": cbc, "weak_topics_by_course": wbc},
        ).eq("user_id", user_id).execute()

    sb.table("courses").delete().eq("id", cid).eq("user_id", user_id).execute()
    return {"ok": True}


@api_router.delete("/upload/{upload_id}")
def delete_upload(upload_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Delete an upload and its concepts, study_deck, etc. (DB cascades). Best-effort storage delete."""
    user_id = str(settings.crambly_demo_user_id)
    uid = upload_id.strip()
    if not uid:
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
    sb = supabase_client()
    res = (
        sb.table("uploads")
        .select("id,file_url")
        .eq("id", uid)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "upload not found")
    path = str(res.data[0].get("file_url") or "").strip()
    bucket = settings.supabase_upload_bucket
    if path:
        try:
            sb.storage.from_(bucket).remove([path])
        except Exception:  # noqa: BLE001
            logger.warning("Storage remove failed for %s (continuing with DB delete)", path, exc_info=True)
    sb.table("uploads").delete().eq("id", uid).eq("user_id", user_id).execute()
    return {"ok": True}


@api_router.get("/quiz-burst/upload/{upload_id}")
def get_quiz_burst_for_upload(
    upload_id: str,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    if not upload_id.strip():
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
    sb = supabase_client()
    up = (
        sb.table("uploads")
        .select("id")
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not up.data:
        raise HTTPException(404, "upload not found")
    try:
        questions = build_quiz_burst_for_upload(upload_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("quiz burst failed")
        raise HTTPException(500, str(e)) from e
    return {"questions": questions}


@api_router.post("/meme/regenerate")
def post_meme_regenerate(
    body: MemeRegenerateBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    uid = body.upload_id.strip()
    if not uid:
        raise HTTPException(400, "upload_id required")
    ensure_demo_user()
    sb = supabase_client()
    up = (
        sb.table("uploads")
        .select("id,meme_recap")
        .eq("id", uid)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not up.data:
        raise HTTPException(404, "upload not found")
    row0 = up.data[0]
    prior_brief: dict[str, Any] | None = None
    recap0 = row0.get("meme_recap")
    if isinstance(recap0, dict):
        b = recap0.get("brief")
        if isinstance(b, dict):
            prior_brief = b
    try:
        prepare_study_deck_row(uid, user_id, reset=False)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    concepts = fetch_concepts_for_upload(uid)
    title, summary = top_concept_for_meme(concepts)
    try:
        result = run_meme_pipeline(
            concept_title=title,
            summary=summary,
            force_image=True,
            prior_brief=prior_brief,
            settings=settings,
        )
        url = result.get("image_url")
        if not url and result.get("image_base64") and result.get("mime"):
            raw = base64.b64decode(str(result["image_base64"]))
            mime = str(result.get("mime") or "image/png")
            path = f"{user_id}/study_deck/{uid}/meme.png"
            url = upload_bytes_to_storage(settings, path, raw, mime)
        if not url:
            raise HTTPException(500, "Meme pipeline produced no image")
        recap: dict[str, Any] = {
            "brief": result["brief"],
            "source": result["source"],
            "image_url": url,
        }
        if result.get("image_base64"):
            recap["image_base64"] = result["image_base64"]
        if result.get("mime"):
            recap["mime"] = result["mime"]
        sb.table("uploads").update({"meme_recap": recap}).eq("id", uid).eq("user_id", user_id).execute()
        patch_study_deck(
            uid,
            fields={"meme_image_url": url},
            task_updates={"meme": "done"},
        )
        return {"ok": True, "image_url": url, "brief": result["brief"], "source": result["source"]}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("meme regenerate failed")
        patch_study_deck(uid, task_updates={"meme": "error"})
        raise HTTPException(500, str(e)) from e


class NotificationPrefsBody(BaseModel):
    email: str | None = None
    daily_digest_enabled: bool | None = None
    daily_digest_time: str | None = None
    exam_reminder_enabled: bool | None = None
    exam_reminder_days_before: int | None = Field(default=None, ge=1, le=14)
    timezone: str | None = None


@api_router.get("/notifications/preferences")
def get_notification_preferences(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    try:
        res = (
            sb.table("notification_preferences")
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        logger.exception("notification_preferences read failed")
        raise HTTPException(503, "notification_preferences unavailable — apply latest Supabase migrations") from e
    if not res.data:
        return {
            "user_id": user_id,
            "email": settings.crambly_demo_user_email,
            "daily_digest_enabled": True,
            "daily_digest_time": "08:00",
            "exam_reminder_enabled": True,
            "exam_reminder_days_before": 3,
            "timezone": "America/Toronto",
            "persisted": False,
        }
    row = dict(res.data[0])
    row["persisted"] = True
    return row


@api_router.post("/notifications/preferences")
def post_notification_preferences(
    body: NotificationPrefsBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not patch:
        raise HTTPException(400, "No fields to update")
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "email" not in patch or not (patch.get("email") or "").strip():
        patch["email"] = settings.crambly_demo_user_email
    existing = (
        sb.table("notification_preferences").select("id").eq("user_id", user_id).limit(1).execute()
    )
    try:
        if existing.data:
            sb.table("notification_preferences").update(patch).eq("user_id", user_id).execute()
        else:
            row: dict[str, Any] = {
                "user_id": user_id,
                "email": settings.crambly_demo_user_email,
                "daily_digest_enabled": True,
                "daily_digest_time": "08:00",
                "exam_reminder_enabled": True,
                "exam_reminder_days_before": 3,
                "timezone": "America/Toronto",
            }
            row.update(patch)
            sb.table("notification_preferences").insert(row).execute()
    except Exception as e:  # noqa: BLE001
        logger.exception("notification_preferences write failed")
        raise HTTPException(500, str(e)) from e
    return {"ok": True}


@api_router.post("/notifications/test-digest")
def post_notification_test_digest(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    sb = supabase_client()
    try:
        res = (
            sb.table("notification_preferences")
            .select("email")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, "notification_preferences unavailable — apply migrations") from e
    email = (
        (res.data[0].get("email") if res.data else None) or settings.crambly_demo_user_email
    ).strip()
    try:
        send_daily_digest(user_id, email, force=True)
    except Exception as e:  # noqa: BLE001
        logger.exception("test digest failed")
        raise HTTPException(500, str(e)) from e
    return {"ok": True, "message": "Email sent (if Resend accepted it)"}


class EmailLessonBody(BaseModel):
    """Export lesson HTML + deck audio to email. Recipient defaults from notification prefs or demo email."""

    email: str | None = None
    learner_mode: str = "adhd"
    complexity_dial: float | None = None


@api_router.post("/uploads/{upload_id}/email-lesson")
def post_upload_email_lesson(
    upload_id: str,
    body: EmailLessonBody,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    user_id = str(settings.crambly_demo_user_id)
    ensure_demo_user()
    uid = upload_id.strip()
    if not uid:
        raise HTTPException(400, "upload_id required")
    allowed = {"adhd", "visual", "global_scholar", "audio", "exam_cram"}
    mode = body.learner_mode if body.learner_mode in allowed else "adhd"
    try:
        return send_lesson_export_email(
            user_id=user_id,
            upload_id=uid,
            to_email=body.email,
            learner_mode=mode,
            complexity_dial=body.complexity_dial,
        )
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("email lesson export failed")
        raise HTTPException(500, str(e)) from e
