"""HTTP API. Run: uv run uvicorn explainer.app:app --reload"""

import logging
import os
import uuid
from collections import Counter
from datetime import UTC, datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import Field

from .base import Model
from .pipeline import generate, get_lesson

LESSONS_PER_DAY = int(os.environ.get("LESSONS_PER_DAY", "20"))
COOKIE = "learner"
log = logging.getLogger(__name__)

app = FastAPI(title="AI Concept Explainer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("FRONTEND_ORIGIN", "http://localhost:3000").split(","),
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
    if any(_requests[k] >= LESSONS_PER_DAY for k in keys):
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
        yield ServerSentEvent(event="error", data={"message": f"Daily limit of {LESSONS_PER_DAY} lessons reached. Try again tomorrow."})
        return
    try:
        async for e in generate(body.question.strip()):
            yield ServerSentEvent(event=e["event"], data=e["data"])
    except Exception:
        log.exception("lesson stream failed for %r", body.question)
        yield ServerSentEvent(event="error", data={"message": "Something went wrong on our side. Please try again."})


@app.get("/lessons/{lesson_id}")
def read_lesson(lesson_id: str):
    lesson = get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(404, "lesson not found")
    return JSONResponse(lesson)

