"""Authorized Google Flights collection through SerpApi.

SerpApi is queried server-side with the account key.  Each stored value is an
actual offer returned for the requested route/date; this adapter never creates
fallback prices.  To protect provider quota, the standard collection uses the
T+7 window only (one request per monitored route per run).
"""
import hashlib
import json
import time
from typing import Any

import httpx

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter
from app.core.config import settings


class SerpApiGoogleFlightsAdapter(FareSourceAdapter):
    source_id = "serpapi-google-flights"
    source_name = "SerpApi Google Flights"
    source_type = "AGGREGATOR"
    requires_credentials = True
    credential_env_vars = ["SERPAPI_API_KEY"]

    def is_configured(self) -> bool:
        return bool(self.config.get("SERPAPI_API_KEY") or settings.SERPAPI_API_KEY)

    async def collect(self, route: str, travel_date: str, advance_days: int, collection_run_id: str) -> CollectionResult:
        if not self.is_configured():
            return self.not_configured_result(route, travel_date, advance_days)
        if advance_days != 7:
            return CollectionResult(self.source_id, route, travel_date, advance_days, "SKIPPED",
                                    error="Quota guard: Google Flights is collected at T+7 only.")
        origin, _, destination = route.partition("-")
        if not origin or not destination:
            return CollectionResult(self.source_id, route, travel_date, advance_days, "FAILED", error="Invalid route")
        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get("https://serpapi.com/search.json", params={
                    "engine": "google_flights", "departure_id": origin, "arrival_id": destination,
                    "outbound_date": travel_date, "currency": "INR", "hl": "en", "type": "2",
                    "adults": 1, "travel_class": 1,
                    "api_key": self.config.get("SERPAPI_API_KEY") or settings.SERPAPI_API_KEY,
                })
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            return CollectionResult(self.source_id, route, travel_date, advance_days, "FAILED",
                                    latency_ms=int((time.time() - start) * 1000), http_status=exc.response.status_code,
                                    error=f"SerpApi returned HTTP {exc.response.status_code}")
        except httpx.HTTPError:
            return CollectionResult(self.source_id, route, travel_date, advance_days, "FAILED",
                                    latency_ms=int((time.time() - start) * 1000), error="SerpApi request failed")
        if payload.get("error"):
            return CollectionResult(self.source_id, route, travel_date, advance_days, "FAILED",
                                    latency_ms=int((time.time() - start) * 1000), error="SerpApi rejected the request")

        records: list[FareRecord] = []
        for group in [*(payload.get("best_flights") or []), *(payload.get("other_flights") or [])]:
            price = group.get("price")
            legs = group.get("flights") or []
            if not isinstance(price, (int, float)) or price <= 0 or not legs:
                continue
            first, last = legs[0], legs[-1]
            airline = str(first.get("airline") or "Unknown")
            flight_number = str(first.get("flight_number") or "")
            payload_hash = hashlib.sha256(json.dumps({"route": route, "date": travel_date, "flight": flight_number, "price": price}, sort_keys=True).encode()).hexdigest()
            records.append(FareRecord(
                origin=origin, destination=destination, route=route, airline=airline,
                travel_date=travel_date, advance_days=advance_days, base_fare=float(price), taxes=0.0, fees=0.0,
                total_fare=float(price), currency="INR", flight_number=flight_number,
                departure_time=str((first.get("departure_airport") or {}).get("time") or ""),
                arrival_time=str((last.get("arrival_airport") or {}).get("time") or ""),
                stops=max(0, len(legs) - 1), cabin="ECONOMY", source=self.source_id,
                source_url="https://serpapi.com/google-flights-api", data_origin="REAL", raw_hash=payload_hash,
            ))
        return CollectionResult(self.source_id, route, travel_date, advance_days,
                                "SUCCESS" if records else "NO_DATA", records=records,
                                latency_ms=int((time.time() - start) * 1000))
