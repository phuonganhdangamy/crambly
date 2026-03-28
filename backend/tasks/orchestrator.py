from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from uuid import UUID

from db import ensure_app_user, supabase_client
from tasks.audio_task import run_audio_task
from tasks.common import default_tasks_status
from tasks.meme_task import run_meme_task
from tasks.puzzle_task import run_puzzle_task
from tasks.wordle_task import run_wordle_task
from tasks.youtube_task import run_youtube_task

logger = logging.getLogger(__name__)


def assert_upload_ready_for_deck(upload_id: str, user_id: str) -> None:
    sb = supabase_client()
    res = (
        sb.table("uploads")
        .select("id,status")
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise ValueError("upload not found")
    if str(res.data[0].get("status")) != "ready":
        raise ValueError("upload is not ready")


def prepare_study_deck_row(upload_id: str, user_id: str, *, reset: bool) -> None:
    """Create or reset study_deck before background workers run."""
    ensure_app_user(UUID(user_id))
    assert_upload_ready_for_deck(upload_id, user_id)
    sb = supabase_client()
    status = default_tasks_status()
    blank: dict[str, Any] = {
        "meme_image_url": None,
        "audio_url": None,
        "audio_transcript": None,
        "word_bank": None,
        "puzzle_pairs": None,
        "youtube_suggestions": None,
        "tasks_status": status,
    }
    existing = (
        sb.table("study_deck").select("id").eq("upload_id", upload_id).limit(1).execute()
    )
    if not existing.data:
        sb.table("study_deck").insert(
            {"upload_id": upload_id, "user_id": user_id, **blank},
        ).execute()
    elif reset:
        sb.table("study_deck").update(blank).eq("upload_id", upload_id).execute()


def run_study_deck_workers(upload_id: str, user_id: str) -> None:
    """Execute five asset builders in parallel (call after prepare_study_deck_row)."""
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {
            pool.submit(run_meme_task, upload_id, user_id): "meme",
            pool.submit(run_audio_task, upload_id, user_id): "audio",
            pool.submit(run_wordle_task, upload_id, user_id): "wordle",
            pool.submit(run_puzzle_task, upload_id, user_id): "puzzle",
            pool.submit(run_youtube_task, upload_id, user_id): "youtube",
        }
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                fut.result()
            except Exception:  # noqa: BLE001
                logger.exception("study_deck worker %s crashed", name)


def schedule_study_deck_tasks(upload_id: str, user_id: str, *, reset: bool = False) -> None:
    """Synchronous full run (for tests); production uses prepare + BackgroundTasks."""
    prepare_study_deck_row(upload_id, user_id, reset=reset)
    run_study_deck_workers(upload_id, user_id)
