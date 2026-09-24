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
    if path.startswith("/api/auth/"):
        return "auth", 20, 900
    if path.startswith("/api/admin/") or path.startswith("/api/access-requests"):
        return "privileged", 60, 60
    if any(path.startswith(prefix) for prefix in ("/api/collections", "/api/anomalies", "/api/government/refresh", "/api/historical/backfill")):
        return "expensive", 10, 60
    if method in {"POST", "PUT", "PATCH", "DELETE"}:
        return "write", 60, 60
    return "read", 240, 60
