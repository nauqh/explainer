"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import type { DistributionProps } from "@/lib/lesson";
import { useMorph } from "@/lib/motion";
import { computeDistribution } from "./describe";
import type { WidgetProps } from "./Widget";

const W = 560, LEFT = 112, RIGHT = 64, TOP = 30;

/** Bars of softmax(logits / temperature), in logit order. Top-k and top-p fade what sampling drops. */
export function Distribution({ props, state, highlight, onPart }: WidgetProps<DistributionProps>) {
  const morph = useMorph();
  const { probs, order, kept } = computeDistribution(props, state);
  const logits = state.view === "logits";
  const n = props.labels.length;
  // Few options get thicker bars, so a short distribution still fills the panel.
  const ROW = Math.max(30, Math.min(64, 320 / n));
  const height = TOP + n * ROW + 28;

  // Fixed domains, so the axis never jumps between steps: [0, 1] for probabilities, the logit range for scores.
  const lo = Math.min(0, ...props.logits), hi = Math.max(0, ...props.logits);
  const x = logits ? scaleLinear([lo, hi === lo ? lo + 1 : hi], [LEFT, W - RIGHT]) : scaleLinear([0, 1], [LEFT, W - RIGHT]);
  const zero = x(0);
  const lastKept = order.reduce((acc, i, rank) => (kept[i] ? rank : acc), 0);
  const cutoff = lastKept < n - 1;

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto max-h-full w-full" aria-hidden>
      <text x={LEFT} y={14} fontSize={12} className="font-sans" fill="var(--ink-soft)">
        {logits ? "Raw score (logit)" : `Probability at temperature ${Number(state.temperature ?? 1).toFixed(2)}`}
      </text>
      <line x1={zero} x2={zero} y1={TOP - 6} y2={TOP + n * ROW} stroke="var(--rule)" />

      {/* Tracks: the whole 0-100% scale behind each bar, so a share reads as a fraction of the row. Outside the
          bar parts, so notes still find room beside a bar. */}
      {!logits && order.map((i, rank) => (
        <rect key={`track-${i}`} x={LEFT} y={TOP + rank * ROW + 7} width={W - RIGHT - LEFT} height={ROW - 14} rx={3} fill="var(--cobalt-soft)" opacity={0.6} />
      ))}

      {order.map((i, rank) => {
        const id = `bar-${i}`;
        const y = TOP + rank * ROW;
        const v = logits ? props.logits[i] : probs[i];
        const x0 = Math.min(zero, x(v)), w = Math.abs(x(v) - zero);
        const lit = highlight.has(id) || (props.target === i && highlight.has("target"));
        const value = logits ? v.toFixed(1) : probs[i] < 0.005 ? "<1%" : `${Math.round(probs[i] * 100)}%`;
        return (
          <g key={id} data-part={id} onClick={() => onPart(id)} className="cursor-pointer">
            <text x={LEFT - 12} y={y + ROW / 2 + 5} textAnchor="end" fontSize={14} className="font-sans" fill="var(--ink)"
              fontWeight={lit ? 700 : 500}>
              {props.labels[i]}
            </text>
            {lit && <motion.rect initial={false} animate={{ x: x0 - 3, width: w + 6 }} transition={morph}
              y={y + 3} height={ROW - 6} rx={6} fill="var(--marker)" opacity={0.8} />}
            <motion.rect initial={false} animate={{ x: x0, width: Math.max(w, 1.5), opacity: kept[i] || logits ? 1 : 0.22 }}
              transition={morph} y={y + 7} height={ROW - 14} rx={3} fill="var(--cobalt)" />
            <motion.text initial={false} animate={{ x: Math.max(x(v), zero) + 8, opacity: kept[i] || logits ? 1 : 0.5 }} transition={morph}
              y={y + ROW / 2 + 5} fontSize={13} className="font-sans tabular-nums" fill="var(--ink)">
              {value}
            </motion.text>
            {props.target === i && (
              <text data-part="target" x={W - 4} y={y + ROW / 2 + 5} textAnchor="end" fontSize={11} className="font-sans" fill="var(--ink-soft)">
                correct
              </text>
            )}
          </g>
        );
      })}

      {/* Sampling cutoff: everything under the line is dropped by top-k / top-p. */}
      {!logits && (
        <motion.g data-part="cutoff" initial={false} animate={{ opacity: cutoff ? 1 : 0, y: TOP + (lastKept + 1) * ROW }} transition={morph}
          onClick={() => onPart("cutoff")} className="cursor-pointer">
          <line x1={LEFT - 100} x2={W - 4} y1={0} y2={0} stroke={highlight.has("cutoff") ? "var(--ink)" : "var(--ink-soft)"}
            strokeWidth={highlight.has("cutoff") ? 2.5 : 1.5} strokeDasharray="6 4" />
          <text x={W - 4} y={14} textAnchor="end" fontSize={11} className="font-sans" fill="var(--ink-soft)">dropped when sampling</text>
        </motion.g>
      )}
    </svg>
  );
}
