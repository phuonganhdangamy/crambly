import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "./supabase";

export function apiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    const onLocalHost = h === "localhost" || h === "127.0.0.1";
    if (!onLocalHost && (url.includes("localhost") || url.includes("127.0.0.1"))) {
      console.warn(
        "[Crambly] NEXT_PUBLIC_API_URL is still localhost but the site is not. " +
          "Set NEXT_PUBLIC_API_URL in Vercel (or your host) to your public FastAPI URL (https://...) and redeploy. " +
          "On the API, set CORS_ORIGINS to this site’s origin (e.g. https://your-app.vercel.app).",
      );
    }
  }
  return url;
}

/** @deprecated Prefer sessionUserId() — kept for quick labels when session is unavailable */
export function demoUserId(): string {
  return (
    process.env.NEXT_PUBLIC_DEMO_USER_ID || "00000000-0000-0000-0000-000000000001"
  );
}

/**
 * Session from browser storage / cookies, with refresh when missing or near expiry.
 * Used so API paths and `Authorization: Bearer` stay aligned when CRAMBLY_AUTH_DISABLED=false.
 */
export async function getSupabaseSession(): Promise<Session | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  let session = data.session ?? null;
  if (!session) {
    const { data: r } = await sb.auth.refreshSession();
    session = r.session ?? null;
  } else if (
    typeof session.expires_at === "number" &&
    session.expires_at * 1000 < Date.now() + 60_000
  ) {
    const { data: r } = await sb.auth.refreshSession();
    if (r.session) session = r.session;
  }
  return session;
}

/** Access token for FastAPI, or null if not signed in. */
export async function getAccessToken(): Promise<string | null> {
  const s = await getSupabaseSession();
  return s?.access_token ?? null;
}

/** Resolved user id: signed-in Supabase user, else demo env fallback (for API auth-disabled mode). */
export async function sessionUserId(): Promise<string> {
  const s = await getSupabaseSession();
  const id = s?.user?.id;
  if (id) return id;
  return demoUserId();
}
