"""The lesson format the model returns and the frontend renders (schema version 0.3)."""

from typing import Annotated, Literal

from pydantic import Field

from .base import Id, Model, State, StateValue
from .widgets import AnyVisual


class KeyPoint(Model):
    id: Id
    text: str
    sources: list[Id] = Field(default_factory=list, description="Source ids; required when the lesson is time-sensitive.")


class Misconception(Model):
    id: Id
    text: str


class Source(Model):
    id: Id
    title: str
    url: str = Field(pattern=r"^https?://")


class Term(Model):
    id: Id
    label: str
    definition: str


class Annotation(Model):
    anchor: Id = Field(description="A part id of the scene's widget; the note is drawn next to it.")
    text: str = Field(max_length=60, description="Plain text; may print {fact:name} or {stateKey}.")


class Step(Model):
    id: Id
    text: str = Field(
        description="30 to 80 words, one idea. Markup: [[part:id|label]], [[term:id|label]], [[source:id|label]], "
        "{stateKey} prints a state value, {fact:name} prints a value the widget computed."
    )
    set_: State = Field(default_factory=dict, alias="set", description="State changes on top of the scene defaults; not accumulated from earlier steps.")
    highlight: list[Id] = Field(default_factory=list, description="Widget part ids.")
    covers: list[Id] = Field(default_factory=list, description="Key point ids.")
    annotate: list[Annotation] = Field(default_factory=list, max_length=3, description="Short notes pinned to widget parts.")


class Slider(Model):
    kind: Literal["slider"]
    key: str
    label: str
    min: float
    max: float
    step: float | None = None


class Select(Model):
    kind: Literal["select"]
    key: str
    label: str
    options: list[StateValue] = Field(min_length=2)


Control = Annotated[Slider | Select, Field(discriminator="kind")]


class ScrollyScene(Model):
    layout: Literal["scrolly"]
    id: Id
    title: str
    visual: AnyVisual
    state: State = Field(description="Default value for every state key the widget reads.")
    steps: list[Step] = Field(min_length=1, max_length=8)


class ExploreScene(Model):
    layout: Literal["explore"]
    id: Id
    title: str
    visual: AnyVisual
    state: State = Field(description="Default value for every state key the widget reads.")
    controls: list[Control] = Field(default_factory=list)
    task: str


class Prose(Model):
    type: Literal["prose"]
    text: str
    covers: list[Id] = Field(default_factory=list)


class Card(Model):
    title: str
    body: str
    tag: str | None = None


class Cards(Model):
    type: Literal["cards"]
    items: list[Card] = Field(min_length=1, max_length=4)
    covers: list[Id] = Field(default_factory=list)


class Predict(Model):
    type: Literal["predict"]
    question: str
    options: list[str] = Field(min_length=2, max_length=5)
    answer: int = Field(description="Index into options.")
    hint: str
    explanation: str
    misconception: Id
    covers: list[Id] = Field(default_factory=list)


class Sort(Model):
    type: Literal["sort"]
    question: str
    items: list[str] = Field(min_length=2, max_length=8)
    buckets: list[str] = Field(min_length=2, max_length=4)
    answer: list[int] = Field(description="Bucket index for each item, in item order.")
    hint: str
    explanation: str
    misconception: Id
    covers: list[Id] = Field(default_factory=list)


Block = Annotated[Prose | Cards | Predict | Sort, Field(discriminator="type")]


class StackScene(Model):
    layout: Literal["stack"]
    id: Id
    title: str
    blocks: list[Block] = Field(min_length=1)


Scene = Annotated[ScrollyScene | ExploreScene | StackScene, Field(discriminator="layout")]


class Lesson(Model):
    schema_version: Literal["0.3"]
    question: str
    concept: Id
    focus: str
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    time_sensitive: bool
    key_points: list[KeyPoint] = Field(min_length=1)
    misconceptions: list[Misconception] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    terms: list[Term] = Field(default_factory=list)
    scenes: list[Scene] = Field(min_length=1)
