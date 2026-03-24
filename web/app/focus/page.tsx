"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FocusUploadRow } from "@/lib/focusUploadApi";
import { readLearnerMode } from "@/lib/readLearnerPrefs";
import { useFocusStore } from "@/store/focusStore";

const GOALS: { label: string; minutes: number | null }[] = [
  { label: "15 min", minutes: 15 },
  { label: "25 min", minutes: 25 },
  { label: "45 min", minutes: 45 },
  { label: "Open ended", minutes: null },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function FocusPage() {
  const router = useRouter();
  const setSession = useFocusStore((s) => s.setSession);
  const [uploads, setUploads] = useState<FocusUploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [goalIx, setGoalIx] = useState(1);
  const [modeLabel, setModeLabel] = useState("adhd");

  useEffect(() => {
    setModeLabel(readLearnerMode());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/uploads");
        if (!res.ok) {
          const t = await res.text();
          let msg = t;
          try {
            const j = JSON.parse(t) as { error?: string };
            if (typeof j.error === "string") msg = j.error;
          } catch {
            /* keep raw */
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as FocusUploadRow[];
        if (!cancelled) {
          setUploads(data);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load uploads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = uploads.find((u) => u.id === selectedId);
  const showRawWarning =
    selected && selected.status === "ready" && selected.concepts_count > 0 && !selected.has_raw_content;
  const canStart = Boolean(selectedId && selected?.status === "ready");

  function start() {
    if (!canStart || !selectedId) return;
    const g = GOALS[goalIx];
    const minutes = g.minutes;
    setSession(selectedId, minutes);
    const q = minutes == null ? "goal=open" : `goal=${minutes}`;
    router.push(`/focus/${selectedId}?${q}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-[640px]">
        <h1 className="text-center text-3xl font-bold text-white md:text-4xl">Enter Focus Mode</h1>
        <p className="mt-3 text-center text-[var(--color-text-secondary)]">
          Read your original lecture content. Crambly watches where you slow down and helps without interrupting.
        </p>

        <div className="mt-10">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">Choose an upload</p>
          {loading && <p className="text-sm text-[var(--color-text-muted)]">Loading uploads…</p>}
          {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
          {!loading && !err && uploads.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No ready uploads yet. Process a file from the Upload page first.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {uploads.map((u) => {
              const sel = u.id === selectedId;
              const processing = u.status !== "ready";
              const hasRaw = u.has_raw_content;
              const icon = processing ? "⏱" : hasRaw ? "🔒" : "⏱";
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedId(u.id)}
                  className={`relative rounded-[var(--radius-lg)] border p-3 text-left transition-colors ${
                    sel
                      ? "border-[var(--color-accent-cyan)] bg-[var(--color-bg-secondary)] ring-1 ring-[var(--color-accent-cyan)]"
                      : "border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] hover:border-[var(--color-border-active)]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className="truncate rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--color-bg-primary)]"
                      style={{ background: u.course_color || "var(--color-accent-cyan)" }}
                    >
                      {u.course_code || "Course"}
                    </span>
                    <span
                      className="text-lg text-[var(--color-text-muted)]"
                      title={
                        processing
                          ? "Processing"
                          : hasRaw
                            ? "Full original text available"
                            : "Summary only (re-ingest for verbatim text)"
                      }
                    >
                      {icon}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium text-[var(--color-text-primary)]">{u.file_name}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{formatDate(u.created_at)}</p>
                  {sel && (
                    <span className="absolute right-2 top-2 text-[var(--color-accent-cyan)]" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {showRawWarning && (
            <p className="mt-3 text-sm text-[var(--color-accent-orange)]">
              Full text not available for this upload. Focus Mode will use the AI summary instead.
            </p>
          )}
        </div>

        <div className="mt-10">
          <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">Session goal</p>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g, i) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setGoalIx(i)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  goalIx === i
                    ? "bg-[var(--color-accent-cyan)]/20 text-[var(--color-accent-cyan)] ring-1 ring-[var(--color-accent-cyan)]"
                    : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={!canStart}
          onClick={start}
          className="mt-10 w-full rounded-[var(--radius-md)] bg-[var(--color-accent-cyan)] py-3 text-center text-sm font-semibold text-[var(--color-bg-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Start Session
        </button>

        <p className="mt-8 flex flex-wrap items-center justify-center gap-1 text-center text-xs text-[var(--color-text-secondary)]">
          <span aria-hidden>🧠</span>
          <span>
            Focus Mode adapts to your current learner mode: <strong className="text-[var(--color-text-primary)]">{modeLabel}</strong>
          </span>
          <Link href="/mode" className="text-[var(--color-accent-cyan)] hover:underline">
            Change
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
