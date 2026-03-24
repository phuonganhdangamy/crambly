"""
transformation_agent
--------------------
Rewrites a user's concepts for a learner mode. Prepends Study DNA few-shot
instructions when `digital_twin.study_dna` contains snippets from study_dna_agent.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from db import ensure_demo_user, supabase_client
from gemini_client import extract_json_blob, generate_text

logger = logging.getLogger(__name__)

TRANSFORM_BUNDLE_CAP = 15
STREAM_BATCH_SIZE = 5


def transform_study_cache_key(mode: str, complexity_dial: float | None) -> str:
    """Must match `api_transform` in main.py."""
    allowed_modes = {"adhd", "visual", "global_scholar", "audio", "exam_cram"}
    mode_key = mode if mode in allowed_modes else "adhd"
    dial_key = "null" if complexity_dial is None else f"{float(complexity_dial):.3f}"
    return f"{mode_key}|{dial_key}"


def top_bundle_rows(rows: list[dict[str, Any]], limit: int = TRANSFORM_BUNDLE_CAP) -> list[dict[str, Any]]:
    ranked = sorted(rows, key=lambda r: int(r.get("exam_importance") or 1), reverse=True)
    return ranked[:limit]


def build_bundle_string(rows: list[dict[str, Any]]) -> str:
    return "\n\n".join(
        f"### {r['title']}\n{r['summary']} (exam_importance={r['exam_importance']}, "
        f"has_math={bool(r.get('has_math'))}, concept_id={r['id']})"
        for r in rows
    )


def build_transform_cache_payload(
    *,
    mode_key: str,
    summary: str,
    concept_map: str,
    key_terms: list[str],
    sections: list[dict[str, Any]],
    complexity_dial: float,
    concept_graph: dict[str, Any] | None,
    concepts_catalog: list[dict[str, Any]],
    partial: bool,
) -> dict[str, Any]:
    return {
        "mode": mode_key,
        "summary": summary,
        "concept_map": concept_map,
        "key_terms": key_terms,
        "sections": sections,
        "complexity_dial": complexity_dial,
        "concept_graph": concept_graph,
        "concepts_catalog": concepts_catalog,
        "partial": partial,
    }


def merge_write_transform_cache(
    upload_id: str,
    user_id: str,
    cache_key: str,
    payload: dict[str, Any],
) -> bool:
    """Merge payload into uploads.study_cache under cache_key. Returns False if column missing."""
    sb = supabase_client()
    try:
        upload_row = (
            sb.table("uploads")
            .select("study_cache")
            .eq("id", upload_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        study_cache: dict[str, Any] = {}
        if upload_row.data:
            sc = upload_row.data[0].get("study_cache")
            if isinstance(sc, dict):
                study_cache = dict(sc)
        study_cache[cache_key] = payload
        sb.table("uploads").update({"study_cache": study_cache}).eq("id", upload_id).eq("user_id", user_id).execute()
        return True
    except Exception:  # noqa: BLE001
        logger.warning("merge_write_transform_cache failed", exc_info=True)
        return False


def normalize_transform_section(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    s = item
    header = _ensure_latex_delimiters(str(s.get("header", "")))
    body = _ensure_latex_delimiters(str(s.get("body", "")))
    we = s.get("worked_example")
    if not isinstance(we, dict):
        we = {"scenario": "", "steps": [], "plain_english": ""}
    scenario = _ensure_latex_delimiters(str(we.get("scenario", "")))
    steps_raw = [str(x) for x in (we.get("steps") or []) if str(x).strip()]
    steps_norm = [_ensure_latex_delimiters(st) for st in steps_raw]
    plain_english = _ensure_latex_delimiters(str(we.get("plain_english", "")))
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
        raw_formula = str(fa.get("formula", ""))
        fa = {
            "formula": _normalize_formula_latex(raw_formula),
            "terms": terms_list,
        }
        if not fa["formula"] and not fa["terms"]:
            fa = None
    out: dict[str, Any] = {
        "header": header,
        "body": body,
        "worked_example": {
            "scenario": scenario,
            "steps": steps_norm,
            "plain_english": plain_english,
        },
        "has_math": bool(s.get("has_math", False)),
        "formula_annotation": fa,
    }
    if s.get("is_fallback"):
        out["is_fallback"] = True
    cid = s.get("concept_id")
    if cid is not None and str(cid).strip():
        out["concept_id"] = str(cid).strip()
    return out


def concept_row_to_fallback_section(concept: dict[str, Any]) -> dict[str, Any]:
    return {
        "header": str(concept.get("title", "")),
        "body": str(concept.get("summary", "")),
        "worked_example": {"scenario": "", "steps": [], "plain_english": ""},
        "has_math": bool(concept.get("has_math")),
        "formula_annotation": None,
        "is_fallback": True,
        "concept_id": str(concept.get("id", "")),
    }


def _batch_sections_prompt(
    study_dna: dict[str, Any],
    instruction: str,
    dial: float,
    bundle: str,
) -> str:
    return f"""{_study_dna_prefix(study_dna)}{instruction}

Complexity dial: {dial:.2f} where 0 means expert-level density and 1 means ELI5.

STEM / active learning requirements (for THIS batch only):
- Prioritize relationships (cause-effect, prerequisite, structure), not wall-of-text re-reading.
- Every mathematical expression MUST use LaTeX inside delimiters: inline $...$ or display $$...$$.
- For each major section, include a worked_example with a realistic STEM scenario, ordered step strings, and plain_english meaning.
- If a section covers equations (or the source concept has has_math=true), set has_math true and add formula_annotation with "formula" (LaTeX) and "terms" array of {{"symbol", "meaning"}}. Otherwise formula_annotation may be null.
- Cover every concept listed below (at least one section per concept when reasonable).

CONTENT (batch):
{bundle}

Return JSON with a SINGLE key "sections" only. "sections" is an array of objects, each:
{{
  "header": string,
  "body": string,
  "worked_example": {{"scenario": string, "steps": string[], "plain_english": string}},
  "has_math": boolean,
  "formula_annotation": null OR {{"formula": string, "terms": [{{"symbol": string, "meaning": string}}]}}
}}
JSON only."""

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

    bundle_rows = top_bundle_rows(rows)
    bundle = build_bundle_string(bundle_rows)

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
    for item in raw_sections:
        norm = normalize_transform_section(item)
        if norm:
            sections_norm.append(norm)

    summary = _ensure_latex_delimiters(str(data.get("summary", "")))
    concept_map = _ensure_latex_delimiters(str(data.get("concept_map", "")))
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
        "concept_map": concept_map,
        "key_terms": list(data.get("key_terms") or []),
        "sections": sections_norm,
        "complexity_dial": dial,
        "concept_graph": concept_graph,
        "concepts_catalog": concepts_catalog,
    }


def _normalize_formula_latex(formula: str) -> str:
    """
    KaTeX display mode expects the inner TeX only. Models often wrap with $$...$$ or \\[...\\].
    Strip repeatedly so nested wrappers from the model still collapse.
    """
    t = formula.strip()
    while True:
        if len(t) >= 4 and t.startswith("$$") and t.endswith("$$"):
            t = t[2:-2].strip()
            continue
        if len(t) >= 4 and t.startswith(r"\[") and t.endswith(r"\]"):
            t = t[2:-2].strip()
            continue
        if len(t) >= 4 and t.startswith(r"\(") and t.endswith(r"\)"):
            t = t[2:-2].strip()
            continue
        if len(t) >= 2 and t.startswith("$") and t.endswith("$") and not t.startswith("$$"):
            t = t[1:-1].strip()
            continue
        break
    return t


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


def iter_transform_ndjson(
    *,
    user_id: str,
    upload_id: str,
    learner_mode: str,
    complexity_dial: float | None,
) -> Iterator[str]:
    """
    Stream NDJSON lines: sections_batch ... synthesis.
    Updates uploads.study_cache incrementally (partial=True) then final partial=False.
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
        raise ValueError("No concepts found for upload")

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
    mode_key = learner_mode if learner_mode in MODE_INSTRUCTIONS else "adhd"
    instruction = MODE_INSTRUCTIONS[mode_key]

    bundle_rows = top_bundle_rows(rows)
    batches = [bundle_rows[i : i + STREAM_BATCH_SIZE] for i in range(0, len(bundle_rows), STREAM_BATCH_SIZE)]

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

    cache_key = transform_study_cache_key(learner_mode, complexity_dial)
    all_sections: list[dict[str, Any]] = []
    n_batches = len(batches)

    for batch_index, batch in enumerate(batches):
        bundle = build_bundle_string(batch)
        prompt = _batch_sections_prompt(study_dna, instruction, dial, bundle)
        try:
            raw = generate_text(
                prompt + "\n\nRespond with valid JSON only. No markdown fences.",
                temperature=0.35,
                max_output_tokens=8192,
            )
            data = extract_json_blob(raw)
            sections_out: list[dict[str, Any]] = []
            if isinstance(data, dict):
                for item in data.get("sections") or []:
                    norm = normalize_transform_section(item)
                    if norm:
                        sections_out.append(norm)
            if not sections_out:
                raise ValueError("empty sections from model")
        except Exception as e:  # noqa: BLE001
            logger.warning("Stream batch %s failed: %s", batch_index, e)
            sections_out = [concept_row_to_fallback_section(r) for r in batch]

        all_sections.extend(sections_out)
        partial_payload = build_transform_cache_payload(
            mode_key=mode_key,
            summary="",
            concept_map="",
            key_terms=[],
            sections=list(all_sections),
            complexity_dial=dial,
            concept_graph=concept_graph,
            concepts_catalog=concepts_catalog,
            partial=True,
        )
        merge_write_transform_cache(upload_id, user_id, cache_key, partial_payload)
        yield json.dumps(
            {
                "type": "sections_batch",
                "batch_index": batch_index,
                "total_batches": n_batches,
                "sections": sections_out,
            },
            ensure_ascii=False,
        ) + "\n"

    outline = "\n".join(f"- {r['title']}: {str(r['summary'])[:120]}" for r in bundle_rows)
    synthesis_prompt = f"""Given these concept titles and brief summaries from a university lecture,
return a JSON object with exactly these three keys:
{{
  "summary": "3-sentence overview of the entire lecture",
  "concept_map": "linear flow of concept titles joined by arrows, e.g. A -> B -> C",
  "key_terms": ["term1", "term2"]
}}

Use at most 10 key_terms. Concepts:
{outline}"""

    try:
        raw_syn = generate_text(
            synthesis_prompt + "\n\nRespond with valid JSON only. No markdown fences.",
            temperature=0.2,
            max_output_tokens=2048,
        )
        syn_data = extract_json_blob(raw_syn)
        if not isinstance(syn_data, dict):
            raise ValueError("synthesis not object")
        synthesis = {
            "summary": str(syn_data.get("summary", "")),
            "concept_map": str(syn_data.get("concept_map", "")),
            "key_terms": [str(x) for x in (syn_data.get("key_terms") or []) if str(x).strip()],
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("Synthesis failed: %s", e)
        synthesis = {"summary": "", "concept_map": "", "key_terms": []}

    summary = _ensure_latex_delimiters(synthesis["summary"])
    concept_map = _ensure_latex_delimiters(synthesis["concept_map"])

    complete_payload = build_transform_cache_payload(
        mode_key=mode_key,
        summary=summary,
        concept_map=concept_map,
        key_terms=synthesis["key_terms"],
        sections=list(all_sections),
        complexity_dial=dial,
        concept_graph=concept_graph,
        concepts_catalog=concepts_catalog,
        partial=False,
    )
    merge_write_transform_cache(upload_id, user_id, cache_key, complete_payload)

    yield json.dumps(
        {
            "type": "synthesis",
            "summary": summary,
            "concept_map": concept_map,
            "key_terms": synthesis["key_terms"],
        },
        ensure_ascii=False,
    ) + "\n"
