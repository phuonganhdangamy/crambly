"""
deadline_agent
--------------
Parses syllabus text or PDF bytes into assessments, computes `priority_score`
from grade weight, time urgency, and digital-twin confusion signal, persists rows,
and returns ranked human-readable cards for the UI.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from uuid import UUID

from config import get_settings
from db import ensure_app_user, supabase_client
from gemini_client import extract_json_blob, generate_multimodal, generate_text

logger = logging.getLogger(__name__)

SYLLABUS_PROMPT = """You are a syllabus parser. Extract all graded assessments.
Return JSON array of objects:
{"name": string, "due_date": "YYYY-MM-DD", "grade_weight": number between 0 and 1, "topics_covered": string[]}
grade_weight should be decimal fraction of total grade (e.g. 0.40 for 40%).
If a due date is missing, pick a reasonable placeholder in the same academic term.
Return JSON only."""


def _parse_assessments(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, dict) and "assessments" in raw:
        raw = raw["assessments"]
    if not isinstance(raw, list):
        raise ValueError("Expected JSON array of assessments")
    out: list[dict[str, Any]] = []
    for a in raw:
        if not isinstance(a, dict):
            continue
        name = str(a.get("name", "")).strip()
        due = str(a.get("due_date", "")).strip()
        gw = float(a.get("grade_weight", 0))
        topics = a.get("topics_covered") or []
        if isinstance(topics, str):
            topics = [topics]
        topics = [str(t).strip() for t in topics if str(t).strip()]
        if name and due:
            out.append({"name": name, "due_date": due, "grade_weight": gw, "topics_covered": topics})
    return out


def _urgency(due: date, today: date, total_days: float) -> float:
    dr = max((due - today).days, 0)
    return 1.0 - min(dr / max(total_days, 1.0), 1.0)


def _avg_confusion(topics: list[str], confusion: dict[str, float]) -> float:
    if not topics:
        return 0.0
    vals = [float(confusion.get(t, 0.0)) for t in topics]
    return sum(vals) / max(len(vals), 1)


def _tier(score: float) -> str:
    if score >= 0.65:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


def _message(name: str, due: date, today: date, weight: float, topics: list[str]) -> str:
    days = max((due - today).days, 0)
    focus = ", ".join(topics[:3]) if topics else "core course topics"
    pct = int(round(weight * 100))
    return f"{name} in {days} day(s) — {pct}% of your grade. Focus: {focus}."


def recompute_priorities_for_user(user_id: str) -> list[dict[str, Any]]:
    """Reload assessments + twin, update priority_score, return ranked cards."""
    ensure_app_user(UUID(user_id))
    sb = supabase_client()
    s = get_settings()
    today = datetime.now(timezone.utc).date()

    twin = (
        sb.table("digital_twin")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    confusion_flat: dict[str, float] = {}
    confusion_by_course_raw: dict[str, Any] = {}
    if twin.data:
        row0 = twin.data[0]
        raw_c = row0.get("confusion_score") or {}
        if isinstance(raw_c, dict):
            confusion_flat = {str(k): float(v) for k, v in raw_c.items() if v is not None}
        raw_bc = row0.get("confusion_by_course") or {}
        if isinstance(raw_bc, dict):
            confusion_by_course_raw = raw_bc

    courses_res = sb.table("courses").select("id,code").eq("user_id", user_id).execute()
    course_uuid_to_code: dict[str, str] = {
        str(r["id"]): str(r["code"]) for r in (courses_res.data or []) if r.get("id")
    }

    res = sb.table("assessments").select("*").eq("user_id", user_id).execute()
    rows = res.data or []
    updated: list[dict[str, Any]] = []
    for a in rows:
        try:
            due = date.fromisoformat(str(a["due_date"]))
        except ValueError:
            logger.warning("Skipping assessment %s: invalid due_date", a.get("id"))
            continue
        # Past deadlines are not priorities; keep score low so pulse/UI ignore them.
        if due < today:
            sb.table("assessments").update({"priority_score": 0.0}).eq("id", a["id"]).execute()
            continue
        u = _urgency(due, today, s.total_semester_days)
        aid = a.get("course_id")
        if aid:
            code = course_uuid_to_code.get(str(aid))
            inner = confusion_by_course_raw.get(code) if code else None
            if not isinstance(inner, dict):
                inner = {}
            confusion = {str(k): float(v) for k, v in inner.items() if v is not None}
        else:
            confusion = confusion_flat
        cavg = _avg_confusion(list(a.get("topics_covered") or []), confusion)
        priority = (float(a["grade_weight"]) * 0.5) + (u * 0.3) + (cavg * 0.2)
        sb.table("assessments").update({"priority_score": priority}).eq("id", a["id"]).execute()
        tier = _tier(priority)
        updated.append(
            {
                "assessment_id": a["id"],
                "name": a["name"],
                "due_date": str(a["due_date"]),
                "grade_weight": float(a["grade_weight"]),
                "priority_score": priority,
                "message": _message(
                    a["name"],
                    due,
                    today,
                    float(a["grade_weight"]),
                    list(a.get("topics_covered") or []),
                ),
                "tier": tier,
            }
        )
    updated.sort(key=lambda x: x["priority_score"], reverse=True)
    return updated


def run_deadline_from_bytes(
    *,
    user_id: str,
    file_name: str,
    file_bytes: bytes,
    content_type: str | None,
    course_id: str | None = None,
) -> list[dict[str, Any]]:
    ensure_app_user(UUID(user_id))
    sb = supabase_client()
    mime = content_type or "application/pdf"
    raw = generate_multimodal(SYLLABUS_PROMPT, mime_type=mime, data=file_bytes)
    assessments = _parse_assessments(extract_json_blob(raw))
    return _persist_and_rank(user_id, assessments, course_id=course_id)


def run_deadline_from_text(
    *,
    user_id: str,
    syllabus_text: str,
    course_id: str | None = None,
) -> list[dict[str, Any]]:
    ensure_app_user(UUID(user_id))
    raw = generate_text(SYLLABUS_PROMPT + "\n\nSYLLABUS TEXT:\n" + syllabus_text[:12000])
    assessments = _parse_assessments(extract_json_blob(raw))
    return _persist_and_rank(user_id, assessments, course_id=course_id)


def _persist_and_rank(
    user_id: str,
    assessments: list[dict[str, Any]],
    *,
    course_id: str | None = None,
) -> list[dict[str, Any]]:
    sb = supabase_client()
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
        cid = course_id.strip()
        sb.table("assessments").delete().eq("user_id", user_id).eq("course_id", cid).execute()
        for a in assessments:
            sb.table("assessments").insert(
                {
                    "user_id": user_id,
                    "course_id": cid,
                    "name": a["name"],
                    "due_date": a["due_date"],
                    "grade_weight": a["grade_weight"],
                    "topics_covered": a["topics_covered"],
                    "priority_score": None,
                }
            ).execute()
    else:
        # Legacy: only replace assessments not tied to a course
        sb.table("assessments").delete().eq("user_id", user_id).is_("course_id", "null").execute()
        for a in assessments:
            sb.table("assessments").insert(
                {
                    "user_id": user_id,
                    "name": a["name"],
                    "due_date": a["due_date"],
                    "grade_weight": a["grade_weight"],
                    "topics_covered": a["topics_covered"],
                    "priority_score": None,
                }
            ).execute()
    return recompute_priorities_for_user(user_id)
