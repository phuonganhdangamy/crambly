from __future__ import annotations

import base64
import logging

from agents.expressive_media_agent import run_meme_pipeline
from config import get_settings
from tasks.common import (
    fetch_concepts_for_upload,
    patch_study_deck,
    top_concept_for_meme,
    upload_bytes_to_storage,
)

logger = logging.getLogger(__name__)


def run_meme_task(upload_id: str, user_id: str) -> None:
    settings = get_settings()
    try:
        concepts = fetch_concepts_for_upload(upload_id)
        title, summary = top_concept_for_meme(concepts)
        result = run_meme_pipeline(
            concept_title=title,
            summary=summary,
            force_image=False,
            prior_brief=None,
            settings=settings,
        )
        url = result.get("image_url")
        if not url and result.get("image_base64") and result.get("mime"):
            raw = base64.b64decode(str(result["image_base64"]))
            mime = str(result.get("mime") or "image/png")
            path = f"{user_id}/study_deck/{upload_id}/meme.png"
            url = upload_bytes_to_storage(settings, path, raw, mime)
        if not url:
            raise RuntimeError("Meme pipeline produced no image URL")
        patch_study_deck(
            upload_id,
            fields={"meme_image_url": url},
            task_updates={"meme": "done"},
        )
    except Exception:  # noqa: BLE001
        logger.exception("meme_task failed upload_id=%s", upload_id)
        patch_study_deck(upload_id, task_updates={"meme": "error"})
