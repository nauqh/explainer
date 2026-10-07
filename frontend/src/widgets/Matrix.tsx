"use client";

import { motion } from "motion/react";
import type { MatrixVisual } from "@/lib/lesson";
import { computeMatrix } from "./describe";
import type { WidgetProps } from "./Widget";

const CELL = 64, LEFT = 96, TOP = 40;

export function Matrix({ props, state, highlight, onPart }: WidgetProps<MatrixVisual["props"]>) {
  const g = computeMatrix(props);
  const flat = g.values.flat();
  const lo = Math.min(0, ...flat), hi = Math.max(...flat);
  const level = (v: number) => (hi === lo ? 0 : (v - lo) / (hi - lo));
  const fmt = (v: number) => (props.recipe === "confusion" ? String(v) : v.toFixed(2));
  const width = LEFT + g.cols.length * CELL + 8, height = TOP + g.rows.length * CELL + 8;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-full" style={{ maxWidth: width * 1.3 }} aria-hidden>
      {g.cols.map((c, j) => (
        <text key={`c${j}`} x={LEFT + j * CELL + CELL / 2} y={TOP - 12} textAnchor="middle" fontSize={13} className="font-sans cursor-pointer"
          fontWeight={highlight.has(`col-${j}`) ? 700 : 500} fill="var(--ink)" onClick={() => onPart(`col-${j}`)}>
          {c}
        </text>
      ))}
      {g.rows.map((r, i) => (
        <text key={`r${i}`} x={LEFT - 12} y={TOP + i * CELL + CELL / 2 + 5} textAnchor="end" fontSize={13} className="font-sans cursor-pointer"
          fontWeight={highlight.has(`row-${i}`) ? 700 : 500} fill="var(--ink)" onClick={() => onPart(`row-${i}`)}>
          {r}
        </text>
      ))}

      {g.values.map((row, i) =>
        row.map((v, j) => {
          const id = `cell-${i}-${j}`;
          const a = level(v);
          return (
            <g key={id} onClick={() => onPart(id)} className="cursor-pointer">
              <motion.rect initial={false} animate={{ fillOpacity: 0.08 + a * 0.85 }} transition={{ duration: 0.4 }}
                x={LEFT + j * CELL + 2} y={TOP + i * CELL + 2} width={CELL - 4} height={CELL - 4} rx={4} fill="var(--cobalt)" />
              <text x={LEFT + j * CELL + CELL / 2} y={TOP + i * CELL + CELL / 2 + 5} textAnchor="middle" fontSize={14}
                className="font-sans tabular-nums" fill={a > 0.55 ? "#fff" : "var(--ink)"} fontWeight={state.selected === id ? 700 : 500}>
                {fmt(v)}
              </text>
            </g>
          );
        }),
      )}

      {/* Highlights and the selection sit on top so a dark cell never hides them. */}
      {[...highlight].map((id) => {
        const cell = /^cell-(\d+)-(\d+)$/.exec(id), row = /^row-(\d+)$/.exec(id), col = /^col-(\d+)$/.exec(id);
        const box = cell
          ? { x: LEFT + +cell[2] * CELL, y: TOP + +cell[1] * CELL, w: CELL, h: CELL }
          : row ? { x: LEFT, y: TOP + +row[1] * CELL, w: g.cols.length * CELL, h: CELL }
          : col ? { x: LEFT + +col[1] * CELL, y: TOP, w: CELL, h: g.rows.length * CELL } : null;
        return box && (
          <rect key={id} x={box.x} y={box.y} width={box.w} height={box.h} rx={6} fill="none" stroke="var(--marker)" strokeWidth={5}
            pointerEvents="none" />
        );
      })}
      {(() => {
        const m = /^cell-(\d+)-(\d+)$/.exec(String(state.selected ?? ""));
        return m && (
          <motion.rect initial={false} animate={{ x: LEFT + +m[2] * CELL + 1, y: TOP + +m[1] * CELL + 1 }} transition={{ duration: 0.4 }}
            width={CELL - 2} height={CELL - 2} rx={5} fill="none" stroke="var(--ink)" strokeWidth={2.5} pointerEvents="none" />
        );
      })()}
    </svg>
  );
}
