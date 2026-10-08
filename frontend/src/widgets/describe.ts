// Plain facts about what each widget shows at a given state. Pure and React-free, so the
// Python evals can call it through Node to check that step text matches the visual.
// The same functions give every widget its text alternative.

import { compile } from "@/lib/expr";
import { analyse } from "@/lib/pointcloud";
import type {
  CompareProps,
  DiagramProps,
  DistributionProps,
  FunctionPlotProps,
  MatrixVisual,
  PointCloudProps,
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

export type Dist = {
  /** Probability per label, softmax(logits / temperature). */
  probs: number[];
  /** Label indices from highest to lowest logit. Temperature never changes this order. */
  order: number[];
  /** Whether top-k and top-p would keep each label for sampling. */
  kept: boolean[];
};

/** Probabilities and the sampling cutoff. The model gives logits; these numbers are computed here. */
export function computeDistribution(props: DistributionProps, state: State): Dist {
  const t = Math.max(Number(state.temperature ?? 1), 1e-6);
  const z = props.logits.map((l) => l / t);
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  const probs = e.map((v) => v / sum);
  const order = props.logits.map((_, i) => i).sort((a, b) => props.logits[b] - props.logits[a] || a - b);
  const k = Number(state.topK ?? props.labels.length);
  const p = Number(state.topP ?? 1);
  const kept = Array<boolean>(probs.length).fill(false);
  let mass = 0;
  order.forEach((i, rank) => {
    // Nucleus: keep labels until the kept mass reaches p (the label that crosses p is kept).
    if (rank < k && (rank === 0 || mass < p - 1e-9)) kept[i] = true;
    mass += probs[i];
  });
  return { probs, order, kept };
}

const pct = (p: number) => (p > 0 && p < 0.005 ? "under 1%" : `${Math.round(p * 100)}%`);

export function describeDistribution(props: DistributionProps, state: State): string[] {
  const { probs, order, kept } = computeDistribution(props, state);
  const logits = state.view === "logits";
  const dropped = order.filter((i) => !kept[i]).map((i) => props.labels[i]);
  return [
    logits
      ? `raw scores (logits) for ${props.labels.length} options: ${order.map((i) => `${props.labels[i]} ${fmt(props.logits[i])}`).join(", ")}`
      : `probabilities at temperature ${fmt(Number(state.temperature ?? 1))}: ${order.map((i) => `${props.labels[i]} ${pct(probs[i])}`).join(", ")}`,
    `most likely: ${props.labels[order[0]]}`,
    dropped.length ? `sampling would drop ${dropped.join(", ")}` : "sampling keeps every option",
    ...(props.target != null ? [`correct answer: ${props.labels[props.target]}, probability ${pct(probs[props.target])}`] : []),
  ];
}

export function describePointCloud(props: PointCloudProps, state: State): string[] {
  const a = analyse(props, state);
  const d = props.dataset;
  const nTest = a.pts.filter((p) => p.test).length;
  const show = String(state.show ?? "points"), split = String(state.split ?? "all");
  const lines = [
    `scatter of ${d.n} points (${d.n - nTest} training, ${nTest} test) shaped as ${d.shape}, ${props.xLabel} against ${props.yLabel}`,
    `showing ${split === "all" ? "all points" : `${split} points only`}${show === "points" ? "" : show === "fit" ? " with the fitted model" : " with the model and its errors"}`,
  ];
  if (a.kind === "regression") {
    const deg = props.model === "linear" ? 1 : Number(state.degree ?? 1);
    lines.push(`${deg === 1 ? "straight line" : `degree ${deg} polynomial`} fitted to the training points`,
      `mean squared error: training ${a.trainError.toFixed(3)}, test ${a.testError.toFixed(3)}`);
  } else if (a.kind === "classification") {
    lines.push(props.model === "logistic" ? `logistic regression after ${Number(state.iteration ?? 0)} training steps, threshold ${fmt(Number(state.threshold ?? 0.5))}` : `k nearest neighbours with k = ${Number(state.k ?? 5)}`,
      `accuracy: training ${pct(a.trainAccuracy)}, test ${pct(a.testAccuracy)}`);
  } else if (a.kind === "clustering") {
    lines.push(`k-means with ${Number(state.k ?? 3)} clusters after ${Number(state.iteration ?? 0)} updates, total squared distance ${a.loss.toFixed(2)}`);
  }
  return lines;
}

/** Named values a step can print with {fact:name}. Each widget declares its names in the backend catalog. */
export function facts(visual: Visual, state: State): Record<string, string> {
  if (visual.widget === "Distribution") {
    const props = visual.props;
    const { probs, order, kept } = computeDistribution(props, state);
    const entropy = -probs.reduce((a, p) => a + (p > 0 ? p * Math.log2(p) : 0), 0);
    const target = props.target != null ? probs[props.target] : null;
    return {
      topLabel: props.labels[order[0]],
      topProb: pct(probs[order[0]]),
      entropy: `${entropy.toFixed(2)} bits`,
      kept: String(kept.filter(Boolean).length),
      targetProb: target == null ? "n/a" : pct(target),
      crossEntropy: target == null ? "n/a" : (-Math.log(target)).toFixed(2),
    };
  }
  if (visual.widget === "PointCloud") {
    const a = analyse(visual.props, state);
    const split = String(state.split ?? "all");
    // Small errors need decimals; an exploding high-degree fit does not.
    const err = (e: number) => (e < 10 ? e.toFixed(3) : e < 1000 ? e.toFixed(1) : Math.round(e).toLocaleString("en"));
    if (a.kind === "regression") return { trainError: err(a.trainError), testError: err(a.testError) };
    if (a.kind === "classification") {
      const wrong = a.pts.filter((p, i) => a.wrong[i] && (split === "all" || (split === "test") === p.test)).length;
      return {
        trainAccuracy: pct(a.trainAccuracy), testAccuracy: pct(a.testAccuracy), misclassified: String(wrong),
        loss: a.loss == null ? "n/a" : a.loss.toFixed(3),
      };
    }
    if (a.kind === "clustering") return { loss: a.loss.toFixed(2) };
    return {};
  }
  if (visual.widget === "Matrix") {
    const g = computeMatrix(visual.props);
    const m = /^cell-(\d+)-(\d+)$/.exec(String(state.selected ?? ""));
    const v = m ? g.values[+m[1]]?.[+m[2]] : undefined;
    return { selectedValue: v == null ? "n/a" : visual.props.recipe === "softmax" ? pct(v) : fmt(v) };
  }
  return {};
}

export function describe(visual: Visual, state: State): string[] {
  switch (visual.widget) {
    case "Diagram": return describeDiagram(visual.props, state);
    case "Sequence": return describeSequence(visual.props, state);
    case "Compare": return describeCompare(visual.props, state);
    case "FunctionPlot": return describeFunctionPlot(visual.props, state);
    case "Matrix": return describeMatrix(visual.props, state);
    case "Distribution": return describeDistribution(visual.props, state);
    case "PointCloud": return describePointCloud(visual.props, state);
  }
}
