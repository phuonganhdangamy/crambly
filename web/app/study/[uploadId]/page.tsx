"use client";

import type { LearnerMode } from "@crambly/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { postAudioClipMeta, postMeme, postTransform, postTts } from "@/lib/api";

function readMode(): LearnerMode {
  if (typeof window === "undefined") return "adhd";
  const m = localStorage.getItem("crambly_mode") as LearnerMode | null;
  const allowed: LearnerMode[] = ["adhd", "visual", "global_scholar", "audio", "exam_cram"];
  return m && allowed.includes(m) ? m : "adhd";
}

function readDial(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const d = localStorage.getItem("crambly_complexity");
  if (!d) return undefined;
  return Number(d) / 100;
}

export default function StudyPage() {
  const params = useParams<{ uploadId: string }>();
  const uploadId = params.uploadId;

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [meme, setMeme] = useState<Record<string, string> | null>(null);
  const [busyAudio, setBusyAudio] = useState(false);
  const [busyMeme, setBusyMeme] = useState(false);

  const [mode, setMode] = useState<LearnerMode>("adhd");
  const [dial, setDial] = useState<number | undefined>(undefined);

  useEffect(() => {
    setMode(readMode());
    setDial(readDial());
  }, [uploadId]);

  const q = useQuery({
    queryKey: ["transform", uploadId, mode, dial],
    queryFn: () => postTransform(uploadId, mode, dial),
    enabled: Boolean(uploadId),
  });

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function onAudio() {
    if (!q.data?.summary) return;
    setBusyAudio(true);
    try {
      const { audio_base64, mime } = await postTts(q.data.summary.slice(0, 2400));
      const blob = await fetch(`data:${mime};base64,${audio_base64}`).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      void postAudioClipMeta({
        title: q.data?.key_terms?.[0] ? `${q.data.key_terms[0]} explainer` : "Concept explainer",
        transcript: q.data?.summary?.slice(0, 4000) || "",
      }).catch(() => {});
    } finally {
      setBusyAudio(false);
    }
  }

  async function onMeme() {
    setBusyMeme(true);
    try {
      const title = q.data?.key_terms?.[0] || "Concept recap";
      const summary = q.data?.summary || "";
      const res = await postMeme(title, summary);
      setMeme(res.meme);
    } finally {
      setBusyMeme(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Study deck</h1>
        <p className="mt-2 text-slate-400">
          Mode <span className="text-indigo-200">{mode}</span> · Upload <span className="font-mono text-slate-300">{uploadId}</span>
        </p>
      </div>

      {q.isLoading && (
        <div className="flex items-center gap-3 text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Transforming with Gemini…
        </div>
      )}
      {q.isError && <p className="text-rose-400">Transform failed. Check API keys and backend logs.</p>}

      {q.data && (
        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Summary</h2>
            <p className="mt-3 whitespace-pre-wrap text-slate-200">{q.data.summary}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busyAudio}
                onClick={() => void onAudio()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {busyAudio ? "Generating audio…" : "Generate Audio"}
              </button>
              <button
                type="button"
                disabled={busyMeme}
                onClick={() => void onMeme()}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-50"
              >
                {busyMeme ? "Generating…" : "Generate Meme Recap"}
              </button>
            </div>
            {audioUrl && (
              <audio className="mt-4 w-full" controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            )}
          </section>

          {meme && (
            <div className="rounded-2xl border border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-500/10 to-indigo-500/10 p-6">
              <p className="text-xs uppercase tracking-widest text-fuchsia-200">Meme recap</p>
              <p className="mt-2 text-2xl font-bold text-white">{meme.headline}</p>
              <p className="mt-2 text-slate-200">{meme.caption}</p>
              <p className="mt-2 text-xs text-slate-400">Tone: {meme.tone}</p>
            </div>
          )}

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Concept map (text)</h2>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-200">{q.data.concept_map}</pre>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">Key terms</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-200">
              {(q.data.key_terms ?? []).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>

          {(q.data.sections ?? []).length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Sections</h2>
              {(q.data.sections ?? []).map((s) => (
                <div key={s.header} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
                  <h3 className="font-semibold text-indigo-200">{s.header}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-slate-200">{s.body}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
