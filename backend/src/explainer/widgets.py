"""The widget catalog: what the model may put in a scene's `visual`.

Each widget is one Visual subclass. Its `props` are what the model configures; `state_spec`
and `parts` say which state keys it reads and which parts steps may highlight. The React
component and its `describe()` live in the frontend under the same widget name.
"""

import ast
from typing import Annotated, ClassVar, Literal

from pydantic import Field, model_validator

from .base import Id, Model, OneOf, Range, StateSpec


class Visual(Model):
    kind: ClassVar[Literal["structure", "process", "playground", "chart"]]
    description: ClassVar[str]

    def state_spec(self) -> dict[str, StateSpec]:
        raise NotImplementedError

    def parts(self) -> set[str]:
        raise NotImplementedError


def _unique(ids: list[str], what: str) -> None:
    seen = set()
    for i in ids:
        if i in seen:
            raise ValueError(f"{what} id '{i}' is used twice; ids must be unique")
        seen.add(i)


# Diagram


class Node(Model):
    id: Id
    label: str = Field(max_length=40)
    group: Id | None = None


class Edge(Model):
    id: Id
    from_: Id = Field(alias="from")
    to: Id
    label: str | None = Field(default=None, max_length=40)


class Group(Model):
    id: Id
    label: str = Field(max_length=40)


class DiagramProps(Model):
    nodes: list[Node] = Field(min_length=2, max_length=12)
    edges: list[Edge] = Field(default_factory=list, max_length=20)
    groups: list[Group] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def _refs(self):
        _unique([n.id for n in self.nodes] + [e.id for e in self.edges] + [g.id for g in self.groups], "diagram")
        nodes = {n.id for n in self.nodes}
        groups = {g.id for g in self.groups}
        for e in self.edges:
            for end in (e.from_, e.to):
                if end not in nodes:
                    raise ValueError(f"edge '{e.id}' points at '{end}', which is not a node")
        for n in self.nodes:
            if n.group is not None and n.group not in groups:
                raise ValueError(f"node '{n.id}' is in group '{n.group}', which is not a group")
        return self


class DiagramVisual(Visual):
    kind = "structure"
    description = (
        "Boxes and arrows: components and how they connect (architectures, pipelines, roles). "
        "Nodes are revealed in list order up to `visible`; `focus` emphasises one node or group. "
        "Reveal nodes one step at a time to build the picture up."
    )
    widget: Literal["Diagram"]
    props: DiagramProps

    def state_spec(self):
        ids = [n.id for n in self.props.nodes] + [g.id for g in self.props.groups]
        return {
            "visible": Range(1, len(self.props.nodes), integer=True),
            "focus": OneOf((*ids, None)),
        }

    def parts(self):
        p = self.props
        return {n.id for n in p.nodes} | {e.id for e in p.edges} | {g.id for g in p.groups}


# Sequence


class Actor(Model):
    id: Id
    label: str = Field(max_length=30)


class Message(Model):
    id: Id
    from_: Id = Field(alias="from")
    to: Id
    text: str = Field(max_length=80)


class SequenceProps(Model):
    actors: list[Actor] = Field(min_length=2, max_length=6)
    messages: list[Message] = Field(min_length=1, max_length=16)

    @model_validator(mode="after")
    def _refs(self):
        _unique([a.id for a in self.actors] + [m.id for m in self.messages], "sequence")
        actors = {a.id for a in self.actors}
        for m in self.messages:
            for end in (m.from_, m.to):
                if end not in actors:
                    raise ValueError(f"message '{m.id}' involves '{end}', which is not an actor")
        return self


class SequenceVisual(Visual):
    kind = "process"
    description = (
        "Who sends what to whom, in order, as a sequence diagram. Messages are text only. "
        "`upTo` reveals every message up to and including that message id."
    )
    widget: Literal["Sequence"]
    props: SequenceProps

    def state_spec(self):
        return {"upTo": OneOf(tuple(m.id for m in self.props.messages))}

    def parts(self):
        return {a.id for a in self.props.actors} | {m.id for m in self.props.messages}


# Compare


class Column(Model):
    id: Id
    title: str = Field(max_length=30)


class Row(Model):
    label: str = Field(max_length=30)
    cells: list[str]


class CompareProps(Model):
    columns: list[Column] = Field(min_length=2, max_length=4)
    rows: list[Row] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def _shape(self):
        _unique([c.id for c in self.columns], "column")
        for r in self.rows:
            if len(r.cells) != len(self.columns):
                raise ValueError(f"row '{r.label}' has {len(r.cells)} cells; it needs one per column ({len(self.columns)})")
        return self


class CompareVisual(Visual):
    kind = "structure"
    description = (
        "A side-by-side table comparing 2 to 4 options across a few rows. "
        "`highlight` emphasises one column, or none."
    )
    widget: Literal["Compare"]
    props: CompareProps

    def state_spec(self):
        return {"highlight": OneOf((*(c.id for c in self.props.columns), None))}

    def parts(self):
        return {c.id for c in self.props.columns}


# FunctionPlot

FUNCTIONS = {"exp", "log", "sqrt", "abs", "sin", "cos", "tanh", "max", "min"}
_EXPR_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Call, ast.Name, ast.Constant, ast.Load,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.USub, ast.UAdd,
)


def check_expression(expression: str, names: set[str]) -> None:
    """Raise ValueError unless the expression uses only the whitelisted grammar.

    Grammar: numbers, the given names, + - * / ^, unary minus, parentheses and calls to FUNCTIONS.
    """
    if "**" in expression:
        raise ValueError("use ^ for powers, not **")
    try:
        tree = ast.parse(expression.replace("^", "**"), mode="eval")
    except SyntaxError:
        raise ValueError(f"expression '{expression}' does not parse") from None
    called = set()
    for node in ast.walk(tree):
        if not isinstance(node, _EXPR_NODES):
            raise ValueError(f"expression '{expression}' uses something outside the grammar ({type(node).__name__})")  # noqa: TRY004 - pydantic only converts ValueError
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS or node.keywords:
                raise ValueError(f"expression '{expression}' calls an unknown function; allowed: {', '.join(sorted(FUNCTIONS))}")
            called.add(id(node.func))
        elif isinstance(node, ast.Name) and id(node) not in called and node.id not in names:
            raise ValueError(f"expression '{expression}' uses '{node.id}', which is not x or a declared parameter")
        elif isinstance(node, ast.Constant) and (isinstance(node.value, bool) or not isinstance(node.value, int | float)):
            raise ValueError(f"expression '{expression}' contains a non-number constant")


class Axis(Model):
    label: str = Field(max_length=30)
    min: float
    max: float

    @model_validator(mode="after")
    def _order(self):
        if self.min >= self.max:
            raise ValueError(f"axis '{self.label}' needs min < max")
        return self


class Param(Model):
    name: str = Field(pattern=r"^[a-wyz][A-Za-z0-9]*$", description="An identifier other than x.")
    label: str = Field(max_length=30)
    min: float
    max: float

    @model_validator(mode="after")
    def _order(self):
        if self.min >= self.max:
            raise ValueError(f"parameter '{self.name}' needs min < max")
        return self


class FunctionPlotProps(Model):
    expression: str = Field(max_length=200, description="y as a function of x and the parameters, e.g. 'a * x^2 + b'.")
    x: Axis
    y: Axis | None = Field(default=None, description="Omit to fit the y axis to the curve.")
    params: list[Param] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def _expression(self):
        names = [p.name for p in self.params]
        _unique(names, "parameter")
        if set(names) & FUNCTIONS:
            raise ValueError("a parameter cannot be named after a function")
        check_expression(self.expression, {"x", *names})
        return self


class FunctionPlotVisual(Visual):
    kind = "chart"
    description = (
        "A curve y = f(x) that the browser computes from `expression`. "
        "Grammar: numbers, x, declared parameters, + - * / ^, parentheses, "
        f"and {', '.join(sorted(FUNCTIONS))}. Each parameter is a state key within its range. "
        "Never write plotted values yourself."
    )
    widget: Literal["FunctionPlot"]
    props: FunctionPlotProps

    def state_spec(self):
        return {p.name: Range(p.min, p.max) for p in self.props.params}

    def parts(self):
        return {"curve", "x-axis", "y-axis"}


# Matrix


class SoftmaxRecipe(Model):
    recipe: Literal["softmax"]
    rows: list[str] = Field(min_length=1, max_length=8)
    cols: list[str] = Field(min_length=2, max_length=8)
    scores: list[list[float]] = Field(description="Raw scores, one row per row label; each row is softmaxed.")

    @model_validator(mode="after")
    def _shape(self):
        if len(self.scores) != len(self.rows) or any(len(r) != len(self.cols) for r in self.scores):
            raise ValueError(f"scores must be {len(self.rows)} rows of {len(self.cols)} numbers")
        return self


class Vector(Model):
    label: str = Field(max_length=20)
    values: list[float] = Field(min_length=1, max_length=8)


class DotProductRecipe(Model):
    recipe: Literal["dot-product"]
    rows: list[Vector] = Field(min_length=1, max_length=8)
    cols: list[Vector] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def _shape(self):
        dims = {len(v.values) for v in self.rows + self.cols}
        if len(dims) != 1:
            raise ValueError("all vectors must have the same length")
        return self


class ConfusionRecipe(Model):
    recipe: Literal["confusion"]
    classes: list[str] = Field(min_length=2, max_length=6)
    actual: list[int] = Field(min_length=1, max_length=200, description="Class index per example.")
    predicted: list[int] = Field(min_length=1, max_length=200, description="Class index per example.")

    @model_validator(mode="after")
    def _shape(self):
        if len(self.actual) != len(self.predicted):
            raise ValueError("actual and predicted must have the same length")
        if any(not 0 <= i < len(self.classes) for i in self.actual + self.predicted):
            raise ValueError(f"class indices must be 0 to {len(self.classes) - 1}")
        return self


MatrixProps = Annotated[SoftmaxRecipe | DotProductRecipe | ConfusionRecipe, Field(discriminator="recipe")]


class MatrixVisual(Visual):
    kind = "structure"
    description = (
        "A grid whose cell values the browser computes from a recipe: 'softmax' (rows of raw scores, "
        "each row softmaxed, e.g. attention weights), 'dot-product' (row vectors times column vectors, "
        "e.g. similarity) or 'confusion' (counts of actual vs predicted class). "
        "`selected` emphasises one cell, id 'cell-<row>-<col>' with 0-based indices, or none. "
        "Never write computed cell values yourself."
    )
    widget: Literal["Matrix"]
    props: MatrixProps

    def _shape(self) -> tuple[int, int]:
        p = self.props
        if isinstance(p, ConfusionRecipe):
            return len(p.classes), len(p.classes)
        return len(p.rows), len(p.cols)

    def state_spec(self):
        r, c = self._shape()
        return {"selected": OneOf((*(f"cell-{i}-{j}" for i in range(r) for j in range(c)), None))}

    def parts(self):
        r, c = self._shape()
        cells = {f"cell-{i}-{j}" for i in range(r) for j in range(c)}
        return cells | {f"row-{i}" for i in range(r)} | {f"col-{j}" for j in range(c)}


WIDGETS: list[type[Visual]] = [DiagramVisual, SequenceVisual, CompareVisual, FunctionPlotVisual, MatrixVisual]

AnyVisual = Annotated[
    DiagramVisual | SequenceVisual | CompareVisual | FunctionPlotVisual | MatrixVisual,
    Field(discriminator="widget"),
]
