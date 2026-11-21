"""Small in-process request limiter for single-instance deployments.

The limiter is intentionally dependency-free. Production deployments with
multiple workers should place the same policy in a shared edge/Redis limiter.

The per-user dependency factory at the bottom is the exception: it needs
FastAPI + the auth dependency, and it exists so endpoints that trigger live
third-party work (fares/live scraping, aviation provider fan-out) are throttled
per signed-in user instead of per shared IP (college NAT / SIH venue Wi-Fi
would 429 innocent users under a per-IP bucket).
"""
from collections import defaultdict, deque
from time import monotonic
from threading import Lock

from fastapi import Depends, HTTPException

from app.core.auth import get_current_user


class RequestLimiter:
    def __init__(self) -> None:
        self._buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, policy: str, limit: int, window: int) -> tuple[bool, int]:
        now = monotonic()
        bucket_key = (key, policy)
        with self._lock:
            bucket = self._buckets[bucket_key]
            cutoff = now - window
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, int(window - (now - bucket[0])))
                return False, retry_after
            bucket.append(now)
            return True, 0


limiter = RequestLimiter()


def policy_for(path: str, method: str) -> tuple[str, int, int] | None:
    if not path.startswith("/api"):
        return None
    # CORS preflight is browser plumbing, not an application request. Counting
    # it against the same IP bucket can lock out the page before its real API
    # calls are even made, especially on mobile and during Vite hot reloads.
    if method == "OPTIONS":
        return None
    if path == "/api/auth/me" and method == "GET":
        # The session snapshot is polled by every open tab (60 s + focus) and
        # carries no credentials — it must not share the strict 60/15 min
        # login bucket, which a single tab used to exhaust in ~10 minutes and
        # which let tabs on a shared IP 429 each other's logins. It gets the
        # same generous budget as ordinary reads, under its own policy name.
        return "session", 240, 60
    if path.startswith("/api/auth/"):
        # Local QA commonly refreshes the app while Firebase restores the
        # session. Keep the guard against bursts, but avoid locking a tester
        # out after a handful of legitimate retries.
        return "auth", 60, 900
    if path.startswith("/api/admin/") or path.startswith("/api/access-requests"):
        # The admin shell loads several independent panels and React may issue
        # a second request while restoring a session. Keep abuse protection,
        # but do not make a normal page load consume the entire bucket.
        return "privileged", 120, 60
    if any(path.startswith(prefix) for prefix in ("/api/collections", "/api/anomalies", "/api/government/refresh", "/api/historical/backfill")):
        return "expensive", 30, 60
    if method in {"POST", "PUT", "PATCH", "DELETE"}:
        return "write", 60, 60
    return "read", 240, 60


def rate_limited_user(policy: str, limit: int, window: int):
    """FastAPI dependency: require auth, then rate-limit per signed-in user.

    Returns the authenticated user dict (like get_current_user) so routes can
    use it as their single auth dependency. Unauthenticated requests 401
    before any provider work runs; an over-limit user gets 429 with
    Retry-After. Keyed on the verified account email, not the client IP.
    """
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        allowed, retry_after = limiter.allow(current_user["email"], policy, limit, window)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        return current_user

    return _check
