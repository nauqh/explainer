"""Shared pieces of the lesson schema: the base model, ids, state values and state specs."""

from dataclasses import dataclass
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    """camelCase on the wire, no unknown fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        extra="forbid",
        # Fields with defaults are always present in what the backend sends,
        # so the generated TS types mark them required.
        json_schema_serialization_defaults_required=True,
    )


# Ids appear inside [[part:<id>|label]] markup, so no spaces, pipes or brackets.
Id = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$", max_length=64)]

StateValue = bool | int | float | str | None
State = dict[str, StateValue]


@dataclass(frozen=True)
class OneOf:
    """A state key that takes one of a fixed set of values."""

    values: tuple[StateValue, ...]

    def accepts(self, value: StateValue) -> bool:
        # Compare types too: in Python True == 1.
        return any(v == value and type(v) is type(value) for v in self.values)

    def __str__(self) -> str:
        return "one of " + ", ".join("null" if v is None else repr(v) for v in self.values)


@dataclass(frozen=True)
class Range:
    """A numeric state key between lo and hi inclusive."""

    lo: float
    hi: float
    integer: bool = False

    def accepts(self, value: StateValue) -> bool:
        if isinstance(value, bool) or not isinstance(value, int | float):
            return False
        if self.integer and value != int(value):
            return False
        return self.lo <= value <= self.hi

    def __str__(self) -> str:
        kind = "an integer" if self.integer else "a number"
        return f"{kind} from {self.lo:g} to {self.hi:g}"


StateSpec = OneOf | Range
