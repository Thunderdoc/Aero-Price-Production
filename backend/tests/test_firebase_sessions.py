import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from fastapi import HTTPException
from jose import jwt

from app.core import firebase_tokens
from app.core.auth import get_current_user
from app.api.routes.auth import FirebaseLoginRequest, firebase_login


@pytest.fixture
def firebase_signer(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test signer")])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(days=1))
            .sign(key, hashes.SHA256()))
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    for field in ("FIREBASE_ADMIN_EMAILS", "FIREBASE_ANALYST_EMAILS", "VITE_FIREBASE_ADMIN_EMAILS", "VITE_FIREBASE_ANALYST_EMAILS"):
        monkeypatch.delenv(field, raising=False)
    monkeypatch.setattr(firebase_tokens, "_public_certificates", AsyncMock(return_value={
        "test-key": cert.public_bytes(serialization.Encoding.PEM).decode(),
    }))
    private_key = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())

    def sign(**overrides):
        claims = {"aud": "test-project", "iss": "https://securetoken.google.com/test-project",
                  "sub": "firebase-user", "email": "user@example.test", "email_verified": True,
                  "name": "Test User", "iat": int(time.time()), "auth_time": int(time.time()), "exp": int(time.time()) + 3600}
        claims.update(overrides)
        return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test-key"})
    return sign


async def test_google_session_works_without_private_service_account(firebase_signer, monkeypatch):
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_JSON", raising=False)
    response = await firebase_login(FirebaseLoginRequest(id_token=firebase_signer(role="ADMIN")))
    assert response.user["role"] == "PUBLIC"
    # Same token accepted by all protected endpoints, independent of Firebase.
    assert (await get_current_user(response.access_token))["email"] == "user@example.test"


@pytest.mark.parametrize("overrides", [
    {"aud": "another-project"}, {"iss": "https://attacker.example"},
    {"exp": 1}, {"sub": ""}, {"auth_time": 9999999999},
])
async def test_reject_invalid_identity_claims(firebase_signer, overrides):
    with pytest.raises(HTTPException) as exc:
        await firebase_tokens.verify_firebase_identity(firebase_signer(**overrides))
    assert exc.value.status_code == 401


async def test_unverified_email_has_actionable_error_instead_of_session_expired(firebase_signer):
    with pytest.raises(HTTPException) as exc:
        await firebase_tokens.verify_firebase_identity(firebase_signer(email_verified=False))
    assert exc.value.status_code == 403
    assert "verify your email address" in exc.value.detail


async def test_government_role_comes_from_server_allowlist(firebase_signer, monkeypatch):
    monkeypatch.setenv("FIREBASE_ANALYST_EMAILS", "user@example.test")
    user = await firebase_tokens.verify_firebase_identity(firebase_signer())
    assert user["role"] == "ANALYST"
    assert user["plan"] == "GOVERNMENT"


async def test_reject_forged_signature(firebase_signer):
    token = firebase_signer()
    head, body, signature = token.split(".")
    forged = f"{head}.{body}.{'A' if signature[0] != 'A' else 'B'}{signature[1:]}"
    with pytest.raises(HTTPException) as exc:
        await firebase_tokens.verify_firebase_identity(forged)
    assert exc.value.status_code == 401
