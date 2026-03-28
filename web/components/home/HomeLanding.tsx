"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export function HomeLanding() {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center px-4 py-16 text-center md:min-h-[calc(100dvh-4rem)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="max-w-lg space-y-6"
      >
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--color-accent-cyan)]">
          Crambly
        </p>
        <h1 className="text-3xl font-bold leading-tight text-[var(--color-text-primary)] md:text-4xl">
          Your adaptive AI study companion
        </h1>
        <p className="text-base leading-relaxed text-[var(--color-text-secondary)] md:text-lg">
          Ingest lectures, build your library, and study with modes tuned to how you learn. Sign in to sync your
          courses and data across devices.
        </p>
        <div className="flex flex-col items-stretch justify-center gap-3 pt-2 sm:flex-row sm:items-center">
          <Link href="/login?signup=1" className="sm:flex-1">
            <Button variant="primary" className="w-full min-h-[44px] text-base">
              Create account
            </Button>
          </Link>
          <Link href="/login" className="sm:flex-1">
            <Button variant="secondary" className="w-full min-h-[44px] text-base">
              Sign in
            </Button>
          </Link>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          New here? Use <strong className="font-medium text-[var(--color-text-secondary)]">Create account</strong> to
          register, or <strong className="font-medium text-[var(--color-text-secondary)]">Sign in</strong> if you already
          have one.
        </p>
      </motion.div>
    </div>
  );
}
