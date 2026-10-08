import { describe, expect, it } from "vitest";
import { parseSse } from "./sse";

describe("parseSse", () => {
  it("parses complete events and keeps the unfinished tail", () => {
    const { events, rest } = parseSse('event: progress\ndata: {"stage": "routing"}\n\nevent: scene\ndata: {"ind');
    expect(events).toEqual([{ event: "progress", data: { stage: "routing" } }]);
    expect(rest).toBe('event: scene\ndata: {"ind');
  });

  it("joins a tail split across chunks, including a CRLF split in half", () => {
    const first = parseSse('event: done\r\ndata: {"lessonId": "a"}\r');
    expect(first.events).toEqual([]);
    const second = parseSse(first.rest + '\n\r\n');
    expect(second.events).toEqual([{ event: "done", data: { lessonId: "a" } }]);
    expect(second.rest).toBe("");
  });

  it("ignores comment-only chunks", () => {
    expect(parseSse(": ping\n\n").events).toEqual([]);
  });
});
