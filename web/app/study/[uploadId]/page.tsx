"use client";

import type { LearnerMode } from "@crambly/types";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConceptGraphView } from "@/components/ConceptGraphView";
import { FormulaAnnotationBlock } from "@/components/FormulaAnnotationBlock";
import { AudioPlayer } from "@/components/games/AudioPlayer";
import { GameShimmer } from "@/components/games/GameShimmer";
import { MemeCard } from "@/components/games/MemeCard";
import { PuzzleMatch } from "@/components/games/PuzzleMatch";
import { QuizBurst } from "@/components/games/QuizBurst";
import { Wordle } from "@/components/games/Wordle";
import { YouTubeSuggestions } from "@/components/games/YouTubeSuggestions";
import { MathRichText } from "@/components/MathRichText";
import { WorkedExampleCard } from "@/components/WorkedExampleCard";
import type { ConceptCatalogItem, MemePipelineResponse, StudyDeckRow, StudyDeckTasksStatus, StudyTransformSection } from "@/lib/api";
import {
  deleteStudyDeck,
  fetchConceptsByUpload,
  fetchMemeRecap,
  fetchQuizBurstForUpload,
  fetchStudyDeck,
  fetchUploadMeta,
  parseStoredMemeRecap,
  postAudioClipMeta,
  postDeckGenerate,
  postMeme,
  postTransform,
  postTts,
  putMemeRecap,
} from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase";

type StudyUIMode = "chill" | "grind";

const DECK_TASKS = ["meme", "audio", "wordle", "puzzle", "youtube"] as const;

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

function taskPending(ts: StudyDeckTasksStatus | null | undefined, key: (typeof DECK_TASKS)[number]): boolean {
  const v = ts?.[key];
  return v !== "done" && v !== "error";
}

function deckNeedsPolling(row: StudyDeckRow | null | undefined): boolean {
  if (!row) return false;
  return DECK_TASKS.some((k) => taskPending(row.tasks_status, k));
}

export default function StudyPage() {
  const params = useParams<{ uploadId: string }>();
  const uploadId = params.uploadId;
  const queryClient = useQueryClient();

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [meme, setMeme] = useState<MemePipelineResponse | null>(null);
  const [busyAudio, setBusyAudio] = useState(false);
  const [busyMeme, setBusyMeme] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [mode, setMode] = useState<LearnerMode>("adhd");
  const [dial, setDial] = useState<number | undefined>(undefined);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [studyUIMode, setStudyUIMode] = useState<StudyUIMode>("grind");
  const [deckKickBusy, setDeckKickBusy] = useState(false);
  const [deckDeleteBusy, setDeckDeleteBusy] = useState(false);

  useEffect(() => {
    if (!uploadId) return;
    setPrefsLoaded(false);

    const fallbackMode = readMode();
    const fallbackDial = readDial();
    let cancelled = false;

    void fetchUploadMeta(uploadId)
      .then((meta) => {
        if (cancelled) return;

        const allowed: LearnerMode[] = ["adhd", "visual", "global_scholar", "audio", "exam_cram"];
        const savedMode = meta.learner_mode as LearnerMode | null;
        setMode(savedMode && allowed.includes(savedMode) ? savedMode : fallbackMode);
        setDial(typeof meta.complexity_dial === "number" ? meta.complexity_dial : fallbackDial);
      })
      .catch(() => {
        if (cancelled) return;
        setMode(fallbackMode);
        setDial(fallbackDial);
      })
      .finally(() => {
        if (cancelled) return;
        setPrefsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  useEffect(() => {
    if (!uploadId) return;
    let cancelled = false;
    void fetchMemeRecap(uploadId)
      .then(({ meme_recap }) => {
        const parsed = parseStoredMemeRecap(meme_recap);
        if (!cancelled) setMeme(parsed);
      })
      .catch(() => {
        if (!cancelled) setMeme(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  const q = useQuery({
    queryKey: ["transform", uploadId, mode, dial],
    queryFn: () => postTransform(uploadId, mode, dial),
    enabled: Boolean(uploadId) && prefsLoaded,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  const deckQ = useQuery({
    queryKey: ["studyDeck", uploadId],
    queryFn: () => fetchStudyDeck(uploadId!),
    enabled: Boolean(uploadId),
    refetchInterval: (query) => {
      const row = query.state.data as StudyDeckRow | null | undefined;
      const supabaseConfigured = Boolean(getSupabaseBrowser());
      if (supabaseConfigured || !deckNeedsPolling(row)) return false;
      return 4000;
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["concepts", uploadId],
    queryFn: () => fetchConceptsByUpload(uploadId!),
    enabled: Boolean(uploadId) && Boolean(q.data),
  });

  const quizQ = useQuery({
    queryKey: ["quizBurst", uploadId],
    queryFn: () => fetchQuizBurstForUpload(uploadId!),
    enabled: Boolean(uploadId) && Boolean(q.data) && studyUIMode === "grind",
    staleTime: 1000 * 60 * 15,
  });

  const invalidateDeck = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studyDeck", uploadId] });
  }, [queryClient, uploadId]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !uploadId) return;
    const channel = sb
      .channel(`study_deck:${uploadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_deck",
          filter: `upload_id=eq.${uploadId}`,
        },
        () => invalidateDeck(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [uploadId, invalidateDeck]);

  const sections = useMemo(() => normalizeSections(q.data?.sections), [q.data?.sections]);
  const catalog = useMemo(
    (): ConceptCatalogItem[] => q.data?.concepts_catalog ?? [],
    [q.data?.concepts_catalog],
  );
  const selectedConcept = useMemo(() => {
    if (!selectedNodeId) return null;
    return catalog.find((c) => c.id === selectedNodeId) ?? null;
  }, [catalog, selectedNodeId]);

  const conceptHints = useMemo(
    () =>
      (conceptsQ.data ?? []).map((c) => ({
        term: c.title,
        definition: c.summary,
      })),
    [conceptsQ.data],
  );

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
      void putMemeRecap(uploadId, res).catch(() => {});
    } finally {
      setBusyMeme(false);
    }
  }

  async function onKickDeck() {
    if (!uploadId) return;
    setDeckKickBusy(true);
    try {
      await postDeckGenerate(uploadId);
      await invalidateDeck();
    } finally {
      setDeckKickBusy(false);
    }
  }

  async function onDeleteDeck() {
    if (!uploadId) return;
    if (
      !window.confirm(
        "Delete this upload’s study deck row (meme, audio, games data)? The lecture and concepts stay; you can regenerate the deck later.",
      )
    ) {
      return;
    }
    setDeckDeleteBusy(true);
    try {
      await deleteStudyDeck(uploadId);
      await invalidateDeck();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not delete study deck");
    } finally {
      setDeckDeleteBusy(false);
    }
  }

  const memeImageSrc =
    meme?.image_url ??
    (meme?.image_base64 && meme.mime
      ? `data:${meme.mime};base64,${meme.image_base64}`
      : null);

  const deck = deckQ.data ?? undefined;
  const ts = deck?.tasks_status;

  const memeTitle = q.data?.key_terms?.[0] || "Study recap";
  const memeTone = meme?.brief?.template || "Custom";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Study deck</h1>
        <p className="mt-2 text-slate-400">
          Learner mode <span className="text-indigo-200">{mode}</span> · STEM view with summary, graph, games, and
          practice blocks.
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
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-2">
            <span className="px-2 text-sm text-slate-500">Deck mode</span>
            {(["grind", "chill"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStudyUIMode(m)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                  studyUIMode === m
                    ? "bg-indigo-500 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {m === "grind" ? "Grind Mode" : "Chill Mode"}
              </button>
            ))}
          </div>

          {deckQ.isError && (
            <p className="text-sm text-amber-200/90">
              Study deck row unavailable (apply the latest Supabase migration including{" "}
              <code className="text-indigo-200">study_deck</code>).
            </p>
          )}

          {deckQ.data === null && !deckQ.isError && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
              <p>Background study assets have not been queued yet for this upload.</p>
              <button
                type="button"
                disabled={deckKickBusy}
                onClick={() => void onKickDeck()}
                className="mt-3 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {deckKickBusy ? "Starting…" : "Generate study deck tasks"}
              </button>
            </div>
          )}

          {deck && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
              <span className="text-slate-300">Study deck data is stored for this upload.</span>{" "}
              <button
                type="button"
                disabled={deckDeleteBusy}
                onClick={() => void onDeleteDeck()}
                className="ml-2 font-semibold text-rose-400 underline decoration-rose-400/50 hover:text-rose-300 disabled:opacity-50"
              >
                {deckDeleteBusy ? "Deleting…" : "Delete study deck"}
              </button>
            </div>
          )}

          {studyUIMode === "chill" && deckQ.isLoading && (
            <div className="space-y-6">
              <GameShimmer label="Meme loading" />
              <GameShimmer label="Audio loading" />
              <GameShimmer label="YouTube suggestions" />
            </div>
          )}

          {studyUIMode === "chill" && deck && (
            <div className="space-y-6">
              {taskPending(ts, "meme") ? (
                <GameShimmer label="Meme loading" />
              ) : ts?.meme === "error" ? (
                <p className="text-sm text-rose-400">Meme task failed.</p>
              ) : deck.meme_image_url ? (
                <MemeCard
                  uploadId={uploadId!}
                  imageUrl={deck.meme_image_url}
                  title={memeTitle}
                  tone={memeTone}
                  onUpdated={() => invalidateDeck()}
                />
              ) : null}

              {taskPending(ts, "audio") ? (
                <GameShimmer label="Audio loading" />
              ) : ts?.audio === "error" ? (
                <p className="text-sm text-rose-400">Audio task failed (check ElevenLabs key).</p>
              ) : deck.audio_url && deck.audio_transcript ? (
                <AudioPlayer audioUrl={deck.audio_url} transcript={deck.audio_transcript} />
              ) : null}

              {taskPending(ts, "youtube") ? (
                <GameShimmer label="YouTube suggestions" />
              ) : ts?.youtube === "error" ? (
                <p className="text-sm text-rose-400">YouTube suggestions failed (set YOUTUBE_API_KEY).</p>
              ) : deck.youtube_suggestions && deck.youtube_suggestions.length > 0 ? (
                <YouTubeSuggestions suggestions={deck.youtube_suggestions} />
              ) : null}
            </div>
          )}

          {studyUIMode === "grind" && deckQ.isLoading && (
            <div className="space-y-6">
              <GameShimmer label="Word bank" />
              <GameShimmer label="Puzzle pairs" />
              <GameShimmer label="Quiz burst" />
            </div>
          )}

          {studyUIMode === "grind" && deck && (
            <div className="space-y-6">
              {taskPending(ts, "wordle") ? (
                <GameShimmer label="Word bank" />
              ) : ts?.wordle === "error" ? (
                <p className="text-sm text-rose-400">Word bank task failed.</p>
              ) : deck.word_bank && deck.word_bank.length > 0 ? (
                <Wordle wordBank={deck.word_bank} conceptHints={conceptHints} />
              ) : (
                <p className="text-sm text-slate-400">Word bank is empty.</p>
              )}

              {taskPending(ts, "puzzle") ? (
                <GameShimmer label="Puzzle pairs" />
              ) : ts?.puzzle === "error" ? (
                <p className="text-sm text-rose-400">Puzzle task failed.</p>
              ) : deck.puzzle_pairs && deck.puzzle_pairs.length > 0 ? (
                <PuzzleMatch pairs={deck.puzzle_pairs} />
              ) : null}

              {quizQ.isLoading ? (
                <GameShimmer label="Quiz burst" />
              ) : quizQ.isError ? (
                <p className="text-sm text-rose-400">Quiz burst could not load.</p>
              ) : (
                <QuizBurst questions={quizQ.data?.questions ?? []} />
              )}
            </div>
          )}

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
