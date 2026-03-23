"use client";

import { useMemo } from "react";
import { BlockMath, InlineMath } from "react-katex";
import { splitMathSegments } from "@/lib/splitMath";
import "katex/dist/katex.min.css";

export function MathRichText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMathSegments(text), [text]);

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.kind === "text") {
          return (
            <span key={idx} className="whitespace-pre-wrap">
              {seg.value}
            </span>
          );
        }
        if (seg.kind === "block") {
          return (
            <span key={idx} className="my-3 block overflow-x-auto text-slate-100 [&_.katex]:text-slate-100">
              <BlockMath math={seg.math} errorColor="#f87171" />
            </span>
          );
        }
        return (
          <span key={idx} className="inline [&_.katex]:text-indigo-100">
            <InlineMath math={seg.math} errorColor="#f87171" />
          </span>
        );
      })}
    </span>
  );
}
