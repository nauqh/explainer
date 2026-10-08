import type { Metadata } from "next";
import { Suspense } from "react";
import { NewLesson } from "@/components/LiveLesson";

export const metadata: Metadata = { title: "New lesson" };

// A static shell: the question is read on the client, so the landing page can prefetch this route and the
// navigation needs no server round trip. That keeps the flight from the landing page free of a frozen frame.
export default function NewLessonPage() {
  return (
    <Suspense>
      <NewLesson />
    </Suspense>
  );
}
