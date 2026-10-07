"use client";

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { motion } from "motion/react";
import type { FunctionPlotProps } from "@/lib/lesson";
import { sampleCurve, type Point } from "./describe";
import type { WidgetProps } from "./Widget";

const WIDTH = 520, HEIGHT = 340, M = { top: 40, right: 20, bottom: 48, left: 56 };

export function FunctionPlot({ props, state, highlight, onPart }: WidgetProps<FunctionPlotProps>) {
  const pts = sampleCurve(props, state);
  const ys = pts.map((p) => p.y);
  const yDomain: [number, number] = props.y
    ? [props.y.min, props.y.max]
    : ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 1];
  const x = scaleLinear().domain([props.x.min, props.x.max]).range([M.left, WIDTH - M.right]);
  const y = scaleLinear().domain(yDomain).range([HEIGHT - M.bottom, M.top]).nice();
  // Clamp so a curve leaving a fixed y axis runs along the edge instead of off the plot.
  const [y0, y1] = y.domain();
  const d = line<Point>().x((p) => x(p.x)).y((p) => y(Math.min(Math.max(p.y, y0), y1)))(pts) ?? "";
  const lit = (id: string) => highlight.has(id);
  const t = { duration: 0.45, ease: "easeInOut" } as const;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto max-h-full" aria-hidden>
      {y.ticks(5).map((v) => (
        <g key={`y${v}`}>
          <line x1={M.left} x2={WIDTH - M.right} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={0.8} />
          <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} className="font-sans" fill="var(--ink-soft)">{v}</text>
        </g>
      ))}
      {x.ticks(6).map((v) => (
        <text key={`x${v}`} x={x(v)} y={HEIGHT - M.bottom + 18} textAnchor="middle" fontSize={11} className="font-sans" fill="var(--ink-soft)">{v}</text>
      ))}

      <g onClick={() => onPart("x-axis")} className="cursor-pointer">
        <line x1={M.left} x2={WIDTH - M.right} y1={HEIGHT - M.bottom} y2={HEIGHT - M.bottom}
          stroke={lit("x-axis") ? "var(--marker)" : "var(--ink)"} strokeWidth={lit("x-axis") ? 4 : 1.2} />
        <text x={(M.left + WIDTH - M.right) / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={13} className="font-sans" fill="var(--ink)">
          {props.x.label}
        </text>
      </g>
      <g onClick={() => onPart("y-axis")} className="cursor-pointer">
        <line x1={M.left} x2={M.left} y1={M.top} y2={HEIGHT - M.bottom}
          stroke={lit("y-axis") ? "var(--marker)" : "var(--ink)"} strokeWidth={lit("y-axis") ? 4 : 1.2} />
        {props.y && (
          <text transform={`translate(14 ${(M.top + HEIGHT - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={13}
            className="font-sans" fill="var(--ink)">
            {props.y.label}
          </text>
        )}
      </g>

      <g onClick={() => onPart("curve")} className="cursor-pointer">
        {lit("curve") && <motion.path animate={{ d }} transition={t} fill="none" stroke="var(--marker)" strokeWidth={10} strokeLinecap="round" opacity={0.75} />}
        <motion.path animate={{ d }} transition={t} fill="none" stroke="var(--cobalt)" strokeWidth={2.5} strokeLinejoin="round" />
      </g>

      {props.params.map((p, i) => (
        <text key={p.name} x={WIDTH - M.right - i * 150} y={18} textAnchor="end" fontSize={13} className="font-sans" fill="var(--ink)">
          {p.label} = <tspan fontWeight={700} fill="var(--cobalt)">{Number(state[p.name] ?? p.min).toFixed(2)}</tspan>
        </text>
      ))}
    </svg>
  );
}
