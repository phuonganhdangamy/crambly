"use client";

export function Shimmer({
  width = "100%",
  height = 16,
  borderRadius = "var(--radius-md)",
  className = "",
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}) {
  const w = typeof width === "number" ? `${width}px` : width;
  const h = typeof height === "number" ? `${height}px` : height;
  return (
    <div
      className={`crambly-shimmer-block bg-[var(--color-bg-secondary)] ${className}`}
      style={{ width: w, height: h, borderRadius }}
      aria-hidden
    />
  );
}
