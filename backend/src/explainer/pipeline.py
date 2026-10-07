"""Question in, events out: route, cache, plan, write scenes one by one, save."""

import json
import logging
import os
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

from pydantic_ai import UnexpectedModelBehavior
from pydantic_ai.capabilities import NativeTool
from pydantic_ai.messages import RetryPromptPart
from pydantic_ai.native_tools import WebSearchTool
from pydantic_ai.usage import RunUsage
from sqlmodel import Field, Session, SQLModel, create_engine, select

from . import agents
from .agents import PlanDeps, WriteDeps, assemble
from .lint import lint_lesson

log = logging.getLogger(__name__)

TIME_SENSITIVE_TTL = timedelta(days=30)

engine = create_engine(os.environ.get("DATABASE_URL", "sqlite:///explainer.db"))


class StoredLesson(SQLModel, table=True):
    id: str = Field(primary_key=True)
    key: str = Field(index=True)
    lesson: str  # JSON
    created_at: datetime
    expires_at: datetime | None = None
    prompt_version: str
    models: str
    input_tokens: int
    output_tokens: int
    retries: int


SQLModel.metadata.create_all(engine)


def get_lesson(lesson_id: str) -> dict | None:
    with Session(engine) as db:
        row = db.get(StoredLesson, lesson_id)
        return json.loads(row.lesson) if row else None


def _cached(key: str) -> StoredLesson | None:
    now = datetime.now(UTC)
    with Session(engine) as db:
        q = select(StoredLesson).where(StoredLesson.key == key).order_by(StoredLesson.created_at.desc())
        row = db.exec(q).first()
    if row and (row.expires_at is None or row.expires_at > now):
        return row
    return None


def _retries(result) -> int:
    return sum(isinstance(p, RetryPromptPart) for m in result.all_messages() for p in getattr(m, "parts", []))


def event(name: str, **data) -> dict:
    return {"event": name, "data": data}


async def generate(question: str) -> AsyncIterator[dict]:
    """Yield events: progress, route (off topic), scene, done, error."""
    yield event("progress", stage="routing")
    usage = RunUsage()
    prompt = f"<question>{question}</question>"
    route = (await agents.router.run(prompt, usage=usage)).output
    if not route.on_topic or not route.concept or not route.focus:
        yield event("route", onTopic=False, reason=route.reason, suggestion=route.suggestion)
        return

    key = f"{route.concept}|{route.focus}|intermediate|{agents.PROMPT_VERSION}"
    if row := _cached(key):
        lesson = json.loads(row.lesson)
        for i, scene in enumerate(lesson["scenes"]):
            yield event("scene", index=i, total=len(lesson["scenes"]), scene=scene)
        yield event("done", lessonId=row.id, lesson=lesson, cached=True)
        return

    retries = 0
    try:
        yield event("progress", stage="searching" if route.time_sensitive else "planning")
        caps = [NativeTool(WebSearchTool(allowed_domains=agents.SEARCH_DOMAINS, max_uses=3))] if route.time_sensitive else None
        result = await agents.planner.run(prompt, deps=PlanDeps(question, route), usage=usage, capabilities=caps)
        plan, retries = result.output, _retries(result)

        scenes = []
        for i in range(len(plan.scenes)):
            yield event("progress", stage="writing", scene=i, total=len(plan.scenes))
            # ponytail: scenes are written one at a time so each sees the ones before it;
            # parallelise after scene 0 if total generation time becomes the bottleneck.
            result = await agents.writer.run(
                f"Write scene {i}.", deps=WriteDeps(question, route, plan, scenes, i), usage=usage
            )
            scenes.append(result.output.scene)
            retries += _retries(result)
            yield event("scene", index=i, total=len(plan.scenes), scene=result.output.scene.model_dump(mode="json"))
    except UnexpectedModelBehavior as e:
        log.warning("generation failed for %r: %s", question, e)
        yield event("error", message="Could not build a valid lesson for this question. Please try again or rephrase it.")
        return

    lesson = assemble(question, route, plan, scenes)
    if errors := [str(i) for i in lint_lesson(lesson) if i.level == "error"]:
        log.warning("lesson-level lint failed for %r: %s", question, errors)
        yield event("error", message="Could not build a valid lesson for this question. Please try again or rephrase it.")
        return

    now = datetime.now(UTC)
    lesson_id = uuid.uuid4().hex
    row = StoredLesson(
        id=lesson_id,
        key=key,
        lesson=lesson.model_dump_json(),
        created_at=now,
        expires_at=now + TIME_SENSITIVE_TTL if route.time_sensitive else None,
        prompt_version=agents.PROMPT_VERSION,
        models=json.dumps({"router": agents.ROUTER_MODEL, "planner": agents.PLANNER_MODEL, "writer": agents.WRITER_MODEL}),
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        retries=retries,
    )
    with Session(engine) as db:
        db.add(row)
        db.commit()
    yield event("done", lessonId=lesson_id, lesson=lesson.model_dump(mode="json"), cached=False)
