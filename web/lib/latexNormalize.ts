/**
 * Normalize model output so KaTeX receives delimiter-free expressions where needed,
 * and common Unicode / markdown wrappers do not break splitting.
 */

/** Fullwidth dollar (some fonts / models) → ASCII */
export function normalizeMathText(s: string): string {
  return s.replace(/\uFF04/g, "$");
}

/** `` `$x$` `` (markdown inline code around dollar math) → `$x$` */
export function unwrapInlineCodeAroundDollarMath(s: string): string {
  return s.replace(/`(\$[^`\n]*\$)`/g, "$1");
}

/**
 * Remove outer display/inline delimiters from a single expression string.
 * KaTeX BlockMath/InlineMath expect the inner TeX only.
 */
export function stripOuterLatexDelimiters(tex: string): string {
  let t = tex.trim();
  while (t.length >= 2 && t.startsWith("`") && t.endsWith("`")) {
    t = t.slice(1, -1).trim();
  }
  let changed = true;
  while (changed && t.length > 0) {
    changed = false;
    if (t.startsWith("$$") && t.endsWith("$$") && t.length >= 4) {
      t = t.slice(2, -2).trim();
      changed = true;
      continue;
    }
    if (t.startsWith("\\[") && t.endsWith("\\]") && t.length >= 4) {
      t = t.slice(2, -2).trim();
      changed = true;
      continue;
    }
    if (t.startsWith("\\(") && t.endsWith("\\)") && t.length >= 4) {
      t = t.slice(2, -2).trim();
      changed = true;
      continue;
    }
    if (t.startsWith("$") && t.endsWith("$") && t.length >= 2 && !t.startsWith("$$")) {
      t = t.slice(1, -1).trim();
      changed = true;
    }
  }
  return t;
}
