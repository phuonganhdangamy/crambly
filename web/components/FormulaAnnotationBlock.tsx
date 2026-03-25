"use client";

import { useMemo, useState } from "react";
import { BlockMath } from "react-katex";
import { stripOuterLatexDelimiters } from "@/lib/latexNormalize";
import "katex/dist/katex.min.css";

export type FormulaTerm = { symbol: string; meaning: string };

export function FormulaAnnotationBlock({
  formula,
  terms,
}: {
  formula: string;
  terms: FormulaTerm[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const [showLaTeXSource, setShowLaTeXSource] = useState(false);

  const katexFormula = useMemo(() => {
    const inner = stripOuterLatexDelimiters(formula);
    return inner.trim() ? inner : formula.trim();
  }, [formula]);

  const annotatedParts = useMemo(() => {
    if (!formula.trim()) return [];
    const s = formula;
    const sorted = [...terms].filter((t) => t.symbol).sort((a, b) => b.symbol.length - a.symbol.length);
    const spans: { start: number; end: number; sym: string }[] = [];
    for (const t of sorted) {
      let pos = 0;
      while (true) {
        const i = s.indexOf(t.symbol, pos);
        if (i === -1) break;
        const overlap = spans.some((sp) => !(i + t.symbol.length <= sp.start || i >= sp.end));
        if (!overlap) spans.push({ start: i, end: i + t.symbol.length, sym: t.symbol });
        pos = i + 1;
      }
    }
    spans.sort((a, b) => a.start - b.start);
    const parts: { text: string; sym?: string }[] = [];
    let cursor = 0;
    for (const sp of spans) {
      if (sp.start > cursor) parts.push({ text: s.slice(cursor, sp.start) });
      parts.push({ text: s.slice(sp.start, sp.end), sym: sp.sym });
      cursor = sp.end;
    }
    if (cursor < s.length) parts.push({ text: s.slice(cursor) });
    return parts;
  }, [formula, terms]);

  if (!formula.trim()) return null;

  return (
    <div className="mt-4 rounded-xl border border-cyan-500/25 bg-slate-950/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Formula</p>
      <div className="mt-2 overflow-x-auto text-slate-100 [&_.katex]:text-slate-100">
        <BlockMath math={katexFormula} errorColor="#f87171" />
      </div>
      {terms.length > 0 && annotatedParts.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowLaTeXSource((v) => !v)}
            className="text-xs font-medium text-cyan-400/90 hover:text-cyan-300 hover:underline"
          >
            {showLaTeXSource ? "Hide LaTeX source" : "Show LaTeX source"}
          </button>
          {showLaTeXSource && (
            <>
              <p className="mt-2 text-xs text-slate-500">Hover legend rows to highlight symbols in the source.</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900/90 p-3 font-mono text-sm leading-relaxed text-cyan-50">
                {annotatedParts.map((p, i) =>
                  p.sym ? (
                    <span
                      key={i}
                      className={`rounded px-0.5 transition-colors ${
                        active === p.sym ? "bg-cyan-500/50 text-white" : "text-cyan-200"
                      }`}
                    >
                      {p.text}
                    </span>
                  ) : (
                    <span key={i}>{p.text}</span>
                  ),
                )}
              </pre>
            </>
          )}
        </div>
      )}
      {terms.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Legend</p>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-500">
                <th className="py-1 pr-2 font-medium">Symbol</th>
                <th className="py-1 font-medium">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t, i) => (
                <tr
                  key={i}
                  className={`cursor-pointer border-b border-slate-800 transition-colors ${
                    active === t.symbol ? "bg-cyan-500/15" : "hover:bg-slate-800/60"
                  }`}
                  onMouseEnter={() => setActive(t.symbol)}
                  onMouseLeave={() => setActive(null)}
                >
                  <td className="py-2 pr-3 font-mono text-cyan-200">{t.symbol}</td>
                  <td className="py-2 text-slate-300">{t.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
