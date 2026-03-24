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
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Puzzle match</h3>
        <div className="flex gap-3 text-sm text-slate-400">
          <span>
            Score: <span className="font-semibold text-indigo-200">{score}</span> / {n}
          </span>
          <span>
            Time: <span className="font-mono text-slate-200">{formatTime(seconds)}</span>
          </span>
        </div>
      </div>

      <div className={`mt-6 grid gap-4 md:grid-cols-2 ${shake ? "crambly-shake" : ""}`}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Terms</p>
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
                        ? "cursor-default border-emerald-500/60 bg-emerald-500/20 text-emerald-100"
                        : isSel
                          ? "border-indigo-400 bg-indigo-500/20 text-white"
                          : "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-slate-500"
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
                        ? "cursor-default border-emerald-500/60 bg-emerald-500/20 text-emerald-100"
                        : isSel
                          ? "border-indigo-400 bg-indigo-500/20 text-white"
                          : "border-slate-700 bg-slate-800/80 text-slate-200 hover:border-slate-500"
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
        <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center text-emerald-100">
          <p className="text-lg font-semibold">Well done!</p>
          <p className="mt-1 text-sm text-emerald-200/90">Time: {formatTime(seconds)}</p>
          <button
            type="button"
            onClick={() => playAgain()}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
