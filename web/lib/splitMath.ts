export type MathSegment =
  | { kind: "text"; value: string }
  | { kind: "inline"; math: string }
  | { kind: "block"; math: string };

import { normalizeMathText, unwrapInlineCodeAroundDollarMath } from "./latexNormalize";

function countTrailingBackslashes(s: string, index: number): number {
  let n = 0;
  for (let p = index - 1; p >= 0 && s[p] === "\\"; p--) n += 1;
  return n;
}

/** True if the character at index is escaped by an odd number of backslashes. */
function isEscaped(s: string, index: number): boolean {
  return countTrailingBackslashes(s, index) % 2 === 1;
}

function findUnescaped(s: string, from: number, needle: string): number {
  let i = from;
  const n = needle.length;
  while (i <= s.length - n) {
    if (s.slice(i, i + n) !== needle) {
      i += 1;
      continue;
    }
    if (isEscaped(s, i)) {
      i += 1;
      continue;
    }
    return i;
  }
  return -1;
}

/** Next single `$` suitable for opening/closing inline math (not `$$`, not `\$`). */
function nextSingleDollar(s: string, start: number): number {
  let i = start;
  while (i < s.length) {
    const j = s.indexOf("$", i);
    if (j === -1) return -1;
    if (isEscaped(s, j)) {
      i = j + 1;
      continue;
    }
    if (s[j + 1] === "$") {
      i = j + 2;
      continue;
    }
    return j;
  }
  return -1;
}

type BlockStart = { kind: "dd" | "br"; pos: number };

function nextBlockStart(s: string, from: number): BlockStart | null {
  const dd = s.indexOf("$$", from);
  const br = findUnescaped(s, from, "\\[");
  let best: BlockStart | null = null;
  if (dd >= 0) best = { kind: "dd", pos: dd };
  if (br >= 0 && (!best || br < best.pos)) best = { kind: "br", pos: br };
  return best;
}

function mergeText(segments: MathSegment[]): MathSegment[] {
  const out: MathSegment[] = [];
  for (const seg of segments) {
    if (seg.kind !== "text") {
      out.push(seg);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev?.kind === "text") {
      prev.value += seg.value;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/** Parse `\( … \)` and single `$ … $` inside a fragment with no top-level `$$` / `\[`. */
function splitInlineFragment(chunk: string): MathSegment[] {
  const parts: MathSegment[] = [];
  let i = 0;
  while (i < chunk.length) {
    const pOpen = findUnescaped(chunk, i, "\\(");
    const dOpen = nextSingleDollar(chunk, i);
    const useParen = pOpen >= 0 && (dOpen < 0 || pOpen <= dOpen);
    const useDollar = dOpen >= 0 && !useParen;

    if (!useParen && !useDollar) {
      if (i < chunk.length) parts.push({ kind: "text", value: chunk.slice(i) });
      break;
    }

    if (useParen) {
      if (pOpen > i) parts.push({ kind: "text", value: chunk.slice(i, pOpen) });
      const pClose = findUnescaped(chunk, pOpen + 2, "\\)");
      if (pClose === -1) {
        parts.push({ kind: "text", value: chunk.slice(i) });
        break;
      }
      parts.push({ kind: "inline", math: chunk.slice(pOpen + 2, pClose).trim() });
      i = pClose + 2;
      continue;
    }

    if (dOpen > i) parts.push({ kind: "text", value: chunk.slice(i, dOpen) });
    const dClose = nextSingleDollar(chunk, dOpen + 1);
    if (dClose === -1) {
      parts.push({ kind: "text", value: chunk.slice(dOpen) });
      break;
    }
    parts.push({ kind: "inline", math: chunk.slice(dOpen + 1, dClose).trim() });
    i = dClose + 1;
  }
  return mergeText(parts);
}

/**
 * Split text into plain / inline / display math.
 * Supports `$$…$$`, `\[…\]`, `\(...\)`, `$…$`, escaped `\$`, and unicode dollars.
 */
export function splitMathSegments(source: string): MathSegment[] {
  const s = unwrapInlineCodeAroundDollarMath(normalizeMathText(source));
  const segments: MathSegment[] = [];
  let i = 0;
  while (i < s.length) {
    const blk = nextBlockStart(s, i);
    if (!blk) {
      segments.push(...splitInlineFragment(s.slice(i)));
      break;
    }
    if (blk.pos > i) {
      segments.push(...splitInlineFragment(s.slice(i, blk.pos)));
    }
    if (blk.kind === "dd") {
      const end = s.indexOf("$$", blk.pos + 2);
      if (end === -1) {
        segments.push(...splitInlineFragment(s.slice(blk.pos)));
        break;
      }
      segments.push({ kind: "block", math: s.slice(blk.pos + 2, end).trim() });
      i = end + 2;
    } else {
      const close = findUnescaped(s, blk.pos + 2, "\\]");
      if (close === -1) {
        segments.push(...splitInlineFragment(s.slice(blk.pos)));
        break;
      }
      segments.push({ kind: "block", math: s.slice(blk.pos + 2, close).trim() });
      i = close + 2;
    }
  }
  return mergeText(segments);
}
