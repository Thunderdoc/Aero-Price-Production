"""
Collection orchestration service.

Pipeline per result:
  adapter.collect()
    → normalize (FareRecord → canonical form)
    → validate  (quality flags, hard reject)
    → deduplicate (raw_hash within 24h)
    → store FareObservation
    → store RawFarePayload (audit trail)
    → upsert SourceHealth

Source priority:
  1. AmadeusAdapter  — first authorized real source (sandbox free tier)
  2. IndiGoAdapter, AirIndiaAdapter, … — CHALLENGE_DETECTED until NDC creds set
"""
import uuid
import json
import hashlib
import logging
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.models.fare import FareObservation, RawFarePayload
from app.models.collection import CollectionRun, SourceHealth
from app.collectors.base import FareSourceAdapter, CollectionResult
from app.collectors.challenge import (
    IndiGoAdapter, AirIndiaAdapter, AkasaAdapter,
    SpiceJetAdapter, AirIndiaExpressAdapter,
)
from app.collectors.aggregators.amadeus import AmadeusAdapter
from app.collectors.duffel import DuffelAdapter, SOURCE_ID as DUFFEL_SOURCE_ID
from app.collectors.aggregators.googleflights_worker import GoogleFlightsWorkerAdapter
from app.collectors.aggregators.fast_flights import FastFlightsAdapter
from app.collectors.aggregators.scrapling_google_flights import ScraplingGoogleFlightsAdapter
from app.collectors.aggregators.serpapi_google_flights import SerpApiGoogleFlightsAdapter

logger = logging.getLogger(__name__)

ADVANCE_WINDOWS = [1, 7, 15, 30, 45]

ROUTE_BASKET = [
    "DEL-BOM", "DEL-BLR", "BOM-BLR", "DEL-CCU", "DEL-HYD",
    "DEL-MAA", "BOM-CCU", "BOM-HYD", "BLR-CCU", "BLR-HYD",
    "MAA-DEL", "MAA-BOM",
    # North and North-East coverage. These are collected through the same
    # authorised fare connectors as the core basket; no estimated prices are
    # introduced when a provider has no result for a corridor.
    "DEL-LKO", "DEL-JAI", "DEL-SXR", "DEL-PAT",
    "DEL-GAU", "CCU-GAU", "CCU-IMF",
]


def _amadeus_registry_entry() -> dict:
    configured = bool(settings.AMADEUS_API_KEY and settings.AMADEUS_API_SECRET)
    is_sandbox = "test.api.amadeus.com" in settings.AMADEUS_BASE_URL
    return {
        "id": "amadeus",
        "name": "Amadeus Self-Service Flight Offers",
        "type": "AGGREGATOR",
        "status": "CONFIGURED" if configured else "NOT_CONFIGURED",
        "mode": "SANDBOX" if is_sandbox else "PRODUCTION",
        "api_available": True,
        "credential_vars": ["AMADEUS_API_KEY", "AMADEUS_API_SECRET"],
        "note": (
            "Sandbox returns synthetic fares — structurally valid, pipeline-proven. "
            "Upgrade to production key for live market fares."
            if is_sandbox and configured else
            "Register free at https://developers.amadeus.com/self-service"
        ),
    }


AIRFARE_SOURCE_REGISTRY = [
    {
        "id": "indigo",
        "name": "IndiGo",
        "type": "AIRLINE_DIRECT",
        "status": "CHALLENGE_DETECTED",
        "challenge_reason": "Cloudflare Bot Management. Requires authorized NDC/API access.",
        "robots_txt": "DISALLOWED",
        "captcha_detected": True,
        "api_available": False,
        "credential_vars": ["INDIGO_API_KEY", "INDIGO_NDC_ENDPOINT"],
    },
    {
        "id": "airindia",
        "name": "Air India",
        "type": "AIRLINE_DIRECT",
        "status": "CHALLENGE_DETECTED",
        "challenge_reason": "Imperva/Akamai anti-scraping middleware.",
        "robots_txt": "DISALLOWED",
        "captcha_detected": True,
        "api_available": False,
        "credential_vars": ["AIRINDIA_API_KEY", "AIRINDIA_NDC_ENDPOINT"],
    },
    {
        "id": "airindia-express",
        "name": "Air India Express",
        "type": "AIRLINE_DIRECT",
        "status": "CHALLENGE_DETECTED",
        "challenge_reason": "Shared CDN protection with Air India.",
        "robots_txt": "DISALLOWED",
        "captcha_detected": True,
        "api_available": False,
        "credential_vars": ["AIRINDIA_API_KEY", "AIRINDIA_NDC_ENDPOINT"],
    },
    {
        "id": "akasa",
        "name": "Akasa Air",
        "type": "AIRLINE_DIRECT",
        "status": "CHALLENGE_DETECTED",
        "challenge_reason": "JS-rendered SPA + reCAPTCHA v3.",
        "robots_txt": "DISALLOWED",
        "captcha_detected": True,
        "api_available": False,
        "credential_vars": ["AKASA_API_KEY", "AKASA_NDC_ENDPOINT"],
    },
    {
        "id": "spicejet",
        "name": "SpiceJet",
        "type": "AIRLINE_DIRECT",
        "status": "CHALLENGE_DETECTED",
        "challenge_reason": "Cloudflare Enterprise + browser fingerprinting.",
        "robots_txt": "DISALLOWED",
        "captcha_detected": True,
        "api_available": False,
        "credential_vars": ["SPICEJET_API_KEY", "SPICEJET_NDC_ENDPOINT"],
    },
]

GOV_SOURCE_REGISTRY = [
    {
        "id": "dgca-pax",
        "name": "DGCA Monthly Passenger Statistics",
        "type": "GOVERNMENT",
        "status": "CONFIGURED",
        "api_key_required": False,
        "access_method": "AllOrigins HTML parse",
    },
    {
        "id": "dgca-circulars",
        "name": "DGCA Circulars & Press Releases",
        "type": "GOVERNMENT",
        "status": "CONFIGURED",
        "api_key_required": False,
        "access_method": "AllOrigins HTML parse",
    },
    {
        "id": "mospi-esankhyiki",
        "name": "MoSPI CPI-Transport",
        "type": "GOVERNMENT",
        "status": "STALE",
        "api_key_required": False,
        "access_method": "AllOrigins — JS SPA returns skeleton only. Manual download required.",
    },
    {
        "id": "data-gov-in",
        "name": "data.gov.in Aviation Dataset",
        "type": "GOVERNMENT",
        "status": "NOT_CONFIGURED",
        "api_key_required": False,
        "access_method": "Direct JSON — set DATAGOV_AVIATION_DATASET_ID to enable",
    },
]


AMADEUS_SOURCE = {
    "id": "amadeus",
    "name": "Amadeus Self-Service API",
    "type": "AGGREGATOR",
    "status": "CONFIGURED" if settings.AMADEUS_API_KEY else "NOT_CONFIGURED",
    "api_key_required": True,
    "credential_vars": ["AMADEUS_API_KEY", "AMADEUS_API_SECRET"],
    "robots_txt": "ALLOWED",
    "captcha_detected": False,
    "api_available": True,
    "note": "Authorized B2B flight content API. Sandbox: free. Production: requires approval.",
    "registration_url": "https://developers.amadeus.com/",
}

AIRFARE_SOURCE_REGISTRY.append(AMADEUS_SOURCE)

DUFFEL_SOURCE = {
    "id": DUFFEL_SOURCE_ID,
    "name": "Duffel Air (duffel.com)",
    "type": "AGGREGATOR",
    "status": "CONFIGURED" if settings.DUFFEL_API_TOKEN else "NOT_CONFIGURED",
    "robots_txt": "ALLOWED",
    "captcha_detected": False,
    "api_available": True,
    "note": (
        "Authorized Duffel REST API. live_mode=true → data_origin=REAL. "
        "live_mode=false (test token) → data_origin=SANDBOX_TEST. "
        "Set DUFFEL_API_TOKEN in .env. Register at https://duffel.com/"
    ),
    "registration_url": "https://app.duffel.com/join",
    "credential_vars": ["DUFFEL_API_TOKEN"],
}
AIRFARE_SOURCE_REGISTRY.append(DUFFEL_SOURCE)

# These connectors may already have persisted observations from an earlier
# collection run. Keep them in the directory so the admin UI can explain the
# provenance of stored data instead of presenting an incomplete source list.
AIRFARE_SOURCE_REGISTRY.extend([
    {
        "id": "scrapling-google-flights",
        "name": "Google Flights via Scrapling",
        "type": "PUBLIC_INTERFACE",
        "status": "CONFIGURED",
        "api_available": False,
        "robots_txt": "PUBLIC_INTERFACE",
        "note": "Optional Scrapling browser/stealth fetcher. Stores rows only after a stable fare payload parser is available.",
    },
    {
        "id": "fast-flights",
        "name": "Google Flights via fast-flights",
        "type": "PUBLIC_INTERFACE",
        "status": "NOT_CONFIGURED",
        "api_available": False,
        "robots_txt": "PUBLIC_INTERFACE",
        "note": "Optional public-interface adapter; only recent successful runs are treated as live.",
    },
    {
        "id": "google-flights",
        "name": "Google Flights stored observations",
        "type": "PUBLIC_INTERFACE",
        "status": "STALE_DATA",
        "api_available": False,
        "robots_txt": "PUBLIC_INTERFACE",
        "note": "Historical stored observations from an earlier worker; not an active connector.",
    },
    {
        "id": "serpapi-google-flights",
        "name": "SerpApi Google Flights",
        "type": "AGGREGATOR",
        "status": "CONFIGURED" if settings.SERPAPI_API_KEY else "NOT_CONFIGURED",
        "api_available": True,
        "credential_vars": ["SERPAPI_API_KEY"],
        "note": "Authorized provider connector; requires a server-side SerpApi key.",
        "registration_url": "https://serpapi.com/",
    },
])



def _make_adapters() -> list[FareSourceAdapter]:
    amadeus_cfg = {
        "AMADEUS_API_KEY": settings.AMADEUS_API_KEY,
        "AMADEUS_API_SECRET": settings.AMADEUS_API_SECRET,
        "AMADEUS_BASE_URL": settings.AMADEUS_BASE_URL,
    }
    airline_cfg = {
        "INDIGO_API_KEY": settings.INDIGO_API_KEY,
        "INDIGO_NDC_ENDPOINT": settings.INDIGO_NDC_ENDPOINT,
        "AIRINDIA_API_KEY": settings.AIRINDIA_API_KEY,
        "AIRINDIA_NDC_ENDPOINT": settings.AIRINDIA_NDC_ENDPOINT,
        "AKASA_API_KEY": settings.AKASA_API_KEY,
        "AKASA_NDC_ENDPOINT": settings.AKASA_NDC_ENDPOINT,
        "SPICEJET_API_KEY": settings.SPICEJET_API_KEY,
        "SPICEJET_NDC_ENDPOINT": settings.SPICEJET_NDC_ENDPOINT,
        "AMADEUS_API_KEY": settings.AMADEUS_API_KEY,
        "AMADEUS_API_SECRET": settings.AMADEUS_API_SECRET,
        "AMADEUS_BASE_URL": settings.AMADEUS_BASE_URL,
    }
    duffel_cfg = {"DUFFEL_API_TOKEN": settings.DUFFEL_API_TOKEN}

    adapters: list[FareSourceAdapter] = [
        FastFlightsAdapter(),             # no-key public-interface collector
        ScraplingGoogleFlightsAdapter(),  # no fake rows; probes for stable real payloads
        GoogleFlightsWorkerAdapter(),  # explicit external worker; disabled by default
        SerpApiGoogleFlightsAdapter(),  # authorized provider; disabled without key
        DuffelAdapter(duffel_cfg),     # authorized Duffel REST API — REAL or SANDBOX_TEST
        IndiGoAdapter(airline_cfg),    # CHALLENGE_DETECTED until NDC credentials provided
        AirIndiaAdapter(airline_cfg),
        AirIndiaExpressAdapter(airline_cfg),
        AkasaAdapter(airline_cfg),
        SpiceJetAdapter(airline_cfg),
    ]
    return adapters


async def _store_raw_payload(
    db: AsyncSession,
    result: CollectionResult,
    collection_run_id: str,
    raw_body: str,
):
    """Persist the raw API response for audit trail. Never stores credentials."""
    try:
        db.add(RawFarePayload(
            id=str(uuid.uuid4()),
            collection_run_id=collection_run_id,
            source=result.source_id,
            route=result.route,
            travel_date=result.travel_date,
            advance_days=result.advance_days,
            payload=raw_body[:65536],  # cap at 64KB
            payload_type="JSON",
            collected_at=datetime.now(timezone.utc),
        ))
    except Exception as e:
        logger.warning(f"Failed to store raw payload for {result.source_id}: {e}")


async def _upsert_source_health(
    db: AsyncSession,
    result: CollectionResult,
    all_registries: list[dict],
):
    row = await db.get(SourceHealth, result.source_id)
    now = datetime.now(timezone.utc)
    if not row:
        src = next((s for s in all_registries if s["id"] == result.source_id), {})
        row = SourceHealth(
            source_id=result.source_id,
            source_name=src.get("name", result.source_id),
            source_type=src.get("type", "AIRLINE_DIRECT"),
        )
        db.add(row)
    row.last_attempt = now
    row.updated_at = now
    row.enabled = result.status not in ("NOT_CONFIGURED", "CHALLENGE_DETECTED")
    if result.status == "SUCCESS":
        row.status = "LIVE"
        row.last_success = now
        row.last_failure = None
        row.failure_reason = None
        row.records_total = (row.records_total or 0) + len(result.records)
        if result.latency_ms:
            row.latency_ms_avg = result.latency_ms
        row.auth_status = "VALID"
    elif result.status == "NO_DATA":
        row.status = "DEGRADED"
        row.last_success = now  # request succeeded, just no results
        row.last_failure = None
        row.failure_reason = result.error
        row.auth_status = "VALID"
        if result.latency_ms:
            row.latency_ms_avg = result.latency_ms
    elif result.status == "CHALLENGE_DETECTED":
        row.status = "CHALLENGE_DETECTED"
        row.last_failure = now
        row.challenge_reason = result.challenge_reason
        row.auth_status = "CHALLENGE_DETECTED"
    elif result.status == "NOT_CONFIGURED":
        row.status = "NOT_CONFIGURED"
    elif result.status in ("FAILED", "TIMEOUT"):
        row.status = "DEGRADED"
        row.last_failure = now
        row.failure_reason = result.error


async def run_collection(
    db: AsyncSession,
    triggered_by: str = "scheduler",
    routes: list[str] | None = None,
    advance_windows: list[int] | None = None,
    adapter_ids: set[str] | None = None,
) -> str:
    """
    Execute one full collection run across all routes and advance windows.

    Pipeline for each result:
      1. adapter.collect()   — source-specific HTTP call
      2. normalize()         — canonical form, raw_hash
      3. validate_batch()    — quality flags, hard reject
      4. deduplicate_batch() — 24h dedup by raw_hash
      5. store FareObservation rows
      6. store RawFarePayload for audit
      7. upsert SourceHealth

    Partial failures are tolerated — one broken adapter does not abort the run.
    """
    run_id = str(uuid.uuid4())
    selected_routes = routes or ROUTE_BASKET
    selected_windows = advance_windows or ADVANCE_WINDOWS
    adapters = _make_adapters()
    if adapter_ids is not None:
        adapters = [adapter for adapter in adapters if adapter.source_id in adapter_ids]
    all_registries = AIRFARE_SOURCE_REGISTRY + GOV_SOURCE_REGISTRY
    routes_planned = len(selected_routes) * len(selected_windows)
    total_collected = 0
    total_rejected = 0

    run = CollectionRun(
        run_id=run_id,
        triggered_by=triggered_by,
        routes_planned=routes_planned,
        status="RUNNING",
    )
    db.add(run)
    await db.commit()

    amadeus_configured = bool(settings.AMADEUS_API_KEY and settings.AMADEUS_API_SECRET)
    logger.info(
        f"Collection run {run_id} started. Routes: {len(selected_routes)}, "
        f"Windows: {selected_windows}, Adapters: {len(adapters)}, "
        f"Amadeus: {'CONFIGURED' if amadeus_configured else 'NOT_CONFIGURED'}"
    )

    try:
        today = date.today()
        routes_done = 0

        for route in selected_routes:
            for advance_days in selected_windows:
                travel_date = (today + timedelta(days=advance_days)).isoformat()

                for adapter in adapters:
                    try:
                        result = await adapter.collect(route, travel_date, advance_days, run_id)
                        await _upsert_source_health(db, result, all_registries)

                        if result.status in ("SUCCESS", "PARTIAL") and result.records:
                            # ── Processing pipeline: normalize → quality → deduplicate ──
                            from app.processing.normalize import normalize_fare
                            from app.processing.quality import validate_batch
                            from app.processing.deduplicate import deduplicate_batch

                            normalized = [normalize_fare(r) for r in result.records]
                            normalized = [r for r in normalized if r is not None]
                            valid_recs, rejected_recs, reject_count = validate_batch(normalized)
                            unique_recs, dup_count = await deduplicate_batch(db, valid_recs)
                            total_rejected += reject_count + dup_count

                            batch_real = 0
                            batch_sandbox = 0

                            for rec in unique_recs:
                                obs_id = str(uuid.uuid4())
                                persist_ok = False
                                try:
                                    db.add(FareObservation(
                                        observation_id=obs_id,
                                        collection_run_id=run_id,
                                        origin=rec.origin,
                                        destination=rec.destination,
                                        route=rec.route,
                                        airline=rec.airline,
                                        flight_number=rec.flight_number,
                                        departure_time=rec.departure_time,
                                        arrival_time=rec.arrival_time,
                                        stops=rec.stops,
                                        travel_date=rec.travel_date,
                                        advance_days=rec.advance_days,
                                        fare_family=rec.fare_family,
                                        cabin=rec.cabin,
                                        base_fare=rec.base_fare,
                                        taxes=rec.taxes,
                                        fees=rec.fees,
                                        total_fare=rec.total_fare,
                                        currency=rec.currency,
                                        availability_status=rec.availability_status,
                                        source=rec.source or adapter.source_id,
                                        source_url=rec.source_url,
                                        data_origin=rec.data_origin,
                                        collector_version="2.0",
                                        raw_hash=rec.raw_hash,
                                        quality_flags=json.dumps(rec.quality_flags or []),
                                        is_valid=True,
                                    ))
                                    persist_ok = True
                                    total_collected += 1
                                except Exception as persist_err:
                                    logger.error(
                                        "Failed to add observation for %s: %s", rec.route, persist_err
                                    )

                                # ── Condition 5: finalize provenance after DB add ──────
                                # AmadeusAdapter.finalize_provenance() downgrades any
                                # provisional REAL to SANDBOX_TEST if persist failed.
                                if hasattr(adapter, "finalize_provenance"):
                                    rec = adapter.finalize_provenance(rec, persist_ok)

                                if rec.data_origin == "REAL":
                                    batch_real += 1
                                elif rec.data_origin == "SANDBOX_TEST":
                                    batch_sandbox += 1

                            if batch_real or batch_sandbox:
                                logger.info(
                                    "%s %s T+%d: %d REAL, %d SANDBOX_TEST stored",
                                    adapter.source_id, route, advance_days,
                                    batch_real, batch_sandbox,
                                )

                            # ── Raw payload audit trail ───────────────────────────────
                            # Stored for all records regardless of data_origin.
                            # Metadata only — no credentials included.
                            if unique_recs:
                                try:
                                    import json as _json
                                    raw_body = _json.dumps({
                                        "source": adapter.source_id,
                                        "amadeus_env": getattr(settings, "AMADEUS_ENV", "sandbox"),
                                        "route": route,
                                        "travel_date": travel_date,
                                        "advance_days": advance_days,
                                        "records_stored": len(unique_recs),
                                        "real_count": batch_real,
                                        "sandbox_test_count": batch_sandbox,
                                        "note": (
                                            "REAL: production GDS fare" if batch_real
                                            else "SANDBOX_TEST: synthetic fare from Amadeus test environment"
                                        ),
                                    })
                                    await _store_raw_payload(db, result, run_id, raw_body)
                                except Exception as raw_err:
                                    logger.warning("Raw payload store failed (non-fatal): %s", raw_err)

                    except Exception as e:
                        # A provider/source-health write can fail after a
                        # database constraint or schema error. PostgreSQL
                        # marks the transaction aborted until rollback;
                        # recover before trying the next provider so one bad
                        # source cannot poison the entire collection run.
                        await db.rollback()
                        logger.error(
                            f"Adapter {adapter.source_id} raised unexpectedly "
                            f"for {route} T+{advance_days}: {e}"
                        )

                routes_done += 1

                # Commit every route-window batch to avoid a single giant transaction
                if routes_done % 10 == 0:
                    await db.commit()

        await db.commit()

        # The first fully covered real-data run establishes a 100-point base;
        # future runs measure the Jevons change against that real baseline.
        from app.services.index_engine import publish_index
        await publish_index(db, date.today().isoformat(), [
            {"route": route, "weight": 1.0} for route in selected_routes
        ])

        final_status = (
            "COMPLETED" if total_collected > 0
            else "NO_DATA" if not amadeus_configured
            else "PARTIAL"
        )
        run.status = final_status
        run.ended_at = datetime.now(timezone.utc)
        run.routes_done = routes_done
        run.observations_collected = total_collected
        run.observations_rejected = total_rejected
        await db.commit()

        amadeus_env = getattr(settings, "AMADEUS_ENV", "sandbox")
        logger.info(
            "Run %s finished [%s]: %d stored, %d rejected. "
            "AMADEUS_ENV=%s. "
            "%s",
            run_id, final_status, total_collected, total_rejected,
            amadeus_env,
            (
                "Records are tagged REAL (production GDS)." if amadeus_env == "production" and total_collected > 0
                else "Records are tagged SANDBOX_TEST (synthetic). Set AMADEUS_ENV=production + production URL for real fares." if total_collected > 0
                else "0 observations stored. Set AMADEUS_API_KEY + AMADEUS_API_SECRET in .env to enable collection."
            ),
        )

    except Exception as e:
        logger.error(f"Collection run {run_id} failed at orchestration level: {e}")
        run.status = "FAILED"
        run.ended_at = datetime.now(timezone.utc)
        run.error_summary = str(e)[:1000]
        await db.commit()

    return run_id
