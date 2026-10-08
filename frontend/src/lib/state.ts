import type { ScrollyScene, State } from "./lesson";

/** Step state = scene defaults + this step's `set`. Never accumulated from earlier steps. */
export function stepState(scene: ScrollyScene, stepIndex: number): State {
  return { ...scene.state, ...scene.steps[stepIndex].set };
}
