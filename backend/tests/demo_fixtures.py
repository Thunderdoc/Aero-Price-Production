"""Test-only demo-account fixtures (Phase 1).

These are the accounts deleted from ``app.core.auth`` (S1/L2): hardcoded
demo logins — including a full ADMIN — whose plaintext passwords sat in the
public repo and worked on any deployment where ``ENVIRONMENT`` was not
exactly ``"production"``.

They live here ONLY so tests can prove the old publicly-known credentials no
longer authenticate anywhere. No production code imports this module, and no
production code path reads these accounts. ``DEMO_ACCOUNTS_ENABLED`` defaults
off; even when enabled it only affects test helpers — there is no production
demo-login path left to enable.
"""
import os

DEMO_ACCOUNTS_ENABLED = os.getenv("AEROPRICE_DEMO_ACCOUNTS", "") == "1"

# Identities (and the old passwords) as they were committed in app code.
# Kept so the "demo login rejected" regression test attempts exactly the
# credentials an attacker could read from the repo history.
DEMO_USERS = {
    "admin@aeroprice.in": {"password": "aeroadmin", "role": "ADMIN", "plan": "ADMIN", "name": "Admin User"},
    "dgca@gov.in": {"password": "dgca2026", "role": "ANALYST", "plan": "GOVERNMENT", "name": "DGCA Analyst"},
    "user@aeroprice.in": {"password": "aero123", "role": "PUBLIC", "plan": "FREE", "name": "User Account"},
    "visitor@example.com": {"password": "demo", "role": "PUBLIC", "plan": "FREE", "name": "Free User"},
}


def enabled_demo_users() -> dict:
    """Demo accounts available to test helpers — empty unless explicitly enabled."""
    return dict(DEMO_USERS) if DEMO_ACCOUNTS_ENABLED else {}
