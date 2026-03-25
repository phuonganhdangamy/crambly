"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { FocusSection } from "@/lib/focusTypes";

function barColor(score: number): string {
  if (score <= 0.3) return "var(--color-accent-lime)";
  if (score <= 0.6) return "var(--color-accent-orange)";
  return "var(--color-danger)";
}

function dotColor(score: number, simplified: boolean, visited: boolean): string {
  if (simplified) return "var(--color-accent-cyan)";
  if (!visited) return "var(--color-text-muted)";
  if (score <= 0.3) return "var(--color-accent-lime)";
  if (score <= 0.6) return "var(--color-accent-orange)";
  return "var(--color-danger)";
}

export function SessionHeatDots({
  sections,
  frictionScores,
  simplifiedIds,
  sectionsReviewed,
}: {
  sections: FocusSection[];
  frictionScores: Record<string, number>;
  simplifiedIds: Record<string, boolean>;
  sectionsReviewed: string[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 py-2">
      {sections.map((s) => {
        const sc = frictionScores[s.id] ?? 0;
        const sim = Boolean(simplifiedIds[s.id]);
        const visited = sectionsReviewed.includes(s.id);
        return (
          <span
            key={s.id}
            title={s.title}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: dotColor(sc, sim, visited) }}
          />
        );
      })}
    </div>
  );
}

export function FrictionHeatmap({
  sections,
  frictionScores,
  simplificationsUsed,
  sectionsReviewed,
  simplifiedIds,
  onSectionClick,
  collapsed: collapsedProp,
  onCollapsedChange,
  docked = false,
}: {
  sections: FocusSection[];
  frictionScores: Record<string, number>;
  simplificationsUsed: number;
  sectionsReviewed: string[];
  simplifiedIds: Record<string, boolean>;
  onSectionClick: (blockId: string) => void;
  /** Controlled collapsed state (slim progress rail vs full heatmap). */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** When true, fills a fixed parent rail (no sticky / floating card). */
  docked?: boolean;
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const collapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;
  function setCollapsed(next: boolean) {
    onCollapsedChange?.(next);
    if (collapsedProp === undefined) setInternalCollapsed(next);
  }

  const mostTimeId = useMemo(() => {
    let best = "";
    let bestV = -1;
    for (const s of sections) {
      const v = frictionScores[s.id] ?? 0;
      if (v > bestV) {
        bestV = v;
        best = s.id;
      }
    }
    return best;
  }, [sections, frictionScores]);

  const mostTitle = sections.find((s) => s.id === mostTimeId)?.title ?? "—";

  return (
    <motion.div
      layout={!docked}
      className={`flex h-full min-h-0 w-full flex-col ${
        docked
          ? "bg-transparent p-2"
          : "sticky top-16 z-10 max-h-[calc(100vh-80px)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4"
      }`}
      style={docked ? undefined : { width: collapsed ? 40 : "100%" }}
      transition={{ duration: 0.25 }}
    >
      <div
        className={`mb-2 flex shrink-0 items-start gap-2 ${collapsed ? "flex-col items-center" : ""} ${docked && collapsed ? "items-center" : ""}`}
      >
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Reading heatmap</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">Warmer = more time spent</p>
          </div>
        )}
        <button
          type="button"
          aria-label={collapsed ? "Expand heatmap" : "Collapse heatmap"}
          onClick={() => setCollapsed(!collapsed)}
          className={`shrink-0 rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] ${docked && collapsed ? "" : collapsed ? "" : "ml-auto"}`}
        >
          {collapsed ? "◀" : "▶"}
        </button>
      </div>

      {collapsed ? (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-1">
          {sections.map((s) => {
            const sc = frictionScores[s.id] ?? 0;
            const sim = Boolean(simplifiedIds[s.id]);
            const visited = sectionsReviewed.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                title={s.title}
                onClick={() => onSectionClick(s.id)}
                className="h-2 w-2 rounded-full transition-transform hover:scale-125"
                style={{ background: dotColor(sc, sim, visited) }}
              />
            );
          })}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {sections.map((s) => {
            const sc = frictionScores[s.id] ?? 0;
            const sim = Boolean(simplifiedIds[s.id]);
            const visited = sectionsReviewed.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSectionClick(s.id)}
                  className="w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-[var(--color-bg-tertiary)]"
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-[var(--color-text-primary)]">{s.title}</p>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: dotColor(sc, sim, visited) }}
                    />
                  </div>
                  <div
                    className="mt-1 h-1 w-full overflow-hidden rounded-[2px]"
                    style={{ background: "var(--color-bg-tertiary)" }}
                  >
                    <div
                      className="h-full rounded-[2px] transition-[width,background-color] duration-[800ms,400ms] ease-out"
                      style={{
                        width: `${Math.min(100, sc * 100)}%`,
                        background: visited ? barColor(sc) : "transparent",
                      }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!collapsed && (
        <div className="mt-4 shrink-0 border-t border-[var(--color-border-default)] pt-3 text-xs text-[var(--color-text-secondary)]">
          <p>
            {sectionsReviewed.length} / {sections.length} sections visited
          </p>
          <p className="mt-1">{simplificationsUsed} simplifications used</p>
          <p className="mt-1 truncate" title={mostTitle}>
            Most time: {mostTitle}
          </p>
        </div>
      )}
    </motion.div>
  );
}
