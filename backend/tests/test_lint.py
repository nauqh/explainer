import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from explainer.lesson import Lesson
from explainer.lint import lint_lesson

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic.json"
RAW = json.loads(FIXTURE.read_text(encoding="utf-8"))

# Scene indices in the fixture.
DIAGRAM, MATRIX, BARS, PLOT, CLOUD, SEQUENCE, COMPARE, EXPLORE, STACK = range(9)


def lint(raw: dict):
    return lint_lesson(Lesson.model_validate(raw))


def test_fixture_round_trips():
    text = FIXTURE.read_text(encoding="utf-8")
    assert Lesson.model_validate_json(text).model_dump_json(indent=2) + "\n" == text


def test_fixture_is_clean():
    assert [str(i) for i in lint(RAW)] == []


def _break(raw, rule):
    s = raw["scenes"]
    match rule:
        case "state-keys":
            del s[DIAGRAM]["state"]["focus"]
        case "state-values":
            s[DIAGRAM]["steps"][1]["set"]["visible"] = 99
        case "one-change":
            s[DIAGRAM]["steps"][4]["set"] = {"focus": "proj"}  # visible drops 7 -> 1 as well
        case "word-cap":
            s[DIAGRAM]["steps"][0]["text"] = "word " * 81
        case "scene-length":
            del s[COMPARE]["steps"][1:]
        case "step-does-work":
            s[BARS]["steps"][2] |= {"set": {"view": "probs"}, "annotate": []}  # same picture as the step before
        case "typed-number":
            s[BARS]["steps"][1]["text"] += " That is 0.55."
        case "refs":
            s[DIAGRAM]["steps"][0]["text"] += " [[term:nope|nope]] {fact:nope}"
            s[BARS]["steps"][0]["annotate"] = [{"anchor": "nope", "text": "x"}]
        case "citations":
            raw["keyPoints"][0]["sources"] = []
        case "coverage":
            raw["keyPoints"].append({"id": "kp-extra", "text": "Untaught.", "sources": ["vaswani"]})
        case "terms-first":
            raw["terms"].append({"id": "token", "label": "token", "definition": "A piece of text."})
            s[SEQUENCE]["steps"][0]["text"] += " Each [[term:token|token]] does this."
        case "check-answer":
            s[STACK]["blocks"][2]["answer"] = 5
        case "misconception":
            s[STACK]["blocks"][2]["misconception"] = "nope"
        case "unique-ids":
            s[MATRIX]["id"] = s[DIAGRAM]["id"]
        case "terms-unused":
            raw["terms"].append({"id": "unused", "label": "unused", "definition": "Never linked."})
    return raw


RULES = [
    "state-keys", "state-values", "one-change", "word-cap", "scene-length", "step-does-work", "typed-number", "refs", "citations", "coverage",
    "terms-first", "check-answer", "misconception", "unique-ids", "terms-unused",
]


@pytest.mark.parametrize("rule", RULES)
def test_each_rule_catches_its_break(rule):
    issues = lint(_break(copy.deepcopy(RAW), rule))
    assert {i.rule for i in issues} == {rule}, [str(i) for i in issues]


@pytest.mark.parametrize(
    "expression",
    ["x ** 2", "__import__('os')", "x.real", "y + 1", "exp", "[x]", "x if t else 1", "lambda: 1", "True + x", "'a'"],
)
def test_function_plot_rejects_expressions_outside_the_grammar(expression):
    raw = copy.deepcopy(RAW)
    raw["scenes"][PLOT]["visual"]["props"]["expression"] = expression
    with pytest.raises(ValidationError):
        Lesson.model_validate(raw)


@pytest.mark.parametrize("expression", ["-x^2 + t", "max(0, x)", "1 / (1 + exp(-x / t))", "2^x^t", "tanh(x) * 3.5"])
def test_function_plot_accepts_the_grammar(expression):
    raw = copy.deepcopy(RAW)
    raw["scenes"][PLOT]["visual"]["props"]["expression"] = expression
    Lesson.model_validate(raw)


def test_point_cloud_model_must_fit_its_data():
    raw = copy.deepcopy(RAW)
    raw["scenes"][CLOUD]["visual"]["props"]["model"] = "knn"  # a classifier on regression data
    with pytest.raises(ValidationError, match="classifies"):
        Lesson.model_validate(raw)


def test_point_cloud_facts_and_state_depend_on_the_model():
    raw = copy.deepcopy(RAW)
    raw["scenes"][CLOUD]["steps"][1]["text"] += " {fact:trainAccuracy}"  # a classifier fact on a regression
    raw["scenes"][CLOUD]["steps"][2]["set"]["k"] = 3  # a knn key on a polynomial
    issues = {str(i) for i in lint(raw)}
    assert any("trainAccuracy" in i and "[refs]" in i for i in issues), issues
    assert any("does not read 'k'" in i for i in issues), issues
