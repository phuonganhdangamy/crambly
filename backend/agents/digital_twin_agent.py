"""
digital_twin_agent
------------------
Consumes quiz outcomes, nudges per-topic confusion scores, rebuilds weak_topics,
then asks deadline_agent to refresh assessment priorities.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from db import ensure_demo_user, supabase_client

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


def apply_quiz_result(*, user_id: str, concept_id: str, correct: bool) -> dict[str, Any]:
    ensure_demo_user()
    sb = supabase_client()
    sb.table("quiz_results").insert(
        {
            "user_id": user_id,
            "concept_id": concept_id,
            "correct": correct,
        }
    ).execute()

    twin = _ensure_twin_row(user_id)
    topic = _concept_title(concept_id)
    confusion: dict[str, float] = {}
    raw = twin.get("confusion_score")
    if isinstance(raw, dict):
        confusion = {str(k): float(v) for k, v in raw.items()}

    prev = float(confusion.get(topic, 0.0))
    if correct:
        confusion[topic] = max(0.0, prev - _CONFUSION_STEP)
    else:
        confusion[topic] = min(1.0, prev + _CONFUSION_STEP * 2)

    weak_topics = [k for k, v in confusion.items() if v >= _WEAK_THRESHOLD]
    weak_topics.sort(key=lambda t: confusion[t], reverse=True)

    now = datetime.now(timezone.utc).isoformat()
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
