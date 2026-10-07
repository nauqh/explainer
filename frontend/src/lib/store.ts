import { create } from "zustand";
import type { State } from "./lesson";

type Link = { sceneId: string; partId: string } | null;

type LessonStore = {
  /** Current widget state per scene id. Steps and controls write it; widgets read it. */
  states: Record<string, State>;
  /** Active scrolly step per scene id, for step highlights. */
  activeStep: Record<string, number>;
  /** A part the learner tapped, in the text or in the widget. Both sides light up. */
  link: Link;
  setState: (sceneId: string, state: State) => void;
  patchState: (sceneId: string, patch: State) => void;
  setActiveStep: (sceneId: string, step: number) => void;
  toggleLink: (sceneId: string, partId: string) => void;
};

export const useLesson = create<LessonStore>((set) => ({
  states: {},
  activeStep: {},
  link: null,
  setState: (sceneId, state) => set((s) => ({ states: { ...s.states, [sceneId]: state } })),
  patchState: (sceneId, patch) =>
    set((s) => ({ states: { ...s.states, [sceneId]: { ...s.states[sceneId], ...patch } } })),
  setActiveStep: (sceneId, step) => set((s) => ({ activeStep: { ...s.activeStep, [sceneId]: step } })),
  toggleLink: (sceneId, partId) =>
    set((s) => ({
      link: s.link?.sceneId === sceneId && s.link.partId === partId ? null : { sceneId, partId },
    })),
}));
