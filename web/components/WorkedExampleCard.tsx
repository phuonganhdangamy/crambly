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
    <div className="mt-4 rounded-xl border border-[var(--worked-example-border)] bg-[var(--worked-example-bg)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--worked-example-header-hover)]"
      >
        <span>Worked example</span>
        <span className="font-medium text-[var(--worked-example-action)]">{open ? "Hide" : "Show"}</span>
      </button>
      {!open && (
        <p className="border-t border-[var(--worked-example-divider)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          Try it first — sketch your own approach, then reveal the walkthrough.
        </p>
      )}
      {open && (
        <div className="space-y-3 border-t border-[var(--worked-example-divider)] px-4 py-4 text-sm text-[var(--color-text-primary)]">
          {example.scenario.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--worked-example-label)]">
                Scenario
              </p>
              <div className="mt-1">
                <MathRichText text={example.scenario} inheritThemeColor />
              </div>
            </div>
          )}
          {example.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--worked-example-label)]">Steps</p>
              <ol className="mt-2 list-decimal space-y-2 pl-5">
                {example.steps.map((st, i) => (
                  <li key={i}>
                    <MathRichText text={st} inheritThemeColor />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {example.plain_english.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--worked-example-label)]">
                What it means
              </p>
              <div className="mt-1 text-[var(--color-text-primary)]">
                <MathRichText text={example.plain_english} inheritThemeColor />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
