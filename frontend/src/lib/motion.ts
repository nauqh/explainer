import { useSyncExternalStore } from "react";

/**
 * Timing for value changes (bars, curves, cells): slow enough to follow, about 1 s per stage
 * (Heer and Robertson 2007, docs/research/scrollytelling.md). Instant under reduced motion.
 */
export function useMorph() {
  const reduce = usePrefersReducedMotion();
  return { duration: reduce ? 0 : 0.8, ease: "easeInOut" } as const;
}

const REDUCE = "(prefers-reduced-motion: reduce)";

/**
 * Runs `update` inside a view transition when one can play, otherwise just runs it. A hidden tab is the common
 * case here: part 1 often lands while the learner is elsewhere, and the browser refuses to animate a hidden
 * document. It can also drop a transition already under way (the tab hides mid-flight); `update` still runs then,
 * and `ready` rejects with nothing to act on, so that rejection is swallowed rather than reported as an error.
 */
export function viewTransition(update: () => void | Promise<void>) {
  if (!document.startViewTransition || document.visibilityState === "hidden" || window.matchMedia(REDUCE).matches) {
    void update();
    return;
  }
  document.startViewTransition(update).ready.catch(() => {});
}
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * Reduced-motion preference that is safe to read during render of server-rendered components: hydration uses
 * the server value (no preference), then React re-renders with the real one, so the HTML never mismatches.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(REDUCE).matches, () => false);
}
