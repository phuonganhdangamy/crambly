"use client";

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
  if (tier === "high") return "border-rose-500/50 bg-rose-500/10";
  if (tier === "medium") return "border-amber-500/50 bg-amber-500/10";
  return "border-emerald-500/40 bg-emerald-500/10";
}

export default function CourseHubPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();
  const qc = useQueryClient();

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
  const accent = course?.color || "#6366f1";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/courses" className="text-sm text-indigo-300 hover:text-indigo-200">
            ← All courses
          </Link>
          {agg.isLoading && <p className="mt-2 text-slate-400">Loading…</p>}
          {agg.isError && <p className="mt-2 text-rose-400">Course not found.</p>}
          {course && (
            <div
              className="mt-3 flex flex-wrap items-baseline gap-3 pl-3"
              style={{ borderLeft: `4px solid ${accent}` }}
            >
              <h1 className="text-3xl font-bold text-white">{course.name}</h1>
              <span className="font-mono text-lg text-indigo-200">{course.code}</span>
            </div>
          )}
        </div>
        {course && (
          <button
            type="button"
            disabled={delCourseMut.isPending}
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
            className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            {delCourseMut.isPending ? "Deleting…" : "Delete course"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2" role="tablist">
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
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === k ? "bg-indigo-500 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:w-56">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lectures</p>
          {uploadsQ.isLoading && <p className="mt-2 text-sm text-slate-400">Loading uploads…</p>}
          <ul className="mt-2 space-y-1">
            {uploads.map((u) => (
              <li key={u.id} className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-sm transition ${
                    selectedId === u.id
                      ? "border-indigo-500/60 bg-indigo-500/10 text-white"
                      : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span className="line-clamp-2 font-medium">{u.file_name}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  title="Delete lecture"
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
                  className="shrink-0 rounded-lg border border-slate-700 px-2 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {uploads.length === 0 && !uploadsQ.isLoading && (
            <p className="mt-2 text-sm text-slate-500">No lectures in this course yet.</p>
          )}
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          {tab === "overview" && agg.data && (
            <div className="space-y-8">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <h2 className="text-xl font-semibold text-white">Key terms (all lectures)</h2>
                <p className="mt-1 text-sm text-slate-500">Merged from every concept title in this course.</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {agg.data.key_terms.slice(0, 80).map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-sm text-slate-200"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
                {agg.data.key_terms.length === 0 && (
                  <p className="mt-2 text-sm text-slate-500">No terms yet — upload materials.</p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <h2 className="text-xl font-semibold text-white">Upcoming assessments</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Parsed from the syllabus you attached to this course (deadline agent).
                </p>
                <div className="mt-4 grid gap-3">
                  {(agg.data.assessment_cards as PriorityCard[]).map((c) => (
                    <div key={c.assessment_id} className={`rounded-xl border p-4 ${tierStyles(c.tier)}`}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold text-white">{c.name}</h3>
                        <span className="font-mono text-xs text-slate-300">{c.priority_score.toFixed(3)}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-200">
                        Due {c.due_date} · {(c.grade_weight * 100).toFixed(0)}% of grade
                      </p>
                      <p className="mt-2 text-sm text-slate-100">{c.message}</p>
                    </div>
                  ))}
                </div>
                {agg.data.assessment_cards.length === 0 && (
                  <p className="mt-2 text-sm text-slate-500">
                    No assessments — upload a syllabus with this course selected.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <h2 className="text-xl font-semibold text-white">Weak topics (this course)</h2>
                <p className="mt-1 text-sm text-slate-500">
                  From your Digital Twin, scoped to course <span className="text-indigo-200">{course?.code}</span>.
                </p>
                {agg.data.weak_topics.length > 0 ? (
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-slate-200">
                    {agg.data.weak_topics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No weak topics tracked for this course yet — take a quiz from a lecture in this course.
                  </p>
                )}
              </section>

              <p className="text-center text-lg font-medium text-indigo-200">
                Everything Crambly knows about this course, in one place.
              </p>
            </div>
          )}

          {tab !== "overview" && !selectedId && (
            <p className="text-slate-400">Select a lecture from the sidebar to load its study deck.</p>
          )}

          {tab !== "overview" && selectedId && deckQ.isLoading && <GameShimmer label="Study deck" />}

          {tab !== "overview" && selectedId && !deckQ.isLoading && (
            <>
              {tab === "wordle" &&
                (taskPending(ts, "wordle") ? (
                  <GameShimmer label="Word bank" />
                ) : ts?.wordle === "error" ? (
                  <p className="text-rose-400">Wordle data unavailable.</p>
                ) : deck?.word_bank && deck.word_bank.length > 0 ? (
                  <Wordle wordBank={deck.word_bank} conceptHints={conceptHints} />
                ) : (
                  <p className="text-slate-400">No word bank for this lecture.</p>
                ))}

              {tab === "puzzle" &&
                (taskPending(ts, "puzzle") ? (
                  <GameShimmer label="Puzzle pairs" />
                ) : ts?.puzzle === "error" ? (
                  <p className="text-rose-400">Puzzle data unavailable.</p>
                ) : deck?.puzzle_pairs && deck.puzzle_pairs.length > 0 ? (
                  <PuzzleMatch pairs={deck.puzzle_pairs} />
                ) : (
                  <p className="text-slate-400">No puzzle pairs for this lecture.</p>
                ))}

              {tab === "meme" &&
                (taskPending(ts, "meme") ? (
                  <GameShimmer label="Meme" />
                ) : ts?.meme === "error" ? (
                  <p className="text-rose-400">Meme unavailable.</p>
                ) : deck?.meme_image_url ? (
                  <MemeCard
                    uploadId={selectedId}
                    imageUrl={deck.meme_image_url}
                    title={memeMeta?.brief?.top_text || uploads.find((u) => u.id === selectedId)?.file_name || "Recap"}
                    tone={memeMeta?.brief?.template || "Deck"}
                    onUpdated={() => invalidateDeck()}
                  />
                ) : (
                  <p className="text-slate-400">No meme for this lecture yet.</p>
                ))}

              {tab === "audio" && (
                <div className="space-y-6">
                  {taskPending(ts, "audio") ? (
                    <GameShimmer label="Audio" />
                  ) : ts?.audio === "error" ? (
                    <p className="text-rose-400">Audio unavailable.</p>
                  ) : deck?.audio_url && deck.audio_transcript ? (
                    <AudioPlayer audioUrl={deck.audio_url} transcript={deck.audio_transcript} />
                  ) : (
                    <p className="text-slate-400">No audio summary for this lecture.</p>
                  )}
                  {taskPending(ts, "youtube") ? (
                    <GameShimmer label="YouTube" />
                  ) : ts?.youtube === "error" ? (
                    <p className="text-sm text-slate-500">YouTube suggestions unavailable.</p>
                  ) : deck?.youtube_suggestions && deck.youtube_suggestions.length > 0 ? (
                    <YouTubeSuggestions suggestions={deck.youtube_suggestions} />
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
