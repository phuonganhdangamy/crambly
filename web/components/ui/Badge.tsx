import type { HTMLAttributes } from "react";

const map = {
  success: "bg-[var(--color-success)]/15 text-[var(--color-success)] border-[var(--color-success)]/35",
  warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-[var(--color-warning)]/35",
  danger: "bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-[var(--color-danger)]/35",
  info: "bg-[var(--color-info)]/15 text-[var(--color-info)] border-[var(--color-info)]/35",
  neutral: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border-[var(--color-border-default)]",
} as const;

export function Badge({
  variant = "neutral",
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof map }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium ${map[variant]} ${className}`}
      {...rest}
    />
  );
}
