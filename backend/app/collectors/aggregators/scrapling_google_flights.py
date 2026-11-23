"""Google Flights public-interface adapter using Scrapling.

Second keyless fare source (fast-flights is the first). It fetches a real
Google Flights search page with Scrapling's stealth browser and parses the
machine-readable flight payload embedded in the page — the same ``ds:1``
``AF_initDataCallback`` payload fast-flights reads — instead of scraping
loose visible price text.

How the payload works (verified against fast-flights 3.0's parser):
  * The search page embeds ``<script class="ds:1">AF_initDataCallback(
    {key: 'ds:1', hash: ..., data: [...], sideChannel: {}});</script>``.
  * ``payload[3][0]`` is the list of flight offers. Each offer ``k`` has
    ``flight = k[0]`` and ``price = k[1][0][1]``; ``flight[1]`` is the list
    of airline codes and ``flight[2]`` the legs. Each leg carries
    from/to airport codes ([3]/[6]), departure/arrival times ([8]/[10])
    and dates ([20]/[21]) as ``[year, month, day]`` / ``[hour, minute]``.
  * ``payload[7][1][1]`` maps airline codes to names.

Honesty rules enforced here:
  * A fare is stored only when the payload yields a numeric price > 0, a
    non-empty airline list, and legs whose first departure and last arrival
    match the requested route. Anything else is rejected and counted.
  * A leg whose departure date is present but differs from the requested
    travel date is rejected — never store a fare for the wrong day.
  * Provenance is PUBLIC_INTERFACE (scraped public interface), never REAL.
  * No fares are ever fabricated: page loads with no fares -> PARTIAL,
    bot-challenge content -> CHALLENGE_DETECTED, fetch errors -> FAILED.

The search URL uses Google Flights' ``q`` text query (the same form
fast-flights' fetcher accepts for string queries) with ``curr=INR`` so
prices arrive in rupees. The old ``tfs=`` URL carried a plain-text query
where Google expects a base64 protobuf, so it returned an empty search
page — the probe could never have seen fares through it.
"""
import asyncio
import hashlib
import json
import re
import time
from urllib.parse import quote_plus

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter, redact_credentials
from app.core.config import settings
from app.processing.provenance import PUBLIC_INTERFACE

MAX_RECORDS = 20
_SOURCE_URL = "https://www.google.com/travel/flights"

_DS1_SCRIPT_RE = re.compile(
    r'<script[^>]*class="ds:1"[^>]*>(.*?)</script>', re.DOTALL | re.IGNORECASE
)
_DS1_CALLBACK_RE = re.compile(r"AF_initDataCallback\(\{key:\s*'ds:1'", re.IGNORECASE)

_CHALLENGE_MARKERS = (
    "unusual traffic",
    "captcha",
    "verify you are human",
    "detected unusual",
    "not a robot",
)


def _safe_get(seq, index, default=None):
    """Index into a nested list defensively; the payload shape is not a contract."""
    try:
        if isinstance(seq, (list, tuple)) and 0 <= index < len(seq):
            return seq[index]
    except (TypeError, IndexError):
        pass
    return default


def _format_simple_datetime(date_parts, time_parts):
    """Format a [year, month, day] + [hour, minute, ...] pair as ISO, or None."""
    if not date_parts or not time_parts:
        return None
    try:
        year, month, day = (int(v) for v in list(date_parts)[:3])
        parts = list(time_parts)
        hour = int(parts[0]) if parts and parts[0] is not None else 0
        minute = int(parts[1]) if len(parts) > 1 and parts[1] is not None else 0
        return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00"
    except (TypeError, ValueError):
        return None


def _extract_json_value(text, start):
    """Return the JSON value starting at ``text[start]`` (``[`` or ``{``).

    Bracket-matches while respecting JSON strings/escapes, so the payload is
    extracted exactly instead of relying on the trailing ``sideChannel``
    comma that fast-flights' split assumes.
    """
    opening = text[start]
    closing = "]" if opening == "[" else "}"
    depth = 0
    in_string = False
    escaped = False
    for pos in range(start, len(text)):
        char = text[pos]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return text[start:pos + 1]
    return None


def _extract_ds1_payload(html):
    """Parse the ``ds:1`` flight payload out of Google Flights HTML.

    Returns the decoded payload list, or None when the page carries no
    usable payload (empty search page, changed layout, unparseable JSON).
    """
    if not html:
        return None
    scripts = _DS1_SCRIPT_RE.findall(html)
    if not scripts:
        # Fall back to the raw callback text if the script tag shape changed.
        match = _DS1_CALLBACK_RE.search(html)
        if not match:
            return None
        scripts = [html[match.start():match.start() + 2_000_000]]
    for script in scripts:
        data_at = script.find("data:")
        if data_at < 0:
            continue
        value_at = data_at + len("data:")
        while value_at < len(script) and script[value_at] in " \t\r\n":
            value_at += 1
        if value_at >= len(script) or script[value_at] not in "[{":
            continue
        raw = _extract_json_value(script, value_at)
        if raw is None:
            continue
        try:
            payload = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if isinstance(payload, list):
            return payload
    return None


def _airline_names(payload):
    """Build the {code: name} map from payload[7][1][1]; empty when absent."""
    names = {}
    entries = _safe_get(_safe_get(_safe_get(payload, 7), 1), 1)
    if isinstance(entries, list):
        for entry in entries:
            code = _safe_get(entry, 0)
            name = _safe_get(entry, 1)
            if isinstance(code, str) and code and isinstance(name, str) and name:
                names[code] = name
    return names


def _record_from_entry(entry, names, origin, destination, route, travel_date,
                       advance_days):
    """Map one ds:1 flight offer to a FareRecord, or None when invalid."""
    flight = _safe_get(entry, 0)
    price = _safe_get(_safe_get(_safe_get(entry, 1), 0), 1)
    if not isinstance(price, (int, float)) or isinstance(price, bool) or price <= 0:
        return None
    airlines = _safe_get(flight, 1)
    legs = _safe_get(flight, 2)
    if not isinstance(airlines, list) or not airlines:
        return None
    if not isinstance(legs, list) or not legs:
        return None
    first, last = legs[0], legs[-1]
    # Never store a fare for the wrong route: the legs must start at the
    # requested origin and end at the requested destination.
    if _safe_get(first, 3) != origin or _safe_get(last, 6) != destination:
        return None
    # A leg dated for another day is not this search's fare.
    dep_date = _safe_get(first, 20)
    if isinstance(dep_date, (list, tuple)) and len(dep_date) >= 3:
        try:
            year, month, day = (int(v) for v in list(dep_date)[:3])
            if f"{year:04d}-{month:02d}-{day:02d}" != travel_date:
                return None
        except (TypeError, ValueError):
            return None
    airline_code = str(airlines[0]).strip()
    if not airline_code:
        return None
    departure = _format_simple_datetime(_safe_get(first, 20), _safe_get(first, 8))
    arrival = _format_simple_datetime(_safe_get(last, 21), _safe_get(last, 10))
    payload = {
        "route": route, "travel_date": travel_date, "price": price,
        "airlines": [str(a) for a in airlines],
        "departure": departure or "", "arrival": arrival or "",
    }
    return FareRecord(
        origin=origin, destination=destination, route=route,
        airline=names.get(airline_code, airline_code),
        travel_date=travel_date, advance_days=advance_days,
        base_fare=float(price), taxes=0.0, fees=0.0, total_fare=float(price),
        currency="INR", departure_time=departure, arrival_time=arrival,
        stops=max(0, len(legs) - 1), cabin="ECONOMY",
        source=ScraplingGoogleFlightsAdapter.source_id,
        source_url=_SOURCE_URL, data_origin=PUBLIC_INTERFACE,
        raw_hash=hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
    )


def parse_google_flights_html(html, origin, destination, route, travel_date,
                              advance_days):
    """Parse fares out of fetched Google Flights HTML.

    Returns ``(records, rejected, payload_found, offers)`` where ``offers``
    is the credential-free summary kept for the audit trail. Pure function —
    no network access, safe to test offline with a saved fixture.
    """
    payload = _extract_ds1_payload(html)
    if payload is None:
        return [], 0, False, []
    entries = _safe_get(_safe_get(payload, 3), 0)
    if not isinstance(entries, list):
        return [], 0, True, []
    names = _airline_names(payload)
    records, seen, rejected = [], set(), 0
    for entry in entries:
        record = _record_from_entry(
            entry, names, origin, destination, route, travel_date, advance_days
        )
        if record is None:
            rejected += 1
            continue
        key = (record.airline, record.total_fare, record.departure_time, record.arrival_time)
        if key in seen:
            rejected += 1
            continue
        seen.add(key)
        records.append(record)
        if len(records) >= MAX_RECORDS:
            break
    offers = [
        {
            "price": r.total_fare,
            "airline": r.airline,
            "departure": r.departure_time,
            "arrival": r.arrival_time,
            "stops": r.stops,
        }
        for r in records
    ]
    return records, rejected, True, offers


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
        query = quote_plus(f"Flights from {origin} to {destination} on {travel_date}")
        return f"{_SOURCE_URL}?q={query}&hl=en&curr=INR"

    def _fetch_page(self, url: str) -> tuple[int, str, str, int]:
        """Fetch the search page with the stealth browser (blocking call).

        Returns ``(http_status, html, visible_text, xhr_count)``. Kept as a
        separate method so tests can monkeypatch the network boundary.
        """
        from scrapling.fetchers import StealthyFetcher

        page = StealthyFetcher.fetch(
            url,
            headless=settings.SCRAPLING_HEADLESS,
            network_idle=True,
            timeout=45000,
            capture_xhr="",
        )
        html = ""
        body = getattr(page, "body", None)
        if isinstance(body, (bytes, bytearray)):
            html = bytes(body).decode("utf-8", "replace")
        if not html:
            content = getattr(page, "html_content", None)
            html = str(content) if content else ""
        text = page.text if isinstance(page.text, str) else str(page.text or "")
        xhr_count = len(getattr(page, "captured_xhr", []) or [])
        return (getattr(page, "status", None) or 200, html, text, xhr_count)

    async def collect(self, route: str, travel_date: str, advance_days: int, collection_run_id: str) -> CollectionResult:
        if not self.is_configured():
            return self.not_configured_result(route, travel_date, advance_days)

        origin, sep, destination = route.upper().partition("-")
        if not sep or len(origin) != 3 or len(destination) != 3:
            return CollectionResult(self.source_id, route, travel_date, advance_days, "FAILED", error="Invalid IATA route")

        started = time.monotonic()
        url = self._url(origin, destination, travel_date)

        try:
            status_code, html, text, xhr_count = await asyncio.wait_for(
                asyncio.to_thread(self._fetch_page, url), timeout=60
            )
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

        latency_ms = int((time.monotonic() - started) * 1000)
        haystack = f"{text}\n{html[:4000]}".lower()
        if any(marker in haystack for marker in _CHALLENGE_MARKERS):
            return CollectionResult(
                self.source_id, route, travel_date, advance_days, "CHALLENGE_DETECTED",
                challenge_reason="Google Flights returned anti-bot/challenge content to Scrapling.",
                http_status=status_code, latency_ms=latency_ms,
            )

        records, rejected, payload_found, offers = parse_google_flights_html(
            html, origin, destination, route, travel_date, advance_days
        )
        if records:
            return CollectionResult(
                self.source_id, route, travel_date, advance_days, "SUCCESS",
                records=records, records_rejected=rejected,
                raw_response=redact_credentials(json.dumps(offers, default=str)),
                http_status=status_code, latency_ms=latency_ms,
            )
        detail = (
            "no valid fares for this route/date in the ds:1 payload"
            if payload_found
            else "no ds:1 fare payload found in the fetched page"
        )
        return CollectionResult(
            self.source_id, route, travel_date, advance_days, "PARTIAL",
            records_rejected=rejected,
            error=f"Scrapling fetched the page, but {detail}. Captured XHR: {xhr_count}.",
            http_status=status_code, latency_ms=latency_ms,
        )
