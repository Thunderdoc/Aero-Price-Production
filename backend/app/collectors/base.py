"""
Abstract base for all fare source adapters.

Every adapter must implement collect() and return a CollectionResult.
Adapters that cannot access the source must set status=CHALLENGE_DETECTED
and never fabricate fare data.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


@dataclass
class FareRecord:
    """Normalized fare record from any source."""
    origin: str
    destination: str
    route: str
    airline: str
    travel_date: str           # YYYY-MM-DD
    advance_days: int
    base_fare: float
    taxes: float
    fees: float
    total_fare: float
    currency: str = "INR"
    flight_number: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    stops: int = 0
    fare_family: Optional[str] = None
    cabin: str = "ECONOMY"
    availability_status: str = "AVAILABLE"
    seats_available: Optional[int] = None
    source: str = ""
    source_url: Optional[str] = None
    data_origin: str = "REAL"
    raw_hash: Optional[str] = None
    quality_flags: List[str] = field(default_factory=list)


@dataclass
class CollectionResult:
    """Result from one source-route-window collection attempt."""
    source_id: str
    route: str
    travel_date: str
    advance_days: int
    status: str              # SUCCESS, CHALLENGE_DETECTED, FAILED, TIMEOUT, RATE_LIMITED
    records: List[FareRecord] = field(default_factory=list)
    records_rejected: int = 0
    latency_ms: Optional[int] = None
    error: Optional[str] = None
    challenge_reason: Optional[str] = None
    http_status: Optional[int] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class FareSourceAdapter(ABC):
    """Base adapter. Subclass for each data source."""

    source_id: str = ""
    source_name: str = ""
    source_type: str = "AIRLINE_DIRECT"
    requires_credentials: bool = False
    credential_env_vars: List[str] = []

    def __init__(self, config: dict = None):
        self.config = config or {}

    @abstractmethod
    async def collect(
        self,
        route: str,
        travel_date: str,
        advance_days: int,
        collection_run_id: str,
    ) -> CollectionResult:
        """Collect fares for a route+date+window. Must not fabricate data."""
        ...

    def is_configured(self) -> bool:
        """Returns True only if all required credentials are present."""
        return all(self.config.get(k) for k in self.credential_env_vars)

    def not_configured_result(self, route: str, travel_date: str, advance_days: int) -> CollectionResult:
        return CollectionResult(
            source_id=self.source_id,
            route=route,
            travel_date=travel_date,
            advance_days=advance_days,
            status="NOT_CONFIGURED",
            error=f"Required credentials not set: {', '.join(self.credential_env_vars)}",
        )

    def challenge_result(self, route: str, travel_date: str, advance_days: int, reason: str) -> CollectionResult:
        return CollectionResult(
            source_id=self.source_id,
            route=route,
            travel_date=travel_date,
            advance_days=advance_days,
            status="CHALLENGE_DETECTED",
            challenge_reason=reason,
        )
