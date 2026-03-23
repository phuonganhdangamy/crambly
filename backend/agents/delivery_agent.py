"""
delivery_agent
--------------
Builds the mobile TLDR Pulse: top assessment, three review chunks, and a
five-question quiz burst grounded in weak topics / high exam importance.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from db import ensure_demo_user, supabase_client
from gemini_client import extract_json_blob, generate_text

logger = logging.getLogger(__name__)

QUIZ_PROMPT = """You write short multiple-choice questions for university revision.
Return JSON: { "questions": [ { "topic": string, "question": string, "choices": string[4], "correct_index": 0-3 } ] }
Exactly 5 questions. One clearly correct answer. JSON only."""


def _pick_concepts(user_id: str, weak_topics: list[str]) -> list[dict[str, Any]]:
    sb = supabase_client()
    uploads = sb.table("uploads").select("id").eq("user_id", user_id).eq("status", "ready").execute()
    ids = [u["id"] for u in (uploads.data or [])]
    if not ids:
        return []
    concepts: list[dict[str, Any]] = []
    for uid in ids:
        c = (
            sb.table("concepts")
            .select("id,title,summary,exam_importance,upload_id")
            .eq("upload_id", uid)
            .execute()
        )
        concepts.extend(c.data or [])

    def score(row: dict[str, Any]) -> tuple[int, int]:
        title = str(row.get("title", ""))
        in_weak = 1 if any(w.lower() in title.lower() for w in weak_topics) else 0
        imp = int(row.get("exam_importance") or 3)
        return (in_weak, imp)

    concepts.sort(key=score, reverse=True)
    return concepts[:12]


def build_pulse(user_id: str) -> dict[str, Any]:
    ensure_demo_user()
    sb = supabase_client()
    today = datetime.now(timezone.utc).date().isoformat()

    twin = (
        sb.table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    )
    weak_topics: list[str] = []
    if twin.data:
        weak_topics = list(twin.data[0].get("weak_topics") or [])

    try:
        assessments = (
            sb.table("assessments")
            .select("*")
            .eq("user_id", user_id)
            .order("priority_score", desc=True)
            .limit(1)
            .execute()
        )
        rows: list[dict[str, Any]] = list(assessments.data or [])
    except Exception:  # noqa: BLE001
        assessments = sb.table("assessments").select("*").eq("user_id", user_id).execute()
        rows = sorted(
            assessments.data or [],
            key=lambda a: float(a.get("priority_score") or 0.0),
            reverse=True,
        )[:1]
    top = rows[0] if rows else None
    top_block = None
    if top:
        from datetime import date

        due = date.fromisoformat(str(top["due_date"]))
        days = max((due - datetime.now(timezone.utc).date()).days, 0)
        top_block = {
            "name": top["name"],
            "due_date": str(top["due_date"]),
            "urgency_message": f"{top['name']} is due in {days} day(s). Weight: {float(top['grade_weight'])*100:.0f}% of grade.",
        }

    pool = _pick_concepts(user_id, weak_topics)
    chunks = [
        {"id": str(c["id"]), "title": c["title"], "summary": c["summary"]}
        for c in pool[:3]
    ]

    context = "\n".join(f"- {c['title']}: {c['summary']}" for c in pool[:8])
    weak_line = ", ".join(weak_topics[:6]) if weak_topics else "general weak areas"
    raw = generate_text(
        QUIZ_PROMPT
        + f"\n\nWeak topics: {weak_line}\nConcept context:\n{context[:6000]}",
        temperature=0.4,
    )
    quiz_json = extract_json_blob(raw)
    questions = quiz_json.get("questions") if isinstance(quiz_json, dict) else None
    if not isinstance(questions, list):
        questions = []

    quiz_burst: list[dict[str, Any]] = []
    for q in questions[:5]:
        if not isinstance(q, dict):
            continue
        choices = list(q.get("choices") or [])
        if len(choices) < 2:
            continue
        cid = None
        title = str(q.get("topic", ""))
        for c in pool:
            if title and title.lower() in str(c.get("title", "")).lower():
                cid = str(c["id"])
                break
        quiz_burst.append(
            {
                "id": str(uuid.uuid4()),
                "concept_id": cid,
                "topic": title or "review",
                "question": str(q.get("question", "")),
                "choices": choices[:4],
                "correct_index": int(q.get("correct_index", 0)) % max(len(choices), 1),
            }
        )

    need = 5 - len(quiz_burst)
    if need > 0:
        for i in range(need):
            quiz_burst.append(
                {
                    "id": str(uuid.uuid4()),
                    "concept_id": str(pool[0]["id"]) if pool else None,
                    "topic": "warmup",
                    "question": f"Warmup {i + 1}: quick retention check — did you review a concept today?",
                    "choices": ["Not yet", "Skimmed it", "Yes, fully", "Only audio"],
                    "correct_index": 2,
                }
            )

    return {
        "date": today,
        "top_assessment": top_block,
        "concept_chunks": chunks,
        "quiz_burst": quiz_burst[:5],
    }
