"""The real agents and validators, driven by scripted models instead of OpenRouter."""

import asyncio
import copy
import json
import re
import time
from contextlib import ExitStack
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from explainer import agents
from explainer.app import app
from explainer.config import settings
from explainer.lesson import Lesson
from explainer.pipeline import deepen, generate

LESSON = json.loads((Path(__file__).parent / "fixtures" / "synthetic.json").read_text(encoding="utf-8"))
SCENE = {s["id"]: s for s in LESSON["scenes"]}
# The fixture holds every widget and block. A generated lesson is quick: scrolly scenes, then one closing check.
QUICK = {**LESSON, "scenes": [SCENE["pipeline"], SCENE["bars"], SCENE["cloud"], SCENE["check"]]}


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


def by_scene(scenes, first_try=None):
    """A writer model that answers by the scene index in its prompt, since scenes are written in parallel.

    `first_try` maps a scene index to a broken answer returned once before the real one.
    """
    queues = {i: [*([first_try[i]] if first_try and i in first_try else []), s] for i, s in enumerate(scenes)}

    def fn(messages, info: AgentInfo):
        fn.calls += 1
        prompt = next(p.content for m in messages for p in getattr(m, "parts", []) if p.part_kind == "user-prompt")
        i = int(re.search(r"Write scene (\d+)", prompt).group(1))
        answer = queues[i].pop(0) if len(queues[i]) > 1 else queues[i][0]
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {"scene": answer})])

    fn.calls = 0
    return FunctionModel(fn), fn


def saved_form(scenes):
    """Scenes as the pipeline saves them: step ids prefixed with their scene id."""
    out = copy.deepcopy(scenes)
    for s in out:
        for st in s.get("steps", []):
            if not st["id"].startswith(f"{s['id']}-"):
                st["id"] = f"{s['id']}-{st['id']}"
    return out


def run(question):
    async def collect():
        return [e async for e in generate(question)]

    return asyncio.run(collect())


def overrides(router_out, plan_out=None, scenes=(), first_try=None):
    stack = ExitStack()
    r, rf = scripted(router_out)
    p, pf = scripted(*([plan_out] if plan_out else []))
    w, wf = by_scene(list(scenes), first_try)
    stack.enter_context(agents.router.override(model=r))
    stack.enter_context(agents.planner.override(model=p))
    stack.enter_context(agents.writer.override(model=w))
    return stack, (rf, pf, wf)


def test_generates_and_streams_a_lesson_then_runs_fresh_every_time():
    stack, (_, _, wf) = overrides(route(), plan_from(QUICK), QUICK["scenes"])
    with stack:
        events = run("how does attention decide which words matter?")
    names = [e["event"] for e in events]
    assert names[0] == "progress" and names[-1] == "done"
    plan = next(e["data"] for e in events if e["event"] == "plan")
    assert plan["lesson"]["scenes"] == [] and plan["lesson"]["terms"] == QUICK["terms"]
    assert [o["id"] for o in plan["outline"]] == [s["id"] for s in QUICK["scenes"]]
    assert names.index("plan") < names.index("scene")
    routed = next(e["data"] for e in events if e["event"] == "route")
    assert routed["onTopic"] is True and routed["concept"] == "attention"
    # Scene 0 first; the rest in parallel batches, so their order may vary but each arrives once.
    indices = [e["data"]["index"] for e in events if e["event"] == "scene"]
    assert indices[0] == 0 and sorted(indices) == list(range(len(QUICK["scenes"])))
    writing = [e["data"]["scenes"] for e in events if e["event"] == "progress" and e["data"]["stage"] == "writing"]
    assert writing[0] == [0] and max(map(len, writing)) == settings.parallel_scenes
    done = events[-1]["data"]
    assert set(done) == {"lesson"} and done["lesson"]["scenes"] == saved_form(QUICK["scenes"])
    assert wf.calls == len(QUICK["scenes"])

    # Nothing is stored or cached: the same question again plans and writes again.
    stack, (_, pf, wf) = overrides(route(), plan_from(QUICK), QUICK["scenes"])
    with stack:
        events = run("how does attention decide which words matter?")
    assert events[-1]["event"] == "done" and pf.calls == 1 and wf.calls == len(QUICK["scenes"])


def test_a_scene_that_fails_lint_is_retried_with_the_messages():
    lesson = copy.deepcopy(QUICK)
    broken = copy.deepcopy(lesson["scenes"][0])
    broken["steps"][4]["set"] = {"focus": "proj"}  # two changes at once
    seen = []

    stack, (_, _, wf) = overrides(route(focus="retry-test"), plan_from(lesson), lesson["scenes"], first_try={0: broken})
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
    stack, _ = overrides(route(focus="api-test"), plan_from(QUICK), QUICK["scenes"])
    with stack, TestClient(app) as client:
        r = client.post("/lessons", json={"question": "how does attention work?"})
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        assert "learner" in r.cookies
        events = [line.removeprefix("event: ") for line in r.text.splitlines() if line.startswith("event: ")]
        assert events[-1] == "done" and events.count("scene") == len(QUICK["scenes"])
        data = [json.loads(line.removeprefix("data: ")) for line in r.text.splitlines() if line.startswith("data: ")]
        assert data[-1]["lesson"]["concept"] == "attention"


def test_scenes_are_written_in_a_rolling_pool():
    """After scene 0, the rest are written at once, and a slow scene does not hold up the others."""
    delays = {1: 1.0}

    async def slow(messages, info: AgentInfo):
        prompt = next(p.content for m in messages for p in getattr(m, "parts", []) if p.part_kind == "user-prompt")
        i = int(re.search(r"Write scene (\d+)", prompt).group(1))
        await asyncio.sleep(delays.get(i, 0.3))
        return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, {"scene": QUICK["scenes"][i]})])

    stack, _ = overrides(route(focus="pool-test"), plan_from(QUICK))
    with stack, agents.writer.override(model=FunctionModel(slow)):
        started = time.perf_counter()
        events = run("pool please")
        elapsed = time.perf_counter() - started
    order = [e["data"]["index"] for e in events if e["event"] == "scene"]
    assert events[-1]["event"] == "done"
    assert order[0] == 0 and order.index(2) < order.index(1) and order.index(3) < order.index(1)
    # One at a time: 0.3 + 1.0 + 0.3 + 0.3 = 1.9 s. In the pool: 0.3, then the slowest of 1-3 = 1.3 s.
    assert elapsed < 1.7, elapsed


def test_go_deeper_appends_parts_to_the_lesson_it_is_given():
    stack, _ = overrides(route(focus="deeper-test"), plan_from(QUICK), QUICK["scenes"])
    with stack:
        lesson = Lesson.model_validate(run("deeper please")[-1]["data"]["lesson"])

    # Two more parts: a scrolly scene that revisits the weights, and a closing check on a new key point.
    weights = copy.deepcopy(SCENE["weights"])
    weights["steps"][0]["covers"] = ["kp-rows"]
    check = copy.deepcopy(SCENE["check"]) | {"id": "check-2", "title": "Check the deeper parts"}
    check["blocks"] = [b for b in check["blocks"] if b["type"] == "predict"]
    more = {
        "keyPoints": [{"id": "kp-rows", "text": "Each token's row of weights is its own budget.", "sources": ["vaswani"]}],
        "misconceptions": [{"id": "rows-shared", "text": "All tokens share one row of weights."}],
        "sources": [], "terms": [],
        "scenes": [
            {"id": "weights", "layout": "scrolly", "title": weights["title"], "widget": "Matrix", "purpose": "x", "covers": ["kp-rows"]},
            {"id": "sharpness", "layout": "scrolly", "title": SCENE["sharpness"]["title"], "widget": "FunctionPlot", "purpose": "x", "covers": []},
            {"id": "check-2", "layout": "stack", "title": check["title"], "widget": None, "purpose": "x", "covers": []},
        ],
    }
    n = len(QUICK["scenes"])
    p, _ = scripted(more)
    w, wf = by_scene([*QUICK["scenes"], weights, SCENE["sharpness"], check])
    with agents.planner.override(model=p), agents.writer.override(model=w):
        events = asyncio.run(_collect(deepen(lesson)))
    assert events[-1]["event"] == "done", events[-1]
    plan = next(e["data"] for e in events if e["event"] == "plan")
    assert [o["id"] for o in plan["outline"]] == [*(s["id"] for s in QUICK["scenes"]), "weights", "sharpness", "check-2"]
    assert sorted(e["data"]["index"] for e in events if e["event"] == "scene") == [n, n + 1, n + 2]
    assert wf.calls == 3  # only the new parts are written
    extended = events[-1]["data"]["lesson"]
    assert [s["id"] for s in extended["scenes"]][-3:] == ["weights", "sharpness", "check-2"]
    assert {k["id"] for k in extended["keyPoints"]} >= {"kp-rows", "kp-qkv"}


async def _collect(gen):
    return [e async for e in gen]


def test_go_deeper_rejects_reused_ids():
    """The planner must not reuse ids from the lesson it extends; the retry message says which."""
    stack, _ = overrides(route(focus="deeper-ids"), plan_from(QUICK), QUICK["scenes"])
    with stack:
        lesson = Lesson.model_validate(run("deeper ids please")[-1]["data"]["lesson"])
    reused = {"keyPoints": QUICK["keyPoints"][:1], "misconceptions": QUICK["misconceptions"][:1], "sources": [], "terms": [],
              "scenes": [{"id": "pipeline", "layout": "scrolly", "title": "t", "widget": "Diagram", "purpose": "x", "covers": [QUICK["keyPoints"][0]["id"]]},
                         {"id": "more", "layout": "scrolly", "title": "t", "widget": "Diagram", "purpose": "x", "covers": []},
                         {"id": "check", "layout": "stack", "title": "t", "widget": None, "purpose": "x", "covers": []}]}
    seen = []
    _, pf = scripted(reused, reused, reused, reused)
    with agents.planner.override(model=FunctionModel(_spy(pf, seen))):
        events = asyncio.run(_collect(deepen(lesson)))
    assert events[-1]["event"] == "error"
    assert any("already used by the lesson" in m for m in seen)



def test_go_deeper_api_takes_the_lesson_in_the_body():
    stack, _ = overrides(route(focus="deeper-api"), plan_from(QUICK), QUICK["scenes"])
    with stack, TestClient(app) as client:
        r = client.post("/lessons/deeper", json={"lesson": {"not": "a lesson"}})
        assert r.status_code == 422  # validated before any model call


def test_a_plan_thinner_than_a_lesson_is_sent_back():
    """Fewer than 3 parts or 2 key points is a short answer, not a lesson: the planner must retry."""
    thin = plan_from(QUICK) | {"keyPoints": QUICK["keyPoints"][:1]}
    thin["scenes"] = [s | {"covers": [QUICK["keyPoints"][0]["id"]] if s["layout"] == "scrolly" else []} for s in thin["scenes"]]
    seen = []
    _, pf = scripted(thin, plan_from(QUICK))
    stack, _ = overrides(route(focus="thin-test"), None, QUICK["scenes"])
    with stack, agents.planner.override(model=FunctionModel(_spy(pf, seen))):
        events = run("thin please")
    assert events[-1]["event"] == "done" and pf.calls == 2
    assert any("not a short answer" in m for m in seen)
