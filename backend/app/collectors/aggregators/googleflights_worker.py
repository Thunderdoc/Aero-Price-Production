"""Optional external worker boundary for public Google Flights collection.

The worker must be explicitly configured and accept one JSON request on stdin,
then write one JSON response on stdout. No command means NOT_CONFIGURED.
"""
import asyncio
import hashlib
import json
import shlex
import time

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter
from app.core.config import settings


class GoogleFlightsWorkerAdapter(FareSourceAdapter):
    source_id = "googleflights-worker"
    source_name = "Google Flights public-interface worker"
    source_type = "PUBLIC_INTERFACE"

    def is_configured(self) -> bool:
        return bool(settings.GOOGLEFLIGHTS_WORKER_COMMAND.strip())

    @staticmethod
    def _record(item: dict, origin: str, destination: str, route: str,
                travel_date: str, advance_days: int) -> FareRecord | None:
        price = item.get("price")
        currency = str(item.get("currency") or "").upper()
        airlines = item.get("airlines")
        if not isinstance(price, (int, float)) or price <= 0:
            return None
        if currency != "INR" or not isinstance(airlines, list) or not airlines:
            return None
        airline = str(airlines[0]).strip()
        if not airline:
            return None
        raw = json.dumps(item, sort_keys=True, default=str)
        return FareRecord(
            origin=origin, destination=destination, route=route, airline=airline,
            travel_date=travel_date, advance_days=advance_days,
            base_fare=float(price), taxes=0.0, fees=0.0, total_fare=float(price),
            currency=currency, flight_number=item.get("flight_number"),
            departure_time=item.get("departure"), arrival_time=item.get("arrival"),
            stops=int(item.get("stops") or 0), cabin="ECONOMY",
            source=GoogleFlightsWorkerAdapter.source_id,
            source_url=item.get("booking_url") or item.get("source_url"),
            data_origin="REAL", raw_hash=hashlib.sha256(raw.encode()).hexdigest(),
        )

    async def collect(self, route: str, travel_date: str, advance_days: int,
                      collection_run_id: str) -> CollectionResult:
        command = settings.GOOGLEFLIGHTS_WORKER_COMMAND.strip()
        if not command:
            return self.not_configured_result(route, travel_date, advance_days)
        origin, separator, destination = route.upper().partition("-")
        if not separator or len(origin) != 3 or len(destination) != 3:
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error="Invalid IATA route")
        request = {"from_airport": origin, "to_airport": destination,
                   "departure_date": travel_date, "trip": "one-way",
                   "seat": "economy", "currency": "INR", "max_results": 20}
        started = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                *shlex.split(command), stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(json.dumps(request).encode()), timeout=45)
        except asyncio.TimeoutError:
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "TIMEOUT", error="Worker timed out",
                                    latency_ms=int((time.monotonic()-started)*1000))
        except (OSError, ValueError) as exc:
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error=f"Worker could not start: {exc}")
        if proc.returncode != 0:
            detail = stderr.decode(errors="replace").strip()[:500]
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error=detail or "Worker exited non-zero",
                                    latency_ms=int((time.monotonic()-started)*1000))
        try:
            payload = json.loads(stdout.decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error="Worker returned malformed JSON",
                                    latency_ms=int((time.monotonic()-started)*1000))
        if payload.get("error"):
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error="Worker reported an upstream error",
                                    latency_ms=int((time.monotonic()-started)*1000))
        items = payload.get("results") or []
        records = [record for item in items if isinstance(item, dict)
                   for record in [self._record(item, origin, destination, route,
                                               travel_date, advance_days)]
                   if record is not None]
        return CollectionResult(
            self.source_id, route, travel_date, advance_days,
            "SUCCESS" if records else "NO_DATA", records=records,
            records_rejected=max(0, len(items)-len(records)),
            latency_ms=int((time.monotonic()-started)*1000))
