# backend

Lesson schema, widget catalog, linter, and the generation pipeline (router, planner, scene writer) behind a FastAPI app.

## Commands

- `uv run uvicorn explainer.app:app --reload` serves the API on :8000.
- `uv run python -m explainer.export` writes `schema/lesson.schema.json` (the frontend generates its types from it) and `schema/catalog.md` (the widget catalog the model sees).
- `uv run pytest` runs the tests. They drive the real agents with scripted models; no API key needed.
- `uv run ruff check src tests` lints.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | none, required | All model calls go through OpenRouter |
| `ROUTER_MODEL` | `openrouter:anthropic/claude-haiku-4.5` | Classifies the question |
| `PLANNER_MODEL` | `openrouter:anthropic/claude-opus-5.5` | Plans the lesson; searches for time-sensitive concepts |
| `WRITER_MODEL` | `openrouter:anthropic/claude-sonnet-5.5` | Writes each scene |
| `DATABASE_URL` | `sqlite:///explainer.db` | Postgres in production (add a driver such as `psycopg` when deploying) |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS, comma-separated |
| `LESSONS_PER_DAY` | `20` | Per learner cookie and per IP |

## API

`POST /lessons` with `{"question": "..."}` always answers with Server-Sent Events. It sets an httpOnly `learner` cookie on first use, so call it with credentials. Every `data:` line is JSON.

| Event | Data | When |
| --- | --- | --- |
| `progress` | `{stage: "routing" \| "searching" \| "planning" \| "writing", scene?, total?}` | Before each step |
| `route` | `{onTopic: false, reason, suggestion}` | Off-topic question; the stream ends |
| `scene` | `{index, total, scene}` | Each scene as soon as it passes validation, in order |
| `done` | `{lessonId, lesson, cached}` | The full validated lesson; the stream ends |
| `error` | `{message}` | Shown to the learner as is; the stream ends |

A cache hit streams every `scene` and then `done` immediately, with no `progress` after routing.

`GET /lessons/{id}` returns a saved lesson, or 404.
