"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

// The wait before part 1 exists (about 35-80 s). Evidence: docs/research/waiting.md.
// One centred figure in the manner of Information is Beautiful: flat, luminous shapes that keep reforming into
// the classic data-graphic forms (a bubble pack, a balloon race, a rounded treemap, a radial bar wheel). The big
// bubbles carry words from the question. When the plan arrives, the shapes gather into one labelled pack per
// part, and the part being written glows.

type Outline = { id: string; title: string; layout: string }[];
type RGB = [number, number, number];
/** One shape, in unit coordinates (a 1 x 0.8 box, y down). A circle is a rounded rect with rad = w / 2. */
type Shape = { x: number; y: number; w: number; h: number; rad: number; rot: number; c: RGB; a: number; stem: number; la: number };

const N = 56;
const DWELL_MS = 3400, MORPH_MS = 1400, SWEEP_MS = 380;
const PALETTE: RGB[] = [[242, 194, 48], [255, 122, 107], [94, 214, 178], [124, 196, 255], [183, 156, 255], [255, 158, 199]];
const INK = "#16236e";
const STOP = new Set(("a an and are as at be by can do does for from how i in is it its of on or that the this to was what " +
  "when where which who why will with you your vs versus about into than then there their they").split(" "));

/** A small seeded PRNG: the same question always makes the same figures. */
function seeded(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/** The data behind every form: a power-law spread of sizes, one colour each, the biggest few named after the question. */
function items(question: string) {
  const r = seeded(question);
  const words = [...new Set(question.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 6);
  return Array.from({ length: N }, (_, i) => ({
    r: i < words.length ? 0.075 - i * 0.004 : 0.012 + 0.036 * r() ** 2.2,
    c: PALETTE[i < words.length ? i % PALETTE.length : Math.floor(r() * PALETTE.length)],
    label: words[i] ?? "",
    t: r(),
  }));
}
type Item = ReturnType<typeof items>[number];

/** Circle packing by relaxation: pull to the centre, push apart on overlap. Runs once per form, not per frame. */
function pack(radii: number[], cx: number, cy: number, r: () => number) {
  const p = radii.map(() => ({ x: cx + gauss(r) * 0.1, y: cy + gauss(r) * 0.1 }));
  for (let it = 0; it < 260; it++) {
    for (const q of p) { q.x += (cx - q.x) * 0.02; q.y += (cy - q.y) * 0.02; }
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) {
      const dx = p[j].x - p[i].x, dy = p[j].y - p[i].y, d = Math.hypot(dx, dy) || 1e-6;
      const o = radii[i] + radii[j] + 0.004 - d;
      if (o > 0) { const k = o / d / 2; p[i].x -= dx * k; p[i].y -= dy * k; p[j].x += dx * k; p[j].y += dy * k; }
    }
  }
  return p;
}

const circle = (x: number, y: number, r: number, it: Item, rest?: Partial<Shape>): Shape =>
  ({ x, y, w: r * 2, h: r * 2, rad: r, rot: 0, c: it.c, a: 0.92, stem: 0, la: 1, ...rest });

function bubbles(its: Item[], r: () => number): Shape[] {
  const p = pack(its.map((it) => it.r), 0.5, 0.4, r);
  return its.map((it, i) => circle(p[i].x, p[i].y, it.r, it));
}
function balloons(its: Item[]): Shape[] {
  // A balloon race: time along x, size lifts each balloon higher, a thin string ties it to the baseline.
  const max = Math.max(...its.map((it) => it.r));
  return its.map((it) => circle(0.1 + it.t * 0.8, 0.72 - (it.r / max) ** 0.8 * 0.56, it.r * 0.72, it, { a: 0.82, stem: 1 }));
}
function treemap(its: Item[]): Shape[] {
  // Rounded tiles, grouped by colour, each tile's area matching its bubble's.
  const order = its.map((it, i) => ({ i, v: it.r * it.r, g: PALETTE.indexOf(it.c) })).sort((a, b) => a.g - b.g || b.v - a.v);
  const out: Shape[] = [];
  const tile = (list: typeof order, x0: number, y0: number, x1: number, y1: number) => {
    if (list.length === 1) {
      const g = 0.004, w = Math.max(0.002, x1 - x0 - g * 2), h = Math.max(0.002, y1 - y0 - g * 2), it = its[list[0].i];
      out[list[0].i] = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w, h, rad: Math.min(0.014, w / 2, h / 2), rot: 0, c: it.c, a: 0.92, stem: 0, la: 1 };
      return;
    }
    // Split the list where its running total crosses half, and the box along its longer side to match.
    const total = list.reduce((s, q) => s + q.v, 0);
    let k = 1, acc = list[0].v;
    while (k < list.length - 1 && acc + list[k].v / 2 < total / 2) acc += list[k++].v;
    const f = acc / total;
    if (x1 - x0 > y1 - y0) { const xm = x0 + (x1 - x0) * f; tile(list.slice(0, k), x0, y0, xm, y1); tile(list.slice(k), xm, y0, x1, y1); }
    else { const ym = y0 + (y1 - y0) * f; tile(list.slice(0, k), x0, y0, x1, ym); tile(list.slice(k), x0, ym, x1, y1); }
  };
  tile(order, 0.12, 0.06, 0.88, 0.74);
  return out;
}
function radial(its: Item[]): Shape[] {
  // A radial bar wheel: thin capsules fanning out from a hub, sorted into colour sectors.
  const order = its.map((_, i) => i).sort((a, b) => PALETTE.indexOf(its[a].c) - PALETTE.indexOf(its[b].c) || its[b].r - its[a].r);
  const max = Math.max(...its.map((it) => it.r));
  const out: Shape[] = [];
  order.forEach((i, k) => {
    const ang = (k / N) * Math.PI * 2 - Math.PI / 2, len = 0.04 + (its[i].r / max) * 0.26, mid = 0.075 + len / 2;
    out[i] = { x: 0.5 + Math.cos(ang) * mid, y: 0.4 + Math.sin(ang) * mid, w: len, h: 0.008, rad: 0.004, rot: ang, c: its[i].c, a: 0.92, stem: 0, la: 0 };
  });
  return out;
}
/** One pack per part, in a row (two rows past four parts). */
function partLayout(n: number) {
  const cols = n <= 4 ? n : Math.ceil(n / 2), rows = Math.ceil(n / cols);
  const cw = 0.86 / cols, ch = rows === 1 ? 0.6 : 0.36;
  // The full pack is about 0.27 in radius, and a pack of 1/n of the shapes about 1/sqrt(n) of that.
  const R = Math.min(cw * 0.34, ch * 0.4), k = (R * Math.sqrt(n)) / 0.27;
  return Array.from({ length: n }, (_, c) => {
    const y = rows === 1 ? 0.36 : 0.17 + ch * Math.floor(c / cols);
    return { x: 0.07 + cw * ((c % cols) + 0.5), y, k, w: cw, bottom: y + R };
  });
}
function parts(its: Item[], n: number, r: () => number): Shape[] {
  // Part 1 in marigold; the parts still queued sit back, faint.
  const out: Shape[] = [];
  partLayout(n).forEach((cell, c) => {
    const mine = its.map((_, i) => i).filter((i) => i % n === c);
    // The question's words are capped here, so no one bubble swallows a part's pack.
    const radii = mine.map((i) => Math.min(its[i].r, 0.04) * cell.k);
    const p = pack(radii, cell.x, cell.y, r);
    mine.forEach((i, j) => {
      out[i] = circle(p[j].x, p[j].y, radii[j], its[i], { c: PALETTE[c % PALETTE.length], a: c === 0 ? 0.95 : 0.55, la: 0 });
    });
  });
  return out;
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
// A soft overshoot, so shapes settle into place rather than stop dead.
const ease = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
// A tile looks the same turned half a circle, so rotate by the shortest way modulo pi.
const turn = (a: number, b: number) => ((((b - a + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines = 3) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) { out.push(line); line = w; } else line = next;
  }
  out.push(line);
  return out.length > lines ? [...out.slice(0, lines - 1), `${out[lines - 1]}...`] : out;
}

/** The figure: one canvas, requestAnimationFrame, no React re-render per frame. */
function Figure({ seed, outline, paused }: { seed: string; outline: Outline; paused: boolean }) {
  const reduce = usePrefersReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const outlineRef = useRef(outline);
  const pausedRef = useRef(paused);
  useEffect(() => { outlineRef.current = outline; }, [outline]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const its = items(seed);
    const cycle = [() => bubbles(its, seeded(`${seed}:pack`)), () => balloons(its), () => treemap(its), () => radial(its)];
    const phase = its.map((it) => it.t * Math.PI * 2);
    const family = getComputedStyle(el).fontFamily;
    // The first form grows in from nothing, each shape from its own centre.
    let to = cycle[0](), from = to.map((p) => ({ ...p, w: 0, h: 0, rad: 0 })), shownParts = 0, step = 0, changedAt = performance.now();
    let size = { w: 0, h: 0, s: 0, ox: 0, oy: 0 };
    const pointer = { x: -1e4, y: -1e4, k: 0, on: false };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = el.getBoundingClientRect();
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      // Forms live in a 1 x 0.8 box that fits the space, centred.
      const s = Math.min(width, height / 0.8);
      size = { w: width, h: height, s, ox: (width - s) / 2, oy: (height - s * 0.8) / 2 };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      pointer.x = e.clientX - b.left; pointer.y = e.clientY - b.top; pointer.on = true;
    };
    const leave = () => { pointer.on = false; };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);

    const current = (now: number): Shape[] =>
      to.map((b, i) => {
        const a = from[i] ?? b;
        // Shapes leave in a sweep from left to right, so a change reads as one flowing motion.
        const t = reduce ? 1 : Math.min(1, Math.max(0, (now - changedAt - b.x * SWEEP_MS) / MORPH_MS));
        const k = ease(t);
        return {
          x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), w: Math.max(0, mix(a.w, b.w, k)), h: Math.max(0, mix(a.h, b.h, k)),
          rad: Math.max(0, mix(a.rad, b.rad, k)), rot: a.rot + turn(a.rot, b.rot) * k,
          c: [mix(a.c[0], b.c[0], t), mix(a.c[1], b.c[1], t), mix(a.c[2], b.c[2], t)],
          a: mix(a.a, b.a, t), stem: mix(a.stem, b.stem, t), la: mix(a.la, b.la, t),
        };
      });

    const next = (now: number) => {
      from = current(now);
      const n = outlineRef.current.length;
      if (n && shownParts !== n) { shownParts = n; to = parts(its, n, seeded(`${seed}:parts`)); }
      else if (!n) { step += 1; to = cycle[step % cycle.length](); }
      changedAt = now;
    };

    const draw = (now: number) => {
      const { w, h, s, ox, oy } = size;
      ctx.clearRect(0, 0, w, h);
      pointer.k += ((pointer.on && !reduce ? 1 : 0) - pointer.k) * 0.08;
      const pts = current(now);
      const fs = Math.max(11, Math.min(15, s * 0.022));
      const base = oy + 0.74 * s;
      const pulse = reduce ? 1 : 0.8 + 0.2 * Math.sin(now * 0.004);
      // Balloon strings first, under every shape.
      ctx.lineWidth = 1;
      for (const p of pts) if (p.stem > 0.01) {
        ctx.strokeStyle = `rgb(255 255 255 / ${(0.22 * p.stem).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(ox + p.x * s, oy + p.y * s + (p.h * s) / 2);
        ctx.lineTo(ox + p.x * s, mix(oy + p.y * s, base, p.stem));
        ctx.stroke();
      }
      ctx.font = `600 ${fs}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      pts.forEach((p, i) => {
        let x = ox + p.x * s, y = oy + p.y * s;
        if (!reduce) { x += Math.sin(now * 0.0009 + phase[i]) * 1.2; y += Math.cos(now * 0.0011 + phase[i]) * 1.2; }
        // Shapes near the pointer lean away from it, like a hand brushing through balloons.
        const dx = x - pointer.x, dy = y - pointer.y, d = Math.hypot(dx, dy);
        if (pointer.k > 0.01 && d < 110 && d > 0) { const f = (1 - d / 110) ** 2 * 18 * pointer.k; x += (dx / d) * f; y += (dy / d) * f; }
        const pw = p.w * s, ph = p.h * s;
        const glow = shownParts > 0 && i % shownParts === 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgb(${p.c.map(Math.round).join(" ")} / ${(p.a * (glow ? pulse : 1)).toFixed(3)})`;
        ctx.beginPath();
        ctx.roundRect(-pw / 2, -ph / 2, pw, ph, Math.min(p.rad * s, pw / 2, ph / 2));
        ctx.fill();
        ctx.restore();
        // Labels sit on the shape itself, only where they fit.
        const label = its[i].label;
        if (label && p.la > 0.02 && ctx.measureText(label).width + 10 < pw && ph > fs + 6) {
          ctx.fillStyle = INK;
          ctx.globalAlpha = p.la;
          ctx.fillText(label, x, y);
          ctx.globalAlpha = 1;
        }
      });
      // Part titles under their packs, set on the figure like a chart's own labels.
      if (shownParts) {
        const fade = reduce ? 1 : Math.min(1, Math.max(0, (now - changedAt - 600) / 600));
        ctx.textBaseline = "top";
        partLayout(shownParts).forEach((cell, c) => {
          const lines = wrap(ctx, `${c + 1}. ${outlineRef.current[c]?.title ?? ""}`, cell.w * s - 14);
          ctx.fillStyle = c === 0 ? `rgb(242 194 48 / ${fade})` : `rgb(255 255 255 / ${0.6 * fade})`;
          lines.forEach((ln, j) => ctx.fillText(ln, ox + cell.x * s, oy + cell.bottom * s + 14 + j * fs * 1.3));
        });
      }
    };

    let raf = 0;
    const frame = (now: number) => {
      const holding = now - changedAt < MORPH_MS + SWEEP_MS + DWELL_MS;
      const planChanged = outlineRef.current.length > 0 && shownParts !== outlineRef.current.length;
      if (!pausedRef.current && (planChanged || (!holding && !outlineRef.current.length))) next(now);
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    const cleanup = () => {
      ro.disconnect();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };

    if (reduce) {
      // No movement: each form appears whole, and changes every few seconds.
      draw(performance.now());
      const id = setInterval(() => {
        if (!pausedRef.current) next(performance.now());
        draw(performance.now());
      }, 6000);
      return () => { clearInterval(id); cleanup(); };
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); cleanup(); };
  }, [seed, reduce]);

  return <canvas ref={canvas} aria-hidden className="block h-full w-full font-sans" />;
}

export function Waiting({ question, stage, outline }: { question: string; stage: string; outline: Outline }) {
  const [paused, setPaused] = useState(false);
  const caption = outline.length ? `Writing part 1 of ${outline.length}` : stage === "routing" ? "Reading your question"
    : stage === "searching" ? "Checking sources" : "Planning your lesson";

  return (
    // Exactly one screen: the figure takes whatever height is left, and the question is held to three lines.
    <header className="blueprint flex h-svh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-[76rem] items-center justify-between px-4 pt-[2.5svh] sm:px-8">
        <Link href="/" style={{ viewTransitionName: "home-link" }} className="font-sans text-sm text-white/75 underline-offset-4 hover:text-white hover:underline">Ask another question</Link>
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}
          className="rounded-full px-3 py-1 font-sans text-xs text-white/55 hover:bg-white/10 hover:text-white">
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="relative mx-auto min-h-0 w-full max-w-[60rem] flex-1 px-4 sm:px-8">
        <Figure seed={question} outline={outline} paused={paused} />
      </div>

      <div className="mx-auto w-full max-w-[52rem] px-4 pb-[6svh] text-center sm:px-8">
        <h1 id="question-heading" style={{ viewTransitionName: "question" }} className="display m-0 mx-auto line-clamp-3 w-fit text-balance text-[clamp(1.6rem,min(6.5vw,5.2svh),3.4rem)]">
          {question.charAt(0).toUpperCase() + question.slice(1)}
        </h1>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={caption} role="status" className="m-0 mt-[1.6svh] text-[clamp(1rem,2.4svh,1.25rem)] italic text-white/75"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </header>
  );
}
