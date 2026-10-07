"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/lesson";
import { screens as toScreens, stepState } from "@/lib/state";
import { useLesson } from "@/lib/store";
import { Widget } from "@/widgets/Widget";
import { Blocks } from "./Blocks";
import { Controls, ReplayButton } from "./Controls";
import { Markup } from "./Markup";

/** One step per screen: Next / Back buttons, arrow keys and swipe. Same scenes as scrolly mode. */
export function StepperLesson({ lesson }: { lesson: Lesson }) {
  const screens = toScreens(lesson);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const setState = useLesson((s) => s.setState);
  const setActive = useLesson((s) => s.setActiveStep);
  const { scene, sceneIndex, step } = screens[index];
  const go = (d: number) => setIndex((i) => Math.min(screens.length - 1, Math.max(0, i + d)));

  useEffect(() => {
    if (scene.layout === "scrolly" && step !== null) {
      setState(scene.id, stepState(scene, step));
      setActive(scene.id, step);
    }
    // Move focus to the new screen so screen readers hear it; not on first load.
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [scene, step, setState, setActive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [role=radiogroup], [contenteditable]")) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || (e.target as HTMLElement).closest("input, textarea")) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  const position = scene.layout === "scrolly" && step !== null ? `, step ${step + 1} of ${scene.steps.length}` : "";

  return (
    <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="touch-pan-y pb-28">
      <div className="py-6">
        <p className="m-0 mb-1 font-sans text-sm text-ink-soft">
          Part {sceneIndex + 1} of {lesson.scenes.length}{position}
          {scene.layout === "explore" && ", optional"}
        </p>
        <h2 ref={heading} tabIndex={-1} className="m-0 text-[1.75rem] font-medium leading-tight outline-none">{scene.title}</h2>
      </div>

      {scene.layout === "scrolly" && step !== null && (
        <div className="flex flex-col gap-6">
          <div className="h-[min(26rem,48svh)] rounded-xl border border-rule bg-plate p-3 sm:p-6">
            <Widget sceneId={scene.id} visual={scene.visual} defaults={scene.state} stepHighlight={scene.steps[step].highlight} />
          </div>
          <div className="max-w-[62ch]">
            <p className="m-0"><Markup text={scene.steps[step].text} sceneId={scene.id} /></p>
            <ReplayButton scene={scene} step={step} />
          </div>
        </div>
      )}

      {scene.layout === "explore" && (
        <div className="flex flex-col gap-6">
          <p className="m-0 max-w-[62ch]"><Markup text={scene.task} sceneId={scene.id} /></p>
          <div className="h-[min(24rem,44svh)] rounded-xl border border-rule bg-plate p-3 sm:p-6">
            <Widget sceneId={scene.id} visual={scene.visual} defaults={scene.state} />
          </div>
          <Controls scene={scene} />
        </div>
      )}

      {scene.layout === "stack" && <Blocks scene={scene} />}

      <nav aria-label="Lesson steps"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[52rem] items-center gap-4 font-sans">
          <button type="button" onClick={() => go(-1)} disabled={index === 0}
            className="rounded-md border border-rule bg-plate px-4 py-2 text-sm font-medium disabled:opacity-40">
            Back
          </button>
          <div className="flex-1" role="progressbar" aria-label="Lesson progress" aria-valuemin={1} aria-valuemax={screens.length} aria-valuenow={index + 1}
            aria-valuetext={`Screen ${index + 1} of ${screens.length}`}>
            <div className="h-1 overflow-hidden rounded-full bg-rule">
              <div className="h-full origin-left rounded-full bg-cobalt transition-transform duration-300"
                style={{ transform: `scaleX(${(index + 1) / screens.length})` }} />
            </div>
            <p className="m-0 mt-1 text-center text-xs tabular-nums text-ink-soft">{index + 1} / {screens.length}</p>
          </div>
          <button type="button" onClick={() => go(1)} disabled={index === screens.length - 1}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40">
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}
