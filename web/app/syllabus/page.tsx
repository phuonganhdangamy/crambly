"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCourses, postCourse, postSyllabus, type CourseRow } from "@/lib/api";

type Card = {
  name: string;
  due_date: string;
  grade_weight: number;
  priority_score: number;
  message: string;
  tier: string;
};

function tierStyles(tier: string) {
  if (tier === "high") return "border-rose-500/50 bg-rose-500/10";
  if (tier === "medium") return "border-amber-500/50 bg-amber-500/10";
  return "border-emerald-500/40 bg-emerald-500/10";
}

export default function SyllabusPage() {
  const qc = useQueryClient();
  const coursesQ = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [newModal, setNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  const createCourse = useMutation({
    mutationFn: () => postCourse({ name: newName.trim(), code: newCode.trim(), color: newColor }),
    onSuccess: (row: CourseRow) => {
      void qc.invalidateQueries({ queryKey: ["courses"] });
      setCourseId(row.id);
      setNewModal(false);
      setNewName("");
      setNewCode("");
      setNewColor("#6366f1");
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Syllabus → deadlines</h1>
        <p className="mt-2 text-slate-400">
          Upload a syllabus PDF. The deadline agent extracts assessments and ranks them. Link a course so deadlines stay
          scoped to that class.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <label className="text-sm font-medium text-slate-300" htmlFor="syllabus-course">
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
          className="mt-2 max-w-md block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">No course (legacy — replaces only unscoped assessments)</option>
          {(coursesQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
          <option value="__new__">New course…</option>
        </select>
      </div>

      <label className="inline-flex cursor-pointer rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700">
        {busy ? "Parsing…" : "Upload syllabus PDF"}
        <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={busy} onChange={(e) => void onFile(e.target.files)} />
      </label>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="grid gap-4">
        {(cards ?? []).map((c) => (
          <div key={`${c.name}-${c.due_date}`} className={`rounded-2xl border p-5 ${tierStyles(c.tier)}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold text-white">{c.name}</h2>
              <span className="font-mono text-sm text-slate-200">score {c.priority_score.toFixed(3)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-200">
              Due <span className="font-medium text-white">{c.due_date}</span> · Weight{" "}
              <span className="font-medium text-white">{(c.grade_weight * 100).toFixed(0)}%</span>
            </p>
            <p className="mt-3 text-slate-100">{c.message}</p>
          </div>
        ))}
      </div>

      {newModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="text-lg font-semibold text-white">New course</h3>
            <div className="mt-4 space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Course name"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Code e.g. STAB57"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-10 w-full max-w-[5rem] cursor-pointer rounded border border-slate-600"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewModal(false);
                }}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createCourse.isPending || !newName.trim() || !newCode.trim()}
                onClick={() => createCourse.mutate()}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {createCourse.isPending ? "Saving…" : "Create & select"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
