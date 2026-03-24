"use client";

import { BlockMath, InlineMath } from "react-katex";
import { useMemo } from "react";

function InlinePiece({ tex }: { tex: string }) {
  return <InlineMath math={tex} />;
}

function BlockPiece({ tex }: { tex: string }) {
  return <BlockMath math={tex} />;
}

/** Renders plain text or text with $...$ / $$...$$ when hasMath. */
export function MathRichText({ text, hasMath }: { text: string; hasMath: boolean }) {
  const nodes = useMemo(() => {
    if (!hasMath) {
      return text.split(/\n\n+/).map((para, i) => (
        <p key={i} className="mb-3 text-[var(--color-text-primary)] last:mb-0">
          {para}
        </p>
      ));
    }

    const out: React.ReactNode[] = [];
    const blockSplit = text.split(/(\$\$[\s\S]*?\$\$)/g);
    let k = 0;
    for (const block of blockSplit) {
      if (block.startsWith("$$") && block.endsWith("$$")) {
        const inner = block.slice(2, -2).trim();
        out.push(<BlockPiece key={k++} tex={inner} />);
        continue;
      }
      const inlineParts = block.split(/(\$[^$\n]+\$)/g);
      for (const ip of inlineParts) {
        if (ip.startsWith("$") && ip.endsWith("$") && ip.length > 2) {
          out.push(<InlinePiece key={k++} tex={ip.slice(1, -1)} />);
        } else if (ip) {
          ip.split(/\n\n+/).forEach((para, j) => {
            if (para)
              out.push(
                <p key={`${k}-${j}`} className="mb-3 text-[var(--color-text-primary)] last:mb-0">
                  {para}
                </p>,
              );
          });
        }
      }
    }
    return out;
  }, [text, hasMath]);

  return <div className="text-[var(--color-text-primary)] leading-relaxed">{nodes}</div>;
}
