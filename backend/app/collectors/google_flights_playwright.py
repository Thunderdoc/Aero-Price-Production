"""Low-volume Google Flights UI collector.

This uses the public rendered Google Flights page through Playwright.  It is
deliberately conservative: one route at a time, no CAPTCHA bypass, and only
prices visibly present in the page text are returned.
"""
import asyncio
import hashlib
import re
import time

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter

SOURCE_ID = "google-flights-playwright"
_PRICE = re.compile(r"(?:₹|INR\s*)([0-9][0-9,]*)")


class GoogleFlightsPlaywrightAdapter(FareSourceAdapter):
    source_id = SOURCE_ID
    source_name = "Google Flights (Playwright public UI)"
    source_type = "AGGREGATOR"
    requires_credentials = False

    def __init__(self, config=None):
        super().__init__(config)
        self._last_request = 0.0

    async def collect(self, route, travel_date, advance_days, collection_run_id):
        origin, _, destination = route.partition("-")
        if not origin or not destination:
            return CollectionResult(SOURCE_ID, route, travel_date, advance_days, "FAILED", error="Invalid route")
        started = time.monotonic()
        try:
            from fast_flights import FlightQuery, Passengers, create_query
            from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
            query = create_query(
                flights=[FlightQuery(date=travel_date, from_airport=origin, to_airport=destination)],
                seat="economy", trip="one-way", passengers=Passengers(adults=1), currency="INR",
            )
            await asyncio.sleep(max(0.0, 8.0 - (time.monotonic() - self._last_request)))
            self._last_request = time.monotonic()
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                page = await browser.new_page(locale="en-IN")
                try:
                    await page.goto(query.url(), wait_until="domcontentloaded", timeout=45000)
                    await page.wait_for_timeout(7000)
                    text = await page.locator("body").inner_text()
                finally:
                    await browser.close()
            if any(signal in text.lower() for signal in ("unusual traffic", "captcha", "not a robot", "access denied")):
                return self.challenge_result(route, travel_date, advance_days, "Google Flights challenged the browser session.")
            records = self._parse(text, origin, destination, route, travel_date, advance_days)
            return CollectionResult(SOURCE_ID, route, travel_date, advance_days, "SUCCESS" if records else "NO_DATA",
                                    records=records, latency_ms=int((time.monotonic() - started) * 1000),
                                    error=None if records else "Google Flights page contained no parseable fares.")
        except PlaywrightTimeout:
            return CollectionResult(SOURCE_ID, route, travel_date, advance_days, "TIMEOUT", latency_ms=int((time.monotonic() - started) * 1000), error="Google Flights timed out.")
        except ImportError as exc:
            return CollectionResult(SOURCE_ID, route, travel_date, advance_days, "NOT_CONFIGURED", error=f"Playwright is not installed: {exc}")
        except Exception as exc:
            return CollectionResult(SOURCE_ID, route, travel_date, advance_days, "FAILED", latency_ms=int((time.monotonic() - started) * 1000), error=f"Playwright provider error: {str(exc)[:240]}")

    @staticmethod
    def _parse(text, origin, destination, route, travel_date, advance_days):
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        records = []
        airlines = {"IndiGo", "Air India", "Air India Express", "Akasa Air", "SpiceJet", "Vistara", "Alliance Air"}
        for index, line in enumerate(lines):
            match = _PRICE.search(line)
            if not match:
                continue
            fare = float(match.group(1).replace(",", ""))
            if fare <= 0:
                continue
            window = lines[max(0, index - 8):index]
            airline = next((candidate for candidate in reversed(window) if candidate in airlines), "Google Flights result")
            context = " ".join(window)
            stops = 0 if "nonstop" in context.lower() else 1 if "1 stop" in context.lower() else 0
            fingerprint = hashlib.sha256(f"{route}|{travel_date}|{airline}|{fare}|{index}".encode()).hexdigest()
            records.append(FareRecord(origin=origin, destination=destination, route=route, airline=airline,
                travel_date=travel_date, advance_days=advance_days, base_fare=fare, taxes=0.0, fees=0.0,
                total_fare=fare, currency="INR", stops=stops, cabin="ECONOMY", source=SOURCE_ID,
                source_url="https://www.google.com/travel/flights", data_origin="REAL", raw_hash=fingerprint))
            if len(records) >= 20:
                break
        return records
