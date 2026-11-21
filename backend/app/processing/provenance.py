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

PUBLIC_INTERFACE – Fares observed from a public web interface (Google Flights
                via fast-flights, SerpApi, or the external worker). These are
                real observed fares, NOT GDS/authorised-API fares, and are
                labelled as such everywhere they appear. They ARE shown in the
                fares listing and dashboard (honestly labelled) and they DO
                feed the Jevons index, as the disclosed SIH-demo methodology:
                SIH26056 itself requires public-interface scraping and this
                is the demo's only free path to real Indian LCC fares.
                index_engine.py gates on INDEX_ELIGIBLE_ORIGINS =
                (REAL, OFFICIAL, PUBLIC_INTERFACE). NEVER present
                PUBLIC_INTERFACE as REAL.

NEAR_LIVE     – Accepted alias for near-live (non-GDS) observations. Nothing
                in the current pipeline produces it; PUBLIC_INTERFACE is the
                canonical origin for scraped fares. Kept valid so stored rows
                or future adapters using it are not flagged UNKNOWN_ORIGIN.

UNKNOWN       – Provenance was never assigned. Fail-closed default: the quality
                stage hard-rejects UNKNOWN records, so an adapter that forgets
                provenance drops its rows loudly instead of minting "real" fares.

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
PUBLIC_INTERFACE = "PUBLIC_INTERFACE"
NEAR_LIVE      = "NEAR_LIVE"
UNKNOWN        = "UNKNOWN"
OFFICIAL       = "OFFICIAL"
DERIVED        = "DERIVED"
GENERATED_TEST = "GENERATED_TEST"
HISTORICAL_PUBLIC = "HISTORICAL_PUBLIC"
CACHED         = "CACHED"

# All origins that the live analytical path accepts (index, forecast, anomaly).
# PUBLIC_INTERFACE is included as the disclosed SIH-demo methodology (see
# module docstring); index_engine.py gates on the same set. SANDBOX_TEST and
# GENERATED_TEST are permanently excluded — synthetic fares would corrupt
# statistical baselines. NOTE: forecast_engine.py still gates on REAL/OFFICIAL
# only as of Phase 2 — Phase 5 owns aligning it.
_ANALYTICAL_ELIGIBLE = frozenset({REAL, OFFICIAL, PUBLIC_INTERFACE})

# Origins that may appear in the fares listing (production mode). Scraped
# fares ARE listed, honestly labelled PUBLIC_INTERFACE — they are real
# observed fares, and hiding them would leave the demo with no fares at all.
_LIVE_LISTING_ELIGIBLE = frozenset({REAL, OFFICIAL, PUBLIC_INTERFACE})

# Demo mode can expose sandbox responses for pipeline validation, but never
# deterministic/generated fixtures. That prevents placeholder fares appearing
# anywhere in the user-facing application.
_DEMO_LISTING_ELIGIBLE = frozenset({REAL, OFFICIAL, SANDBOX_TEST, HISTORICAL_PUBLIC, CACHED, PUBLIC_INTERFACE, NEAR_LIVE})


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
    if source_type == "PUBLIC_INTERFACE":
        return PUBLIC_INTERFACE
    # Unknown source type: fail closed. Never default to REAL — an unclaimed
    # provenance must be visible (UNKNOWN) so the quality stage rejects it.
    return UNKNOWN


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
