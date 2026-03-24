"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { readComplexityLevel, readLearnerMode } from "@/lib/readLearnerPrefs";
import type { FocusSection } from "@/lib/focusTypes";
import { FRICTION_TRIGGER } from "@/lib/focusSession";
import { useFocusStore } from "@/store/focusStore";
import type { ExplainPayload } from "./SimplifiedBlock";
import { SimplifiedBlock } from "./SimplifiedBlock";

type ExplainResponse = ExplainPayload & { error?: boolean };

export function StuckChip({
  section,
  frictionScore,
  smartNudgesEnabled,
  onSimplified,
  onVisualSimplified,
  onVisualClear,
}: {
  section: FocusSection;
  frictionScore: number;
  smartNudgesEnabled: boolean;
  onSimplified: () => void;
  onVisualSimplified: () => void;
  onVisualClear: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [errorTry, setErrorTry] = useState(false);
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [learnerSnapshot, setLearnerSnapshot] = useState<string>(() => readLearnerMode());
  const [autoPrimed, setAutoPrimed] = useState(false);
  const incrementSimplifications = useFocusStore((s) => s.incrementSimplifications);

  useEffect(() => {
    if (smartNudgesEnabled && frictionScore > FRICTION_TRIGGER) {
      setAutoPrimed(true);
    }
  }, [smartNudgesEnabled, frictionScore]);

  const showAutoChip =
    smartNudgesEnabled && frictionScore > FRICTION_TRIGGER && autoPrimed && !result && !loading;

  async function runSimplify() {
    const blockContent = (section.raw_content?.trim() ? section.raw_content : section.summary) || "";
    if (!blockContent.trim()) return;
    setLoading(true);
    setErrorTry(false);
    try {
      const res = await fetch("/api/explain-snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockContent,
          learnerMode: readLearnerMode(),
          complexityLevel: readComplexityLevel(),
          hasMath: section.has_math,
          hasCode: section.has_code,
        }),
      });
      const data = (await res.json()) as ExplainResponse;
      if (!data.simplified) {
        setErrorTry(true);
        return;
      }
      setLearnerSnapshot(readLearnerMode());
      setResult(data);
      onSimplified();
      onVisualSimplified();
      incrementSimplifications();
    } catch {
      setErrorTry(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative mt-3 min-h-[40px]">
      {result ? (
        <SimplifiedBlock
          simplified={result.simplified}
          worked_example={result.worked_example}
          key_terms={result.key_terms}
          learnerMode={learnerSnapshot}
          hasMath={false}
          onDismiss={() => {
            setResult(null);
            onVisualClear();
          }}
        />
      ) : null}

      {!result && showAutoChip ? (
        <motion.button
          type="button"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          disabled={loading}
          onClick={() => void runSimplify()}
          className="inline-flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-accent-orange)] bg-[var(--color-bg-elevated)] px-3.5 py-1.5 text-[13px] text-[var(--color-accent-orange)]"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent-orange)] border-t-transparent" />
              Thinking…
            </>
          ) : errorTry ? (
            "Try again"
          ) : (
            "Stuck? Simplify this ↓"
          )}
        </motion.button>
      ) : !result ? (
        <div className="group absolute bottom-0 right-0 flex justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSimplify()}
            className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-text-secondary)] border-t-transparent" />
                Thinking…
              </span>
            ) : errorTry ? (
              "Try again"
            ) : (
              "Simplify ↓"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
