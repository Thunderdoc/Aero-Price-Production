"""Seed the SIH evaluator account (ANALYST role).

The evaluator account is a real database account, created out of band — it
replaces the old hardcoded demo logins, which were deleted from app code.
The password comes ONLY from the EVALUATOR_PASSWORD environment variable;
this module refuses to run without it, and the password is never written to
any file, log line, or return value.

Run from backend/ (after the database exists):

    EVALUATOR_PASSWORD='<strong-password>' python -m app.seed.evaluator

The seed is idempotent: re-running it with a new EVALUATOR_PASSWORD updates
the account password and re-asserts the ANALYST / GOVERNMENT role and plan.
The login page offers this account as the evaluator demo login; the email
below must match the frontend's VITE_EVALUATOR_EMAIL (same default).
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy import select  # noqa: E402

from app.core.auth import get_password_hash  # noqa: E402
from app.core.database import AsyncSessionLocal, create_all_tables  # noqa: E402
from app.models.auth_account import AuthAccount  # noqa: E402
from app.models.user import AuditLog, User  # noqa: E402

EVALUATOR_EMAIL = "evaluator@aeroprice.in"
EVALUATOR_NAME = "SIH Evaluator"
EVALUATOR_ROLE = "ANALYST"
EVALUATOR_PLAN = "GOVERNMENT"
MIN_PASSWORD_LENGTH = 8


def _require_password() -> str:
    password = os.environ.get("EVALUATOR_PASSWORD")
    if not password:
        raise RuntimeError(
            "EVALUATOR_PASSWORD is not set. Set it in the environment and "
            "re-run — the evaluator seed never uses a default password."
        )
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"EVALUATOR_PASSWORD must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    return password


async def seed_evaluator(db) -> dict:
    """Create or update the evaluator account. Returns status, never secrets."""
    password = _require_password()
    account = await db.scalar(select(AuthAccount).where(AuthAccount.email == EVALUATOR_EMAIL))
    user = await db.scalar(select(User).where(User.email == EVALUATOR_EMAIL))
    password_hash = get_password_hash(password)

    if account is None:
        db.add(AuthAccount(
            email=EVALUATOR_EMAIL,
            name=EVALUATOR_NAME,
            password_hash=password_hash,
            role=EVALUATOR_ROLE,
            plan=EVALUATOR_PLAN,
            is_active=True,
        ))
        status = "created"
        audit_action = "USER_CREATE"
    else:
        account.password_hash = password_hash
        account.name = EVALUATOR_NAME
        account.role = EVALUATOR_ROLE
        account.plan = EVALUATOR_PLAN
        account.is_active = True
        status = "updated"
        audit_action = "PASSWORD_RESET"

    if user is None:
        db.add(User(
            email=EVALUATOR_EMAIL,
            name=EVALUATOR_NAME,
            role=EVALUATOR_ROLE,
            plan=EVALUATOR_PLAN,
            is_active=True,
        ))
    else:
        user.name = EVALUATOR_NAME
        user.role = EVALUATOR_ROLE
        user.plan = EVALUATOR_PLAN
        user.is_active = True

    db.add(AuditLog(
        user_email="evaluator-seed",
        action=audit_action,
        resource_type="user",
        resource_id=EVALUATOR_EMAIL,
        details={"target_email": EVALUATOR_EMAIL, "role": EVALUATOR_ROLE, "plan": EVALUATOR_PLAN, "source": "seed"},
    ))
    await db.commit()
    return {"email": EVALUATOR_EMAIL, "role": EVALUATOR_ROLE, "plan": EVALUATOR_PLAN, "status": status}


async def main() -> None:
    await create_all_tables()
    async with AsyncSessionLocal() as db:
        result = await seed_evaluator(db)
    print(f"Evaluator account {result['status']}: {result['email']} ({result['role']}/{result['plan']})")


if __name__ == "__main__":
    asyncio.run(main())
