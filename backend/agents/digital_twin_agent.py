"""
digital_twin_agent
------------------
Consumes quiz outcomes, nudges per-topic confusion scores, rebuilds weak_topics,
then asks deadline_agent to refresh assessment priorities.

Phase 8: when the concept's upload belongs to a course, confusion and weak topics
are stored under that course's code in `confusion_by_course` / `weak_topics_by_course`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from uuid import UUID

from db import ensure_app_user, supabase_client

logger = logging.getLogger(__name__)

_CONFUSION_STEP = 0.07
_WEAK_THRESHOLD = 0.35


def _ensure_twin_row(user_id: str) -> dict[str, Any]:
    sb = supabase_client()
    res = sb.table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    if res.data:
        return res.data[0]
    sb.table("digital_twin").insert({"user_id": user_id}).execute()
    res2 = sb.table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    return res2.data[0]


def _concept_title(concept_id: str) -> str:
    sb = supabase_client()
    r = sb.table("concepts").select("title").eq("id", concept_id).limit(1).execute()
    if not r.data:
        return "unknown_topic"
    return str(r.data[0]["title"])


def _course_code_for_concept(concept_id: str) -> str | None:
    """Return course code if this concept's upload is assigned to a course."""
    sb = supabase_client()
    c = sb.table("concepts").select("upload_id").eq("id", concept_id).limit(1).execute()
    if not c.data:
        return None
    uid = str(c.data[0]["upload_id"])
    u = sb.table("uploads").select("course_id").eq("id", uid).limit(1).execute()
    if not u.data:
        return None
    cid = u.data[0].get("course_id")
    if not cid:
        return None
    cr = sb.table("courses").select("code").eq("id", str(cid)).limit(1).execute()
    if not cr.data:
        return None
    return str(cr.data[0]["code"])


def _coerce_confusion_map(raw: Any) -> dict[str, float]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, float] = {}
    for k, v in raw.items():
        try:
            out[str(k)] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def _coerce_by_course(raw: Any) -> dict[str, dict[str, float]]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, float]] = {}
    for ck, inner in raw.items():
        code = str(ck)
        out[code] = _coerce_confusion_map(inner)
    return out


def _coerce_weak_by_course(raw: Any) -> dict[str, list[str]]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, list[str]] = {}
    for ck, val in raw.items():
        code = str(ck)
        if isinstance(val, list):
            out[code] = [str(x) for x in val if str(x).strip()]
        else:
            out[code] = []
    return out


def apply_quiz_result(*, user_id: str, concept_id: str, correct: bool) -> dict[str, Any]:
    ensure_app_user(UUID(user_id))
    sb = supabase_client()
    sb.table("quiz_results").insert(
        {
            "user_id": user_id,
            "concept_id": concept_id,
            "correct": bool(correct),
        }
    ).execute()

    twin = _ensure_twin_row(user_id)
    topic = _concept_title(concept_id)
    course_code = _course_code_for_concept(concept_id)
    now = datetime.now(timezone.utc).isoformat()

    if course_code:
        by_course = _coerce_by_course(twin.get("confusion_by_course"))
        inner = dict(by_course.get(course_code, {}))
        prev = float(inner.get(topic, 0.0))
        if correct:
            inner[topic] = max(0.0, prev - _CONFUSION_STEP)
        else:
            inner[topic] = min(1.0, prev + _CONFUSION_STEP * 2)
        by_course[course_code] = inner

        weak_for_course = [k for k, v in inner.items() if v >= _WEAK_THRESHOLD]
        weak_for_course.sort(key=lambda t: inner[t], reverse=True)
        wbc = _coerce_weak_by_course(twin.get("weak_topics_by_course"))
        wbc[course_code] = weak_for_course

        sb.table("digital_twin").update(
            {
                "confusion_by_course": by_course,
                "weak_topics_by_course": wbc,
                "updated_at": now,
            }
        ).eq("user_id", user_id).execute()
    else:
        confusion = _coerce_confusion_map(twin.get("confusion_score"))
        prev = float(confusion.get(topic, 0.0))
        if correct:
            confusion[topic] = max(0.0, prev - _CONFUSION_STEP)
        else:
            confusion[topic] = min(1.0, prev + _CONFUSION_STEP * 2)

        weak_topics = [k for k, v in confusion.items() if v >= _WEAK_THRESHOLD]
        weak_topics.sort(key=lambda t: confusion[t], reverse=True)

        sb.table("digital_twin").update(
            {
                "confusion_score": confusion,
                "weak_topics": weak_topics,
                "updated_at": now,
            }
        ).eq("user_id", user_id).execute()

    try:
        from agents.deadline_agent import recompute_priorities_for_user

        recompute_priorities_for_user(user_id)
    except Exception:  # noqa: BLE001
        logger.warning("Priority recompute failed after quiz", exc_info=True)

    fresh = sb.table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    return {"digital_twin": fresh.data[0] if fresh.data else {}}
