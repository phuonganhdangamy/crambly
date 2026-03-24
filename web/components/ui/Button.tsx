"use client";

import type { ButtonHTMLAttributes } from "react";

const base =
  "inline-flex min-h-[40px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] px-4 font-medium transition-[background,border-color,box-shadow,color,opacity,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

const variants = {
  primary:
    "bg-[var(--color-accent-cyan)] text-[#0d1117] shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-neon-cyan)]",
  secondary:
    "border border-[var(--color-accent-cyan)] bg-transparent text-[var(--color-accent-cyan)] hover:bg-[var(--color-bg-tertiary)]",
  ghost: "border-0 bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]",
  danger: "border border-[var(--color-danger)] bg-transparent text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10",
} as const;

export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  loading?: boolean;
}) {
  const v = variants[variant];
  return (
    <button
      type={rest.type ?? "button"}
      className={`${base} ${v} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : (
        children
      )}
    </button>
  );
}
