"use client";

import { motion } from "motion/react";
import type { DiagramProps } from "@/lib/lesson";
import type { WidgetProps } from "./Widget";

const PAD = 28, LINE = 20, WRAP = 28;
// ponytail: label width estimated from character count (bold 16px sans), no DOM measuring, so it works in SSR.
const CHAR = 9.4, GROUP_CHAR = 8;

/** A label on one line, or split at the space nearest its middle when it is long. */
export function wrap(label: string): string[] {
  if (label.length <= WRAP) return [label];
  const mid = label.length / 2;
  let cut = -1;
  for (let i = label.indexOf(" "); i !== -1; i = label.indexOf(" ", i + 1)) {
    if (cut === -1 || Math.abs(i - mid) < Math.abs(cut - mid)) cut = i;
  }
  return cut === -1 ? [label] : [label.slice(0, cut), label.slice(cut + 1)];
}

/** Each node is as wide as its label, at least 140, and one line taller per wrapped line. */
export function nodeSize(label: string) {
  const lines = wrap(label);
  return { lines, w: Math.max(140, Math.ceil(Math.max(...lines.map((l) => l.length)) * CHAR) + 32), h: 26 + lines.length * LINE };
}

/** Layered layout: each node sits one layer after its furthest parent. Layers run left to right,
 *  or top to bottom when that gives a squarer picture (long pipelines on phones). Positions are node centers. */
export function layout(props: DiagramProps) {
  const n = props.nodes.length;
  const size = Object.fromEntries(props.nodes.map((nd) => [nd.id, nodeSize(nd.label)]));
  const W = Math.max(...props.nodes.map((nd) => size[nd.id].w)), H = Math.max(...props.nodes.map((nd) => size[nd.id].h));
  const layer: Record<string, number> = Object.fromEntries(props.nodes.map((nd) => [nd.id, 0]));
  // ponytail: Bellman-style relaxation capped at n rounds, so cycles stop instead of looping.
  for (let round = 0; round < n; round++) {
    for (const e of props.edges) {
      if (layer[e.to] < layer[e.from] + 1 && layer[e.from] + 1 < n) layer[e.to] = layer[e.from] + 1;
    }
  }
  const cols: string[][] = [];
  for (const nd of props.nodes) (cols[layer[nd.id]] ??= []).push(nd.id);
  const layers = cols.length, widest = Math.max(...cols.map((c) => c?.length ?? 0));
  const across = { step: 56, gap: H + 26 }, down = { step: 58, gap: W + 28 };
  // Along the flow each layer is as deep as its own largest node, so short rows don't leave wide gaps.
  const depth = (key: "w" | "h") => cols.map((col) => Math.max(0, ...(col ?? []).map((id) => size[id][key])));
  const starts = (d: number[], gap: number) => d.map((_, c) => d.slice(0, c).reduce((sum, v) => sum + v + gap, 0));
  const colW = depth("w"), rowH = depth("h"), colX = starts(colW, across.step), rowY = starts(rowH, down.step);
  // Top to bottom, an edge enters a group at its top center, so the group's title (top left) must end before it.
  const titleHalf = Math.max(0, ...props.groups.map((g) => g.label.length * GROUP_CHAR + 22));
  const side = PAD + Math.max(0, titleHalf - W / 2);
  // An edge that skips a layer would run behind the nodes between, so it bends out into a lane past them.
  const skips = props.edges.filter((e) => layer[e.to] - layer[e.from] > 1);
  // Top to bottom, the lane also holds the skipping edges' labels, which sit just right of it.
  const lane = skips.length ? 56 + Math.max(0, ...skips.map((e) => (e.label?.length ?? 0) * 7.5)) : 0;
  const wide = { w: PAD * 2 + colX[layers - 1] + colW[layers - 1], h: PAD * 2 + 22 + (widest - 1) * across.gap + H + (skips.length ? 56 : 0) };
  const tall = { w: side * 2 + (widest - 1) * down.gap + W + lane, h: PAD * 2 + 22 + rowY[layers - 1] + rowH[layers - 1] };
  const vertical = Math.abs(Math.log(tall.w / tall.h)) < Math.abs(Math.log(wide.w / wide.h));
  const pos: Record<string, { x: number; y: number }> = {};
  cols.forEach((col, c) =>
    col?.forEach((id, r) => {
      const offset = r + (widest - col.length) / 2;
      pos[id] = vertical
        ? { x: side + W / 2 + offset * down.gap, y: PAD + 22 + rowY[c] + rowH[c] / 2 }
        : { x: PAD + colX[c] + colW[c] / 2, y: PAD + 22 + offset * across.gap + H / 2 };
    }),
  );
  const width = vertical ? tall.w : wide.w, height = vertical ? tall.h : wide.h;
  // The lane runs just inside the far edge: right of everything top to bottom, below everything left to right.
  return { pos, size, layer, vertical, titleHalf, width, height, laneAt: (vertical ? width - lane + 56 : height) - PAD - 20 };
}

export function Diagram({ props, state, highlight, onPart }: WidgetProps<DiagramProps>) {
  const { pos, size, layer, vertical, titleHalf, width, height, laneAt } = layout(props);
  const box = (id: string) => {
    const p = pos[id], s = size[id];
    return { x0: p.x - s.w / 2, y0: p.y - s.h / 2, x1: p.x + s.w / 2, y1: p.y + s.h / 2 };
  };
  const visible = new Set(props.nodes.slice(0, Number(state.visible ?? props.nodes.length)).map((n) => n.id));
  const focus = state.focus == null ? null : String(state.focus);
  const inFocus = (id: string, group?: string | null) => focus === null || focus === id || focus === group;
  const t = { duration: 0.4, ease: "easeOut" } as const;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-full" aria-hidden>
      <defs>
        <marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-soft)" />
        </marker>
      </defs>

      {props.groups.map((g) => {
        const ids = props.nodes.filter((n) => n.group === g.id && visible.has(n.id)).map((n) => n.id);
        if (!ids.length) return null;
        const members = ids.map(box), centers = ids.map((id) => pos[id].x);
        let x0 = Math.min(...members.map((b) => b.x0)) - 12, x1 = Math.max(...members.map((b) => b.x1)) + 12;
        const y0 = Math.min(...members.map((b) => b.y0)) - 30, y1 = Math.max(...members.map((b) => b.y1)) + 12;
        if (vertical) {
          // Edges enter at each member's top center; the title must end before the leftmost one.
          x0 = Math.min(x0, Math.min(...centers) - titleHalf);
          x1 = Math.max(x1, Math.max(...centers) + titleHalf);
        }
        const lit = highlight.has(g.id);
        return (
          <motion.g key={g.id} initial={{ opacity: 0 }} animate={{ opacity: inFocus(g.id) ? 1 : 0.35 }} transition={t}
            data-part={g.id} onClick={() => onPart(g.id)} className="cursor-pointer">
            <motion.rect animate={{ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }} transition={t} rx={10}
              fill={lit ? "var(--marker-soft)" : "transparent"} stroke={focus === g.id ? "var(--cobalt)" : "var(--rule)"}
              strokeWidth={lit || focus === g.id ? 2.5 : 1.5} strokeDasharray={focus === g.id ? undefined : "5 4"} />
            <text x={x0 + 10} y={y0 + 19} className="font-sans" fontSize={14} fill="var(--ink-soft)" fontWeight={lit ? 700 : 500}>
              {g.label}
            </text>
          </motion.g>
        );
      })}

      {props.edges.map((e) => {
        const a = box(e.from), b = box(e.to), pa = pos[e.from], pb = pos[e.to];
        const show = visible.has(e.from) && visible.has(e.to);
        const skip = layer[e.to] - layer[e.from] > 1;
        // A skipping edge leaves and enters on the lane side; its curve peaks at the lane (3/4 of the way to the controls).
        const [x1, y1, x2, y2] = skip
          ? vertical ? [a.x1, pa.y, b.x1 + 2, pb.y] : [pa.x, a.y1, pb.x, b.y1 + 2]
          : vertical ? [pa.x, a.y1, pb.x, b.y0 - 2] : [a.x1, pa.y, b.x0 - 2, pb.y];
        const ctrl = skip ? (vertical ? x1 : y1) + (laneAt - (vertical ? x1 : y1)) / 0.75 : 0;
        const mx = skip && vertical ? laneAt : (x1 + x2) / 2, my = skip && !vertical ? laneAt + 18 : (y1 + y2) / 2;
        const d = skip
          ? vertical ? `M${x1},${y1} C${ctrl},${y1} ${ctrl},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${ctrl} ${x2},${ctrl} ${x2},${y2}`
          : vertical ? `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        const lit = highlight.has(e.id);
        return (
          <motion.g key={e.id} data-part={e.id} initial={false} animate={{ opacity: show ? (inFocus(e.from) || inFocus(e.to) ? 1 : 0.3) : 0 }} transition={t}>
            <path d={d} fill="none"
              stroke={lit ? "var(--marker)" : "var(--ink-soft)"} strokeWidth={lit ? 4 : 1.4} markerEnd="url(#dg-arrow)" />
            {e.label && (
              <text x={vertical ? mx + 8 : mx} y={vertical ? my + 4 : my - 6} textAnchor={vertical ? "start" : "middle"} fontSize={13} className="font-sans" fill="var(--ink-soft)"
                paintOrder="stroke" stroke="var(--plate)" strokeWidth={4}>
                {e.label}
              </text>
            )}
          </motion.g>
        );
      })}

      {props.nodes.map((nd) => {
        const p = pos[nd.id], s = size[nd.id];
        const lit = highlight.has(nd.id);
        const focused = focus !== null && (focus === nd.id || focus === nd.group);
        return (
          <motion.g key={nd.id} initial={false} data-part={nd.id} onClick={() => onPart(nd.id)} className="cursor-pointer"
            animate={{ opacity: visible.has(nd.id) ? (inFocus(nd.id, nd.group) ? 1 : 0.35) : 0, y: visible.has(nd.id) ? 0 : 8 }}
            transition={t}>
            <rect x={p.x - s.w / 2} y={p.y - s.h / 2} width={s.w} height={s.h} rx={6}
              fill={lit ? "var(--marker-soft)" : "var(--plate)"}
              stroke={focused ? "var(--cobalt)" : lit ? "var(--marker)" : "var(--ink)"} strokeWidth={lit || focused ? 2.5 : 1.2} />
            <text textAnchor="middle" fontSize={16} className="font-sans" fill="var(--ink)" fontWeight={lit ? 700 : 500}>
              {s.lines.map((line, i) => (
                <tspan key={i} x={p.x} y={p.y + 6 + (i - (s.lines.length - 1) / 2) * LINE}>{line}</tspan>
              ))}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
