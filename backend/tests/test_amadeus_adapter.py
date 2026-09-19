"""
Tests for the Amadeus Self-Service API adapter and provenance enforcement.

All HTTP calls are mocked — no real API key required.

Key invariants verified:
  - AMADEUS_ENV=sandbox  → data_origin="SANDBOX_TEST" always
  - AMADEUS_ENV=production + matching URL → data_origin="REAL" only after
    all 5 conditions: auth, response, parse, field validity, DB persist
  - SANDBOX_TEST records are NOT production-eligible in live mode
  - SANDBOX_TEST records do NOT feed the analytical path (index, forecasts)
  - finalize_provenance() downgrades REAL→SANDBOX_TEST when persist fails
"""
import time
import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from app.collectors.aggregators.amadeus import AmadeusAdapter, PRODUCTION_URL
from app.collectors.base import FareRecord
from app.processing.provenance import (
    REAL, SANDBOX_TEST, GENERATED_TEST, OFFICIAL,
    is_analytical_eligible, is_production_eligible,
    production_conditions_met,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_adapter(
    api_key: str = "",
    api_secret: str = "",
    amadeus_env: str = "sandbox",
    base_url: str = "https://test.api.amadeus.com",
) -> AmadeusAdapter:
    return AmadeusAdapter(config={
        "AMADEUS_API_KEY": api_key,
        "AMADEUS_API_SECRET": api_secret,
        "AMADEUS_BASE_URL": base_url,
        "AMADEUS_ENV": amadeus_env,
    })


def make_production_adapter() -> AmadeusAdapter:
    return make_adapter(
        api_key="PROD_KEY",
        api_secret="PROD_SECRET",
        amadeus_env="production",
        base_url=PRODUCTION_URL,
    )


def make_sandbox_adapter() -> AmadeusAdapter:
    return make_adapter(
        api_key="SAND_KEY",
        api_secret="SAND_SECRET",
        amadeus_env="sandbox",
        base_url="https://test.api.amadeus.com",
    )


SAMPLE_OFFER = {
    "price": {
        "grandTotal": "4500.00",
        "base": "3200.00",
        "fees": [],
    },
    "travelerPricings": [{
        "fareDetailsBySegment": [{"cabin": "ECONOMY", "fareOption": "SAVER"}],
        "fareOption": "SAVER",
    }],
    "itineraries": [{
        "segments": [{
            "departure": {"at": "2026-10-01T06:00:00", "iataCode": "DEL"},
            "arrival": {"at": "2026-10-01T08:05:00", "iataCode": "BOM"},
            "carrierCode": "6E",
            "number": "456",
        }]
    }],
}


# ── is_configured ─────────────────────────────────────────────────────────────

def test_is_configured_false_when_no_credentials():
    assert make_adapter().is_configured() is False


def test_is_configured_false_when_only_key():
    assert make_adapter(api_key="KEY_ONLY").is_configured() is False


def test_is_configured_true_when_both():
    assert make_sandbox_adapter().is_configured() is True


# ── _amadeus_env safety check ────────────────────────────────────────────────

def test_env_sandbox_when_explicitly_set():
    adapter = make_sandbox_adapter()
    assert adapter._amadeus_env() == "sandbox"


def test_env_production_requires_both_env_and_url():
    # Both AMADEUS_ENV=production AND URL must match PRODUCTION_URL
    adapter = make_production_adapter()
    assert adapter._amadeus_env() == "production"


def test_env_production_mismatch_falls_back_to_sandbox():
    # AMADEUS_ENV=production but wrong URL → sandbox for safety
    adapter = make_adapter(
        api_key="K", api_secret="S",
        amadeus_env="production",
        base_url="https://test.api.amadeus.com",   # sandbox URL!
    )
    assert adapter._amadeus_env() == "sandbox"
    assert adapter._is_production() is False


def test_env_default_is_sandbox():
    adapter = AmadeusAdapter(config={"AMADEUS_API_KEY": "K", "AMADEUS_API_SECRET": "S"})
    # No AMADEUS_ENV in config → falls through to settings default ("sandbox")
    assert adapter._is_production() is False


# ── Sandbox provenance ────────────────────────────────────────────────────────

def test_sandbox_offer_mapped_as_sandbox_test():
    adapter = make_sandbox_adapter()
    adapter._last_auth_succeeded = True  # simulate successful auth
    rec = adapter._map_offer(SAMPLE_OFFER, "DEL", "BOM", "2026-10-01", 7)
    assert rec is not None
    assert rec.data_origin == SANDBOX_TEST


def test_sandbox_offer_never_classified_real():
    adapter = make_sandbox_adapter()
    adapter._last_auth_succeeded = True
    for _ in range(10):
        rec = adapter._map_offer(SAMPLE_OFFER, "DEL", "BOM", "2026-10-01", 7)
        assert rec is not None
        assert rec.data_origin != REAL, "Sandbox data must never be classified REAL"


# ── Production provenance ─────────────────────────────────────────────────────

def test_production_offer_classified_real_when_all_conditions_met():
    adapter = make_production_adapter()
    adapter._last_auth_succeeded = True   # condition 1 ✓
    # conditions 2+3: we are inside _map_offer → implicitly met
    # condition 4: valid fields in SAMPLE_OFFER
    rec = adapter._map_offer(SAMPLE_OFFER, "DEL", "BOM", "2026-10-01", 7)
    assert rec is not None
    assert rec.data_origin == REAL


def test_production_offer_sandbox_test_when_auth_failed():
    adapter = make_production_adapter()
    adapter._last_auth_succeeded = False   # condition 1 ✗
    rec = adapter._map_offer(SAMPLE_OFFER, "DEL", "BOM", "2026-10-01", 7)
    assert rec is not None
    assert rec.data_origin == SANDBOX_TEST


def test_finalize_provenance_downgrades_real_on_persist_failure():
    # Condition 5: if DB persist fails, REAL must be downgraded to SANDBOX_TEST
    adapter = make_production_adapter()
    rec = FareRecord(
        origin="DEL", destination="BOM", route="DEL-BOM",
        airline="IndiGo", travel_date="2026-10-01", advance_days=7,
        base_fare=3200.0, taxes=1300.0, fees=0.0, total_fare=4500.0,
        data_origin=REAL,
    )
    result = adapter.finalize_provenance(rec, persisted=False)
    assert result.data_origin == SANDBOX_TEST


def test_finalize_provenance_keeps_real_on_persist_success():
    adapter = make_production_adapter()
    rec = FareRecord(
        origin="DEL", destination="BOM", route="DEL-BOM",
        airline="IndiGo", travel_date="2026-10-01", advance_days=7,
        base_fare=3200.0, taxes=1300.0, fees=0.0, total_fare=4500.0,
        data_origin=REAL,
    )
    result = adapter.finalize_provenance(rec, persisted=True)
    assert result.data_origin == REAL


def test_finalize_provenance_does_not_touch_sandbox_test():
    adapter = make_production_adapter()
    rec = FareRecord(
        origin="DEL", destination="BOM", route="DEL-BOM",
        airline="IndiGo", travel_date="2026-10-01", advance_days=7,
        base_fare=3200.0, taxes=1300.0, fees=0.0, total_fare=4500.0,
        data_origin=SANDBOX_TEST,
    )
    result = adapter.finalize_provenance(rec, persisted=True)
    assert result.data_origin == SANDBOX_TEST


# ── Provenance eligibility guards ─────────────────────────────────────────────

def make_record(data_origin: str) -> FareRecord:
    return FareRecord(
        origin="DEL", destination="BOM", route="DEL-BOM",
        airline="IndiGo", travel_date="2026-10-01", advance_days=7,
        base_fare=3200.0, taxes=1300.0, fees=0.0, total_fare=4500.0,
        data_origin=data_origin,
    )


def test_analytical_eligible_real():
    assert is_analytical_eligible(make_record(REAL)) is True


def test_analytical_eligible_official():
    assert is_analytical_eligible(make_record(OFFICIAL)) is True


def test_analytical_not_eligible_sandbox_test():
    """SANDBOX_TEST must NEVER feed the analytical engines."""
    assert is_analytical_eligible(make_record(SANDBOX_TEST)) is False


def test_analytical_not_eligible_generated_test():
    assert is_analytical_eligible(make_record(GENERATED_TEST)) is False


def test_production_eligible_real_in_live_mode():
    assert is_production_eligible(make_record(REAL), "live") is True


def test_production_eligible_official_in_live_mode():
    assert is_production_eligible(make_record(OFFICIAL), "live") is True


def test_production_not_eligible_sandbox_test_in_live_mode():
    """SANDBOX_TEST must not appear in the live API listing."""
    assert is_production_eligible(make_record(SANDBOX_TEST), "live") is False


def test_production_not_eligible_generated_test_in_live_mode():
    assert is_production_eligible(make_record(GENERATED_TEST), "live") is False


def test_production_eligible_sandbox_test_in_demo_mode():
    """In demo mode SANDBOX_TEST may appear (with explicit provenance label)."""
    assert is_production_eligible(make_record(SANDBOX_TEST), "demo") is True


def test_production_not_eligible_generated_test_in_demo_mode():
    """GENERATED_TEST is excluded even in demo mode — use proper fixtures."""
    assert is_production_eligible(make_record(GENERATED_TEST), "demo") is False


# ── production_conditions_met helper ─────────────────────────────────────────

def test_all_conditions_true_returns_true():
    assert production_conditions_met(
        auth_succeeded=True, response_received=True,
        response_parsed=True, fields_valid=True, persisted=True,
    ) is True


def test_any_condition_false_returns_false():
    for failing in ["auth_succeeded", "response_received", "response_parsed", "fields_valid", "persisted"]:
        kwargs = dict(
            auth_succeeded=True, response_received=True,
            response_parsed=True, fields_valid=True, persisted=True,
        )
        kwargs[failing] = False
        assert production_conditions_met(**kwargs) is False, f"Expected False when {failing}=False"


# ── Offer mapping edge cases ──────────────────────────────────────────────────

def test_map_offer_sandbox_correct_fields():
    adapter = make_sandbox_adapter()
    adapter._last_auth_succeeded = True
    rec = adapter._map_offer(SAMPLE_OFFER, "DEL", "BOM", "2026-10-01", 7)
    assert rec is not None
    assert rec.total_fare == 4500.0
    assert rec.base_fare == 3200.0
    assert abs(rec.taxes - 1300.0) < 0.01
    assert rec.cabin == "ECONOMY"
    assert rec.airline == "IndiGo"
    assert rec.flight_number == "6E456"
    assert rec.stops == 0
    assert rec.currency == "INR"


def test_map_offer_rejects_zero_fare():
    adapter = make_sandbox_adapter()
    bad = dict(SAMPLE_OFFER)
    bad["price"] = {"grandTotal": "0.00", "base": "0.00"}
    assert adapter._map_offer(bad, "DEL", "BOM", "2026-10-01", 7) is None


def test_map_offer_rejects_non_economy():
    adapter = make_sandbox_adapter()
    business = {
        "price": {"grandTotal": "15000.00", "base": "12000.00"},
        "travelerPricings": [{
            "fareDetailsBySegment": [{"cabin": "BUSINESS"}],
            "fareOption": "FULL",
        }],
        "itineraries": [{"segments": [SAMPLE_OFFER["itineraries"][0]["segments"][0]]}],
    }
    assert adapter._map_offer(business, "DEL", "BOM", "2026-10-01", 7) is None


def test_map_offer_multi_stop():
    adapter = make_sandbox_adapter()
    multi = dict(SAMPLE_OFFER)
    multi["itineraries"] = [{
        "segments": [
            SAMPLE_OFFER["itineraries"][0]["segments"][0],
            {"departure": {"at": "2026-10-01T09:00:00", "iataCode": "NAG"},
             "arrival": {"at": "2026-10-01T10:30:00", "iataCode": "BOM"},
             "carrierCode": "6E", "number": "789"},
        ]
    }]
    rec = adapter._map_offer(multi, "DEL", "BOM", "2026-10-01", 7)
    assert rec is not None
    assert rec.stops == 1
    assert rec.data_origin == SANDBOX_TEST


def test_map_offer_unknown_carrier_uses_code():
    adapter = make_sandbox_adapter()
    offer = dict(SAMPLE_OFFER)
    segs = [dict(SAMPLE_OFFER["itineraries"][0]["segments"][0], carrierCode="XY", number="100")]
    offer["itineraries"] = [{"segments": segs}]
    rec = adapter._map_offer(offer, "DEL", "BOM", "2026-10-01", 7)
    assert rec is not None
    assert rec.airline == "XY"


def test_map_offer_malformed_returns_none():
    adapter = make_sandbox_adapter()
    assert adapter._map_offer({}, "DEL", "BOM", "2026-10-01", 7) is None


# ── NOT_CONFIGURED ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_collect_not_configured():
    adapter = make_adapter()   # no credentials
    result = await adapter.collect("DEL-BOM", "2026-10-01", 1, "run-001")
    assert result.status in ("NOT_CONFIGURED", "CHALLENGE_DETECTED", "FAILED")
    assert result.records == []


# ── Token fetch ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_token_success_sets_auth_flag():
    adapter = make_sandbox_adapter()
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"access_token": "tok123", "expires_in": 1799}

    with patch("httpx.AsyncClient") as MockClient:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=ctx)
        ctx.__aexit__ = AsyncMock(return_value=False)
        ctx.post = AsyncMock(return_value=mock_resp)
        MockClient.return_value = ctx
        token = await adapter._get_token()

    assert token == "tok123"
    assert adapter._last_auth_succeeded is True


@pytest.mark.asyncio
async def test_get_token_reuses_cached():
    adapter = make_sandbox_adapter()
    adapter._token = "cached"
    adapter._token_expires_at = time.time() + 900

    with patch("httpx.AsyncClient") as MockClient:
        MockClient.return_value = MagicMock()
        token = await adapter._get_token()

    assert token == "cached"
    MockClient.assert_not_called()


# ── Full collect mocked flows ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_collect_sandbox_success_records_tagged_sandbox_test():
    """End-to-end: sandbox collection → all records tagged SANDBOX_TEST."""
    adapter = make_sandbox_adapter()
    adapter._token = "tok"
    adapter._token_expires_at = time.time() + 1799
    adapter._last_auth_succeeded = True

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"data": [SAMPLE_OFFER], "meta": {"count": 1}}

    with patch("httpx.AsyncClient") as MockClient:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=ctx)
        ctx.__aexit__ = AsyncMock(return_value=False)
        ctx.get = AsyncMock(return_value=mock_resp)
        MockClient.return_value = ctx
        result = await adapter.collect("DEL-BOM", "2026-10-01", 7, "run-sandbox-001")

    assert result.status == "SUCCESS"
    assert len(result.records) == 1
    assert result.records[0].data_origin == SANDBOX_TEST, (
        "Sandbox Amadeus data must be SANDBOX_TEST, never REAL"
    )


@pytest.mark.asyncio
async def test_collect_production_success_records_tagged_real():
    """End-to-end: production collection → records tagged REAL provisionally."""
    adapter = make_production_adapter()
    adapter._token = "prod_tok"
    adapter._token_expires_at = time.time() + 1799
    adapter._last_auth_succeeded = True

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"data": [SAMPLE_OFFER], "meta": {"count": 1}}

    with patch("httpx.AsyncClient") as MockClient:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=ctx)
        ctx.__aexit__ = AsyncMock(return_value=False)
        ctx.get = AsyncMock(return_value=mock_resp)
        MockClient.return_value = ctx
        result = await adapter.collect("DEL-BOM", "2026-10-01", 7, "run-prod-001")

    assert result.status == "SUCCESS"
    assert len(result.records) == 1
    assert result.records[0].data_origin == REAL, (
        "Production data with all conditions met must be tagged REAL"
    )


@pytest.mark.asyncio
async def test_collect_timeout_returns_timeout_status():
    adapter = make_sandbox_adapter()
    adapter._token = "tok"
    adapter._token_expires_at = time.time() + 1799

    with patch("httpx.AsyncClient") as MockClient:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=ctx)
        ctx.__aexit__ = AsyncMock(return_value=False)
        ctx.get = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
        MockClient.return_value = ctx
        result = await adapter.collect("DEL-BOM", "2026-10-01", 7, "run-timeout")

    assert result.status == "TIMEOUT"
    assert result.records == []


@pytest.mark.asyncio
async def test_collect_http_401_returns_failed():
    adapter = make_sandbox_adapter()
    adapter._token = "tok"
    adapter._token_expires_at = time.time() + 1799
    mock_response = MagicMock()
    mock_response.status_code = 401

    with patch("httpx.AsyncClient") as MockClient:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=ctx)
        ctx.__aexit__ = AsyncMock(return_value=False)
        ctx.get = AsyncMock(
            side_effect=httpx.HTTPStatusError("401", request=MagicMock(), response=mock_response)
        )
        MockClient.return_value = ctx
        result = await adapter.collect("DEL-BOM", "2026-10-01", 7, "run-401")

    assert result.status == "FAILED"
    assert "401" in (result.error or "")


@pytest.mark.asyncio
async def test_collect_empty_offers_returns_partial():
    adapter = make_sandbox_adapter()
    adapter._token = "tok"
    adapter._token_expires_at = time.time() + 1799

    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"data": [], "meta": {"count": 0}}

    with patch("httpx.AsyncClient") as MockClient:
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=ctx)
        ctx.__aexit__ = AsyncMock(return_value=False)
        ctx.get = AsyncMock(return_value=mock_resp)
        MockClient.return_value = ctx
        result = await adapter.collect("DEL-BOM", "2026-10-01", 7, "run-empty")

    assert result.status == "PARTIAL"
    assert result.records == []
