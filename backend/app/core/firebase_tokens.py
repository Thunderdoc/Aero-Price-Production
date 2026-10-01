"""Verify Firebase identities using Google's public signing certificates.

Verification requires the configured project ID, not a private service-account
key. Administrative Firebase operations still use firebase_admin.py.
"""
import os
import time
import logging

import httpx
from fastapi import HTTPException
from google.auth import jwt as google_jwt
from jose import jwt
from app.core.config import settings

from app.core.firebase_admin import service_account_info

CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
logger = logging.getLogger(__name__)
_certs: dict = {}
_certs_until = 0.0


async def _public_certificates() -> dict:
    global _certs, _certs_until
    if _certs and time.monotonic() < _certs_until:
        return _certs
    try:
        # Google can briefly return a transport error during certificate
        # rotation. Retry once so a valid Firebase login is not turned into a
        # misleading 503 or an apparent sign-out.
        response = None
        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            for attempt in range(2):
                try:
                    response = await client.get(CERT_URL)
                    response.raise_for_status()
                    break
                except httpx.HTTPError as exc:
                    last_error = exc
                    if attempt == 1:
                        raise
        if response is None:
            raise last_error or RuntimeError("Certificate response was empty")
        certificates = response.json()
        if not isinstance(certificates, dict) or not certificates:
            raise ValueError("Missing certificates")
        # Never cache beyond Google's certificate rotation policy.
        max_age = next((part.strip().split("=", 1)[1] for part in
                        response.headers.get("cache-control", "").split(",")
                        if part.strip().lower().startswith("max-age=")
                        and part.strip().split("=", 1)[1].isdigit()), "0")
        _certs = certificates
        _certs_until = time.monotonic() + min(int(max_age), 3600)
        return _certs
    except (httpx.HTTPError, ValueError, RuntimeError) as exc:
        logger.warning("Firebase public certificate retrieval failed: {}", exc)
        raise HTTPException(503, "Sign-in verification is temporarily unavailable. Please retry.") from exc


def _configured_emails(key: str) -> set[str]:
    # Vercel exposes its build variables to the function too. These values
    # come only from server configuration, never from a browser role selector.
    configured = os.getenv(key) or os.getenv(f"VITE_{key}") or getattr(settings, key, "")
    return {email.strip().lower() for email in configured.split(",") if email.strip()}


async def verify_firebase_identity(token: str) -> dict:
    invalid = HTTPException(401, "Invalid authentication credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        if jwt.get_unverified_header(token).get("alg") != "RS256":
            raise invalid
    except Exception as exc:
        raise invalid from exc
    # Use Pydantic settings so values from backend/.env are available. Reading
    # os.environ alone silently missed the project's configured Firebase ID.
    project_id = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("VITE_FIREBASE_PROJECT_ID") or settings.FIREBASE_PROJECT_ID
    if not project_id:
        project_id = (service_account_info() or {}).get("project_id")
    if not project_id:
        raise HTTPException(503, "Google sign-in is not configured on the server.")
    certificates = await _public_certificates()
    try:
        claims = google_jwt.decode(token, certs=certificates, audience=project_id)
        subject = claims.get("sub")
        if (claims.get("iss") != f"https://securetoken.google.com/{project_id}"
                or not isinstance(subject, str) or not 0 < len(subject) <= 128
                or not isinstance(claims.get("auth_time"), (int, float))
                or claims["auth_time"] > time.time()
                or claims.get("email_verified") is not True
                or not claims.get("email")):
            raise ValueError("Invalid Firebase identity claims")
    except Exception as exc:
        raise invalid from exc
    email = str(claims["email"]).strip().lower()
    # Only trust the namespaced claims written by this backend. Generic
    # `role`/`plan` claims from an unrelated Firebase client are ignored.
    claim_role = str(claims.get("aeroprice_role", "")).upper()
    claim_plan = str(claims.get("aeroprice_plan", "")).upper()
    role, plan = "PUBLIC", "FREE"
    if claim_role in {"PUBLIC", "ANALYST", "ADMIN"}:
        role = claim_role
        plan = claim_plan if claim_plan in {"FREE", "SUBSCRIBER", "GOVERNMENT", "ADMIN"} else ("ADMIN" if role == "ADMIN" else "GOVERNMENT" if role == "ANALYST" else "FREE")
    elif email in _configured_emails("FIREBASE_ADMIN_EMAILS"):
        role, plan = "ADMIN", "ADMIN"
    elif email in _configured_emails("FIREBASE_ANALYST_EMAILS"):
        role, plan = "ANALYST", "GOVERNMENT"
    return {"email": email, "name": claims.get("name") or email, "role": role, "plan": plan}
