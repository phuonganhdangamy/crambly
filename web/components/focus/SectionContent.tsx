"use client";

import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-bash";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { useEffect, useMemo, useRef } from "react";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { FocusSection } from "@/lib/focusTypes";

function resolvePrismLang(lang: string): string {
  const m: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    python: "python",
    r: "r",
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
      className="mb-4 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] p-3 text-sm"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <code ref={ref as React.RefObject<HTMLElement>} className={`language-${resolved}`} />
    </pre>
  );
}

const markdownComponents: Components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children, ...rest }) {
    const match = /language-(\w+)/.exec(className || "");
    const codeStr = String(children).replace(/\n$/, "");
    if (match) {
      return <PrismBlock code={codeStr} lang={match[1]} />;
    }
    return (
      <code
        className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[0.9em] text-indigo-100"
        {...rest}
      >
        {children}
      </code>
    );
  },
  h1: ({ children }) => (
    <h1 className="mb-3 mt-1 text-xl font-semibold text-[var(--color-text-primary)]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-4 text-lg font-semibold text-[var(--color-text-primary)]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-base font-semibold text-[var(--color-text-primary)]">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-3 text-sm font-semibold text-indigo-100">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-2 mt-2 text-sm font-medium text-[var(--color-text-primary)]">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-2 mt-2 text-sm font-medium text-[var(--color-text-primary)]">{children}</h6>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-[var(--color-text-primary)] last:mb-0 [&_.katex]:text-indigo-100">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 text-[var(--color-text-primary)] marker:text-indigo-300">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 text-[var(--color-text-primary)] marker:text-indigo-300">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed [&_.katex]:text-indigo-100">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      className="mb-3 border-l-2 border-indigo-500/50 pl-3 text-[var(--color-text-muted)]"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-indigo-300 underline decoration-indigo-500/40 underline-offset-2 hover:text-indigo-200"
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-[var(--color-text-primary)]">{children}</strong>,
  em: ({ children }) => <em className="italic text-indigo-100/95">{children}</em>,
  hr: () => <hr className="my-6 border-[var(--color-border-default)]" />,
  table: ({ children }) => (
    <div
      className="mb-4 overflow-x-auto rounded-[var(--radius-md)]"
      style={{ border: "1px solid var(--color-border-default)" }}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm text-[var(--color-text-primary)]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--color-bg-tertiary)]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-[var(--color-border-default)] last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-2 font-semibold text-indigo-100 [&_.katex]:text-indigo-100">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top [&_.katex]:text-indigo-100">{children}</td>
  ),
};

export function SectionContent({ section }: { section: FocusSection }) {
  const source = section.raw_content?.trim() ? section.raw_content : section.summary;

  const plugins = useMemo(
    () => ({
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
    [],
  );

  return (
    <div className="text-[var(--color-text-primary)] leading-relaxed [&_.katex-display]:my-4 [&_.katex-display]:block [&_.katex-display]:overflow-x-auto [&_.katex]:text-indigo-100">
      <ReactMarkdown
        remarkPlugins={plugins.remarkPlugins}
        rehypePlugins={plugins.rehypePlugins}
        components={markdownComponents}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
