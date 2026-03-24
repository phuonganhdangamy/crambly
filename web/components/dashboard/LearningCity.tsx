"use client";

import { motion } from "framer-motion";

/** Course slice for the isometric city; internals may later swap to R3F without changing this API. */
export type LearningCityCourse = {
  id: string;
  code: string;
  color: string;
  /** 0–100 visual fill height */
  completionPercent: number;
  isMostRecent?: boolean;
};

export type LearningCityProps = {
  courses: LearningCityCourse[];
  onSelectCourse: (id: string) => void;
};

const MAX_H = 112;
const BASE_W = 40;

export function LearningCity({ courses, onSelectCourse }: LearningCityProps) {
  if (courses.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]/80 p-8 text-center text-sm text-[var(--color-text-secondary)]">
        Create a course to populate your learning city — each building tracks how much material you&apos;ve linked.
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Your Learning City</h3>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Tap a tower — height reflects linked progress (demo heuristic).</p>

      <div
        className="mt-8 flex items-end justify-center gap-8 overflow-x-auto pb-2 pt-6"
        role="list"
        aria-label="Courses as city buildings"
      >
        {courses.map((c, i) => {
          const h = Math.max(24, (c.completionPercent / 100) * MAX_H);
          return (
            <motion.button
              key={c.id}
              type="button"
              role="listitem"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.25 }}
              onClick={() => onSelectCourse(c.id)}
              className="group flex min-w-[56px] flex-col items-center gap-2 rounded-[var(--radius-md)] p-2 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)]"
              aria-label={`Open course ${c.code}`}
            >
              <div
                className="relative flex items-end justify-center"
                style={{
                  width: BASE_W + 16,
                  height: MAX_H + 20,
                  transform: "skewX(-8deg)",
                  transformOrigin: "bottom center",
                }}
              >
                <div className="relative flex flex-col items-center justify-end" style={{ width: BASE_W, height: MAX_H + 12 }}>
                  <div
                    className="absolute -top-2 left-1/2 h-3 w-[calc(100%+8px)] -translate-x-1/2 rounded-sm opacity-90"
                    style={{
                      backgroundColor: c.color,
                      boxShadow: c.isMostRecent ? "0 0 14px rgba(0,217,255,0.45)" : "none",
                    }}
                  />
                  <motion.div
                    className={`w-full rounded-t-md rounded-b-sm border border-white/10 ${c.isMostRecent ? "crambly-building-pulse" : ""}`}
                    style={{
                      backgroundColor: c.color,
                      boxShadow: c.isMostRecent ? "0 0 12px rgba(0,217,255,0.35)" : "var(--shadow-card)",
                    }}
                    initial={{ height: 20 }}
                    animate={{ height: h }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                  />
                </div>
              </div>
              <span className="max-w-[80px] -skew-x-[0deg] truncate font-mono text-[10px] font-semibold text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent-cyan)]">
                {c.code}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
