"use client";

import { motion, useReducedMotion } from "framer-motion";

export function ProgressBar({
  value,
  color = "var(--color-accent-cyan)",
  className = "",
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const reduce = useReducedMotion();

  return (
    <div
      className={`h-[6px] w-full overflow-hidden rounded-full bg-[var(--color-bg-tertiary)] ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          backgroundColor: color,
          boxShadow: reduce ? undefined : `0 0 10px ${color}55`,
        }}
        initial={{ width: reduce ? `${v}%` : "0%" }}
        animate={{ width: `${v}%` }}
        transition={{ duration: reduce ? 0 : 0.45, ease: "easeOut" }}
      />
    </div>
  );
}
