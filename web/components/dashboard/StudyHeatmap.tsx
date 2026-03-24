"use client";

import { useEffect, useMemo, useState } from "react";
import { currentStreakFromHeatmap, getSessionHeatmap } from "@/lib/localSessions";

function intensityClass(n: number): string {
  if (n <= 0) return "bg-[var(--color-bg-tertiary)]";
  if (n <= 2) return "bg-[#0e4429]";
  if (n <= 4) return "bg-[#006d32]";
  if (n <= 6) return "bg-[#26a641]";
  return "bg-[#7EE787] shadow-[0_0_6px_rgba(126,231,135,0.35)]";
}

function formatDay(iso: string) {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export function StudyHeatmap() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const cells = useMemo(
    () => (hydrated ? getSessionHeatmap() : Array.from({ length: 84 }, () => ({ date: "", count: 0 }))),
    [hydrated],
  );
  const weeks = useMemo(() => {
    const w: (typeof cells)[] = [];
    for (let i = 0; i < 12; i++) w.push(cells.slice(i * 7, i * 7 + 7));
    return w;
  }, [cells]);
  const streak = useMemo(() => currentStreakFromHeatmap(cells), [cells]);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Study streak</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          <span className="font-semibold text-[var(--color-accent-orange)]">{streak}</span> day streak 🔥
        </p>
      </div>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Local sessions (this browser) · 7 days × 12 weeks</p>

      <div className="mt-4 flex gap-2 overflow-x-auto">
        <div className="flex w-7 shrink-0 flex-col gap-[3px] pt-5 text-[9px] text-[var(--color-text-muted)]">
          {weeks.map((_, i) => (
            <div key={i} className="flex h-3 items-center justify-end pr-1">
              {i % 3 === 0 ? `w${i + 1}` : ""}
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 flex gap-[3px]">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={`${d}-${i}`} className="flex h-4 w-3 items-center justify-center text-[9px] text-[var(--color-text-muted)]">
                {i % 2 === 0 ? d : ""}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex gap-[3px]">
                {week.map((cell) => (
                  <div
                    key={cell.date}
                    className={`h-3 w-3 shrink-0 rounded-[3px] ${intensityClass(cell.count)}`}
                    title={`${cell.count} session${cell.count === 1 ? "" : "s"} on ${formatDay(cell.date)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
        <span>Less</span>
        <div className="flex gap-0.5">
          {[0, 1, 3, 5, 8].map((n) => (
            <div key={n} className={`h-3 w-3 rounded-[3px] ${intensityClass(n)}`} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
