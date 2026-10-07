"use client";

import { useState } from "react";
import type { Cards, Predict, Prose, Recall, Sort, StackScene } from "@/lib/lesson";
import { Markup } from "./Markup";

type Block = StackScene["blocks"][number];

export function Blocks({ scene }: { scene: StackScene }) {
  return (
    <div className="flex flex-col gap-10">
      {scene.blocks.map((b, i) => <BlockView key={i} block={b} sceneId={scene.id} />)}
    </div>
  );
}

function BlockView({ block, sceneId }: { block: Block; sceneId: string }) {
  switch (block.type) {
    case "prose": return <ProseView block={block} sceneId={sceneId} />;
    case "cards": return <CardsView block={block} sceneId={sceneId} />;
    case "predict": return <PredictView block={block} sceneId={sceneId} />;
    case "sort": return <SortView block={block} sceneId={sceneId} />;
    case "recall": return <RecallView block={block} sceneId={sceneId} />;
  }
}

function ProseView({ block, sceneId }: { block: Prose; sceneId: string }) {
  return <p className="m-0 max-w-[62ch]"><Markup text={block.text} sceneId={sceneId} /></p>;
}

function CardsView({ block, sceneId }: { block: Cards; sceneId: string }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
      {block.items.map((c, i) => (
        <div key={i} className="bg-plate p-5">
          {c.tag && <p className="m-0 mb-2 font-sans text-sm text-ink-soft">{c.tag}</p>}
          <h3 className="m-0 font-sans text-lg font-semibold leading-tight">{c.title}</h3>
          <p className="m-0 mt-2 text-base"><Markup text={c.body} sceneId={sceneId} /></p>
        </div>
      ))}
    </div>
  );
}

/** Check flow shared by predict and sort: first wrong answer shows the hint, second shows the answer. */
function useCheck() {
  const [wrong, setWrong] = useState(0);
  const [done, setDone] = useState<null | "right" | "wrong">(null);
  // The attempt is recorded with POST /attempts once the backend has it (milestone 5).
  const check = (correct: boolean) => {
    if (correct) setDone("right");
    else if (wrong === 0) setWrong(1);
    else setDone("wrong");
  };
  return { showHint: wrong > 0 && !done, done, check };
}

function CheckFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <fieldset className="m-0 max-w-[62ch] rounded-lg border border-rule bg-plate p-5 sm:p-6">
      <legend className="px-1 font-sans text-sm font-medium text-ink-soft">{label}</legend>
      {children}
    </fieldset>
  );
}

function Result({ check, hint, explanation, sceneId }: {
  check: ReturnType<typeof useCheck>;
  hint: string;
  explanation: string;
  sceneId: string;
}) {
  if (check.done) {
    return (
      <p className="m-0 mt-4 border-l-4 border-cobalt pl-4" role="status">
        <strong className="font-sans">{check.done === "right" ? "✓ Correct." : "✗ Not this time."}</strong>{" "}
        <Markup text={explanation} sceneId={sceneId} />
      </p>
    );
  }
  if (check.showHint) {
    return (
      <p className="m-0 mt-4 border-l-4 border-marker pl-4" role="status">
        <strong className="font-sans">✗ Not quite. Hint:</strong> <Markup text={hint} sceneId={sceneId} />
      </p>
    );
  }
  return null;
}

function PredictView({ block, sceneId }: { block: Predict; sceneId: string }) {
  const [pick, setPick] = useState<number | null>(null);
  const check = useCheck();
  const name = `predict-${sceneId}-${block.question.length}`;
  return (
    <CheckFrame label="Predict">
      <p className="m-0 mb-4"><Markup text={block.question} sceneId={sceneId} /></p>
      <div className="flex flex-col gap-2 font-sans">
        {block.options.map((o, i) => {
          const isAnswer = check.done && i === block.answer;
          return (
            <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
              isAnswer ? "border-cobalt bg-cobalt-soft" : pick === i ? "border-ink" : "border-rule"}`}>
              <input type="radio" name={name} checked={pick === i} disabled={!!check.done} onChange={() => setPick(i)}
                className="accent-[var(--cobalt)]" />
              <span>{o}</span>
              {isAnswer && <span className="ml-auto text-sm font-medium">✓ answer</span>}
            </label>
          );
        })}
      </div>
      {!check.done && (
        <button type="button" disabled={pick === null} onClick={() => check.check(pick === block.answer)}
          className="mt-4 rounded-md bg-ink px-4 py-2 font-sans text-sm font-medium text-paper disabled:opacity-40">
          Check answer
        </button>
      )}
      <Result check={check} hint={block.hint} explanation={block.explanation} sceneId={sceneId} />
    </CheckFrame>
  );
}

function SortView({ block, sceneId }: { block: Sort; sceneId: string }) {
  // ponytail: a bucket picker per item instead of drag and drop; it is keyboard-friendly as is. Add drag if testing shows it teaches better.
  const [picks, setPicks] = useState<(number | null)[]>(() => block.items.map(() => null));
  const check = useCheck();
  return (
    <CheckFrame label="Sort">
      <p className="m-0 mb-4"><Markup text={block.question} sceneId={sceneId} /></p>
      <div className="flex flex-col gap-4 font-sans">
        {block.items.map((item, i) => (
          <div key={i} role="radiogroup" aria-label={item} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="min-w-[8rem] font-medium">{item}</span>
            <div className="flex flex-wrap gap-2">
              {block.buckets.map((b, j) => {
                const chosen = picks[i] === j;
                const isAnswer = check.done && block.answer[i] === j;
                return (
                  <button key={j} type="button" role="radio" aria-checked={chosen} disabled={!!check.done}
                    onClick={() => setPicks((p) => p.map((v, k) => (k === i ? j : v)))}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      isAnswer ? "border-cobalt bg-cobalt-soft" : chosen ? "border-ink bg-ink text-paper" : "border-rule bg-plate"}`}>
                    {isAnswer ? `✓ ${b}` : b}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!check.done && (
        <button type="button" disabled={picks.some((p) => p === null)}
          onClick={() => check.check(picks.every((p, i) => p === block.answer[i]))}
          className="mt-5 rounded-md bg-ink px-4 py-2 font-sans text-sm font-medium text-paper disabled:opacity-40">
          Check answer
        </button>
      )}
      <Result check={check} hint={block.hint} explanation={block.explanation} sceneId={sceneId} />
    </CheckFrame>
  );
}

function RecallView({ block, sceneId }: { block: Recall; sceneId: string }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const id = `recall-${sceneId}`;
  return (
    <div className="max-w-[62ch]">
      <label htmlFor={id} className="mb-3 block text-[1.3rem] leading-snug">
        <Markup text={block.prompt} sceneId={sceneId} />
      </label>
      <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} disabled={sent} rows={6}
        className="w-full resize-y rounded-lg border border-rule bg-plate p-4 text-base leading-relaxed outline-none focus-visible:border-cobalt" />
      <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-sm">
        <button type="button" disabled={words < block.minWords || sent} onClick={() => setSent(true)}
          className="rounded-md bg-ink px-4 py-2 font-medium text-paper disabled:opacity-40">
          Submit explanation
        </button>
        <span className="text-ink-soft" aria-live="polite">
          {words < block.minWords ? `${words} of at least ${block.minWords} words` : `${words} words`}
        </span>
      </div>
      {sent && (
        <p className="m-0 mt-4 font-sans text-sm text-ink-soft" role="status">
          Saved. Feedback on your explanation arrives once grading is connected.
        </p>
      )}
    </div>
  );
}
