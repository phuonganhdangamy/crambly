"use client";

import { useState } from "react";
import { MathRichText } from "./MathRichText";

export type WorkedExample = {
  scenario: string;
  steps: string[];
  plain_english: string;
};

export function WorkedExampleCard({ example }: { example: WorkedExample }) {
  const [open, setOpen] = useState(false);
  const has =
    example.scenario.trim() ||
    (example.steps && example.steps.length > 0) ||
    example.plain_english.trim();

  if (!has) return null;

  return (
    <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-950/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-indigo-200 hover:bg-indigo-900/30"
      >
        <span>Worked example</span>
        <span className="text-indigo-400/80">{open ? "Hide" : "Show"}</span>
      </button>
      {!open && (
        <p className="border-t border-indigo-500/20 px-4 py-3 text-sm text-slate-400">
          Try it first — sketch your own approach, then reveal the walkthrough.
        </p>
      )}
      {open && (
        <div className="space-y-3 border-t border-indigo-500/20 px-4 py-4 text-sm text-slate-200">
          {example.scenario.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Scenario</p>
              <div className="mt-1">
                <MathRichText text={example.scenario} />
              </div>
            </div>
          )}
          {example.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Steps</p>
              <ol className="mt-2 list-decimal space-y-2 pl-5">
                {example.steps.map((st, i) => (
                  <li key={i}>
                    <MathRichText text={st} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {example.plain_english.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">What it means</p>
              <div className="mt-1 text-slate-300">
                <MathRichText text={example.plain_english} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
