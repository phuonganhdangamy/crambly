"use client";

import { useMemo, type ReactNode } from "react";
import { BlockMath, InlineMath } from "react-katex";
import { splitMathSegments } from "@/lib/splitMath";
import "katex/dist/katex.min.css";

/** Renders `**bold**` in plain segments (after math is split out). */
function TextWithInlineBold({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let pos = 0;
  let key = 0;
  while (pos < text.length) {
    const open = text.indexOf("**", pos);
    if (open === -1) {
      nodes.push(<span key={key++}>{text.slice(pos)}</span>);
      break;
    }
    if (open > pos) {
      nodes.push(<span key={key++}>{text.slice(pos, open)}</span>);
    }
    const close = text.indexOf("**", open + 2);
    if (close === -1) {
      nodes.push(<span key={key++}>{text.slice(open)}</span>);
      break;
    }
    nodes.push(
      <strong key={key++} className="font-semibold text-inherit">
        {text.slice(open + 2, close)}
      </strong>,
    );
    pos = close + 2;
  }
  return <span className="whitespace-pre-wrap">{nodes}</span>;
}

export function MathRichText({
  text,
  className,
  /** Use theme text color for body + KaTeX (e.g. worked-example card in light mode). */
  inheritThemeColor = false,
}: {
  text: string;
  className?: string;
  inheritThemeColor?: boolean;
}) {
  const segments = useMemo(() => splitMathSegments(text), [text]);
  const mathBlock = inheritThemeColor
    ? "my-3 block overflow-x-auto text-[var(--color-text-primary)] [&_.katex]:text-[var(--color-text-primary)]"
    : "my-3 block overflow-x-auto text-slate-100 [&_.katex]:text-slate-100";
  const mathInline = inheritThemeColor
    ? "inline [&_.katex]:text-[var(--color-text-primary)]"
    : "inline [&_.katex]:text-indigo-100";

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.kind === "text") {
          return <TextWithInlineBold key={idx} text={seg.value} />;
        }
        if (seg.kind === "block") {
          return (
            <span key={idx} className={mathBlock}>
              <BlockMath math={seg.math} errorColor="#f87171" />
            </span>
          );
        }
        return (
          <span key={idx} className={mathInline}>
            <InlineMath math={seg.math} errorColor="#f87171" />
          </span>
        );
      })}
    </span>
  );
}
