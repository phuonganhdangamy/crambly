"""
transformation_agent
--------------------
Rewrites a user's concepts for a learner mode. Prepends Study DNA few-shot
instructions when `digital_twin.study_dna` contains snippets from study_dna_agent.
"""

from __future__ import annotations

import logging
from typing import Any

from db import ensure_demo_user, supabase_client
from gemini_client import extract_json_blob, generate_text

logger = logging.getLogger(__name__)

MODE_INSTRUCTIONS: dict[str, str] = {
    "adhd": """Rewrite the following academic content for a student with ADHD. Use short
paragraphs (max 150 words each). Start each section with a bold action-oriented
header. Prioritize examples over theory. Break any list longer than 3 items into
separate sections.""",
    "visual": """Rewrite for a visual thinker. Use spatial language, bullets, and a text-based
concept map outline (hierarchy with indentation). Avoid long prose walls.""",
    "global_scholar": """Rewrite the following content for a student whose first language is not English.
Simplify vocabulary and sentence structure. However, preserve ALL technical keywords
exactly as written and bold them. Where possible, use a locally relatable analogy.""",
    "audio": """Rewrite as a spoken script: short sentences, cues for emphasis, and signposting
that works well when read aloud.""",
    "exam_cram": """Rewrite in exam-cram style: high-yield bullets, common trap warnings, and quick
mnemonics where helpful. Lead with what is most likely to be tested.""",
}


def _study_dna_prefix(study_dna: dict[str, Any]) -> str:
    snippets = study_dna.get("few_shot_snippets") if isinstance(study_dna, dict) else None
    if not isinstance(snippets, list) or len(snippets) == 0:
        return ""
    ex1 = str(snippets[0])[:1200]
    ex2 = str(snippets[1])[:1200] if len(snippets) > 1 else ""
    parts = [
        "Here are examples of how this student explains things in their own words:",
        f"[EXAMPLE_1]\n{ex1}",
    ]
    if ex2:
        parts.append(f"[EXAMPLE_2]\n{ex2}")
    parts.append("Now rewrite the following concept in that same style, tone, and structure.")
    return "\n\n".join(parts) + "\n\n"


def run_transform(
    *,
    user_id: str,
    upload_id: str,
    learner_mode: str,
    complexity_dial: float | None = None,
) -> dict[str, Any]:
    """
    Returns JSON suitable for the study page: summary, concept_map, key_terms, sections.
    """
    ensure_demo_user()
    sb = supabase_client()

    sb.table("uploads").update(
        {
            "learner_mode": learner_mode,
            "complexity_dial": complexity_dial,
        }
    ).eq("id", upload_id).eq("user_id", user_id).execute()

    concepts = (
        sb.table("concepts")
        .select("id,title,summary,exam_importance")
        .eq("upload_id", upload_id)
        .execute()
    )
    rows = concepts.data or []
    if not rows:
        raise RuntimeError("No concepts found for upload")

    twin = (
        sb.table("digital_twin")
        .select("study_dna,complexity_dial")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    study_dna: dict[str, Any] = {}
    twin_complexity = 0.5
    if twin.data:
        sd = twin.data[0].get("study_dna")
        if isinstance(sd, dict):
            study_dna = sd
        twin_complexity = float(twin.data[0].get("complexity_dial") or 0.5)

    dial = complexity_dial if complexity_dial is not None else twin_complexity
    dial = max(0.0, min(1.0, dial))

    bundle = "\n\n".join(
        f"### {r['title']}\n{r['summary']} (exam_importance={r['exam_importance']})"
        for r in rows
    )

    mode_key = learner_mode if learner_mode in MODE_INSTRUCTIONS else "adhd"
    instruction = MODE_INSTRUCTIONS[mode_key]

    prompt = f"""{_study_dna_prefix(study_dna)}
{instruction}

Complexity dial: {dial:.2f} where 0 means expert-level density and 1 means ELI5.

CONTENT:
{bundle}

Return JSON with keys:
summary (string, overall),
concept_map (string, text hierarchy),
key_terms (string array),
sections (array of {{ "header": string, "body": string }}) — at least 3 sections.
JSON only."""

    raw = generate_text(
        prompt + "\n\nRespond with valid JSON only. No markdown fences.",
        temperature=0.35,
    )
    data = extract_json_blob(raw)
    if not isinstance(data, dict):
        raise RuntimeError("Transform output was not a JSON object")

    return {
        "mode": mode_key,
        "summary": str(data.get("summary", "")),
        "concept_map": str(data.get("concept_map", "")),
        "key_terms": list(data.get("key_terms") or []),
        "sections": list(data.get("sections") or []),
        "complexity_dial": dial,
    }
