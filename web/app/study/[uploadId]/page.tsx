"use client";

import type { LearnerMode } from "@crambly/types";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConceptGraphView } from "@/components/ConceptGraphView";
import { FormulaAnnotationBlock } from "@/components/FormulaAnnotationBlock";
import { MathRichText } from "@/components/MathRichText";
import { WorkedExampleCard } from "@/components/WorkedExampleCard";
import type { ConceptCatalogItem, MemePipelineResponse, StudyTransformSection } from "@/lib/api";
import { postAudioClipMeta, postMeme, postTransform, postTts } from "@/lib/api";

function readMode(): LearnerMode {
  if (typeof window === "undefined") return "adhd";
  const m = localStorage.getItem("crambly_mode") as LearnerMode | null;
  const allowed: LearnerMode[] = ["adhd", "visual", "global_scholar", "audio", "exam_cram"];
  return m && allowed.includes(m) ? m : "adhd";
}

function readDial(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const d = localStorage.getItem("crambly_complexity");
  if (!d) return undefined;
  return Number(d) / 100;
}

function normalizeSections(raw: unknown): StudyTransformSection[] {
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
    return {
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
  });
}

export default function StudyPage() {
  const params = useParams<{ uploadId: string }>();
  const uploadId = params.uploadId;

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [meme, setMeme] = useState<Record<string, string> | null>(null);
  const [busyAudio, setBusyAudio] = useState(false);
  const [busyMeme, setBusyMeme] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [mode, setMode] = useState<LearnerMode>("adhd");
  const [dial, setDial] = useState<number | undefined>(undefined);

  useEffect(() => {
    setMode(readMode());
    setDial(readDial());
  }, [uploadId]);

  const q = useQuery({
    queryKey: ["transform", uploadId, mode, dial],
    queryFn: () => postTransform(uploadId, mode, dial),
    enabled: Boolean(uploadId),
  });

  const sections = useMemo(() => normalizeSections(q.data?.sections), [q.data?.sections]);
  const catalog = useMemo(
    (): ConceptCatalogItem[] => q.data?.concepts_catalog ?? [],
    [q.data?.concepts_catalog],
  );
  const selectedConcept = useMemo(() => {
    if (!selectedNodeId) return null;
    return catalog.find((c) => c.id === selectedNodeId) ?? null;
  }, [catalog, selectedNodeId]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function onAudio() {
    if (!q.data?.summary) return;
    setBusyAudio(true);
    try {
      const { audio_base64, mime } = await postTts(q.data.summary.slice(0, 2400));
      const blob = await fetch(`data:${mime};base64,${audio_base64}`).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      void postAudioClipMeta({
        title: q.data?.key_terms?.[0] ? `${q.data.key_terms[0]} explainer` : "Concept explainer",
        transcript: q.data?.summary?.slice(0, 4000) || "",
      }).catch(() => {});
    } finally {
      setBusyAudio(false);
    }
  }

  async function onMeme(reimagine: boolean) {
    setBusyMeme(true);
    try {
      const title = q.data?.key_terms?.[0] || "Concept recap";
      const summary = q.data?.summary || "";
      const res = await postMeme(title, summary, {
        reimagine,
        priorBrief: reimagine ? meme?.brief ?? null : null,
      });
      setMeme(res);
    } finally {
      setBusyMeme(false);
    }
  }

  const memeImageSrc =
    meme?.image_url ??
    (meme?.image_base64 && meme.mime
      ? `data:${meme.mime};base64,${meme.image_base64}`
      : null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Study deck</h1>
        <p className="mt-2 text-slate-400">
          Mode <span className="text-indigo-200">{mode}</span> · STEM view: graph first, then text, math, and
          worked examples.
        </p>
      </div>

      {q.isLoading && (
        <div className="flex items-center gap-3 text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Transforming with Gemini…
        </div>
      )}
      {q.isError && <p className="text-rose-400">Transform failed. Check API keys and backend logs.</p>}

      {q.data && (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-white">Concept relationships</h2>
            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(260px,320px)]">
              <ConceptGraphView
                graph={q.data.concept_graph ?? null}
                selectedId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
              <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 lg:min-h-[200px]">
                {!selectedConcept && (
                  <p className="text-sm text-slate-500">Select a node to see its summary and how it connects.</p>
                )}
                {selectedConcept && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Concept</p>
                    <h3 className="text-lg font-semibold text-white">{selectedConcept.title}</h3>
                    <div className="text-sm text-slate-300">
                      <MathRichText text={selectedConcept.summary} />
                    </div>
                    {selectedConcept.has_math && (
                      <span className="inline-block rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-200">
                        Math-heavy
                      </span>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Summary</h2>
            <div className="mt-3 text-slate-200">
              <MathRichText text={q.data.summary} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busyAudio}
                onClick={() => void onAudio()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {busyAudio ? "Generating audio…" : "Generate Audio"}
              </button>
              <button
                type="button"
                disabled={busyMeme}
                onClick={() => void onMeme(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
              >
                {busyMeme ? "Generating…" : "Generate Meme Recap"}
              </button>
              <button
                type="button"
                disabled={busyMeme}
                onClick={() => void onMeme(true)}
                className="rounded-lg border border-fuchsia-500/50 bg-fuchsia-500/10 px-4 py-2 text-sm font-semibold text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:opacity-50"
              >
                {busyMeme ? "Reimagining…" : "✨ AI Reimagine"}
              </button>
            </div>
            {audioUrl && (
              <audio className="mt-4 w-full" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            )}
          </section>

          {meme && memeImageSrc && (
            <div className="rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-6">
              <p className="text-xs uppercase tracking-widest text-fuchsia-200">Meme recap</p>
              <p className="mt-1 text-xs text-slate-400">
                Template: <span className="text-slate-300">{meme.brief.template}</span> · Source:{" "}
                <span className="text-slate-300">{meme.source}</span>
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={memeImageSrc}
                alt="Study meme"
                className="mt-4 max-h-[480px] w-full max-w-lg rounded-lg border border-slate-700 object-contain"
              />
              {(meme.brief.top_text || meme.brief.bottom_text) && (
                <div className="mt-3 text-sm text-slate-300">
                  {meme.brief.top_text ? <p className="font-semibold text-white">{meme.brief.top_text}</p> : null}
                  {meme.brief.bottom_text ? <p className="mt-1">{meme.brief.bottom_text}</p> : null}
                </div>
              )}
            </div>
          )}

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Concept map (text)</h2>
            <div className="mt-3 font-sans text-sm text-slate-200">
              <MathRichText text={q.data.concept_map} className="whitespace-pre-wrap" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Key terms</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-200">
              {(q.data.key_terms ?? []).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          {sections.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Sections & practice</h2>
              {sections.map((s, idx) => (
                <div key={`${s.header}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <h3 className="font-semibold text-indigo-200">
                    <MathRichText text={s.header} />
                  </h3>
                  <div className="mt-2 text-slate-200">
                    <MathRichText text={s.body} />
                  </div>
                  <WorkedExampleCard example={s.worked_example} />
                  {s.has_math &&
                    s.formula_annotation &&
                    (s.formula_annotation.formula.trim() || (s.formula_annotation.terms?.length ?? 0) > 0) && (
                      <FormulaAnnotationBlock
                        formula={s.formula_annotation.formula}
                        terms={s.formula_annotation.terms ?? []}
                      />
                    )}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
