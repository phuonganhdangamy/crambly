"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export function AuthMenu({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    void sb.auth.getSession().then((res: { data: { session: Session | null } }) => {
      setEmail(res.data.session?.user?.email ?? null);
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_e: AuthChangeEvent, session: Session | null) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const sb = getSupabaseBrowser();
    await sb?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!getSupabaseBrowser()) {
    return expanded ? (
      <p className="text-xs text-[var(--color-text-muted)]">Add Supabase env for sign-in</p>
    ) : null;
  }

  return (
    <div className={`flex flex-col gap-2 ${expanded ? "" : "items-center"}`}>
      {email ? (
        <>
          {expanded && (
            <p className="truncate text-xs text-[var(--color-text-muted)]" title={email}>
              {email}
            </p>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-2 py-1.5 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent-cyan)]/40"
          >
            Sign out
          </button>
        </>
      ) : (
        <Link
          href="/login"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-accent-cyan)]/50 px-2 py-1.5 text-center text-xs font-medium text-[var(--color-accent-cyan)] hover:bg-[var(--color-bg-tertiary)]"
        >
          {expanded ? "Sign in" : "In"}
        </Link>
      )}
    </div>
  );
}
