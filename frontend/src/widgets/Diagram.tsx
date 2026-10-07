"use client";

import { motion } from "motion/react";
import type { DiagramProps } from "@/lib/lesson";
import type { WidgetProps } from "./Widget";

const W = 140, H = 46, PAD = 28;

/** Layered layout: each node sits one layer after its furthest parent. Layers run left to right,
 *  or top to bottom when that gives a squarer picture (long pipelines on phones). */
function layout(props: DiagramProps) {
  const n = props.nodes.length;
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
  const across = { step: 196, gap: 72 }, down = { step: 104, gap: 168 };
  const wide = { w: PAD * 2 + (layers - 1) * across.step + W, h: PAD * 2 + 22 + (widest - 1) * across.gap + H };
  const tall = { w: PAD * 2 + (widest - 1) * down.gap + W, h: PAD * 2 + 22 + (layers - 1) * down.step + H };
  const vertical = Math.abs(Math.log(tall.w / tall.h)) < Math.abs(Math.log(wide.w / wide.h));
  const pos: Record<string, { x: number; y: number }> = {};
  cols.forEach((col, c) =>
    col?.forEach((id, r) => {
      const offset = r + (widest - col.length) / 2;
      pos[id] = vertical
        ? { x: PAD + offset * down.gap, y: PAD + 22 + c * down.step }
        : { x: PAD + c * across.step, y: PAD + 22 + offset * across.gap };
    }),
  );
  return { pos, vertical, width: vertical ? tall.w : wide.w, height: vertical ? tall.h : wide.h };
}

export function Diagram({ props, state, highlight, onPart }: WidgetProps<DiagramProps>) {
  const { pos, vertical, width, height } = layout(props);
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
        const members = props.nodes.filter((n) => n.group === g.id && visible.has(n.id)).map((n) => pos[n.id]);
        if (!members.length) return null;
        const x0 = Math.min(...members.map((p) => p.x)) - 12, y0 = Math.min(...members.map((p) => p.y)) - 30;
        const x1 = Math.max(...members.map((p) => p.x)) + W + 12, y1 = Math.max(...members.map((p) => p.y)) + H + 12;
        const lit = highlight.has(g.id);
        return (
          <motion.g key={g.id} initial={{ opacity: 0 }} animate={{ opacity: inFocus(g.id) ? 1 : 0.35 }} transition={t}
            onClick={() => onPart(g.id)} className="cursor-pointer">
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
        const a = pos[e.from], b = pos[e.to];
        const show = visible.has(e.from) && visible.has(e.to);
        const [x1, y1, x2, y2] = vertical
          ? [a.x + W / 2, a.y + H, b.x + W / 2, b.y - 2]
          : [a.x + W, a.y + H / 2, b.x - 2, b.y + H / 2];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const d = vertical ? `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        const lit = highlight.has(e.id);
        return (
          <motion.g key={e.id} initial={false} animate={{ opacity: show ? (inFocus(e.from) || inFocus(e.to) ? 1 : 0.3) : 0 }} transition={t}>
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
        const p = pos[nd.id];
        const lit = highlight.has(nd.id);
        const focused = focus !== null && (focus === nd.id || focus === nd.group);
        return (
          <motion.g key={nd.id} initial={false} onClick={() => onPart(nd.id)} className="cursor-pointer"
            animate={{ opacity: visible.has(nd.id) ? (inFocus(nd.id, nd.group) ? 1 : 0.35) : 0, y: visible.has(nd.id) ? 0 : 8 }}
            transition={t}>
            <rect x={p.x} y={p.y} width={W} height={H} rx={6}
              fill={lit ? "var(--marker-soft)" : "var(--plate)"}
              stroke={focused ? "var(--cobalt)" : lit ? "var(--marker)" : "var(--ink)"} strokeWidth={lit || focused ? 2.5 : 1.2} />
            <text x={p.x + W / 2} y={p.y + H / 2 + 6} textAnchor="middle" fontSize={16} className="font-sans"
              fill="var(--ink)" fontWeight={lit ? 700 : 500}>
              {nd.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
