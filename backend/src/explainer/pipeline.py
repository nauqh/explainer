"""Question in, events out: route, plan, write scenes, check. Nothing is stored: every question is a new run."""

import asyncio
import logging
from collections.abc import AsyncIterator

from pydantic_ai import UnexpectedModelBehavior
from pydantic_ai.capabilities import NativeTool
from pydantic_ai.messages import RetryPromptPart
from pydantic_ai.native_tools import WebSearchTool
from pydantic_ai.usage import RunUsage

from . import agents
from .agents import PlanDeps, WriteDeps, assemble
from .config import settings
from .lesson import Lesson
from .lint import lint_lesson

log = logging.getLogger(__name__)

FAILED = "Could not build a valid lesson for this question. Please try again or rephrase it."
FAILED_DEEPER = "Could not write the deeper parts. Please try again."


def _log_usage(what: str, question: str, usage: RunUsage, retries: int) -> None:
    """Cost and quality per run, in the server log (nothing is stored)."""
    log.info("%s %r: %s input tokens, %s output tokens, %s retries", what, question, usage.input_tokens, usage.output_tokens, retries)


def _retries(result) -> int:
    return sum(isinstance(p, RetryPromptPart) for m in result.all_messages() for p in getattr(m, "parts", []))


def _unique_step_ids(scene):
    """Prefix step ids with the scene id, so scenes written in parallel can never collide."""
    for st in getattr(scene, "steps", []):
        if not st.id.startswith(f"{scene.id}-"):
            st.id = f"{scene.id}-{st.id}"[:64]
    return scene


def event(name: str, **data) -> dict:
    return {"event": name, "data": data}


async def _write_scenes(question, route, plan, written: dict, start: int, usage, tally) -> AsyncIterator[dict]:
    """Write plan.scenes[start:] into `written` (index -> scene), yielding progress and scene events.

    Scene `start` alone, so the first new part shows as early as possible. Then a rolling pool: up to
    PARALLEL_SCENES writers at once, and the next scene starts the moment any finishes, so no scene waits on
    a slow sibling. Each scene streams as soon as it passes validation, possibly out of order. Scenes before
    `start` (an existing lesson being extended) must already be in `written`.
    """
    total = len(plan.scenes)
    pool = asyncio.Semaphore(settings.parallel_scenes)

    def prefix() -> list:
        """The finished scenes from 0 with no gaps: the context a scene starting now can see."""
        out = []
        while len(out) in written:
            out.append(written[len(out)])
        return out

    async def write(i: int):
        async with pool:
            result = await agents.writer.run(f"Write scene {i}.", deps=WriteDeps(question, route, plan, prefix(), i), usage=usage)
            return i, result

    yield event("progress", stage="writing", scenes=[start], total=total)
    i, result = await write(start)
    tasks = [asyncio.create_task(write(j)) for j in range(start + 1, total)]
    try:
        for next_done in [None, *asyncio.as_completed(tasks)]:
            if next_done is not None:
                i, result = await next_done
            written[i] = _unique_step_ids(result.output.scene)
            tally["retries"] += _retries(result)
            yield event("scene", index=i, total=total, scene=written[i].model_dump(mode="json"))
            # Waiters wake in order, so the next scenes being written are the lowest unfinished ones.
            if pending := [j for j in range(start, total) if j not in written]:
                yield event("progress", stage="writing", scenes=pending[:settings.parallel_scenes], total=total)
    finally:
        for t in tasks:
            t.cancel()


def _plan_event(lesson: dict) -> dict:
    """The lesson without its scenes, plus the scene outline, so the page can render headers and links early."""
    outline = [{"id": s["id"], "title": s["title"], "layout": s["layout"]} for s in lesson["scenes"]]
    return event("plan", lesson={**lesson, "scenes": []}, outline=outline)


async def generate(question: str) -> AsyncIterator[dict]:
    """Yield events: progress, route (off topic), scene, done, error."""
    yield event("progress", stage="routing")
    usage = RunUsage()
    prompt = f"<question>{question}</question>"
    route = (await agents.router.run(prompt, usage=usage)).output
    if not route.on_topic or not route.concept or not route.focus:
        yield event("route", onTopic=False, reason=route.reason, suggestion=route.suggestion)
        return
    yield event("route", onTopic=True, concept=route.concept)

    tally = {"retries": 0}
    try:
        yield event("progress", stage="searching" if route.time_sensitive else "planning")
        caps = [NativeTool(WebSearchTool(allowed_domains=agents.SEARCH_DOMAINS, max_uses=3))] if route.time_sensitive else None
        result = await agents.planner.run(prompt, deps=PlanDeps(question, route), usage=usage, capabilities=caps)
        plan = result.output
        tally["retries"] += _retries(result)
        head = {
            "schemaVersion": "0.3", "question": question, "concept": route.concept, "focus": route.focus,
            "level": "intermediate", "timeSensitive": route.time_sensitive,
            **plan.model_dump(mode="json", include={"key_points", "misconceptions", "sources", "terms"}),
            "scenes": [s.model_dump(mode="json", include={"id", "title", "layout"}) for s in plan.scenes],
        }
        yield _plan_event(head)

        written: dict[int, object] = {}
        async for e in _write_scenes(question, route, plan, written, 0, usage, tally):
            yield e
        scenes = [written[j] for j in range(len(plan.scenes))]
    except UnexpectedModelBehavior as e:
        log.warning("generation failed for %r: %s", question, e)
        yield event("error", message=FAILED)
        return

    lesson = assemble(question, route, plan, scenes)
    if errors := [str(i) for i in lint_lesson(lesson) if i.level == "error"]:
        log.warning("lesson-level lint failed for %r: %s", question, errors)
        yield event("error", message=FAILED)
        return

    _log_usage("lesson", question, usage, tally["retries"])
    yield event("done", lesson=lesson.model_dump(mode="json"))


async def deepen(lesson: Lesson) -> AsyncIterator[dict]:
    """Go deeper: plan 2 or 3 more scrolly scenes and a closing check after the lesson the page holds, and write them.

    Yields the same events as generate(): plan (the whole lesson so far, plus the new parts in the outline),
    scene (indices continue after the existing scenes), done (the extended lesson), error.
    """
    question = lesson.question
    route = agents.Route(on_topic=True, concept=lesson.concept, focus=lesson.focus, time_sensitive=lesson.time_sensitive, reason="")
    usage = RunUsage()
    tally = {"retries": 0}
    try:
        yield event("progress", stage="searching" if route.time_sensitive else "planning")
        caps = [NativeTool(WebSearchTool(allowed_domains=agents.SEARCH_DOMAINS, max_uses=3))] if route.time_sensitive else None
        result = await agents.planner.run(
            f"<question>{question}</question>", deps=PlanDeps(question, route, extend=lesson), usage=usage, capabilities=caps
        )
        more = result.output
        tally["retries"] += _retries(result)
        # The written scenes stand in the plan as they are; the writer only ever reads the new entries.
        done_scenes = [
            agents.PlannedScene.model_construct(
                id=sc.id, layout=sc.layout, title=sc.title, purpose="Already written.", covers=[],
                widget=getattr(getattr(sc, "visual", None), "widget", None),
            )
            for sc in lesson.scenes
        ]
        plan = agents.LessonPlan.model_construct(
            key_points=[*lesson.key_points, *more.key_points],
            misconceptions=[*lesson.misconceptions, *more.misconceptions],
            sources=[*lesson.sources, *more.sources],
            terms=[*lesson.terms, *more.terms],
            scenes=[*done_scenes, *more.scenes],
        )
        head = lesson.model_dump(mode="json")
        head |= plan.model_dump(mode="json", include={"key_points", "misconceptions", "sources", "terms"})
        head["scenes"] = [*head["scenes"], *(s.model_dump(mode="json", include={"id", "title", "layout"}) for s in more.scenes)]
        yield _plan_event(head)

        written: dict[int, object] = dict(enumerate(lesson.scenes))
        async for e in _write_scenes(question, route, plan, written, len(lesson.scenes), usage, tally):
            yield e
    except UnexpectedModelBehavior as e:
        log.warning("go deeper failed for %r: %s", question, e)
        yield event("error", message=FAILED_DEEPER)
        return

    extended = assemble(question, route, plan, [written[j] for j in range(len(plan.scenes))])
    if errors := [str(i) for i in lint_lesson(extended) if i.level == "error"]:
        log.warning("lesson-level lint failed going deeper on %r: %s", question, errors)
        yield event("error", message=FAILED_DEEPER)
        return
    _log_usage("go deeper", question, usage, tally["retries"])
    yield event("done", lesson=extended.model_dump(mode="json"))
