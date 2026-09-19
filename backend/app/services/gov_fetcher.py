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
import logging
from datetime import datetime, timezone
import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.government import (
    GovDataset, DgcaMonthlyRecord, MospiCpiRecord, DgcaCircular
)

logger = logging.getLogger(__name__)

ALLORIGINS = settings.ALLORIGINS_BASE
TIMEOUT = 30.0
MAX_RETRIES = 3
BACKOFF_BASE_S = 2.0  # wait 2s, 4s, 8s between retries

GOV_DATASET_REGISTRY = [
    {
        "dataset_id": "dgca-pax",
        "source_name": "DGCA Monthly Passenger Statistics",
        "organization": "Directorate General of Civil Aviation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": "https://dgca.gov.in/digigov-portal/",
    },
    {
        "dataset_id": "dgca-circulars",
        "source_name": "DGCA Circulars & Press Releases",
        "organization": "Directorate General of Civil Aviation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": "https://dgca.gov.in/digigov-portal/",
    },
    {
        "dataset_id": "mospi-esankhyiki",
        "source_name": "MoSPI eSankhyiki CPI Transport",
        "organization": "Ministry of Statistics and Programme Implementation",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "HTML",
        "source_url": "https://mospi.gov.in/",
    },
    {
        "dataset_id": "data-gov-in",
        "source_name": "data.gov.in Aviation Dataset",
        "organization": "National Data & Analytics Platform",
        "access_type": "PUBLIC",
        "api_key_required": "NO",
        "format": "JSON",
        "source_url": "https://data.gov.in/",
    },
]


async def _allorigins_get(url: str) -> dict:
    """
    Fetch URL via AllOrigins proxy with exponential backoff retry.

    Returns {contents, status_code, latency_ms}.
    Raises the last exception after MAX_RETRIES attempts.
    """
    proxy_url = f"{ALLORIGINS}{url}"
    last_exc: Exception = RuntimeError("No attempts made")
    start = time.time()

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(proxy_url)
                resp.raise_for_status()
                data = resp.json()
                return {
                    "contents": data.get("contents", ""),
                    "status_code": data.get("status", {}).get("http_code", 200),
                    "latency_ms": int((time.time() - start) * 1000),
                }
        except httpx.HTTPStatusError as e:
            last_exc = e
            # 4xx = not retryable (content not found, bad URL)
            if 400 <= e.response.status_code < 500:
                logger.warning(f"AllOrigins {url}: HTTP {e.response.status_code} — not retrying")
                raise
            logger.warning(f"AllOrigins {url}: attempt {attempt}/{MAX_RETRIES} → HTTP {e.response.status_code}")
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as e:
            last_exc = e
            logger.warning(f"AllOrigins {url}: attempt {attempt}/{MAX_RETRIES} → {type(e).__name__}")

        if attempt < MAX_RETRIES:
            wait = BACKOFF_BASE_S * (2 ** (attempt - 1))
            logger.debug(f"AllOrigins retry in {wait:.1f}s")
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
        result = await _allorigins_get(settings.DGCA_STATS_URL)
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
            # AllOrigins returned HTML but no parseable table — common for DGCA portal
            logger.warning("DGCA: HTML fetched but no table rows parsed. Portal may have changed structure.")
            await _upsert_dataset_status(db, "dgca-pax", "STALE",
                failure_reason="HTML fetched but no parseable table rows found.")
            return {"status": "STALE", "records": 0}

        await _upsert_dataset_status(db, "dgca-pax", "CONNECTED", record_count=records_saved)
        return {"status": "CONNECTED", "records": records_saved}

    except Exception as e:
        logger.error(f"DGCA monthly fetch failed: {e}")
        await _upsert_dataset_status(db, "dgca-pax", "FAILED", failure_reason=str(e)[:500])
        return {"status": "FAILED", "error": str(e)}


async def fetch_mospi_cpi(db: AsyncSession) -> dict:
    """
    Fetch MoSPI CPI-Transport sub-index.
    MoSPI portal is an Angular SPA — AllOrigins returns skeleton HTML without data.
    Falls back to STALE status with an honest note.
    """
    try:
        result = await _allorigins_get("https://mospi.gov.in/")
        html = result["contents"]

        if len(html) < 500:
            await _upsert_dataset_status(
                db, "mospi-esankhyiki", "STALE",
                failure_reason="MoSPI portal is a JS SPA — AllOrigins returns skeleton only. "
                "Direct API integration or manual download required.",
            )
            return {"status": "STALE", "records": 0, "note": "JS SPA — direct fetch not available"}

        soup = BeautifulSoup(html, "lxml")
        records_saved = 0
        # Parse tables if present in static fallback
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            for row in rows[1:]:
                cells = row.find_all(["td"])
                if len(cells) < 2:
                    continue
                try:
                    period = cells[0].get_text(strip=True)
                    cpi = float(cells[1].get_text(strip=True).replace(",", ""))
                    existing = await db.scalar(
                        select(MospiCpiRecord).where(MospiCpiRecord.period == period)
                    )
                    if not existing:
                        db.add(MospiCpiRecord(period=period, cpi_transport=cpi, source="OFFICIAL"))
                        records_saved += 1
                except (ValueError, IndexError):
                    continue
        await db.commit()

        if records_saved > 0:
            await _upsert_dataset_status(db, "mospi-esankhyiki", "CONNECTED", record_count=records_saved)
            return {"status": "CONNECTED", "records": records_saved}
        else:
            await _upsert_dataset_status(
                db, "mospi-esankhyiki", "STALE",
                failure_reason="No parseable CPI data in response. JS SPA requires direct API.",
            )
            return {"status": "STALE", "records": 0}

    except Exception as e:
        logger.error(f"MoSPI fetch failed: {e}")
        await _upsert_dataset_status(db, "mospi-esankhyiki", "FAILED", failure_reason=str(e)[:500])
        return {"status": "FAILED", "error": str(e)}


async def fetch_dgca_circulars(db: AsyncSession) -> dict:
    try:
        result = await _allorigins_get(settings.DGCA_STATS_URL)
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
        logger.error(f"DGCA circulars fetch failed: {e}")
        await _upsert_dataset_status(db, "dgca-circulars", "FAILED", failure_reason=str(e)[:500])
        return {"status": "FAILED", "error": str(e)}


async def run_gov_fetches(db: AsyncSession):
    """Run all government data fetches. Called by scheduler and /government/refresh."""
    logger.info("Starting government data refresh")
    results = {}
    results["dgca_monthly"] = await fetch_dgca_monthly(db)
    results["mospi_cpi"] = await fetch_mospi_cpi(db)
    results["dgca_circulars"] = await fetch_dgca_circulars(db)
    logger.info(f"Government data refresh complete: {results}")
    return results
