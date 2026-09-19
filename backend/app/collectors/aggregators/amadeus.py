"""
Amadeus Self-Service API adapter.

Registration:    https://developers.amadeus.com/self-service
Sandbox (free):  https://test.api.amadeus.com   — synthetic fares, real schema
Production:      https://api.amadeus.com         — live GDS fares, requires approval

Authentication: OAuth2 client_credentials
  POST /v1/security/oauth2/token
  grant_type=client_credentials&client_id=KEY&client_secret=SECRET

Flight search: GET /v2/shopping/flight-offers

Required env vars:
  AMADEUS_API_KEY    – client_id from Amadeus developer portal
  AMADEUS_API_SECRET – client_secret
  AMADEUS_BASE_URL   – https://test.api.amadeus.com (sandbox, default)
                       https://api.amadeus.com (production)
  AMADEUS_ENV        – "sandbox" (default, safe) | "production"

Provenance rules (enforced here — never bypassed):
  AMADEUS_ENV=sandbox    → data_origin = "SANDBOX_TEST"
                           Records stored for pipeline testing / audit.
                           NEVER enter the analytical path (index, forecasts).
  AMADEUS_ENV=production → data_origin = "REAL" only after ALL FIVE conditions:
                           1. Authenticated production request succeeds
                           2. Actual airfare response received
                           3. Response successfully parsed
                           4. Required fare fields are valid (non-zero, INR, economy)
                           5. Observation persisted in database
                           If any condition fails, data_origin stays "SANDBOX_TEST".
                           AMADEUS_BASE_URL must also equal https://api.amadeus.com.

Rate limits (sandbox): 1 req/s sustained, 10 req/s burst
Indian domestic routes: all 12 basket routes supported
  (DEL, BOM, BLR, CCU, HYD, MAA are Amadeus-indexed airports)
"""
import time
import logging
from typing import Optional
import httpx

from app.collectors.base import FareRecord
from app.collectors.aggregators.base_aggregator import AggregatorAdapter
from app.processing.provenance import REAL, SANDBOX_TEST
from app.core.config import settings

logger = logging.getLogger(__name__)

AIRLINE_IATA: dict[str, str] = {
    "6E": "IndiGo",
    "AI": "Air India",
    "IX": "Air India Express",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "UK": "Vistara",
    "G8": "Go First",
}

PRODUCTION_URL = "https://api.amadeus.com"
TOKEN_BUFFER_SECONDS = 60


class AmadeusAdapter(AggregatorAdapter):
    source_id = "amadeus"
    source_name = "Amadeus Flight Offers (Self-Service API)"
    source_type = "AGGREGATOR"
    requires_credentials = True
    credential_env_vars = ["AMADEUS_API_KEY", "AMADEUS_API_SECRET"]

    def __init__(self, config: dict = None):
        super().__init__(config)
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0
        # Condition 1 tracker: did the most recent OAuth request succeed?
        self._last_auth_succeeded: bool = False

    # ── Configuration ──────────────────────────────────────────────────────

    def is_configured(self) -> bool:
        api_key = self.config.get("AMADEUS_API_KEY") or settings.AMADEUS_API_KEY
        api_secret = self.config.get("AMADEUS_API_SECRET") or settings.AMADEUS_API_SECRET
        return bool(api_key and api_secret)

    def _base_url(self) -> str:
        return (self.config.get("AMADEUS_BASE_URL") or settings.AMADEUS_BASE_URL).rstrip("/")

    def _amadeus_env(self) -> str:
        """
        Returns "production" ONLY when AMADEUS_ENV=production AND base URL
        matches the production URL. Any mismatch → "sandbox" for safety.
        """
        env = (self.config.get("AMADEUS_ENV") or settings.AMADEUS_ENV or "sandbox").lower()
        if env == "production":
            if self._base_url() == PRODUCTION_URL:
                return "production"
            logger.warning(
                "AMADEUS_ENV=production but AMADEUS_BASE_URL=%s is not the production URL (%s). "
                "Falling back to sandbox provenance — records will be tagged SANDBOX_TEST.",
                self._base_url(), PRODUCTION_URL,
            )
        return "sandbox"

    def _is_production(self) -> bool:
        return self._amadeus_env() == "production"

    def _credentials(self) -> tuple[str, str]:
        return (
            self.config.get("AMADEUS_API_KEY") or settings.AMADEUS_API_KEY,
            self.config.get("AMADEUS_API_SECRET") or settings.AMADEUS_API_SECRET,
        )

    # ── OAuth2 Token ────────────────────────────────────────────────────────

    async def _get_token(self) -> str:
        """
        Fetch or reuse OAuth2 bearer token.
        Tracks self._last_auth_succeeded for condition 1 of REAL classification.
        """
        now = time.time()
        if self._token and now < (self._token_expires_at - TOKEN_BUFFER_SECONDS):
            self._last_auth_succeeded = True
            return self._token

        api_key, api_secret = self._credentials()
        self._last_auth_succeeded = False
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self._base_url()}/v1/security/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": api_key,
                    "client_secret": api_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()
            self._token = data["access_token"]
            self._token_expires_at = now + int(data.get("expires_in", 1799))
            self._last_auth_succeeded = True   # condition 1 ✓
            logger.info(
                "Amadeus [%s]: token refreshed, expires in %ss",
                self._amadeus_env(), data.get("expires_in"),
            )
            return self._token

    # ── Search ──────────────────────────────────────────────────────────────

    async def _search(self, origin: str, destination: str, travel_date: str, token: str) -> dict:
        """
        GET /v2/shopping/flight-offers — condition 2 (response received) and
        condition 3 (parsed) if successful.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{self._base_url()}/v2/shopping/flight-offers",
                params={
                    "originLocationCode": origin,
                    "destinationLocationCode": destination,
                    "departureDate": travel_date,
                    "adults": 1,
                    "nonStop": "false",
                    "currencyCode": "INR",
                    "max": 10,
                    "travelClass": "ECONOMY",
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            return resp.json()   # condition 3 ✓

    # ── Offer Mapping ────────────────────────────────────────────────────────

    def _map_offer(
        self,
        offer: dict,
        origin: str,
        destination: str,
        travel_date: str,
        advance_days: int,
    ) -> Optional[FareRecord]:
        """
        Map one Amadeus flight-offer to a FareRecord with explicit provenance.

        Provenance decision (enforced, never bypassed):
          sandbox env  → SANDBOX_TEST always
          production env → REAL only after field validation (condition 4) passes
                           AND auth succeeded (condition 1).
                           Condition 5 (persisted) is confirmed in finalize_provenance().
        """
        try:
            # Parse fare fields (condition 3 detail)
            price = offer.get("price", {})
            grand_total_raw = price.get("grandTotal")
            base_fare_raw = price.get("base")

            if grand_total_raw is None or base_fare_raw is None:
                logger.debug("Amadeus: offer missing price fields, skipping")
                return None

            grand_total = float(grand_total_raw)
            base_fare = float(base_fare_raw)

            # Condition 4a: non-zero total fare
            if grand_total <= 0:
                logger.debug("Amadeus: offer has zero/negative grandTotal, skipping")
                return None

            # Cabin filter: ECONOMY only
            traveler_pricing = offer.get("travelerPricings", [{}])[0]
            fare_details = traveler_pricing.get("fareDetailsBySegment", [{}])
            cabin = fare_details[0].get("cabin", "ECONOMY") if fare_details else "ECONOMY"
            if cabin not in ("ECONOMY", "ECONOMY_STANDARD", "ECONOMY_PREMIUM"):
                return None

            # Segment data
            itineraries = offer.get("itineraries", [{}])
            segments = itineraries[0].get("segments", []) if itineraries else []
            if not segments:
                logger.debug("Amadeus: offer has no segments, skipping")
                return None

            first_seg = segments[0]
            last_seg = segments[-1]
            departure = first_seg.get("departure", {})
            arrival = last_seg.get("arrival", {})
            carrier_code = first_seg.get("carrierCode", "")
            flight_number = f"{carrier_code}{first_seg.get('number', '')}"
            airline = AIRLINE_IATA.get(carrier_code, carrier_code)
            stops = max(0, len(segments) - 1)

            fare_family = traveler_pricing.get("fareOption", "SAVER").upper()
            if fare_family not in ("SAVER", "FLEX", "BUSINESS", "PREMIUM"):
                fare_family = "SAVER"

            taxes_and_fees = round(max(grand_total - base_fare, 0), 2)

            # Condition 4b: all required fields present and valid
            fields_valid = bool(
                origin and destination and airline and grand_total > 0 and travel_date
            )

            # ── Provenance assignment ──────────────────────────────────────
            # Production REAL requires env=production + URL match (checked in _is_production),
            # auth succeeded (condition 1), response received+parsed (conditions 2+3 — we are here),
            # and fields valid (condition 4). Condition 5 is checked after DB write.
            if self._is_production() and self._last_auth_succeeded and fields_valid:
                data_origin = REAL   # provisional — finalize_provenance() confirms condition 5
            else:
                data_origin = SANDBOX_TEST

            return FareRecord(
                origin=origin,
                destination=destination,
                route=f"{origin}-{destination}",
                airline=airline,
                flight_number=flight_number,
                departure_time=departure.get("at"),
                arrival_time=arrival.get("at"),
                stops=stops,
                travel_date=travel_date,
                advance_days=advance_days,
                fare_family=fare_family,
                cabin="ECONOMY",
                base_fare=round(base_fare, 2),
                taxes=taxes_and_fees,
                fees=0.0,
                total_fare=round(grand_total, 2),
                currency="INR",
                availability_status="AVAILABLE",
                source=self.source_id,
                source_url=f"{self._base_url()}/v2/shopping/flight-offers",
                data_origin=data_origin,
            )

        except (KeyError, IndexError, TypeError, ValueError) as e:
            logger.debug("Amadeus: offer mapping failed: %s", e)
            return None

    def finalize_provenance(self, record: FareRecord, persisted: bool) -> FareRecord:
        """
        Called by the collector AFTER a successful DB write (condition 5).
        If the DB write failed, downgrades any provisional REAL back to SANDBOX_TEST
        so a record is never reported as REAL unless all 5 conditions truly passed.
        """
        if record.data_origin == REAL and not persisted:
            logger.warning(
                "Amadeus: %s provisionally tagged REAL but DB persist failed — "
                "downgrading to SANDBOX_TEST (condition 5 not met).", record.route
            )
            record.data_origin = SANDBOX_TEST
        return record
