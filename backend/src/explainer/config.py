"""Every setting read from the environment, in one place, typed and checked on import.

The package __init__ loads the repo-root .env into os.environ first (pydantic-ai reads OPENROUTER_API_KEY from
there too), so Settings only reads the environment. Field names match the variables, case-insensitively.
"""

from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    # Models come from env so evals can swap them. Router: fast, and only classifies. Planner and writer: the
    # cheaper and open models tried (gpt-oss, GLM, Gemini, DeepSeek, Qwen, Claude Haiku) failed the lesson format.
    router_model: str = "openrouter:openai/gpt-oss-120b:nitro"
    planner_model: str = "openrouter:anthropic/claude-sonnet-5.5"
    writer_model: str = "openrouter:anthropic/claude-sonnet-5.5"

    # Scenes after the first are written this many at a time.
    parallel_scenes: int = Field(3, ge=1)
    lessons_per_day: int = Field(20, ge=1)
    # FRONTEND_ORIGIN, comma-separated.
    frontend_origin: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("frontend_origin", mode="before")
    @classmethod
    def _split(cls, v):
        return v.split(",") if isinstance(v, str) else v


settings = Settings()
