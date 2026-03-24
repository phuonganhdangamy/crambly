import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/models";

export const runtime = "nodejs";

const DEMO_UID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "00000000-0000-0000-0000-000000000001";

type Body = {
  blockContent?: string;
  learnerMode?: string;
  complexityLevel?: number;
  hasMath?: boolean;
  hasCode?: boolean;
};

/** Pull study_dna from FastAPI twin so simplifications match the student's fingerprint. */
async function fetchStudyDnaHint(): Promise<string> {
  const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${api}/api/twin/${DEMO_UID}`, { cache: "no-store" });
    if (!res.ok) return "";
    const j = (await res.json()) as { digital_twin?: Record<string, unknown> };
    const raw = j.digital_twin?.study_dna;
    if (!raw || typeof raw !== "object") return "";
    const sd = raw as Record<string, unknown>;
    const lines: string[] = [];
    const add = (label: string, v: unknown) => {
      if (v == null || v === "") return;
      if (typeof v === "string") lines.push(`${label}: ${v}`);
      else if (typeof v === "number") lines.push(`${label}: ${v}`);
      else if (Array.isArray(v) && v.length)
        lines.push(`${label}: ${v.map((x) => String(x)).join("; ")}`);
    };
    add("Sentence length preference", sd.sentence_length_preference);
    add("Example vs theory", sd.example_vs_theory_ratio);
    add("Vocabulary level (1-10)", sd.vocabulary_level_1_to_10);
    add("Structure preference", sd.structural_preference);
    add("Analogy types they like", sd.favorite_analogy_types);
    const snippets = sd.few_shot_snippets;
    if (Array.isArray(snippets) && snippets.length) {
      lines.push(
        `Student voice samples (echo this tone lightly, do not copy verbatim): ${snippets
          .slice(0, 2)
          .map((s) => String(s).slice(0, 320))
          .join(" … ")}`,
      );
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

function extractJsonObject(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no json object");
  return JSON.parse(t.slice(start, end + 1)) as unknown;
}

export async function POST(req: Request) {
  let blockContent = "";
  try {
    const body = (await req.json()) as Body;
    blockContent = typeof body.blockContent === "string" ? body.blockContent : "";
    if (!blockContent.trim()) {
      return NextResponse.json({
        simplified: "",
        worked_example: null,
        key_terms: [] as string[],
        error: true,
      });
    }

    const learnerMode =
      typeof body.learnerMode === "string" && body.learnerMode.length > 0
        ? body.learnerMode
        : "adhd";
    const complexityLevel =
      typeof body.complexityLevel === "number" && Number.isFinite(body.complexityLevel)
        ? Math.max(0, Math.min(100, Math.round(body.complexityLevel)))
        : 50;
    const hasMath = Boolean(body.hasMath);
    const hasCode = Boolean(body.hasCode);

    const studyDnaBlock = await fetchStudyDnaHint();

    const prompt = `
You are a friendly tutor. The student is stuck on dense lecture material (often Markdown or LaTeX pasted from a slide).
Your job is to RE-EXPLAIN the idea in fresh, intuitive, everyday language — not to transcribe, mirror, or lightly paraphrase the source.

ANTI-TRANSCRIPTION (critical):
- Do NOT dump LaTeX, long equations, aligned math blocks, or symbol-heavy lines into "simplified". The student already has the technical slide.
- If the topic is statistical or mathematical, say in words what is being compared or tested, what "big vs small" means for the conclusion, and what decision was reached (e.g. reject/accept a hypothesis) without copying formulas.
- At most one tiny numeric shorthand if it helps intuition (e.g. "p-value was far below 1%"), never a wall of Greek letters or summations.
- Avoid markdown headings like ### in "simplified" unless the learner mode explicitly wants structure; prefer flowing prose or a very short bullet list.

LENGTH & DEPTH:
- Aim for roughly 4–10 short sentences in "simplified" (fewer if mode is adhd/audio). Prioritize one clear story of what's going on over covering every symbol.
- Complexity dial: ${complexityLevel}/100 — 0–30: everyday words only, no jargon unless explained in one phrase; 70–100: may name 1–2 standard terms but still explain them plainly.

Learner mode (follow tightly): ${learnerMode}
  adhd:           Start with the bottom line in one sentence. Then 2–5 very short sentences. Bold the one phrase that matters most.
  global_scholar: Plain vocabulary; one concrete analogy from ordinary life. Mention 2–4 key terms naturally (no bold wall of jargon).
  visual:         Paint a mental picture or walk through a diagram in words (e.g. "imagine a table with rows as…").
  exam_cram:      What to memorize in plain English: the claim being tested, the conclusion, and one "exam sentence" they can write without symbols.
  audio:          Sounds like spoken explanation. No bullet characters. Contractions OK.

Context flags: hasMath=${hasMath}, hasCode=${hasCode}.
- If hasMath: translate math into spoken intuition; do not reproduce the equation block.
- If hasCode: describe what the code accomplishes in one plain sentence; do not paste a long code listing in "simplified".

Study DNA — match this student's fingerprint when writing (if lines exist below):
${studyDnaBlock || "(No study DNA on file — use learner mode and complexity only.)"}

Return JSON only — no preamble, no markdown fences:
{
  "simplified":     string,
  "worked_example": string | null,
  "key_terms":      string[]
}

"simplified": the main intuitive re-explanation (plain language; minimal symbols).
"worked_example": optional short real-world scenario or walkthrough with zero or trivial math; null if redundant.
"key_terms": at most 5 items; each can be "Term — quick plain definition" or just the term.

Source (for understanding only — do not mirror its formatting or equations):
${blockContent}
`.trim();

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({
        simplified: blockContent,
        worked_example: null,
        key_terms: [] as string[],
        error: true,
      });
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: MODELS.snippet });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });
    const text = result.response.text();
    const parsed = extractJsonObject(text) as Record<string, unknown>;
    const simplified = typeof parsed.simplified === "string" ? parsed.simplified : blockContent;
    const worked_example =
      parsed.worked_example === null || parsed.worked_example === undefined
        ? null
        : String(parsed.worked_example);
    const key_terms = Array.isArray(parsed.key_terms)
      ? parsed.key_terms.map((k) => String(k)).filter(Boolean)
      : [];

    return NextResponse.json({
      simplified: simplified || blockContent,
      worked_example,
      key_terms,
      error: false,
    });
  } catch {
    return NextResponse.json({
      simplified: blockContent,
      worked_example: null,
      key_terms: [] as string[],
      error: true,
    });
  }
}
