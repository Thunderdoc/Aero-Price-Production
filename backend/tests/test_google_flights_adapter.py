"""
Smoke tests for GoogleFlightsAdapter.

Unit tests (default) — run fully offline using mocked fast-flights responses.
Live tests — gated behind @pytest.mark.live; skipped by default.

Run offline tests:
    cd backend && pytest tests/test_google_flights_adapter.py -v

Run live test (requires internet, may hit CHALLENGE_DETECTED):
    cd backend && pytest tests/test_google_flights_adapter.py -v -m live
"""
import asyncio
import hashlib
import json
from datetime import date, timedelta
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.collectors.google_flights import (
    GoogleFlightsAdapter,
    SOURCE_ID,
    _is_blocked_error,
    _parse_price,
    _hhmm,
)
from app.collectors.base import CollectionResult


# ── helpers ────────────────────────────────────────────────────────────────

def _travel_date(advance: int) -> str:
    return (date.today() + timedelta(days=advance)).strftime("%Y-%m-%d")


def _make_fake_flight(price=4500, airline="6E", departure="08:30", arrival="10:45", stops=0):
    f = MagicMock()
    f.price = price
    f.airline = airline
    f.airlines = [airline]
    f.departure = departure
    f.arrival = arrival
    f.stops = stops
    return f


def _make_fake_result(flights):
    r = MagicMock()
    r.flights = flights
    return r


# ── unit tests ─────────────────────────────────────────────────────────────

class TestParsers:
    def test_parse_price_int(self):
        assert _parse_price(4500) == 4500.0

    def test_parse_price_str_rupee(self):
        assert _parse_price("₹4,532") == 4532.0

    def test_parse_price_str_inr(self):
        assert _parse_price("INR 3,800") == 3800.0

    def test_parse_price_zero_returns_none(self):
        assert _parse_price(0) is None

    def test_parse_price_none(self):
        assert _parse_price(None) is None

    def test_hhmm_from_string(self):
        assert _hhmm("08:30") == "08:30"

    def test_hhmm_from_datetime_str(self):
        assert _hhmm("2026-01-15T08:30:00+05:30") == "08:30"

    def test_hhmm_none(self):
        assert _hhmm(None) is None


class TestBlockedErrorDetection:
    def test_captcha_string(self):
        assert _is_blocked_error(Exception("CaptchaEncountered: sitekey found"))

    def test_403_string(self):
        assert _is_blocked_error(Exception("HTTP 403 Forbidden"))

    def test_429_string(self):
        assert _is_blocked_error(Exception("429 Too Many Requests"))

    def test_rate_limit(self):
        assert _is_blocked_error(Exception("rate limit exceeded"))

    def test_normal_error_not_blocked(self):
        assert not _is_blocked_error(Exception("Connection timeout"))

    def test_import_error_not_blocked(self):
        assert not _is_blocked_error(ImportError("No module named fast_flights"))


class TestGoogleFlightsAdapterUnit:
    """Offline unit tests using mocked fast-flights responses."""

    def _adapter(self):
        adapter = GoogleFlightsAdapter({"GOOGLE_FLIGHTS_ENABLED": True})
        return adapter

    @pytest.mark.asyncio
    async def test_success_del_bom_t1(self):
        """DEL-BOM T+1: successful response returns REAL records."""
        adapter = self._adapter()
        travel = _travel_date(1)
        fake_flights = [
            _make_fake_flight(4500, "6E", "06:00", "07:55"),
            _make_fake_flight(5200, "AI", "09:15", "11:10"),
            _make_fake_flight(3900, "SG", "14:30", "16:25"),
        ]

        with patch.object(adapter, "_fetch_sync", return_value=_make_fake_result(fake_flights)):
            result = await adapter.collect("DEL-BOM", travel, 1, "run-001")

        assert result.status == "SUCCESS"
        assert len(result.records) == 3
        assert all(r.data_origin == "REAL" for r in result.records)
        assert all(r.currency == "INR" for r in result.records)
        assert all(r.total_fare > 0 for r in result.records)
        assert all(r.route == "DEL-BOM" for r in result.records)
        assert all("BASE_TAX_HEURISTIC" in r.quality_flags for r in result.records)
        assert all(r.source == SOURCE_ID for r in result.records)

    @pytest.mark.asyncio
    async def test_tax_split_heuristic(self):
        """Base fare is 80% of total, taxes are 20%."""
        adapter = self._adapter()
        travel = _travel_date(7)
        fake_flights = [_make_fake_flight(5000)]

        with patch.object(adapter, "_fetch_sync", return_value=_make_fake_result(fake_flights)):
            result = await adapter.collect("DEL-BOM", travel, 7, "run-002")

        rec = result.records[0]
        assert abs(rec.base_fare - 4000.0) < 1.0   # 80%
        assert abs(rec.taxes - 1000.0) < 1.0        # 20%
        assert abs(rec.total_fare - 5000.0) < 1.0

    @pytest.mark.asyncio
    async def test_challenge_detected_on_captcha_error(self):
        """CaptchaEncountered error → CHALLENGE_DETECTED, no fabricated records."""
        adapter = self._adapter()
        travel = _travel_date(1)

        with patch.object(adapter, "_fetch_sync",
                          side_effect=Exception("CaptchaEncountered: sitekey abc")):
            result = await adapter.collect("DEL-BOM", travel, 1, "run-003")

        assert result.status == "CHALLENGE_DETECTED"
        assert result.records == []
        # Must NOT fabricate any data
        assert result.records_rejected == 0

    @pytest.mark.asyncio
    async def test_challenge_detected_on_403(self):
        """HTTP 403 → CHALLENGE_DETECTED."""
        adapter = self._adapter()
        travel = _travel_date(1)

        with patch.object(adapter, "_fetch_sync",
                          side_effect=Exception("HTTP 403 Forbidden")):
            result = await adapter.collect("DEL-BOM", travel, 1, "run-004")

        assert result.status == "CHALLENGE_DETECTED"
        assert result.records == []

    @pytest.mark.asyncio
    async def test_no_data_on_empty_flights(self):
        """Zero flights returned → NO_DATA (not FAILED, not REAL fabrication)."""
        adapter = self._adapter()
        travel = _travel_date(1)

        with patch.object(adapter, "_fetch_sync", return_value=_make_fake_result([])):
            result = await adapter.collect("DEL-BOM", travel, 1, "run-005")

        assert result.status == "NO_DATA"
        assert result.records == []

    @pytest.mark.asyncio
    async def test_no_data_on_none_result(self):
        """None result from fast-flights → CHALLENGE_DETECTED."""
        adapter = self._adapter()
        travel = _travel_date(1)

        with patch.object(adapter, "_fetch_sync", return_value=None):
            result = await adapter.collect("DEL-BOM", travel, 1, "run-006")

        assert result.status == "CHALLENGE_DETECTED"

    @pytest.mark.asyncio
    async def test_skips_zero_price_flights(self):
        """Flights with price=0 or None are rejected, not stored as REAL."""
        adapter = self._adapter()
        travel = _travel_date(15)
        fake_flights = [
            _make_fake_flight(0),       # zero — must reject
            _make_fake_flight(None),    # None — must reject
            _make_fake_flight(4200),    # valid
        ]

        with patch.object(adapter, "_fetch_sync", return_value=_make_fake_result(fake_flights)):
            result = await adapter.collect("DEL-BOM", travel, 15, "run-007")

        assert result.status == "SUCCESS"
        assert len(result.records) == 1
        assert result.records_rejected == 2
        assert result.records[0].total_fare == 4200.0

    @pytest.mark.asyncio
    async def test_not_configured_when_disabled(self):
        """GOOGLE_FLIGHTS_ENABLED=False → NOT_CONFIGURED without network call."""
        adapter = GoogleFlightsAdapter({"GOOGLE_FLIGHTS_ENABLED": False})
        travel = _travel_date(1)

        with patch.object(adapter, "_fetch_sync") as mock_fetch:
            result = await adapter.collect("DEL-BOM", travel, 1, "run-008")
            mock_fetch.assert_not_called()

        assert result.status == "NOT_CONFIGURED"

    @pytest.mark.asyncio
    async def test_import_error_returns_failed_not_challenge(self):
        """Missing library → FAILED with install hint, not CHALLENGE_DETECTED."""
        adapter = self._adapter()
        travel = _travel_date(1)

        with patch.object(adapter, "_fetch_sync", side_effect=ImportError("fast_flights")):
            result = await adapter.collect("DEL-BOM", travel, 1, "run-009")

        assert result.status == "FAILED"
        assert "pip install" in (result.error or "")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("advance", [1, 7, 15, 30, 45])
    async def test_all_booking_windows(self, advance):
        """All 5 booking windows return SUCCESS with correct advance_days."""
        adapter = self._adapter()
        travel = _travel_date(advance)
        fake_flights = [_make_fake_flight(5000 + advance * 50)]

        with patch.object(adapter, "_fetch_sync", return_value=_make_fake_result(fake_flights)):
            result = await adapter.collect("DEL-BOM", travel, advance, "run-win")

        assert result.status == "SUCCESS"
        assert result.advance_days == advance
        assert result.records[0].advance_days == advance

    @pytest.mark.asyncio
    @pytest.mark.parametrize("route", [
        "DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "DEL-HYD",
        "DEL-MAA", "BOM-CCU", "BOM-HYD", "BLR-CCU", "BLR-HYD",
        "MAA-DEL", "MAA-BOM",
    ])
    async def test_all_sih_corridors(self, route):
        """All 12 SIH corridors are correctly parsed and routed."""
        adapter = self._adapter()
        travel = _travel_date(1)
        fake_flights = [_make_fake_flight(4500)]
        origin, _, destination = route.partition("-")

        with patch.object(adapter, "_fetch_sync", return_value=_make_fake_result(fake_flights)):
            result = await adapter.collect(route, travel, 1, "run-corridor")

        assert result.status == "SUCCESS"
        rec = result.records[0]
        assert rec.origin == origin
        assert rec.destination == destination
        assert rec.route == route

    @pytest.mark.asyncio
    async def test_invalid_route_format(self):
        """Malformed route string → FAILED immediately."""
        adapter = self._adapter()
        result = await adapter.collect("DELBOM", _travel_date(1), 1, "run-bad")
        assert result.status == "FAILED"


# ── live tests ─────────────────────────────────────────────────────────────

@pytest.mark.live
class TestGoogleFlightsLive:
    """
    Live integration tests — require internet and a working fast-flights install.
    Google Flights may block the request; CHALLENGE_DETECTED is an acceptable result.

    Run with:  pytest tests/test_google_flights_adapter.py -v -m live
    """

    @pytest.mark.asyncio
    async def test_live_del_bom_t1(self):
        """
        Live DEL→BOM T+1 query.

        Acceptable outcomes:
          SUCCESS      — real prices returned, all data_origin == REAL
          CHALLENGE_DETECTED — Google blocked the plain HTTP request (expected in many envs)
          NO_DATA      — no flights for this date (unlikely for DEL-BOM)
          FAILED       — fast-flights library error

        NEVER acceptable:
          records with data_origin != REAL (no fabrication allowed)
          records with total_fare <= 0
        """
        adapter = GoogleFlightsAdapter({"GOOGLE_FLIGHTS_ENABLED": True})
        travel = _travel_date(1)
        result = await adapter.collect("DEL-BOM", travel, 1, "live-run-001")

        print(f"\nLive result status: {result.status}")
        print(f"Records collected: {len(result.records)}")
        if result.records:
            for r in result.records[:3]:
                print(f"  {r.airline}: ₹{r.total_fare:,.0f} | {r.departure_time}→{r.arrival_time} | {r.stops} stops")
        if result.error:
            print(f"Error: {result.error}")
        if result.challenge_reason:
            print(f"Challenge reason: {result.challenge_reason}")

        # Status must be one of the honest outcomes
        assert result.status in ("SUCCESS", "CHALLENGE_DETECTED", "NO_DATA", "FAILED")

        # If we got records, they must all be REAL with valid prices
        for rec in result.records:
            assert rec.data_origin == "REAL", f"data_origin must be REAL, got {rec.data_origin}"
            assert rec.total_fare > 0, f"total_fare must be positive, got {rec.total_fare}"
            assert rec.currency == "INR"
            assert rec.route == "DEL-BOM"
            assert rec.advance_days == 1

    @pytest.mark.asyncio
    @pytest.mark.parametrize("advance", [1, 7, 15, 30, 45])
    async def test_live_all_windows(self, advance):
        """Live DEL-BOM across all 5 booking windows."""
        adapter = GoogleFlightsAdapter({"GOOGLE_FLIGHTS_ENABLED": True})
        travel = _travel_date(advance)
        result = await adapter.collect("DEL-BOM", travel, advance, f"live-win-{advance}")

        print(f"\nT+{advance} ({travel}): {result.status} — {len(result.records)} records")

        assert result.status in ("SUCCESS", "CHALLENGE_DETECTED", "NO_DATA", "FAILED")
        for rec in result.records:
            assert rec.data_origin == "REAL"
            assert rec.total_fare > 0
            assert rec.advance_days == advance
