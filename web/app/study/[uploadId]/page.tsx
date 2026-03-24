"use client";

import type { LearnerMode } from "@crambly/types";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ConceptCatalogItem, MemePipelineResponse, StudyDeckRow, StudyDeckTasksStatus, StudyTransformSection } from "@/lib/api";
import {
  deleteStudyDeck,
  fetchConceptsByUpload,
  fetchMemeRecap,
  fetchQuizBurstForUpload,
  fetchStudyDeck,
  fetchUploadMeta,
  fetchUploads,
  parseStoredMemeRecap,
  postAudioClipMeta,
  postDeckGenerate,
  postMeme,
  postTransform,
  postTts,
  putMemeRecap,
} from "@/lib/api";
import { pushActivity } from "@/lib/localActivity";
import { recordStudySession } from "@/lib/localSessions";
import { getSupabaseBrowser } from "@/lib/supabase";

type StudyUIMode = "chill" | "grind";

const DECK_TASKS = ["meme", "audio", "wordle", "puzzle", "youtube"] as const;

const MODE_LABELS: Record<LearnerMode, string> = {
  adhd: "ADHD Mode",
  visual: "Visual Mode",
  global_scholar: "Global Scholar",
  audio: "Audio Mode",
  exam_cram: "Exam Cram",
};

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

function DeckTaskStatus({ pending, error }: { pending: boolean; error: boolean }) {
  if (pending) {
    return (
      <span className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent-cyan)] border-t-transparent"
          aria-hidden
        />
        Generating…
      </span>
    );
  }
  if (error) {
    return (
      <span className="flex items-center gap-2 text-xs text-[var(--color-danger)]">
        <span className="h-2 w-2 rounded-full bg-[var(--color-danger)]" aria-hidden />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-[var(--color-success)]">
      <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden />
      Ready
    </span>
  );
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

  const uploadsQ = useQuery({ queryKey: ["uploads"], queryFn: fetchUploads, enabled: Boolean(uploadId) });
  const uploadRow = useMemo(() => uploadsQ.data?.find((u) => u.id === uploadId), [uploadsQ.data, uploadId]);

  const burstWordleWin = useCallback(() => {
    void confetti({
      particleCount: 55,
      spread: 68,
      origin: { y: 0.72 },
      colors: ["#00d9ff", "#7ee787", "#a371f7", "#f778ba"],
    });
  }, []);

  useEffect(() => {
    if (!uploadId || !uploadRow?.file_name) return;
    recordStudySession();
    pushActivity("study", `Opened study deck for ${uploadRow.file_name}`);
  }, [uploadId, uploadRow?.file_name]);

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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <header className="flex flex-wrap items-start gap-3 border-b border-[var(--color-border-default)] pb-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {uploadRow?.course_code ? (
              <Badge variant="info">{uploadRow.course_code}</Badge>
            ) : uploadRow?.course_id ? (
              <Badge variant="neutral">Course linked</Badge>
            ) : null}
            <Badge variant="neutral">{MODE_LABELS[mode]}</Badge>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] md:text-3xl">
            {uploadRow?.file_name ?? "Study deck"}
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            STEM view · summary, concept graph, deck games, and practice blocks.
          </p>
        </div>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent-cyan)] border-t-transparent" />
          Transforming with Gemini…
        </div>
      )}
      {q.isError && <p className="text-[var(--color-danger)]">Transform failed. Check API keys and backend logs.</p>}

      {q.data && (
        <div className="space-y-10">
          <div className="relative flex rounded-full bg-[var(--color-bg-tertiary)] p-1 sm:max-w-md">
            {(["grind", "chill"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStudyUIMode(m)}
                className={`relative z-10 flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors ${
                  studyUIMode === m ? "text-[var(--color-accent-cyan)]" : "text-[var(--color-text-secondary)]"
                }`}
              >
                {studyUIMode === m && (
                  <motion.span
                    layoutId="study-deck-segment"
                    className="absolute inset-0 rounded-full bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)]"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
                  />
                )}
                <span className="relative z-10">{m === "grind" ? "Grind" : "Chill"}</span>
              </button>
            ))}
          </div>

          {deckQ.isError && (
            <p className="text-sm text-[var(--color-warning)]">
              Study deck row unavailable (apply the latest Supabase migration including{" "}
              <code className="font-mono text-[var(--color-accent-cyan)]">study_deck</code>).
            </p>
          )}

          {deckQ.data === null && !deckQ.isError && (
            <Card>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Background study assets have not been queued yet for this upload.
              </p>
              <Button
                type="button"
                variant="primary"
                className="mt-4"
                disabled={deckKickBusy}
                loading={deckKickBusy}
                onClick={() => void onKickDeck()}
              >
                Generate study deck tasks
              </Button>
            </Card>
          )}

          {deck && (
            <Card className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <span className="text-[var(--color-text-primary)]">Study deck data is stored for this upload.</span>
              <Button type="button" variant="danger" disabled={deckDeleteBusy} loading={deckDeleteBusy} onClick={() => void onDeleteDeck()}>
                Delete study deck
              </Button>
            </Card>
          )}

          <div key={studyUIMode} className="space-y-6">
            {studyUIMode === "chill" && deckQ.isLoading && (
              <div className="space-y-6">
                <GameShimmer label="Meme loading" />
                <GameShimmer label="Audio loading" />
                <GameShimmer label="YouTube suggestions" />
              </div>
            )}

            {studyUIMode === "chill" && deck && (
              <>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0 }}>
                  <Card hoverable glow className="relative">
                    <div className="absolute right-4 top-4 z-10">
                      <DeckTaskStatus pending={taskPending(ts, "meme")} error={ts?.meme === "error"} />
                    </div>
                    {taskPending(ts, "meme") ? (
                      <GameShimmer label="Meme loading" />
                    ) : ts?.meme === "error" ? (
                      <p className="text-sm text-[var(--color-danger)]">Meme task failed.</p>
                    ) : deck.meme_image_url ? (
                      <MemeCard
                        uploadId={uploadId!}
                        imageUrl={deck.meme_image_url}
                        title={memeTitle}
                        tone={memeTone}
                        onUpdated={() => invalidateDeck()}
                      />
                    ) : null}
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
                  <Card hoverable glow className="relative">
                    <div className="absolute right-4 top-4 z-10">
                      <DeckTaskStatus pending={taskPending(ts, "audio")} error={ts?.audio === "error"} />
                    </div>
                    {taskPending(ts, "audio") ? (
                      <GameShimmer label="Audio loading" />
                    ) : ts?.audio === "error" ? (
                      <p className="text-sm text-[var(--color-danger)]">Audio task failed (check ElevenLabs key).</p>
                    ) : deck.audio_url && deck.audio_transcript ? (
                      <AudioPlayer audioUrl={deck.audio_url} transcript={deck.audio_transcript} />
                    ) : null}
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.2 }}>
                  <Card hoverable glow className="relative">
                    <div className="absolute right-4 top-4 z-10">
                      <DeckTaskStatus pending={taskPending(ts, "youtube")} error={ts?.youtube === "error"} />
                    </div>
                    {taskPending(ts, "youtube") ? (
                      <GameShimmer label="YouTube suggestions" />
                    ) : ts?.youtube === "error" ? (
                      <p className="text-sm text-[var(--color-danger)]">YouTube suggestions failed (set YOUTUBE_API_KEY).</p>
                    ) : deck.youtube_suggestions && deck.youtube_suggestions.length > 0 ? (
                      <YouTubeSuggestions suggestions={deck.youtube_suggestions} />
                    ) : null}
                  </Card>
                </motion.div>
              </>
            )}

            {studyUIMode === "grind" && deckQ.isLoading && (
              <div className="space-y-6">
                <GameShimmer label="Word bank" />
                <GameShimmer label="Puzzle pairs" />
                <GameShimmer label="Quiz burst" />
              </div>
            )}

            {studyUIMode === "grind" && deck && (
              <>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0 }}>
                  <Card hoverable glow className="relative">
                    <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between gap-2">
                      <Badge variant="info">Grind Mode</Badge>
                      <DeckTaskStatus pending={taskPending(ts, "wordle")} error={ts?.wordle === "error"} />
                    </div>
                    <div className="pt-8">
                      {taskPending(ts, "wordle") ? (
                        <GameShimmer label="Word bank" />
                      ) : ts?.wordle === "error" ? (
                        <p className="text-sm text-[var(--color-danger)]">Word bank task failed.</p>
                      ) : deck.word_bank && deck.word_bank.length > 0 ? (
                        <Wordle wordBank={deck.word_bank} conceptHints={conceptHints} onWin={burstWordleWin} />
                      ) : (
                        <p className="text-sm text-[var(--color-text-muted)]">Word bank is empty.</p>
                      )}
                    </div>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
                  <Card hoverable glow className="relative">
                    <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between gap-2">
                      <Badge variant="info">Grind Mode</Badge>
                      <DeckTaskStatus pending={taskPending(ts, "puzzle")} error={ts?.puzzle === "error"} />
                    </div>
                    <div className="pt-8">
                      {taskPending(ts, "puzzle") ? (
                        <GameShimmer label="Puzzle pairs" />
                      ) : ts?.puzzle === "error" ? (
                        <p className="text-sm text-[var(--color-danger)]">Puzzle task failed.</p>
                      ) : deck.puzzle_pairs && deck.puzzle_pairs.length > 0 ? (
                        <PuzzleMatch pairs={deck.puzzle_pairs} />
                      ) : null}
                    </div>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.2 }}>
                  <Card hoverable glow className="relative">
                    <div className="absolute right-4 top-4 z-10">
                      <DeckTaskStatus pending={quizQ.isLoading} error={quizQ.isError} />
                    </div>
                    <div className="pt-8">
                      {quizQ.isLoading ? (
                        <GameShimmer label="Quiz burst" />
                      ) : quizQ.isError ? (
                        <p className="text-sm text-[var(--color-danger)]">Quiz burst could not load.</p>
                      ) : (
                        <QuizBurst questions={quizQ.data?.questions ?? []} />
                      )}
                    </div>
                  </Card>
                </motion.div>
              </>
            )}
          </div>

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Summary</h2>
            <div className="mt-3 text-[var(--color-text-primary)]">
              <MathRichText text={q.data.summary} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="primary" disabled={busyAudio} loading={busyAudio} onClick={() => void onAudio()}>
                Generate Audio
              </Button>
              <Button type="button" variant="secondary" disabled={busyMeme} loading={busyMeme} onClick={() => void onMeme(false)}>
                Generate Meme Recap
              </Button>
              <Button type="button" variant="ghost" disabled={busyMeme} loading={busyMeme} onClick={() => void onMeme(true)}>
                ✨ Regenerate meme (new theme)
              </Button>
            </div>
            {audioUrl && (
              <audio className="mt-4 w-full" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--color-text-primary)]">Concept relationships</h2>
            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(260px,320px)]">
              <ConceptGraphView
                graph={q.data.concept_graph ?? null}
                selectedId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
              />
              <aside className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 lg:min-h-[200px]">
                {!selectedConcept && (
                  <p className="text-sm text-[var(--color-text-muted)]">Select a node to see its summary and how it connects.</p>
                )}
                {selectedConcept && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-cyan)]">Concept</p>
                    <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{selectedConcept.title}</h3>
                    <div className="text-sm text-[var(--color-text-secondary)]">
                      <MathRichText text={selectedConcept.summary} />
                    </div>
                    {selectedConcept.has_math && (
                      <span className="inline-block rounded-full bg-[var(--color-accent-cyan)]/20 px-2 py-0.5 text-xs text-[var(--color-accent-cyan)]">
                        Math-heavy
                      </span>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </section>

          {meme && memeImageSrc && (
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-accent-pink)]/35 bg-[var(--color-bg-secondary)] p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs uppercase tracking-widest text-[var(--color-accent-pink)]">Meme recap (local)</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Template: <span className="text-[var(--color-text-secondary)]">{meme.brief.template}</span> · Source:{" "}
                <span className="text-[var(--color-text-secondary)]">{meme.source}</span>
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={memeImageSrc}
                alt="Study meme"
                className="mt-4 max-h-[480px] w-full max-w-lg rounded-[var(--radius-md)] border border-[var(--color-border-default)] object-contain"
              />
              {(meme.brief.top_text || meme.brief.bottom_text) && (
                <div className="mt-3 text-sm text-[var(--color-text-secondary)]">
                  {meme.brief.top_text ? <p className="font-semibold text-[var(--color-text-primary)]">{meme.brief.top_text}</p> : null}
                  {meme.brief.bottom_text ? <p className="mt-1">{meme.brief.bottom_text}</p> : null}
                </div>
              )}
            </section>
          )}

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Concept map (text)</h2>
            <div className="mt-3 text-sm text-[var(--color-text-primary)]">
              <MathRichText text={q.data.concept_map} className="whitespace-pre-wrap" />
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Key terms</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[var(--color-text-primary)]">
              {(q.data.key_terms ?? []).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          {sections.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Sections & practice</h2>
              {sections.map((s, idx) => (
                <div
                  key={`${s.header}-${idx}`}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]/80 p-5"
                >
                  <h3 className="font-semibold text-[var(--color-accent-cyan)]">
                    <MathRichText text={s.header} />
                  </h3>
                  <div className="mt-2 text-[var(--color-text-primary)]">
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
    </motion.div>
  );
}
