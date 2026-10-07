"use client";

import Link from "next/link";
import { MotionConfig } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Lesson } from "@/lib/lesson";
import { useLesson } from "@/lib/store";
import { LessonProvider } from "./LessonData";
import { ScrollyLesson } from "./Scrolly";
import { StepperLesson } from "./Stepper";

type View = "scrolly" | "stepper";

const QUERY = "(min-width: 48rem) and (prefers-reduced-motion: no-preference)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** `auto`: scrolly on wide screens, stepper on narrow screens or with reduced motion. */
function useAutoView(): View {
  return useSyncExternalStore(subscribe, () => (window.matchMedia(QUERY).matches ? "scrolly" : "stepper"), () => "scrolly");
}

// The lesson arrives whole for now. When generation streams over SSE (milestone 4), the page
// passes a lesson whose `scenes` grow as each validated scene arrives; nothing here changes.
export function LessonView({ lesson }: { lesson: Lesson }) {
  const auto = useAutoView();
  const [chosen, setChosen] = useState<View | null>(null);
  const view = chosen ?? (lesson.mode === "auto" ? auto : lesson.mode);

  useEffect(() => {
    useLesson.setState({
      states: Object.fromEntries(lesson.scenes.map((s) => [s.id, "state" in s ? s.state : {}])),
      activeStep: {},
      link: null,
    });
  }, [lesson]);

  return (
    <LessonProvider value={lesson}>
      <MotionConfig reducedMotion="user">
        <main className="mx-auto max-w-[76rem] px-4 sm:px-8">
          <header className="pt-10 pb-6 sm:pt-14">
            <Link href="/" className="font-sans text-sm text-ink-soft underline-offset-2 hover:underline">Ask another question</Link>
            <h1 className="m-0 mt-6 max-w-[24ch] text-[2.1rem] font-medium leading-[1.1] tracking-[-0.01em] sm:text-[2.9rem]">
              {lesson.question.charAt(0).toUpperCase() + lesson.question.slice(1)}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 font-sans text-sm">
              <span className="text-ink-soft">
                {lesson.level === "intermediate" || lesson.level === "advanced" ? "An" : "A"} {lesson.level} lesson on {lesson.concept.replaceAll("-", " ")}, in {lesson.scenes.length} parts
              </span>
              <div role="group" aria-label="Reading mode" className="inline-flex rounded-md border border-rule bg-plate p-0.5">
                {(["scrolly", "stepper"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setChosen(v)}
                    className={`rounded px-3 py-1 ${view === v ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}>
                    {v === "scrolly" ? "Scroll" : "Step by step"}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {view === "scrolly" ? <ScrollyLesson lesson={lesson} /> : <StepperLesson lesson={lesson} />}

          {lesson.sources.length > 0 && (
            <footer className={`border-t border-rule py-10 font-sans text-sm ${view === "stepper" ? "mb-24" : ""}`}>
              <h2 className="m-0 mb-3 text-base font-semibold">Sources</h2>
              <ol className="m-0 flex flex-col gap-1 pl-5">
                {lesson.sources.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-cobalt underline underline-offset-2">{s.title}</a>
                  </li>
                ))}
              </ol>
            </footer>
          )}
        </main>
      </MotionConfig>
    </LessonProvider>
  );
}
