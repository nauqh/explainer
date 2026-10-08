# backend

Lesson schema, widget catalog, linter, and the generation pipeline (router, planner, scene writer) behind a FastAPI app.

## Commands

- `uv run fastapi dev` serves the API on :8000 with auto-reload (the app is pinned in `[tool.fastapi]` in `pyproject.toml`). `uv run fastapi run` serves it without reload. Settings and `OPENROUTER_API_KEY` come from the repo-root `.env`, loaded on import; real environment variables win.
- `uv run python -m explainer.export` writes `schema/lesson.schema.json` (the frontend generates its types from it) and `schema/catalog.md` (the widget catalog the model sees).
- `uv run pytest` runs the tests. They drive the real agents with scripted models; no API key needed.
- `uv run ruff check src tests` lints.

## Environment

All of these are read in `src/explainer/config.py`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | none, required | All model calls go through OpenRouter |
| `ROUTER_MODEL` | `openrouter:openai/gpt-oss-120b:nitro` | Classifies the question |
| `PLANNER_MODEL` | `openrouter:anthropic/claude-sonnet-5.5` | Plans the lesson; searches for time-sensitive concepts |
| `WRITER_MODEL` | `openrouter:anthropic/claude-sonnet-5.5` | Writes each scene |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS, comma-separated |
| `LESSONS_PER_DAY` | `20` | Per learner cookie and per IP |
| `PARALLEL_SCENES` | `3` | Scene writers running at once after scene 0 |

## API

`POST /lessons` with `{"question": "..."}` always answers with Server-Sent Events. It sets an httpOnly `learner` cookie on first use, so call it with credentials. Every `data:` line is JSON.

| Event | Data | When |
| --- | --- | --- |
| `progress` | `{stage: "routing" \| "searching" \| "planning" \| "writing", scenes?, total?}` | Before each step; `scenes` lists the indices being written now |
| `route` | `{onTopic: false, reason, suggestion}` or `{onTopic: true, concept}` | After routing. Off topic: the stream ends |
| `plan` | `{lesson, outline: [{id, title, layout}]}` | After planning: the lesson with `scenes: []` (terms, sources, key points for rendering links) and the scene outline |
| `scene` | `{index, total, scene}` | Each scene as soon as it passes validation. Scene 0 comes first; after it, up to `PARALLEL_SCENES` (default 3) are written at once, a new one starting whenever one finishes, so indices can arrive out of order. Render the contiguous prefix |
| `done` | `{lesson}` | The full validated lesson; the stream ends |
| `error` | `{message}` | Shown to the learner as is; the stream ends |

Nothing is stored or cached: every question is a new run. Token usage and retries per run go to the server log.

`POST /lessons/deeper` with `{"lesson": <the lesson the page holds>}` extends a quick lesson with 2 or 3 more scrolly parts and a closing check, with the same events. `plan` carries the whole lesson so far plus the new parts in its outline, `scene` indices continue after the existing scenes, and `done` returns the extended lesson.
