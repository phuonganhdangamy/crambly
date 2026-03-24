"use client";

import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-bash";
import { useEffect, useMemo, useRef } from "react";
import type { FocusSection } from "@/lib/focusTypes";
import { MathRichText } from "./MathRichText";

type Piece = { type: "text"; body: string } | { type: "code"; lang: string; body: string };

function parseFenced(body: string): Piece[] {
  const re = /```(\w*)\n([\s\S]*?)```/g;
  const out: Piece[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", body: body.slice(last, m.index) });
    }
    out.push({ type: "code", lang: (m[1] || "text").toLowerCase() || "text", body: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    out.push({ type: "text", body: body.slice(last) });
  }
  return out.length ? out : [{ type: "text", body }];
}

function resolvePrismLang(lang: string): string {
  const m: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    python: "python",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    java: "java",
  };
  return m[lang] || lang || "typescript";
}

function PrismBlock({ code, lang }: { code: string; lang: string }) {
  const ref = useRef<HTMLElement>(null);
  const resolved = resolvePrismLang(lang);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const langs = Prism.languages as Record<string, Prism.Grammar>;
    const grammar =
      langs[resolved] || langs.javascript || langs.typescript || langs.python;
    if (grammar) {
      el.innerHTML = Prism.highlight(code, grammar, resolved);
    } else {
      el.textContent = code;
    }
  }, [code, resolved]);

  return (
    <pre
      className="mb-3 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] p-3 text-sm"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <code ref={ref as React.RefObject<HTMLElement>} className={`language-${resolved}`} />
    </pre>
  );
}

export function SectionContent({ section }: { section: FocusSection }) {
  const source = section.raw_content?.trim() ? section.raw_content : section.summary;
  const pieces = useMemo(() => {
    if (section.has_code) return parseFenced(source);
    return [{ type: "text" as const, body: source }];
  }, [section.has_code, source]);

  if (section.has_code) {
    return (
      <div>
        {pieces.map((p, i) =>
          p.type === "code" ? (
            <PrismBlock key={i} code={p.body} lang={p.lang} />
          ) : (
            <MathRichText key={i} text={p.body} hasMath={section.has_math} />
          ),
        )}
      </div>
    );
  }

  return <MathRichText text={source} hasMath={section.has_math} />;
}
