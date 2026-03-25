"""
Scheduled / on-demand email: daily concept digest + pre-exam reminders (Resend).
Uses Gemini for copy; does not modify other agents.
"""

from __future__ import annotations

import logging
import random
from datetime import date, datetime, timedelta, timezone
from typing import Any

import resend

from config import get_settings
from db import supabase_client
from gemini_client import extract_json_blob, generate_text

logger = logging.getLogger(__name__)


def _sb():
    return supabase_client()


def fetch_digital_twin(user_id: str) -> dict[str, Any] | None:
    res = _sb().table("digital_twin").select("*").eq("user_id", user_id).limit(1).execute()
    if not res.data:
        return None
    return dict(res.data[0])


def fetch_all_concepts_for_user(user_id: str) -> list[dict[str, Any]]:
    sb = _sb()
    up = sb.table("uploads").select("id").eq("user_id", user_id).execute()
    upload_ids = [str(r["id"]) for r in (up.data or [])]
    if not upload_ids:
        return []
    res = sb.table("concepts").select("id,title,summary,upload_id").in_("upload_id", upload_ids).execute()
    rows: list[dict[str, Any]] = []
    for r in res.data or []:
        rows.append(
            {
                "id": str(r["id"]),
                "title": str(r.get("title", "")),
                "summary": str(r.get("summary", "")),
                "upload_id": str(r.get("upload_id", "")),
            }
        )
    return rows


def fetch_concepts_for_course(user_id: str, course_id: str | None) -> list[dict[str, Any]]:
    if not course_id:
        return []
    sb = _sb()
    up = (
        sb.table("uploads")
        .select("id")
        .eq("user_id", user_id)
        .eq("course_id", course_id)
        .execute()
    )
    upload_ids = [str(r["id"]) for r in (up.data or [])]
    if not upload_ids:
        return []
    res = sb.table("concepts").select("id,title,summary").in_("upload_id", upload_ids).execute()
    out: list[dict[str, Any]] = []
    for r in res.data or []:
        out.append(
            {
                "id": str(r["id"]),
                "title": str(r.get("title", "")),
                "summary": str(r.get("summary", "")),
            }
        )
    return out


def fetch_upcoming_assessments(user_id: str, *, days: int) -> list[dict[str, Any]]:
    sb = _sb()
    today = date.today()
    end = today + timedelta(days=max(1, days))
    res = (
        sb.table("assessments")
        .select("id,name,due_date,grade_weight,course_id")
        .eq("user_id", user_id)
        .gte("due_date", today.isoformat())
        .lte("due_date", end.isoformat())
        .execute()
    )
    course_codes: dict[str, str] = {}
    out: list[dict[str, Any]] = []
    for row in res.data or []:
        cid = row.get("course_id")
        if cid:
            ck = str(cid)
            if ck not in course_codes:
                c = sb.table("courses").select("code").eq("id", ck).limit(1).execute()
                course_codes[ck] = (c.data[0].get("code") if c.data else "") or ""
        due_raw = row["due_date"]
        if isinstance(due_raw, str):
            d = date.fromisoformat(due_raw[:10])
        else:
            d = due_raw
        dr = (d - today).days
        ck = str(cid) if cid else ""
        out.append(
            {
                "id": str(row["id"]),
                "name": str(row["name"]),
                "due_date": due_raw,
                "grade_weight": float(row.get("grade_weight") or 0),
                "course_id": ck or None,
                "course_code": course_codes.get(ck, "") if cid else "",
                "days_remaining": dr,
            }
        )
    return out


def confusion_map_for_course(twin: dict[str, Any] | None, course_code: str) -> dict[str, float]:
    if not twin:
        return {}
    cbc = twin.get("confusion_by_course")
    if isinstance(cbc, dict) and course_code in cbc and isinstance(cbc[course_code], dict):
        m = cbc[course_code]
        return {str(k): float(v) for k, v in m.items() if isinstance(v, (int, float))}
    cs = twin.get("confusion_score")
    if isinstance(cs, dict) and course_code in cs and isinstance(cs[course_code], dict):
        m = cs[course_code]
        return {str(k): float(v) for k, v in m.items() if isinstance(v, (int, float))}
    if isinstance(cs, dict):
        return {str(k): float(v) for k, v in cs.items() if isinstance(v, (int, float))}
    return {}


def parse_json_safe(raw: str) -> dict[str, Any]:
    try:
        blob = extract_json_blob(raw)
        return blob if isinstance(blob, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def build_digest_email_html(content: dict[str, Any], concept: dict[str, Any], urgent: list[dict[str, Any]], base_url: str) -> str:
    urgent_block = ""
    if urgent:
        a = urgent[0]
        gw = float(a.get("grade_weight") or 0)
        pct = int(gw * 100) if gw <= 1.0 else int(gw)
        urgent_block = f"""
          <div style="background:#fff3cd;border-left:4px solid #ff7b35;
                      padding:12px 16px;border-radius:6px;margin:20px 0;">
            <strong>⏰ {a['name']}</strong> in {a['days_remaining']} days
            — {pct}% of your grade
          </div>
          """

    study_url = f"{base_url.rstrip('/')}/library"
    return f"""
      <div style="font-family:system-ui,sans-serif;max-width:600px;
                  margin:0 auto;background:#0d1117;color:#e6edf3;
                  border-radius:12px;overflow:hidden;">

        <div style="background:#161b22;padding:24px 32px;
                    border-bottom:1px solid #30363d;">
          <span style="color:#00d9ff;font-weight:700;font-size:18px;">
            Crambly
          </span>
          <span style="color:#8b949e;font-size:13px;margin-left:8px;">
            Daily Study Pulse
          </span>
        </div>

        <div style="padding:32px;">
          <h1 style="font-size:22px;font-weight:600;margin:0 0 8px;">
            {content.get("headline", concept["title"])}
          </h1>
          <p style="color:#8b949e;font-size:13px;margin:0 0 24px;">
            Today's concept · {concept["title"]}
          </p>

          {urgent_block}

          <div style="background:#161b22;border-radius:8px;
                      padding:20px;margin-bottom:20px;">
            <p style="font-size:15px;line-height:1.7;margin:0;">
              {content.get("tldr", "")}
            </p>
          </div>

          <div style="border-left:3px solid #00d9ff;
                      padding:12px 16px;margin-bottom:20px;">
            <p style="font-size:13px;color:#8b949e;margin:0 0 4px;">
              Remember this
            </p>
            <p style="font-size:14px;margin:0;">
              {content.get("remember_this", "")}
            </p>
          </div>

          <div style="border-left:3px solid #7ee787;
                      padding:12px 16px;margin-bottom:32px;">
            <p style="font-size:13px;color:#8b949e;margin:0 0 4px;">
              Exam tip
            </p>
            <p style="font-size:14px;margin:0;">
              {content.get("exam_tip", "")}
            </p>
          </div>

          <a href="{study_url}"
             style="background:#00d9ff;color:#0d1117;padding:12px 24px;
                    border-radius:8px;text-decoration:none;
                    font-weight:600;font-size:14px;">
            Open Crambly →
          </a>
        </div>

        <div style="padding:16px 32px;border-top:1px solid #30363d;
                    color:#484f58;font-size:12px;">
          You're receiving this because daily digest is enabled in Crambly.
        </div>
      </div>
      """


def build_reminder_email_html(
    content: dict[str, Any],
    assessment: dict[str, Any],
    base_url: str,
) -> str:
    tips_html = "".join(
        [
            f"""
          <div style="padding:12px 0;border-bottom:1px solid #30363d;">
            <strong style="font-size:14px;">{t.get("concept", "")}</strong>
            <p style="color:#8b949e;font-size:13px;margin:4px 0 0;">
              {t.get("tip", "")}
            </p>
          </div>
          """
            for t in content.get("weak_concept_tips", [])
        ]
    )
    gw = float(assessment.get("grade_weight") or 0)
    pct = int(gw * 100) if gw <= 1.0 else int(gw)
    courses_url = f"{base_url.rstrip('/')}/courses"
    return f"""
      <div style="font-family:system-ui,sans-serif;max-width:600px;
                  margin:0 auto;background:#0d1117;color:#e6edf3;
                  border-radius:12px;overflow:hidden;">

        <div style="background:#161b22;padding:24px 32px;
                    border-bottom:1px solid #30363d;">
          <span style="color:#00d9ff;font-weight:700;font-size:18px;">
            Crambly
          </span>
          <span style="color:#8b949e;font-size:13px;margin-left:8px;">
            Exam Reminder
          </span>
        </div>

        <div style="padding:32px;">
          <div style="background:#ff7b3522;border:1px solid #ff7b35;
                      border-radius:8px;padding:16px;margin-bottom:24px;">
            <strong style="font-size:16px;">
              {assessment["name"]}
            </strong>
            <p style="margin:4px 0 0;color:#ff7b35;font-size:14px;">
              {assessment["days_remaining"]} days away ·
              {pct}% of your grade
            </p>
          </div>

          <p style="font-size:15px;line-height:1.7;margin:0 0 24px;">
            {content.get("opening", "")}
          </p>

          <h2 style="font-size:15px;font-weight:600;margin:0 0 12px;">
            Focus on these
          </h2>

          {tips_html}

          <p style="font-size:14px;color:#7ee787;
                    margin:24px 0 32px;font-style:italic;">
            {content.get("final_encouragement", "")}
          </p>

          <a href="{courses_url}"
             style="background:#00d9ff;color:#0d1117;padding:12px 24px;
                    border-radius:8px;text-decoration:none;
                    font-weight:600;font-size:14px;">
            Start studying →
          </a>
        </div>
      </div>
      """


def send_email_resend(to: str, subject: str, html: str) -> None:
    s = get_settings()
    key = (s.resend_api_key or "").strip()
    if not key:
        raise RuntimeError("RESEND_API_KEY is not set")
    resend.api_key = key
    params: dict[str, Any] = {
        "from": s.resend_from_email,
        "to": to,
        "subject": subject,
        "html": html,
    }
    resend.Emails.send(params)


def log_notification(
    user_id: str,
    ntype: str,
    subject: str,
    *,
    status: str,
    concept_id: str | None = None,
    assessment_id: str | None = None,
) -> None:
    _sb().table("notification_log").insert(
        {
            "user_id": user_id,
            "type": ntype,
            "subject": subject[:500],
            "status": status,
            "concept_id": concept_id,
            "assessment_id": assessment_id,
        }
    ).execute()


def already_sent_digest_today(user_id: str) -> bool:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    res = (
        _sb()
        .table("notification_log")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", "daily_digest")
        .eq("status", "sent")
        .gte("sent_at", start.isoformat())
        .limit(1)
        .execute()
    )
    return bool(res.data)


def already_sent_exam_reminder_today(user_id: str, assessment_id: str) -> bool:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    res = (
        _sb()
        .table("notification_log")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", "exam_reminder")
        .eq("assessment_id", assessment_id)
        .eq("status", "sent")
        .gte("sent_at", start.isoformat())
        .limit(1)
        .execute()
    )
    return bool(res.data)


def send_daily_digest(user_id: str, email: str, *, force: bool = False) -> None:
    s = get_settings()
    base_url = s.crambly_public_web_url

    if not force and already_sent_digest_today(user_id):
        logger.info("Skipping daily digest for %s — already sent today", user_id)
        return

    twin = fetch_digital_twin(user_id)
    weak_topics: list[str] = list(twin.get("weak_topics") or []) if twin else []

    all_concepts = fetch_all_concepts_for_user(user_id)
    if not all_concepts:
        logger.info("No concepts for user %s — skip digest", user_id)
        return

    weak_concepts = [
        c
        for c in all_concepts
        if any(w and w.lower() in c["title"].lower() for w in weak_topics if isinstance(w, str))
    ]
    concept = random.choice(weak_concepts) if weak_concepts else random.choice(all_concepts)

    prompt = f"""
You are writing a friendly daily study reminder email for a university student.
Given this academic concept, write a short engaging summary they can read
in 60 seconds during breakfast or on the TTC.

Concept: {concept["title"]}
Content: {concept.get("summary", "")[:500]}

Return JSON only:
{{
  "subject": "catchy email subject line mentioning the concept (max 60 chars)",
  "headline": "one punchy sentence that makes this concept feel interesting",
  "tldr": "3-4 sentence plain English explanation, no jargon unless necessary",
  "remember_this": "one memorable analogy or example (1-2 sentences)",
  "exam_tip": "one actionable exam tip for this concept"
}}
"""
    try:
        raw = generate_text(prompt, temperature=0.7)
        content = parse_json_safe(raw)
    except Exception:  # noqa: BLE001
        content = {}

    if not content.get("tldr"):
        content = {
            "subject": f"Today's concept: {concept['title']}",
            "headline": concept["title"],
            "tldr": concept.get("summary", "")[:800],
            "remember_this": "",
            "exam_tip": "Review this concept before your next exam.",
        }

    upcoming = fetch_upcoming_assessments(user_id, days=7)
    urgent = [a for a in upcoming if int(a.get("days_remaining", 99)) <= 3]

    html = build_digest_email_html(content, concept, urgent, base_url)
    subject = str(content.get("subject") or f"Crambly · {concept['title']}")[:200]

    try:
        send_email_resend(email, subject, html)
        log_notification(user_id, "daily_digest", subject, status="sent", concept_id=concept["id"])
        logger.info("Daily digest sent to %s", email)
    except Exception as e:  # noqa: BLE001
        logger.exception("Daily digest send failed")
        log_notification(user_id, "daily_digest", subject, status="failed", concept_id=concept["id"])
        raise RuntimeError(str(e)) from e


def send_exam_reminder(user_id: str, email: str, assessment: dict[str, Any]) -> None:
    s = get_settings()
    base_url = s.crambly_public_web_url

    course_concepts = fetch_concepts_for_user(user_id, assessment.get("course_id"))
    if not course_concepts:
        course_concepts = fetch_all_concepts_for_user(user_id)[:8]

    twin = fetch_digital_twin(user_id)
    cc = str(assessment.get("course_code") or "")
    confusion_scores = confusion_map_for_course(twin, cc)

    def score(c: dict[str, Any]) -> float:
        return float(confusion_scores.get(c["title"], 0))

    weak = sorted(course_concepts, key=score, reverse=True)[:5]
    if not weak:
        weak = course_concepts[:5]

    gw = float(assessment.get("grade_weight") or 0)
    pct = int(gw * 100) if gw <= 1.0 else int(gw)
    prompt = f"""
You are writing an exam reminder email for a university student.
Their {assessment["name"]} is in {assessment["days_remaining"]} days
and is worth {pct}% of their grade.

These are concepts to prioritize (quiz performance hints when scores are available):
{chr(10).join(f"- {c['title']}: {c.get('summary', '')[:100]}" for c in weak)}

Return JSON only:
{{
  "subject": "urgent but friendly subject line mentioning days remaining",
  "opening": "2 sentences — acknowledge the exam is coming, keep it calm not scary",
  "weak_concept_tips": [
    {{"concept": "title", "tip": "one actionable study tip for this concept"}}
  ],
  "final_encouragement": "1 sentence of genuine encouragement"
}}
"""
    try:
        raw = generate_text(prompt, temperature=0.5)
        content = parse_json_safe(raw)
    except Exception:  # noqa: BLE001
        content = {}

    if not content.get("weak_concept_tips"):
        content = {
            "subject": f"⏰ {assessment['name']} in {assessment['days_remaining']} days",
            "opening": f"Your {assessment['name']} is coming up. Here are your focus areas.",
            "weak_concept_tips": [{"concept": c["title"], "tip": "Review this concept."} for c in weak],
            "final_encouragement": "You've got this.",
        }

    html = build_reminder_email_html(content, assessment, base_url)
    subject = str(content.get("subject") or f"Exam coming: {assessment['name']}")[:200]

    try:
        send_email_resend(email, subject, html)
        log_notification(
            user_id,
            "exam_reminder",
            subject,
            status="sent",
            assessment_id=assessment["id"],
        )
        logger.info("Exam reminder sent to %s for assessment %s", email, assessment["id"])
    except Exception as e:  # noqa: BLE001
        logger.exception("Exam reminder send failed")
        log_notification(
            user_id,
            "exam_reminder",
            subject,
            status="failed",
            assessment_id=assessment["id"],
        )
        raise RuntimeError(str(e)) from e
