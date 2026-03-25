from __future__ import annotations

import logging

from config import get_settings
from tasks.common import audio_summary_script, fetch_concepts_for_upload, patch_study_deck, upload_bytes_to_storage
from tts_synthesis import synthesize_study_audio

logger = logging.getLogger(__name__)


def run_audio_task(upload_id: str, user_id: str) -> None:
    settings = get_settings()
    try:
        concepts = fetch_concepts_for_upload(upload_id)
        script, transcript = audio_summary_script(concepts)
        # ElevenLabs request caps at 10k; we keep ~4800 chars (~roughly a few–several min of speech).
        audio_bytes, mime, provider = synthesize_study_audio(script, max_chars=4800)
        ext = "wav" if mime == "audio/wav" else "mp3"
        path = f"{user_id}/study_deck/{upload_id}/summary.{ext}"
        url = upload_bytes_to_storage(settings, path, audio_bytes, mime)
        patch_study_deck(
            upload_id,
            fields={"audio_url": url, "audio_transcript": transcript},
            task_updates={"audio": "done", "audio_provider": provider},
        )
    except Exception:  # noqa: BLE001
        logger.exception("audio_task failed upload_id=%s", upload_id)
        patch_study_deck(upload_id, task_updates={"audio": "error"})
