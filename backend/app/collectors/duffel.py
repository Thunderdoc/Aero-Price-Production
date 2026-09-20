"""
Duffel Air adapter — legitimate REST API integration.

Uses the Duffel API (https://duffel.com/docs/api) to fetch real flight offers
for SIH26056 corridors. No scraping, no CAPTCHA bypass, no browser impersonation.

PROVENANCE — non-negotiable:
  live_mode=True  in Duffel response → data_origin="REAL"
  live_mode=False in Duffel response → data_origin="SANDBOX_TEST"

  Never display SANDBOX_TEST as LIVE.
  Never fabricate observations when inventory is unavailable.

SETUP:
  1. Create a Duffel account at https://app.duffel.com/join
  2. Generate an Access Token under Developers > Access Tokens
  3. Set DUFFEL_API_TOKEN=<your_token> in backend/.env
     - Tokens starting with "duffel_test_" → sandbox (SANDBOX_TEST provenance)
     - Tokens starting with "duffel_live_" → production (REAL provenance when successful)

INDIA COVERAGE NOTE:
  Duffel aggregates content via GDS (Amadeus, Sabre, Travelport) and NDC.
  Indian LCC coverage (IndiGo, Akasa Air, SpiceJet) may be limited or absent
  on test tokens. Air India (AI) is typically available via Amadeus GDS.
  If no offers are returned for an Indian corridor, the adapter returns NO_DATA
  and does NOT fabricate observations. Availability improves with live tokens.
"""
import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter
from app.core.config import settings

logger = logging.getLogger(__name__)

SOURCE_ID = "duffel"
SOURCE_NAME = "Duffel Air"
SOURCE_URL = "https://duffel.com/"
COLLECTOR_VERSION = "1.0"

DUFFEL_API_BASE = "https://api.duffel.com"
DUFFEL_API_VERSION = "v2"

# Duffel cabin class values
CABIN_ECONOMY = "economy"

# IATA → friendly name for Indian carriers
_IATA_MAP: dict[str, str] = {
    "6E": "IndiGo",
    "AI": "Air India",
    "IX": "Air India Express",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "UK": "Vistara",
    "G8": "Go First",
    "I5": "AirAsia India",
}

# Request timeout (seconds)
_TIMEOUT = 30.0

# Max offers to process per search (keep DB manageable; Duffel can return 100+)
_MAX_OFFERS = 20


def _iata_to_name(code: str) -> str:
    return _IATA_MAP.get(code.upper(), code)


def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _hhmm(dt_str: Optional[str]) -> Optional[str]:
    """Extract HH:MM from an ISO 8601 datetime string."""
    if not dt_str:
        return None
    try:
        # "2026-09-20T06:00:00+05:30" → "06:00"
        t = dt_str.split("T")[-1][:5]
        return t if ":" in t else None
    except Exception:
        return None


def _raw_hash(offer_id: str, route: str, travel_date: str) -> str:
    return hashlib.sha256(
        json.dumps({"offer_id": offer_id, "route": route, "travel_date": travel_date},
                   sort_keys=True).encode()
    ).hexdigest()


def _determine_provenance(live_mode: bool, token: str) -> str:
    """
    Map Duffel response metadata to SIH provenance taxonomy.

    live_mode=True  AND live token  → REAL
    live_mode=False OR  test token  → SANDBOX_TEST

    We double-check against the token prefix so provenance is correct even
    if Duffel ever changes the live_mode field behavior.
    """
    token_is_live = token.startswith("duffel_live_") if token else False
    if live_mode and token_is_live:
        return "REAL"
    return "SANDBOX_TEST"


class DuffelAdapter(FareSourceAdapter):
    """
    Adapter for the Duffel Air REST API.

    Makes authenticated HTTPS POST requests to /air/offer_requests.
    Uses DUFFEL_API_TOKEN from environment — never hardcoded.
    Returns CHALLENGE_DETECTED on auth failure; NO_DATA on no Indian inventory.
    """

    source_id = SOURCE_ID
    source_name = SOURCE_NAME
    source_type = "AGGREGATOR"
    requires_credentials = True
    credential_env_vars = ["DUFFEL_API_TOKEN"]

    def is_configured(self) -> bool:
        token = self.config.get("DUFFEL_API_TOKEN") or getattr(settings, "DUFFEL_API_TOKEN", "")
        return bool(token and token.strip())

    def _token(self) -> str:
        return (
            self.config.get("DUFFEL_API_TOKEN")
            or getattr(settings, "DUFFEL_API_TOKEN", "")
        ).strip()

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
        token = self._token()

        try:
            raw_response, offers = await asyncio.get_event_loop().run_in_executor(
                None,
                self._search_sync,
                token, origin, destination, travel_date,
            )
        except httpx.HTTPStatusError as exc:
            latency_ms = int((time.time() - start) * 1000)
            status_code = exc.response.status_code
            if status_code in (401, 403):
                return self.challenge_result(
                    route, travel_date, advance_days,
                    f"Duffel authentication failed (HTTP {status_code}). "
                    "Check DUFFEL_API_TOKEN in .env.",
                )
            if status_code == 429:
                return CollectionResult(
                    source_id=SOURCE_ID, route=route, travel_date=travel_date,
                    advance_days=advance_days, status="RATE_LIMITED",
                    latency_ms=latency_ms,
                    error=f"Duffel rate limit hit (HTTP 429). Retry after back-off.",
                    http_status=429,
                )
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                latency_ms=latency_ms,
                error=f"Duffel API error HTTP {status_code}: {exc.response.text[:200]}",
                http_status=status_code,
            )
        except httpx.TimeoutException:
            latency_ms = int((time.time() - start) * 1000)
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="TIMEOUT",
                latency_ms=latency_ms,
                error=f"Duffel API timed out after {_TIMEOUT}s",
            )
        except Exception as exc:
            latency_ms = int((time.time() - start) * 1000)
            logger.exception("DuffelAdapter unexpected error for %s %s", route, travel_date)
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                latency_ms=latency_ms,
                error=f"Unexpected error: {str(exc)[:200]}",
            )

        latency_ms = int((time.time() - start) * 1000)

        if not offers:
            logger.info(
                "Duffel: no offers for %s %s (route not in inventory for this token tier)",
                route, travel_date,
            )
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="NO_DATA",
                latency_ms=latency_ms,
                error=(
                    "Duffel returned 0 offers for this corridor. "
                    "Indian LCC content may require a live Duffel token or NDC agreement. "
                    "No observations fabricated."
                ),
            )

        records: list[FareRecord] = []
        rejected = 0

        for offer in offers[:_MAX_OFFERS]:
            try:
                rec = self._map_offer(offer, origin, destination, route, travel_date, advance_days, token, raw_response)
                if rec:
                    records.append(rec)
                else:
                    rejected += 1
            except Exception:
                logger.debug("Failed to map Duffel offer", exc_info=True)
                rejected += 1

        if not records:
            return CollectionResult(
                source_id=SOURCE_ID, route=route, travel_date=travel_date,
                advance_days=advance_days, status="FAILED",
                latency_ms=latency_ms,
                records_rejected=rejected,
                error="All Duffel offers failed mapping (price parsing or schema mismatch)",
            )

        logger.info(
            "Duffel: %s %s → %d records (rejected %d) in %dms, provenance=%s",
            route, travel_date, len(records), rejected, latency_ms,
            records[0].data_origin if records else "N/A",
        )
        return CollectionResult(
            source_id=SOURCE_ID, route=route, travel_date=travel_date,
            advance_days=advance_days, status="SUCCESS",
            records=records, records_rejected=rejected, latency_ms=latency_ms,
        )

    # ── sync HTTP call (runs in thread pool) ───────────────────────────────

    def _search_sync(
        self,
        token: str,
        origin: str,
        destination: str,
        travel_date: str,
    ) -> tuple[dict, list[dict]]:
        """
        POST /air/offer_requests to Duffel.
        Returns (full_response_dict, list_of_offer_dicts).
        Raises httpx exceptions on HTTP/network errors.
        """
        headers = {
            "Authorization": f"Bearer {token}",
            "Duffel-Version": DUFFEL_API_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
        }
        body = {
            "data": {
                "cabin_class": CABIN_ECONOMY,
                "passengers": [{"type": "adult"}],
                "slices": [
                    {
                        "origin": origin,
                        "destination": destination,
                        "departure_date": travel_date,
                    }
                ],
            }
        }

        with httpx.Client(timeout=_TIMEOUT) as client:
            response = client.post(
                f"{DUFFEL_API_BASE}/air/offer_requests",
                headers=headers,
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        raw = data.get("data", {})
        offers = raw.get("offers", [])
        return raw, offers

    # ── offer → FareRecord mapping ─────────────────────────────────────────

    def _map_offer(
        self,
        offer: dict,
        origin: str,
        destination: str,
        route: str,
        travel_date: str,
        advance_days: int,
        token: str,
        raw_response: dict,
    ) -> Optional[FareRecord]:
        # Price
        total_fare = _safe_float(offer.get("total_amount"))
        if total_fare is None or total_fare <= 0:
            return None
        base_fare = _safe_float(offer.get("base_amount")) or round(total_fare * 0.80, 2)
        taxes = _safe_float(offer.get("tax_amount")) or round(total_fare - base_fare, 2)

        # Currency — must be INR for this pipeline
        currency = (offer.get("total_currency") or "INR").upper()

        # Provenance — derived from live_mode field AND token prefix
        live_mode: bool = bool(offer.get("live_mode", False))
        data_origin = _determine_provenance(live_mode, token)

        # Airline — from owner or first segment's marketing carrier
        owner = offer.get("owner", {})
        airline_code = owner.get("iata_code", "")
        airline_name = owner.get("name") or _iata_to_name(airline_code) or "Unknown"

        # Flight details from slices → segments
        slices = offer.get("slices", [])
        dep_time: Optional[str] = None
        arr_time: Optional[str] = None
        flight_number: Optional[str] = None
        stops = 0
        fare_family: Optional[str] = None
        cabin = "ECONOMY"

        if slices:
            first_slice = slices[0]
            fare_family = first_slice.get("fare_brand_name")
            segments = first_slice.get("segments", [])
            stops = max(0, len(segments) - 1) + sum(
                len(seg.get("stops", [])) for seg in segments
            )
            if segments:
                first_seg = segments[0]
                last_seg = segments[-1]
                dep_time = _hhmm(first_seg.get("departing_at"))
                arr_time = _hhmm(last_seg.get("arriving_at"))
                mc = first_seg.get("marketing_carrier", {})
                if not airline_code:
                    airline_code = mc.get("iata_code", "")
                    airline_name = mc.get("name") or _iata_to_name(airline_code) or airline_name
                fn = first_seg.get("marketing_carrier_flight_number", "")
                if fn:
                    flight_number = f"{airline_code}{fn}"
                # Cabin from first passenger on first segment
                pax_list = first_seg.get("passengers", [])
                if pax_list:
                    cabin = (pax_list[0].get("cabin_class") or "economy").upper()

        offer_id = offer.get("id", "")
        quality_flags: list[str] = []
        if currency != "INR":
            quality_flags.append(f"CURRENCY_{currency}")
        if not offer.get("tax_amount"):
            quality_flags.append("TAX_HEURISTIC")

        return FareRecord(
            origin=origin,
            destination=destination,
            route=route,
            airline=airline_name,
            travel_date=travel_date,
            advance_days=advance_days,
            base_fare=round(base_fare, 2),
            taxes=round(taxes, 2),
            fees=0.0,
            total_fare=round(total_fare, 2),
            currency=currency,
            flight_number=flight_number,
            departure_time=dep_time,
            arrival_time=arr_time,
            stops=stops,
            fare_family=fare_family or "SAVER",
            cabin=cabin,
            source=SOURCE_ID,
            source_url=SOURCE_URL,
            data_origin=data_origin,
            raw_hash=_raw_hash(offer_id, route, travel_date),
            quality_flags=quality_flags,
        )
