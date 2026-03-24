"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", Icon: TabHome },
  { href: "/library", label: "Library", Icon: TabGrid },
  { href: "/upload", label: "Upload", Icon: TabUpload },
  { href: "/syllabus", label: "Syllabus", Icon: TabSyllabus },
  { href: "/courses", label: "Courses", Icon: TabBook },
  { href: "/mode", label: "Profile", Icon: TabUser },
] as const;

function TabHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke={active ? "var(--color-accent-cyan)" : "var(--color-text-muted)"}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TabGrid({ active }: { active: boolean }) {
  const c = active ? "var(--color-accent-cyan)" : "var(--color-text-muted)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

function TabUpload({ active }: { active: boolean }) {
  const c = active ? "var(--color-accent-cyan)" : "var(--color-text-muted)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 16V4m0 0l4 4m-4-4L8 8M4 20h16" stroke={c} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function TabSyllabus({ active }: { active: boolean }) {
  const c = active ? "var(--color-accent-cyan)" : "var(--color-text-muted)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke={c}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M8 13h8M8 17h5" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TabBook({ active }: { active: boolean }) {
  const c = active ? "var(--color-accent-cyan)" : "var(--color-text-muted)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h4a2 2 0 012 2v14l-3-2-3 2V6a2 2 0 012-2zm8 0h4a2 2 0 012 2v14l-3-2-3 2V6a2 2 0 012-2z"
        stroke={c}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TabUser({ active }: { active: boolean }) {
  const c = active ? "var(--color-accent-cyan)" : "var(--color-text-muted)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="4" stroke={c} strokeWidth="1.75" />
      <path d="M6 20v-1a6 6 0 0112 0v1" stroke={c} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      aria-label="Mobile navigation"
    >
      {tabs.map(({ href, label, Icon }) => {
        const active =
          pathname === href ||
          (href === "/library" && pathname.startsWith("/study")) ||
          (href === "/courses" && pathname.startsWith("/courses")) ||
          (href === "/syllabus" && pathname.startsWith("/syllabus"));
        return (
          <Link
            key={href}
            href={href}
            className="flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] text-[10px] font-medium text-[var(--color-text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-cyan)]"
          >
            <Icon active={active} />
            <span className={active ? "text-[var(--color-accent-cyan)]" : ""}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
