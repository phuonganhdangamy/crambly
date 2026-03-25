"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type PuzzlePair = { term: string; definition: string };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function formatTime(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PuzzleMatch({ pairs }: { pairs: PuzzlePair[] }) {
  const n = pairs.length;
  const [termsOrder, setTermsOrder] = useState<string[]>(() => shuffle(pairs.map((p) => p.term)));
  const [defsOrder, setDefsOrder] = useState<string[]>(() => shuffle(pairs.map((p) => p.definition)));
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [selectedDef, setSelectedDef] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  const [finished, setFinished] = useState(false);

  const defByTerm = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pairs) m.set(p.term, p.definition);
    return m;
  }, [pairs]);

  useEffect(() => {
    if (!running || finished) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running, finished]);

  useEffect(() => {
    if (n > 0 && matched.size >= n && !finished) {
      setFinished(true);
      setRunning(false);
    }
  }, [matched.size, n, finished]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setSelectedTerm(null);
      setSelectedDef(null);
    }, 450);
  }, []);

  const tryMatch = useCallback(
    (term: string | null, def: string | null) => {
      if (!term || !def) return;
      const expected = defByTerm.get(term);
      if (expected === def) {
        setMatched((prev) => new Set(prev).add(term));
        setSelectedTerm(null);
        setSelectedDef(null);
      } else {
        triggerShake();
      }
    },
    [defByTerm, triggerShake],
  );

  function onTermClick(t: string) {
    if (matched.has(t) || finished) return;
    if (selectedDef) {
      tryMatch(t, selectedDef);
      return;
    }
    setSelectedTerm((prev) => (prev === t ? null : t));
  }

  function onDefClick(d: string) {
    if (finished) return;
    const owner = pairs.find((p) => p.definition === d)?.term;
    if (owner && matched.has(owner)) return;
    if (selectedTerm) {
      tryMatch(selectedTerm, d);
      return;
    }
    setSelectedDef((prev) => (prev === d ? null : d));
  }

  function playAgain() {
    setTermsOrder(shuffle(pairs.map((p) => p.term)));
    setDefsOrder(shuffle(pairs.map((p) => p.definition)));
    setMatched(new Set());
    setSelectedTerm(null);
    setSelectedDef(null);
    setSeconds(0);
    setRunning(true);
    setFinished(false);
  }

  const score = matched.size;

  return (
    <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Puzzle match</h3>
        <div className="flex gap-3 text-sm text-[var(--color-text-muted)]">
          <span>
            Score: <span className="font-semibold text-[var(--color-accent-purple)]">{score}</span> / {n}
          </span>
          <span>
            Time: <span className="font-mono text-[var(--color-text-primary)]">{formatTime(seconds)}</span>
          </span>
        </div>
      </div>

      <div className={`mt-6 grid gap-4 md:grid-cols-2 ${shake ? "crambly-shake" : ""}`}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Terms</p>
          <ul className="space-y-2">
            {termsOrder.map((t) => {
              const isMatched = matched.has(t);
              const isSel = selectedTerm === t;
              return (
                <li key={t}>
                  <button
                    type="button"
                    disabled={isMatched}
                    onClick={() => onTermClick(t)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                      isMatched
                        ? "cursor-default border-emerald-500/50 bg-emerald-500/10 text-[var(--color-success)]"
                        : isSel
                          ? "border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/12 text-[var(--color-text-primary)]"
                          : "border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]/35"
                    }`}
                  >
                    {t}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Definitions</p>
          <ul className="space-y-2">
            {defsOrder.map((d) => {
              const owner = pairs.find((p) => p.definition === d)?.term;
              const isMatched = owner ? matched.has(owner) : false;
              const isSel = selectedDef === d;
              return (
                <li key={d}>
                  <button
                    type="button"
                    disabled={isMatched}
                    onClick={() => onDefClick(d)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                      isMatched
                        ? "cursor-default border-emerald-500/50 bg-emerald-500/10 text-[var(--color-success)]"
                        : isSel
                          ? "border-[var(--color-accent-purple)] bg-[var(--color-accent-purple)]/12 text-[var(--color-text-primary)]"
                          : "border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]/35"
                    }`}
                  >
                    {d}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {finished && (
        <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center text-[var(--color-success)]">
          <p className="text-lg font-semibold">Well done!</p>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Time: {formatTime(seconds)}</p>
          <button
            type="button"
            onClick={() => playAgain()}
            className="mt-4 rounded-lg bg-[var(--color-success)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
