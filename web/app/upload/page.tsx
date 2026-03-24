"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCourses, postCourse, uploadFile, type CourseRow } from "@/lib/api";

function detectType(file: File): "pdf" | "image" | "audio" | "text" {
  const n = file.name.toLowerCase();
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (n.endsWith(".txt") || t === "text/plain") return "text";
  return "pdf";
}

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Upload academic content</h1>
        <p className="mt-2 text-slate-400">PDF, image, audio, or plain text — sent to the ingestion agent.</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <label className="text-sm font-medium text-slate-300" htmlFor="course-select">
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
            className="max-w-md flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
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
        <p className="mt-2 text-xs text-slate-500">
          Assigning a course links this lecture in the course hub and scopes Digital Twin updates from quizzes on this
          material.
        </p>
      </div>

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
        className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
          drag ? "border-indigo-400 bg-indigo-500/10" : "border-slate-700 bg-slate-900/50"
        }`}
      >
        <p className="text-slate-200">{busy ? "Processing with Gemini…" : "Drag & drop a file here"}</p>
        <p className="mt-2 text-sm text-slate-500">or</p>
        <label className="mt-4 inline-flex cursor-pointer rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Browse files
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      </div>

      {busy && (
        <div className="flex items-center gap-3 text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Extracting concepts and embeddings…
        </div>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}

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
                  setCourseId("");
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
