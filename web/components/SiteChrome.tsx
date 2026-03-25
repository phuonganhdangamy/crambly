"use client";

import { motion } from "framer-motion";
import { ChromeProvider } from "@/components/layout/ChromeContext";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Sidebar } from "@/components/layout/Sidebar";

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mx-auto w-full max-w-7xl min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10"
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
