"use client";

import { createContext, useContext } from "react";
import type { Lesson } from "@/lib/lesson";

const LessonContext = createContext<Lesson | null>(null);

export const LessonProvider = LessonContext.Provider;

export function useLessonData(): Lesson {
  const lesson = useContext(LessonContext);
  if (!lesson) throw new Error("useLessonData outside a lesson");
  return lesson;
}
