"use client";

import type { QuizQuestion } from "@crambly/types";
import { useState } from "react";
import { postQuizResult } from "@/lib/api";

export function QuizBurst({ questions }: { questions: QuizQuestion[] }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);

  const q = questions[idx];
  if (!q) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-400">
        No quiz questions for this deck yet.
      </div>
    );
  }

  function onChoose(i: number) {
    if (revealed) return;
    setPicked(i);
    setRevealed(true);
    const ok = i === q.correct_index;
    if (ok) setScore((s) => s + 1);
    const cid = q.concept_id;
    if (cid) void postQuizResult(cid, ok).catch(() => {});
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setIdx(0);
      setPicked(null);
      setRevealed(false);
      setScore(0);
      return;
    }
    setIdx((j) => j + 1);
    setPicked(null);
    setRevealed(false);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Quiz burst</h3>
        <span className="text-sm text-slate-400">
          {idx + 1} / {questions.length} · Score {score}
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{q.topic}</p>
      <p className="mt-3 text-slate-100">{q.question}</p>
      <ul className="mt-4 space-y-2">
        {q.choices.map((c, i) => {
          let cls =
            "w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-left text-sm text-slate-200 hover:border-slate-500";
          if (revealed) {
            if (i === q.correct_index) cls = "w-full rounded-xl border border-emerald-500/60 bg-emerald-500/20 px-4 py-3 text-left text-sm text-emerald-100";
            else if (i === picked) cls = "w-full rounded-xl border border-rose-500/60 bg-rose-500/20 px-4 py-3 text-left text-sm text-rose-100";
            else cls = "w-full rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left text-sm text-slate-500";
          }
          return (
            <li key={i}>
              <button type="button" disabled={revealed} onClick={() => onChoose(i)} className={cls}>
                {c}
              </button>
            </li>
          );
        })}
      </ul>
      {revealed && (
        <button
          type="button"
          onClick={() => next()}
          className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          {idx + 1 >= questions.length ? "Start over" : "Next"}
        </button>
      )}
    </div>
  );
}
