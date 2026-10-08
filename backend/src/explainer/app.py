"""HTTP API. Run: uv run uvicorn explainer.app:app --reload"""

import logging
import uuid
from collections import Counter
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import Field

from .base import Model
from .config import settings
from .lesson import Lesson
from .pipeline import deepen, generate
from .trending import trending_questions

COOKIE = "learner"
log = logging.getLogger(__name__)

app = FastAPI(title="AI Concept Explainer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origin,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def learner_cookie(request: Request, call_next):
    """Anonymous learner id; created on first request, lost if the learner clears site data."""
    learner = request.cookies.get(COOKIE)
    request.state.learner = learner or uuid.uuid4().hex
    response = await call_next(request)
    if not learner:
        response.set_cookie(COOKIE, request.state.learner, max_age=400 * 86400, httponly=True, samesite="lax")
    return response


# ponytail: in-process counter, resets on restart and is per instance; move to Postgres if we run more than one.
_requests: Counter = Counter()


def _over_limit(request: Request) -> bool:
    today = datetime.now(UTC).date().isoformat()
    keys = [("learner", request.state.learner, today), ("ip", request.client.host if request.client else "?", today)]
    if any(_requests[k] >= settings.lessons_per_day for k in keys):
        return True
    for k in keys:
        _requests[k] += 1
    return False


class LessonRequest(Model):
    question: str = Field(min_length=3, max_length=300)


@app.post("/lessons", response_class=EventSourceResponse)
async def create_lesson(body: LessonRequest, request: Request):
    """Stream a lesson as SSE. Events: progress, route, scene, done, error."""
    if _over_limit(request):
        yield ServerSentEvent(event="error", data={"message": f"Daily limit of {settings.lessons_per_day} lessons reached. Try again tomorrow."})
        return
    try:
        async for e in generate(body.question.strip()):
            yield ServerSentEvent(event=e["event"], data=e["data"])
    except Exception:
        log.exception("lesson stream failed for %r", body.question)
        yield ServerSentEvent(event="error", data={"message": "Something went wrong on our side. Please try again."})


class DeeperRequest(Model):
    lesson: Lesson


@app.post("/lessons/deeper", response_class=EventSourceResponse)
async def deepen_lesson(body: DeeperRequest, request: Request):
    """Stream 2 or 3 more parts for the lesson the page holds, appended after it. Same events as POST /lessons."""
    if _over_limit(request):
        yield ServerSentEvent(event="error", data={"message": f"Daily limit of {settings.lessons_per_day} lessons reached. Try again tomorrow."})
        return
    try:
        async for e in deepen(body.lesson):
            yield ServerSentEvent(event=e["event"], data=e["data"])
    except Exception:
        log.exception("go deeper stream failed for %r", body.lesson.question)
        yield ServerSentEvent(event="error", data={"message": "Something went wrong on our side. Please try again."})


@app.get("/trending-questions")
async def read_trending_questions() -> list[str]:
    return await trending_questions()
