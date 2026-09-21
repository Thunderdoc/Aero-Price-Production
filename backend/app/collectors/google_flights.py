"""
Google Flights adapter using the fast-flights library.

fast-flights constructs Protobuf-encoded `tfs` URL parameters to query
Google Flights without a headless browser or official API key.

PROVENANCE RULES — non-negotiable:
  - data_origin = "REAL" only when a genuine price response was received
  - If Google blocks/rate-limits/CAPTCHAs → return CHALLENGE_DETECTED, never fabricate
  - Never claim REAL when the source did not return a confirmed price

WHAT THIS ADAPTER DOES NOT DO:
  - No curl_cffi browser impersonation or TLS fingerprint spoofing
  - No CAPTCHA bypass (CapSolver or any other solver)
  - No consent-wall cookie manipulation
  - No proxy rotation or anti-bot evasion
  If Google blocks a plain HTTP request, the adapter returns CHALLENGE_DETECTED
  and the pipeline records that honestly.

To get unblocked data, wire in an authorized aggregator (Amadeus, Mystifly, etc.)
instead of bypassing Google's access controls.
"""
import asyncio
import hashlib
import json
import logging
import time
from datetime import date, timedelta
from typing import Optional

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter
from app.core.config import settings

logger = logging.getLogger(__name__)

SOURCE_ID = "google-flights"
SOURCE_NAME = "Google Flights (fast-flights)"
SOURCE_URL = "https://www.google.com/flights"
COLLECTOR_VERSION = "1.0"

# IATA carrier code → airline name for Indian market
_IATA_TO_NAME: dict[str, str] = {
    "6E": "IndiGo",
    "AI": "Air India",
    "IX": "Air India Express",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "UK": "Vistara",
    "G8": "Go First",
    "I5": "Air Asia India",
    "S5": "Star Air",
    "2T": "TruJet",
    "CD": "IndiGo (Codeshare)",
}


def _parse_price(raw) -> Optional[float]:
    """Parse fast-flights price field (int, float, or string like '₹4,532')."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if float(raw) > 0 else None
    if isinstance(raw, str):
        cleaned = (
            raw.replace("₹", "")
               .replace("INR", "")
               .replace(",", "")
               .strip()
        )
        try:
            val = float(cleaned)
            return val if val > 0 else None
        except ValueError:
            return None
    return None


def _airline_name(flight) -> str:
    """Extract best-available airline name from a flight object."""
    # Try direct IATA code first
    for attr in ("airline", "operating_airline", "carrier"):
        code = getattr(flight, attr, None)
        if code and isinstance(code, str) and code.strip():
            name = _IATA_TO_NAME.get(code.strip().upper())
            if name:
                return name
            return code.strip()
    # Fall back to airlines list
    airlines = getattr(flight, "airlines", None)
    if airlines:
        first = airlines[0] if hasattr(airlines, "__getitem__") else str(airlines)
        code = str(first).strip().upper()
        return _IATA_TO_NAME.get(code, code)
    return "Unknown"


def _hhmm(raw) -> Optional[str]:
    """Extract HH:MM from whatever time representation fast-flights gives."""
    if raw is None:
        return None
    s = str(raw).strip()
    # Already HH:MM
    if len(s) >= 5 and s[2] == ":":
        return s[:5]
    # datetime-like: take last 5 chars before timezone
    if "T" in s:
        time_part = s.split("T")[-1][:5]
        return time_part if ":" in time_part else None
    return s[:5] if len(s) >= 5 else None


def _make_hash(route: str, travel_date: str, airline: str, total_fare: float,
               dep: Optional[str], arr: Optional[str]) -> str:
    payload = json.dumps({
        "route": route,
        "travel_date": travel_date,
        "airline": airline,
        "total_fare": total_fare,
        "dep": dep,
        "arr": arr,
    }, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def _is_blocked_error(exc: Exception) -> bool:
    """True when the error indicates Google blocked the request."""
    msg = str(exc).lower()
    blocked_signals = [
        "captcha", "blocked", "403", "429", "consent",
        "captchaencountered", "consentblocked", "blockederror",
        "rate limit", "too many requests", "access denied",
        "forbidden", "robot", "automated",
    ]
    return any(sig in msg for sig in blocked_signals)


class GoogleFlightsAdapter(FareSourceAdapter):
    """
    Queries Google Flights via the fast-flights library.

    Makes plain HTTP GET requests only. No browser impersonation, no CAPTCHA bypass.
    Returns CHALLENGE_DETECTED if Google blocks the request.
    Returns REAL-tagged records only when a genuine price response arrives.
    """

    source_id = SOURCE_ID
    source_name = SOURCE_NAME
    source_type = "AGGREGATOR"
    requires_credentials = False
    credential_env_vars = []

    def is_configured(self) -> bool:
        if "GOOGLE_FLIGHTS_ENABLED" in self.config:
            return bool(self.config["GOOGLE_FLIGHTS_ENABLED"])
        return getattr(settings, "GOOGLE_FLIGHTS_ENABLED", True)

    async def collect(
        self,
        route: str,
        travel_date: str,
        advance_days: int,
        collection_run_id: str,
    ) -> CollectionResult:
        if not self.is_configured():
            return self.not_configured_result(route, travel_date, advance_days)

        origin, _, destination = route.partition("-")
        if not origin or not destination:
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                error=f"Cannot parse route '{route}' — expected 'XXX-YYY'",
            )

        start = time.time()

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, self._fetch_sync, origin, destination, travel_date
            )
        except ImportError as exc:
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                error=f"fast-flights not installed: {exc}. Run: pip install fast-flights",
            )
        except Exception as exc:
            latency_ms = int((time.time() - start) * 1000)
            if _is_blocked_error(exc):
                return self.challenge_result(
                    route, travel_date, advance_days,
                    f"Google Flights blocked request: {str(exc)[:200]}",
                )
            logger.exception("GoogleFlightsAdapter unexpected error for %s %s", route, travel_date)
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                latency_ms=latency_ms,
                error=f"Unexpected error: {str(exc)[:200]}",
            )

        latency_ms = int((time.time() - start) * 1000)

        if result is None:
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="CHALLENGE_DETECTED",
                latency_ms=latency_ms,
                challenge_reason="fast-flights returned None — likely blocked or no results",
            )

        flights = getattr(result, "flights", None) or []
        if not flights:
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="NO_DATA",
                latency_ms=latency_ms,
                error="Google Flights returned 0 flights for this route/date",
            )

        records: list[FareRecord] = []
        rejected = 0

        for flight in flights:
            try:
                rec = self._map_flight(flight, origin, destination, route, travel_date, advance_days)
                if rec:
                    records.append(rec)
                else:
                    rejected += 1
            except Exception:
                logger.debug("Failed to map flight object", exc_info=True)
                rejected += 1

        if not records:
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                latency_ms=latency_ms,
                records_rejected=rejected,
                error="All flight objects failed price parsing",
            )

        logger.info(
            "GoogleFlights: %s %s → %d records (rejected %d) in %dms",
            route, travel_date, len(records), rejected, latency_ms,
        )
        return CollectionResult(
            source_id=SOURCE_ID, route=route, travel_date=travel_date,
            advance_days=advance_days, status="SUCCESS",
            records=records, records_rejected=rejected, latency_ms=latency_ms,
        )

    # ── sync helper (runs in thread pool to avoid blocking the event loop) ──

    def _fetch_sync(self, origin: str, destination: str, travel_date: str):
        """Call fast-flights synchronously. Raises on any error."""
        from fast_flights import FlightQuery, Passengers, create_query, get_flights  # noqa

        query = create_query(
            flights=[
                FlightQuery(
                    date=travel_date,
                    from_airport=origin,
                    to_airport=destination,
                )
            ],
            seat="economy",
            trip="one-way",
            passengers=Passengers(adults=1),
            currency="INR",
        )
        return get_flights(query)

    # ── mapping ────────────────────────────────────────────────────────────

    def _map_flight(
        self,
        flight,
        origin: str,
        destination: str,
        route: str,
        travel_date: str,
        advance_days: int,
    ) -> Optional[FareRecord]:
        total_fare = _parse_price(getattr(flight, "price", None))
        if total_fare is None or total_fare <= 0:
            return None

        # Google Flights shows all-in fares; split heuristically.
        # Indian domestic: base ~80%, taxes ~20% is a reasonable split.
        # We tag quality_flags so downstream can note the heuristic.
        base_fare = round(total_fare * 0.80, 2)
        taxes = round(total_fare - base_fare, 2)

        airline = _airline_name(flight)
        dep = _hhmm(getattr(flight, "departure", None))
        arr = _hhmm(getattr(flight, "arrival", None))
        stops = int(getattr(flight, "stops", 0) or 0)

        raw_hash = _make_hash(route, travel_date, airline, total_fare, dep, arr)

        return FareRecord(
            origin=origin,
            destination=destination,
            route=route,
            airline=airline,
            travel_date=travel_date,
            advance_days=advance_days,
            base_fare=base_fare,
            taxes=taxes,
            fees=0.0,
            total_fare=total_fare,
            currency="INR",
            departure_time=dep,
            arrival_time=arr,
            stops=stops,
            fare_family="SAVER",
            cabin="ECONOMY",
            source=SOURCE_ID,
            source_url=SOURCE_URL,
            data_origin="REAL",   # genuine Google Flights price
            raw_hash=raw_hash,
            quality_flags=["BASE_TAX_HEURISTIC"],  # taxes split is estimated
        )
