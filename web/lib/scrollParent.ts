/** Nearest scrollable ancestor (or document) — the element whose scroll position actually moves content. */
export function getScrollContainer(start: HTMLElement): HTMLElement {
  let n: HTMLElement | null = start;
  while (n) {
    const { overflowY } = getComputedStyle(n);
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      n.scrollHeight > n.clientHeight + 2
    ) {
      return n;
    }
    n = n.parentElement;
  }
  return document.documentElement;
}

export function readScrollTop(scroller: HTMLElement): number {
  if (scroller === document.documentElement) {
    return window.scrollY ?? document.documentElement.scrollTop;
  }
  return scroller.scrollTop;
}

export function readScrollRange(scroller: HTMLElement): { top: number; max: number } {
  if (scroller === document.documentElement) {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return { top: readScrollTop(scroller), max };
  }
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return { top: scroller.scrollTop, max };
}
