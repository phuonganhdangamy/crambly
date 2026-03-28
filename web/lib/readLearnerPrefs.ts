export function readLearnerMode(): string {
  if (typeof window === "undefined") return "adhd";
  return localStorage.getItem("crambly_mode") || "adhd";
}

export function readComplexityLevel(): number {
  if (typeof window === "undefined") return 50;
  const d = localStorage.getItem("crambly_complexity");
  if (!d) return 50;
  const n = Number(d);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
