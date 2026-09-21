"""
Unit tests for the processing pipeline: normalize, quality, deduplicate, provenance.
Run: pytest tests/test_processing.py -v
"""
import pytest
from app.collectors.base import FareRecord
from app.processing.normalize import normalize_fare, normalize_iata, normalize_airline
from app.processing.quality import validate_record, MIN_FARE_INR, MAX_FARE_INR
from app.processing.provenance import assign_provenance, is_production_eligible


def _make_record(**kwargs) -> FareRecord:
    defaults = dict(
        origin="DEL", destination="BOM", route="DEL-BOM",
        airline="IndiGo", travel_date="2026-10-15",
        advance_days=7, base_fare=3000.0, taxes=500.0,
        fees=0.0, total_fare=3500.0, currency="INR",
        source="indigo", data_origin="REAL",
    )
    defaults.update(kwargs)
    return FareRecord(**defaults)


# ── Normalize ──────────────────────────────────────────────────────────────

def test_normalize_valid_record():
    rec = _make_record()
    result = normalize_fare(rec)
    assert result is not None
    assert result.route == "DEL-BOM"
    assert result.total_fare == 3500.0


def test_normalize_lowercases_iata():
    rec = _make_record(origin="del", destination="bom")
    result = normalize_fare(rec)
    assert result is not None
    assert result.origin == "DEL"


def test_normalize_same_origin_destination_rejected():
    rec = _make_record(origin="DEL", destination="DEL", route="DEL-DEL")
    assert normalize_fare(rec) is None


def test_normalize_negative_fare_rejected():
    rec = _make_record(total_fare=-100.0)
    assert normalize_fare(rec) is None


def test_normalize_raw_hash_generated():
    rec = _make_record()
    result = normalize_fare(rec)
    assert result is not None
    assert result.raw_hash is not None
    assert len(result.raw_hash) == 16


def test_normalize_iata_valid():
    assert normalize_iata("DEL") == "DEL"
    assert normalize_iata("bom") == "BOM"


def test_normalize_iata_invalid():
    assert normalize_iata("DELHI") is None
    assert normalize_iata("12") is None


def test_normalize_airline_canonical():
    assert normalize_airline("6E") == "IndiGo"
    assert normalize_airline("AI") == "Air India"


# ── Quality ────────────────────────────────────────────────────────────────

def test_quality_valid_record():
    rec = _make_record()
    is_valid, flags = validate_record(rec)
    assert is_valid
    assert "BELOW_MINIMUM_FARE" not in flags
    assert "ABOVE_MAXIMUM_FARE" not in flags


def test_quality_below_minimum():
    rec = _make_record(base_fare=50.0, taxes=10.0, fees=0.0, total_fare=60.0)
    is_valid, flags = validate_record(rec)
    assert not is_valid
    assert "BELOW_MINIMUM_FARE" in flags


def test_quality_above_maximum():
    rec = _make_record(base_fare=90000.0, taxes=15000.0, fees=0.0, total_fare=105000.0)
    is_valid, flags = validate_record(rec)
    assert not is_valid
    assert "ABOVE_MAXIMUM_FARE" in flags


def test_quality_negative_tax():
    rec = _make_record(taxes=-100.0, total_fare=2900.0)
    is_valid, flags = validate_record(rec)
    assert not is_valid
    assert "NEGATIVE_FARE_COMPONENT" in flags


def test_quality_components_mismatch_soft():
    rec = _make_record(base_fare=3000.0, taxes=500.0, fees=0.0, total_fare=3600.0)
    is_valid, flags = validate_record(rec)
    assert is_valid  # soft flag, not hard failure
    assert "FARE_COMPONENTS_MISMATCH" in flags


# ── Provenance ─────────────────────────────────────────────────────────────

def test_provenance_airline_is_real():
    rec = _make_record(data_origin="REAL")
    assert assign_provenance(rec, "AIRLINE_DIRECT") == "REAL"


def test_provenance_government_is_official():
    rec = _make_record(data_origin="OFFICIAL")
    assert assign_provenance(rec, "GOVERNMENT") == "OFFICIAL"


def test_provenance_live_mode_excludes_generated():
    rec = _make_record(data_origin="GENERATED_TEST")
    assert not is_production_eligible(rec, "live")


def test_provenance_demo_mode_excludes_generated():
    rec = _make_record(data_origin="GENERATED_TEST")
    assert not is_production_eligible(rec, "demo")


def test_provenance_live_mode_includes_real():
    rec = _make_record(data_origin="REAL")
    assert is_production_eligible(rec, "live")
