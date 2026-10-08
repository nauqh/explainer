"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import type { ReactNode } from "react";

/**
 * Smooth, momentum-style page scrolling (Lenis) for the whole app. Lenis drives the real window scroll, so
 * sticky figures and the scroll-triggered steps keep working, and it honours prefers-reduced-motion by itself
 * (smoothing off, programmatic scrolls instant). Text boxes keep their own native scrolling.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, anchors: true, prevent: (node) => node.tagName === "TEXTAREA" }}>
      {children}
    </ReactLenis>
  );
}
