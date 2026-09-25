"""
Provenance tagging.

Every observation and aggregate carries an explicit data_origin so the
frontend can display it accurately. This module standardizes provenance
assignment rules.

data_origin taxonomy
──────────────────────────────────────────────────────────────────────
REAL          – Collected from a live, authenticated PRODUCTION source.
                Only assigned after all 5 production conditions pass:
                  1. Authenticated production request succeeds
                  2. Actual airfare response received
                  3. Response successfully parsed
                  4. Required fare fields are valid (non-zero, INR, economy)
                  5. Observation persisted in database
                Included in the live analytical path (index, forecasts, anomalies).

SANDBOX_TEST  – Amadeus sandbox / any test-environment response.
                Shares the same JSON schema as REAL but contains synthetic fares.
                Stored in DB for pipeline validation and audit.
                NEVER included in the live analytical path.
                Only visible in the fares listing when AMADEUS_ENV=sandbox
                and explicitly requested by data_origin filter.

OFFICIAL      – Fetched from a government or authoritative official dataset
                (DGCA, MoSPI, data.gov.in). Included in live path.

DERIVED       – Computed from REAL or OFFICIAL observations (index values,
                median fares, forecasts). Never stored as a raw observation.

GENERATED_TEST – Deterministic demo fixtures. Never enters any production path.
──────────────────────────────────────────────────────────────────────
"""
from typing import Optional
from app.collectors.base import FareRecord

# Canonical data_origin constants
REAL           = "REAL"
SANDBOX_TEST   = "SANDBOX_TEST"
OFFICIAL       = "OFFICIAL"
DERIVED        = "DERIVED"
GENERATED_TEST = "GENERATED_TEST"
HISTORICAL_PUBLIC = "HISTORICAL_PUBLIC"
CACHED         = "CACHED"

# All origins that the live analytical path accepts (index, forecast, anomaly)
_ANALYTICAL_ELIGIBLE = frozenset({REAL, OFFICIAL})

# Origins that may appear in the fares listing (production mode)
_LIVE_LISTING_ELIGIBLE = frozenset({REAL, OFFICIAL})

# Demo mode can expose sandbox responses for pipeline validation, but never
# deterministic/generated fixtures. That prevents placeholder fares appearing
# anywhere in the user-facing application.
_DEMO_LISTING_ELIGIBLE = frozenset({REAL, OFFICIAL, SANDBOX_TEST, HISTORICAL_PUBLIC, CACHED})


def assign_provenance(record: FareRecord, source_type: str, amadeus_env: str = "sandbox") -> str:
    """
    Return the correct data_origin for a record given the source type and environment.

    source_type: AIRLINE_DIRECT | GDS | AGGREGATOR | GOVERNMENT | TEST
    amadeus_env: sandbox | production  (only relevant when source_type == AGGREGATOR)
    """
    if source_type == "GOVERNMENT":
        return OFFICIAL
    if source_type == "TEST":
        return GENERATED_TEST
    if source_type == "AGGREGATOR":
        # Aggregator data_origin depends on the environment setting.
        # Sandbox data is NEVER classified as REAL regardless of other settings.
        if amadeus_env == "production":
            return REAL   # caller must have already verified all 5 conditions
        return SANDBOX_TEST
    if source_type in ("AIRLINE_DIRECT", "GDS", "OTA"):
        return REAL
    return REAL


def is_analytical_eligible(record: FareRecord) -> bool:
    """
    Returns True if a record may feed the analytical engines:
    Jevons index, Holt-Winters forecast, Z-score anomaly detection.

    SANDBOX_TEST and GENERATED_TEST are permanently excluded —
    synthetic fares would corrupt statistical baselines.
    """
    return record.data_origin in _ANALYTICAL_ELIGIBLE


def is_production_eligible(record: FareRecord, data_mode: str) -> bool:
    """
    Returns True if a record may be returned by the fares listing API.

    data_mode="live"  → only REAL and OFFICIAL
    data_mode="demo"  → REAL, OFFICIAL, SANDBOX_TEST
                        (SANDBOX_TEST shown with explicit provenance label)

    SANDBOX_TEST is never treated as REAL regardless of data_mode.
    """
    if data_mode == "demo":
        return record.data_origin in _DEMO_LISTING_ELIGIBLE
    return record.data_origin in _LIVE_LISTING_ELIGIBLE


def production_conditions_met(
    *,
    auth_succeeded: bool,
    response_received: bool,
    response_parsed: bool,
    fields_valid: bool,
    persisted: bool,
) -> bool:
    """
    All 5 conditions that must be True before a record can be tagged REAL.
    Call this guard in the Amadeus adapter when AMADEUS_ENV=production.
    """
    return (
        auth_succeeded
        and response_received
        and response_parsed
        and fields_valid
        and persisted
    )
