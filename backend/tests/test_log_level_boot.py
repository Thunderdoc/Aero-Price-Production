"""LOG_LEVEL boot-containment pins (Track C).

main.py does getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO):
a lowercase or invalid LOG_LEVEL must never crash the app at import
(the pre-fix behaviour was a TypeError from logging.basicConfig, because
getattr(logging, "debug") returns the logging.debug FUNCTION).

The Track C investigation found NO in-repo source that sets a lowercase
LOG_LEVEL (no os.environ write, no .env file, no dotenv loader, all test
env mutations restore via patch.dict/monkeypatch) — the 21 Nov full-suite
observation is attributed to the ambient shell env of that run, which no
longer exists. These tests pin the CONTAINMENT so a regression fails:
the app must boot under any LOG_LEVEL value, whatever its source.

Runs in a subprocess: importing main.py configures root logging, so it
must not run inside the pytest process. DATABASE_URL points at a tmp
SQLite file so the repo's backend/aeroprice.db is never touched.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_SECRET = "pytest-only-test-secret-key-0123456789abcdef"


@pytest.mark.parametrize("log_level", ["debug", "bogus-not-a-level"])
def test_app_boots_with_any_log_level(tmp_path, log_level):
    env = dict(os.environ)
    env["SECRET_KEY"] = TEST_SECRET
    env["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path / 'boot.db'}"
    env["LOG_LEVEL"] = log_level
    env.pop("AEROPRICE_SNAPSHOT_FALLBACK", None)
    result = subprocess.run(
        [sys.executable, "-c", "import main; print('BOOT_OK')"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr[-2000:]
    assert "BOOT_OK" in result.stdout


# ══════════════════════════════════════════════════════════════════════════
# The actual leaker (Track C root cause): importing the third-party
# fast-flights package calls dotenv.load_dotenv(), which loads the nearest
# .env up the directory tree into os.environ — including this machine's
# ~/.env (LOG_LEVEL=debug). The adapter's _import_fast_flights() guard
# must leave os.environ byte-identical. Runs in a subprocess because the
# import executes only once per interpreter.
# ══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("initial_log_level", [None, "INFO"])
def test_fast_flights_import_leaves_environ_unchanged(tmp_path, initial_log_level):
    env = dict(os.environ)
    env["SECRET_KEY"] = TEST_SECRET
    env["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path / 'leak.db'}"
    if initial_log_level is None:
        env.pop("LOG_LEVEL", None)
    else:
        env["LOG_LEVEL"] = initial_log_level
    script = (
        "import os; "
        "before = dict(os.environ); "
        "from app.collectors.aggregators.fast_flights import FastFlightsAdapter; "
        "adapter = FastFlightsAdapter(); "
        "assert adapter.is_configured(), 'fast-flights must be installed for this test'; "
        "assert dict(os.environ) == before, "
        "f'import mutated os.environ: added={set(os.environ) - set(before)}'; "
        "print('NO_LEAK')"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr[-2000:]
    assert "NO_LEAK" in result.stdout
