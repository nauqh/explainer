"use client";

import Link from "next/link";
import { MotionConfig } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import type { Lesson } from "@/lib/lesson";
import { useLesson } from "@/lib/store";
import { LessonProvider } from "./LessonData";
import { ScrollyLesson } from "./Scrolly";
import { findTopicImage, type TopicImage } from "@/lib/commons";

/** A part still being written while the lesson streams in: its planned title, and whether it has arrived early. */
export type PendingPart = { title: string; ready: boolean };

/**
 * `lesson.scenes` may grow while a lesson streams in; `parts` is the planned total, `pending` names the parts
 * not shown yet, and `after` shows what is still coming.
 */
export function LessonView({ lesson, parts, pending, after }: {
  lesson: Lesson;
  parts?: number;
  pending?: PendingPart[];
  after?: ReactNode;
}) {
  // A new lesson starts from a clean store.
  useEffect(() => {
    useLesson.setState({ states: {}, activeStep: {}, link: null });
  }, [lesson.question]);

  // Give newly arrived scenes their defaults without resetting scenes the learner is already on.
  useEffect(() => {
    useLesson.setState((s) => ({
      states: { ...Object.fromEntries(lesson.scenes.map((sc) => [sc.id, "state" in sc ? sc.state : {}])), ...s.states },
    }));
  }, [lesson.scenes]);

  const openPart = (i: number) => document.getElementById(lesson.scenes[i].id)?.scrollIntoView();

  return (
    <LessonProvider value={lesson}>
      <MotionConfig reducedMotion="user">
        <Hero lesson={lesson} parts={parts ?? lesson.scenes.length} pendingParts={pending} onPart={openPart} />
        <main id="lesson-body" className="mx-auto max-w-[76rem] px-4 sm:px-8">
          <ScrollyLesson lesson={lesson} parts={parts} />
          {after}
        </main>

        {/* The end: a blueprint band that closes the lesson the way the hero opens it, flush with the page bottom. */}
        <footer className="blueprint mt-16 font-sans">
          <div className="mx-auto max-w-[76rem] px-4 pt-14 pb-[max(3.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-16">
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
              <p className="display m-0 text-[1.9rem] sm:text-[2.4rem]">That&apos;s the lesson.</p>
              <Link href="/" className="rounded-full bg-marker px-5 py-2.5 text-[0.98rem] font-semibold text-ink transition-transform hover:bg-white active:scale-[0.97]">
                Ask another question
              </Link>
            </div>
            {lesson.sources.length > 0 && (
              <div className="mt-12 text-[0.95rem]">
                <h2 className="m-0 mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Sources</h2>
                <ol className="m-0 grid gap-x-10 gap-y-2 pl-5 sm:grid-cols-2">
                  {lesson.sources.map((s) => (
                    <li key={s.id} className="pl-1 marker:text-white/50">
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-white/90 underline decoration-white/35 underline-offset-2 hover:text-white hover:decoration-marker">{s.title}</a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </footer>
      </MotionConfig>
    </LessonProvider>
  );
}

/**
 * Beside the headline on wide screens: a picture of the topic found on Wikimedia Commons (lib/commons.ts), with
 * its credit. Nothing shows until a fitting one is found, and nothing at all if none is.
 */
function HeroFigure({ concept }: { concept: string }) {
  const [img, setImg] = useState<TopicImage | null>(null);
  useEffect(() => {
    let live = true;
    findTopicImage(concept).then((found) => { if (live) setImg(found); });
    return () => { live = false; };
  }, [concept]);
  if (!img) return null;
  return (
    <figure className="hero-figure m-0 hidden overflow-hidden rounded-2xl bg-white text-ink lg:block">
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote, per-lesson file; next/image would need its host whitelisted and a resize we do not need */}
      <img src={img.src} alt={img.title} width={img.width} height={img.height}
        className="block h-[min(22rem,38svh)] w-full object-contain p-5" />
      <figcaption className="border-t border-rule px-5 py-3 font-sans text-xs leading-relaxed text-ink-soft">
        <span className="font-semibold text-ink">{img.title}</span>
        <br />
        <a href={img.page} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-2 hover:text-cobalt">
          {img.artist}, {img.license}, via Wikimedia Commons
        </a>
      </figcaption>
    </figure>
  );
}

/** The opener: the learner's question as the headline, a short dek, and the parts as a table of contents. */
function Hero({ lesson, parts, pendingParts, onPart }: {
  lesson: Lesson;
  parts: number;
  pendingParts?: PendingPart[];
  onPart: (i: number) => void;
}) {
  const article = lesson.level === "intermediate" || lesson.level === "advanced" ? "An" : "A";
  const pending = Math.max(0, parts - lesson.scenes.length);
  return (
    // One screen: the headline takes the free middle, the parts rest at the foot, and the cue sits below them.
    <header id="lesson-hero" className="blueprint flex min-h-svh flex-col">
      <div className="mx-auto flex w-full max-w-[76rem] flex-1 flex-col px-4 pt-6 sm:px-8 sm:pt-8">
        <div className="font-sans text-sm">
          <Link href="/" style={{ viewTransitionName: "home-link" }} className="text-white/75 underline-offset-4 hover:text-white hover:underline">Ask another question</Link>
        </div>

        <div className="grid flex-1 items-center gap-x-12 py-[4svh] lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div>
            <h1 style={{ viewTransitionName: "question" }} className="display m-0 max-w-[17ch] text-balance text-[clamp(2.6rem,min(8vw,9.5svh),5.2rem)]">
              {lesson.question.charAt(0).toUpperCase() + lesson.question.slice(1)}
            </h1>
            <p className="m-0 mt-[3svh] max-w-[46ch] text-[clamp(1.1rem,2.6svh,1.35rem)] italic leading-snug text-white/80">
              {article} {lesson.level} lesson on {lesson.concept.replaceAll("-", " ")}, in {parts} parts.{" "}
              Read on and the figure beside the text redraws itself.
            </p>
          </div>
          <HeroFigure concept={lesson.concept} />
        </div>

        {/* A contents index, not a ruled table: the blueprint grid already draws the lines, so the parts are
            grouped by a label and by space, each number set above its title. */}
        <nav aria-labelledby="parts-label" className="font-sans">
          <p id="parts-label" className="m-0 mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">In this lesson</p>
          <ol className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {lesson.scenes.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPart(i)}
                  className="group flex w-full flex-col gap-1 rounded text-left text-[0.98rem] leading-snug text-white/90 hover:text-white">
                  <span className="display text-[1.6rem] leading-none tabular-nums text-marker">{i + 1}</span>
                  <span className="underline-offset-4 group-hover:underline">
                    {s.title}
                    {s.layout === "explore" && <span className="text-white/55">, optional</span>}
                  </span>
                </button>
              </li>
            ))}
            {Array.from({ length: pending }, (_, k) => (
              // A part still on its way: dimmed, with a quiet dot while it is written, rather than a label per cell.
              <li key={`pending-${k}`} className="flex flex-col gap-1 text-[0.98rem] leading-snug text-white/45">
                <span className="display flex items-center gap-2 text-[1.6rem] leading-none tabular-nums">
                  {lesson.scenes.length + k + 1}
                  {!pendingParts?.[k]?.ready && <span aria-hidden className="inline-block size-1.5 animate-pulse rounded-full bg-white/60" />}
                </span>
                <span>
                  {pendingParts?.[k]?.title ?? "Being written"}
                  <span className="sr-only">{pendingParts?.[k]?.ready ? ", ready" : ", being written"}</span>
                </span>
              </li>
            ))}
          </ol>
        </nav>

        {/* The lesson only opens once part 1 exists, so there is always something to read below. */}
        <div className="flex h-[max(4.5rem,9svh)] items-center justify-center">
          <a href="#lesson-body" className="scroll-cue group flex flex-col items-center gap-1.5 rounded-full px-4 py-2 font-sans text-sm text-white/80 hover:text-white">
            Start reading
            <svg aria-hidden viewBox="0 0 16 16" className="scroll-cue-arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6l5 5 5-5" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
