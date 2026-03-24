"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { deleteUpload, fetchTwin, fetchUploads } from "@/lib/api";
import { getSupabaseBrowser } from "@/lib/supabase";

function WeakBadge({ title, weak }: { title: string; weak: string[] }) {
  const hit = weak.some((w) => title.toLowerCase().includes(w.toLowerCase()) || w.toLowerCase().includes(title.toLowerCase()));
  if (!hit) return null;
  return <Badge variant="danger">Weak topic</Badge>;
}

function statusBadge(status: string) {
  if (status === "ready") return <Badge variant="success">{status}</Badge>;
  if (status === "processing") return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="danger">{status}</Badge>;
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
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <p className="text-sm text-[var(--color-accent-cyan)]">Your materials</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Library</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">Processed uploads and concept counts. Open a deck to study.</p>
        {supabaseReady && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">Supabase browser client configured (direct reads available).</p>
        )}
      </div>

      {twin.isLoading && <p className="text-[var(--color-text-secondary)]">Loading Digital Twin…</p>}
      {weak.length > 0 && (
        <Card className="border-[var(--color-warning)]/35 bg-[var(--color-warning)]/10">
          <p className="font-semibold text-[var(--color-text-primary)]">Current weak topics (from quizzes)</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{weak.join(", ") || "—"}</p>
        </Card>
      )}

      {uploads.isLoading && <p className="text-[var(--color-text-secondary)]">Loading uploads…</p>}
      {uploads.isError && <p className="text-[var(--color-danger)]">Could not load uploads.</p>}

      <div className="grid gap-4">
        {(uploads.data ?? []).map((u, i) => (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.22 }}
          >
            <Card hoverable className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/study/${u.id}`} className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold text-[var(--color-text-primary)]">{u.file_name}</p>
                  {statusBadge(u.status)}
                  <WeakBadge title={u.file_name} weak={weak} />
                </div>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {u.concepts_count} concepts extracted
                  {u.course_code ? ` · Course: ${u.course_code}` : ""}
                  {u.learner_mode ? ` · Mode: ${u.learner_mode}` : ""}
                  {u.complexity_dial != null ? ` · Dial: ${Math.round(Number(u.complexity_dial) * 100)}%` : ""}
                </p>
              </Link>
              <Button
                type="button"
                variant="danger"
                disabled={del.isPending}
                className="shrink-0 self-start sm:self-center"
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
              >
                Delete
              </Button>
            </Card>
          </motion.div>
        ))}
      </div>

      {(uploads.data?.length ?? 0) === 0 && !uploads.isLoading && (
        <p className="text-[var(--color-text-muted)]">
          Nothing here yet.{" "}
          <Link href="/upload" className="font-medium text-[var(--color-accent-cyan)] hover:underline">
            Upload your notes
          </Link>
          .
        </p>
      )}
    </motion.div>
  );
}
