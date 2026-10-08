/** Client for POST /lessons, which answers with Server-Sent Events (contract: the API section of the root README.md). */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type SseEvent = { event: string; data: unknown };

/** Split a buffer into complete events; `rest` is the unfinished tail to prepend to the next chunk. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const chunks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = chunks.pop() ?? "";
  const events = chunks.flatMap((chunk) => {
    let event = "message";
    const data: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return data.length ? [{ event, data: JSON.parse(data.join("\n")) }] : [];
  });
  return { events, rest };
}

/** POST to an API path that answers with lesson events: `/lessons` (a new lesson) or `/lessons/{id}/deeper`. */
export async function streamLesson(path: string, body: object, onEvent: (e: SseEvent) => void, signal: AbortSignal) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal,
  });
  if (res.status === 422) throw new Error("Questions need to be between 3 and 300 characters.");
  if (!res.ok || !res.body) throw new Error(`The lesson server answered ${res.status}.`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const { events, rest } = parseSse(buffer + value);
    buffer = rest;
    events.forEach(onEvent);
  }
}
