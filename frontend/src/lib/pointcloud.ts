// Seeded datasets and small, deterministic model fits for the PointCloud widget.
// Pure and React-free: the widget draws from it, describe() and facts() read from it, tests check it.

import type { PointCloudProps } from "./lesson";

export type Pt = { x: number; y: number; label: number; test: boolean };

/** mulberry32: a tiny seeded PRNG, so every learner and every eval sees the same points. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

/** Points in roughly [-1, 1]^2. A quarter of them, chosen at random per seed, are test data. */
export function makeDataset(d: PointCloudProps["dataset"]): Pt[] {
  const r = rng(d.seed * 7919 + 17);
  const pts: Omit<Pt, "test">[] = [];
  for (let i = 0; i < d.n; i++) {
    const label = d.classes > 1 ? i % d.classes : 0;
    const j = () => gauss(r) * d.noise;
    switch (d.shape) {
      case "blobs": {
        const a = (2 * Math.PI * label) / d.classes + 0.4;
        pts.push({ x: 0.55 * Math.cos(a) + j() * 0.45 + gauss(r) * 0.12, y: 0.55 * Math.sin(a) + j() * 0.45 + gauss(r) * 0.12, label });
        break;
      }
      case "moons": {
        const t = Math.PI * r();
        const [x, y] = label === 0 ? [Math.cos(t), Math.sin(t)] : [1 - Math.cos(t), 0.5 - Math.sin(t)];
        pts.push({ x: (x - 0.5) * 0.8 + j() * 0.3, y: (y - 0.25) * 1.1 + j() * 0.3, label });
        break;
      }
      case "circles": {
        const t = 2 * Math.PI * r();
        const rad = label === 0 ? 0.85 : 0.4;
        pts.push({ x: rad * Math.cos(t) + j() * 0.2, y: rad * Math.sin(t) + j() * 0.2, label });
        break;
      }
      case "xor": {
        const x = r() * 2 - 1, y = r() * 2 - 1;
        pts.push({ x: x + j() * 0.2, y: y + j() * 0.2, label: x * y > 0 ? 0 : 1 });
        break;
      }
      case "line": {
        const x = r() * 2 - 1;
        pts.push({ x, y: 0.6 * x + 0.1 + gauss(r) * (0.04 + d.noise * 0.35), label });
        break;
      }
      case "curve": {
        const x = r() * 2 - 1;
        pts.push({ x, y: 0.75 * Math.sin(2.6 * x) + gauss(r) * (0.04 + d.noise * 0.35), label });
        break;
      }
    }
  }
  // Hold out a quarter of the points, chosen by a seeded shuffle so the split is independent of class.
  // (Picking by index would correlate with labels, which are also assigned by index.)
  const order = pts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const test = new Set(order.slice(0, Math.floor(pts.length / 4)));
  // Rounded so the server render and the browser agree exactly: engines differ in the last bit of Math.cos/log.
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return pts.map((p, i) => ({ ...p, x: r6(p.x), y: r6(p.y), test: test.has(i) }));
}

/** Solve A x = b by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Least-squares polynomial on the training points (degree 1 is the straight line). */
export function fitPolynomial(pts: Pt[], degree: number): (x: number) => number {
  const train = pts.filter((p) => !p.test);
  const m = degree + 1;
  const A = Array.from({ length: m }, () => Array<number>(m).fill(0));
  const b = Array<number>(m).fill(0);
  for (const p of train) {
    const pw = Array.from({ length: m }, (_, k) => p.x ** k);
    for (let i = 0; i < m; i++) {
      b[i] += pw[i] * p.y;
      for (let k = 0; k < m; k++) A[i][k] += pw[i] * pw[k];
    }
  }
  // ponytail: a whisper of ridge keeps degree 12 solvable; it barely changes the fit on [-1, 1].
  for (let i = 1; i < m; i++) A[i][i] += 1e-8;
  const w = solve(A, b);
  return (x) => w.reduce((s, c, k) => s + c * x ** k, 0);
}

export const mse = (pts: Pt[], f: (x: number) => number) =>
  pts.length ? pts.reduce((s, p) => s + (f(p.x) - p.y) ** 2, 0) / pts.length : 0;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Logistic regression trained by full-batch gradient descent on the training points. Returns P(class 1). */
export function fitLogistic(pts: Pt[], iterations: number): { p: (x: number, y: number) => number; loss: number } {
  const train = pts.filter((q) => !q.test);
  let w0 = 0, w1 = 0, w2 = 0;
  const lr = 1.5;
  for (let it = 0; it < iterations; it++) {
    let g0 = 0, g1 = 0, g2 = 0;
    for (const q of train) {
      const e = sigmoid(w0 + w1 * q.x + w2 * q.y) - q.label;
      g0 += e; g1 += e * q.x; g2 += e * q.y;
    }
    w0 -= (lr * g0) / train.length; w1 -= (lr * g1) / train.length; w2 -= (lr * g2) / train.length;
  }
  const p = (x: number, y: number) => sigmoid(w0 + w1 * x + w2 * y);
  const eps = 1e-9;
  const loss = train.reduce((s, q) => s - (q.label ? Math.log(p(q.x, q.y) + eps) : Math.log(1 - p(q.x, q.y) + eps)), 0) / train.length;
  return { p, loss };
}

/** k nearest training neighbours, majority vote; ties go to the class of the nearest point. */
export function knn(pts: Pt[], k: number): (x: number, y: number) => number {
  const train = pts.filter((p) => !p.test);
  return (x, y) => {
    const near = train
      .map((p) => ({ d: (p.x - x) ** 2 + (p.y - y) ** 2, label: p.label }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    const votes = new Map<number, number>();
    for (const n of near) votes.set(n.label, (votes.get(n.label) ?? 0) + 1);
    const best = Math.max(...votes.values());
    return near.find((n) => votes.get(n.label) === best)!.label;
  };
}

/** k-means from deterministic starting centroids (spread-out data points), after `iterations` updates. */
export function kmeans(pts: Pt[], k: number, iterations: number) {
  // Start from points spaced through the list, so the start is fixed and not all from one blob.
  let centroids = Array.from({ length: k }, (_, i) => {
    const p = pts[Math.floor((i * pts.length) / k + pts.length / (2 * k)) % pts.length];
    return { x: p.x, y: p.y };
  });
  const assign = () =>
    pts.map((p) => {
      let best = 0, bd = Infinity;
      centroids.forEach((c, i) => {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    });
  let groups = assign();
  for (let it = 0; it < iterations; it++) {
    centroids = centroids.map((c, i) => {
      const mine = pts.filter((_, j) => groups[j] === i);
      return mine.length ? { x: mine.reduce((s, p) => s + p.x, 0) / mine.length, y: mine.reduce((s, p) => s + p.y, 0) / mine.length } : c;
    });
    groups = assign();
  }
  const loss = pts.reduce((s, p, j) => s + (p.x - centroids[groups[j]].x) ** 2 + (p.y - centroids[groups[j]].y) ** 2, 0);
  return { centroids, groups, loss };
}

/** Everything the widget, describe() and facts() need for one state. */
export function analyse(props: PointCloudProps, state: Record<string, unknown>) {
  const pts = makeDataset(props.dataset);
  const train = pts.filter((p) => !p.test), test = pts.filter((p) => p.test);
  const num = (k: string, d: number) => (typeof state[k] === "number" ? (state[k] as number) : d);
  const m = props.model;

  if (m === "linear" || m === "polynomial") {
    const f = fitPolynomial(pts, m === "linear" ? 1 : num("degree", 1));
    return { kind: "regression" as const, pts, f, trainError: mse(train, f), testError: mse(test, f) };
  }
  if (m === "logistic" || m === "knn") {
    let predict: (x: number, y: number) => number;
    let loss: number | null = null;
    if (m === "logistic") {
      const fit = fitLogistic(pts, num("iteration", 0));
      const t = num("threshold", 0.5);
      predict = (x, y) => (fit.p(x, y) >= t ? 1 : 0);
      loss = fit.loss;
    } else {
      predict = knn(pts, num("k", 5));
    }
    const wrong = pts.map((p) => predict(p.x, p.y) !== p.label);
    const acc = (set: Pt[]) => (set.length ? set.filter((p) => predict(p.x, p.y) === p.label).length / set.length : 0);
    return { kind: "classification" as const, pts, predict, wrong, loss, trainAccuracy: acc(train), testAccuracy: acc(test) };
  }
  if (m === "kmeans") {
    return { kind: "clustering" as const, pts, ...kmeans(pts, num("k", 3), num("iteration", 0)) };
  }
  return { kind: "none" as const, pts };
}
