"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ChromeProvider } from "@/components/layout/ChromeContext";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuthSession } from "@/hooks/useAuthSession";

/** `/focus/[uploadId]` — immersive reader: outer main must not scroll; page scrolls inside. */
function isFocusSessionPath(pathname: string | null) {
  return Boolean(pathname && /^\/focus\/[^/]+/.test(pathname));
}

function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focusSession = isFocusSessionPath(pathname);
  const { status } = useAuthSession();
  const isLandingHome = pathname === "/" && status === "signedOut";

  if (isLandingHome) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border-default)] bg-[var(--color-bg-primary)]/95 px-4 backdrop-blur-sm md:px-8">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]"
          >
            Crambly
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="min-h-[40px] min-w-[44px] rounded-[var(--radius-md)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent-cyan)]"
            >
              Sign in
            </Link>
            <Link href="/login?signup=1">
              <Button variant="primary" className="min-h-[40px] text-sm">
                Sign up
              </Button>
            </Link>
          </div>
        </header>
        <motion.main
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 md:px-8"
        >
          {children}
        </motion.main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={
              focusSession
                ? "mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col overflow-hidden px-0 py-0 pb-24 md:pb-10"
                : "mx-auto w-full max-w-7xl min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10"
            }
          >
            {children}
          </motion.main>
        </div>
      </div>
      <MobileTabBar />
    </div>
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <ChromeProvider>
      <AppFrame>{children}</AppFrame>
    </ChromeProvider>
  );
}
