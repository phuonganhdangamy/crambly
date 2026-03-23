"""
study_dna_agent
---------------
Analyzes student-authored notes, writes structured fingerprint + few-shot snippets
to `digital_twin.study_dna`, used as a prefix for transformation_agent prompts.
"""

from __future__ import annotations

import logging
from typing import Any

from db import ensure_demo_user, supabase_client
from gemini_client import extract_json_blob, generate_text

logger = logging.getLogger(__name__)

DNA_PROMPT = """Analyze the writing style of these student notes. Identify:
sentence length preference, example vs theory ratio, vocabulary level (1–10),
structural preference (bullets vs prose), favorite analogy types.
Return JSON with keys:
sentence_length_preference (string),
example_vs_theory_ratio (string),
vocabulary_level_1_to_10 (number),
structural_preference (string),
favorite_analogy_types (string array).

Also include writing_samples (string array) with 2-3 short verbatim excerpts from the notes
that best represent the student's voice (each under 400 characters if possible).
JSON only."""


def _ensure_twin_row(user_id: str) -> None:
    sb = supabase_client()
    existing = sb.table("digital_twin").select("id").eq("user_id", user_id).execute()
    if existing.data:
        return
    sb.table("digital_twin").insert({"user_id": user_id}).execute()


def run_study_dna(*, user_id: str, notes_text: str) -> dict[str, Any]:
    ensure_demo_user()
    sb = supabase_client()
    _ensure_twin_row(user_id)

    raw = generate_text(
        DNA_PROMPT + "\n\nNOTES:\n" + notes_text[:14000],
        temperature=0.25,
    )
    data = extract_json_blob(raw)
    if not isinstance(data, dict):
        raise RuntimeError("Study DNA output was not JSON object")

    samples = data.get("writing_samples") or []
    if not isinstance(samples, list):
        samples = []
    snippets = [str(s).strip() for s in samples if str(s).strip()][:3]

    fingerprint = {
        "sentence_length_preference": data.get("sentence_length_preference"),
        "example_vs_theory_ratio": data.get("example_vs_theory_ratio"),
        "vocabulary_level_1_to_10": data.get("vocabulary_level_1_to_10"),
        "structural_preference": data.get("structural_preference"),
        "favorite_analogy_types": data.get("favorite_analogy_types"),
        "few_shot_snippets": snippets,
    }

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    sb.table("digital_twin").update({"study_dna": fingerprint, "updated_at": now}).eq(
        "user_id", user_id
    ).execute()

    return {"study_dna": fingerprint}
