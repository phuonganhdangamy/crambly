"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FrictionHeatmap, SessionHeatDots } from "@/components/focus/FrictionHeatmap";
import { ReaderView } from "@/components/focus/ReaderView";
import { useChrome } from "@/components/layout/ChromeContext";
import type { FocusSection } from "@/lib/focusTypes";
import type { FocusUploadRow } from "@/lib/focusUploadApi";
import { useFocusSession } from "@/lib/focusSession";
import { getScrollContainer, readScrollRange } from "@/lib/scrollParent";
import { apiBase } from "@/lib/user";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useFocusStore } from "@/store/focusStore";

function mapConceptRows(rows: Record<string, unknown>[]): FocusSection[] {
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    summary: String(r.summary ?? ""),
    raw_content: r.raw_content != null ? String(r.raw_content) : null,
    exam_importance: Number(r.exam_importance ?? 3),
    has_math: Boolean(r.has_math),
    has_code: Boolean(r.has_code),
    key_terms: [] as string[],
  }));
}

function parseGoal(raw: string | null): number | null {
  if (raw == null || raw === "" || raw === "open") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 25;
  return n;
}

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function FocusReaderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const uploadId = String(params.uploadId || "");
  const goalMinutes = parseGoal(searchParams.get("goal"));

  const scrollRef = useRef<HTMLDivElement>(null);
  const { frictionScores, resetBlock } = useFocusSession(scrollRef);

  const [sections, setSections] = useState<FocusSection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadMeta, setUploadMeta] = useState<FocusUploadRow | null>(null);
  const [simplifiedIds, setSimplifiedIds] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState(0);
  const [endOpen, setEndOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const { sessionGoal, smartNudgesEnabled, toggleSmartNudges, sectionsReviewed, simplificationsUsed, endSession } =
    useFocusStore();

  const { calming, setCalming } = useChrome();

  useEffect(() => {
    const st = useFocusStore.getState();
    if (st.sessionUploadId !== uploadId) {
      st.setSession(uploadId, goalMinutes);
    } else {
      useFocusStore.setState({ sessionGoal: goalMinutes });
      if (st.sessionStartedAt == null) {
        useFocusStore.setState({ sessionStartedAt: Date.now() });
      }
    }
  }, [uploadId, goalMinutes]);

  useEffect(() => {
    let cancelled = false;
    async function loadUploads() {
      try {
        const res = await fetch("/api/uploads");
        if (!res.ok) throw new Error(await res.text());
        const rows = (await res.json()) as FocusUploadRow[];
        if (cancelled) return;
        setUploadMeta(rows.find((r) => r.id === uploadId) ?? null);
      } catch {
        if (!cancelled) setUploadMeta(null);
      }
    }
    void loadUploads();
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      if (sb) {
        const { data, error } = await sb
          .from("concepts")
          .select("id,title,summary,raw_content,exam_importance,has_math,has_code")
          .eq("upload_id", uploadId)
          .order("id", { ascending: true });
        if (cancelled) return;
        if (error) {
          setLoadError(error.message);
          return;
        }
        setSections(mapConceptRows((data ?? []) as Record<string, unknown>[]));
        setLoadError(null);
        return;
      }

      try {
        const res = await fetch(`${apiBase()}/api/concepts/by-upload/${uploadId}`);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            (await res.text()) ||
              "Could not load concepts. Configure NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY or run the FastAPI backend.",
          );
          return;
        }
        const rows = (await res.json()) as Record<string, unknown>[];
        setSections(mapConceptRows(rows));
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setLoadError(
            "Supabase is not configured in Next.js and the API fallback failed. Add NEXT_PUBLIC_SUPABASE_* to web/.env.local or start the backend.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  useEffect(() => {
    const scope = scrollRef.current;
    if (!scope) return;
    const scroller = getScrollContainer(scope);
    const onScroll = () => {
      const { top, max } = readScrollRange(scroller);
      setProgress(max <= 0 ? 1 : top / max);
    };
    if (scroller === document.documentElement) {
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      scroller.addEventListener("scroll", onScroll, { passive: true });
    }
    onScroll();
    return () => {
      if (scroller === document.documentElement) {
        window.removeEventListener("scroll", onScroll);
      } else {
        scroller.removeEventListener("scroll", onScroll);
      }
    };
  }, [sections.length]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const elapsedMs = useMemo(() => {
    void tick;
    const start = useFocusStore.getState().sessionStartedAt;
    if (start == null) return 0;
    return Date.now() - start;
  }, [tick]);

  const remainingSec = useMemo(() => {
    if (sessionGoal == null) return null;
    const total = sessionGoal * 60;
    const left = total - Math.floor(elapsedMs / 1000);
    return left;
  }, [sessionGoal, elapsedMs]);

  const timerEndedRef = useRef(false);
  useEffect(() => {
    if (remainingSec != null && remainingSec <= 0 && !timerEndedRef.current) {
      timerEndedRef.current = true;
      setEndOpen(true);
    }
  }, [remainingSec]);

  const hardestSectionTitle = useMemo(() => {
    let bestId = "";
    let best = -1;
    for (const s of sections) {
      const sc = frictionScores[s.id] ?? 0;
      if (sc > best) {
        best = sc;
        bestId = s.id;
      }
    }
    return sections.find((s) => s.id === bestId)?.title ?? "—";
  }, [sections, frictionScores]);

  const scrollToBlock = useCallback((blockId: string) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function handleExit() {
    setEndOpen(true);
  }

  function handleReviewHardest() {
    let bestId = "";
    let best = -1;
    for (const s of sections) {
      const sc = frictionScores[s.id] ?? 0;
      if (sc > best) {
        best = sc;
        bestId = s.id;
      }
    }
    setEndOpen(false);
    if (bestId) scrollToBlock(bestId);
  }

  const courseColor = uploadMeta?.course_color || "var(--color-accent-cyan)";
  const courseCode = uploadMeta?.course_code || "—";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
    >
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[100] h-0.5 bg-[var(--color-bg-tertiary)]"
        aria-hidden
      >
        <div
          className="h-full bg-[var(--color-accent-cyan)] transition-[width] duration-150 ease-out"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>

      <header className="fixed left-0 right-0 top-[2px] z-50 flex h-12 items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)]/95 px-3 backdrop-blur-sm md:px-6">
        <button
          type="button"
          onClick={handleExit}
          className="shrink-0 rounded-md px-2 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] md:px-3"
        >
          ← Exit
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium md:text-base">
            {uploadMeta?.file_name || "Reading"}
          </p>
          <span
            className="mt-0.5 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--color-bg-primary)] md:text-xs"
            style={{ background: courseColor }}
          >
            {courseCode}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <div
            className={`hidden font-mono text-xs md:block ${sessionGoal != null ? "text-[var(--color-accent-cyan)]" : "text-[var(--color-text-muted)]"}`}
            title="Session timer"
          >
            {sessionGoal != null && remainingSec != null ? (
              <span>{formatClock(Math.max(0, remainingSec))} remaining</span>
            ) : (
              <span>{formatClock(Math.floor(elapsedMs / 1000))}</span>
            )}
          </div>
          <button
            type="button"
            onClick={toggleSmartNudges}
            className="hidden items-center gap-1.5 rounded-full border border-[var(--color-border-default)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-cyan)] md:inline-flex"
            title="When on, Crambly will suggest help automatically when you seem stuck on a paragraph."
          >
            Smart nudges
            <span className={smartNudgesEnabled ? "text-[var(--color-accent-cyan)]" : ""}>
              {smartNudgesEnabled ? "ON" : "OFF"}
            </span>
          </button>
          <button
            type="button"
            aria-label="Smart nudges"
            onClick={toggleSmartNudges}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-default)] text-[var(--color-text-secondary)] md:hidden"
            title="Smart nudges"
          >
            {smartNudgesEnabled ? "●" : "○"}
          </button>
          <button
            type="button"
            aria-label="Calming mode"
            onClick={() => setCalming(!calming)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-default)] text-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            title="Calming mode"
          >
            ☾
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pt-[52px]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 md:flex-row md:gap-6 md:px-12">
          <div className="min-w-0 flex-[0.65]">
            {loadError && <p className="text-[var(--color-danger)]">{loadError}</p>}
            {!loadError && sections.length === 0 && (
              <p className="text-[var(--color-text-secondary)]">Loading sections…</p>
            )}
            <ReaderView
              sections={sections}
              frictionScores={frictionScores}
              smartNudgesEnabled={smartNudgesEnabled}
              onResetBlock={resetBlock}
              simplifiedIds={simplifiedIds}
              onSimplifiedVisual={(id) => setSimplifiedIds((m) => ({ ...m, [id]: true }))}
              onClearVisual={(id) => setSimplifiedIds((m) => ({ ...m, [id]: false }))}
            />
          </div>
          <div className="hidden min-w-0 flex-[0.35] md:block">
            <FrictionHeatmap
              sections={sections}
              frictionScores={frictionScores}
              simplificationsUsed={simplificationsUsed}
              sectionsReviewed={sectionsReviewed}
              simplifiedIds={simplifiedIds}
              onSectionClick={scrollToBlock}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {endOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg-primary)]/[0.98] px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-full max-w-[480px] rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-8 text-center shadow-lg"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 20 }}
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--color-accent-cyan)] text-3xl text-[var(--color-accent-cyan)]"
              >
                ✓
              </motion.div>
              <h2 className="mb-6 text-2xl font-bold text-[var(--color-text-primary)]">Session complete</h2>
              <div className="mb-6 grid grid-cols-2 gap-3 text-left text-sm text-[var(--color-text-secondary)]">
                <div>
                  <p className="text-[var(--color-text-muted)]">Time studied</p>
                  <p className="text-[var(--color-text-primary)]">
                    {Math.max(1, Math.round(elapsedMs / 60000))} min
                  </p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">Sections read</p>
                  <p className="text-[var(--color-text-primary)]">
                    {sectionsReviewed.length} / {sections.length || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">Simplifications</p>
                  <p className="text-[var(--color-text-primary)]">{simplificationsUsed}</p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">Hardest section</p>
                  <p className="truncate text-[var(--color-text-primary)]" title={hardestSectionTitle}>
                    {hardestSectionTitle}
                  </p>
                </div>
              </div>
              <p className="mb-2 text-xs text-[var(--color-text-secondary)]">Your reading heatmap this session</p>
              <SessionHeatDots
                sections={sections}
                frictionScores={frictionScores}
                simplifiedIds={simplifiedIds}
                sectionsReviewed={sectionsReviewed}
              />
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={handleReviewHardest}
                  className="rounded-[var(--radius-md)] bg-[var(--color-accent-cyan)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg-primary)]"
                >
                  Review hardest sections
                </button>
                <Link
                  href={`/study/${uploadId}`}
                  onClick={() => {
                    endSession();
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-4 py-2.5 text-center text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                >
                  Back to study deck
                </Link>
              </div>
              <p className="mt-6 text-xs text-[var(--color-text-muted)]">
                This session is not saved. Sign in to track your progress across sessions.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
