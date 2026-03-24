"use client";

import { createContext, useContext, useEffect, useState } from "react";

const LS_CALM = "crambly_calming_mode";
const LS_SIDEBAR = "crambly_sidebar_collapsed";

type Ctx = {
  calming: boolean;
  setCalming: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  hydrated: boolean;
};

const ChromeCtx = createContext<Ctx | null>(null);

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [calming, setCalming] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCalming(localStorage.getItem(LS_CALM) === "1");
    setSidebarCollapsed(localStorage.getItem(LS_SIDEBAR) === "1");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("calming-mode", calming);
    localStorage.setItem(LS_CALM, calming ? "1" : "0");
  }, [calming, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_SIDEBAR, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed, hydrated]);

  return (
    <ChromeCtx.Provider value={{ calming, setCalming, sidebarCollapsed, setSidebarCollapsed, hydrated }}>
      {children}
    </ChromeCtx.Provider>
  );
}

export function useChrome() {
  const c = useContext(ChromeCtx);
  if (!c) throw new Error("useChrome must be used within ChromeProvider");
  return c;
}
