"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Annotation, State, Visual } from "@/lib/lesson";
import { useLesson } from "@/lib/store";
import { Compare } from "./Compare";
import { describe, facts as computeFacts } from "./describe";
import { Diagram } from "./Diagram";
import { Distribution } from "./Distribution";
import { FunctionPlot } from "./FunctionPlot";
import { Matrix } from "./Matrix";
import { PointCloud } from "./PointCloud";
import { Sequence } from "./Sequence";

export type WidgetProps<P> = {
  props: P;
  state: State;
  /** Part ids lit by the active step or by a tapped word. */
  highlight: Set<string>;
  onPart: (partId: string) => void;
};

const NAMES: Record<Visual["widget"], string> = {
  Diagram: "Diagram",
  Sequence: "Sequence of messages",
  Compare: "Comparison table",
  FunctionPlot: "Plot",
  Matrix: "Matrix",
  Distribution: "Probability bars",
  PointCloud: "Scatter plot with a fitted model",
};

/** A scene's visual: reads its state and highlights from the store, and carries a text alternative. */
export function Widget({ sceneId, visual, defaults, stepHighlight = [], notes = [] }: {
  sceneId: string;
  visual: Visual;
  defaults: State;
  stepHighlight?: string[];
  /** The active step's annotations, pinned next to widget parts. */
  notes?: Annotation[];
}) {
  const root = useRef<HTMLElement>(null);
  const state = useLesson((s) => s.states[sceneId]) ?? defaults;
  const link = useLesson((s) => s.link);
  const toggleLink = useLesson((s) => s.toggleLink);
  const highlight = new Set(stepHighlight);
  if (link?.sceneId === sceneId) highlight.add(link.partId);
  const onPart = (partId: string) => toggleLink(sceneId, partId);
  const facts = describe(visual, state);

  let body;
  switch (visual.widget) {
    case "Diagram": body = <Diagram props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
    case "Sequence": body = <Sequence props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
    case "Compare": body = <Compare props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
    case "FunctionPlot": body = <FunctionPlot props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
    case "Matrix": body = <Matrix props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
    case "Distribution": body = <Distribution props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
    case "PointCloud": body = <PointCloud props={visual.props} state={state} highlight={highlight} onPart={onPart} />; break;
  }

  return (
    <figure ref={root} role="group" aria-label={NAMES[visual.widget]} className="relative m-0 flex h-full w-full items-center justify-center">
      {body}
      <Notes root={root} notes={notes} state={state} visual={visual} />
      <figcaption className="sr-only" aria-live="polite">
        {facts.join(". ")}{notes.length ? `. Notes: ${notes.map((n) => fill(n.text, visual, state)).join("; ")}` : ""}.
      </figcaption>
    </figure>
  );
}

type Placed = { key: string; text: string; left: number; top: number; above: boolean; below: boolean; inside: boolean; width?: number };

/**
 * Notes pinned beside widget parts. Every widget marks its parts with data-part, so this one layer
 * works for all of them. Re-measured on resize and after value animations settle.
 */
/** Note text may print {fact:name} and {stateKey}, like step text; notes are plain text otherwise. */
function fill(text: string, visual: Visual, state: State) {
  const f = computeFacts(visual, state);
  const show = (v: unknown) => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v ?? ""));
  return text.replace(/\{fact:(\w+)\}/g, (_, n: string) => f[n] ?? "").replace(/\{(\w+)\}/g, (_, k: string) => show(state[k]));
}

function Notes({ root, notes, state, visual }: {
  root: React.RefObject<HTMLElement | null>;
  notes: Annotation[];
  state: State;
  visual: Visual;
}) {
  const [placed, setPlaced] = useState<Placed[]>([]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      setPlaced(notes.flatMap<Placed>((n, i) => {
        const part = el.querySelector(`[data-part="${CSS.escape(n.anchor)}"]`);
        if (!part) return [];
        const r = part.getBoundingClientRect();
        // To the right of the part when there is room, else just above it; never over its label.
        // A part near the top edge (where legends and titles sit) gets its note below instead.
        // A part that fills most of the figure (a whole region or plot) gets its note inside its top-left corner.
        const text = fill(n.text, visual, state), key = `${n.anchor}-${i}`;
        if (r.height > box.height * 0.5 && r.width > box.width * 0.5) {
          return [{ key, text, above: false, below: false, inside: true, left: r.left - box.left + 10, top: r.top - box.top + 10 }];
        }
        const room = box.right - r.right - 16;
        const beside = room >= 100;
        const below = !beside && r.top - box.top < 72 && box.bottom - r.bottom > 48;
        const above = !beside && !below;
        return [{ key, text, above, below, inside: false, width: beside ? Math.min(room, 224) : undefined,
          left: beside ? r.right - box.left + 10 : Math.max(4, Math.min(r.left + r.width / 2 - box.left, box.width - 120)),
          top: beside ? r.top - box.top + r.height / 2 : below ? r.bottom - box.top + 6 : r.top - box.top - 6 }];
      }));
    };
    measure();
    const settle = setTimeout(measure, 850);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { clearTimeout(settle); ro.disconnect(); };
  }, [root, notes, state, visual]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {placed.map((p) => (
          <motion.div key={p.key} initial={{ opacity: 0 }} animate={{ opacity: 1, left: p.left, top: p.top }} exit={{ opacity: 0 }}
            style={{ maxWidth: p.width }}
            transition={{ duration: 0.25 }}
            className={`note absolute max-w-[14rem] ${p.above ? "-translate-x-1/2 -translate-y-full" : p.below ? "-translate-x-1/2" : p.inside ? "" : "-translate-y-1/2"}`}>
            {p.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
