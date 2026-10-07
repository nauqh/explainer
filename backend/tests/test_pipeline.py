"""The real agents and validators, driven by scripted models instead of OpenRouter."""

import asyncio
import copy
import json
from contextlib import ExitStack
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from explainer import agents
from explainer.app import app
from explainer.pipeline import generate, get_lesson

LESSON = json.loads((Path(__file__).parent / "fixtures" / "synthetic.json").read_text(encoding="utf-8"))


def route(concept="attention", focus="attention-weights", on_topic=True):
    return {"onTopic": on_topic, "concept": concept, "focus": focus, "timeSensitive": True, "reason": "ok", "suggestion": None}


def plan_from(lesson):
    def covers(s):
        items = s.get("steps") or s.get("blocks") or []
        return sorted({c for i in items for c in i.get("covers", [])})

    return {
        "keyPoints": lesson["keyPoints"],
        "misconceptions": lesson["misconceptions"],
        "sources": lesson["sources"],
        "terms": lesson["terms"],
        "scenes": [
            {"id": s["id"], "layout": s["layout"], "title": s["title"], "widget": s.get("visual", {}).get("widget"),
             "purpose": "as in the fixture", "covers": [] if s["layout"] == "explore" else covers(s)}
            for s in lesson["scenes"]
        ],
    }


def scripted(*outputs):
    """A model that returns each output in turn as its structured answer, and counts calls."""
    queue = list(outputs)

    def fn(messages, info: AgentInfo):
        fn.calls += 1
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, queue.pop(0))])

    fn.calls = 0
    return FunctionModel(fn), fn


def run(question):
    async def collect():
        return [e async for e in generate(question)]

    return asyncio.run(collect())


def overrides(router_out, plan_out=None, scenes=()):
    stack = ExitStack()
    r, rf = scripted(router_out)
    p, pf = scripted(*([plan_out] if plan_out else []))
    w, wf = scripted(*({"scene": s} for s in scenes))
    stack.enter_context(agents.router.override(model=r))
    stack.enter_context(agents.planner.override(model=p))
    stack.enter_context(agents.writer.override(model=w))
    return stack, (rf, pf, wf)


def test_generates_streams_saves_then_serves_from_cache():
    stack, (_, _, wf) = overrides(route(), plan_from(LESSON), LESSON["scenes"])
    with stack:
        events = run("how does attention decide which words matter?")
    names = [e["event"] for e in events]
    assert names[0] == "progress" and names[-1] == "done"
    assert [e["data"]["index"] for e in events if e["event"] == "scene"] == list(range(len(LESSON["scenes"])))
    done = events[-1]["data"]
    assert done["cached"] is False and get_lesson(done["lessonId"])["scenes"] == LESSON["scenes"]
    assert wf.calls == len(LESSON["scenes"])

    # Same concept and focus, different wording: no planner or writer calls.
    stack, (_, pf, wf) = overrides(route())
    with stack:
        events = run("what are attention weights?")
    assert events[-1]["data"]["cached"] is True and pf.calls == wf.calls == 0


def test_a_scene_that_fails_lint_is_retried_with_the_messages():
    lesson = copy.deepcopy(LESSON)
    broken = copy.deepcopy(lesson["scenes"][0])
    broken["steps"][4]["set"] = {"focus": "proj"}  # two changes at once
    seen = []

    stack, (_, _, wf) = overrides(route(focus="retry-test"), plan_from(lesson), [broken, *lesson["scenes"]])
    with stack:
        inner = agents.writer.override(model=FunctionModel(_spy(wf, seen)))
        with inner:
            events = run("retry please")
    assert events[-1]["event"] == "done"
    assert any("changes 2 things at once" in m for m in seen)


def _spy(fn, seen):
    """Wrap a scripted model function to record retry prompts the model was sent."""

    def spy(messages, info):
        for m in messages:
            for p in getattr(m, "parts", []):
                if p.part_kind == "retry-prompt":
                    seen.append(str(p.content))
        return fn(messages, info)

    return spy


def test_off_topic_question_stops_at_the_router():
    stack, (_, pf, _) = overrides(route(None, None, on_topic=False) | {"reason": "That is about cooking.", "suggestion": "embeddings"})
    with stack:
        events = run("how do I bake bread?")
    assert [e["event"] for e in events] == ["progress", "route"]
    assert events[-1]["data"]["suggestion"] == "embeddings" and pf.calls == 0


def test_api_streams_sse_and_sets_the_learner_cookie():
    stack, _ = overrides(route(focus="api-test"), plan_from(LESSON), LESSON["scenes"])
    with stack, TestClient(app) as client:
        r = client.post("/lessons", json={"question": "how does attention work?"})
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        assert "learner" in r.cookies
        events = [line.removeprefix("event: ") for line in r.text.splitlines() if line.startswith("event: ")]
        assert events[-1] == "done" and events.count("scene") == len(LESSON["scenes"])
        data = [json.loads(line.removeprefix("data: ")) for line in r.text.splitlines() if line.startswith("data: ")]
        assert client.get(f"/lessons/{data[-1]['lessonId']}").json()["concept"] == "attention"
        assert client.get("/lessons/nope").status_code == 404
