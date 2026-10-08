import { afterEach, describe, expect, it, vi } from "vitest";
import { viewTransition } from "./motion";

/** A browser stand-in: `start` plays the part of document.startViewTransition. */
function browser({ hidden = false, start }: { hidden?: boolean; start?: (cb: () => void) => { ready: Promise<void> } }) {
  vi.stubGlobal("document", { visibilityState: hidden ? "hidden" : "visible", startViewTransition: start });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("viewTransition", () => {
  it("in a hidden tab, applies the update without asking the browser to animate", () => {
    const start = vi.fn();
    browser({ hidden: true, start });
    const update = vi.fn();
    viewTransition(update);
    expect(update).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("when the browser drops the transition, still updates and leaves no unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    // What Chromium does when the tab hides mid-flight: run the update, then reject `ready`.
    browser({ start: (cb) => { cb(); return { ready: Promise.reject(new DOMException("Document hidden", "InvalidStateError")) }; } });
    const update = vi.fn();
    viewTransition(update);
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(update).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
  });
});
