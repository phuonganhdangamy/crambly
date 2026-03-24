"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { deleteCourse, fetchCourses, postCourse, type CourseRow } from "@/lib/api";

const PRESET_COLORS = ["#00d9ff", "#7ee787", "#ff7b35", "#a371f7", "#f778ba", "#6366f1", "#58a6ff", "#3fb950"];

function nextAssessmentLabel(iso: string | null | undefined) {
  if (!iso) return "No upcoming dates";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    const d = new Date(iso + "T12:00:00");
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / 86400000);
  } catch {
    return null;
  }
}

function completionPercent(c: CourseRow) {
  const n = c.uploads_count ?? 0;
  return Math.min(100, 10 + n * 22);
}

export default function CoursesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [formError, setFormError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => postCourse({ name: name.trim(), code: code.trim(), color }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["courses"] });
      setModal(false);
      setName("");
      setCode("");
      setColor(PRESET_COLORS[0]!);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const delCourse = useMutation({
    mutationFn: (id: string) => deleteCourse(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["courses"] }),
  });

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !code.trim()) {
      setFormError("Name and code are required.");
      return;
    }
    m.mutate();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-accent-cyan)]">Organize</p>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Courses</h1>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            Group lectures, syllabi, and study decks. Open a course hub to see everything in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/syllabus"
            className="inline-flex min-h-[40px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent-cyan)]/50 hover:bg-[var(--color-bg-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)]"
          >
            Upload syllabus
          </Link>
          <Button type="button" variant="primary" onClick={() => { setModal(true); setFormError(null); }}>
            New course
          </Button>
        </div>
      </div>

      {q.isLoading && <p className="text-[var(--color-text-secondary)]">Loading courses…</p>}
      {q.isError && <p className="text-[var(--color-danger)]">Could not load courses.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((c: CourseRow, i) => {
          const pct = completionPercent(c);
          const due = daysUntil(c.next_assessment_date);
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
            >
              <Card
                hoverable
                glow
                className="group flex h-full flex-col overflow-hidden !p-0"
                style={{ boxShadow: "var(--shadow-card)" } as CSSProperties}
              >
                <div className="h-1 w-full shrink-0" style={{ backgroundColor: c.color || PRESET_COLORS[0] }} />
                <Link href={`/courses/${c.id}`} className="block flex-1 p-5">
                  <p className="font-mono text-lg font-bold text-[var(--color-accent-cyan)]">{c.code}</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">{c.name}</h2>
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                    {c.uploads_count ?? 0} upload{(c.uploads_count ?? 0) === 1 ? "" : "s"}
                    {due !== null && (
                      <>
                        {" "}
                        · next assessment in{" "}
                        <span className="font-medium text-[var(--color-text-primary)]">{due}</span> days
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Next: <span className="text-[var(--color-text-secondary)]">{nextAssessmentLabel(c.next_assessment_date)}</span>
                  </p>
                  <div className="mt-4">
                    <p className="mb-1 text-xs text-[var(--color-text-muted)]">Linked progress</p>
                    <ProgressBar value={pct} color={c.color || "var(--color-accent-cyan)"} />
                  </div>
                </Link>
                <div className="border-t border-[var(--color-border-default)] px-5 py-3">
                  <button
                    type="button"
                    disabled={delCourse.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Delete course ${c.code}? Syllabus deadlines for this course are removed. Lectures stay in your library but are unlinked from the course.`,
                        )
                      ) {
                        return;
                      }
                      delCourse.mutate(c.id);
                    }}
                    className="text-xs font-semibold text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  >
                    Delete course
                  </button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {(q.data?.length ?? 0) === 0 && !q.isLoading && !q.isError && (
        <p className="text-[var(--color-text-muted)]">
          No courses yet. Create one, then attach uploads and syllabi from the Upload and Syllabus pages.
        </p>
      )}

      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4"
            role="presentation"
            onClick={() => setModal(false)}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0.9 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.9 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="w-full max-w-md rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 shadow-xl sm:rounded-[var(--radius-lg)]"
              role="dialog"
              aria-labelledby="new-course-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="new-course-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
                New course
              </h3>
              <form onSubmit={submitNew} className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)]">Course name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="Statistics II" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)]">Course code</label>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-1 font-mono"
                    placeholder="STAB57"
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">Accent color</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PRESET_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Select color ${hex}`}
                        className={`h-10 w-10 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)] ${
                          color === hex ? "border-[var(--color-accent-cyan)] scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: hex }}
                        onClick={() => setColor(hex)}
                      />
                    ))}
                  </div>
                </div>
                {formError && <p className="text-sm text-[var(--color-danger)]">{formError}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={m.isPending}>
                    Create
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
