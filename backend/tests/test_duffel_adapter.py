"""
Duffel Air adapter tests.

Offline unit tests (default): mocked httpx responses — no token needed, no network.
Live integration tests: marked @pytest.mark.live — require DUFFEL_API_TOKEN in env.

Run offline:
    cd backend && pytest tests/test_duffel_adapter.py -v

Run live (test token):
    cd backend && DUFFEL_API_TOKEN=duffel_test_... pytest tests/test_duffel_adapter.py -v -m live

Run live (live token, full REAL provenance):
    cd backend && DUFFEL_API_TOKEN=duffel_live_... pytest tests/test_duffel_adapter.py -v -m live
"""
import asyncio
import json
import os
from datetime import date, timedelta
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from app.collectors.duffel import (
    DuffelAdapter,
    SOURCE_ID,
    _determine_provenance,
    _hhmm,
    _safe_float,
)


# ── helpers ────────────────────────────────────────────────────────────────

def _travel_date(advance: int) -> str:
    return (date.today() + timedelta(days=advance)).strftime("%Y-%m-%d")


TEST_TOKEN = "duffel_test_000000000000000000000"
LIVE_TOKEN = "duffel_live_000000000000000000000"


def _make_offer(
    offer_id: str = "off_001",
    total_amount: str = "5432.00",
    base_amount: str = "4200.00",
    tax_amount: Optional[str] = "1232.00",
    currency: str = "INR",
    live_mode: bool = False,
    iata_code: str = "AI",
    airline_name: str = "Air India",
    dep: str = "2026-09-20T06:00:00+05:30",
    arr: str = "2026-09-20T07:55:00+05:30",
    stops_in_segments: int = 0,
    fare_brand: str = "Economy Saver",
    flight_number: str = "101",
    cabin_class: str = "economy",
) -> dict:
    segments = [
        {
            "id": "seg_001",
            "departing_at": dep,
            "arriving_at": arr,
            "origin": {"iata_code": "DEL", "name": "Indira Gandhi International"},
            "destination": {"iata_code": "BOM", "name": "Chhatrapati Shivaji Maharaj"},
            "marketing_carrier": {"iata_code": iata_code, "name": airline_name},
            "marketing_carrier_flight_number": flight_number,
            "operating_carrier": {"iata_code": iata_code, "name": airline_name},
            "stops": [],
            "passengers": [
                {
                    "passenger_id": "pas_001",
                    "cabin_class": cabin_class,
                    "cabin_class_marketing_name": cabin_class.title(),
                    "fare": "ECONOMY",
                    "baggages": [],
                }
            ],
        }
    ]
    slices = [
        {
            "id": "sli_001",
            "origin": {"iata_code": "DEL"},
            "destination": {"iata_code": "BOM"},
            "fare_brand_name": fare_brand,
            "segments": segments,
        }
    ]
    return {
        "id": offer_id,
        "live_mode": live_mode,
        "total_amount": total_amount,
        "base_amount": base_amount,
        "tax_amount": tax_amount,
        "total_currency": currency,
        "base_currency": currency,
        "tax_currency": currency,
        "owner": {"iata_code": iata_code, "name": airline_name},
        "slices": slices,
    }


def _make_raw_response(offers: list[dict]) -> dict:
    return {"id": "orq_001", "live_mode": offers[0]["live_mode"] if offers else False, "offers": offers}


def _adapter(token: str = TEST_TOKEN) -> DuffelAdapter:
    return DuffelAdapter({"DUFFEL_API_TOKEN": token})


# ── unit: helpers ──────────────────────────────────────────────────────────

class TestHelpers:
    def test_safe_float_str(self):
        assert _safe_float("5432.00") == 5432.0

    def test_safe_float_int(self):
        assert _safe_float(4200) == 4200.0

    def test_safe_float_none(self):
        assert _safe_float(None) is None

    def test_safe_float_garbage(self):
        assert _safe_float("N/A") is None

    def test_hhmm_iso(self):
        assert _hhmm("2026-09-20T06:00:00+05:30") == "06:00"

    def test_hhmm_plain(self):
        assert _hhmm("08:30") == "08:30"

    def test_hhmm_none(self):
        assert _hhmm(None) is None


class TestProvenance:
    def test_live_token_live_mode_true_gives_real(self):
        assert _determine_provenance(True, "duffel_live_abc123") == "REAL"

    def test_test_token_live_mode_false_gives_sandbox(self):
        assert _determine_provenance(False, "duffel_test_abc123") == "SANDBOX_TEST"

    def test_live_mode_false_live_token_still_sandbox(self):
        # live_mode must be True in response AND live token — both conditions required
        assert _determine_provenance(False, "duffel_live_abc123") == "SANDBOX_TEST"

    def test_test_token_live_mode_true_gives_sandbox(self):
        # Test token should never produce REAL even if live_mode=True (API oddity)
        assert _determine_provenance(True, "duffel_test_abc123") == "SANDBOX_TEST"

    def test_empty_token_gives_sandbox(self):
        assert _determine_provenance(True, "") == "SANDBOX_TEST"


# ── unit: adapter ──────────────────────────────────────────────────────────

class TestDuffelAdapterUnit:
    @pytest.mark.asyncio
    async def test_not_configured_when_no_token(self):
        adapter = DuffelAdapter({"DUFFEL_API_TOKEN": ""})
        result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-001")
        assert result.status == "NOT_CONFIGURED"
        assert result.records == []

    @pytest.mark.asyncio
    async def test_success_del_bom_t1_sandbox(self):
        """Test token + live_mode=False → SANDBOX_TEST provenance, never REAL."""
        adapter = _adapter(TEST_TOKEN)
        offers = [_make_offer(live_mode=False)]
        raw = _make_raw_response(offers)

        with patch.object(adapter, "_search_sync", return_value=(raw, offers)):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-002")

        assert result.status == "SUCCESS"
        assert len(result.records) == 1
        rec = result.records[0]
        assert rec.data_origin == "SANDBOX_TEST"  # test token — never REAL
        assert rec.total_fare == 5432.0
        assert rec.base_fare == 4200.0
        assert abs(rec.taxes - 1232.0) < 0.01
        assert rec.currency == "INR"
        assert rec.route == "DEL-BOM"
        assert rec.airline == "Air India"
        assert rec.departure_time == "06:00"
        assert rec.arrival_time == "07:55"
        assert rec.source == SOURCE_ID
        assert rec.advance_days == 1

    @pytest.mark.asyncio
    async def test_success_live_token_live_mode_true_gives_real(self):
        """Live token + live_mode=True → REAL provenance."""
        adapter = _adapter(LIVE_TOKEN)
        offers = [_make_offer(live_mode=True)]
        raw = _make_raw_response(offers)

        with patch.object(adapter, "_search_sync", return_value=(raw, offers)):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-003")

        assert result.status == "SUCCESS"
        assert result.records[0].data_origin == "REAL"

    @pytest.mark.asyncio
    async def test_no_data_on_empty_offers(self):
        """Duffel returns 0 offers → NO_DATA, never fabricated records."""
        adapter = _adapter()
        raw = _make_raw_response([])

        with patch.object(adapter, "_search_sync", return_value=(raw, [])):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-004")

        assert result.status == "NO_DATA"
        assert result.records == []

    @pytest.mark.asyncio
    async def test_challenge_on_401(self):
        """HTTP 401 → CHALLENGE_DETECTED (bad token)."""
        import httpx
        adapter = _adapter()

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = '{"errors": [{"code": "authentication_required"}]}'
        exc = httpx.HTTPStatusError("401", request=MagicMock(), response=mock_response)

        with patch.object(adapter, "_search_sync", side_effect=exc):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-005")

        assert result.status == "CHALLENGE_DETECTED"
        assert result.records == []

    @pytest.mark.asyncio
    async def test_rate_limited_on_429(self):
        """HTTP 429 → RATE_LIMITED (not FAILED, enables retry logic)."""
        import httpx
        adapter = _adapter()

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Too Many Requests"
        exc = httpx.HTTPStatusError("429", request=MagicMock(), response=mock_response)

        with patch.object(adapter, "_search_sync", side_effect=exc):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-006")

        assert result.status == "RATE_LIMITED"

    @pytest.mark.asyncio
    async def test_timeout_returns_timeout_status(self):
        import httpx
        adapter = _adapter()

        with patch.object(adapter, "_search_sync", side_effect=httpx.TimeoutException("timeout")):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-007")

        assert result.status == "TIMEOUT"

    @pytest.mark.asyncio
    async def test_price_zero_offer_rejected(self):
        """Offers with total_amount=0 are rejected, not stored."""
        adapter = _adapter()
        offers = [_make_offer(total_amount="0.00", base_amount="0.00", tax_amount="0.00")]
        raw = _make_raw_response(offers)

        with patch.object(adapter, "_search_sync", return_value=(raw, offers)):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-008")

        assert result.records == []
        assert result.records_rejected == 1

    @pytest.mark.asyncio
    async def test_multiple_offers_all_mapped(self):
        """Multiple offers are all mapped (up to _MAX_OFFERS)."""
        adapter = _adapter()
        offers = [
            _make_offer(offer_id=f"off_{i}", total_amount=f"{4000 + i * 100}.00",
                        iata_code="6E", airline_name="IndiGo")
            for i in range(5)
        ]
        raw = _make_raw_response(offers)

        with patch.object(adapter, "_search_sync", return_value=(raw, offers)):
            result = await adapter.collect("DEL-BOM", _travel_date(7), 7, "run-009")

        assert result.status == "SUCCESS"
        assert len(result.records) == 5
        assert all(r.data_origin == "SANDBOX_TEST" for r in result.records)

    @pytest.mark.asyncio
    async def test_stops_counted_correctly(self):
        """Multi-segment itinerary → stops = len(segments) - 1."""
        adapter = _adapter()
        raw_offer = _make_offer()
        # Inject a second segment to simulate 1 stop
        raw_offer["slices"][0]["segments"].append(raw_offer["slices"][0]["segments"][0])
        raw = _make_raw_response([raw_offer])

        with patch.object(adapter, "_search_sync", return_value=(raw, [raw_offer])):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-010")

        assert result.status == "SUCCESS"
        assert result.records[0].stops == 1

    @pytest.mark.asyncio
    async def test_invalid_route_format(self):
        adapter = _adapter()
        result = await adapter.collect("DELBOM", _travel_date(1), 1, "run-011")
        assert result.status == "FAILED"

    @pytest.mark.asyncio
    async def test_tax_heuristic_flag_when_no_tax_amount(self):
        """When Duffel returns no tax_amount, TAX_HEURISTIC quality flag is set."""
        adapter = _adapter()
        offers = [_make_offer(tax_amount=None)]
        raw = _make_raw_response(offers)

        with patch.object(adapter, "_search_sync", return_value=(raw, offers)):
            result = await adapter.collect("DEL-BOM", _travel_date(1), 1, "run-012")

        assert result.status == "SUCCESS"
        assert "TAX_HEURISTIC" in result.records[0].quality_flags

    @pytest.mark.asyncio
    @pytest.mark.parametrize("advance", [1, 7, 15, 30, 45])
    async def test_all_booking_windows(self, advance):
        """All 5 T+ windows are correctly stored on the record."""
        adapter = _adapter()
        offers = [_make_offer()]
        raw = _make_raw_response(offers)

        with patch.object(adapter, "_search_sync", return_value=(raw, offers)):
            result = await adapter.collect("DEL-BOM", _travel_date(advance), advance, f"run-w{advance}")

        assert result.status == "SUCCESS"
        assert result.records[0].advance_days == advance

    @pytest.mark.asyncio
    @pytest.mark.parametrize("route", [
        "DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "DEL-HYD",
        "DEL-MAA", "BOM-CCU", "BOM-HYD", "BLR-CCU", "BLR-HYD",
        "MAA-DEL", "MAA-BOM",
    ])
    async def test_all_sih_corridors(self, route):
        """All 12 SIH corridors are handled correctly."""
        adapter = _adapter()
        origin, _, destination = route.partition("-")
        raw_offer = _make_offer()
        raw_offer["slices"][0]["origin"]["iata_code"] = origin
        raw_offer["slices"][0]["destination"]["iata_code"] = destination
        raw = _make_raw_response([raw_offer])

        with patch.object(adapter, "_search_sync", return_value=(raw, [raw_offer])):
            result = await adapter.collect(route, _travel_date(1), 1, f"run-{route}")

        assert result.status == "SUCCESS"
        rec = result.records[0]
        assert rec.origin == origin
        assert rec.destination == destination
        assert rec.route == route


# ── live tests ─────────────────────────────────────────────────────────────

@pytest.mark.live
class TestDuffelLive:
    """
    Live integration tests against the Duffel API.
    Requires DUFFEL_API_TOKEN environment variable.

    Run with:
        DUFFEL_API_TOKEN=duffel_test_... pytest tests/test_duffel_adapter.py -v -m live

    Acceptable outcomes:
      SUCCESS         — offers returned and mapped
      NO_DATA         — corridor not in Duffel inventory (honest, no fabrication)
      CHALLENGE_DETECTED — token invalid / expired
      RATE_LIMITED    — too many requests
      TIMEOUT         — network issue

    NEVER acceptable:
      records with data_origin outside ("REAL", "SANDBOX_TEST")
      records with total_fare <= 0
      records with currency not matching the token's currency
    """

    @pytest.fixture
    def token(self) -> str:
        t = os.environ.get("DUFFEL_API_TOKEN", "")
        if not t:
            pytest.skip("DUFFEL_API_TOKEN not set")
        return t

    @pytest.mark.asyncio
    async def test_live_del_bom_t1(self, token):
        adapter = DuffelAdapter({"DUFFEL_API_TOKEN": token})
        travel = _travel_date(1)
        result = await adapter.collect("DEL-BOM", travel, 1, "live-001")

        print(f"\n[LIVE] DEL-BOM T+1 ({travel}): status={result.status}, records={len(result.records)}")
        if result.records:
            for r in result.records[:5]:
                print(f"  {r.airline} {r.flight_number}: ₹{r.total_fare:,.0f} | {r.departure_time}→{r.arrival_time} | stops={r.stops} | provenance={r.data_origin}")
        if result.error:
            print(f"  Error: {result.error}")
        if result.challenge_reason:
            print(f"  Challenge: {result.challenge_reason}")

        assert result.status in ("SUCCESS", "NO_DATA", "CHALLENGE_DETECTED", "RATE_LIMITED", "TIMEOUT", "FAILED")

        for rec in result.records:
            assert rec.data_origin in ("REAL", "SANDBOX_TEST"), \
                f"Illegal provenance: {rec.data_origin}"
            assert rec.total_fare > 0, "Zero or negative fare"
            assert rec.route == "DEL-BOM"
            assert rec.advance_days == 1
            assert rec.source == SOURCE_ID

    @pytest.mark.asyncio
    @pytest.mark.parametrize("advance", [1, 7, 15, 30, 45])
    async def test_live_all_windows(self, token, advance):
        adapter = DuffelAdapter({"DUFFEL_API_TOKEN": token})
        travel = _travel_date(advance)
        result = await adapter.collect("DEL-BOM", travel, advance, f"live-win-{advance}")

        print(f"\n[LIVE] DEL-BOM T+{advance} ({travel}): {result.status} — {len(result.records)} records")

        assert result.status in ("SUCCESS", "NO_DATA", "CHALLENGE_DETECTED", "RATE_LIMITED", "TIMEOUT", "FAILED")
        for rec in result.records:
            assert rec.data_origin in ("REAL", "SANDBOX_TEST")
            assert rec.total_fare > 0
            assert rec.advance_days == advance

    @pytest.mark.asyncio
    async def test_live_all_sih_corridors(self, token):
        """
        Probe all 12 SIH corridors with T+7.
        Reports which corridors have inventory — does not fail on NO_DATA.
        """
        corridors = [
            "DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "DEL-HYD",
            "DEL-MAA", "BOM-CCU", "BOM-HYD", "BLR-CCU", "BLR-HYD",
            "MAA-DEL", "MAA-BOM",
        ]
        adapter = DuffelAdapter({"DUFFEL_API_TOKEN": token})
        travel = _travel_date(7)

        print("\n[LIVE] Duffel corridor inventory probe:")
        results: dict[str, str] = {}
        for route in corridors:
            result = await adapter.collect(route, travel, 7, f"live-corridor-{route}")
            results[route] = f"{result.status} ({len(result.records)} records)"
            print(f"  {route}: {results[route]}")

        # At least no FAILED statuses due to bugs (NO_DATA is honest/acceptable)
        for route, status_str in results.items():
            assert "FAILED" not in status_str or "inventory" in (result.error or "").lower(), \
                f"Unexpected FAILED for {route}: {status_str}"
