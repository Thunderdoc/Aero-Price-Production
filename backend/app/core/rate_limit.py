"""Small in-process request limiter for single-instance deployments.

The limiter is intentionally dependency-free. Production deployments with
multiple workers should place the same policy in a shared edge/Redis limiter.
"""
from collections import defaultdict, deque
from time import monotonic
from threading import Lock


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
