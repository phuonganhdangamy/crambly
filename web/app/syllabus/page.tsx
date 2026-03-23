"use client";

import { useState } from "react";
import { postSyllabus } from "@/lib/api";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);

  async function onFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postSyllabus(f);
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
        <p className="mt-2 text-slate-400">Upload a syllabus PDF. The deadline agent extracts assessments and ranks them.</p>
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
    </div>
  );
}
