"""Lint rules from PRD "Validation rules". The schema checks shape; these check meaning.

`lint_scene` runs the rules that only need one scene, so the scene writer can retry per scene.
`lint_lesson` runs every scene plus the lesson-level rules.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Literal

from .base import Range
from .lesson import Cards, ExploreScene, Lesson, Predict, Prose, ScrollyScene, Sort, StackScene

MARKUP = re.compile(r"\[\[(part|term|source):([^|\]]*)\|([^\]]*)\]\]")
VAR = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
FACT = re.compile(r"\{fact:([A-Za-z_][A-Za-z0-9_]*)\}")
# A number typed into text, outside markup and placeholders.
NUMBER = re.compile(r"(?<![\w.])\d+(?:\.\d+)?%?")
WORD_CAP = 80
MIN_STEPS = 3


@dataclass(frozen=True)
class Issue:
    rule: str
    path: str
    message: str
    level: Literal["error", "warn"] = "error"

    def __str__(self) -> str:
        return f"{self.path}: {self.message} [{self.rule}]"


def _texts(scene, path: str) -> Iterator[tuple[str, str]]:
    """Every piece of learner-facing text in a scene that may carry markup."""
    match scene:
        case ScrollyScene():
            for j, s in enumerate(scene.steps):
                yield f"{path}.steps[{j}].text", s.text
        case ExploreScene():
            yield f"{path}.task", scene.task
        case StackScene():
            for j, b in enumerate(scene.blocks):
                bp = f"{path}.blocks[{j}]"
                match b:
                    case Prose():
                        yield f"{bp}.text", b.text
                    case Cards():
                        for k, c in enumerate(b.items):
                            yield f"{bp}.items[{k}].title", c.title
                            yield f"{bp}.items[{k}].body", c.body
                    case Predict() | Sort():
                        for f in ("question", "hint", "explanation"):
                            yield f"{bp}.{f}", getattr(b, f)


def _words(text: str) -> int:
    return len(MARKUP.sub(lambda m: m.group(3), text).split())


def _typed_numbers(text: str) -> list[str]:
    plain = re.sub(r"\{[^}]*\}", "", MARKUP.sub(lambda m: m.group(3), text))
    return NUMBER.findall(plain)


def linked_terms(scene) -> set[str]:
    return {m.group(2) for _, t in _texts(scene, "") for m in MARKUP.finditer(t) if m.group(1) == "term"}


def lint_scene(lesson: Lesson, i: int) -> list[Issue]:
    scene = lesson.scenes[i]
    path = f"scenes[{i}]"
    issues: list[Issue] = []
    add = lambda rule, p, msg: issues.append(Issue(rule, p, msg))

    terms = {t.id for t in lesson.terms}
    sources = {s.id for s in lesson.sources}
    key_points = {k.id for k in lesson.key_points}
    misconceptions = {m.id for m in lesson.misconceptions}

    visual = getattr(scene, "visual", None)
    spec = visual.state_spec() if visual else {}
    parts = visual.parts() if visual else set()

    # state-keys / state-values
    if visual:
        for k in spec.keys() - scene.state.keys():
            add("state-keys", f"{path}.state", f"missing a default for '{k}'; {visual.widget} reads it")
        for k, v in scene.state.items():
            if k not in spec:
                add("state-keys", f"{path}.state.{k}", f"{visual.widget} does not read '{k}'; it reads {', '.join(spec) or 'nothing'}")
            elif not spec[k].accepts(v):
                add("state-values", f"{path}.state.{k}", f"{v!r} is not valid; '{k}' must be {spec[k]}")

    if isinstance(scene, ScrollyScene):
        if len(scene.steps) < MIN_STEPS:
            add("scene-length", f"{path}.steps", f"{len(scene.steps)} steps; a scrolly scene needs {MIN_STEPS} to 8 so the picture can build up")
        prev = dict(scene.state)
        prev_highlight: set[str] | None = None
        for j, step in enumerate(scene.steps):
            sp = f"{path}.steps[{j}]"
            for k, v in step.set_.items():
                if k not in spec:
                    add("state-keys", f"{sp}.set.{k}", f"{visual.widget} does not read '{k}'; it reads {', '.join(spec) or 'nothing'}")
                elif not spec[k].accepts(v):
                    add("state-values", f"{sp}.set.{k}", f"{v!r} is not valid; '{k}' must be {spec[k]}")
            # one-change: compare with the previous step's full state, since state is not accumulated
            cur = {**scene.state, **step.set_}
            changed = [k for k in spec if cur.get(k) != prev.get(k)]
            if len(changed) > 1:
                add("one-change", f"{sp}.set", f"changes {len(changed)} things at once ({', '.join(changed)}); split into steps")
            if prev_highlight is not None and not changed and set(step.highlight) == prev_highlight and not step.annotate:
                add("step-does-work", sp, "nothing on screen changes in this step; change one state key, highlight a different part, or add an annotation")
            prev, prev_highlight = cur, set(step.highlight)
            if visual.fact_names() and (nums := _typed_numbers(step.text)):
                issues.append(Issue("typed-number", f"{sp}.text", f"typed numbers ({', '.join(nums[:4])}); quote computed values with {{fact:name}} or state with {{key}}", "warn"))
            for a in step.annotate:
                if a.anchor not in parts:
                    add("refs", f"{sp}.annotate", f"annotation anchor '{a.anchor}' is not a part of this {visual.widget}")
                if MARKUP.search(a.text):
                    add("refs", f"{sp}.annotate", "notes are plain text; use [[...]] links in the step text instead")
                for m in VAR.finditer(a.text):
                    if m.group(1) not in spec:
                        add("refs", f"{sp}.annotate", f"'{{{m.group(1)}}}' is not a state key of this scene's widget")
                for m in FACT.finditer(a.text):
                    if m.group(1) not in visual.fact_names():
                        add("refs", f"{sp}.annotate", f"'{{fact:{m.group(1)}}}' is not a fact of this scene's widget")
            if (n := _words(step.text)) > WORD_CAP:
                add("word-cap", f"{sp}.text", f"{n} words; keep a step to {WORD_CAP} or fewer")
            for h in step.highlight:
                if h not in parts:
                    add("refs", f"{sp}.highlight", f"'{h}' is not a part of this {visual.widget}")
            for c in step.covers:
                if c not in key_points:
                    add("refs", f"{sp}.covers", f"'{c}' is not a key point id")

    if isinstance(scene, ExploreScene):
        for j, c in enumerate(scene.controls):
            cp = f"{path}.controls[{j}]"
            s = spec.get(c.key)
            if s is None:
                add("state-keys", f"{cp}.key", f"{visual.widget} does not read '{c.key}'; it reads {', '.join(spec) or 'nothing'}")
            elif c.kind == "slider":
                if not isinstance(s, Range):
                    add("state-values", cp, f"'{c.key}' is not numeric; use a select control")
                elif not (s.lo <= c.min < c.max <= s.hi):
                    add("state-values", cp, f"slider range must sit inside {s} with min < max")
            else:
                for o in c.options:
                    if not s.accepts(o):
                        add("state-values", f"{cp}.options", f"{o!r} is not valid; '{c.key}' must be {s}")

    if isinstance(scene, StackScene):
        for j, b in enumerate(scene.blocks):
            bp = f"{path}.blocks[{j}]"
            for c in getattr(b, "covers", []):
                if c not in key_points:
                    add("refs", f"{bp}.covers", f"'{c}' is not a key point id")
            if isinstance(b, Predict) and not 0 <= b.answer < len(b.options):
                add("check-answer", f"{bp}.answer", f"answer {b.answer} is not an option index (0 to {len(b.options) - 1})")
            if isinstance(b, Sort):
                if len(b.answer) != len(b.items):
                    add("check-answer", f"{bp}.answer", f"needs one bucket per item ({len(b.items)}), got {len(b.answer)}")
                elif any(not 0 <= a < len(b.buckets) for a in b.answer):
                    add("check-answer", f"{bp}.answer", f"bucket indices must be 0 to {len(b.buckets) - 1}")
            if isinstance(b, Predict | Sort) and b.misconception not in misconceptions:
                add("misconception", f"{bp}.misconception", f"'{b.misconception}' is not a misconception id in the lesson")

    # refs in text markup
    for tp, text in _texts(scene, path):
        for m in MARKUP.finditer(text):
            kind, ref = m.group(1), m.group(2)
            if kind == "part":
                if not visual:
                    add("refs", tp, f"part link '{ref}' in a stack scene; stack scenes have no widget to link to")
                elif ref not in parts:
                    add("refs", tp, f"part '{ref}' is not a part of this {visual.widget}")
            elif kind == "term" and ref not in terms:
                add("refs", tp, f"term '{ref}' is not defined in terms")
            elif kind == "source" and ref not in sources:
                add("refs", tp, f"source '{ref}' is not in sources")
        for m in VAR.finditer(text):
            if m.group(1) not in spec:
                add("refs", tp, f"'{{{m.group(1)}}}' is not a state key of this scene's widget")
        for m in FACT.finditer(text):
            if not visual or m.group(1) not in visual.fact_names():
                facts = ", ".join(visual.fact_names()) if visual and visual.fact_names() else "none"
                add("refs", tp, f"'{{fact:{m.group(1)}}}' is not a fact of this scene's widget (facts: {facts})")

    return issues


def lint_lesson(lesson: Lesson) -> list[Issue]:
    issues = [x for i in range(len(lesson.scenes)) for x in lint_scene(lesson, i)]
    add = lambda rule, p, msg, level="error": issues.append(Issue(rule, p, msg, level))

    # unique-ids
    groups = {
        "scene": [(f"scenes[{i}].id", s.id) for i, s in enumerate(lesson.scenes)],
        "step": [
            (f"scenes[{i}].steps[{j}].id", st.id)
            for i, s in enumerate(lesson.scenes) if isinstance(s, ScrollyScene)
            for j, st in enumerate(s.steps)
        ],
        "key point": [(f"keyPoints[{i}].id", k.id) for i, k in enumerate(lesson.key_points)],
        "misconception": [(f"misconceptions[{i}].id", m.id) for i, m in enumerate(lesson.misconceptions)],
        "term": [(f"terms[{i}].id", t.id) for i, t in enumerate(lesson.terms)],
        "source": [(f"sources[{i}].id", s.id) for i, s in enumerate(lesson.sources)],
    }
    for what, items in groups.items():
        seen = set()
        for p, v in items:
            if v in seen:
                add("unique-ids", p, f"{what} id '{v}' is used twice")
            seen.add(v)

    # citations
    source_ids = {s.id for s in lesson.sources}
    if lesson.time_sensitive and not lesson.sources:
        add("citations", "sources", "a time-sensitive lesson needs at least one source")
    for i, k in enumerate(lesson.key_points):
        if lesson.time_sensitive and not k.sources:
            add("citations", f"keyPoints[{i}].sources", f"key point '{k.id}' needs a source because the lesson is time-sensitive")
        for s in k.sources:
            if s not in source_ids:
                add("refs", f"keyPoints[{i}].sources", f"'{s}' is not in sources")

    # coverage: only scrolly steps and stack blocks count, never explore scenes
    covered = set()
    for s in lesson.scenes:
        if isinstance(s, ScrollyScene):
            covered |= {c for st in s.steps for c in st.covers}
        elif isinstance(s, StackScene):
            covered |= {c for b in s.blocks for c in getattr(b, "covers", [])}
    for i, k in enumerate(lesson.key_points):
        if k.id not in covered:
            add("coverage", f"keyPoints[{i}]", f"key point '{k.id}' is not taught by any scrolly step or stack block")

    # terms-first
    introduced: set[str] = set()
    for i, s in enumerate(lesson.scenes):
        used = linked_terms(s)
        visual = getattr(s, "visual", None)
        if visual and visual.kind in ("process", "playground"):
            for t in sorted(used - introduced):
                # A warning: scenes written in parallel cannot see which sibling introduces a term,
                # and the glossary popover explains a term wherever it first appears.
                issues.append(Issue("terms-first", f"scenes[{i}]", f"term '{t}' is first used in a {visual.kind} scene; introduce it in an earlier scene", "warn"))
        introduced |= used

    # terms-unused
    for i, t in enumerate(lesson.terms):
        if t.id not in introduced:
            add("terms-unused", f"terms[{i}]", f"term '{t.id}' is defined but never linked", "warn")

    return issues
