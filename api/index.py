"""Vercel serverless entrypoint for the existing FastAPI application."""
import sys
import os
import shutil
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Vercel's filesystem is ephemeral and the project may not yet have a hosted
# DATABASE_URL. Use the checked-in verified snapshot as a read-only fallback
# so the public API is useful immediately; a configured Postgres URL always
# takes precedence for persistent collection and analytics.
if os.getenv("DATABASE_URL", "").strip() == "":
    snapshot = BACKEND_DIR / "aeroprice.db"
    runtime_db = Path("/tmp/aeroprice.db")
    if snapshot.exists() and not runtime_db.exists():
        shutil.copy2(snapshot, runtime_db)
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{runtime_db}"
    os.environ.setdefault("COLLECTION_ENABLED", "false")

from main import app  # noqa: E402

__all__ = ["app"]
