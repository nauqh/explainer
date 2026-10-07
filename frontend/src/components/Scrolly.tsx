"use client";

import { useEffect, useRef } from "react";
import { Scrollama, Step } from "react-scrollama";
import type { ExploreScene, Lesson, ScrollyScene, StackScene } from "@/lib/lesson";
import { stepState } from "@/lib/state";
import { useLesson } from "@/lib/store";
import { Widget } from "@/widgets/Widget";
import { Blocks } from "./Blocks";
import { Controls, ReplayButton } from "./Controls";
import { Markup } from "./Markup";

export function ScrollyLesson({ lesson }: { lesson: Lesson }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Progress through the lesson, from page scroll. Written to the DOM directly: no re-render per frame.
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 1})`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-20 h-1 bg-rule/60" role="presentation">
        <div ref={bar} className="h-full origin-left bg-cobalt" style={{ transform: "scaleX(0)" }} />
      </div>
      {lesson.scenes.map((scene, i) => {
        const next = lesson.scenes[i + 1]?.id;
        if (scene.layout === "scrolly") return <ScrollySection key={scene.id} scene={scene} />;
        if (scene.layout === "explore") return <ExploreSection key={scene.id} scene={scene} next={next} />;
        return <StackSection key={scene.id} scene={scene} />;
      })}
    </>
  );
}

function ScrollySection({ scene }: { scene: ScrollyScene }) {
  const setState = useLesson((s) => s.setState);
  const setActive = useLesson((s) => s.setActiveStep);
  const active = useLesson((s) => s.activeStep[scene.id] ?? 0);

  const enter = ({ data }: { data: number }) => {
    setState(scene.id, stepState(scene, data));
    setActive(scene.id, data);
  };

  return (
    <section id={scene.id} aria-labelledby={`${scene.id}-title`} className="relative py-16">
      <h2 id={`${scene.id}-title`} className="m-0 mb-2 max-w-[22ch] text-[1.9rem] font-medium leading-tight">{scene.title}</h2>
      <div className="grid gap-x-12 md:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* Phones: the visual pins to the top 40% and steps scroll under it. Wide: it sits beside the steps. */}
        <div className="sticky top-1 z-10 h-[40svh] border-b border-rule bg-paper py-2 md:order-2 md:top-16 md:h-[min(36rem,calc(100svh-6rem))] md:border-0 md:py-0">
          <div className="h-full rounded-xl border border-rule bg-plate p-3 md:p-6">
            <Widget sceneId={scene.id} visual={scene.visual} defaults={scene.state} stepHighlight={scene.steps[active]?.highlight} />
          </div>
        </div>
        <div className="md:order-1">
          <Scrollama offset={0.55} onStepEnter={enter}>
            {scene.steps.map((step, i) => (
              <Step data={i} key={step.id}>
                <div className={`py-[7rem] transition-opacity duration-300 first:pt-12 last:pb-[12rem] ${i === active ? "opacity-100" : "opacity-40"}`}>
                  <p className="m-0"><Markup text={step.text} sceneId={scene.id} /></p>
                  {i === active && <ReplayButton scene={scene} step={i} />}
                </div>
              </Step>
            ))}
          </Scrollama>
        </div>
      </div>
    </section>
  );
}

function ExploreSection({ scene, next }: { scene: ExploreScene; next?: string }) {
  return (
    <section id={scene.id} aria-labelledby={`${scene.id}-title`} className="py-16">
      <div className="rounded-2xl border-2 border-dashed border-rule p-5 sm:p-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={`${scene.id}-title`} className="m-0 text-[1.6rem] font-medium leading-tight">{scene.title}</h2>
          <p className="m-0 font-sans text-sm text-ink-soft">
            Optional. {next && <a href={`#${next}`} className="text-cobalt underline underline-offset-2">Skip ahead</a>}
          </p>
        </div>
        <p className="m-0 mb-6 max-w-[62ch]"><Markup text={scene.task} sceneId={scene.id} /></p>
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="rounded-xl border border-rule bg-plate p-3 md:p-6">
            <Widget sceneId={scene.id} visual={scene.visual} defaults={scene.state} />
          </div>
          <Controls scene={scene} />
        </div>
      </div>
    </section>
  );
}

function StackSection({ scene }: { scene: StackScene }) {
  return (
    <section id={scene.id} aria-labelledby={`${scene.id}-title`} className="py-16">
      <h2 id={`${scene.id}-title`} className="m-0 mb-8 text-[1.9rem] font-medium leading-tight">{scene.title}</h2>
      <Blocks scene={scene} />
    </section>
  );
}
