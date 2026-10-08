import { describe, expect, it } from "vitest";
import type { DiagramProps } from "@/lib/lesson";
import { layout, nodeSize, wrap } from "./Diagram";

describe("diagram layout", () => {
  it("wraps a long label at the space nearest its middle", () => {
    expect(wrap("Self-attention")).toEqual(["Self-attention"]);
    expect(wrap("Embeddings (one vector per token)")).toEqual(["Embeddings (one", "vector per token)"]);
  });

  it("sizes each node to its label", () => {
    expect(nodeSize("Self").w).toBe(140);
    expect(nodeSize("Feed-forward network").w).toBeGreaterThan(nodeSize("Self-attention").w);
    expect(nodeSize("Embeddings (one vector per token)").h).toBeGreaterThan(nodeSize("Self-attention").h);
  });

  it("keeps a group title clear of the edge entering its top center", () => {
    const props = {
      nodes: [
        { id: "tok", label: "Tokens: The cat sat on the", group: null },
        { id: "emb", label: "Embeddings (one vector per token)", group: null },
        { id: "att", label: "Self-attention", group: "block" },
        { id: "ffn", label: "Feed-forward network", group: "block" },
      ],
      edges: [
        { id: "e1", from: "tok", to: "emb", label: "look up" },
        { id: "e2", from: "emb", to: "att", label: null },
        { id: "e3", from: "att", to: "ffn", label: null },
      ],
      groups: [{ id: "block", label: "One transformer block" }],
    } as unknown as DiagramProps;
    const { vertical, titleHalf, pos, width } = layout(props);
    expect(vertical).toBe(true);
    // The title starts 10px inside the group's left edge and must end before the center line.
    expect(10 + "One transformer block".length * 8).toBeLessThan(titleHalf);
    expect(pos.att.x - titleHalf).toBeGreaterThanOrEqual(0);
    expect(pos.att.x + titleHalf).toBeLessThanOrEqual(width);
  });
});
