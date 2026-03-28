/** Client-only recent activity lines for the dashboard (no Supabase table). */

const KEY = "crambly_activity_feed_v1";
const MAX = 12;

export type ActivityItem = { id: string; kind: string; label: string; at: string };

function read(): ActivityItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const a = JSON.parse(raw) as ActivityItem[];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function write(items: ActivityItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function pushActivity(kind: string, label: string) {
  const items = read();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = [{ id, kind, label, at: new Date().toISOString() }, ...items].slice(0, MAX);
  write(next);
}

export function getRecentActivity(limit = 5): ActivityItem[] {
  return read().slice(0, limit);
}
