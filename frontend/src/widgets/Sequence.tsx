"use client";

import { motion } from "motion/react";
import type { SequenceProps } from "@/lib/lesson";
import { shownMessages } from "./describe";
import type { WidgetProps } from "./Widget";

const COL = 150, ROW = 56, TOP = 56, PAD = 20;

export function Sequence({ props, state, highlight, onPart }: WidgetProps<SequenceProps>) {
  const x = (id: string) => PAD + 65 + props.actors.findIndex((a) => a.id === id) * COL;
  const shown = shownMessages(props, state).length;
  const width = PAD * 2 + 130 + (props.actors.length - 1) * COL;
  const height = TOP + (props.messages.length + 0.6) * ROW;
  const t = { duration: 0.4, ease: "easeOut" } as const;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-full" aria-hidden>
      <defs>
        <marker id="sq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>

      {props.actors.map((a) => {
        const lit = highlight.has(a.id);
        return (
          <g key={a.id} onClick={() => onPart(a.id)} className="cursor-pointer">
            <line x1={x(a.id)} x2={x(a.id)} y1={TOP} y2={height - 8} stroke="var(--rule)" strokeDasharray="4 4" />
            <rect x={x(a.id) - 62} y={8} width={124} height={34} rx={17}
              fill={lit ? "var(--marker-soft)" : "var(--plate)"} stroke={lit ? "var(--marker)" : "var(--ink)"} strokeWidth={lit ? 2.5 : 1.2} />
            <text x={x(a.id)} y={30} textAnchor="middle" fontSize={13} className="font-sans" fontWeight={lit ? 700 : 500} fill="var(--ink)">
              {a.label}
            </text>
          </g>
        );
      })}

      {props.messages.map((m, i) => {
        const y = TOP + (i + 0.8) * ROW;
        const x1 = x(m.from), x2 = x(m.to);
        const latest = i === shown - 1;
        const lit = highlight.has(m.id);
        const self = m.from === m.to;
        const d = self
          ? `M${x1},${y} h40 v18 h-38`
          : `M${x1},${y} L${x2 + (x2 > x1 ? -4 : 4)},${y}`;
        return (
          <motion.g key={m.id} initial={false} onClick={() => onPart(m.id)} className="cursor-pointer"
            animate={{ opacity: i < shown ? 1 : 0, x: i < shown ? 0 : -6 }} transition={t}>
            {lit && <rect x={Math.min(x1, x2) + 6} y={y - 24} width={Math.abs(x2 - x1) - 12 || 120} height={16} fill="var(--marker-soft)" rx={3} />}
            <path d={d} fill="none" stroke={latest ? "var(--cobalt)" : "var(--ink)"} strokeWidth={latest || lit ? 2.2 : 1.3} markerEnd="url(#sq-arrow)" />
            <text x={self ? x1 + 46 : (x1 + x2) / 2} y={self ? y + 13 : y - 11} textAnchor={self ? "start" : "middle"} fontSize={12}
              className="font-sans" fill="var(--ink)" fontWeight={lit || latest ? 650 : 400}>
              {i + 1}. {m.text}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
