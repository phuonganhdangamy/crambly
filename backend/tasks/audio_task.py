from __future__ import annotations

import logging

from config import get_settings
from elevenlabs_client import synthesize_speech
from tasks.common import audio_summary_script, fetch_concepts_for_upload, patch_study_deck, upload_bytes_to_storage

logger = logging.getLogger(__name__)


def run_audio_task(upload_id: str, user_id: str) -> None:
    settings = get_settings()
    try:
        concepts = fetch_concepts_for_upload(upload_id)
        script, transcript = audio_summary_script(concepts)
        audio_bytes = synthesize_speech(script, max_chars=4800)
        path = f"{user_id}/study_deck/{upload_id}/summary.mp3"
        url = upload_bytes_to_storage(settings, path, audio_bytes, "audio/mpeg")
        patch_study_deck(
            upload_id,
            fields={"audio_url": url, "audio_transcript": transcript},
            task_updates={"audio": "done"},
        )
    except Exception:  # noqa: BLE001
        logger.exception("audio_task failed upload_id=%s", upload_id)
        patch_study_deck(upload_id, task_updates={"audio": "error"})
