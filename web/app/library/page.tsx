"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteUpload, fetchTwin, fetchUploads } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase";

function WeakBadge({ title, weak }: { title: string; weak: string[] }) {
  const hit = weak.some((w) => title.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(title.toLowerCase()));
  if (!hit) return null;
  return (
    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-200">Weak topic</span>
  );
}

export default function LibraryPage() {
  const qc = useQueryClient();
  const uploads = useQuery({ queryKey: ["uploads"], queryFn: fetchUploads });
  const twin = useQuery({ queryKey: ["twin"], queryFn: fetchTwin });
  const supabaseReady = Boolean(getSupabaseBrowser());

  const del = useMutation({
    mutationFn: (id: string) => deleteUpload(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uploads"] });
      void qc.invalidateQueries({ queryKey: ["courseUploads"] });
      void qc.invalidateQueries({ queryKey: ["courseAggregate"] });
    },
  });

  const weak = (twin.data?.digital_twin?.weak_topics as string[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Library</h1>
        <p className="mt-2 text-slate-400">Processed uploads and concept counts. Open a deck to study.</p>
        {supabaseReady && (
          <p className="mt-2 text-xs text-slate-500">Supabase browser client configured (direct reads available).</p>
        )}
      </div>

      {twin.isLoading && <p className="text-slate-400">Loading Digital Twin…</p>}
      {weak.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Current weak topics (from quizzes)</p>
          <p className="mt-1 text-amber-200/90">{weak.join(", ") || "—"}</p>
        </div>
      )}

      {uploads.isLoading && <p className="text-slate-400">Loading uploads…</p>}
      {uploads.isError && <p className="text-rose-400">Could not load uploads.</p>}

      <div className="grid gap-4">
        {(uploads.data ?? []).map((u) => (
          <div
            key={u.id}
            className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-indigo-500/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <Link href={`/study/${u.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-white">{u.file_name}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.status === "ready"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : u.status === "processing"
                        ? "bg-amber-500/20 text-amber-100"
                        : "bg-rose-500/20 text-rose-100"
                  }`}
                >
                  {u.status}
                </span>
                <WeakBadge title={u.file_name} weak={weak} />
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {u.concepts_count} concepts extracted
                {u.course_code ? ` · Course: ${u.course_code}` : ""}
                {u.learner_mode ? ` · Mode: ${u.learner_mode}` : ""}
                {u.complexity_dial != null ? ` · Dial: ${Math.round(Number(u.complexity_dial) * 100)}%` : ""}
              </p>
            </Link>
            <button
              type="button"
              disabled={del.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Permanently delete “${u.file_name}” and all concepts / study deck data? This cannot be undone.`,
                  )
                ) {
                  return;
                }
                del.mutate(u.id);
              }}
              className="shrink-0 self-start rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 sm:self-center"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {(uploads.data?.length ?? 0) === 0 && !uploads.isLoading && (
        <p className="text-slate-500">
          Nothing here yet.{" "}
          <Link href="/upload" className="text-indigo-300 underline">
            Upload your notes
          </Link>
          .
        </p>
      )}
    </div>
  );
}
