"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`h-11 min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] transition-[border-color,box-shadow] duration-150 focus:border-[var(--color-accent-cyan)] focus:outline-none focus:shadow-[var(--shadow-neon-cyan)] ${className}`}
      {...rest}
    />
  );
});
