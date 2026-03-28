"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    setErr(q.get("error"));
    if (q.get("signup") === "1") setMode("signup");
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const sb = getSupabaseBrowser();
    if (!sb) {
      setMessage("Supabase is not configured (NEXT_PUBLIC_SUPABASE_*).");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
          return;
        }
        setMessage(
          "Account created. If email confirmation is on in Supabase, check your inbox — then sign in here.",
        );
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      }
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "message" in e && typeof (e as { message: string }).message === "string"
          ? (e as { message: string }).message
          : e instanceof Error
            ? e.message
            : "Sign-in failed";
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="mb-2 text-2xl font-semibold text-[var(--color-text-primary)]">
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">
        Use the same Supabase project as the API.{" "}
        <Link href="/" className="text-[var(--color-accent)] underline">
          Back to app
        </Link>
      </p>
      {err && <p className="mb-4 text-sm text-red-400">Authentication error. Try again.</p>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--color-text-muted)]">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--color-text-muted)]">Password</span>
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-[var(--color-text-primary)]"
            required
            minLength={6}
          />
        </label>
        {message && <p className="text-sm text-[var(--color-text-muted)]">{message}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </Button>
      </form>
      <button
        type="button"
        className="mt-4 text-sm text-[var(--color-accent)] underline"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMessage(null);
        }}
      >
        {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
