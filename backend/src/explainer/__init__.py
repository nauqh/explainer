from pathlib import Path

from dotenv import load_dotenv

# The repo-root .env (OPENROUTER_API_KEY and optional settings), loaded before any module reads os.environ.
# Real environment variables win over the file.
load_dotenv(Path(__file__).resolve().parents[3] / ".env")
