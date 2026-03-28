import type { StudyTransformSection } from "./api";

export type StudyConceptRow = {
  id: string;
  title: string;
  summary: string;
  exam_importance?: number;
  has_math?: boolean;
};

export function normalizeSections(raw: unknown): StudyTransformSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const o = s as Record<string, unknown>;
    const we = o.worked_example as Record<string, unknown> | undefined;
    const fa = o.formula_annotation as Record<string, unknown> | null | undefined;
    let terms: { symbol: string; meaning: string }[] = [];
    if (fa && Array.isArray(fa.terms)) {
      terms = fa.terms
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t) => ({
          symbol: String(t.symbol ?? ""),
          meaning: String(t.meaning ?? ""),
        }));
    }
    const sec: StudyTransformSection = {
      header: String(o.header ?? ""),
      body: String(o.body ?? ""),
      worked_example: {
        scenario: String(we?.scenario ?? ""),
        steps: Array.isArray(we?.steps) ? we!.steps.map((x) => String(x)) : [],
        plain_english: String(we?.plain_english ?? ""),
      },
      has_math: Boolean(o.has_math),
      formula_annotation:
        fa && typeof fa.formula === "string"
          ? { formula: fa.formula, terms }
          : null,
    };
    if (o.is_fallback === true) sec.is_fallback = true;
    if (o.concept_id != null && String(o.concept_id).trim()) sec.concept_id = String(o.concept_id);
    return sec;
  });
}

export function conceptToFallbackSection(concept: StudyConceptRow): StudyTransformSection {
  return {
    header: concept.title,
    body: concept.summary,
    worked_example: { scenario: "", steps: [], plain_english: "" },
    has_math: Boolean(concept.has_math),
    formula_annotation: null,
    is_fallback: true,
    concept_id: concept.id,
  };
}
