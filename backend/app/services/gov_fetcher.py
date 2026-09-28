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
from urllib.parse import urlencode, urljoin, urlparse
import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
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


DGCA_HOSTS = {"dgca.gov.in", "www.dgca.gov.in"}
MONTH_NAMES = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def _normalise_int(value: str) -> int | None:
    digits = re.sub(r"[^\d]", "", value or "")
    return int(digits) if digits else None


def _parse_month(value: str) -> int | None:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value or "").lower()
    if cleaned.isdigit():
        month = int(cleaned)
        return month if 1 <= month <= 12 else None
    return MONTH_NAMES.get(cleaned[:3]) or MONTH_NAMES.get(cleaned)


def _looks_like_dgca_shell(soup: BeautifulSoup) -> bool:
    """Detect the generic DGCA portal shell, which is not a data document."""
    text = soup.get_text(" ", strip=True).lower()
    return "monthly passenger" not in text and "passengers carried" not in text and len(soup.find_all("table")) == 0


def _parse_dgca_monthly_rows(html: str) -> list[dict]:
    """Parse only tables that actually expose passenger/statistics columns."""
    soup = BeautifulSoup(html, "lxml")
    if _looks_like_dgca_shell(soup):
        return []

    parsed: list[dict] = []
    seen: set[tuple[int, int]] = set()
    for table in soup.find_all("table"):
        table_text = table.get_text(" ", strip=True).lower()
        if "passenger" not in table_text or "month" not in table_text:
            continue
        rows = table.find_all("tr")
        header_cells: list[str] = []
        header_index = -1
        for idx, row in enumerate(rows[:8]):
            cells = [c.get_text(" ", strip=True).lower() for c in row.find_all(["td", "th"])]
            if any("month" in cell for cell in cells) and any("passenger" in cell for cell in cells):
                header_cells = cells
                header_index = idx
                break
        if not header_cells:
            continue
        month_idx = next((i for i, cell in enumerate(header_cells) if "month" in cell), None)
        passenger_idx = next((i for i, cell in enumerate(header_cells) if "passenger" in cell), None)
        year_idx = next((i for i, cell in enumerate(header_cells) if re.search(r"\byear\b|\bfy\b", cell)), None)
        if month_idx is None or passenger_idx is None:
            continue

        for row in rows[header_index + 1:]:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            if len(cells) <= max(month_idx, passenger_idx):
                continue
            month = _parse_month(cells[month_idx])
            passenger_count = _normalise_int(cells[passenger_idx])
            row_text = " ".join(cells)
            year = _normalise_int(cells[year_idx]) if year_idx is not None and year_idx < len(cells) else None
            if year is not None and year > 9999:
                year = None
            if year is None:
                years = [int(y) for y in re.findall(r"\b(20\d{2})\b", row_text)]
                year = years[0] if years else None
            if not month or not year or not passenger_count:
                continue
            key = (month, year)
            if key in seen:
                continue
            seen.add(key)
            parsed.append({"month": month, "year": year, "domestic_passengers": passenger_count})
    return parsed


def _official_dgca_url(href: str, base_url: str) -> str | None:
    if not href or href.startswith(("javascript:", "#", "mailto:")):
        return None
    url = urljoin(base_url, href)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in DGCA_HOSTS:
        return None
    return url


def _extract_iso_date(text: str) -> str | None:
    match = re.search(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b", text or "")
    if match:
        day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
        try:
            return datetime(year, month, day).strftime("%Y-%m-%d")
        except ValueError:
            return None
    match = re.search(
        r"\b(\d{1,2})\s+"
        r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
        r"Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
        r"\s+(20\d{2})\b",
        text or "",
        re.IGNORECASE,
    )
    if match:
        month = _parse_month(match.group(2))
        if month:
            try:
                return datetime(int(match.group(3)), month, int(match.group(1))).strftime("%Y-%m-%d")
            except ValueError:
                return None
    return None


def _parse_dgca_circular_links(html: str, base_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    page_text = soup.get_text(" ", strip=True).lower()
    if not any(kw in page_text for kw in ["circular", "order", "advisory", "press release"]):
        return []

    parsed: list[dict] = []
    seen: set[str] = set()
    for link in soup.find_all("a", href=True):
        text = link.get_text(" ", strip=True)
        if len(text) < 10:
            continue
        lowered = text.lower()
        if not any(kw in lowered for kw in ["circular", "order", "advisory", "press release"]):
            continue
        url = _official_dgca_url(link["href"], base_url)
        date_value = _extract_iso_date(text)
        if not url or not date_value:
            continue
        if url in seen:
            continue
        seen.add(url)
        category = "PRESS_RELEASE" if "press" in lowered else "CIRCULAR"
        parsed.append({"title": text[:500], "date": date_value, "category": category, "url": url})
    return parsed

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
        rows = _parse_dgca_monthly_rows(result["contents"])

        records_saved = 0
        for row in rows:
            existing = await db.scalar(
                select(DgcaMonthlyRecord).where(
                    DgcaMonthlyRecord.month == row["month"],
                    DgcaMonthlyRecord.year == row["year"],
                )
            )
            if not existing:
                db.add(DgcaMonthlyRecord(
                    month=row["month"],
                    year=row["year"],
                    domestic_passengers=row["domestic_passengers"],
                    source="OFFICIAL",
                ))
                records_saved += 1

        await db.commit()

        if not rows:
            logger.warning("DGCA: HTML fetched but no verified monthly passenger table was parsed.")
            await _upsert_dataset_status(db, "dgca-pax", "STALE",
                failure_reason="Official DGCA response did not expose a verified monthly passenger table.")
            return {"status": "STALE", "records": 0}

        total = int(await db.scalar(select(func.count()).select_from(DgcaMonthlyRecord)) or 0)
        latest = max(rows, key=lambda item: (item["year"], item["month"]))
        await _upsert_dataset_status(db, "dgca-pax", "CONNECTED", record_count=total,
            reference_period=f"{latest['year']}-{latest['month']:02d}")
        return {"status": "CONNECTED", "records": total, "new_records": records_saved}

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
        circulars = _parse_dgca_circular_links(result["contents"], settings.DGCA_CIRCULARS_URL)

        saved = 0
        for circular in circulars:
            existing = await db.scalar(
                select(DgcaCircular).where(DgcaCircular.url == circular["url"])
            )
            if not existing:
                db.add(DgcaCircular(**circular))
                saved += 1

        await db.commit()
        if not circulars:
            await _upsert_dataset_status(db, "dgca-circulars", "STALE",
                failure_reason="Official DGCA response did not expose dated circular document links.")
            return {"status": "STALE", "records": 0}

        total = int(await db.scalar(select(func.count()).select_from(DgcaCircular)) or 0)
        await _upsert_dataset_status(db, "dgca-circulars", "CONNECTED", record_count=total)
        return {"status": "CONNECTED", "records": total, "new_records": saved}

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
        # Keep the scheduled request bounded.  data.gov.in can return 500/429
        # for large pages even when the resource and credentials are valid.
        result = await _official_get(source_url + "?" + urlencode({"api-key": api_key, "format": "json", "limit": 100}))
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
        retained = int(await db.scalar(select(func.count()).select_from(DataGovAviationRecord).where(
            DataGovAviationRecord.resource_id == resource_id
        )) or 0)
        if retained:
            if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429:
                reason = "data.gov.in rate limit reached; previously imported official records were retained."
            elif isinstance(e, httpx.HTTPStatusError) and e.response.status_code >= 500:
                reason = f"data.gov.in returned HTTP {e.response.status_code}; previously imported official records were retained."
            else:
                reason = f"data.gov.in refresh unavailable ({reason}); previously imported official records were retained."
            await _upsert_dataset_status(db, "data-gov-in", "STALE", record_count=retained, failure_reason=reason)
            logger.warning(f"data.gov.in aviation refresh stale: {reason}")
            return {"status": "STALE", "records": retained, "reason": reason}
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
