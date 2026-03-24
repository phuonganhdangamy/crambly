"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { UploadPage } from "@/lib/api";
import type { FocusSection } from "@/lib/focusTypes";
import { FRICTION_TRIGGER } from "@/lib/focusSession";
import { readComplexityLevel, readLearnerMode } from "@/lib/readLearnerPrefs";
import { useFocusStore } from "@/store/focusStore";
import type { ExplainPayload } from "./SimplifiedBlock";
import { SimplifiedBlock } from "./SimplifiedBlock";

type ExplainResponse = ExplainPayload & { error?: boolean };

function SlideStuckChip({
  section,
  frictionScore,
  smartNudgesEnabled,
  onSimplifySuccess,
}: {
  section: FocusSection;
  frictionScore: number;
  smartNudgesEnabled: boolean;
  onSimplifySuccess: (payload: ExplainPayload, learnerSnapshot: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [errorTry, setErrorTry] = useState(false);
  const [autoPrimed, setAutoPrimed] = useState(false);
  const incrementSimplifications = useFocusStore((s) => s.incrementSimplifications);

  useEffect(() => {
    if (smartNudgesEnabled && frictionScore > FRICTION_TRIGGER) {
      setAutoPrimed(true);
    }
  }, [smartNudgesEnabled, frictionScore]);

  const showAutoChip =
    smartNudgesEnabled && frictionScore > FRICTION_TRIGGER && autoPrimed && !loading;

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
      const snap = readLearnerMode();
      onSimplifySuccess(data, snap);
      incrementSimplifications();
    } catch {
      setErrorTry(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {showAutoChip ? (
        <motion.button
          type="button"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          disabled={loading}
          onClick={() => void runSimplify()}
          className="pointer-events-auto z-[2] inline-flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-accent-orange)] bg-[rgba(0,0,0,0.7)] px-3.5 py-1.5 text-[13px] text-[var(--color-accent-orange)] backdrop-blur-sm"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent-orange)] border-t-transparent" />
              Thinking…
            </>
          ) : errorTry ? (
            "Try again"
          ) : (
            "Stuck? Simplify this slide ↓"
          )}
        </motion.button>
      ) : (
        <div className="pointer-events-auto z-[2] flex justify-end opacity-0 transition-opacity duration-150 group-hover/slide:opacity-100">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runSimplify()}
            className="rounded-[var(--radius-md)] border border-[var(--color-accent-orange)] bg-[rgba(0,0,0,0.65)] px-3 py-1.5 text-[12px] text-[var(--color-accent-orange)] backdrop-blur-sm"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent-orange)] border-t-transparent" />
                Thinking…
              </span>
            ) : errorTry ? (
              "Try again"
            ) : (
              "Simplify this slide ↓"
            )}
          </button>
        </div>
      )}
    </>
  );
}

function SlideFrame({
  page,
  concept,
  blockIndex,
  frictionScore,
  isHighFriction,
  smartNudgesEnabled,
  simplified,
  learnerMode,
  onDismissSimplified,
  onSimplifySuccess,
}: {
  page: UploadPage;
  concept: FocusSection | undefined;
  blockIndex: number;
  frictionScore: number;
  isHighFriction: boolean;
  smartNudgesEnabled: boolean;
  simplified: ExplainPayload | null | undefined;
  learnerMode: string;
  onDismissSimplified: () => void;
  onSimplifySuccess: (payload: ExplainPayload, learnerSnapshot: string) => void;
}) {
  const frictionStyle = {
    "--friction": frictionScore,
  } as React.CSSProperties;

  return (
    <div
      data-concept-id={concept?.id ?? ""}
      data-block-index={blockIndex}
      className="slide-frame focus-friction-target mx-auto mb-4 max-w-[800px] last:mb-0"
      style={frictionStyle}
    >
      <div
        className={`overflow-hidden rounded-[var(--radius-lg)] transition-[border-color] duration-[800ms] ease-out ${
          isHighFriction
            ? "border-2 border-[var(--color-accent-orange)]"
            : "border border-[var(--color-border-default)]"
        }`}
      >
        <div className="group/slide relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs */}
          <img
            src={page.signed_url}
            alt={concept ? `${concept.title} — slide ${page.page_number}` : `Slide ${page.page_number}`}
            className="block h-auto w-full"
            width={page.width || undefined}
            height={page.height || undefined}
            loading="lazy"
          />
          <div
            className="pointer-events-none absolute inset-0 transition-[background] duration-[800ms] ease-out"
            style={{
              background: `rgba(255, 123, 53, ${frictionScore * 0.12})`,
            }}
          />
          <div
            className="pointer-events-none absolute left-2 top-2 rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] text-white"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            {page.page_number}
          </div>
          {concept ? (
            <div className="absolute bottom-3 right-3 z-[2] flex justify-end">
              <SlideStuckChip
                section={concept}
                frictionScore={frictionScore}
                smartNudgesEnabled={smartNudgesEnabled}
                onSimplifySuccess={onSimplifySuccess}
              />
            </div>
          ) : null}
        </div>
        {simplified && concept ? (
          <div className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-5 py-4">
            <SimplifiedBlock
              simplified={simplified.simplified}
              worked_example={simplified.worked_example}
              key_terms={simplified.key_terms}
              learnerMode={learnerMode}
              hasMath={false}
              onDismiss={onDismissSimplified}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SlideImageReader({
  pages,
  concepts,
  frictionScores,
  highFrictionIds,
  smartNudgesEnabled,
  simplifiedByConcept,
  learnerModeByConcept,
  onSimplifySuccess,
  onDismissSimplified,
}: {
  pages: UploadPage[];
  concepts: FocusSection[];
  frictionScores: Record<string, number>;
  highFrictionIds: string[];
  smartNudgesEnabled: boolean;
  simplifiedByConcept: Record<string, ExplainPayload | undefined>;
  learnerModeByConcept: Record<string, string>;
  onSimplifySuccess: (conceptId: string, payload: ExplainPayload, learnerSnapshot: string) => void;
  onDismissSimplified: (conceptId: string) => void;
}) {
  const sorted = useMemo(
    () => [...pages].sort((a, b) => a.page_number - b.page_number),
    [pages],
  );

  const conceptById = useMemo(
    () => Object.fromEntries(concepts.map((c) => [c.id, c])) as Record<string, FocusSection>,
    [concepts],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      {sorted.map((page, blockIndex) => {
        const concept = page.concept_id ? conceptById[page.concept_id] : undefined;
        const cid = concept?.id ?? "";
        const f = cid ? (frictionScores[cid] ?? 0) : 0;
        const isHigh = cid ? highFrictionIds.includes(cid) : false;
        const simplified = cid ? simplifiedByConcept[cid] : undefined;
        const lm = cid ? (learnerModeByConcept[cid] ?? readLearnerMode()) : readLearnerMode();

        return (
          <SlideFrame
            key={`${page.page_number}-${page.signed_url.slice(-24)}`}
            page={page}
            concept={concept}
            blockIndex={blockIndex}
            frictionScore={f}
            isHighFriction={isHigh}
            smartNudgesEnabled={smartNudgesEnabled}
            simplified={simplified}
            learnerMode={lm}
            onDismissSimplified={() => {
              if (cid) onDismissSimplified(cid);
            }}
            onSimplifySuccess={(payload, snap) => {
              if (cid) onSimplifySuccess(cid, payload, snap);
            }}
          />
        );
      })}
    </div>
  );
}
