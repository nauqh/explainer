import { expect, test } from "vitest";
import type { ScrollyScene } from "./lesson";
import { stepState } from "./state";

const scene = {
  layout: "scrolly",
  id: "s",
  title: "s",
  visual: { widget: "Sequence", props: { actors: [], messages: [] } },
  state: { visible: 1, focus: null },
  steps: [
    { id: "a", text: "", set: { visible: 3 }, highlight: [], covers: [] },
    { id: "b", text: "", set: { focus: "n1" }, highlight: [], covers: [] },
  ],
} as unknown as ScrollyScene;

test("a step applies only its own set on top of the defaults", () => {
  expect(stepState(scene, 0)).toEqual({ visible: 3, focus: null });
  // Not accumulated: step b does not inherit visible: 3 from step a.
  expect(stepState(scene, 1)).toEqual({ visible: 1, focus: "n1" });
});

test("scrolling back re-applies the earlier step", () => {
  stepState(scene, 1);
  expect(stepState(scene, 0)).toEqual({ visible: 3, focus: null });
  expect(scene.state).toEqual({ visible: 1, focus: null });
});
