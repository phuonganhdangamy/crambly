"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getScrollContainer, readScrollTop } from "@/lib/scrollParent";
import { useFocusStore } from "@/store/focusStore";

const DWELL_THRESHOLD = 45_000;
const SCROLLBACK_THRESHOLD = 3;
export const FRICTION_TRIGGER = 0.65;
const SCORE_UPDATE_MS = 2000;
/** Used only for scroll-back + “reviewed” — not for dwell (see primary block). */
const IN_VIEW_MIN = 0.5;

type BlockMetrics = {
  dwellMs: number;
  scrollBacks: number;
  everLeftViewport: boolean;
  lastRatio: number;
};

function frictionScoreFromDwell(totalDwellMs: number, scrollBacks: number): number {
  const dwellComponent = Math.min(totalDwellMs / DWELL_THRESHOLD, 1) * 0.5;
  const scrollComponent = Math.min(scrollBacks / SCROLLBACK_THRESHOLD, 1) * 0.5;
  return dwellComponent + scrollComponent;
}

/**
 * Block whose vertical center is closest to the **viewport** vertical center.
 * We use the viewport (not the scroll container’s full layout box) so this stays correct when
 * the page scrolls on an outer ancestor (e.g. app `<main>`) instead of the inner `scrollRef`.
 */
function pickPrimaryBlockId(scopeRoot: HTMLElement): string | null {
  const blocks = scopeRoot.querySelectorAll<HTMLElement>(".focus-friction-target");
  if (blocks.length === 0) return null;
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const vh = vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 800);
  const vTop = vv?.offsetTop ?? 0;
  const midY = vTop + vh / 2;
  let best: string | null = null;
  let bestDist = Infinity;
  blocks.forEach((el) => {
    const id = el.dataset.conceptId;
    if (!id) return;
    const br = el.getBoundingClientRect();
    // Intersects visible viewport (not the tall layout rect of an unbounded scroll wrapper)
    if (br.bottom <= vTop || br.top >= vTop + vh) return;
    const c = (br.top + br.bottom) / 2;
    const d = Math.abs(c - midY);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  });
  return best;
}

export function useFocusSession(scrollRootRef: RefObject<HTMLElement | null>) {
  const perBlock = useRef<Record<string, BlockMetrics>>({});
  const prevScrollY = useRef(0);
  const scrollDir = useRef<"up" | "down" | "none">("none");
  const lastScrollFire = useRef(0);
  const rafScroll = useRef<number | null>(null);

  const primaryBlockIdRef = useRef<string | null>(null);
  const primarySinceRef = useRef<number | null>(null);

  const [frictionScores, setFrictionScores] = useState<Record<string, number>>({});

  const ensureBlock = useCallback((id: string) => {
    if (!perBlock.current[id]) {
      perBlock.current[id] = {
        dwellMs: 0,
        scrollBacks: 0,
        everLeftViewport: false,
        lastRatio: 0,
      };
    }
    return perBlock.current[id];
  }, []);

  const flushPrimaryDwell = useCallback((now: number) => {
    const pid = primaryBlockIdRef.current;
    const since = primarySinceRef.current;
    if (pid && since != null) {
      const m = perBlock.current[pid];
      if (m) m.dwellMs += now - since;
    }
    primarySinceRef.current = null;
  }, []);

  const setPrimaryBlock = useCallback(
    (root: HTMLElement, now: number) => {
      const next = pickPrimaryBlockId(root);
      const cur = primaryBlockIdRef.current;
      if (next === cur) {
        if (next && primarySinceRef.current == null) primarySinceRef.current = now;
        return;
      }
      flushPrimaryDwell(now);
      primaryBlockIdRef.current = next;
      primarySinceRef.current = next ? now : null;
    },
    [flushPrimaryDwell],
  );

  const recomputeScores = useCallback(() => {
    const now = Date.now();
    const pid = primaryBlockIdRef.current;
    const since = primarySinceRef.current;
    const next: Record<string, number> = {};
    for (const id of Object.keys(perBlock.current)) {
      const m = perBlock.current[id];
      const live = id === pid && since != null ? now - since : 0;
      next[id] = frictionScoreFromDwell(m.dwellMs + live, m.scrollBacks);
    }
    setFrictionScores(next);
  }, []);

  const resetBlock = useCallback(
    (blockId: string) => {
      const now = Date.now();
      if (primaryBlockIdRef.current === blockId) {
        flushPrimaryDwell(now);
        primaryBlockIdRef.current = null;
        primarySinceRef.current = null;
      }
      const m = perBlock.current[blockId];
      if (m) {
        m.dwellMs = 0;
        m.scrollBacks = 0;
        m.everLeftViewport = false;
      }
      const root = scrollRootRef.current;
      if (root) setPrimaryBlock(root, now);
      recomputeScores();
    },
    [flushPrimaryDwell, recomputeScores, scrollRootRef, setPrimaryBlock],
  );

  useEffect(() => {
    const scope = scrollRootRef.current;
    if (!scope) return;

    const scroller = getScrollContainer(scope);
    const ioRoot: Element | null = scroller === document.documentElement ? null : scroller;

    const bumpPrimary = () => {
      setPrimaryBlock(scope, Date.now());
      recomputeScores();
    };

    const io = new IntersectionObserver(
      (entries) => {
        const addReviewed = useFocusStore.getState().addReviewedSection;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.conceptId;
          if (!id) continue;
          const m = ensureBlock(id);
          const ratio = entry.intersectionRatio;
          const wasIn = m.lastRatio >= IN_VIEW_MIN;
          const isIn = ratio >= IN_VIEW_MIN;

          if (isIn && !wasIn) {
            if (m.everLeftViewport && scrollDir.current === "up") {
              m.scrollBacks += 1;
            }
            addReviewed(id);
          } else if (!isIn && wasIn) {
            m.everLeftViewport = true;
          }

          m.lastRatio = ratio;
        }
        bumpPrimary();
      },
      {
        root: ioRoot,
        rootMargin: "0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    const observeBlocks = () => {
      scope.querySelectorAll<HTMLElement>(".focus-friction-target").forEach((el) => io.observe(el));
    };

    observeBlocks();
    const mo = new MutationObserver(() => {
      observeBlocks();
      bumpPrimary();
    });
    mo.observe(scope, { childList: true, subtree: true });

    const onScroll = () => {
      const t = Date.now();
      const tickScrollDir = () => {
        const y = readScrollTop(scroller);
        scrollDir.current = y < prevScrollY.current ? "up" : y > prevScrollY.current ? "down" : "none";
        prevScrollY.current = y;
      };

      if (t - lastScrollFire.current < 100) {
        if (rafScroll.current == null) {
          rafScroll.current = requestAnimationFrame(() => {
            rafScroll.current = null;
            lastScrollFire.current = Date.now();
            tickScrollDir();
            bumpPrimary();
          });
        }
        return;
      }
      lastScrollFire.current = t;
      tickScrollDir();
      bumpPrimary();
    };

    if (scroller === document.documentElement) {
      window.addEventListener("scroll", onScroll, { passive: true });
    } else {
      scroller.addEventListener("scroll", onScroll, { passive: true });
    }

    bumpPrimary();
    const scoreIv = window.setInterval(recomputeScores, SCORE_UPDATE_MS);

    return () => {
      window.clearInterval(scoreIv);
      flushPrimaryDwell(Date.now());
      if (scroller === document.documentElement) {
        window.removeEventListener("scroll", onScroll);
      } else {
        scroller.removeEventListener("scroll", onScroll);
      }
      mo.disconnect();
      io.disconnect();
      if (rafScroll.current != null) cancelAnimationFrame(rafScroll.current);
      primaryBlockIdRef.current = null;
      primarySinceRef.current = null;
    };
  }, [scrollRootRef, ensureBlock, recomputeScores, setPrimaryBlock, flushPrimaryDwell]);

  const highFrictionBlocks = Object.entries(frictionScores)
    .filter(([, s]) => s > FRICTION_TRIGGER)
    .map(([id]) => id);

  const sessionStats = (() => {
    const now = Date.now();
    const pid = primaryBlockIdRef.current;
    const since = primarySinceRef.current;
    let totalDwellMs = 0;
    let totalScrollBacks = 0;
    for (const id of Object.keys(perBlock.current)) {
      const m = perBlock.current[id];
      const live = id === pid && since != null ? now - since : 0;
      totalDwellMs += m.dwellMs + live;
      totalScrollBacks += m.scrollBacks;
    }
    return {
      totalDwellMs,
      totalScrollBacks,
      highFrictionCount: highFrictionBlocks.length,
    };
  })();

  return {
    frictionScores,
    highFrictionBlocks,
    resetBlock,
    sessionStats,
  };
}
