// Plain facts about what each widget shows at a given state. Pure and React-free, so the
// Python evals can call it through Node to check that step text matches the visual.
// The same functions give every widget its text alternative.

import { compile } from "@/lib/expr";
import type {
  CompareProps,
  DiagramProps,
  FunctionPlotProps,
  MatrixVisual,
  SequenceProps,
  State,
  Visual,
} from "@/lib/lesson";

type MatrixProps = MatrixVisual["props"];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function visibleNodes(props: DiagramProps, state: State) {
  const n = typeof state.visible === "number" ? state.visible : props.nodes.length;
  return props.nodes.slice(0, n);
}

export function describeDiagram(props: DiagramProps, state: State): string[] {
  const shown = visibleNodes(props, state);
  const ids = new Set(shown.map((n) => n.id));
  const label = (id: string) =>
    props.nodes.find((n) => n.id === id)?.label ?? props.groups.find((g) => g.id === id)?.label ?? id;
  const edges = props.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return [
    `${shown.length} of ${props.nodes.length} components shown: ${shown.map((n) => n.label).join(", ")}`,
    edges.length
      ? `connections: ${edges.map((e) => `${label(e.from)} to ${label(e.to)}${e.label ? ` (${e.label})` : ""}`).join("; ")}`
      : "no connections shown",
    state.focus ? `focus on ${label(String(state.focus))}` : "no component in focus",
  ];
}

export function shownMessages(props: SequenceProps, state: State) {
  const end = props.messages.findIndex((m) => m.id === state.upTo);
  return props.messages.slice(0, end === -1 ? props.messages.length : end + 1);
}

export function describeSequence(props: SequenceProps, state: State): string[] {
  const actor = (id: string) => props.actors.find((a) => a.id === id)?.label ?? id;
  const shown = shownMessages(props, state);
  const last = shown.at(-1);
  return [
    `${shown.length} of ${props.messages.length} messages shown`,
    ...shown.map((m, i) => `message ${i + 1}: ${actor(m.from)} to ${actor(m.to)}: ${m.text}`),
    last ? `latest message is from ${actor(last.from)} to ${actor(last.to)}` : "no messages shown",
  ];
}

export function describeCompare(props: CompareProps, state: State): string[] {
  const col = props.columns.find((c) => c.id === state.highlight);
  return [
    `compares ${props.columns.map((c) => c.title).join(", ")}`,
    ...props.rows.map((r) => `${r.label}: ${r.cells.map((c, i) => `${props.columns[i].title} ${c}`).join("; ")}`),
    col ? `highlighted: ${col.title}` : "no column highlighted",
  ];
}

export type Point = { x: number; y: number };

/** Sample the curve at the current parameter values. Non-finite points are dropped. */
export function sampleCurve(props: FunctionPlotProps, state: State, n = 200): Point[] {
  const f = compile(props.expression);
  const vars: Record<string, number> = {};
  for (const p of props.params) vars[p.name] = Number(state[p.name] ?? p.min);
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const x = props.x.min + ((props.x.max - props.x.min) * i) / n;
    const y = f({ ...vars, x });
    if (Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function shape(points: Point[]): string {
  // Directions of travel, with repeats collapsed: [1, -1] means up, then down.
  const runs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i].y - points[i - 1].y;
    const s = Math.abs(d) < 1e-9 ? 0 : Math.sign(d);
    if (s && s !== runs.at(-1)) runs.push(s);
  }
  if (runs.length === 0) return "the curve is flat";
  if (runs.length === 1) return runs[0] > 0 ? "the curve is increasing" : "the curve is decreasing";
  if (runs.length === 2) return runs[0] > 0 ? "the curve rises, then falls" : "the curve falls, then rises";
  return `the curve changes direction ${runs.length - 1} times`;
}

export function describeFunctionPlot(props: FunctionPlotProps, state: State): string[] {
  const pts = sampleCurve(props, state);
  if (pts.length === 0) return [`y = ${props.expression} is undefined over the shown range`];
  const ys = pts.map((p) => p.y);
  const lo = pts[ys.indexOf(Math.min(...ys))];
  const hi = pts[ys.indexOf(Math.max(...ys))];
  return [
    `plot of y = ${props.expression} for ${props.x.label} from ${fmt(props.x.min)} to ${fmt(props.x.max)}`,
    ...props.params.map((p) => `${p.label} (${p.name}) = ${fmt(Number(state[p.name] ?? p.min))}`),
    shape(pts),
    `lowest y is ${fmt(lo.y)} at x = ${fmt(lo.x)}; highest y is ${fmt(hi.y)} at x = ${fmt(hi.x)}`,
  ];
}

export type Grid = { rows: string[]; cols: string[]; values: number[][] };

/** Compute the matrix values from the recipe. The model never writes these numbers. */
export function computeMatrix(props: MatrixProps): Grid {
  if (props.recipe === "softmax") {
    const values = props.scores.map((row) => {
      const m = Math.max(...row);
      const e = row.map((s) => Math.exp(s - m));
      const sum = e.reduce((a, b) => a + b, 0);
      return e.map((v) => v / sum);
    });
    return { rows: props.rows, cols: props.cols, values };
  }
  if (props.recipe === "dot-product") {
    const values = props.rows.map((r) =>
      props.cols.map((c) => r.values.reduce((sum, v, i) => sum + v * c.values[i], 0)),
    );
    return { rows: props.rows.map((v) => v.label), cols: props.cols.map((v) => v.label), values };
  }
  const k = props.classes.length;
  const values = Array.from({ length: k }, () => Array<number>(k).fill(0));
  props.actual.forEach((a, i) => values[a][props.predicted[i]]++);
  return { rows: props.classes, cols: props.classes, values };
}

export function describeMatrix(props: MatrixProps, state: State): string[] {
  const g = computeMatrix(props);
  const what = {
    softmax: "softmax weights, each row sums to 1",
    "dot-product": "dot products of row vectors with column vectors",
    confusion: "counts of actual class (rows) against predicted class (columns)",
  }[props.recipe];
  const lines = [
    what,
    ...g.values.map((row, r) => {
      const best = row.indexOf(Math.max(...row));
      return `${g.rows[r]}: ${row.map((v, c) => `${g.cols[c]} ${fmt(v)}`).join(", ")}; largest is ${g.cols[best]}`;
    }),
  ];
  const m = /^cell-(\d+)-(\d+)$/.exec(String(state.selected ?? ""));
  lines.push(
    m ? `selected cell: ${g.rows[+m[1]]}, ${g.cols[+m[2]]} = ${fmt(g.values[+m[1]][+m[2]])}` : "no cell selected",
  );
  return lines;
}

export function describe(visual: Visual, state: State): string[] {
  switch (visual.widget) {
    case "Diagram": return describeDiagram(visual.props, state);
    case "Sequence": return describeSequence(visual.props, state);
    case "Compare": return describeCompare(visual.props, state);
    case "FunctionPlot": return describeFunctionPlot(visual.props, state);
    case "Matrix": return describeMatrix(visual.props, state);
  }
}
