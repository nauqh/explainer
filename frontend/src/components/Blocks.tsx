"use client";

import { useState } from "react";
import type { Cards, Predict, Prose, Sort, StackScene } from "@/lib/lesson";
import { Markup } from "./Markup";

type Block = StackScene["blocks"][number];

export function Blocks({ scene }: { scene: StackScene }) {
  return (
    <div className="flex flex-col gap-10 sm:gap-12">
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
  }
}

function ProseView({ block, sceneId }: { block: Prose; sceneId: string }) {
  return <p className="m-0 max-w-[40rem] text-[1.15rem] leading-[1.7]"><Markup text={block.text} sceneId={sceneId} /></p>;
}

function CardsView({ block, sceneId }: { block: Cards; sceneId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
      {block.items.map((c, i) => (
        <div key={i} className="graph-paper rounded-xl border border-rule p-5 sm:p-6">
          {c.tag && <p className="m-0 mb-3 inline-block rounded-full bg-cobalt-soft px-2.5 py-0.5 font-sans text-xs font-medium text-cobalt">{c.tag}</p>}
          <h3 className="display m-0 text-[1.45rem]">{c.title}</h3>
          <p className="m-0 mt-3 text-[1.02rem] leading-relaxed"><Markup text={c.body} sceneId={sceneId} /></p>
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
    <fieldset className="m-0 max-w-[44rem] rounded-2xl border-2 border-cobalt/25 bg-plate px-5 pt-3 pb-6 shadow-[0_20px_50px_-36px_rgb(29_47_146/0.5)] sm:px-7">
      <legend className="rounded-full bg-marker px-3 py-0.5 font-sans text-sm font-semibold text-ink">{label}</legend>
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
      <p className="m-0 mt-5 rounded-lg border-l-4 border-cobalt bg-cobalt-soft/60 py-3 pr-4 pl-4" role="status">
        <strong className="font-sans">{check.done === "right" ? "✓ Correct." : "✗ Not this time."}</strong>{" "}
        <Markup text={explanation} sceneId={sceneId} />
      </p>
    );
  }
  if (check.showHint) {
    return (
      <p className="m-0 mt-5 rounded-lg border-l-4 border-marker bg-marker-soft/60 py-3 pr-4 pl-4" role="status">
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
    <CheckFrame label="Predict first">
      <p className="m-0 mt-2 mb-5 text-[1.15rem]"><Markup text={block.question} sceneId={sceneId} /></p>
      <div className="flex flex-col gap-2 font-sans">
        {block.options.map((o, i) => {
          const isAnswer = check.done && i === block.answer;
          return (
            <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors ${
              isAnswer ? "border-cobalt bg-cobalt-soft" : pick === i ? "border-cobalt bg-cobalt-soft/40" : "border-rule hover:border-ink-soft"}`}>
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
          className="mt-5 rounded-full bg-cobalt px-5 py-2 font-sans text-sm font-medium text-white hover:bg-blueprint disabled:opacity-40">
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
    <CheckFrame label="Sort them">
      <p className="m-0 mt-2 mb-5 text-[1.15rem]"><Markup text={block.question} sceneId={sceneId} /></p>
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
                      isAnswer ? "border-cobalt bg-cobalt-soft" : chosen ? "border-cobalt bg-cobalt text-white" : "border-rule bg-plate hover:border-ink-soft"}`}>
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
          className="mt-6 rounded-full bg-cobalt px-5 py-2 font-sans text-sm font-medium text-white hover:bg-blueprint disabled:opacity-40">
          Check answer
        </button>
      )}
      <Result check={check} hint={block.hint} explanation={block.explanation} sceneId={sceneId} />
    </CheckFrame>
  );
}

