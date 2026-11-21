"""
Rate-limiter tests (audit gap T6 — nothing tested the limiter).

Covers the RequestLimiter bucket behaviour and the policy_for routing,
including the auth-bucket size that the 10-second /me poll used to exceed.
"""
from app.core.rate_limit import RequestLimiter, policy_for


def test_limiter_allows_up_to_limit_then_blocks():
    limiter = RequestLimiter()
    for _ in range(3):
        allowed, _ = limiter.allow("1.2.3.4", "read", limit=3, window=60)
        assert allowed is True
    allowed, retry_after = limiter.allow("1.2.3.4", "read", limit=3, window=60)
    assert allowed is False
    assert retry_after >= 1


def test_limiter_buckets_are_per_key_and_per_policy():
    limiter = RequestLimiter()
    limiter.allow("1.2.3.4", "read", limit=1, window=60)
    allowed, _ = limiter.allow("1.2.3.4", "read", limit=1, window=60)
    assert allowed is False
    # A different IP gets its own bucket.
    allowed, _ = limiter.allow("5.6.7.8", "read", limit=1, window=60)
    assert allowed is True
    # A different policy gets its own bucket for the same IP.
    allowed, _ = limiter.allow("1.2.3.4", "write", limit=1, window=60)
    assert allowed is True


def test_limiter_window_expiry_frees_the_bucket(monkeypatch):
    import app.core.rate_limit as rl

    now = [1000.0]
    monkeypatch.setattr(rl, "monotonic", lambda: now[0])
    limiter = RequestLimiter()
    limiter.allow("1.2.3.4", "read", limit=1, window=60)
    allowed, _ = limiter.allow("1.2.3.4", "read", limit=1, window=60)
    assert allowed is False
    now[0] += 61  # past the window
    allowed, _ = limiter.allow("1.2.3.4", "read", limit=1, window=60)
    assert allowed is True


def test_policy_for_routes_paths():
    assert policy_for("/api/auth/token", "POST") == ("auth", 60, 900)
    # /me has its own session bucket (Phase 3 exemption for the 60 s poll).
    assert policy_for("/api/auth/me", "GET") == ("session", 240, 60)
    assert policy_for("/api/admin/users", "GET") == ("privileged", 120, 60)
    assert policy_for("/api/collections", "GET") == ("expensive", 30, 60)
    assert policy_for("/api/anomalies/run-detection", "POST") == ("expensive", 30, 60)
    assert policy_for("/api/fares", "GET") == ("read", 240, 60)
    assert policy_for("/api/admin/feedback", "POST") == ("privileged", 120, 60)
    assert policy_for("/api/index/current", "GET") == ("read", 240, 60)
    # Non-API paths and CORS preflights are not rate-limited.
    assert policy_for("/docs", "GET") is None
    assert policy_for("/api/fares", "OPTIONS") is None
