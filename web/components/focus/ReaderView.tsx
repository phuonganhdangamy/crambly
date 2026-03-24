"use client";

import { motion } from "framer-motion";
import type { FocusSection } from "@/lib/focusTypes";
import { SectionContent } from "./SectionContent";
import { StuckChip } from "./StuckChip";

export function ReaderView({
  sections,
  frictionScores,
  smartNudgesEnabled,
  onResetBlock,
  simplifiedIds,
  onSimplifiedVisual,
  onClearVisual,
}: {
  sections: FocusSection[];
  frictionScores: Record<string, number>;
  smartNudgesEnabled: boolean;
  onResetBlock: (blockId: string) => void;
  simplifiedIds: Record<string, boolean>;
  onSimplifiedVisual: (blockId: string) => void;
  onClearVisual: (blockId: string) => void;
}) {
  return (
    <div className="w-full">
      {sections.map((section, index) => {
        const f = frictionScores[section.id] ?? 0;
        return (
          <motion.div
            key={section.id}
            data-concept-id={section.id}
            data-block-index={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.06 }}
            style={{ "--friction": f } as React.CSSProperties}
            className={`reader-block focus-friction-target ${simplifiedIds[section.id] ? "simplified" : ""}`}
          >
            <h3 className="mb-3 text-[1.1rem] font-semibold text-[var(--color-text-primary)]">
              {section.title}
            </h3>
            <SectionContent section={section} />
            <StuckChip
              section={section}
              frictionScore={f}
              smartNudgesEnabled={smartNudgesEnabled}
              onSimplified={() => onResetBlock(section.id)}
              onVisualSimplified={() => onSimplifiedVisual(section.id)}
              onVisualClear={() => onClearVisual(section.id)}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
