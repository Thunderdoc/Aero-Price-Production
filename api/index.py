"""Vercel serverless entrypoint for the existing FastAPI application."""
import sys
import os
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))


def _prepare_snapshot_database() -> bool:
    """Copy the bundled snapshot DB to /tmp when it exists.

    Returns True only when a usable snapshot copy is in place. A missing
    snapshot file or a failed copy must NEVER crash the import (B27): the
    app boots on an empty ephemeral database instead and /api/health
    honestly reports NO_LIVE_DATA until a hosted DATABASE_URL is configured.
    """
    snapshot = BACKEND_DIR / "aeroprice.db"
    runtime_db = Path("/tmp/aeroprice.db")
    if not snapshot.exists():
        logger.warning(
            "Snapshot database %s not found; starting without snapshot data. "
            "Set DATABASE_URL to a hosted Postgres for persistent data.",
            snapshot,
        )
        return False
    try:
        runtime_ok = runtime_db.exists() and runtime_db.stat().st_size > 0
    except OSError:
        runtime_ok = False
    if runtime_ok:
        return True
    try:
        # Copy via a temp file + atomic rename: a crash mid-copy must never
        # leave a partial file at the runtime path, and a 0-byte runtime
        # copy (partial copy, or an empty file left by an earlier boot) is
        # corrupt and is re-copied, never trusted (B27).
        tmp_db = runtime_db.with_suffix(".tmp")
        try:
            shutil.copy2(snapshot, tmp_db)
            os.replace(tmp_db, runtime_db)
        except OSError:
            tmp_db.unlink(missing_ok=True)
            raise
    except OSError:
        logger.exception("Snapshot database copy failed; starting without snapshot data")
        return False
    return runtime_db.exists()


# Vercel's filesystem is ephemeral and the project may not yet have a hosted
# DATABASE_URL. Use the bundled snapshot as a read-only fallback so the public
# API is useful immediately; a configured Postgres URL always takes precedence
# for persistent collection and analytics.
if os.getenv("DATABASE_URL", "").strip() == "":
    runtime_db = Path("/tmp/aeroprice.db")
    snapshot_ready = _prepare_snapshot_database()
    # Point at the ephemeral path either way: with a snapshot it holds the
    # copied data; without one aiosqlite creates an empty DB, the app boots,
    # and health reports database "error" / NO_LIVE_DATA honestly.
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{runtime_db}"
    os.environ.setdefault("COLLECTION_ENABLED", "false")
    if snapshot_ready:
        os.environ["AEROPRICE_SNAPSHOT_FALLBACK"] = "1"

from main import app  # noqa: E402

__all__ = ["app"]
