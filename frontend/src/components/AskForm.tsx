"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { viewTransition } from "@/lib/motion";
import { API_URL } from "@/lib/sse";

// Shown until the trending questions arrive, and kept if the backend can't produce them.
const EXAMPLES = [
  "How does attention decide which words matter?",
  "What does temperature do when a model picks the next token?",
  "Why does gradient descent sometimes overshoot?",
  "What is the difference between RAG and fine-tuning?",
];

export function AskForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [examples, setExamples] = useState(EXAMPLES);
  const input = useRef<HTMLInputElement>(null);

  // The lesson route is a static shell; having it ready means the flight starts on the very next frame.
  useEffect(() => router.prefetch("/lesson/new"), [router]);

  useEffect(() => {
    fetch(`${API_URL}/trending-questions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((qs: string[]) => { if (qs.length) setExamples(qs.slice(0, 4)); })
      .catch(() => {});
  }, []);

  // The question you asked flies into the waiting screen's heading (the `question` view transition in globals.css).
  // The browser's API rather than React's <ViewTransition>: the lesson route suspends on its search params, so React
  // would never see both ends of the pair in one commit.
  const ask = (q: string, from: HTMLElement | null) => {
    const go = () => router.push(`/lesson/new?q=${encodeURIComponent(q.trim())}`);
    if (!from) return go();
    from.style.viewTransitionName = "question";
    viewTransition(() => {
      go();
      // Hold the old frame until the heading is on the page, or give up after 2 s and just cut.
      const start = performance.now();
      return new Promise<void>((done) => {
        const check = () => (document.getElementById("question-heading") || performance.now() - start > 2000 ? done() : setTimeout(check, 16));
        check();
      });
    });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask(question, input.current); }}>
      <label htmlFor="question" className="display block max-w-[16ch] text-[clamp(2.2rem,min(9vw,8.5svh),4.8rem)]">
        Which AI idea isn&apos;t clicking yet?
      </label>
      <p className="m-0 mt-[2.5svh] max-w-[46ch] text-[clamp(1.02rem,2.4svh,1.2rem)] italic leading-snug text-white/80">
        Ask it the way you would ask a friend. You get a short lesson where the picture changes as you read, with a few checks along the way.
      </p>
      <div className="mt-[4.5svh] flex flex-col gap-3 sm:flex-row sm:items-end">
        <input ref={input} id="question" value={question} onChange={(e) => setQuestion(e.target.value)} autoComplete="off" maxLength={300}
          placeholder="Why do transformers need positional encodings?"
          className="min-w-0 flex-1 border-0 border-b-2 border-white/60 bg-transparent px-0 pb-2 text-[1.35rem] text-white outline-none placeholder:text-white/40 focus-visible:border-marker focus-visible:outline-none sm:text-[1.6rem]" />
        <button type="submit" disabled={!question.trim()}
          className="rounded-full bg-marker px-6 py-3 font-sans text-base font-semibold text-ink hover:bg-white disabled:opacity-50">
          Explain it
        </button>
      </div>
      <div className="mt-[5svh] border-t border-white/20 pt-[2.5svh] font-sans">
        <p className="m-0 mb-[1.2svh] text-sm text-white/65">Or start from one of these</p>
        <ul className="m-0 flex list-none flex-col gap-[0.8svh] p-0">
          {examples.map((q) => (
            <li key={q}>
              <button type="button" onClick={(e) => ask(q, e.currentTarget)}
                className="text-left text-[clamp(0.95rem,2.1svh,1.05rem)] text-white/90 decoration-marker decoration-2 underline-offset-4 hover:text-white hover:underline">
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
