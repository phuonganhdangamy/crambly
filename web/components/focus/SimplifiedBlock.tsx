"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { MathRichText } from "./MathRichText";

export type ExplainPayload = {
  simplified: string;
  worked_example: string | null;
  key_terms: string[];
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function GlobalScholarBody({ text, terms }: { text: string; terms: string[] }) {
  const nodes = useMemo(() => {
    if (terms.length === 0) return text;
    const uniq = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean))).sort(
      (a, b) => b.length - a.length,
    );
    if (uniq.length === 0) return text;
    const pattern = new RegExp(`(${uniq.map(escapeRegExp).join("|")})`, "gi");
    const parts = text.split(pattern);
    return parts.map((part, i) => {
      const hit = uniq.some((t) => t.toLowerCase() === part.toLowerCase());
      if (hit) {
        return (
          <strong key={i} className="font-semibold text-[var(--color-text-primary)]">
            {part}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [text, terms]);

  return <div className="whitespace-pre-wrap text-[var(--color-text-primary)]">{nodes}</div>;
}

function AdhdBody({ text }: { text: string }) {
  const idx = text.search(/[.!?]\s/);
  const first = idx === -1 ? text : text.slice(0, idx + 1);
  const rest = idx === -1 ? "" : text.slice(idx + 1).trim();
  return (
    <div className="text-[var(--color-text-primary)]">
      <p className="mb-2 text-[17px] font-medium leading-snug">{first}</p>
      {rest ? <p className="text-[15px] leading-relaxed">{rest}</p> : null}
    </div>
  );
}

export function SimplifiedBlock({
  simplified,
  worked_example,
  key_terms,
  learnerMode,
  hasMath,
  onDismiss,
}: ExplainPayload & {
  learnerMode: string;
  hasMath: boolean;
  onDismiss: () => void;
}) {
  const [openExample, setOpenExample] = useState(false);
  const [visible, setVisible] = useState(true);

  function handleDismiss() {
    setVisible(false);
  }

  return (
    <AnimatePresence
      onExitComplete={() => {
        onDismiss();
      }}
    >
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: visible ? 0.25 : 0.2 }}
          className="mt-4 overflow-hidden rounded-[var(--radius-md)] border-l-[3px] border-[var(--color-accent-cyan)] bg-[var(--color-bg-tertiary)] px-5 py-4"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--color-accent-cyan)]">✦ Simplified</span>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[13px] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              ✕ Dismiss
            </button>
          </div>
          {learnerMode === "global_scholar" && !hasMath ? (
            <GlobalScholarBody text={simplified} terms={key_terms} />
          ) : learnerMode === "adhd" && !hasMath ? (
            <AdhdBody text={simplified} />
          ) : (
            <MathRichText text={simplified} hasMath={hasMath} />
          )}
          {key_terms.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] text-[var(--color-text-secondary)]">Key terms:</p>
              <div className="flex flex-wrap gap-1.5">
                {key_terms.map((t) => (
                  <span
                    key={t}
                    className="rounded-md bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {worked_example != null && worked_example.trim().length > 0 && (
            <div className="mt-4 border-t border-[var(--color-border-default)] pt-3">
              <button
                type="button"
                onClick={() => setOpenExample((o) => !o)}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {openExample ? "▾ Hide worked example" : "▸ Show worked example"}
              </button>
              {openExample && (
                <div className="mt-2 text-[var(--color-text-primary)]">
                  <MathRichText text={worked_example} hasMath={hasMath} />
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
