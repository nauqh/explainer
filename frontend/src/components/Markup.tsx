"use client";

import { useId, useRef, type ReactNode, type ToggleEvent } from "react";
import type { State } from "@/lib/lesson";
import { useLesson } from "@/lib/store";
import { facts } from "@/widgets/describe";
import { useLessonData } from "./LessonData";

const MARKUP = /\[\[(part|term|source):([^|\]]+)\|([^\]]+)\]\]|\{fact:(\w+)\}|\{(\w+)\}/g;

/**
 * Renders step and block text with part links, glossary terms, source refs and values.
 * `state` pins values to one step's own state, so a paragraph read ahead of the trigger line
 * still shows its own numbers; without it, values follow the live widget (explore scenes).
 */
export function Markup({ text, sceneId, state }: { text: string; sceneId: string; state?: State }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKUP)) {
    out.push(text.slice(last, m.index));
    const [, kind, id, label, fact, stateKey] = m;
    const key = m.index;
    if (fact) out.push(<Fact key={key} sceneId={sceneId} name={fact} pinned={state} />);
    else if (stateKey) out.push(<Value key={key} sceneId={sceneId} stateKey={stateKey} pinned={state} />);
    else if (kind === "part") out.push(<PartLink key={key} sceneId={sceneId} partId={id} label={label} />);
    else if (kind === "term") out.push(<Term key={key} termId={id} label={label} />);
    else out.push(<SourceRef key={key} sourceId={id} label={label} />);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

function PartLink({ sceneId, partId, label }: { sceneId: string; partId: string; label: string }) {
  const on = useLesson((s) => s.link?.sceneId === sceneId && s.link.partId === partId);
  const toggle = useLesson((s) => s.toggleLink);
  return (
    <button type="button" className="mk-part" aria-pressed={on} onClick={() => toggle(sceneId, partId)}>
      {label}
    </button>
  );
}

function Value({ sceneId, stateKey, pinned }: { sceneId: string; stateKey: string; pinned?: State }) {
  const live = useLesson((s) => s.states[sceneId]?.[stateKey]);
  const v = pinned ? pinned[stateKey] : live;
  const shown = typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : String(v ?? "");
  return <span className="mk-value">{shown}</span>;
}

/** A value the scene's widget computed (never typed by the model), live as the state changes. */
function Fact({ sceneId, name, pinned }: { sceneId: string; name: string; pinned?: State }) {
  const scene = useLessonData().scenes.find((s) => s.id === sceneId);
  const live = useLesson((s) => s.states[sceneId]);
  if (!scene || !("visual" in scene)) return null;
  return <span className="mk-value">{facts(scene.visual, pinned ?? live ?? scene.state)[name] ?? ""}</span>;
}

function Term({ termId, label }: { termId: string; label: string }) {
  const term = useLessonData().terms.find((t) => t.id === termId);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  // Native popover: light dismiss and Escape for free. Placed under the word when it opens.
  const place = (e: ToggleEvent<HTMLSpanElement>) => {
    if (e.newState !== "open" || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const el = e.currentTarget;
    el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${r.bottom + 6}px`;
  };
  return (
    <>
      <button ref={btn} type="button" className="mk-term" popoverTarget={id}>
        {label}
      </button>
      <span role="tooltip" id={id} popover="auto" className="term-pop fixed inset-auto" onToggle={place}>
        <strong className="font-semibold">{term?.label ?? label}</strong>: {term?.definition ?? "No definition given."}
      </span>
    </>
  );
}

function SourceRef({ sourceId, label }: { sourceId: string; label: string }) {
  const { sources } = useLessonData();
  const n = sources.findIndex((s) => s.id === sourceId);
  const src = sources[n];
  if (!src) return <>{label}</>;
  return (
    <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-cobalt underline-offset-[0.22em]">
      {label}
      <span className="mk-source">[{n + 1}]</span>
    </a>
  );
}
