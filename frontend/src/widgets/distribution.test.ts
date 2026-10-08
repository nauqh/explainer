import { describe, expect, it } from "vitest";
import type { DistributionProps, Visual } from "@/lib/lesson";
import { computeDistribution, facts } from "./describe";

const props: DistributionProps = { labels: ["the", "cat", "sat"], logits: [0.2, 1.8, 2.2], target: 1 };
const state = { view: "probs", temperature: 1, topK: 3, topP: 1 };

describe("computeDistribution", () => {
  it("is softmax of the logits, ordered by logit", () => {
    const { probs, order } = computeDistribution(props, state);
    expect(probs.reduce((a, b) => a + b)).toBeCloseTo(1, 10);
    expect(probs[2]).toBeCloseTo(0.5538, 3);
    expect(order).toEqual([2, 1, 0]);
  });

  it("sharpens with low temperature and never reorders", () => {
    const cold = computeDistribution(props, { ...state, temperature: 0.3 });
    expect(cold.probs[2]).toBeGreaterThan(0.75);
    expect(computeDistribution(props, { ...state, temperature: 4 }).order).toEqual([2, 1, 0]);
  });

  it("drops by top-k and by top-p (the label that crosses p is kept)", () => {
    expect(computeDistribution(props, { ...state, topK: 1 }).kept).toEqual([false, false, true]);
    expect(computeDistribution(props, { ...state, topP: 0.5 }).kept).toEqual([false, false, true]);
    expect(computeDistribution(props, { ...state, topP: 0.6 }).kept).toEqual([false, true, true]);
  });

  it("exposes computed facts", () => {
    const f = facts({ widget: "Distribution", props } as Visual, state);
    expect(f).toMatchObject({ topLabel: "sat", topProb: "55%", kept: "3", targetProb: "37%" });
    expect(Number(f.crossEntropy)).toBeCloseTo(-Math.log(0.3711), 2);
  });
});
