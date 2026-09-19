"""
Base class for authorized flight-content aggregator adapters.

Aggregators (Amadeus, Mystifly, Sabre, etc.) provide legitimate access to
airline fare content via authorized APIs. They differ from the direct airline
adapters which return CHALLENGE_DETECTED.

An aggregator adapter:
- authenticates with the provider using credentials from environment variables
- calls the provider's search API
- maps the response to normalized FareRecord objects
- stores the raw response in raw_fare_payloads for audit

Subclass this and implement `_search()` and `_map_offer()`.
"""
import hashlib
import json
import time
import logging
import uuid
from abc import abstractmethod
from datetime import datetime, timezone
from typing import Optional
import httpx

from app.collectors.base import FareSourceAdapter, FareRecord, CollectionResult

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30.0


class AggregatorAdapter(FareSourceAdapter):
    """Extended base for aggregator sources that require OAuth or API-key auth."""

    source_type = "AGGREGATOR"
    _token: Optional[str] = None
    _token_expires_at: float = 0.0

    async def _get_token(self) -> Optional[str]:
        """
        Override in subclass if the provider uses OAuth.
        Returns a bearer token or None if not applicable (API-key only).
        """
        return None

    @abstractmethod
    async def _search(
        self,
        origin: str,
        destination: str,
        travel_date: str,
        token: Optional[str],
    ) -> dict:
        """
        Call the provider search endpoint.
        Returns the raw parsed JSON response dict.
        Raises httpx.HTTPError on failure.
        """
        ...

    @abstractmethod
    def _map_offer(self, offer: dict, origin: str, destination: str, travel_date: str, advance_days: int) -> Optional[FareRecord]:
        """
        Map one provider offer dict to a FareRecord.
        Return None if the offer cannot be mapped (e.g. wrong cabin, multi-city).
        """
        ...

    def _raw_hash(self, offer: dict) -> str:
        payload = json.dumps(offer, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    async def collect(
        self, route: str, travel_date: str, advance_days: int, collection_run_id: str
    ) -> CollectionResult:
        if not self.is_configured():
            return self.not_configured_result(route, travel_date, advance_days)

        origin, destination = route.upper().split("-")
        start = time.time()

        try:
            token = await self._get_token()
            raw_response = await self._search(origin, destination, travel_date, token)
        except httpx.TimeoutException:
            logger.warning(f"{self.source_id}: timeout for {route} {travel_date}")
            return CollectionResult(
                source_id=self.source_id,
                route=route,
                travel_date=travel_date,
                advance_days=advance_days,
                status="TIMEOUT",
                error="Request timed out",
                latency_ms=int((time.time() - start) * 1000),
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"{self.source_id}: HTTP {e.response.status_code} for {route} {travel_date}")
            return CollectionResult(
                source_id=self.source_id,
                route=route,
                travel_date=travel_date,
                advance_days=advance_days,
                status="FAILED",
                error=f"HTTP {e.response.status_code}",
                http_status=e.response.status_code,
                latency_ms=int((time.time() - start) * 1000),
            )
        except Exception as e:
            logger.error(f"{self.source_id}: unexpected error for {route} {travel_date}: {e}")
            return CollectionResult(
                source_id=self.source_id,
                route=route,
                travel_date=travel_date,
                advance_days=advance_days,
                status="FAILED",
                error=str(e)[:500],
                latency_ms=int((time.time() - start) * 1000),
            )

        latency_ms = int((time.time() - start) * 1000)
        offers = raw_response.get("data", [])
        records: list[FareRecord] = []
        rejected = 0

        for offer in offers:
            mapped = self._map_offer(offer, origin, destination, travel_date, advance_days)
            if mapped:
                if not mapped.raw_hash:
                    mapped.raw_hash = self._raw_hash(offer)
                records.append(mapped)
            else:
                rejected += 1

        logger.info(
            f"{self.source_id}: {route} {travel_date} T+{advance_days} — "
            f"{len(records)} records, {rejected} rejected, {latency_ms}ms"
        )

        return CollectionResult(
            source_id=self.source_id,
            route=route,
            travel_date=travel_date,
            advance_days=advance_days,
            status="SUCCESS" if records else "PARTIAL",
            records=records,
            records_rejected=rejected,
            latency_ms=latency_ms,
        )
