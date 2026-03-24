"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useChrome } from "./ChromeContext";

const LS_FIRST = "crambly_sidebar_animated_v1";

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function IconBrain({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5c-1.5-2-4-1.5-5 .5-1.5-.5-3 1-3.5 2.5-.5 2 .5 3.5 2 4v12c2.5 0 4-1.5 4-4 1.5.5 3-1 3.5-2.5.5-2-.5-3.5-2-4V5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4L12 3zM5 14l.8 2.4L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14zM19 15l.5 1.5L21 17l-1.5.5L19 19l-.5-1.5L17 17l1.5-.5L19 15z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCourses({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h4a2 2 0 012 2v14l-3-2-3 2V6a2 2 0 012-2zm8 0h4a2 2 0 012 2v14l-3-2-3 2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Syllabus PDF + deadline extraction */
function IconSyllabus({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9 10a4 4 0 100-8 4 4 0 000 8zm8 1a3 3 0 10-6 0M21 20v-1a3 3 0 00-3-3h-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 14.5A8.5 8.5 0 019.5 3 8.5 8.5 0 0012 21a8.5 8.5 0 009-6.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV = [
  { href: "/", label: "Dashboard", Icon: IconHome },
  { href: "/library", label: "My Library", Icon: IconGrid },
  { href: "/courses", label: "Courses", Icon: IconCourses },
  { href: "/syllabus", label: "Syllabus", Icon: IconSyllabus },
  { href: "/mode", label: "Study DNA", Icon: IconBrain },
  { href: "/upload", label: "Expressive Media", Icon: IconSparkles },
  { href: "/focus", label: "Focus Mode", Icon: IconEye },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { calming, setCalming, sidebarCollapsed, setSidebarCollapsed, hydrated } = useChrome();
  const reduceMotion = useReducedMotion();
  const expanded = !sidebarCollapsed;
  const [staggerGate, setStaggerGate] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (localStorage.getItem(LS_FIRST) === "1") {
      setStaggerGate(true);
      return;
    }
    const t = setTimeout(() => {
      setStaggerGate(true);
      localStorage.setItem(LS_FIRST, "1");
    }, 50);
    return () => clearTimeout(t);
  }, [hydrated]);

  const itemDelay = reduceMotion ? 0 : 0.05;

  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 220 : 60 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeInOut" }}
      className="relative hidden h-full min-h-0 shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] md:flex"
      aria-label="Main navigation"
    >
      <div className={`flex h-14 items-center border-b border-[var(--color-border-default)] px-3 ${expanded ? "justify-start gap-2" : "justify-center"}`}>
        <Link
          href="/"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] font-bold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
          aria-label="Crambly home"
        >
          {expanded ? (
            <span className="text-lg tracking-tight">
              Cram<span className="text-[var(--color-accent-cyan)]">bly</span>
            </span>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-cyan)] text-sm font-bold text-[#0d1117]">
              C
            </span>
          )}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map(({ href, label, Icon }, i) => {
          const active =
            pathname === href ||
            (href === "/library" && pathname.startsWith("/study")) ||
            (href !== "/" && href !== "/library" && pathname.startsWith(href));
          return (
            <motion.div
              key={href}
              initial={{ opacity: 0, x: -8 }}
              animate={staggerGate ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ delay: staggerGate ? i * itemDelay : 0, duration: reduceMotion ? 0 : 0.22 }}
            >
              <Link
                href={href}
                className={`relative flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 transition-[background,color] duration-150 ${
                  active
                    ? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] before:absolute before:left-0 before:top-1/2 before:h-8 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-[var(--color-accent-cyan)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                } ${expanded ? "" : "justify-center px-0"}`}
                title={!expanded ? label : undefined}
              >
                <Icon
                  className={`shrink-0 ${active ? "text-[var(--color-accent-cyan)]" : "text-current"}`}
                />
                {expanded && <span className="truncate text-sm font-medium">{label}</span>}
              </Link>
            </motion.div>
          );
        })}

        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={staggerGate ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: staggerGate ? NAV.length * itemDelay : 0, duration: reduceMotion ? 0 : 0.22 }}
          className={`mt-1 flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 text-[var(--color-text-muted)] ${expanded ? "" : "justify-center px-0"}`}
          aria-disabled="true"
          title="Coming soon"
        >
          <IconUsers className="shrink-0 opacity-50" />
          {expanded && <span className="text-sm font-medium">Community</span>}
        </motion.div>
      </nav>

      <div className="mt-auto space-y-3 border-t border-[var(--color-border-default)] p-3">
        <div className={`flex items-center gap-2 ${expanded ? "justify-between" : "flex-col"}`}>
          {expanded && (
            <span className="flex min-w-0 items-center gap-2 text-[var(--color-text-secondary)]">
              <IconMoon className="shrink-0" />
              <span className="truncate text-xs font-medium">Calm</span>
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={calming}
            aria-label="Calming mode"
            onClick={() => setCalming(!calming)}
            title="Calming mode"
            className={`relative h-7 w-12 shrink-0 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] ${calming ? "border-[var(--color-accent-cyan)]/45" : ""}`}
          >
            <motion.span
              className="absolute top-1 h-5 w-5 rounded-full bg-[var(--color-accent-cyan)] shadow-[var(--shadow-neon-cyan)]"
              initial={false}
              animate={{ left: calming ? 22 : 4 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
            />
          </button>
        </div>

        <div className={`flex items-center gap-2 ${expanded ? "" : "justify-center"}`}>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-sm font-semibold text-[var(--color-accent-cyan)]"
            aria-hidden
          >
            DL
          </div>
          {expanded && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-text-primary)]">Demo Learner</p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">Focus-flow</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent-cyan)]/40 hover:text-[var(--color-text-primary)]"
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className={`transition-transform ${expanded ? "" : "rotate-180"}`}
          >
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {expanded && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
