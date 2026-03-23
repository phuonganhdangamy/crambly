"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { uploadFile } from "@/lib/api";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      setError(null);
      setBusy(true);
      try {
        const ft = detectType(f);
        await uploadFile(f, ft);
        router.push("/library");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Upload academic content</h1>
        <p className="mt-2 text-slate-400">PDF, image, audio, or plain text — sent to the ingestion agent.</p>
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
    </div>
  );
}
