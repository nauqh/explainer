import type { ExploreScene, Lesson, ScrollyScene, StackScene, State } from "./lesson";

/** Step state = scene defaults + this step's `set`. Never accumulated from earlier steps. */
export function stepState(scene: ScrollyScene, stepIndex: number): State {
  return { ...scene.state, ...scene.steps[stepIndex].set };
}

/** One stepper screen: a scrolly step, or a whole explore or stack scene. */
export type Screen =
  | { scene: ScrollyScene; sceneIndex: number; step: number }
  | { scene: ExploreScene | StackScene; sceneIndex: number; step: null };

export function screens(lesson: Lesson): Screen[] {
  return lesson.scenes.flatMap<Screen>((scene, sceneIndex) =>
    scene.layout === "scrolly"
      ? scene.steps.map((_, step) => ({ scene, sceneIndex, step }))
      : [{ scene, sceneIndex, step: null }],
  );
}
