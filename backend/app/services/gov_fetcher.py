"""
Government data fetchers.
Uses AllOrigins proxy to access public government HTML pages.
All data tagged OFFICIAL. Never presented as live airfare observations.

Retry policy: up to MAX_RETRIES attempts with exponential backoff starting at
BACKOFF_BASE_S seconds.  Only transient errors (network, 5xx, timeout) trigger
retries — 4xx errors are treated as terminal failures.
"""
import asyncio
import time
import hashlib
import json
import logging
import ssl
import re
from calendar import month_abbr
from datetime import datetime, timezone
from urllib.parse import urlencode
import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.government import (
    GovDataset, DgcaMonthlyRecord, MospiCpiRecord, MospiTransportSeries, DgcaCircular, PpacAtfRecord, DataGovAviationRecord
)

logger = logging.getLogger(__name__)

TIMEOUT = 30.0
MAX_RETRIES = 3
BACKOFF_BASE_S = 2.0  # wait 2s, 4s, 8s between retries


def _mospi_ssl_context() -> ssl.SSLContext:
    """Build the narrow TLS compatibility context required by MoSPI.

    The MoSPI API currently negotiates legacy renegotiation.  Some Render
    Python/OpenSSL builds expose the compatibility flag while others do not,
    so use the documented constant when available and its OpenSSL value as a
    compatibility fallback.  Certificate verification remains enabled.
    """
    context = ssl.create_default_context()
    legacy_flag = getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    context.options |= legacy_flag
    return context


def _safe_error(error: Exception) -> str:
    """Return an error message without leaking query-string credentials."""
    return re.sub(r"([?&]api-key=)[^&\s]+", r"\1[REDACTED]", str(error))[:500]

GOV_DATASET_REGISTRY = [
    {
        "dataset_id": "dgca-pax",
        "source_name": "DGCA Monthly Passenger Statistics",
        "organization": "Directorate General of Civil Aviation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": settings.DGCA_STATS_URL,
    },
    {
        "dataset_id": "dgca-circulars",
        "source_name": "DGCA Circulars & Press Releases",
        "organization": "Directorate General of Civil Aviation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": settings.DGCA_CIRCULARS_URL,
    },
    {
        "dataset_id": "mospi-esankhyiki",
        "source_name": "MoSPI eSankhyiki CPI Transport",
        "organization": "Ministry of Statistics and Programme Implementation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": settings.MOSPI_ESANKHYIKI_URL,
    },
    {
        "dataset_id": "data-gov-in",
        "source_name": "data.gov.in Aviation Dataset",
        "organization": "National Data & Analytics Platform",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "JSON",
        "source_url": "https://www.data.gov.in/catalog/monthly-air-traffic-statistics",
    },
    {
        "dataset_id": "ppac-atf",
        "source_name": "PPAC Aviation Turbine Fuel Publications",
        "organization": "Petroleum Planning & Analysis Cell",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML/PDF",
        "source_url": settings.PPAC_ATF_URL,
    },
    {
        "dataset_id": "dgca-fleet",
        "source_name": "DGCA Aircraft Fleet Reference",
        "organization": "Directorate General of Civil Aviation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": settings.DGCA_FLEET_URL,
    },
]


async def ensure_gov_dataset_registry(db: AsyncSession) -> int:
    """Seed source metadata even when scheduled network collection is disabled."""
    added = 0
    for meta in GOV_DATASET_REGISTRY:
        if await db.get(GovDataset, meta["dataset_id"]):
            continue
        db.add(GovDataset(**meta, status="NOT_FETCHED"))
        added += 1
    if added:
        await db.commit()
    return added


async def _official_get(url: str) -> dict:
    """
    Fetch an official source directly with exponential backoff retry.

    Returns {contents, status_code, latency_ms}.
    Raises the last exception after MAX_RETRIES attempts.
    """
    last_exc: Exception = RuntimeError("No attempts made")
    start = time.time()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, trust_env=False, headers={
                "User-Agent": "AeroPriceIndia/1.0 (public-data-monitor)",
                "Accept": "text/html,application/xhtml+xml,application/json,text/csv,*/*;q=0.8",
            }) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                return {
                    "contents": resp.text,
                    "status_code": resp.status_code,
                    "latency_ms": int((time.time() - start) * 1000),
                }
        except httpx.HTTPStatusError as e:
            last_exc = e
            # 4xx = not retryable (content not found, bad URL)
            if 400 <= e.response.status_code < 500:
                logger.warning(f"Official source {_safe_error(url)}: HTTP {e.response.status_code} — not retrying")
                raise
            logger.warning(f"Official source {_safe_error(url)}: attempt {attempt}/{MAX_RETRIES} → HTTP {e.response.status_code}")
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as e:
            last_exc = e
            logger.warning(f"Official source {_safe_error(url)}: attempt {attempt}/{MAX_RETRIES} → {type(e).__name__}")

        if attempt < MAX_RETRIES:
            wait = BACKOFF_BASE_S * (2 ** (attempt - 1))
            logger.debug(f"Official-source retry in {wait:.1f}s")
            await asyncio.sleep(wait)

    raise last_exc


async def _upsert_dataset_status(
    db: AsyncSession,
    dataset_id: str,
    status: str,
    record_count: int = None,
    failure_reason: str = None,
    reference_period: str = None,
):
    row = await db.get(GovDataset, dataset_id)
    now = datetime.now(timezone.utc)
    if row:
        row.status = status
        row.last_attempt = now
        if status in ("CONNECTED", "HEALTHY"):
            row.last_retrieved = now
        if record_count is not None:
            row.record_count = record_count
        if failure_reason:
            row.failure_reason = failure_reason
        elif status in ("CONNECTED", "HEALTHY"):
            row.failure_reason = None
        if reference_period:
            row.reference_period = reference_period
    else:
        meta = next((d for d in GOV_DATASET_REGISTRY if d["dataset_id"] == dataset_id), {})
        db.add(GovDataset(
            dataset_id=dataset_id,
            source_name=meta.get("source_name", dataset_id),
            organization=meta.get("organization", ""),
            access_type=meta.get("access_type", "PUBLIC"),
            api_key_required=meta.get("api_key_required", "NO"),
            format=meta.get("format", "HTML"),
            source_url=meta.get("source_url", ""),
            status=status,
            last_attempt=now,
            last_retrieved=now if status in ("CONNECTED", "HEALTHY") else None,
            record_count=record_count,
            failure_reason=failure_reason,
            reference_period=reference_period,
        ))
    await db.commit()


async def fetch_dgca_monthly(db: AsyncSession) -> dict:
    """
    Fetch DGCA Monthly Domestic Traffic Statistics.
    Public HTML table — no authentication required.
    """
    try:
        result = await _official_get(settings.DGCA_STATS_URL)
        html = result["contents"]
        soup = BeautifulSoup(html, "lxml")

        records_saved = 0
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                if len(cells) < 3:
                    continue
                try:
                    month_text = cells[0].get_text(strip=True)
                    year_text = cells[1].get_text(strip=True)
                    pax_text = cells[2].get_text(strip=True).replace(",", "").replace(" ", "")
                    if not pax_text.isdigit():
                        continue
                    month = int(month_text) if month_text.isdigit() else None
                    year = int(year_text) if year_text.isdigit() else None
                    if not month or not year:
                        continue
                    existing = await db.scalar(
                        select(DgcaMonthlyRecord).where(
                            DgcaMonthlyRecord.month == month,
                            DgcaMonthlyRecord.year == year,
                        )
                    )
                    if not existing:
                        db.add(DgcaMonthlyRecord(
                            month=month,
                            year=year,
                            domestic_passengers=int(pax_text),
                            source="OFFICIAL",
                        ))
                        records_saved += 1
                except (ValueError, IndexError):
                    continue

        await db.commit()

        if records_saved == 0:
            # The public page was available but did not contain a usable table.
            logger.warning("DGCA: HTML fetched but no table rows parsed. Portal may have changed structure.")
            await _upsert_dataset_status(db, "dgca-pax", "STALE",
                failure_reason="HTML fetched but no parseable table rows found.")
            return {"status": "STALE", "records": 0}

        await _upsert_dataset_status(db, "dgca-pax", "CONNECTED", record_count=records_saved)
        return {"status": "CONNECTED", "records": records_saved}

    except Exception as e:
        reason = _safe_error(e)
        logger.error(f"DGCA monthly fetch failed: {reason}")
        await _upsert_dataset_status(db, "dgca-pax", "FAILED", failure_reason=reason)
        return {"status": "FAILED", "error": str(e)}


async def fetch_mospi_cpi(db: AsyncSession) -> dict:
    """Import official all-India Combined transport series, separated by base year.

    The MoSPI host requires legacy TLS renegotiation on some machines. Windows
    curl uses Schannel successfully while keeping certificate verification on.
    """
    try:
        if not settings.MOSPI_API_EMAIL or not settings.MOSPI_API_PASSWORD:
            reason = "MoSPI API credentials are not configured; no unauthenticated data is imported."
            await _upsert_dataset_status(db, "mospi-esankhyiki", "NOT_CONFIGURED", failure_reason=reason)
            return {"status": "NOT_CONFIGURED", "records": 0, "reason": reason}
        # MoSPI's API endpoint currently requires the OpenSSL legacy-server
        # compatibility flag. Scope this context to MoSPI only; certificate
        # verification remains enabled and global TLS policy is unchanged.
        mospi_tls = _mospi_ssl_context()
        now = datetime.now(timezone.utc)
        stored = await db.execute(select(MospiTransportSeries))
        existing = {(row.base_year, row.period): row for row in stored.scalars().all()}
        saved = 0
        updated = 0

        async def request(params: dict) -> dict:
            headers = {"accept": "application/json", "Content-Type": "application/json"}
            if settings.MOSPI_API_EMAIL and settings.MOSPI_API_PASSWORD:
                async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, trust_env=False, verify=mospi_tls) as client:
                    # The current portal uses the registration username. The
                    # registration guide describes that username as an email
                    # address, but the login route rejects duplicate identity
                    # fields, so send only the canonical username field.
                    login = await client.post("https://api.mospi.gov.in/api/users/login", json={
                        "username": settings.MOSPI_API_EMAIL,
                        "password": settings.MOSPI_API_PASSWORD,
                    })
                    login.raise_for_status()
                    try:
                        login_body = login.json()
                    except ValueError as exc:
                        raise RuntimeError("MoSPI login returned a non-JSON response") from exc
                    response_body = login_body.get("response")
                    response_token = response_body if isinstance(response_body, str) else (
                        response_body.get("token") or response_body.get("Token")
                        or response_body.get("access_token") if isinstance(response_body, dict) else None
                    )
                    token = (login_body.get("token") or login_body.get("Token")
                             or login_body.get("access_token") or response_token)
                    if not token:
                        raise RuntimeError("MoSPI login succeeded without an access token")
                    headers["Authorization"] = f"Bearer {token}"
            # The current portal split CPI into a legacy 2012 group endpoint
            # and a unified 2024 endpoint.  Keep the provider-specific query
            # spelling here instead of sending our internal snake_case names
            # directly to the public API.
            if params.get("base_year") == 2024:
                url = "https://api.mospi.gov.in/api/cpi/getCPIData"
                api_params = {
                    "base_year": 2024,
                    "level": params.get("level", "Group"),
                    "series": params.get("series", "Current"),
                    "year": params.get("year"),
                    "state_code": 1,
                    "sector_code": 3,
                }
                if params.get("month_code") is not None:
                    api_params["month"] = params["month_code"]
            else:
                url = settings.MOSPI_CPI_API_URL
                api_params = {
                    "Series": "Current_series_2012",
                    "Format": "JSON",
                    "Year": params.get("year"),
                    # The current endpoint accepts the filter names in
                    # snake_case even though the remaining legacy fields are
                    # documented with initial capitals.
                    "state_code": 99,
                    "sector_code": 3,
                }
            url = f"{url}?{urlencode({k: v for k, v in api_params.items() if v is not None})}"
            async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, trust_env=False, verify=mospi_tls, headers=headers) as client:
                response = await client.get(url)
                response.raise_for_status()
                try:
                    payload = response.json()
                except ValueError as exc:
                    content_type = response.headers.get("content-type", "unknown")
                    raise RuntimeError(
                        f"MoSPI CPI endpoint returned non-JSON ({content_type})"
                    ) from exc
            if payload.get("statusCode") is not True:
                raise RuntimeError(f"MoSPI rejected query: {str(payload.get('error') or payload.get('msg'))[:160]}")
            return payload

        def accept(row: dict, base_year: int, url: str) -> bool:
            nonlocal saved, updated
            if row.get("state") != "All India" or row.get("sector") != "Combined":
                return False
            if base_year == 2012:
                if row.get("subgroup") != "Transport and Communication":
                    return False
                definition = "Transport and Communication"
            else:
                if row.get("code") != "07" or row.get("division") != "Transport" or row.get("group"):
                    return False
                definition = "Transport"
            month = next((i for i, name in enumerate(month_abbr) if name.lower() == str(row.get("month", ""))[:3].lower()), 0)
            try:
                year = int(row["year"])
                value = float(row["index"])
            except (KeyError, TypeError, ValueError):
                return False
            if not 1 <= month <= 12 or not 0 < value < 1000:
                return False
            period = f"{year}-{month:02d}"
            key = (base_year, period)
            item = existing.get(key)
            if item is None:
                item = MospiTransportSeries(base_year=base_year, period=period, value=value,
                    definition=definition, series=str(row.get("series") or "Current"),
                    publisher_status=row.get("status"), source_url=url)
                db.add(item)
                existing[key] = item
                saved += 1
            elif item.value != value:
                item.value = value
                item.retrieved_at = now
                item.publisher_status = row.get("status")
                updated += 1
            return True

        # Base 2012: the current provider returns the filtered group rows in a
        # single response. Do not apply the old meta_data/page contract: that
        # contract belonged to the retired /api/getCPIIndex route.
        for year in range(2013, min(now.year, 2025) + 1):
            if all((2012, f"{year}-{month:02d}") in existing for month in range(1, 13)):
                continue
            params = {"base_year": 2012, "level": "Group", "year": year}
            payload = await request(params)
            url = f"{settings.MOSPI_CPI_API_URL}?{urlencode(params)}"
            for row in payload.get("data", []):
                accept(row, 2012, url)
            await db.commit()

        # Base 2024: transport is division 07. The API currently publishes
        # monthly rows from 2025; never splice their levels into base 2012.
        for year in range(2025, now.year + 1):
            for month in range(1, 13 if year < now.year else now.month + 1):
                period = f"{year}-{month:02d}"
                if (2024, period) in existing and period != f"{now.year}-{now.month:02d}":
                    continue
                params = {"base_year": 2024, "level": "Group", "series": "Current",
                    "year": year, "month_code": month}
                payload = await request(params)
                url = f"https://api.mospi.gov.in/api/cpi/getCPIData?{urlencode(params)}"
                for row in payload.get("data", []):
                    accept(row, 2024, url)
            await db.commit()

        total = len(existing)
        status = "CONNECTED" if total else "STALE"
        await _upsert_dataset_status(db, "mospi-esankhyiki", status, record_count=total,
            reference_period="2013-present" if total else None,
            failure_reason=None if total else "Official API returned no matching transport rows.")
        return {"status": status, "records": total, "saved": saved, "updated": updated}

    except Exception as e:
        reason = _safe_error(e)
        logger.error(f"MoSPI fetch failed: {reason}")
        await _upsert_dataset_status(db, "mospi-esankhyiki", "FAILED", failure_reason=reason)
        return {"status": "FAILED", "error": str(e)}


async def fetch_dgca_circulars(db: AsyncSession) -> dict:
    try:
        result = await _official_get(settings.DGCA_CIRCULARS_URL)
        html = result["contents"]
        soup = BeautifulSoup(html, "lxml")

        saved = 0
        links = soup.find_all("a", href=True)
        for link in links:
            text = link.get_text(strip=True)
            if len(text) < 10:
                continue
            href = link["href"]
            if not any(kw in text.lower() for kw in ["circular", "order", "advisory", "press"]):
                continue
            existing = await db.scalar(
                select(DgcaCircular).where(DgcaCircular.title == text)
            )
            if not existing:
                db.add(DgcaCircular(
                    title=text[:500],
                    date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    category="CIRCULAR",
                    url=href if href.startswith("http") else f"https://dgca.gov.in{href}",
                ))
                saved += 1

        await db.commit()
        if saved > 0:
            await _upsert_dataset_status(db, "dgca-circulars", "CONNECTED", record_count=saved)
            return {"status": "CONNECTED", "records": saved}
        else:
            await _upsert_dataset_status(db, "dgca-circulars", "STALE",
                failure_reason="No circular links found in DGCA portal response.")
            return {"status": "STALE", "records": 0}

    except Exception as e:
        reason = _safe_error(e)
        logger.error(f"DGCA circulars fetch failed: {reason}")
        await _upsert_dataset_status(db, "dgca-circulars", "FAILED", failure_reason=reason)
        return {"status": "FAILED", "error": str(e)}


async def fetch_dgca_fleet_source(db: AsyncSession) -> dict:
    """Verify the official DGCA fleet-reference page without inventing fleet counts.

    DGCA does not expose a stable machine-readable fleet table at this URL.  The
    source is therefore marked CONNECTED only when it is reachable; the UI can
    accurately distinguish an available source from published fleet records.
    """
    try:
        result = await _official_get(settings.DGCA_FLEET_URL)
        await _upsert_dataset_status(db, "dgca-fleet", "CONNECTED", record_count=0,
            failure_reason="Official source reachable; a machine-readable fleet table has not been published.")
        return {"status": "CONNECTED", "records": 0, "latency_ms": result["latency_ms"]}
    except Exception as e:
        reason = _safe_error(e)
        logger.error(f"DGCA fleet source check failed: {reason}")
        await _upsert_dataset_status(db, "dgca-fleet", "FAILED", failure_reason=reason)
        return {"status": "FAILED", "error": str(e)}


async def fetch_ppac_atf_source(db: AsyncSession) -> dict:
    """Import the official PPAC ATF export-duty table with provenance.

    PPAC publishes this historical table as an HTML rendering of its official
    publication. It is an ATF duty series, not a market quote, so the API
    exposes the measure explicitly and never uses it as an airfare value.
    """
    try:
        result = await _official_get(settings.PPAC_ATF_URL)
        soup = BeautifulSoup(result["contents"], "lxml")
        text = soup.get_text(" ", strip=True).lower()
        if "aviation turbine fuel" not in text and "atf" not in text:
            raise RuntimeError("PPAC response contained no ATF publication marker")
        saved = 0
        retrieved_at = datetime.now(timezone.utc)
        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
                # PPAC currently mixes zero-padded and non-padded dates and
                # uses both dots and hyphens across table revisions.
                if len(cells) < 8 or not re.match(r"^\d{1,2}[./-]\d{1,2}[./-]\d{4}$", cells[0]):
                    continue
                date_value = cells[0].replace("/", ".").replace("-", ".")
                atf_value = cells[7].replace(",", "").replace("₹", "").replace("Rs.", "").strip()
                if atf_value in {"", "-", "—"}:
                    continue
                try:
                    duty = float(atf_value)
                except ValueError:
                    continue
                existing = await db.scalar(select(PpacAtfRecord).where(PpacAtfRecord.effective_date == date_value))
                if existing:
                    existing.atf_export_duty_per_litre = duty
                    existing.source_url = settings.PPAC_ATF_URL
                    existing.retrieved_at = retrieved_at
                else:
                    db.add(PpacAtfRecord(
                        effective_date=date_value,
                        atf_export_duty_per_litre=duty,
                        source_url=settings.PPAC_ATF_URL,
                        retrieved_at=retrieved_at,
                    ))
                saved += 1
        await db.commit()
        if not saved:
            raise RuntimeError("PPAC page was reachable but no validated ATF duty rows were found")
        await _upsert_dataset_status(db, "ppac-atf", "HEALTHY", record_count=saved,
            failure_reason="Imported official ATF export-duty rows; this is not a retail fuel-price quote.")
        return {"status": "HEALTHY", "records": saved, "latency_ms": result["latency_ms"]}
    except Exception as e:
        reason = _safe_error(e)
        logger.error(f"PPAC ATF source check failed: {reason}")
        await _upsert_dataset_status(db, "ppac-atf", "FAILED", failure_reason=reason)
        return {"status": "FAILED", "error": str(e)}


async def fetch_datagov_aviation(db: AsyncSession) -> dict:
    """Import records from the configured official data.gov.in resource API."""
    resource_id = settings.DATAGOV_AVIATION_DATASET_ID.strip()
    api_key = settings.DATAGOV_API_KEY.strip()
    if not resource_id or not api_key:
        await _upsert_dataset_status(db, "data-gov-in", "NOT_CONFIGURED",
            failure_reason="Set DATAGOV_AVIATION_DATASET_ID and DATAGOV_API_KEY to enable the official resource API.")
        return {"status": "NOT_CONFIGURED", "records": 0}
    source_url = f"https://api.data.gov.in/resource/{resource_id}"
    try:
        result = await _official_get(source_url + "?" + urlencode({"api-key": api_key, "format": "json", "limit": 1000}))
        payload = json.loads(result["contents"])
        records = payload.get("records") if isinstance(payload, dict) else None
        if not isinstance(records, list):
            raise RuntimeError("data.gov.in response did not contain a records array")
        retrieved_at = datetime.now(timezone.utc)
        saved = 0
        for record in records:
            if not isinstance(record, dict):
                continue
            raw = json.dumps(record, sort_keys=True, separators=(",", ":"))
            record_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            existing = await db.scalar(select(DataGovAviationRecord).where(
                DataGovAviationRecord.resource_id == resource_id,
                DataGovAviationRecord.record_hash == record_hash,
            ))
            if not existing:
                db.add(DataGovAviationRecord(resource_id=resource_id, record_hash=record_hash,
                    record_json=raw, source_url=source_url, retrieved_at=retrieved_at))
                saved += 1
        await db.commit()
        await _upsert_dataset_status(db, "data-gov-in", "CONNECTED", record_count=len(records),
            reference_period=str(payload.get("title") or "Official resource API"))
        return {"status": "CONNECTED", "records": len(records), "new_records": saved, "latency_ms": result["latency_ms"]}
    except Exception as e:
        reason = _safe_error(e)
        if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429:
            reason = "data.gov.in rate limit reached; previously imported official records were retained."
            await _upsert_dataset_status(db, "data-gov-in", "STALE", failure_reason=reason)
            logger.warning(f"data.gov.in aviation fetch rate-limited: {reason}")
            return {"status": "STALE", "records": 0, "reason": reason}
        logger.error(f"data.gov.in aviation fetch failed: {reason}")
        await _upsert_dataset_status(db, "data-gov-in", "FAILED", failure_reason=reason)
        return {"status": "FAILED", "error": reason}


async def run_gov_fetches(db: AsyncSession):
    """Run all government data fetches. Called by scheduler and /government/refresh."""
    logger.info("Starting government data refresh")
    results = {}
    results["dgca_monthly"] = await fetch_dgca_monthly(db)
    results["mospi_cpi"] = await fetch_mospi_cpi(db)
    results["dgca_circulars"] = await fetch_dgca_circulars(db)
    results["dgca_fleet"] = await fetch_dgca_fleet_source(db)
    results["ppac_atf"] = await fetch_ppac_atf_source(db)
    results["data_gov_aviation"] = await fetch_datagov_aviation(db)
    logger.info(f"Government data refresh complete: {results}")
    return results
