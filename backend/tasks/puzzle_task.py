from __future__ import annotations

import logging
from typing import Any

from gemini_client import extract_json_blob, generate_text
from tasks.common import fetch_concepts_for_upload, patch_study_deck

logger = logging.getLogger(__name__)

PUZZLE_PROMPT = """Generate 8 matching pairs for a study game.
Each pair: { "term": string, "definition": string (max 12 words) }
Use only concepts from the provided content. Return JSON array only, no markdown.

CONCEPTS:
"""


def run_puzzle_task(upload_id: str, user_id: str) -> None:
    _ = user_id
    try:
        concepts = fetch_concepts_for_upload(upload_id)
        lines = "\n".join(
            f"- {c.get('title', '')}: {c.get('summary', '')}" for c in concepts[:16]
        )
        raw = generate_text(
            PUZZLE_PROMPT + lines[:8000] + "\n\nReturn a JSON array of 8 objects.",
            temperature=0.35,
        )
        data = extract_json_blob(raw)
        pairs: list[dict[str, Any]] = []
        if isinstance(data, list):
            for item in data[:8]:
                if not isinstance(item, dict):
                    continue
                term = str(item.get("term", "")).strip()
                definition = str(item.get("definition", "")).strip()
                if term and definition:
                    pairs.append({"term": term, "definition": definition})
        if len(pairs) < 4:
            raise RuntimeError("Too few puzzle pairs from model")
        patch_study_deck(
            upload_id,
            fields={"puzzle_pairs": pairs},
            task_updates={"puzzle": "done"},
        )
    except Exception:  # noqa: BLE001
        logger.exception("puzzle_task failed upload_id=%s", upload_id)
        patch_study_deck(upload_id, task_updates={"puzzle": "error"})
