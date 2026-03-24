"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Shimmer } from "./Shimmer";

export function Card({
  children,
  hoverable,
  glow,
  loading,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  hoverable?: boolean;
  glow?: boolean;
  loading?: boolean;
  children?: ReactNode;
}) {
  if (loading) {
    return (
      <div
        className={`rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 ${className}`}
        {...rest}
      >
        <Shimmer height={20} width="55%" className="mb-4" />
        <Shimmer height={14} width="100%" className="mb-2" />
        <Shimmer height={14} width="88%" />
      </div>
    );
  }

  const hover =
    hoverable || glow
      ? "transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-[var(--color-accent-cyan)]/50"
      : "";
  const glowCls = glow ? "hover:shadow-[var(--shadow-neon-cyan)]" : "";

  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-card)] ${hover} ${glowCls} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
