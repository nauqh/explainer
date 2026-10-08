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
    # Values the widget computes that step text may print with {fact:<name>}.
    facts: ClassVar[tuple[str, ...]] = ()

    def fact_names(self) -> tuple[str, ...]:
        """The facts this configuration computes; override when they depend on props."""
        return self.facts

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
    facts = ("selectedValue",)
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


# Distribution


class DistributionProps(Model):
    labels: list[str] = Field(min_length=2, max_length=12, description="One per option, e.g. candidate next tokens.")
    logits: list[float] = Field(description="Illustrative raw scores, one per label. The browser computes probabilities.")
    target: int | None = Field(default=None, description="Index of the correct label, for cross-entropy. Optional.")

    @model_validator(mode="after")
    def _shape(self):
        if len(self.logits) != len(self.labels):
            raise ValueError(f"logits must have one number per label ({len(self.labels)})")
        if len(set(self.labels)) != len(self.labels):
            raise ValueError("labels must be unique")
        if any(len(label) > 24 for label in self.labels):
            raise ValueError("keep each label to 24 characters")
        if self.target is not None and not 0 <= self.target < len(self.labels):
            raise ValueError(f"target must be a label index, 0 to {len(self.labels) - 1}")
        return self


class DistributionVisual(Visual):
    kind = "chart"
    description = (
        "Bars of a probability distribution over a few options (next tokens, classes, attention targets), "
        "computed in the browser as softmax(logits / temperature). Bars stay in logit order; only their lengths "
        "change. `view` shows raw 'logits' or 'probs'. `topK` and `topP` fade the bars that sampling would drop "
        "and draw a cutoff line. Parts: 'bar-<i>' (0-based label index), 'cutoff', 'target'. "
        "Use it for softmax, temperature, top-k, top-p, greedy vs sampling, classifier outputs, cross-entropy."
    )
    facts = ("topLabel", "topProb", "entropy", "kept", "targetProb", "crossEntropy")
    widget: Literal["Distribution"]
    props: DistributionProps

    def state_spec(self):
        n = len(self.props.labels)
        return {
            "view": OneOf(("probs", "logits")),
            "temperature": Range(0.05, 5),
            "topK": Range(1, n, integer=True),
            "topP": Range(0.05, 1),
        }

    def parts(self):
        bars = {f"bar-{i}" for i in range(len(self.props.labels))}
        return bars | {"cutoff"} | ({"target"} if self.props.target is not None else set())


# PointCloud

REGRESSION = ("linear", "polynomial")
CLASSIFICATION = ("logistic", "knn")


class Dataset(Model):
    shape: Literal["blobs", "moons", "circles", "xor", "line", "curve"] = Field(
        description="blobs/moons/circles/xor are labelled classes; line/curve are regression data (classes 1)."
    )
    n: int = Field(ge=20, le=200, description="Number of points; a random quarter of them is held out as test data.")
    noise: float = Field(ge=0, le=1)
    classes: int = Field(ge=1, le=3, description="1 for line/curve; 2 for moons/circles/xor; 2 or 3 for blobs.")
    seed: int = Field(ge=0, description="Same seed, same points, for every learner.")

    @model_validator(mode="after")
    def _classes(self):
        need = {"line": (1,), "curve": (1,), "moons": (2,), "circles": (2,), "xor": (2,), "blobs": (2, 3)}[self.shape]
        if self.classes not in need:
            raise ValueError(f"shape '{self.shape}' needs classes {' or '.join(map(str, need))}")
        return self


class PointCloudProps(Model):
    dataset: Dataset
    x_label: str = Field(max_length=30)
    y_label: str = Field(max_length=30)
    class_labels: list[str] = Field(default_factory=list, description="One short name per class, e.g. ['spam', 'not spam'].")
    model: Literal["none", "linear", "polynomial", "logistic", "knn", "kmeans"]

    @model_validator(mode="after")
    def _fits(self):
        d = self.dataset
        if self.model in REGRESSION and d.classes != 1:
            raise ValueError(f"model '{self.model}' fits regression data: use shape 'line' or 'curve' with classes 1")
        if self.model in CLASSIFICATION and d.classes < 2:
            raise ValueError(f"model '{self.model}' classifies: use shape blobs, moons, circles or xor")
        if self.model == "logistic" and d.classes != 2:
            raise ValueError("logistic regression here separates exactly 2 classes")
        if self.model == "kmeans" and d.shape != "blobs":
            raise ValueError("kmeans needs shape 'blobs'")
        if self.class_labels and len(self.class_labels) != d.classes:
            raise ValueError(f"class_labels needs one name per class ({d.classes})")
        return self


class PointCloudVisual(Visual):
    kind = "chart"
    description = (
        "A scatter of seeded data points with a model fitted in the browser. `model`: 'linear' or 'polynomial' "
        "(regression on line/curve data, fitted on the training points), 'logistic' (2 classes, trained by "
        "gradient descent, one `iteration` per step), 'knn' (k nearest neighbours, shades the decision regions), "
        "'kmeans' (clusters blobs, centroids move with `iteration`), or 'none'. `show` builds the picture up: "
        "'points', then 'fit' (line, curve, regions or centroids), then 'errors' (residuals or misclassified "
        "points). `split` shows 'all' points, only 'train' or only held-out 'test' points. Use it for "
        "regression, classification, decision boundaries, overfitting and underfitting, bias-variance, train/test "
        "splits, kNN, k-means and gradient descent on a model. Parts: 'class-<i>', 'fit', 'errors', 'train', "
        "'test', 'centroid-<i>' (kmeans), 'axis-x', 'axis-y'. Overfitting is only visible with few points: for "
        "it use a 'curve' with n 20 to 24, noise 0.3 or more, and sweep degree from 1 (underfits) through 3 to 10-12 "
        "(overfits). With more points a high degree barely hurts test error. Facts by model: regression 'trainError', "
        "'testError'; logistic and knn 'trainAccuracy', 'testAccuracy', 'misclassified'; logistic also 'loss'; "
        "kmeans 'loss'."
    )
    facts = ("trainError", "testError", "trainAccuracy", "testAccuracy", "misclassified", "loss")
    widget: Literal["PointCloud"]
    props: PointCloudProps

    def fact_names(self):
        m = self.props.model
        if m in REGRESSION:
            return ("trainError", "testError")
        if m == "logistic":
            return ("trainAccuracy", "testAccuracy", "misclassified", "loss")
        if m == "knn":
            return ("trainAccuracy", "testAccuracy", "misclassified")
        if m == "kmeans":
            return ("loss",)
        return ()

    def state_spec(self):
        spec: dict[str, StateSpec] = {
            "show": OneOf(("points", "fit", "errors")),
            "split": OneOf(("all", "train", "test")),
        }
        m = self.props.model
        if m == "polynomial":
            spec["degree"] = Range(1, 12, integer=True)
        elif m == "logistic":
            spec["iteration"] = Range(0, 50, integer=True)
            spec["threshold"] = Range(0.05, 0.95)
        elif m == "knn":
            spec["k"] = Range(1, 25, integer=True)
        elif m == "kmeans":
            spec["k"] = Range(2, 6, integer=True)
            spec["iteration"] = Range(0, 10, integer=True)
        return spec

    def parts(self):
        p = {"fit", "errors", "train", "test", "axis-x", "axis-y"}
        p |= {f"class-{i}" for i in range(self.props.dataset.classes)}
        if self.props.model == "kmeans":
            p |= {f"centroid-{i}" for i in range(6)}
        return p


WIDGETS: list[type[Visual]] = [
    DiagramVisual, SequenceVisual, CompareVisual, FunctionPlotVisual, MatrixVisual, DistributionVisual, PointCloudVisual,
]

AnyVisual = Annotated[
    DiagramVisual | SequenceVisual | CompareVisual | FunctionPlotVisual | MatrixVisual | DistributionVisual | PointCloudVisual,
    Field(discriminator="widget"),
]
