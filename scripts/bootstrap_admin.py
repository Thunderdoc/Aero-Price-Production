"""One-time first-admin bootstrap — create the first ADMIN account in the DB.

No Firebase, no email sender, no existing admin needed. Run once, from the
repo root, after the backend database exists:

    python scripts/bootstrap_admin.py --email admin@example.com --name "Admin Name"

The password comes from the AEROPRICE_ADMIN_PASSWORD environment variable or
from an interactive prompt (typed twice, never echoed). It is never written
to any file, log line, or commit. The script refuses to run when:

- no password is available (no env var and no interactive terminal), or
- an ADMIN account already exists (use the Admin UI to manage further
  admins), or
- the email already has an account of any role (promote it via the Admin
  UI's role change instead).

DATABASE_URL is read from the environment (or backend/.env) the same way the
backend reads it, so run this with the same environment the backend uses.
"""

import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import select  # noqa: E402

from app.core.auth import get_password_hash  # noqa: E402
from app.core.database import AsyncSessionLocal, create_all_tables  # noqa: E402
from app.models.auth_account import AuthAccount  # noqa: E402
from app.models.user import AuditLog, User  # noqa: E402

MIN_PASSWORD_LENGTH = 8


def _read_password() -> str:
    password = os.environ.get("AEROPRICE_ADMIN_PASSWORD")
    if password:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise SystemExit(
                f"AEROPRICE_ADMIN_PASSWORD must be at least {MIN_PASSWORD_LENGTH} characters."
            )
        return password
    if not sys.stdin.isatty():
        raise SystemExit(
            "No password available: set AEROPRICE_ADMIN_PASSWORD or run "
            "interactively so the password can be prompted for."
        )
    first = getpass.getpass("New admin password (min 8 characters): ")
    if len(first) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    second = getpass.getpass("Repeat new admin password: ")
    if first != second:
        raise SystemExit("Passwords do not match.")
    return first


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first AeroPrice admin account.")
    parser.add_argument("--email", required=True, help="Email for the admin account")
    parser.add_argument("--name", default="Administrator", help="Display name for the admin account")
    args = parser.parse_args()

    email = args.email.strip().lower()
    name = args.name.strip()
    if "@" not in email or len(email) > 255:
        raise SystemExit("Enter a valid email address.")
    if len(name) < 2 or len(name) > 100:
        raise SystemExit("Name must be between 2 and 100 characters.")

    password = _read_password()

    await create_all_tables()
    async with AsyncSessionLocal() as db:
        existing_admin = await db.scalar(
            select(AuthAccount).where(AuthAccount.role == "ADMIN")
        )
        if existing_admin is None:
            existing_admin = await db.scalar(select(User).where(User.role == "ADMIN"))
        if existing_admin is not None:
            raise SystemExit(
                "An ADMIN account already exists. Use the Admin UI to manage "
                "admins instead of bootstrapping another one."
            )
        existing = await db.scalar(select(AuthAccount).where(AuthAccount.email == email))
        if existing is not None:
            raise SystemExit(
                "An account already exists for this email. Promote it with "
                "the Admin UI role change instead of bootstrapping."
            )
        db.add(AuthAccount(
            email=email,
            name=name,
            password_hash=get_password_hash(password),
            role="ADMIN",
            plan="ADMIN",
            is_active=True,
        ))
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            db.add(User(
                email=email, name=name, role="ADMIN", plan="ADMIN", is_active=True,
            ))
        else:
            user.name = name
            user.role = "ADMIN"
            user.plan = "ADMIN"
            user.is_active = True
        db.add(AuditLog(
            user_email="bootstrap",
            action="USER_CREATE",
            resource_type="user",
            resource_id=email,
            details={"target_email": email, "role": "ADMIN", "plan": "ADMIN", "source": "bootstrap"},
        ))
        await db.commit()
    print(f"Admin account created: {email} (ADMIN/ADMIN). Sign in at the login page.")


if __name__ == "__main__":
    asyncio.run(main())
