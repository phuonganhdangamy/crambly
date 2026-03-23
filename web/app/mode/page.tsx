"use client";

import type { LearnerMode } from "@crambly/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { postPreferences, postStudyDna } from "@/lib/api";

const MODES: { id: LearnerMode; label: string; hint: string }[] = [
  { id: "adhd", label: "ADHD", hint: "Short bursts, bold headers, examples first." },
  { id: "visual", label: "Visual Thinker", hint: "Hierarchy, spatial framing, fewer walls of text." },
  { id: "global_scholar", label: "Global Scholar", hint: "Simpler English, bold technical keywords." },
  { id: "audio", label: "Audio-first", hint: "Scripts tuned for listening." },
  { id: "exam_cram", label: "Exam Cram", hint: "High-yield, traps, mnemonics." },
];

export default function ModePage() {
  const [mode, setMode] = useState<LearnerMode>("adhd");
  const [dial, setDial] = useState(40);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dnaNotes, setDnaNotes] = useState("");
  const [dnaBusy, setDnaBusy] = useState(false);

  useEffect(() => {
    const m = localStorage.getItem("crambly_mode") as LearnerMode | null;
    const d = localStorage.getItem("crambly_complexity");
    if (m && MODES.some((x) => x.id === m)) setMode(m);
    if (d) setDial(Number(d));
  }, []);

  async function saveDna() {
    if (!dnaNotes.trim()) return;
    setDnaBusy(true);
    setMsg(null);
    try {
      await postStudyDna(dnaNotes);
      setMsg("Study DNA captured — future transforms will mirror your voice.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Study DNA failed");
    } finally {
      setDnaBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    localStorage.setItem("crambly_mode", mode);
    localStorage.setItem("crambly_complexity", String(dial));
    try {
      await postPreferences(mode, dial / 100);
      setMsg("Saved to Digital Twin (demo user).");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Learner mode</h1>
        <p className="mt-2 text-slate-400">Pick how Crambly rewrites your material. This feeds the transformation agent.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-2xl border px-4 py-4 text-left transition ${
              mode === m.id ? "border-indigo-400 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
            }`}
          >
            <p className="font-semibold text-white">{m.label}</p>
            <p className="mt-1 text-sm text-slate-400">{m.hint}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-white">Complexity dial</p>
            <p className="text-sm text-slate-400">Expert ←→ ELI5</p>
          </div>
          <span className="text-indigo-300">{dial}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={dial}
          onChange={(e) => setDial(Number(e.target.value))}
          className="mt-4 w-full accent-indigo-500"
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <p className="font-semibold text-white">Optional: Study DNA samples</p>
        <p className="mt-1 text-sm text-slate-400">
          Paste a paragraph of your own notes so the transformation agent can mimic tone (few-shot).
        </p>
        <textarea
          value={dnaNotes}
          onChange={(e) => setDnaNotes(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          placeholder="Your voice, your shorthand, your examples…"
        />
        <button
          type="button"
          disabled={dnaBusy}
          onClick={() => void saveDna()}
          className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {dnaBusy ? "Analyzing…" : "Update Study DNA"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save selection"}
        </button>
        <Link href="/library" className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800">
          Go to library
        </Link>
      </div>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}
