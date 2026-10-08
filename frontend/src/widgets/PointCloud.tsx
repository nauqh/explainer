"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { PointCloudProps } from "@/lib/lesson";
import { useMorph } from "@/lib/motion";
import { analyse, type Pt } from "@/lib/pointcloud";
import type { WidgetProps } from "./Widget";

const W = 560, H = 430, L = 52, R = 16, T = 28, B = 44;
const GRID_X = 48, GRID_Y = 36;
// Colour and shape both carry the class, so colour never carries meaning alone.
export const CLASS_COLOURS = ["#2747c9", "#d9822b", "#2a9d8f"];
const SHAPES = ["circle", "square", "triangle"] as const;

function Mark({ x, y, cls, hollow, colour }: { x: number; y: number; cls: number; hollow: boolean; colour: string }) {
  const fill = hollow ? "var(--plate)" : colour;
  const common = { fill, stroke: colour, strokeWidth: hollow ? 2 : 1 };
  const s = SHAPES[cls % 3];
  if (s === "square") return <rect x={x - 4.5} y={y - 4.5} width={9} height={9} {...common} />;
  if (s === "triangle") return <path d={`M${x},${y - 6} L${x + 5.5},${y + 4} L${x - 5.5},${y + 4} Z`} {...common} />;
  return <circle cx={x} cy={y} r={5} {...common} />;
}

/** A box around a set of points, tagged as a part so notes and highlights can find it. */
function PartBox({ id, pts, sx, sy, lit }: { id: string; pts: Pt[]; sx: (v: number) => number; sy: (v: number) => number; lit: boolean }) {
  if (!pts.length) return null;
  const xs = pts.map((p) => sx(p.x)), ys = pts.map((p) => sy(p.y));
  const x0 = Math.min(...xs) - 9, y0 = Math.min(...ys) - 9;
  return (
    <rect data-part={id} x={x0} y={y0} width={Math.max(...xs) - x0 + 9} height={Math.max(...ys) - y0 + 9} rx={10}
      fill="none" stroke={lit ? "var(--marker)" : "none"} strokeWidth={4} strokeDasharray="2 6" strokeLinecap="round" pointerEvents="none" />
  );
}

/** A seeded scatter with a model fitted in the browser: regression line or curve, class regions, or k-means. */
export function PointCloud({ props, state, highlight, onPart }: WidgetProps<PointCloudProps>) {
  const morph = useMorph();
  const a = useMemo(() => analyse(props, state), [props, state]);
  const show = String(state.show ?? "points");
  const split = String(state.split ?? "all");
  const fit = show === "fit" || show === "errors";
  const errors = show === "errors";

  // Fixed domains from the data, so axes never move between steps.
  const { sx, sy } = useMemo(() => {
    const xs = a.pts.map((p) => p.x), ys = a.pts.map((p) => p.y);
    const pad = (lo: number, hi: number) => [lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.08] as [number, number];
    // Pixel positions rounded to 0.01 so server and client HTML match exactly.
    const round = (f: ReturnType<typeof scaleLinear<number>>) => Object.assign((v: number) => Math.round(f(v) * 100) / 100, f);
    return {
      sx: round(scaleLinear(pad(Math.min(...xs), Math.max(...xs)), [L, W - R])),
      sy: round(scaleLinear(pad(Math.min(...ys), Math.max(...ys)), [H - B, T])),
    };
  }, [a.pts]);

  const visible = (p: Pt) => split === "all" || (split === "test") === p.test;
  const colourOf = (p: Pt, i: number) => {
    if (a.kind === "clustering") return fit ? CLASS_COLOURS[a.groups[i] % 3] : "var(--ink-soft)";
    if (a.kind === "regression" || a.kind === "none") return props.dataset.classes > 1 ? CLASS_COLOURS[p.label] : "var(--cobalt)";
    return CLASS_COLOURS[p.label];
  };

  const curve = useMemo(() => {
    if (a.kind !== "regression") return "";
    const [x0, x1] = sx.domain();
    return Array.from({ length: 161 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / 160;
      return `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(a.f(x)).toFixed(1)}`;
    }).join("");
  }, [a, sx, sy]);

  const grid = useMemo(() => {
    if (a.kind !== "classification") return [];
    const [x0, x1] = sx.domain(), [y0, y1] = sy.domain();
    const cw = (W - R - L) / GRID_X, ch = (H - B - T) / GRID_Y;
    return Array.from({ length: GRID_X * GRID_Y }, (_, k) => {
      const i = k % GRID_X, j = Math.floor(k / GRID_X);
      const cls = a.predict(x0 + ((i + 0.5) / GRID_X) * (x1 - x0), y1 - ((j + 0.5) / GRID_Y) * (y1 - y0));
      return { x: L + i * cw, y: T + j * ch, w: cw + 0.5, h: ch + 0.5, cls };
    });
  }, [a, sx, sy]);

  const lit = (id: string) => highlight.has(id);
  const labels = props.classLabels.length ? props.classLabels
    : props.dataset.classes > 1 ? Array.from({ length: props.dataset.classes }, (_, i) => `class ${i + 1}`) : [];
  const shown = a.pts.filter(visible);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto max-h-full w-full" aria-hidden>
      <defs>
        <clipPath id="pc-plot"><rect x={L} y={T} width={W - L - R} height={H - T - B} /></clipPath>
      </defs>

      {/* Decision regions: what the classifier predicts at every spot. */}
      {a.kind === "classification" && (
        // Opacity sits on the group, so overlapping cells blend once and leave no seams.
        <g data-part="fit" onClick={() => onPart("fit")} className="cursor-pointer transition-opacity duration-300"
          opacity={fit ? (lit("fit") ? 0.3 : 0.17) : 0}>
          {grid.map((c, k) => (
            <rect key={k} x={c.x} y={c.y} width={c.w} height={c.h} fill={CLASS_COLOURS[c.cls]}
              className="transition-[fill] duration-700 motion-reduce:transition-none" />
          ))}
        </g>
      )}

      {/* Axes */}
      <g data-part="axis-x" onClick={() => onPart("axis-x")} className="cursor-pointer">
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={lit("axis-x") ? "var(--ink)" : "var(--rule)"} strokeWidth={lit("axis-x") ? 2 : 1} />
        {sx.ticks(5).map((t) => (
          <text key={t} x={sx(t)} y={H - B + 16} textAnchor="middle" fontSize={11} className="font-sans" fill="var(--ink-soft)">{t}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={13} className="font-sans" fill="var(--ink)">{props.xLabel}</text>
      </g>
      <g data-part="axis-y" onClick={() => onPart("axis-y")} className="cursor-pointer">
        <line x1={L} x2={L} y1={T} y2={H - B} stroke={lit("axis-y") ? "var(--ink)" : "var(--rule)"} strokeWidth={lit("axis-y") ? 2 : 1} />
        {sy.ticks(5).map((t) => (
          <text key={t} x={L - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} className="font-sans" fill="var(--ink-soft)">{t}</text>
        ))}
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={13} className="font-sans" fill="var(--ink)">
          {props.yLabel}
        </text>
      </g>

      {/* Residuals: how far each shown point is from the fitted curve. */}
      <g data-part="errors" clipPath="url(#pc-plot)" opacity={errors ? 1 : 0} style={{ transition: "opacity 300ms" }}>
        {a.kind === "regression" && shown.map((p, i) => (
          <motion.line key={i} initial={false} animate={{ y2: sy(a.f(p.x)) }} transition={morph}
            x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y)} stroke={lit("errors") ? "var(--ink)" : "var(--ink-soft)"} strokeWidth={1.5} strokeDasharray="3 3" />
        ))}
        {a.kind === "classification" && a.pts.map((p, i) => visible(p) && a.wrong[i] && (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={10} fill="none" stroke="var(--ink)" strokeWidth={lit("errors") ? 2.5 : 1.5} />
        ))}
      </g>

      {/* Fitted line or curve */}
      {a.kind === "regression" && (
        <g data-part="fit" onClick={() => onPart("fit")} className="cursor-pointer" clipPath="url(#pc-plot)">
          {lit("fit") && fit && <motion.path initial={false} animate={{ d: curve }} transition={morph} fill="none" stroke="var(--marker)" strokeWidth={10} opacity={0.75} />}
          <motion.path initial={false} animate={{ d: curve, opacity: fit ? 1 : 0 }} transition={morph} fill="none" stroke="var(--ink)" strokeWidth={2.5} />
        </g>
      )}

      {/* Points: filled = training data, hollow = held-out test data. */}
      <g>
        {a.pts.map((p, i) => (
          <g key={i} opacity={visible(p) ? 1 : 0.08} style={{ transition: "opacity 400ms" }}>
            <Mark x={sx(p.x)} y={sy(p.y)} cls={a.kind === "clustering" && fit ? a.groups[i] : p.label} hollow={p.test} colour={colourOf(p, i)} />
          </g>
        ))}
      </g>

      {/* Invisible boxes so notes and highlights can point at groups of points. */}
      {Array.from({ length: props.dataset.classes }, (_, c) => (
        <PartBox key={c} id={`class-${c}`} pts={a.pts.filter((p) => p.label === c && visible(p))} sx={sx} sy={sy} lit={lit(`class-${c}`)} />
      ))}
      <PartBox id="train" pts={a.pts.filter((p) => !p.test)} sx={sx} sy={sy} lit={lit("train")} />
      <PartBox id="test" pts={a.pts.filter((p) => p.test)} sx={sx} sy={sy} lit={lit("test")} />

      {/* k-means centroids */}
      {a.kind === "clustering" && fit && a.centroids.map((c, i) => (
        <motion.g key={i} data-part={`centroid-${i}`} initial={false} animate={{ x: sx(c.x), y: sy(c.y) }} transition={morph}
          onClick={() => onPart(`centroid-${i}`)} className="cursor-pointer">
          {lit(`centroid-${i}`) && <circle r={16} fill="var(--marker)" opacity={0.8} />}
          <path d="M-8,-8 L8,8 M8,-8 L-8,8" stroke="var(--plate)" strokeWidth={6} strokeLinecap="round" />
          <path d="M-8,-8 L8,8 M8,-8 L-8,8" stroke={CLASS_COLOURS[i % 3]} strokeWidth={3} strokeLinecap="round" />
        </motion.g>
      ))}

      {/* Legend */}
      <g transform={`translate(${L + 8} ${T - 14})`} className="font-sans" fontSize={12}>
        {labels.map((label, c) => (
          <g key={c} transform={`translate(${c * 120} 0)`}>
            <Mark x={6} y={-4} cls={c} hollow={false} colour={CLASS_COLOURS[c]} />
            <text x={16} y={0} fill="var(--ink)">{label}</text>
          </g>
        ))}
        <g transform={`translate(${labels.length * 120} 0)`}>
          <circle cx={6} cy={-4} r={4.5} fill="var(--plate)" stroke="var(--ink-soft)" strokeWidth={2} />
          <text x={16} y={0} fill="var(--ink-soft)">hollow = test data</text>
        </g>
      </g>
    </svg>
  );
}
