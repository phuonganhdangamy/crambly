"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { fetchCourses, postCourse, postSyllabus, type CourseRow } from "@/lib/api";

type ParsedAssessment = {
  name: string;
  due_date: string;
  grade_weight: number;
  priority_score: number;
  message: string;
  tier: string;
};

const PRESET_COLORS = ["#00d9ff", "#7ee787", "#6366f1", "#a371f7", "#f778ba", "#ff7b35", "#58a6ff", "#3fb950"];

function tierStyles(tier: string) {
  if (tier === "high") return "border-[var(--color-danger)]/45 bg-[var(--color-danger)]/10";
  if (tier === "medium") return "border-[var(--color-warning)]/45 bg-[var(--color-warning)]/10";
  return "border-[var(--color-success)]/40 bg-[var(--color-success)]/10";
}

const selectClass =
  "mt-2 max-w-md block w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-cyan)] focus:outline-none focus:shadow-[var(--shadow-neon-cyan)] min-h-[44px]";

export default function SyllabusPage() {
  const qc = useQueryClient();
  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<ParsedAssessment[] | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [newModal, setNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]!);

  const createCourse = useMutation({
    mutationFn: () => postCourse({ name: newName.trim(), code: newCode.trim(), color: newColor }),
    onSuccess: (row: CourseRow) => {
      void qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(row.id);
      setNewModal(false);
      setNewName("");
      setNewCode("");
      setNewColor(PRESET_COLORS[0]!);
    },
  });

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const cid = courseId || undefined;
      const res = await postSyllabus(f, cid);
      setCards(res);
    } catch (e) {
      setCards(null);
      setError(e instanceof Error ? e.message : "Syllabus parse failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <p className="text-sm text-[var(--color-accent-cyan)]">Deadline agent</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Syllabus → deadlines</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">
          Upload a syllabus PDF. The deadline agent extracts assessments and ranks them. Link a course so deadlines stay
          scoped to that class.
        </p>
      </div>

      <Card>
        <label className="text-sm font-medium text-[var(--color-text-secondary)]" htmlFor="syllabus-course">
          Course
        </label>
        <select
          id="syllabus-course"
          value={courseId}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__new__") {
              setNewModal(true);
              return;
            }
            setCourseId(v);
          }}
          className={selectClass}
        >
          <option value="">No course (legacy — replaces only unscoped assessments)</option>
          {(coursesQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
          <option value="__new__">New course…</option>
        </select>
      </Card>

      <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[var(--radius-md)] bg-[var(--color-accent-cyan)] px-5 py-3 text-sm font-semibold text-[#0d1117] shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-neon-cyan)]">
        {busy ? "Parsing…" : "Upload syllabus PDF"}
        <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={busy} onChange={(e) => void onFile(e.target.files)} />
      </label>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <div className="grid gap-4">
        {(cards ?? []).map((c) => (
          <Card key={`${c.name}-${c.due_date}`} className={tierStyles(c.tier)}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">{c.name}</h2>
              <span className="font-mono text-sm text-[var(--color-text-secondary)]">score {c.priority_score.toFixed(3)}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Due <span className="font-medium text-[var(--color-text-primary)]">{c.due_date}</span> · Weight{" "}
              <span className="font-medium text-[var(--color-text-primary)]">{(c.grade_weight * 100).toFixed(0)}%</span>
            </p>
            <p className="mt-3 text-[var(--color-text-primary)]">{c.message}</p>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {newModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
            onClick={() => setNewModal(false)}
            role="presentation"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="w-full max-w-md rounded-t-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 sm:rounded-[var(--radius-lg)]"
              role="dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">New course</h3>
              <div className="mt-4 space-y-3">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Course name" />
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Code e.g. STAB57"
                  className="font-mono"
                />
                <p className="text-xs text-[var(--color-text-muted)]">Accent</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Color ${hex}`}
                      className={`h-9 w-9 rounded-full border-2 ${newColor === hex ? "border-[var(--color-accent-cyan)]" : "border-transparent"}`}
                      style={{ backgroundColor: hex }}
                      onClick={() => setNewColor(hex)}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNewModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={createCourse.isPending || !newName.trim() || !newCode.trim()}
                  loading={createCourse.isPending}
                  onClick={() => createCourse.mutate()}
                >
                  Create & select
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
