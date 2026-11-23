"""Offline tests for the Scrapling Google Flights adapter.

All tests run against a small saved fixture that reproduces the real
Google Flights ``ds:1`` payload shape (the same shape fast-flights 3.0
parses: payload[3][0] offers, payload[7][1][1] airline names). No test
ever fetches live Google Flights — the network boundary (``_fetch_page``)
is monkeypatched wherever ``collect()`` is exercised.
"""
import json

import pytest

from app.collectors.aggregators.scrapling_google_flights import (
    ScraplingGoogleFlightsAdapter,
    parse_google_flights_html,
)
from app.processing.provenance import PUBLIC_INTERFACE

ROUTE = "DEL-BOM"
TRAVEL_DATE = "2026-11-29"
ADVANCE_DAYS = 7


def _leg(from_code, to_code, dep_time, arr_time, dep_date, arr_date):
    """A ds:1 leg: [3]=from code, [5]/[6]=to name/code, [8]/[10]=times,
    [11]=duration, [17]=plane, [20]/[21]=dates."""
    leg = [None] * 22
    leg[3] = from_code
    leg[4] = f"{from_code} Airport"
    leg[5] = f"{to_code} Airport"
    leg[6] = to_code
    leg[8] = dep_time
    leg[10] = arr_time
    leg[11] = 125
    leg[17] = "A320"
    leg[20] = dep_date
    leg[21] = arr_date
    return leg


def _offer(price, airlines, legs):
    flight = [None] * 23
    flight[0] = "ONE_WAY"
    flight[1] = airlines
    flight[2] = legs
    flight[22] = [None] * 9
    return [flight, [[None, price]]]


def _payload(offers):
    payload = [None] * 8
    payload[3] = [offers]
    payload[7] = [
        None,
        [
            [["STAR", "Star Alliance"]],
            [["6E", "IndiGo"], ["AI", "Air India"], ["QP", "Akasa Air"]],
        ],
    ]
    return payload


def _html(payload):
    data = json.dumps(payload)
    return (
        "<html><head>"
        "<script class=\"ds:1\">AF_initDataCallback({key: 'ds:1', hash: 'abc', "
        f"data: {data}, sideChannel: {{}}}});</script>"
        "</head><body><div>Google Flights</div></body></html>"
    )


def _valid_offers():
    return [
        _offer(
            5432, ["6E"],
            [_leg("DEL", "BOM", [6, 0], [8, 5], [2026, 11, 29], [2026, 11, 29])],
        ),
        _offer(
            6150, ["AI"],
            [
                _leg("DEL", "HYD", [9, 30], [11, 40], [2026, 11, 29], [2026, 11, 29]),
                _leg("HYD", "BOM", [12, 30], [13, 35], [2026, 11, 29], [2026, 11, 29]),
            ],
        ),
    ]


FIXTURE_HTML = _html(_payload(_valid_offers()))


def test_parse_fixture_returns_records_with_public_interface_origin():
    records, rejected, payload_found, offers = parse_google_flights_html(
        FIXTURE_HTML, "DEL", "BOM", ROUTE, TRAVEL_DATE, ADVANCE_DAYS
    )
    assert payload_found is True
    assert rejected == 0
    assert len(records) == 2

    first, second = records
    assert first.airline == "IndiGo"
    assert first.total_fare == 5432
    assert first.base_fare == 5432
    assert first.currency == "INR"
    assert first.route == ROUTE
    assert first.travel_date == TRAVEL_DATE
    assert first.advance_days == ADVANCE_DAYS
    assert first.stops == 0
    assert first.departure_time == "2026-11-29T06:00:00"
    assert first.arrival_time == "2026-11-29T08:05:00"
    assert first.data_origin == PUBLIC_INTERFACE
    assert first.source == "scrapling-google-flights"
    assert first.raw_hash

    assert second.airline == "Air India"
    assert second.total_fare == 6150
    assert second.stops == 1

    assert [o["price"] for o in offers] == [5432, 6150]


def test_no_record_is_labelled_real():
    records, _, _, _ = parse_google_flights_html(
        FIXTURE_HTML, "DEL", "BOM", ROUTE, TRAVEL_DATE, ADVANCE_DAYS
    )
    assert records
    assert all(r.data_origin == PUBLIC_INTERFACE for r in records)
    assert all(r.data_origin != "REAL" for r in records)


def test_invalid_entries_rejected_not_stored():
    offers = _valid_offers() + [
        # Wrong destination leg.
        _offer(
            4999, ["QP"],
            [_leg("DEL", "MAA", [7, 0], [9, 45], [2026, 11, 29], [2026, 11, 29])],
        ),
        # Zero price.
        _offer(
            0, ["6E"],
            [_leg("DEL", "BOM", [10, 0], [12, 5], [2026, 11, 29], [2026, 11, 29])],
        ),
        # Departure dated for another day.
        _offer(
            5200, ["AI"],
            [_leg("DEL", "BOM", [14, 0], [16, 5], [2026, 11, 30], [2026, 11, 30])],
        ),
        # Exact duplicate of the first valid offer.
        _valid_offers()[0],
    ]
    records, rejected, payload_found, _ = parse_google_flights_html(
        _html(_payload(offers)), "DEL", "BOM", ROUTE, TRAVEL_DATE, ADVANCE_DAYS
    )
    assert payload_found is True
    assert len(records) == 2
    assert rejected == 4


def test_empty_page_returns_no_payload():
    records, rejected, payload_found, _ = parse_google_flights_html(
        "<html><head></head><body>No flights here</body></html>",
        "DEL", "BOM", ROUTE, TRAVEL_DATE, ADVANCE_DAYS,
    )
    assert payload_found is False
    assert records == []
    assert rejected == 0


def test_payload_without_flights_returns_no_records():
    payload = _payload([])
    payload[3] = [None]
    records, _, payload_found, _ = parse_google_flights_html(
        _html(payload), "DEL", "BOM", ROUTE, TRAVEL_DATE, ADVANCE_DAYS
    )
    assert payload_found is True
    assert records == []


def test_search_url_uses_text_query_and_inr():
    url = ScraplingGoogleFlightsAdapter._url("DEL", "BOM", TRAVEL_DATE)
    assert "tfs=" not in url  # the old invalid protobuf param
    assert "q=" in url
    assert "curr=INR" in url
    assert "DEL" in url and "BOM" in url


@pytest.mark.asyncio
async def test_collect_success_with_monkeypatched_fetch(monkeypatch):
    adapter = ScraplingGoogleFlightsAdapter()
    monkeypatch.setattr(
        adapter, "_fetch_page", lambda url: (200, FIXTURE_HTML, "Google Flights", 3)
    )
    result = await adapter.collect(ROUTE, TRAVEL_DATE, ADVANCE_DAYS, "run-1")
    assert result.status == "SUCCESS"
    assert len(result.records) == 2
    assert all(r.data_origin == PUBLIC_INTERFACE for r in result.records)
    assert result.raw_response is not None
    assert "5432" in result.raw_response


@pytest.mark.asyncio
async def test_collect_empty_page_returns_partial(monkeypatch):
    adapter = ScraplingGoogleFlightsAdapter()
    monkeypatch.setattr(
        adapter, "_fetch_page",
        lambda url: (200, "<html><body>empty</body></html>", "empty", 0),
    )
    result = await adapter.collect(ROUTE, TRAVEL_DATE, ADVANCE_DAYS, "run-1")
    assert result.status == "PARTIAL"
    assert result.records == []


@pytest.mark.asyncio
async def test_collect_challenge_page_returns_challenge_detected(monkeypatch):
    adapter = ScraplingGoogleFlightsAdapter()
    monkeypatch.setattr(
        adapter, "_fetch_page",
        lambda url: (
            200,
            "<html><body>Our systems have detected unusual traffic</body></html>",
            "Our systems have detected unusual traffic from your computer network",
            0,
        ),
    )
    result = await adapter.collect(ROUTE, TRAVEL_DATE, ADVANCE_DAYS, "run-1")
    assert result.status == "CHALLENGE_DETECTED"
    assert result.records == []
    assert result.challenge_reason


@pytest.mark.asyncio
async def test_collect_fetch_error_returns_failed(monkeypatch):
    adapter = ScraplingGoogleFlightsAdapter()

    def _boom(url):
        raise RuntimeError("browser crashed")

    monkeypatch.setattr(adapter, "_fetch_page", _boom)
    result = await adapter.collect(ROUTE, TRAVEL_DATE, ADVANCE_DAYS, "run-1")
    assert result.status == "FAILED"
    assert result.records == []


@pytest.mark.asyncio
async def test_collect_invalid_route_returns_failed():
    adapter = ScraplingGoogleFlightsAdapter()
    result = await adapter.collect("NOTAROUTE", TRAVEL_DATE, ADVANCE_DAYS, "run-1")
    assert result.status == "FAILED"
    assert result.records == []
