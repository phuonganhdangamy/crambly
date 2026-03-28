/** Client-only daily session counts for the dashboard heatmap (no backend). */

const KEY = "crambly_daily_sessions_v1";

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function recordStudySession() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const o: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const k = todayKey();
    o[k] = (o[k] ?? 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

/** Last 84 days (12 weeks × 7), oldest first; value = session count */
export function getSessionHeatmap(): { date: string; count: number }[] {
  if (typeof window === "undefined") return Array.from({ length: 84 }, () => ({ date: "", count: 0 }));
  let map: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) map = JSON.parse(raw) as Record<string, number>;
  } catch {
    map = {};
  }
  const out: { date: string; count: number }[] = [];
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  for (let i = 83; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = todayKey(d);
    out.push({ date: k, count: map[k] ?? 0 });
  }
  return out;
}

export function currentStreakFromHeatmap(cells: { date: string; count: number }[]): number {
  let streak = 0;
  const byDate = new Map(cells.map((c) => [c.date, c.count]));
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  for (;;) {
    const k = todayKey(d);
    const n = byDate.get(k) ?? 0;
    if (n <= 0) break;
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
