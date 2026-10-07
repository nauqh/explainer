"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "How does attention decide which words matter?",
  "What does temperature do when a model picks the next token?",
  "Why does gradient descent sometimes overshoot?",
  "What is the difference between RAG and fine-tuning?",
];

export function AskForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  // Generation is not wired yet (milestone 4). Then this posts the question to POST /lessons
  // and the lesson page renders scenes as they stream in. For now every question opens the sample.
  const ask = (q: string) => router.push(`/lesson/fixture?q=${encodeURIComponent(q.trim())}`);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) ask(question); }}>
      <label htmlFor="question" className="block max-w-[18ch] text-[2.4rem] font-medium leading-[1.08] tracking-[-0.015em] sm:text-[3.4rem]">
        Which AI idea isn&apos;t clicking yet?
      </label>
      <p className="m-0 mt-5 max-w-[48ch] text-ink-soft">
        Ask it the way you would ask a friend. You get a short lesson where the picture changes as you read, with a few checks along the way.
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input id="question" value={question} onChange={(e) => setQuestion(e.target.value)} autoComplete="off" maxLength={300}
          placeholder="Why do transformers need positional encodings?"
          className="min-w-0 flex-1 border-0 border-b-2 border-ink bg-transparent px-0 pb-2 text-[1.35rem] outline-none placeholder:text-ink-soft/60 focus-visible:border-cobalt focus-visible:outline-none sm:text-[1.6rem]" />
        <button type="submit" disabled={!question.trim()}
          className="rounded-md bg-ink px-5 py-3 font-sans text-base font-medium text-paper disabled:opacity-40">
          Explain it
        </button>
      </div>
      <div className="mt-12 font-sans">
        <p className="m-0 mb-3 text-sm text-ink-soft">Or start from one of these</p>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {EXAMPLES.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => ask(q)}
                className="text-left text-[1.05rem] decoration-marker decoration-[0.4em] underline-offset-[-0.15em] hover:underline">
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="m-0 mt-14 max-w-[56ch] font-sans text-sm text-ink-soft">
        Lesson generation is still being built, so every question opens the sample lesson on attention for now.
      </p>
    </form>
  );
}
