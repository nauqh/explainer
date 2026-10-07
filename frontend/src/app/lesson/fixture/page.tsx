import type { Metadata } from "next";
import { LessonView } from "@/components/Lesson";
import type { Lesson } from "@/lib/lesson";
// Copied from backend/tests/fixtures by `pnpm gen:fixture`. A dev fixture, not a product lesson.
import fixture from "@/fixtures/synthetic.json";

export const metadata: Metadata = { title: "Sample lesson" };

export default function FixtureLesson() {
  return <LessonView lesson={fixture as Lesson} />;
}
