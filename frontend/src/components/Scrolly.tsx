"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Scrollama, Step } from "react-scrollama";
import type { ExploreScene, Lesson, ScrollyScene, StackScene } from "@/lib/lesson";
import { stepState } from "@/lib/state";
import { useLesson } from "@/lib/store";
import { Widget } from "@/widgets/Widget";
import { Blocks } from "./Blocks";
import { Controls, ReplayButton } from "./Controls";
import { Markup } from "./Markup";

export function ScrollyLesson({ lesson, parts }: { lesson: Lesson; parts?: number }) {
  const total = parts ?? lesson.scenes.length;
  return (
    <>
      <Rail lesson={lesson} total={total} />
      {lesson.scenes.map((scene, i) => {
        const head = <ChapterHead n={i + 1} total={total} title={scene.title} id={`${scene.id}-title`} optional={scene.layout === "explore"} />;
        if (scene.layout === "scrolly") return <ScrollySection key={scene.id} scene={scene} n={i + 1} head={head} />;
        if (scene.layout === "explore") return <ExploreSection key={scene.id} scene={scene} next={lesson.scenes[i + 1]?.id} nextN={i + 2} head={head} />;
        return <StackSection key={scene.id} scene={scene} head={head} />;
      })}
    </>
  );
}

/**
 * Lesson progress pinned to the top once the hero has scrolled away: one segment per part,
 * each filling as its part is read, and the current part's name on wide screens.
 * Fills are written to the DOM from the scroll handler, so scrolling never re-renders. Scrolling never measures
 * either: part positions are cached and only re-measured when something on the page changes size, because a
 * getBoundingClientRect per frame forced a full layout every frame and was the main cost of scrolling.
 */
function Rail({ lesson, total }: { lesson: Lesson; total: number }) {
  const [active, setActive] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let frame = 0, parts: ({ top: number; height: number } | null)[] = [], heroBottom = 0;
    const measure = () => {
      parts = lesson.scenes.map((s) => {
        const r = document.getElementById(s.id)?.getBoundingClientRect();
        return r ? { top: r.top + window.scrollY, height: r.height } : null;
      });
      const hero = document.getElementById("lesson-hero")?.getBoundingClientRect();
      heroBottom = hero ? hero.bottom + window.scrollY : 0;
    };
    const update = () => {
      frame = 0;
      const line = window.scrollY + window.innerHeight * 0.5;
      let current = 0;
      parts.forEach((p, i) => {
        if (!p) return;
        fills.current[i]?.style.setProperty("transform", `scaleX(${Math.min(1, Math.max(0, (line - p.top) / p.height))})`);
        if (p.top <= line) current = i;
      });
      setActive(current);
      if (rail.current) rail.current.dataset.shown = String(window.scrollY > heroBottom);
    };
    const onScroll = () => { frame ||= requestAnimationFrame(update); };
    // A part growing (streamed in, an answer revealed) moves every part below it, so any size change re-measures all.
    const ro = new ResizeObserver(() => { measure(); onScroll(); });
    for (const id of ["lesson-hero", ...lesson.scenes.map((s) => s.id)]) {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    }
    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [lesson.scenes]);

  return (
    <div ref={rail} data-shown="false" aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-30 border-b border-rule bg-paper/97 opacity-100 transition-opacity duration-300 data-[shown=false]:opacity-0">
      <div className="mx-auto flex max-w-[76rem] items-center gap-5 px-4 py-1.5 sm:px-8 md:h-11 md:py-0">
        <p className="m-0 hidden min-w-0 shrink-0 basis-[22rem] truncate font-sans text-sm md:block">
          <span className="font-semibold tabular-nums text-cobalt">{active + 1}</span>
          <span className="text-ink-soft"> of {total} </span>
          <span className="ml-1">{lesson.scenes[active]?.title}</span>
        </p>
        <div className="flex flex-1 gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
              <span ref={(el) => { fills.current[i] = el; }} className="block h-full origin-left bg-cobalt" style={{ transform: "scaleX(0)" }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A part's opener: a large numeral, its position in the lesson, and its title. */
export function ChapterHead({ n, total, title, id, optional, extra, headingRef }: {
  n: number;
  total: number;
  title: string;
  id?: string;
  optional?: boolean;
  extra?: React.ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="flex items-end gap-4 border-t-2 border-ink pt-4 sm:gap-6 sm:pt-5">
      <span aria-hidden className="display text-[3.6rem] tabular-nums text-cobalt sm:text-[5.5rem]" style={{ lineHeight: 0.78 }}>{n}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 mb-1 font-sans text-sm text-ink-soft">
          Part {n} of {total}
          {optional && <span className="ml-2 rounded-full border border-cobalt/40 px-2 py-0.5 text-xs font-medium text-cobalt">Optional playground</span>}
        </p>
        <h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined}
          className="display m-0 text-balance text-[1.9rem] outline-none focus-visible:outline-none sm:text-[2.6rem]">{title}</h2>
      </div>
      {extra}
    </div>
  );
}

/** The plate a figure sits on: graph paper, with the figure number and, for guided scenes, the step ticks. */
export function FigurePlate({ n, children, footer, className = "" }: {
  n: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  // An open figure, not a panel: no frame, a plotting grid that fades into the page, and a quiet caption,
  // so the reader's eye stays on one picture that the text moves past.
  return (
    // The caption leads the plate: a figure draws from its top, so a caption at the foot of a tall pane floated
    // far below the picture, alone in the middle of the page.
    <div className={`figure-field flex flex-col ${className}`}>
      <div className="flex min-h-8 items-center justify-between gap-4 px-3 font-sans text-xs text-ink-soft sm:px-6">
        <span><span className="font-semibold text-ink">Figure {n}</span></span>
        {footer}
      </div>
      <div className="relative min-h-0 flex-1 p-3 sm:p-6">{children}</div>
    </div>
  );
}

/** One tick per step: shows where you are, and jumps to a step on click. */
function StepTicks({ scene, active }: { scene: ScrollyScene; active: number }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Steps in this part">
      <span className="mr-2 tabular-nums">Step {active + 1} of {scene.steps.length}</span>
      {scene.steps.map((s, i) => (
        <button key={s.id} type="button" aria-label={`Go to step ${i + 1}`} aria-current={i === active ? "step" : undefined}
          onClick={() => document.getElementById(`${scene.id}-step-${i}`)?.scrollIntoView({ block: "center" })}
          className="group grid h-6 w-5 place-items-center">
          <span className={`block h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
            i === active ? "w-5 bg-cobalt" : i < active ? "w-2.5 bg-cobalt/45" : "w-2.5 bg-rule group-hover:bg-ink-soft"}`} />
        </button>
      ))}
    </div>
  );
}

/** Fades the figure in as its part arrives; under reduced motion only the fade remains. */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function ScrollySection({ scene, n, head }: { scene: ScrollyScene; n: number; head: React.ReactNode }) {
  const setState = useLesson((s) => s.setState);
  const setActive = useLesson((s) => s.setActiveStep);
  const active = useLesson((s) => s.activeStep[scene.id] ?? 0);

  const enter = ({ data }: { data: number }) => {
    setState(scene.id, stepState(scene, data));
    setActive(scene.id, data);
  };

  return (
    <section id={scene.id} aria-labelledby={`${scene.id}-title`} className="relative pt-20 sm:pt-28">
      {head}
      <div className="mt-6 grid gap-x-14 md:mt-10 md:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        {/* Phones: the figure pins to the top and step cards scroll under it. Wide: it sits beside them. */}
        <div className="sticky top-1.5 z-10 -mx-4 h-[44svh] bg-paper px-4 pb-2 md:order-2 md:top-[4.25rem] md:mx-0 md:h-[min(40rem,calc(100svh-5.5rem))] md:px-0 md:pb-0">
          <Reveal className="h-full">
            <FigurePlate n={n} className="h-full" footer={<StepTicks scene={scene} active={active} />}>
              <Widget sceneId={scene.id} visual={scene.visual} defaults={scene.state} stepHighlight={scene.steps[active]?.highlight} notes={scene.steps[active]?.annotate} />
            </FigurePlate>
          </Reveal>
        </div>
        <div className="md:order-1">
          <Scrollama offset={0.55} onStepEnter={enter}>
            {scene.steps.map((step, i) => (
              <Step data={i} key={step.id}>
                <div id={`${scene.id}-step-${i}`} data-step className="py-[5.5rem] first:pt-[3rem] last:pb-[13rem] md:first:pt-[8rem]">
                  <article className="step-card" data-active={i === active} aria-current={i === active ? "step" : undefined}>
                    <p className="m-0 mb-2 font-sans text-xs font-medium text-cobalt tabular-nums">Step {i + 1} of {scene.steps.length}</p>
                    <p className="m-0 text-[1.1rem] leading-[1.68]"><Markup text={step.text} sceneId={scene.id} state={stepState(scene, i)} /></p>
                    {i === active && <ReplayButton scene={scene} step={i} />}
                  </article>
                </div>
              </Step>
            ))}
          </Scrollama>
        </div>
      </div>
    </section>
  );
}

function ExploreSection({ scene, next, nextN, head }: { scene: ExploreScene; next?: string; nextN: number; head: React.ReactNode }) {
  return (
    <section id={scene.id} aria-labelledby={`${scene.id}-title`} className="pt-20 sm:pt-28">
      {head}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 sm:mt-8">
        <p className="m-0 max-w-[60ch]"><Markup text={scene.task} sceneId={scene.id} /></p>
        {next && <a href={`#${next}`} className="font-sans text-sm text-cobalt underline underline-offset-4">Skip to part {nextN}</a>}
      </div>
      <Reveal className="mt-8">
        <div className="grid overflow-hidden rounded-2xl border border-rule bg-plate md:grid-cols-[minmax(0,1fr)_17rem]">
          <FigurePlate n={nextN - 1} className="min-h-[22rem] rounded-none border-0 md:h-[34rem]">
            <Widget sceneId={scene.id} visual={scene.visual} defaults={scene.state} />
          </FigurePlate>
          <div className="border-t border-rule bg-plate p-5 md:border-t-0 md:border-l md:p-6">
            <p className="m-0 mb-5 font-sans text-sm font-semibold">Your turn: change the inputs</p>
            <Controls scene={scene} />
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function StackSection({ scene, head }: { scene: StackScene; head: React.ReactNode }) {
  return (
    <section id={scene.id} aria-labelledby={`${scene.id}-title`} className="pt-20 sm:pt-28">
      {head}
      <div className="mt-8 sm:mt-10">
        <Blocks scene={scene} />
      </div>
    </section>
  );
}
