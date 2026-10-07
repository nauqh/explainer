# AI Concept Explainer - PRD

Oct 7, 2026 · @Wan

## Overview

A web app that turns a learner's question about an AI or machine learning concept into an interactive explainer: the learner types what they don't understand and gets a scroll-driven lesson with live diagrams, real computation, quick checks and a recall exercise. A language model writes the lesson as structured JSON; the front end draws it with a fixed set of widgets the model is only allowed to configure.

There are no built-in or pre-made lessons. Every lesson is generated live from the learner's question, validated, and rendered.

**Problem.** Chatbot explanations are text the learner reads passively. Hand-made explainers like Transformer Explainer or MLU-Explain teach well but take weeks to build per concept and only exist for a handful of concepts.

**Goals**

- Answer any AI or ML question with a valid, interactive lesson, first scene on screen in seconds.
- Never show a number the model made up: numbers are computed by widgets. Claims trace to the lesson plan's key points; for time-sensitive concepts, each key point cites a source found by web search.
- Measure learning, not just engagement.
- Serve as a portfolio project showing AI engineering (routing, structured output, validation, evals) and front-end work (scrollytelling, visualisation).

**Non-goals**

- Topics outside AI, ML and the maths used directly in ML. Products and companies ("what is Claude?") are redirected to the nearest concept.
- Model-written HTML or JavaScript. The model never writes UI code.
- A chat tutor. The product is a lesson, not a conversation. Asking again starts a new lesson.
- Hand-authored lessons or concept cards.

## Users and stories

Primary users are developers and students learning AI engineering and machine learning. The secondary user is the developer (you), who tunes prompts and widgets and runs evals.

| As a… | I want to… | So that… |
| --- | --- | --- |
| Learner | type a question about an AI concept I don't understand and get a lesson | I learn it without reading a wall of text |
| Learner | see the lesson start within seconds, with progress while it is written | I don't stare at a blank screen |
| Learner | scroll or click through steps where the diagram changes with the text | I see what each sentence means |
| Learner | tap a highlighted word to see the matching part of the diagram, and the reverse | I connect words and picture |
| Learner | play with a live demo when I want to | I can test my own questions |
| Learner | answer a quick check and get a hint before the answer | I find my mistakes while I can still fix them |
| Learner | explain the concept in my own words and get feedback | I know whether I actually understood it |
| Learner | see where a recent fact comes from | I can trust it |
| Learner on mobile or with reduced motion | use a stepper instead of scrolling animations | the lesson works for me |
| Developer | run one eval command after a prompt change | I know whether lessons got better or worse |

## MVP scope

**In scope**

- Free-text question input for any AI or ML concept.
- Router: on-topic gate, canonical concept slug, focus, time-sensitivity.
- Web search for time-sensitive concepts only, with cited key points.
- Planner and scene-writer agents, validation as output validator, SSE streaming, cache.
- The five generic widgets (see Widget catalog).
- Scrolly and stepper rendering of the same lesson.
- Quick checks with hints, recall with model grading.
- Local eval command over a fixed benchmark of questions.

**Out of scope for MVP**

- Spaced review prompts (v1.1).
- Live remediation scenes after a wrong answer (v1.1; reuses the scene-writer).
- Follow-up questions appended to a lesson (v1.1).
- Author dashboard, CI eval runs, scrolly vs stepper A/B test.
- Concept-specific widgets (gradient descent, attention, tokeniser, next-token sandbox) and transformers.js.
- Learner level selection: MVP generates intermediate lessons only; `level` stays in the schema.
- User accounts beyond an anonymous learner id.
- Editable code cells and Pyodide, mobile app, offline mode, multiple languages.

## Architecture and tech stack

Two services: a Python backend that routes questions and generates and validates lessons, and a Next.js front end that only renders scenes that already passed validation. Pydantic models are the single source of truth for the lesson format; the front end gets TypeScript types generated from their JSON Schema.

&#91;embedded content: system architecture · 2 services, database, model provider\]

The agents' output must pass the validator before it is saved or streamed; failures go back to the agents as retries.

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend API | FastAPI (Python) | Routing, generation, cache, checks, recall grading |
| Generation | Pydantic AI | Typed output, output validators raising `ModelRetry`, model-agnostic |
| Models | Claude through OpenRouter (`OPENROUTER_API_KEY`) | Router `anthropic/claude-haiku-4.5`, planner and recall grader `anthropic/claude-opus-5.5`, scene writer `anthropic/claude-sonnet-5.5`; ids in env config, revisit with evals |
| Search | Pydantic AI `WebSearchTool` through OpenRouter | Time-sensitive concepts only; `allowed_domains` allowlist in config |
| Schema | Pydantic v2 | Export with `model_json_schema()`; TS types via `json-schema-to-typescript` |
| Database | Postgres (SQLModel) | Lesson cache, attempts, recall answers |
| Front end | Next.js + TypeScript + Tailwind | Question page and lesson pages |
| Scroll and steps | react-scrollama + a custom stepper | Same scenes in both modes |
| Lesson state | Zustand | Steps write state; widgets read it |
| Drawing | React SVG + D3 (scales, layout) + Motion (transitions) | Hand-built widgets, not Mermaid |
| In-browser compute | Plain TypeScript | Widgets compute their own numbers |
| Tracing | Pydantic Logfire | Cost, latency and retries per generation |
| Evals | pydantic-evals, run locally | One command, JSON report per run |
| Hosting | Railway (API, web, Postgres) | Two services plus a database; no worker |

Repo layout: a monorepo with `backend/` and `frontend/`.

**Cost and abuse.** Every uncached question is a paid router, planner and scene-writer run. Limit lessons and recall gradings per anonymous id and per IP per day, and set a hard monthly spend cap on the API key.

**Learner identity.** An anonymous id in an httpOnly cookie, created on the first request. It is lost if the learner clears site data or switches device; that is accepted for MVP.

**API surface (initial)**

- `POST /lessons` with `{question}` → runs the router; returns a cached lesson, or streams progress events and scenes over SSE as each is generated and validated. Off-topic questions return the router's reason and a suggested concept.
- `GET /lessons/{id}` → a full validated lesson.
- `POST /attempts` → records a check answer; returns hint or explanation.
- `POST /recall` → grades a recall answer against the lesson's key points.

## Lesson spec

The model returns one lesson as JSON matching the Pydantic models below (schema version 0.3). A lesson is a plan (key points, misconceptions, sources) plus an ordered list of scenes; each scene has one layout and its own state.

**Lesson**

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `"0.3"` | Format version |
| `question` | string | The learner's question, as asked |
| `concept` | slug | Canonical concept id from the router (e.g. `attention`) |
| `focus` | string | The angle the question asks about; picks emphasis and the opening scene |
| `level` | beginner / intermediate / advanced | Target level; MVP always intermediate |
| `timeSensitive` | bool | From the router; true means key points must cite sources |
| `mode` | auto / scrolly / stepper | `auto` = scrolly on wide screens, stepper on narrow screens or reduced motion |
| `keyPoints` | list of `{id, text, sources}` | What the lesson must teach; `sources` = source ids, required when `timeSensitive` |
| `misconceptions` | list of `{id, text}` | Common wrong beliefs; checks target these |
| `sources` | list of `{id, title, url}` | Pages found by search; empty when not time-sensitive |
| `terms` | list of `{id, label, definition}` | Glossary shown on hover or tap |
| `scenes` | list of Scene | In reading order |

**Scene layouts**

Every scene has `id`, `title` and, for scenes with a visual, `state`: a map of key → number, string, bool or null with the defaults its widget reads.

- `scrolly`: one `visual` (a widget + props), its `state` and 1-8 `steps`. A sticky visual with steps beside it; in stepper mode, one step per screen.
- `explore`: one `visual`, its `state`, optional `controls` (sliders for numeric keys, selects for the rest, bound to state) and a `task`. Optional enrichment only.
- `stack`: a list of `blocks` in normal page flow.

**Step**: `id`, `text`, `set` (state changes), `highlight` (widget part ids), `covers` (key point ids).

Step state = scene defaults + this step's `set`, never accumulated from earlier steps, so scrolling back just re-applies the earlier step.

**Text markup** (in step text and block text)

- `[[part:<id>|label]]` links to a part of the scene's widget; tapping either side highlights both.
- `[[term:<id>|label]]` shows the glossary definition.
- `[[source:<id>|label]]` links to a cited source.
- `{stateKey}` prints the live state value.

**Blocks** (stack scenes)

| Type | Fields | Notes |
| --- | --- | --- |
| `prose` | `text`, `covers` | Short paragraph |
| `cards` | `items[{title, body, tag}]` (1-4), `covers` | Side-by-side comparison |
| `predict` | `question`, `options`, `answer`, `hint`, `explanation`, `misconception`, `covers` | Hint shown before the answer |
| `sort` | `question`, `items`, `buckets`, `answer` (bucket per item), `hint`, `explanation`, `misconception`, `covers` | Drag items into buckets |
| `recall` | `prompt`, `keyPoints` (key point ids), `minWords` | Free text graded by the model |

## Widget catalog

The catalog is the contract between model and front end: the model can only pick widgets from it and set their declared props and state. Each widget is defined once in Python (props and state as Pydantic models, for the schema and the prompt) and implemented once as a React component in TypeScript.

**Every widget definition declares**

- `name`, `kind` (structure, process, playground or chart) and a one-paragraph `description` for the model's prompt.
- `props`: a Pydantic model of what the model may configure.
- `state`: which state keys it reads and the values each accepts (may depend on props).
- `parts`: named parts that steps can highlight or link to (may depend on props).

Added with the first widget that needs them: `changeGroups` (keys that move together and count as one change), `autoplays` (the renderer shows a pause control) and `scrollyAllowed` (false for playgrounds, which only go in explore scenes). None of the five MVP widgets needs them.

Each widget also has a `describe(props, state)` function in TypeScript next to its component, a pure function returning plain facts about what the widget shows at that state (e.g. "the curve is decreasing", "messages shown: request to response"). It is the same code the learner's widget runs; the Python evals call it through a small Node script to check that step text matches the visual.

The catalog text and the lesson JSON Schema in the model's prompt are generated from these definitions, never written by hand.

**MVP widgets (generic)**

| Widget | Kind | Draws | Props (model-set) | State keys |
| --- | --- | --- | --- | --- |
| `Diagram` | structure | Components and connections: architectures, pipelines, roles | nodes, edges, groups | `focus` (a node or group id, or null), `visible` (how many nodes are revealed) |
| `Sequence` | process | Who sends what to whom, in order | actors, messages (text only) | `upTo` (a message id) |
| `Compare` | structure | Side-by-side options or a small table | columns, rows | `highlight` (a column id or null) |
| `FunctionPlot` | chart | A curve computed in the browser | a restricted maths expression, parameters with ranges | one key per declared parameter |
| `Matrix` | structure | A grid of values from a named recipe (softmax, dot product, confusion matrix) | recipe, inputs | `selected` (a cell or null) |

Rules that keep numbers honest:

- `FunctionPlot` evaluates the expression itself with a whitelisted grammar (numbers, `x`, parameters, `+ - * / ^`, parentheses, `exp`, `log`, `sqrt`, `abs`, `sin`, `cos`, `tanh`, `max`, `min`; `^` is right-associative and binds tighter than unary minus). The model never writes plotted values.
- `Matrix` computes values from its recipe and inputs. The model never writes the cell values of a computed matrix.
- Diagram labels and sequence text are model-written; they are linted against the lesson's terms and key points.

Concept-specific widgets (gradient descent, attention, tokeniser, next-token sandbox) come after MVP and plug into the same catalog.

## Generation pipeline

A router classifies the question, an optional search grounds time-sensitive concepts, a planner outlines the lesson, then one agent run writes each scene; every output passes schema and lint checks before it is saved or streamed, and failures go back to the model as retry messages.

&#91;embedded content: generation flow · cache, plan, write, validate, stream\]

1. **Router** (Pydantic AI agent, cheap model, output = `Route`). Input: the question as quoted data. Output: `{onTopic, concept, focus, timeSensitive, reason, suggestion}`; `concept` and `focus` are kebab-case slugs. Off-topic or hostile questions stop here with `reason` and a suggested concept. The question never overrides instructions in later prompts.
2. **Cache lookup.** Key = concept + focus + level + prompt version. A hit returns the stored lesson immediately. Lessons with `timeSensitive` expire after 30 days; others never expire.
3. **Search** (only when `timeSensitive`). The planner runs with the web search tool, limited to the domain allowlist (official docs and specs, arXiv, well-known course notes). Found pages become `sources`.
4. **Planner** (output = `LessonPlan`). Input: the question, the route, the catalog text, and sources if any. Output: key points (with source ids when time-sensitive), misconceptions, terms, and a scene list (id, layout, title, widget, purpose, the key points each scene covers). The scene writer picks props and default state, so the plan stays small and fast. The first scene addresses the question's focus. Validated against the plan rules (coverage, terms before process scenes, ends with recall, citations when time-sensitive) before any scene is written.
5. **Scene writer** (one run per scene, output = `Scene`). Input: the plan, the catalog, and the scenes before it. Scenes are written one at a time for now; parallelise after the first scene if total time becomes the bottleneck.
6. **Validation as output validator.** Each run's output validator runs the schema and the lint rules for that scene. A failure raises `ModelRetry` with the lint messages. Output retries = 3; after that, mark the generation failed, log it, and tell the learner.
7. **Lesson-level checks** after all scenes are in: coverage, terms first, recall at the end, unique ids.
8. **Stream to the browser.** Progress events ("Searching sources", "Planning lesson", "Writing scene 1") and each scene as soon as it passes validation.
9. **Save** the lesson with its prompt version, model names, sources, token cost and retry count.

**Latency targets** (time to first scene)

| Case | Target |
| --- | --- |
| Cache hit | under 1 s |
| Uncached, stable concept | under 10 s |
| Uncached, time-sensitive concept (search) | under 20 s |

## Rendering

The front end renders the same scenes in two modes, scrolly and stepper, and both must reach full feature parity because the stepper may teach better.

**Question page**

- One text box ("What AI concept don't you understand?") and a few example questions.
- While generating: the progress line from the stream, then scenes appear as they arrive.
- Off-topic: the router's reason and a suggested concept to ask about instead.

**Scrolly mode**

- Sticky visual beside the steps on wide screens; visual pinned to the top 40% of the screen with steps scrolling under it on phones.
- Step tracking with IntersectionObserver (react-scrollama). Do not rely on CSS scroll-driven animations for step logic: Firefox still ships them behind a flag.
- When a step enters view, write its state (scene defaults + `set`) to the Zustand store; the widget animates to it.
- Don't size scroll sections with `vh` units (mobile browser bars change the viewport height).

**Stepper mode**

- One step per screen with Next / Back buttons, keyboard arrows and swipe.
- Default when `mode` is `stepper`, on narrow screens when `mode` is `auto`, or when `prefers-reduced-motion` is set.

**Both modes**

- Two-way linking: tapping a `[[part:…]]` word highlights the widget part; tapping a widget part highlights its words.
- Glossary terms open a small popover with the definition.
- Cited key points show their sources.
- Explore scenes are clearly marked optional and can be skipped.
- Checks show the hint on the first wrong answer, then the explanation.
- A progress indicator per lesson.

**Motion and accessibility**

- Transitions short (about 300-500 ms) and only between step states. A replay button per step.
- `prefers-reduced-motion`: step changes are instant (fades allowed).
- Any widget that animates on its own for more than 5 seconds gets a visible pause control (WCAG 2.2.2).
- Every widget has an accessible name and a text alternative; step text alone must carry the lesson.
- Full keyboard navigation; colour never carries meaning alone.

## Validation rules

Every scene and lesson must pass the Pydantic schema and these lint rules before it is saved or rendered. Errors become `ModelRetry` messages; warnings are logged for evals. Each message names the path and the fix in plain words (e.g. `scenes[0].steps[2].set: changes 2 things at once (visible, focus); split into steps`).

| Rule | Level | Checks |
| --- | --- | --- |
| `schema` | error | Pydantic: shape, widget is in the catalog, props valid (including `FunctionPlot` expressions and the id references inside props) |
| `state-keys` / `state-values` | error | Scene state, steps and controls only use keys the widget reads, with valid values (e.g. `upTo` must be a message id in the scene's props) |
| `one-change` | error | At most one state key differs from the previous step's state (the scene defaults for the first step) |
| `word-cap` | error | At most 40 words per step |
| `refs` | error | Every `[[part:]]`, `[[term:]]`, `[[source:]]`, `{var}` and highlight resolves; no part links in stack scenes |
| `citations` | error | When `timeSensitive`, every key point cites at least one source |
| `coverage` | error | Every key point is covered by a scrolly or stack scene, not only an explore scene |
| `terms-first` | error | Every term used by a process or playground scene is introduced before it |
| `recall` | error | The last scene contains a recall block |
| `check-answer` / `misconception` | error | Answer indices valid; misconceptions exist in the plan |
| `unique-ids` | error | Scene and step ids unique |
| `terms-unused` | warn | Every defined term is used |

**Acceptance:** a test suite takes a valid fixture lesson and breaks it one way per rule; each broken version must fail with the expected rule, and the valid version must pass with zero errors.

**Fixtures.** Before the pipeline exists, a tiny synthetic fixture (one scene per layout) exercises the linter and renderer. Once the pipeline runs, a handful of generated lessons are committed under `tests/fixtures/`. Fixtures are test inputs only; learners never see them.

## Learning features

The lesson makes the learner retrieve and apply what they read, because reading a fluent explanation feels like learning but often isn't. Research basis: Mayer's multimedia principles, PhET's minimal-but-nonzero guidance, retrieval practice, and the PNAS 2025 study where unguarded GPT-4 help lowered later exam scores.

**Quick checks** (`predict`, `sort`)

- Each targets a named misconception from the plan.
- First wrong answer → hint. Second wrong answer → explanation and correct answer.
- Record every attempt: lesson, block, answer, attempt number, time.

**Recall** (`recall`)

- The learner writes an explanation in their own words (minimum word count per block).
- The backend grades it with a Pydantic AI agent against the listed key points; output = per key point: covered, partly, missing, plus one sentence of feedback.
- Feedback names what was missing and links back to the scene that teaches it. No score out of 100.

## Evals and success metrics

Every lesson is generated, so evals run on a fixed benchmark: about 30 learner questions across ML foundations, deep learning and AI engineering, including several time-sensitive ones. One local command generates a lesson for each, scores it, and writes a JSON report to compare against the previous run. Run it after every prompt or widget change.

| Eval | How | Target |
| --- | --- | --- |
| Routing | Router output vs expected concept, on-topic and time-sensitive labels for each benchmark question (plus a few off-topic and injection questions) | ≥ 95% |
| Validity | Share of generations passing schema + lint within 3 retries | ≥ 95% |
| First-try validity | Share passing with zero retries | Track trend |
| Coverage | LLM judge checks each key point is actually taught where `covers` says | ≥ 90% |
| Citation support | For time-sensitive lessons, judge checks each cited source says what the key point says | ≥ 95% |
| Text matches visual | For each step, the widget's `describe(props, state)` returns plain facts; judge checks the step text doesn't contradict them | ≥ 95% of steps |
| Controls do something | Automated: every explore control changes the widget's `describe` output across its range | 100% |
| Explore removed | Coverage still passes with explore scenes deleted | 100% |
| Cost and latency | Tokens and seconds per lesson from tracing | Latency targets above |

**Learning metrics (from real use)**

- Check accuracy: first-attempt correct rate per misconception.
- Recall: share of key points covered in recall answers.
- Completion: share of learners reaching the recall block.

These are recorded from launch but are not MVP success criteria until there is real traffic.

## Example lesson output

Illustrative only, to show the format. Abridged to one scene per layout; the product ships no pre-made lessons.

```json
{
  "schemaVersion": "0.3",
  "question": "how does an AI app call tools with MCP?",
  "concept": "mcp",
  "focus": "tool-call-flow",
  "level": "intermediate",
  "timeSensitive": true,
  "mode": "auto",
  "keyPoints": [
    { "id": "kp-flow", "text": "The client lists the server's tools, the host gives the list to the model, the model picks one, the client sends tools/call, the result goes back to the model.", "sources": ["spec"] },
    { "id": "kp-no-direct", "text": "The model never talks to a server directly; the host executes calls on the model's behalf.", "sources": ["spec"] },
    { "id": "kp-stateless", "text": "As of 2026-07-28 there is no initialize handshake; every request carries its protocol version and client capabilities in _meta.", "sources": ["spec"] }
  ],
  "misconceptions": [
    { "id": "model-calls-server-directly", "text": "The model sends requests straight to MCP servers." }
  ],
  "sources": [
    { "id": "spec", "title": "MCP specification 2026-07-28", "url": "https://modelcontextprotocol.io/specification/2026-07-28" }
  ],
  "terms": [
    { "id": "host", "label": "host", "definition": "The AI app you use, such as a chat app or IDE. It runs the model and decides what reaches it." }
  ],
  "scenes": [
    {
      "layout": "scrolly",
      "id": "one-tool-call",
      "title": "One tool call, start to finish",
      "visual": {
        "widget": "Sequence",
        "props": {
          "actors": [
            { "id": "user", "label": "you" },
            { "id": "host", "label": "host" },
            { "id": "model", "label": "model" },
            { "id": "server", "label": "MCP server" }
          ],
          "messages": [
            { "id": "ask", "from": "user", "to": "host", "text": "Will it rain in Melbourne tomorrow?" },
            { "id": "list", "from": "host", "to": "server", "text": "tools/list" },
            { "id": "pick", "from": "model", "to": "host", "text": "use get_forecast" },
            { "id": "call", "from": "host", "to": "server", "text": "tools/call get_forecast" }
          ]
        }
      },
      "state": { "upTo": "ask" },
      "steps": [
        { "id": "s-ask", "text": "You ask the host a question it can't answer alone.", "set": { "upTo": "ask" }, "highlight": ["ask"], "covers": ["kp-flow"] },
        { "id": "s-list", "text": "The host asks the server which tools it has. The request carries its protocol version, so there's no setup handshake ([[source:spec|spec]]).", "set": { "upTo": "list" }, "highlight": ["list"], "covers": ["kp-flow", "kp-stateless"] },
        { "id": "s-pick", "text": "The model only [[part:pick|says which tool it wants]]. The host sends the call.", "set": { "upTo": "call" }, "highlight": ["pick", "call"], "covers": ["kp-flow", "kp-no-direct"] }
      ]
    },
    {
      "layout": "stack",
      "id": "check",
      "title": "Check yourself",
      "blocks": [
        {
          "type": "predict",
          "question": "The model sends requests straight to the MCP server. True or false?",
          "options": ["True", "False"],
          "answer": 1,
          "hint": "Look back at who sent tools/call.",
          "explanation": "False. The model only says which tool it wants. The [[term:host|host]] sends the request and passes the result back.",
          "misconception": "model-calls-server-directly",
          "covers": ["kp-no-direct"]
        },
        { "type": "recall", "prompt": "Explain how an AI app calls a tool through MCP.", "keyPoints": ["kp-flow", "kp-no-direct", "kp-stateless"], "minWords": 30 }
      ]
    }
  ]
}
```

## Build plan

Build in this order; each milestone is done only when its acceptance criteria pass. The renderer is proven with a synthetic fixture before any model is involved.

1. **Schema and catalog (backend)**
   - Pydantic models for lesson, plan, scenes, blocks, route; widget definitions for the five generic widgets.
   - Script that exports the lesson JSON Schema, generated TypeScript types, and the catalog prompt text.
   - Accept: models round-trip the synthetic fixture; generated TS types compile in the front end.
2. **Linter and tests**
   - All rules in Validation rules, with plain-language messages.
   - Accept: the fixture passes with zero errors; one broken variant per rule fails with that rule.
3. **Renderer with the synthetic fixture**
   - Scrolly and stepper modes, two-way linking, glossary, sources, the five widgets with `describe()`, checks with hints, recall input (ungraded).
   - Accept: the fixture renders in both modes on desktop and a phone; reduced motion makes steps instant; keyboard-only navigation works.
4. **Generation pipeline**
   - Router, search for time-sensitive concepts, planner and scene-writer agents, lint as output validator with 3 retries, SSE streaming with progress, cache, rate limits, tracing.
   - Accept: a stable question and a time-sensitive question each produce a lesson that passes lint within the latency targets; an off-topic question is refused with a suggestion.
5. **Learning loop**
   - Attempts and recall grading.
   - Accept: a wrong check shows a hint, then explanation; recall returns per-key-point feedback.
6. **Evals**
   - Benchmark questions, eval command, JSON report.
   - Accept: every eval in the table runs on the benchmark and reports a score.

**After MVP:** spaced review, live remediation scenes, follow-up questions, concept-specific widgets, level selection, author dashboard, CI eval runs, scrolly vs stepper A/B test.

## Risks and open questions

| Risk | Mitigation |
| --- | --- |
| The model's knowledge is out of date on recent topics | Router flags time-sensitive concepts; search with a domain allowlist; key points must cite sources; citation-support eval |
| The router mislabels a recent topic as stable | Routing eval includes time-sensitive questions; err toward `timeSensitive` when unsure |
| Lessons on stable topics state something wrong | Coverage and text-matches-visual evals; numbers computed by widgets; benchmark review after prompt changes |
| Generic widgets draw some concepts poorly | Track which concepts the planner struggles with in evals; add concept-specific widgets for those first |
| Retry loops and public traffic get expensive | 3 output retries max; cache by concept + focus; per-id and per-IP limits; monthly spend cap |
| Prompt injection through the question | Router gate; question passed as quoted data; lint still runs on all output |
| Fluent lessons feel like learning without it | Checks with hints and graded recall |

**Open questions**

- Does the recall grader agree with human grading well enough? Measure on 30 hand-graded answers.
- Which model pairs give the best quality for the cost? Decide from eval results in milestone 6.
- Product name.
