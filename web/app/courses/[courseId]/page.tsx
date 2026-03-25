"use client";

import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioPlayer } from "@/components/games/AudioPlayer";
import { GameShimmer } from "@/components/games/GameShimmer";
import { MemeCard } from "@/components/games/MemeCard";
import { PuzzleMatch } from "@/components/games/PuzzleMatch";
import { Wordle } from "@/components/games/Wordle";
import { YouTubeSuggestions } from "@/components/games/YouTubeSuggestions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  deleteCourse,
  deleteUpload,
  fetchConceptsByUpload,
  fetchCourseAggregate,
  fetchCourseUploads,
  fetchMemeRecap,
  fetchStudyDeck,
  parseStoredMemeRecap,
  type PriorityCard,
  type StudyDeckRow,
  type StudyDeckTasksStatus,
} from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase";

const DECK_TASKS = ["meme", "audio", "wordle", "puzzle", "youtube"] as const;

function taskPending(ts: StudyDeckTasksStatus | null | undefined, key: (typeof DECK_TASKS)[number]): boolean {
  const v = ts?.[key];
  return v !== "done" && v !== "error";
}

function deckNeedsPolling(row: StudyDeckRow | null | undefined): boolean {
  if (!row) return false;
  return DECK_TASKS.some((k) => taskPending(row.tasks_status, k));
}

type Tab = "overview" | "wordle" | "puzzle" | "meme" | "audio";

function tierStyles(tier: string) {
  if (tier === "high") return "border-[var(--color-danger)]/45 bg-[var(--color-danger)]/10";
  if (tier === "medium") return "border-[var(--color-warning)]/45 bg-[var(--color-warning)]/10";
  return "border-[var(--color-success)]/40 bg-[var(--color-success)]/10";
}

export default function CourseHubPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const qc = useQueryClient();

  const burstWordleWin = useCallback(() => {
    void confetti({
      particleCount: 50,
      spread: 64,
      origin: { y: 0.72 },
      colors: ["#00d9ff", "#7ee787", "#a371f7"],
    });
  }, []);

  const delCourseMut = useMutation({
    mutationFn: () => deleteCourse(courseId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["courses"] });
      router.push("/courses");
    },
  });

  const delUploadMut = useMutation({
    mutationFn: (uploadId: string) => deleteUpload(uploadId),
    onSuccess: (_data, uploadId) => {
      void qc.invalidateQueries({ queryKey: ["courseUploads", courseId] });
      void qc.invalidateQueries({ queryKey: ["courseAggregate", courseId] });
      void qc.invalidateQueries({ queryKey: ["uploads"] });
      setSelectedId((prev) => (prev === uploadId ? null : prev));
    },
  });

  const agg = useQuery({
    queryKey: ["courseAggregate", courseId],
    queryFn: () => fetchCourseAggregate(courseId!),
    enabled: Boolean(courseId),
  });

  const uploadsQ = useQuery({
    queryKey: ["courseUploads", courseId],
    queryFn: () => fetchCourseUploads(courseId!),
    enabled: Boolean(courseId),
  });

  const uploads = useMemo(() => uploadsQ.data ?? [], [uploadsQ.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (uploads.length === 0) return;
    setSelectedId((prev) => {
      if (prev && uploads.some((u) => u.id === prev)) return prev;
      return uploads[0]!.id;
    });
  }, [uploads]);

  const [tab, setTab] = useState<Tab>("overview");

  const deckQ = useQuery({
    queryKey: ["studyDeck", selectedId],
    queryFn: () => fetchStudyDeck(selectedId!),
    enabled: Boolean(selectedId) && tab !== "overview",
    refetchInterval: (query) => {
      const row = query.state.data as StudyDeckRow | null | undefined;
      const supabaseConfigured = Boolean(getSupabaseBrowser());
      if (supabaseConfigured || !deckNeedsPolling(row)) return false;
      return 4000;
    },
  });

  const conceptsQ = useQuery({
    queryKey: ["concepts", selectedId],
    queryFn: () => fetchConceptsByUpload(selectedId!),
    enabled: Boolean(selectedId) && tab === "wordle",
  });

  const memeRecapQ = useQuery({
    queryKey: ["memeRecap", selectedId],
    queryFn: () => fetchMemeRecap(selectedId!).then((r) => parseStoredMemeRecap(r.meme_recap)),
    enabled: Boolean(selectedId) && tab === "meme",
  });

  const invalidateDeck = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["studyDeck", selectedId] });
  }, [qc, selectedId]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !selectedId) return;
    const channel = sb
      .channel(`study_deck:hub:${selectedId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_deck", filter: `upload_id=eq.${selectedId}` },
        () => invalidateDeck(),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [selectedId, invalidateDeck]);

  const course = agg.data?.course;

  const conceptHints = useMemo(
    () =>
      (conceptsQ.data ?? []).map((c) => ({
        term: c.title,
        definition: c.summary,
      })),
    [conceptsQ.data],
  );

  const deck = deckQ.data ?? undefined;
  const ts = deck?.tasks_status;
  const memeMeta = memeRecapQ.data;

  if (!courseId) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/courses"
            className="text-sm font-medium text-[var(--color-accent-cyan)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)]"
          >
            ← All courses
          </Link>
          {agg.isLoading && <p className="mt-2 text-[var(--color-text-secondary)]">Loading…</p>}
          {agg.isError && <p className="mt-2 text-[var(--color-danger)]">Course not found.</p>}
          {course && (
            <div
              className="mt-3 flex flex-wrap items-baseline gap-3 pl-3"
              style={{ borderLeft: `4px solid ${course.color || "#00d9ff"}` }}
            >
              <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{course.name}</h1>
              <span className="font-mono text-lg text-[var(--color-accent-cyan)]">{course.code}</span>
            </div>
          )}
        </div>
        {course && (
          <Button
            type="button"
            variant="danger"
            disabled={delCourseMut.isPending}
            loading={delCourseMut.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Delete course ${course.code}? Syllabus deadlines for this course are removed. Lectures stay in your library but are no longer linked to this course.`,
                )
              ) {
                return;
              }
              delCourseMut.mutate();
            }}
          >
            Delete course
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--color-border-default)] pb-2" role="tablist">
        {(
          [
            ["overview", "Overview"],
            ["wordle", "Wordle"],
            ["puzzle", "Puzzle Match"],
            ["meme", "Meme"],
            ["audio", "Audio"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`min-h-[44px] rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)] ${
              tab === k
                ? "bg-[var(--color-bg-elevated)] text-[var(--color-accent-cyan)] shadow-[var(--shadow-neon-cyan)]"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:w-56">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Lectures</p>
          {uploadsQ.isLoading && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Loading uploads…</p>}
          <ul className="mt-2 space-y-1">
            {uploads.map((u) => (
              <li key={u.id} className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className={`min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)] ${
                    selectedId === u.id
                      ? "border-[var(--color-accent-cyan)]/50 bg-[var(--color-accent-cyan)]/10 text-[var(--color-text-primary)]"
                      : "border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-default)]"
                  }`}
                >
                  <span className="line-clamp-2 font-medium">{u.file_name}</span>
                  <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete lecture ${u.file_name}`}
                  disabled={delUploadMut.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Permanently delete “${u.file_name}” and all its concepts? This cannot be undone.`,
                      )
                    ) {
                      return;
                    }
                    delUploadMut.mutate(u.id);
                  }}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {uploads.length === 0 && !uploadsQ.isLoading && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">No lectures in this course yet.</p>
          )}
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" && agg.data && (
            <div className="space-y-8">
              <Card>
                <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Key terms (all lectures)</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Merged from every concept title in this course.</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {agg.data.key_terms.slice(0, 80).map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1 text-sm text-[var(--color-text-primary)]"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
                {agg.data.key_terms.length === 0 && (
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">No terms yet — upload materials.</p>
                )}
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Upcoming assessments</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Parsed from the syllabus you attached to this course (deadline agent).
                </p>
                <div className="mt-4 grid gap-3">
                  {(agg.data.assessment_cards as PriorityCard[]).map((c) => (
                    <div key={c.assessment_id} className={`rounded-[var(--radius-md)] border p-4 ${tierStyles(c.tier)}`}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold text-[var(--color-text-primary)]">{c.name}</h3>
                        <span className="font-mono text-xs text-[var(--color-text-secondary)]">{c.priority_score.toFixed(3)}</span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        Due {c.due_date} · {(c.grade_weight * 100).toFixed(0)}% of grade
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-primary)]">{c.message}</p>
                    </div>
                  ))}
                </div>
                {agg.data.assessment_cards.length === 0 && (
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    No assessments — upload a syllabus with this course selected.
                  </p>
                )}
              </Card>

              <Card>
                <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Weak topics (this course)</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  From your Digital Twin, scoped to course <span className="text-[var(--color-accent-cyan)]">{course?.code}</span>.
                </p>
                {agg.data.weak_topics.length > 0 ? (
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-[var(--color-text-primary)]">
                    {agg.data.weak_topics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    No weak topics tracked for this course yet — take a quiz from a lecture in this course.
                  </p>
                )}
              </Card>

              <p className="text-center text-lg font-medium text-[var(--color-accent-cyan)]">
                Everything Crambly knows about this course, in one place.
              </p>
            </div>
          )}

          {tab !== "overview" && !selectedId && (
            <p className="text-[var(--color-text-secondary)]">Select a lecture from the sidebar to load its study deck.</p>
          )}

          {tab !== "overview" && selectedId && deckQ.isLoading && <GameShimmer label="Study deck" />}

          {tab !== "overview" && selectedId && !deckQ.isLoading && (
            <>
              {tab === "wordle" &&
                (taskPending(ts, "wordle") ? (
                  <GameShimmer label="Word bank" />
                ) : ts?.wordle === "error" ? (
                  <p className="text-[var(--color-danger)]">Wordle data unavailable.</p>
                ) : deck?.word_bank && deck.word_bank.length > 0 ? (
                  <Card hoverable glow>
                    <Wordle wordBank={deck.word_bank} conceptHints={conceptHints} onWin={burstWordleWin} />
                  </Card>
                ) : (
                  <p className="text-[var(--color-text-secondary)]">No word bank for this lecture.</p>
                ))}

              {tab === "puzzle" &&
                (taskPending(ts, "puzzle") ? (
                  <GameShimmer label="Puzzle pairs" />
                ) : ts?.puzzle === "error" ? (
                  <p className="text-[var(--color-danger)]">Puzzle data unavailable.</p>
                ) : deck?.puzzle_pairs && deck.puzzle_pairs.length > 0 ? (
                  <Card hoverable glow>
                    <PuzzleMatch pairs={deck.puzzle_pairs} />
                  </Card>
                ) : (
                  <p className="text-[var(--color-text-secondary)]">No puzzle pairs for this lecture.</p>
                ))}

              {tab === "meme" &&
                (taskPending(ts, "meme") ? (
                  <GameShimmer label="Meme" />
                ) : ts?.meme === "error" ? (
                  <p className="text-[var(--color-danger)]">Meme unavailable.</p>
                ) : deck?.meme_image_url ? (
                  <Card hoverable glow>
                    <MemeCard
                      imageUrl={deck.meme_image_url}
                      title={memeMeta?.brief?.top_text || uploads.find((u) => u.id === selectedId)?.file_name || "Recap"}
                      tone={memeMeta?.brief?.template || "Deck"}
                    />
                  </Card>
                ) : (
                  <p className="text-[var(--color-text-secondary)]">No meme for this lecture yet.</p>
                ))}

              {tab === "audio" && (
                <div className="space-y-6">
                  {taskPending(ts, "audio") ? (
                    <GameShimmer label="Audio" />
                  ) : ts?.audio === "error" ? (
                    <p className="text-[var(--color-danger)]">Audio unavailable.</p>
                  ) : deck?.audio_url && deck.audio_transcript ? (
                    <Card hoverable glow>
                      <AudioPlayer
                        audioUrl={deck.audio_url}
                        transcript={deck.audio_transcript}
                        audioProvider={deck.tasks_status?.audio_provider ?? null}
                      />
                    </Card>
                  ) : (
                    <p className="text-[var(--color-text-secondary)]">No audio summary for this lecture.</p>
                  )}
                  {taskPending(ts, "youtube") ? (
                    <GameShimmer label="YouTube" />
                  ) : ts?.youtube === "error" ? (
                    <p className="text-sm text-[var(--color-text-muted)]">YouTube suggestions unavailable.</p>
                  ) : deck?.youtube_suggestions && deck.youtube_suggestions.length > 0 ? (
                    <Card hoverable glow>
                      <YouTubeSuggestions suggestions={deck.youtube_suggestions} />
                    </Card>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
