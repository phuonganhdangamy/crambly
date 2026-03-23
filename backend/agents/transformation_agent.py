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
        .select("id,title,summary,exam_importance,has_math,graph_data")
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
        f"### {r['title']}\n{r['summary']} (exam_importance={r['exam_importance']}, "
        f"has_math={bool(r.get('has_math'))}, concept_id={r['id']})"
        for r in rows
    )

    mode_key = learner_mode if learner_mode in MODE_INSTRUCTIONS else "adhd"
    instruction = MODE_INSTRUCTIONS[mode_key]

    prompt = f"""{_study_dna_prefix(study_dna)}
{instruction}

Complexity dial: {dial:.2f} where 0 means expert-level density and 1 means ELI5.

STEM / active learning requirements:
- Prioritize relationships (cause-effect, prerequisite, structure), not wall-of-text re-reading.
- Every mathematical expression MUST use LaTeX inside delimiters: inline $...$ or display $$...$$ so a math renderer can show it.
- For each major section, include a worked_example with a realistic STEM scenario, ordered step strings, and plain_english meaning.
- If a section covers equations (or the source concept has has_math=true), set has_math true and add formula_annotation with "formula" (LaTeX) and "terms" array of {{symbol, meaning}} for the main symbols in that formula. Otherwise formula_annotation may be null.

CONTENT:
{bundle}

Return JSON with keys:
summary (string, overall; use $ / $$ for math),
concept_map (string, text hierarchy),
key_terms (string array),
sections (array of objects, at least 3), each object:
{{
  "header": string,
  "body": string (use $ / $$ for ALL math),
  "worked_example": {{
    "scenario": string,
    "steps": string[],
    "plain_english": string
  }},
  "has_math": boolean,
  "formula_annotation": null OR {{
    "formula": string,
    "terms": [{{"symbol": string, "meaning": string}}]
  }}
}}
JSON only."""

    raw = generate_text(
        prompt + "\n\nRespond with valid JSON only. No markdown fences.",
        temperature=0.35,
    )
    data = extract_json_blob(raw)
    if not isinstance(data, dict):
        raise RuntimeError("Transform output was not a JSON object")

    raw_sections = list(data.get("sections") or [])
    sections_norm: list[dict[str, Any]] = []
    for s in raw_sections:
        if not isinstance(s, dict):
            continue
        body = str(s.get("body", ""))
        body = _ensure_latex_delimiters(body)
        we = s.get("worked_example")
        if not isinstance(we, dict):
            we = {
                "scenario": "",
                "steps": [],
                "plain_english": "",
            }
        fa = s.get("formula_annotation")
        if fa is not None and not isinstance(fa, dict):
            fa = None
        elif isinstance(fa, dict):
            terms_raw = fa.get("terms") or []
            terms_list: list[dict[str, str]] = []
            for t in terms_raw:
                if isinstance(t, dict):
                    terms_list.append(
                        {
                            "symbol": str(t.get("symbol", "")),
                            "meaning": str(t.get("meaning", "")),
                        }
                    )
            fa = {
                "formula": str(fa.get("formula", "")),
                "terms": terms_list,
            }
            if not fa["formula"] and not fa["terms"]:
                fa = None
        sections_norm.append(
            {
                "header": str(s.get("header", "")),
                "body": body,
                "worked_example": {
                    "scenario": str(we.get("scenario", "")),
                    "steps": [str(x) for x in (we.get("steps") or []) if str(x).strip()],
                    "plain_english": str(we.get("plain_english", "")),
                },
                "has_math": bool(s.get("has_math", False)),
                "formula_annotation": fa,
            }
        )

    summary = _ensure_latex_delimiters(str(data.get("summary", "")))
    concept_graph: dict[str, Any] | None = None
    for r in rows:
        gd = r.get("graph_data")
        if isinstance(gd, dict) and gd.get("nodes"):
            concept_graph = gd
            break

    concepts_catalog = [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "summary": r["summary"],
            "has_math": bool(r.get("has_math")),
        }
        for r in rows
    ]

    return {
        "mode": mode_key,
        "summary": summary,
        "concept_map": str(data.get("concept_map", "")),
        "key_terms": list(data.get("key_terms") or []),
        "sections": sections_norm,
        "complexity_dial": dial,
        "concept_graph": concept_graph,
        "concepts_catalog": concepts_catalog,
    }


def _ensure_latex_delimiters(text: str) -> str:
    """
    If the model returned raw LaTeX without $...$, run a tight follow-up pass.
    Skips when delimiters already present to save latency.
    """
    if not text.strip():
        return text
    if "$" in text:
        return text
    if "\\(" in text or "\\[" in text:
        return text
    if not any(c in text for c in "=^_\\{}\\frac\\sum\\int\\alpha\\beta\\gamma\\pi"):
        return text
    try:
        raw = generate_text(
            "Wrap ONLY the mathematical expressions in this fragment with inline $...$ "
            "or display $$...$$. Do not change wording or add commentary. Output the fragment only.\n\n"
            + text[:6000],
            temperature=0.1,
        )
        out = (raw or "").strip()
        return out if out else text
    except Exception:  # noqa: BLE001
        return text
