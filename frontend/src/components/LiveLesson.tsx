"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Lesson } from "@/lib/lesson";
import { viewTransition } from "@/lib/motion";
import { streamLesson } from "@/lib/sse";
import { LessonView } from "./Lesson";
import { Waiting } from "./Waiting";

type Scene = Lesson["scenes"][number];
type Outline = { id: string; title: string; layout: string }[];
type Progress = { stage: string; scenes?: number[]; total?: number };

const STAGES: Record<string, string> = {
  routing: "Reading your question",
  searching: "Searching trusted sources",
  planning: "Planning the lesson",
  writing: "Writing the lesson",
};

type Request = { path: string; body: object };

// ponytail: "Go deeper" is offered once, on a quick lesson (3 or 4 parts); after one extension the lesson is
// longer than that. Lift the cap if people want to keep going.
const DEEPEN_UNTIL = 4;

/** The /lesson/new page: the question comes from `?q=`, and a missing one goes back to the landing page. */
export function NewLesson() {
  const router = useRouter();
  const question = useSearchParams().get("q")?.trim();
  useEffect(() => { if (!question) router.replace("/"); }, [question, router]);
  return question ? <LiveLesson key={question} question={question} /> : null;
}

/**
 * Renders a lesson as its scenes stream in. Nothing is stored: every question is a new run, and "Go deeper"
 * sends the lesson on screen back to be extended. Retrying a failed lesson remounts with fresh state.
 */
export function LiveLesson(props: { question: string }) {
  const [attempt, setAttempt] = useState(0);
  return <Run key={attempt} {...props} retry={() => setAttempt((a) => a + 1)} />;
}

function Run({ question, retry }: { question: string; retry: () => void }) {
  const router = useRouter();
  const [request, setRequest] = useState<Request>({ path: "/lessons", body: { question } });
  const [progress, setProgress] = useState<Progress>({ stage: "routing" });
  const [head, setHead] = useState<Lesson | null>(null);
  const [outline, setOutline] = useState<Outline>([]);
  // Scenes by index: after the first, they are written in parallel and can arrive out of order.
  const [arrived, setArrived] = useState<Record<number, Scene>>({});
  const [offTopic, setOffTopic] = useState<{ reason: string; suggestion: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const deepening = request.path.endsWith("/deeper");


  // The first part arriving swaps the waiting screen for the lesson: run that swap as a view transition, so the
  // heading flies into the lesson's headline (the `question` rules in globals.css) instead of a hard cut.
  const revealed = useRef(false);
  const reveal = (first: boolean, update: () => void) => {
    if (!first || revealed.current) return update();
    revealed.current = true;
    viewTransition(() => flushSync(update));
  };

  useEffect(() => {
    const ctrl = new AbortController();
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);

    streamLesson(request.path, request.body, ({ event, data }) => {
      const d = data as Record<string, unknown>;
      if (event === "progress") setProgress(d as Progress);
      else if (event === "plan") {
        setHead(d.lesson as Lesson);
        setOutline(d.outline as Outline);
      } else if (event === "scene") reveal(d.index === 0, () => setArrived((a) => ({ ...a, [d.index as number]: d.scene as Scene })));
      else if (event === "route" && d.onTopic === false) setOffTopic(d as { reason: string; suggestion: string | null });
      else if (event === "error") setError(d.message as string);
      else if (event === "done") {
        reveal(true, () => {
          setArrived(Object.fromEntries((d.lesson as Lesson).scenes.map((sc, i) => [i, sc])));
          setFinished(true);
        });
      }
    }, ctrl.signal)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        // fetch throws TypeError when the server cannot be reached; our own errors carry a message for the learner.
        setError(e instanceof TypeError || !(e instanceof Error) ? "Could not reach the lesson server. Is it running?" : e.message);
      })
      .finally(() => clearInterval(tick));

    return () => {
      ctrl.abort();
      clearInterval(tick);
    };
  }, [request]);

  // Render the contiguous run from scene 0; a later scene waits until the ones before it arrive.
  const scenes = useMemo(() => {
    const out: Scene[] = [];
    while (arrived[out.length]) out.push(arrived[out.length]);
    return out;
  }, [arrived]);
  const lesson = useMemo(() => (head && scenes.length ? { ...head, scenes: scenes as Lesson["scenes"] } : null), [head, scenes]);

  // Sends the lesson on screen; the new parts stream in after it.
  const goDeeper = () => {
    if (!lesson) return;
    setError(null);
    setFinished(false);
    setProgress({ stage: "planning" });
    setRequest({ path: "/lessons/deeper", body: { lesson } });
  };
  const waiting = !finished && !error && !offTopic;
  const status = progress.stage === "writing" && progress.total
    ? (() => {
        const b = progress.scenes ?? [0];
        const parts = b.length > 1 ? `parts ${b[0] + 1} to ${b[b.length - 1] + 1}` : `part ${b[0] + 1}`;
        return `Writing ${parts} of ${progress.total}`;
      })()
    : STAGES[progress.stage] ?? "Working";

  if (lesson) {
    const pending = outline.slice(scenes.length);
    const canDeepen = finished && !error && scenes.length <= DEEPEN_UNTIL;
    return (
      <LessonView
        lesson={lesson}
        parts={outline.length || undefined}
        pending={pending.map((s, i) => ({ title: s.title, ready: Boolean(arrived[scenes.length + i]) }))}
        after={canDeepen ? <GoDeeper onClick={goDeeper} /> : (pending.length > 0 || error || deepening) && (
          <section aria-live="polite" className="border-t border-rule py-10 font-sans">
            {error ? <Problem message={error} retry={deepening ? goDeeper : retry} /> : pending.length === 0 ? (
              <Status text={status} seconds={seconds} />
            ) : (
              <>
                <Writing n={scenes.length + 1} total={outline.length} title={pending[0].title} status={status} seconds={seconds} />
                {pending.length > 1 && (
                  <ol className="m-0 mt-10 flex list-none flex-col gap-1.5 p-0 text-[0.95rem] text-ink-soft" start={scenes.length + 2}>
                    {pending.slice(1).map((s, i) => (
                      <li key={s.id}>
                        <span className="tabular-nums">{scenes.length + i + 2}.</span> {s.title}
                        {arrived[scenes.length + i + 1] && <span className="ml-2 text-sm text-cobalt">ready</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </section>
        )}
      />
    );
  }

  if (waiting) return <Waiting question={question} stage={progress.stage} outline={outline} />;


  // Off topic or failed before the first part: the same blueprint hero the lesson opens with, so nothing jumps.
  return (
    <header className="blueprint min-h-svh">
      <div className="mx-auto max-w-[76rem] px-4 pt-6 pb-14 sm:px-8 sm:pt-8 sm:pb-20">
        <Link href="/" className="font-sans text-sm text-white/75 underline-offset-4 hover:text-white hover:underline">Ask another question</Link>
        <h1 className="display m-0 mt-12 max-w-[17ch] text-balance text-[2.75rem] sm:mt-20 sm:text-[4.4rem] lg:text-[5.2rem]">
          {question.charAt(0).toUpperCase() + question.slice(1)}
        </h1>
        <section aria-live="polite" className="mt-8 max-w-[52ch] font-sans text-white">
          {offTopic ? (
            <div>
              <p className="m-0 text-[1.2rem] italic leading-snug text-white/85 sm:text-[1.35rem]">{offTopic.reason}</p>
              {offTopic.suggestion && (
                <button type="button" onClick={() => router.push(`/lesson/new?q=${encodeURIComponent(`Explain ${offTopic.suggestion}`)}`)}
                  className="mt-8 rounded-full bg-white px-5 py-2.5 font-medium text-blueprint-deep">
                  Explain {offTopic.suggestion} instead
                </button>
              )}
            </div>
          ) : error ? (
            <Problem message={error} retry={retry} onDark />
          ) : null}
        </section>
      </div>
    </header>
  );
}

/** The end of a quick lesson: an invitation to keep going, in the same blueprint voice as the opener. */
function GoDeeper({ onClick }: { onClick: () => void }) {
  return (
    <section aria-label="Go deeper" className="blueprint -mx-4 mt-20 rounded-none px-4 py-14 sm:mx-0 sm:rounded-3xl sm:px-12 sm:py-16">
      <p className="m-0 font-sans text-sm font-semibold text-marker">That was the quick version</p>
      <h2 className="display m-0 mt-3 max-w-[20ch] text-balance text-[2.2rem] sm:text-[3.2rem]">Want to go deeper?</h2>
      <p className="m-0 mt-4 max-w-[52ch] text-[1.15rem] italic leading-snug text-white/80">
        A few more parts on the edge cases, what breaks, and how it connects to nearby ideas. They are written now
        and appear below as they are ready.
      </p>
      <button type="button" onClick={onClick}
        className="mt-8 rounded-full bg-white px-6 py-3 font-sans font-medium text-blueprint-deep hover:bg-marker-soft">
        Go deeper
      </button>
    </section>
  );
}

/** Elapsed seconds are hidden from assistive tech: inside a live region they would be announced every second. */
function Status({ text, seconds, onDark = false }: { text: string; seconds?: number; onDark?: boolean }) {
  return (
    <p className="m-0 flex items-center gap-3 text-base">
      <TypingDots className={onDark ? "text-marker" : "text-cobalt"} />
      {text}
      {seconds !== undefined && <span aria-hidden className="tabular-nums text-ink-soft">{seconds} s</span>}
    </p>
  );
}

/** The three dots of a message being typed: the most widely read sign that someone is composing. */
function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex items-center gap-1 ${className}`}>
      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
    </span>
  );
}

/**
 * The next part, shown as a page being written: its real number and title, the typing dots, and lines of text
 * that write themselves in, one after another. Parts take 20-30 s, past what a bare looped animation holds, so it
 * names the work and shows the time it has taken (docs/research/waiting.md).
 */
function Writing({ n, total, title, status, seconds }: { n: number; total: number; title: string; status: string; seconds: number }) {
  return (
    <article aria-label={`Part ${n} of ${total}, being written`}>
      <div className="flex items-end gap-4 sm:gap-6">
        <span aria-hidden className="display text-[3.6rem] tabular-nums text-cobalt/35 sm:text-[5.5rem]" style={{ lineHeight: 0.78 }}>{n}</span>
        <div className="min-w-0 flex-1">
          <Status text={status} seconds={seconds} />
          <p className="display m-0 mt-1 text-balance text-[1.9rem] text-ink/45 sm:text-[2.6rem]">{title}</p>
        </div>
      </div>
      <div aria-hidden className="mt-7 flex max-w-[38rem] flex-col gap-3.5">
        {[96, 100, 88, 62].map((w, i) => (
          <span key={i} className="writing-line h-2.5 rounded-full bg-ink/10" style={{ width: `${w}%`, animationDelay: `${i * 0.55}s` }} />
        ))}
      </div>
    </article>
  );
}

function Problem({ message, retry, onDark = false }: { message: string; retry: () => void; onDark?: boolean }) {
  return (
    <div role="alert">
      <p className="m-0 text-lg">{message}</p>
      <button type="button" onClick={retry}
        className={`mt-6 rounded-full px-5 py-2.5 font-medium ${onDark ? "bg-white text-blueprint-deep" : "bg-ink text-paper"}`}>Try again</button>
    </div>
  );
}
