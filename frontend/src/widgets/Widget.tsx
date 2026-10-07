"use client";

import type { State, Visual } from "@/lib/lesson";
import { useLesson } from "@/lib/store";
import { Compare } from "./Compare";
import { describe } from "./describe";
import { Diagram } from "./Diagram";
import { FunctionPlot } from "./FunctionPlot";
import { Matrix } from "./Matrix";
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
};

/** A scene's visual: reads its state and highlights from the store, and carries a text alternative. */
export function Widget({ sceneId, visual, defaults, stepHighlight = [] }: {
  sceneId: string;
  visual: Visual;
  defaults: State;
  stepHighlight?: string[];
}) {
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
  }

  return (
    <figure role="group" aria-label={NAMES[visual.widget]} className="m-0 flex h-full w-full items-center justify-center">
      {body}
      <figcaption className="sr-only" aria-live="polite">
        {facts.join(". ")}.
      </figcaption>
    </figure>
  );
}
