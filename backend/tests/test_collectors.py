"""
Unit tests for fare collector adapters.
Verifies that all airline adapters return CHALLENGE_DETECTED when not configured.
Run: pytest tests/test_collectors.py -v
"""
import asyncio
import pytest
from app.collectors.challenge import (
    IndiGoAdapter, AirIndiaAdapter, AkasaAdapter,
    SpiceJetAdapter, AirIndiaExpressAdapter,
)


def _empty_cfg():
    return {
        "INDIGO_API_KEY": "", "INDIGO_NDC_ENDPOINT": "",
        "AIRINDIA_API_KEY": "", "AIRINDIA_NDC_ENDPOINT": "",
        "AKASA_API_KEY": "", "AKASA_NDC_ENDPOINT": "",
        "SPICEJET_API_KEY": "", "SPICEJET_NDC_ENDPOINT": "",
    }


@pytest.mark.parametrize("AdapterClass,source_id", [
    (IndiGoAdapter, "indigo"),
    (AirIndiaAdapter, "airindia"),
    (AkasaAdapter, "akasa"),
    (SpiceJetAdapter, "spicejet"),
    (AirIndiaExpressAdapter, "airindia-express"),
])
def test_challenge_detected_when_not_configured(AdapterClass, source_id):
    adapter = AdapterClass(_empty_cfg())

    async def _run():
        return await adapter.collect("DEL-BOM", "2026-10-01", 7, "test-run-001")

    result = asyncio.run(_run())
    assert result.status == "CHALLENGE_DETECTED"
    assert result.records == []
    assert result.source_id == source_id


@pytest.mark.parametrize("AdapterClass", [
    IndiGoAdapter, AirIndiaAdapter, AkasaAdapter, SpiceJetAdapter, AirIndiaExpressAdapter,
])
def test_is_configured_false_with_empty_keys(AdapterClass):
    adapter = AdapterClass(_empty_cfg())
    assert adapter.is_configured() is False


def test_route_basket_has_19_routes():
    from app.services.collector import ROUTE_BASKET
    assert len(ROUTE_BASKET) == 19


def test_advance_windows():
    from app.services.collector import ADVANCE_WINDOWS
    assert set(ADVANCE_WINDOWS) == {1, 7, 15, 30, 45}
