"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { fetchCourses, postCourse, uploadFile, type CourseRow } from "@/lib/api";

const PRESET_COLORS = ["#00d9ff", "#7ee787", "#6366f1", "#a371f7", "#f778ba", "#ff7b35", "#58a6ff", "#3fb950"];

function detectType(file: File): "pdf" | "image" | "audio" | "text" {
  const n = file.name.toLowerCase();
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (n.endsWith(".txt") || t === "text/plain") return "text";
  return "pdf";
}

const selectClass =
  "mt-2 max-w-md w-full flex-1 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-cyan)] focus:outline-none focus:shadow-[var(--shadow-neon-cyan)] min-h-[44px]";

export default function UploadPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
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

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      setError(null);
      setBusy(true);
      try {
        const ft = detectType(f);
        const cid = courseId || undefined;
        await uploadFile(f, ft, cid);
        router.push("/library");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [router, courseId],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <p className="text-sm text-[var(--color-accent-cyan)]">Ingestion</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Upload academic content</h1>
        <p className="mt-2 text-[var(--color-text-secondary)]">PDF, image, audio, or plain text — sent to the ingestion agent.</p>
      </div>

      <Card>
        <label className="text-sm font-medium text-[var(--color-text-secondary)]" htmlFor="course-select">
          Course (optional)
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            id="course-select"
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
            <option value="">No course</option>
            {(coursesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
            <option value="__new__">New course…</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Assigning a course links this lecture in the course hub and scopes Digital Twin updates from quizzes on this
          material.
        </p>
      </Card>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void onFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed px-6 text-center transition-colors ${
          drag
            ? "border-[var(--color-accent-cyan)] bg-[var(--color-accent-cyan)]/10 shadow-[var(--shadow-neon-cyan)]"
            : "border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]"
        }`}
      >
        <p className="text-[var(--color-text-primary)]">{busy ? "Processing with Gemini…" : "Drag & drop a file here"}</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">or</p>
        <label className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-elevated)]">
          Browse files
          <input type="file" className="hidden" disabled={busy} onChange={(e) => void onFiles(e.target.files)} />
        </label>
      </div>

      {busy && (
        <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-accent-cyan)] border-t-transparent" />
          Extracting concepts and embeddings…
        </div>
      )}
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

      <AnimatePresence>
        {newModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setNewModal(false);
                    setCourseId("");
                  }}
                >
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
