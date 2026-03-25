"""
APScheduler jobs for notification emails (digest + exam reminders).
Runs in-process with FastAPI; use a dedicated worker in production if needed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from agents.notification_agent import (
    fetch_upcoming_assessments,
    already_sent_exam_reminder_today,
    send_daily_digest,
    send_exam_reminder,
)
from db import supabase_client

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _digest_local_hour_matches(pref: dict, now_utc: datetime) -> bool:
    tzname = (pref.get("timezone") or "America/Toronto").strip()
    try:
        tz = ZoneInfo(tzname)
    except Exception:  # noqa: BLE001
        tz = ZoneInfo("America/Toronto")
    local = now_utc.astimezone(tz)
    raw = (pref.get("daily_digest_time") or "08:00").strip()
    parts = raw.split(":")
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        h, m = 8, 0
    return local.hour == h and local.minute == m


def run_digest_tick() -> None:
    """Called often (e.g. each minute) so digest fires at each user's local `daily_digest_time`."""
    now_utc = datetime.now(timezone.utc)
    try:
        sb = supabase_client()
        res = (
            sb.table("notification_preferences")
            .select("user_id,email,daily_digest_time,timezone")
            .eq("daily_digest_enabled", True)
            .execute()
        )
    except Exception:  # noqa: BLE001
        logger.exception("notification_preferences fetch failed (migration applied?)")
        return

    for p in res.data or []:
        try:
            if not _digest_local_hour_matches(p, now_utc):
                continue
            uid = str(p["user_id"])
            email = (p.get("email") or "").strip()
            if not email:
                continue
            send_daily_digest(uid, email, force=False)
        except Exception:  # noqa: BLE001
            logger.exception("Daily digest job failed for user %s", p.get("user_id"))


def run_exam_reminders_job() -> None:
    try:
        sb = supabase_client()
        res = (
            sb.table("notification_preferences")
            .select("user_id,email,exam_reminder_days_before")
            .eq("exam_reminder_enabled", True)
            .execute()
        )
    except Exception:  # noqa: BLE001
        logger.exception("notification_preferences fetch failed")
        return

    for p in res.data or []:
        uid = str(p["user_id"])
        email = (p.get("email") or "").strip()
        if not email:
            continue
        days_before = int(p.get("exam_reminder_days_before") or 3)
        try:
            upcoming = fetch_upcoming_assessments(uid, days=max(7, days_before + 1))
        except Exception:  # noqa: BLE001
            logger.exception("fetch_upcoming_assessments failed for %s", uid)
            continue
        for a in upcoming:
            dr = int(a.get("days_remaining") or 0)
            if dr < 1 or dr > days_before:
                continue
            aid = str(a.get("id") or "")
            if not aid:
                continue
            if already_sent_exam_reminder_today(uid, aid):
                continue
            try:
                send_exam_reminder(uid, email, a)
            except Exception:  # noqa: BLE001
                logger.exception("Exam reminder failed user=%s assessment=%s", uid, aid)


def start_notification_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return
    sched = BackgroundScheduler(timezone="UTC")
    # Per-user local send time (HH:MM on the clock in their timezone).
    sched.add_job(run_digest_tick, CronTrigger(minute="*"), id="crambly_digest", replace_existing=True)
    sched.add_job(run_exam_reminders_job, CronTrigger(minute="*/15"), id="crambly_exam", replace_existing=True)
    sched.start()
    _scheduler = sched
    logger.info("Notification scheduler started (hourly digest slot + exam reminders)")
