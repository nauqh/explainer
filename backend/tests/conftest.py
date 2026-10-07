import os
import tempfile
from pathlib import Path

# Before explainer.pipeline creates its engine.
os.environ["DATABASE_URL"] = f"sqlite:///{Path(tempfile.mkdtemp()) / 'test.db'}"
