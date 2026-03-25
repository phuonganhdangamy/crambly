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
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 text-[var(--color-text-secondary)]">
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
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Quiz burst</h3>
        <span className="text-sm text-[var(--color-text-muted)]">
          {idx + 1} / {questions.length} · Score {score}
        </span>
      </div>
      <p className="mt-1 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{q.topic}</p>
      <p className="mt-3 text-[var(--color-text-primary)]">{q.question}</p>
      <ul className="mt-4 space-y-2">
        {q.choices.map((c, i) => {
          let cls =
            "w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-4 py-3 text-left text-sm text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]/40";
          if (revealed) {
            if (i === q.correct_index)
              cls =
                "w-full rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-left text-sm text-[var(--color-success)]";
            else if (i === picked)
              cls =
                "w-full rounded-xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-left text-sm text-[var(--color-danger)]";
            else
              cls =
                "w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-4 py-3 text-left text-sm text-[var(--color-text-muted)]";
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
          className="mt-4 rounded-lg bg-[var(--color-accent-purple)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          {idx + 1 >= questions.length ? "Start over" : "Next"}
        </button>
      )}
    </div>
  );
}
