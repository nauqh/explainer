"use client";

import type { ExploreScene, ScrollyScene } from "@/lib/lesson";
import { stepState } from "@/lib/state";
import { useLesson } from "@/lib/store";

/** Sliders and selects of an explore scene, bound to that scene's state. */
export function Controls({ scene }: { scene: ExploreScene }) {
  const state = useLesson((s) => s.states[scene.id]) ?? scene.state;
  const patch = useLesson((s) => s.patchState);
  return (
    <div className="flex flex-col gap-5 font-sans">
      {scene.controls.map((c) => {
        const id = `${scene.id}-${c.key}`;
        const value = state[c.key];
        return (
          <div key={c.key} className="flex flex-col gap-2">
            <label htmlFor={id} className="flex items-baseline justify-between text-sm font-medium">
              {c.label}
              {c.kind === "slider" && <span className="tabular-nums text-cobalt">{Number(value).toFixed(2)}</span>}
            </label>
            {c.kind === "slider" ? (
              <input id={id} type="range" min={c.min} max={c.max} step={c.step ?? (c.max - c.min) / 100} value={Number(value)}
                onChange={(e) => patch(scene.id, { [c.key]: Number(e.target.value) })} className="accent-[var(--cobalt)]" />
            ) : (
              <select id={id} value={JSON.stringify(value)} onChange={(e) => patch(scene.id, { [c.key]: JSON.parse(e.target.value) })}
                className="rounded-md border border-rule bg-plate px-3 py-2">
                {c.options.map((o) => (
                  <option key={JSON.stringify(o)} value={JSON.stringify(o)}>{o === null ? "None" : String(o)}</option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Replays the change into this step: back to the previous step's state, then forward again. */
export function ReplayButton({ scene, step }: { scene: ScrollyScene; step: number }) {
  const setState = useLesson((s) => s.setState);
  const replay = () => {
    setState(scene.id, step === 0 ? scene.state : stepState(scene, step - 1));
    setTimeout(() => setState(scene.id, stepState(scene, step)), 450);
  };
  return (
    <button type="button" onClick={replay}
      className="mt-3 inline-flex items-center gap-1.5 rounded-sm font-sans text-sm text-ink-soft hover:text-ink">
      <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" /><path d="M2.5 2.5v3.5H6" />
      </svg>
      Replay this step
    </button>
  );
}
