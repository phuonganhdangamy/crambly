"use client";

import { createContext, useContext, useEffect, useState } from "react";

const LS_LIGHT = "crambly_light_mode";
const LS_SIDEBAR = "crambly_sidebar_collapsed";

type Ctx = {
  lightMode: boolean;
  setLightMode: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  hydrated: boolean;
};

const ChromeCtx = createContext<Ctx | null>(null);

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const [lightMode, setLightMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLightMode(localStorage.getItem(LS_LIGHT) === "1");
    setSidebarCollapsed(localStorage.getItem(LS_SIDEBAR) === "1");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("light-mode", lightMode);
    localStorage.setItem(LS_LIGHT, lightMode ? "1" : "0");
  }, [lightMode, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(LS_SIDEBAR, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed, hydrated]);

  return (
    <ChromeCtx.Provider value={{ lightMode, setLightMode, sidebarCollapsed, setSidebarCollapsed, hydrated }}>
      {children}
    </ChromeCtx.Provider>
  );
}

export function useChrome() {
  const c = useContext(ChromeCtx);
  if (!c) throw new Error("useChrome must be used within ChromeProvider");
  return c;
}
