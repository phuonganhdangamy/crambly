"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteCourse, fetchCourses, postCourse, type CourseRow } from "@/lib/api";

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

export default function CoursesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["courses"], queryFn: fetchCourses });
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [formError, setFormError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => postCourse({ name: name.trim(), code: code.trim(), color }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["courses"] });
      setModal(false);
      setName("");
      setCode("");
      setColor("#6366f1");
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Courses</h1>
          <p className="mt-2 text-slate-400">
            Group lectures, syllabi, and study decks. Open a course hub to see everything in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setModal(true);
            setFormError(null);
          }}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          New course
        </button>
      </div>

      {q.isLoading && <p className="text-slate-400">Loading courses…</p>}
      {q.isError && <p className="text-rose-400">Could not load courses.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((c: CourseRow) => (
          <div
            key={c.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-indigo-500/40"
            style={{ borderLeftWidth: 4, borderLeftColor: c.color || "#6366f1" }}
          >
            <Link href={`/courses/${c.id}`} className="block flex-1 p-5">
              <p className="font-mono text-sm font-semibold text-indigo-200">{c.code}</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{c.name}</h2>
              <p className="mt-3 text-sm text-slate-400">
                {c.uploads_count ?? 0} upload{(c.uploads_count ?? 0) === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Next assessment: <span className="text-slate-300">{nextAssessmentLabel(c.next_assessment_date)}</span>
              </p>
            </Link>
            <div className="border-t border-slate-800 px-5 py-2">
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
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-50"
              >
                Delete course
              </button>
            </div>
          </div>
        ))}
      </div>

      {(q.data?.length ?? 0) === 0 && !q.isLoading && !q.isError && (
        <p className="text-slate-500">
          No courses yet. Create one, then attach uploads and syllabi from the Upload and Syllabus pages.
        </p>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">New course</h3>
            <form onSubmit={submitNew} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400">Course name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  placeholder="Statistics II"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400">Course code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-white"
                  placeholder="STAB57"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400">Accent color</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-slate-600 bg-transparent"
                  />
                  <span className="font-mono text-sm text-slate-400">{color}</span>
                </div>
              </div>
              {formError && <p className="text-sm text-rose-400">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={m.isPending}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
                >
                  {m.isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
