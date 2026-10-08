"""Write the lesson JSON Schema and the catalog prompt text into backend/schema/.

Run: uv run python -m explainer.export
"""

import json
from pathlib import Path

from .lesson import Lesson
from .widgets import WIDGETS

OUT = Path(__file__).resolve().parents[2] / "schema"


def catalog_text() -> str:
    """The widget catalog as the model sees it in its prompt."""
    parts = ["# Widget catalog\n"]
    for w in WIDGETS:
        name = w.model_fields["widget"].annotation.__args__[0]
        facts = f"\n\nFacts for {{fact:name}}: {', '.join(w.facts)}." if w.facts else ""
        parts.append(f"## {name} ({w.kind})\n\n{w.description}{facts}\n")
    return "\n".join(parts)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    schema = Lesson.model_json_schema(mode="serialization")
    (OUT / "lesson.schema.json").write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    (OUT / "catalog.md").write_text(catalog_text(), encoding="utf-8")
    print(f"wrote {OUT / 'lesson.schema.json'} and {OUT / 'catalog.md'}")


if __name__ == "__main__":
    main()
