import { describe, expect, it } from "vitest";
import type { PointCloudProps } from "./lesson";
import { analyse, fitLogistic, kmeans, makeDataset, mse } from "./pointcloud";

const curve: PointCloudProps = {
  dataset: { shape: "curve", n: 40, noise: 0.3, classes: 1, seed: 7 },
  xLabel: "x", yLabel: "y", classLabels: [], model: "polynomial",
};
const blobs = (classes: number, model: PointCloudProps["model"]): PointCloudProps => ({
  dataset: { shape: "blobs", n: 90, noise: 0.2, classes, seed: 3 },
  xLabel: "x", yLabel: "y", classLabels: [], model,
});

describe("datasets", () => {
  it("are deterministic per seed and hold out a quarter of the points", () => {
    expect(makeDataset(curve.dataset)).toEqual(makeDataset(curve.dataset));
    expect(makeDataset({ ...curve.dataset, seed: 8 })).not.toEqual(makeDataset(curve.dataset));
    expect(makeDataset(curve.dataset).filter((p) => p.test)).toHaveLength(10);
  });

  it("holds out test points from every class, not just one", () => {
    const pts = makeDataset(blobs(2, "knn").dataset).filter((p) => p.test);
    expect(new Set(pts.map((p) => p.label))).toEqual(new Set([0, 1]));
  });
});

describe("polynomial fit", () => {
  // Overfitting is only visible with few points; the catalog tells the model to use n 20 to 30 for it.
  it("shows under- and overfitting with few points: test error is U-shaped in degree", () => {
    const few = { ...curve, dataset: { ...curve.dataset, n: 20 } };
    const at = (degree: number) => analyse(few, { degree }) as { trainError: number; testError: number };
    const [d1, d3, d12] = [at(1), at(3), at(12)];
    expect(d3.trainError).toBeLessThan(d1.trainError);
    expect(d12.trainError).toBeLessThan(d3.trainError);
    expect(d1.testError).toBeGreaterThan(d3.testError * 3);
    expect(d12.testError).toBeGreaterThan(d3.testError * 3);
  });

  it("recovers a straight line", () => {
    const line = { ...curve, model: "linear" as const, dataset: { ...curve.dataset, shape: "line" as const, noise: 0 } };
    const r = analyse(line, {}) as { f: (x: number) => number; pts: { x: number; y: number }[] };
    expect(mse(r.pts as never, r.f)).toBeLessThan(0.01);
    expect(r.f(1) - r.f(0)).toBeCloseTo(0.6, 1);
  });
});

describe("classifiers", () => {
  it("logistic regression improves with training", () => {
    const pts = makeDataset(blobs(2, "logistic").dataset);
    expect(fitLogistic(pts, 30).loss).toBeLessThan(fitLogistic(pts, 1).loss);
    const r = analyse(blobs(2, "logistic"), { iteration: 30, threshold: 0.5 }) as { trainAccuracy: number };
    expect(r.trainAccuracy).toBeGreaterThan(0.9);
  });

  it("1-nearest-neighbour fits the training points exactly", () => {
    const r = analyse(blobs(3, "knn"), { k: 1 }) as { trainAccuracy: number };
    expect(r.trainAccuracy).toBe(1);
  });
});

describe("k-means", () => {
  it("never increases its loss as it iterates", () => {
    const pts = makeDataset(blobs(3, "kmeans").dataset);
    const losses = [0, 1, 2, 5, 10].map((i) => kmeans(pts, 3, i).loss);
    for (let i = 1; i < losses.length; i++) expect(losses[i]).toBeLessThanOrEqual(losses[i - 1] + 1e-12);
  });
});
