"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LetterState = "empty" | "tbd" | "absent" | "present" | "correct";

function scoreGuess(guess: string, target: string): LetterState[] {
  const g = guess.toLowerCase().split("");
  const t = target.toLowerCase().split("");
  const res: LetterState[] = Array(5).fill("absent");
  const counts = new Map<string, number>();
  for (const c of t) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (let i = 0; i < 5; i++) {
    if (g[i] === t[i]) {
      res[i] = "correct";
      counts.set(g[i], (counts.get(g[i]) ?? 0) - 1);
    }
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === "correct") continue;
    const n = counts.get(g[i]) ?? 0;
    if (n > 0) {
      res[i] = "present";
      counts.set(g[i], n - 1);
    }
  }
  return res;
}

const ROWS = 6;

function cellClass(s: LetterState): string {
  if (s === "correct") return "border-emerald-500 bg-emerald-600 text-white";
  if (s === "present") return "border-amber-500 bg-amber-600 text-white";
  if (s === "absent") return "border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
  if (s === "tbd") return "border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]";
  return "border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-[var(--color-text-muted)]";
}

type GameStatus = "playing" | "won" | "lost" | "revealed";

export function Wordle({
  wordBank,
  conceptHints,
  onWin,
}: {
  wordBank: string[];
  conceptHints: { term: string; definition: string }[];
  /** Fires once when the player solves the puzzle (for celebratory UI only). */
  onWin?: () => void;
}) {
  const playable = useMemo(() => {
    const set = new Set<string>();
    for (const w of wordBank) {
      const x = w.toLowerCase().replace(/[^a-z]/g, "");
      if (x.length === 5) set.add(x);
    }
    return Array.from(set);
  }, [wordBank]);

  const [target, setTarget] = useState(() => "");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<GameStatus>("playing");
  const [celebrate, setCelebrate] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [firstLetterRevealed, setFirstLetterRevealed] = useState(false);

  const pickWord = useCallback(
    (opts?: { excludeCurrent?: boolean }) => {
      if (playable.length === 0) return;
      let pool = playable;
      if (opts?.excludeCurrent && target && playable.length > 1) {
        pool = playable.filter((w) => w !== target);
      }
      const w = pool[Math.floor(Math.random() * pool.length)] ?? "";
      setTarget(w);
      setGuesses([]);
      setCurrent("");
      setStatus("playing");
      setCelebrate(false);
      setHintOpen(false);
      setFirstLetterRevealed(false);
    },
    [playable, target],
  );

  useEffect(() => {
    pickWord();
  }, [pickWord]);

  const definitionFor = useCallback(
    (word: string) => {
      const low = word.toLowerCase();
      const hit = conceptHints.find(
        (h) =>
          h.term.toLowerCase() === low ||
          h.term.toLowerCase().includes(low) ||
          low.includes(h.term.toLowerCase()),
      );
      return hit?.definition ?? "Definition from your materials — keep this term in mind for the exam.";
    },
    [conceptHints],
  );

  const submit = useCallback(() => {
    if (status !== "playing" || current.length !== 5 || !target) return;
    const g = current.toLowerCase();
    if (!playable.includes(g)) return;
    const next = [...guesses, g];
    setGuesses(next);
    setCurrent("");
    if (g === target) {
      setStatus("won");
      setCelebrate(true);
      onWin?.();
      return;
    }
    if (next.length >= ROWS) setStatus("lost");
  }, [current, guesses, onWin, playable, status, target]);

  const revealAnswer = useCallback(() => {
    if (!target || status === "won") return;
    setStatus("revealed");
    setCurrent("");
  }, [status, target]);

  const applyHint = useCallback(() => {
    if (!target || status !== "playing") return;
    setHintOpen(true);
    if (!firstLetterRevealed) {
      setFirstLetterRevealed(true);
      const L = target[0]?.toLowerCase() ?? "";
      if (L && !current.startsWith(L)) {
        setCurrent((c) => (c.length === 0 ? L : c));
      }
    }
  }, [current, firstLetterRevealed, status, target]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (status !== "playing") return;
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        setCurrent((c) => (c.length < 5 ? c + e.key.toLowerCase() : c));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, submit]);

  const grid: { letter: string; state: LetterState }[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: { letter: string; state: LetterState }[] = [];
    if (r < guesses.length) {
      const sc = scoreGuess(guesses[r]!, target);
      for (let c = 0; c < 5; c++) row.push({ letter: guesses[r]![c]!.toUpperCase(), state: sc[c]! });
    } else if (r === guesses.length && status === "playing") {
      for (let c = 0; c < 5; c++) {
        const ch = current[c]?.toUpperCase() ?? "";
        row.push({ letter: ch, state: ch ? "tbd" : "empty" });
      }
    } else {
      for (let c = 0; c < 5; c++) row.push({ letter: "", state: "empty" });
    }
    grid.push(row);
  }

  if (playable.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 text-[var(--color-text-secondary)]">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Wordle</h3>
        <p className="mt-2 text-sm">No five-letter terms in your word bank yet.</p>
      </div>
    );
  }

  const canPlay = status === "playing";
  const answerRow =
    status === "revealed" && target
      ? target
          .toUpperCase()
          .split("")
          .map((letter) => ({ letter, state: "correct" as LetterState }))
      : null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Wordle</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canPlay || !target}
            onClick={() => applyHint()}
            className="rounded-lg border border-[var(--color-warning)]/45 px-3 py-1 text-sm text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hint
          </button>
          <button
            type="button"
            disabled={!target || status === "won"}
            onClick={() => revealAnswer()}
            className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reveal answer
          </button>
          <button
            type="button"
            onClick={() => pickWord({ excludeCurrent: playable.length > 1 })}
            className="rounded-lg border border-[var(--color-accent-cyan)]/45 px-3 py-1 text-sm text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)]/10"
          >
            Skip to next word
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Six guesses · your lecture&apos;s vocabulary</p>

      {hintOpen && target && (
        <div className="mt-4 rounded-lg border border-[var(--color-warning)]/35 bg-[var(--color-warning)]/8 p-3 text-sm text-[var(--color-text-primary)]">
          <p className="font-medium text-[var(--color-warning)]">Hint</p>
          <p className="mt-1 text-[var(--color-text-secondary)]">{definitionFor(target)}</p>
          {firstLetterRevealed && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">First letter: {target[0]?.toUpperCase() ?? "—"}</p>
          )}
        </div>
      )}

      <div className="mx-auto mt-6 flex flex-col gap-1.5 sm:max-w-[340px]">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-5 gap-1.5">
            {row.map((cell, ci) => (
              <div
                key={ci}
                className={`flex aspect-square items-center justify-center rounded-md border-2 text-lg font-bold uppercase ${cellClass(cell.state)}`}
              >
                {cell.letter}
              </div>
            ))}
          </div>
        ))}
        {answerRow && (
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {answerRow.map((cell, ci) => (
              <div
                key={ci}
                className={`flex aspect-square items-center justify-center rounded-md border-2 text-lg font-bold uppercase ${cellClass(cell.state)}`}
              >
                {cell.letter}
              </div>
            ))}
          </div>
        )}
      </div>

      {status === "won" && (
        <div
          className={`mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-[var(--color-success)] ${
            celebrate ? "animate-pulse" : ""
          }`}
        >
          <p className="text-lg font-semibold">You got it! 🎉</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{definitionFor(target)}</p>
        </div>
      )}
      {status === "lost" && (
        <div className="mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-[var(--color-danger)]">
          <p className="font-semibold">The word was {target.toUpperCase()}</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{definitionFor(target)}</p>
        </div>
      )}
      {status === "revealed" && (
        <div className="mt-6 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-4 text-[var(--color-text-primary)]">
          <p className="font-semibold">Answer revealed: {target.toUpperCase()}</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{definitionFor(target)}</p>
        </div>
      )}

      <div className="mx-auto mt-6 max-w-[480px] space-y-2">
        <div className="flex flex-wrap justify-center gap-1">
          {"qwertyuiop".split("").map((k) => (
            <KeyCap key={k} k={k} onPress={() => canPlay && setCurrent((c) => (c.length < 5 ? c + k : c))} />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {"asdfghjkl".split("").map((k) => (
            <KeyCap key={k} k={k} onPress={() => canPlay && setCurrent((c) => (c.length < 5 ? c + k : c))} />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          <button
            type="button"
            className="rounded bg-slate-700 px-2 py-2 text-xs font-semibold text-white"
            onClick={() => canPlay && submit()}
          >
            Enter
          </button>
          {"zxcvbnm".split("").map((k) => (
            <KeyCap key={k} k={k} onPress={() => canPlay && setCurrent((c) => (c.length < 5 ? c + k : c))} />
          ))}
          <button
            type="button"
            className="rounded bg-[var(--color-bg-tertiary)] px-2 py-2 text-xs font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-default)]"
            onClick={() => canPlay && setCurrent((c) => c.slice(0, -1))}
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyCap({ k, onPress }: { k: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="min-w-[2rem] rounded bg-[var(--color-bg-tertiary)] px-2 py-2 text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-default)] hover:bg-[var(--color-bg-elevated)]"
    >
      {k.toUpperCase()}
    </button>
  );
}
