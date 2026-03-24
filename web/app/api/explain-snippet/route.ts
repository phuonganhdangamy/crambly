import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/models";

export const runtime = "nodejs";

type Body = {
  blockContent?: string;
  learnerMode?: string;
  complexityLevel?: number;
  hasMath?: boolean;
  hasCode?: boolean;
};

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

    const prompt = `
You are helping a university student who has been re-reading a paragraph,
indicating they are confused. Your job is to rewrite it so it is clearer.

Context flags: hasMath=${hasMath}, hasCode=${hasCode}. Apply the math rule only if hasMath is true. Apply the code rule only if hasCode is true.

Rules:
- Preserve ALL technical keywords exactly as written — never remove or replace them
- Maximum 3 sentences for the simplified text
- Use one concrete example if the concept allows it
- Complexity level: ${complexityLevel}/100 (0 = simplest possible, 100 = expert level)
- Learner mode: ${learnerMode}

Learner mode instructions:
  adhd:           Short sentences only. Bold the single most important phrase.
                  Start with the conclusion, then explain why.
  global_scholar: Simplify vocabulary and sentence structure.
                  Bold every technical term. Use a locally relatable analogy.
  visual:         Describe a mental image, spatial analogy, or diagram in words.
  exam_cram:      Focus only on what would appear on an exam.
                  Start with "This is testable because..."
  audio:          Write as if speaking aloud. No bullet points.
                  Use natural spoken language.

Math rule (applies when hasMath is true):
  Preserve all formulas exactly as written — do not remove, simplify, or
  rewrite any formula. Instead, explain in plain language what the formula
  means and what each symbol represents. Place this explanation after the formula.

Code rule (applies when hasCode is true):
  Keep code blocks intact. Add a plain-language comment above each block
  explaining what it does in one sentence.

Return JSON only — no preamble, no markdown fences:
{
  "simplified":     string,
  "worked_example": string | null,
  "key_terms":      string[]
}

Paragraph to simplify:
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
