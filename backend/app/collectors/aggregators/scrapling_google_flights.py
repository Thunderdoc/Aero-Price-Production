"""Optional Google Flights public-interface probe using Scrapling.

This adapter is deliberately conservative: it uses Scrapling to fetch and
inspect a real Google Flights page, but it stores fare observations only if a
stable machine-readable payload can be extracted. Loose visible price text is
not enough for AeroPrice provenance.
"""
import asyncio
import time
from urllib.parse import quote_plus

from app.collectors.base import CollectionResult, FareSourceAdapter
from app.core.config import settings


class ScraplingGoogleFlightsAdapter(FareSourceAdapter):
    source_id = "scrapling-google-flights"
    source_name = "Google Flights via Scrapling"
    source_type = "PUBLIC_INTERFACE"

    def is_configured(self) -> bool:
        if not settings.SCRAPLING_ENABLED:
            return False
        try:
            import scrapling  # noqa: F401
            return True
        except ImportError:
            return False

    @staticmethod
    def _url(origin: str, destination: str, travel_date: str) -> str:
        query = quote_plus(f"{origin} to {destination} {travel_date} one way")
        return f"https://www.google.com/travel/flights/search?tfs={query}"

    async def collect(self, route: str, travel_date: str, advance_days: int, collection_run_id: str) -> CollectionResult:
        if not self.is_configured():
            return self.not_configured_result(route, travel_date, advance_days)

        origin, sep, destination = route.upper().partition("-")
        if not sep:
            return CollectionResult(self.source_id, route, travel_date, advance_days, "FAILED", error="Invalid route")

        started = time.monotonic()
        url = self._url(origin, destination, travel_date)

        def fetch_probe() -> tuple[int, str, int]:
            from scrapling.fetchers import StealthyFetcher

            page = StealthyFetcher.fetch(
                url,
                headless=settings.SCRAPLING_HEADLESS,
                network_idle=True,
                timeout=45000,
                capture_xhr="",
            )
            text = page.text if isinstance(page.text, str) else str(page.text)
            xhr_count = len(getattr(page, "captured_xhr", []) or [])
            return (getattr(page, "status", None) or 200, text[:2000], xhr_count)

        try:
            status_code, text_sample, xhr_count = await asyncio.wait_for(asyncio.to_thread(fetch_probe), timeout=60)
        except asyncio.TimeoutError:
            return CollectionResult(
                self.source_id, route, travel_date, advance_days, "TIMEOUT",
                error="Scrapling fetch timed out", latency_ms=int((time.monotonic() - started) * 1000),
            )
        except Exception as exc:
            return CollectionResult(
                self.source_id, route, travel_date, advance_days, "FAILED",
                error=str(exc)[:500], latency_ms=int((time.monotonic() - started) * 1000),
            )

        blocked_markers = ("unusual traffic", "captcha", "verify you are human", "detected unusual")
        if any(marker in text_sample.lower() for marker in blocked_markers):
            return CollectionResult(
                self.source_id, route, travel_date, advance_days, "CHALLENGE_DETECTED",
                challenge_reason="Google Flights returned anti-bot/challenge content to Scrapling.",
                http_status=status_code, latency_ms=int((time.monotonic() - started) * 1000),
            )

        return CollectionResult(
            self.source_id, route, travel_date, advance_days, "NO_DATA",
            error=f"Scrapling fetched the page, but no stable fare payload parser is configured. Captured XHR: {xhr_count}.",
            http_status=status_code, latency_ms=int((time.monotonic() - started) * 1000),
        )
