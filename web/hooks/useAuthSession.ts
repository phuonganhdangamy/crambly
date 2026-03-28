"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export type AuthSessionStatus = "loading" | "signedOut" | "signedIn";

/** Client-only session probe for gating the home page and shell. */
export function useAuthSession(): { status: AuthSessionStatus; session: Session | null } {
  const [status, setStatus] = useState<AuthSessionStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setSession(null);
      setStatus("signedOut");
      return;
    }
    void sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s ?? null);
      setStatus(s ? "signedIn" : "signedOut");
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setStatus(s ? "signedIn" : "signedOut");
    });
    return () => subscription.unsubscribe();
  }, []);

  return { status, session };
}
