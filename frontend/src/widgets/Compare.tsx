"use client";

import type { CompareProps } from "@/lib/lesson";
import type { WidgetProps } from "./Widget";

// A real table, not SVG: it is already accessible and reflows on phones.
export function Compare({ props, state, highlight, onPart }: WidgetProps<CompareProps>) {
  const tone = (id: string) =>
    highlight.has(id) ? "bg-marker-soft" : state.highlight === id ? "bg-cobalt-soft" : "";
  const strong = (id: string) => (state.highlight === id || highlight.has(id) ? "font-semibold" : "");

  return (
    <table className="w-full border-collapse font-sans text-[0.95rem] leading-snug">
      <thead>
        <tr>
          <th className="w-[28%]" />
          {props.columns.map((c) => (
            <th key={c.id} scope="col" onClick={() => onPart(c.id)}
              className={`cursor-pointer border-b-2 px-3 py-2 text-left align-bottom transition-colors duration-300 ${tone(c.id)} ${
                state.highlight === c.id ? "border-cobalt" : "border-ink"
              } ${strong(c.id) || "font-medium"}`}>
              {c.title}
              {state.highlight === c.id && <span className="sr-only"> (highlighted)</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r) => (
          <tr key={r.label} className="border-b border-rule">
            <th scope="row" className="py-3 pr-3 text-left align-top font-medium text-ink-soft">{r.label}</th>
            {r.cells.map((cell, i) => (
              <td key={i} className={`px-3 py-3 align-top transition-colors duration-300 ${tone(props.columns[i].id)} ${strong(props.columns[i].id)}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
