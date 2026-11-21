"""
Snapshot-fallback tests (audit B27): the Vercel entrypoint must never crash
when the bundled snapshot database file is missing.

Phase 1 deleted the committed backend/aeroprice.db, so the missing-file path
is now the live path: the app must boot on an empty ephemeral database and
/api/health must honestly report NO_LIVE_DATA.
"""
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
API_INDEX = REPO_ROOT / "api" / "index.py"


def _load_api_index_module(monkeypatch):
    """Import api/index.py WITHOUT executing its DATABASE_URL fallback block:
    DATABASE_URL is set for the import, so only _prepare_snapshot_database is
    exercised directly by the caller. Env changes go through monkeypatch so
    they revert after the test (a direct os.environ write here leaked
    DATABASE_URL into the rest of the suite)."""
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("SECRET_KEY", "pytest-only-test-secret-key-0123456789abcdef")
    spec = importlib.util.spec_from_file_location("aeroprice_api_index", API_INDEX)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_prepare_snapshot_returns_false_when_db_file_missing(tmp_path, monkeypatch):
    module = _load_api_index_module(monkeypatch)
    # Point BACKEND_DIR at an empty temp dir: no aeroprice.db there.
    monkeypatch.setattr(module, "BACKEND_DIR", tmp_path)
    assert module._prepare_snapshot_database() is False


def test_prepare_snapshot_returns_false_when_copy_fails(tmp_path, monkeypatch):
    module = _load_api_index_module(monkeypatch)
    (tmp_path / "aeroprice.db").write_bytes(b"fake snapshot")
    monkeypatch.setattr(module, "BACKEND_DIR", tmp_path)
    # _prepare_snapshot_database skips the copy when /tmp/aeroprice.db already
    # exists (e.g. left by an earlier test in the suite) — remove it so the
    # copy path is actually exercised.
    Path("/tmp/aeroprice.db").unlink(missing_ok=True)

    def _boom(*args, **kwargs):
        raise OSError("disk full (simulated)")

    monkeypatch.setattr(module.shutil, "copy2", _boom)
    # A failed copy must degrade, never raise (B27).
    assert module._prepare_snapshot_database() is False


def test_api_entrypoint_boots_without_snapshot_or_database_url():
    """End-to-end: importing the Vercel entrypoint with no DATABASE_URL and
    no snapshot file must exit 0 (the app boots; health reports NO_LIVE_DATA)."""
    env = dict(os.environ)
    env.pop("DATABASE_URL", None)
    env.pop("AEROPRICE_SNAPSHOT_FALLBACK", None)
    env["SECRET_KEY"] = "pytest-only-test-secret-key-0123456789abcdef"
    # Pin LOG_LEVEL: main.py does getattr(logging, settings.LOG_LEVEL), and a
    # lowercase value leaked from another test crashes the boot with a
    # TypeError (observed in the full-suite run). This test is about the
    # snapshot fallback, not log levels.
    env["LOG_LEVEL"] = "INFO"
    env["PYTHONPATH"] = str(REPO_ROOT / "backend")
    code = (
        "import sys; sys.path.insert(0, 'api'); "
        "import index as entry; assert entry.app is not None; "
        "print('entrypoint import ok')"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr[-2000:]
    assert "entrypoint import ok" in result.stdout
