"""No-key Google Flights public-interface adapter using ``fast-flights``.

This is an opt-in dependency at deployment level: if the package is absent,
the adapter reports NOT_CONFIGURED rather than silently switching to fake data.
The upstream library queries the public Google Flights interface; it is not an
official Google API and must be rate-limited by the scheduler.
"""
import asyncio
import hashlib
import json
import time

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter


class FastFlightsAdapter(FareSourceAdapter):
    source_id = "fast-flights"
    source_name = "Google Flights via fast-flights"
    source_type = "PUBLIC_INTERFACE"

    def is_configured(self) -> bool:
        try:
            import fast_flights  # noqa: F401
            return True
        except ImportError:
            return False

    @staticmethod
    def _format_datetime(value) -> str | None:
        if not value or not getattr(value, "date", None) or not getattr(value, "time", None):
            return None
        year, month, day = value.date
        parts = list(value.time)
        hour = int(parts[0]) if parts and parts[0] is not None else 0
        minute = int(parts[1]) if len(parts) > 1 and parts[1] is not None else 0
        return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00"

    @staticmethod
    def _map_flight(flight, origin: str, destination: str, route: str,
                    travel_date: str, advance_days: int) -> FareRecord | None:
        price = getattr(flight, "price", None)
        airlines = getattr(flight, "airlines", None) or []
        legs = getattr(flight, "flights", None) or []
        if not isinstance(price, (int, float)) or price <= 0 or not airlines or not legs:
            return None
        first, last = legs[0], legs[-1]
        payload = {
            "route": route, "travel_date": travel_date, "price": price,
            "airlines": list(airlines), "departure": str(getattr(first, "departure", "")),
            "arrival": str(getattr(last, "arrival", "")),
        }
        return FareRecord(
            origin=origin, destination=destination, route=route,
            airline=str(airlines[0]), travel_date=travel_date,
            advance_days=advance_days, base_fare=float(price), taxes=0.0,
            fees=0.0, total_fare=float(price), currency="INR",
            departure_time=FastFlightsAdapter._format_datetime(getattr(first, "departure", None)),
            arrival_time=FastFlightsAdapter._format_datetime(getattr(last, "arrival", None)),
            stops=max(0, len(legs) - 1), cabin="ECONOMY",
            source=FastFlightsAdapter.source_id,
            source_url="https://www.google.com/travel/flights",
            data_origin="REAL",
            raw_hash=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
        )

    async def collect(self, route: str, travel_date: str, advance_days: int,
                      collection_run_id: str) -> CollectionResult:
        if not self.is_configured():
            return self.not_configured_result(route, travel_date, advance_days)
        origin, separator, destination = route.upper().partition("-")
        if not separator or len(origin) != 3 or len(destination) != 3:
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error="Invalid IATA route")
        started = time.monotonic()

        def search():
            from fast_flights import FlightQuery, Passengers, create_query, get_flights
            query = create_query(
                flights=[FlightQuery(date=travel_date, from_airport=origin,
                                     to_airport=destination)],
                seat="economy", trip="one-way", passengers=Passengers(adults=1),
                currency="INR",
            )
            return get_flights(query)

        try:
            results = await asyncio.wait_for(asyncio.to_thread(search), timeout=45)
        except asyncio.TimeoutError:
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "TIMEOUT", error="fast-flights timed out",
                                    latency_ms=int((time.monotonic()-started)*1000))
        except Exception as exc:
            return CollectionResult(self.source_id, route, travel_date, advance_days,
                                    "FAILED", error=str(exc)[:500],
                                    latency_ms=int((time.monotonic()-started)*1000))
        records = [record for flight in results
                   for record in [self._map_flight(flight, origin, destination, route,
                                                   travel_date, advance_days)]
                   if record is not None]
        return CollectionResult(
            self.source_id, route, travel_date, advance_days,
            "SUCCESS" if records else "NO_DATA", records=records,
            records_rejected=max(0, len(results)-len(records)),
            latency_ms=int((time.monotonic()-started)*1000))
