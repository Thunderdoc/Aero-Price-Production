from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.auth import require_analyst
from app.models.government import DgcaMonthlyRecord, MospiTransportSeries, DgcaCircular, GovDataset
from app.services.gov_fetcher import run_gov_fetches

router = APIRouter(prefix="/government", tags=["government"])


@router.get("/datasets")
async def list_datasets(
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(select(GovDataset))
    datasets = rows.scalars().all()
    return {
        "datasets": [
            {
                "id": d.dataset_id,
                "source": d.source_name,
                "organization": d.organization,
                "access_type": d.access_type,
                "api_key_required": d.api_key_required,
                "format": d.format,
                "status": d.status,
                "source_url": d.source_url,
                "last_retrieved": d.last_retrieved.isoformat() if d.last_retrieved else None,
                "last_attempt": d.last_attempt.isoformat() if d.last_attempt else None,
                "record_count": d.record_count,
                "reference_period": d.reference_period,
            }
            for d in datasets
        ]
    }


@router.get("/dgca/monthly")
async def dgca_monthly(
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(DgcaMonthlyRecord).order_by(
            DgcaMonthlyRecord.year.desc(),
            DgcaMonthlyRecord.month.desc()
        ).limit(24)
    )
    records = rows.scalars().all()
    return {
        "count": len(records),
        "source": "OFFICIAL",
        "data_origin": "OFFICIAL" if records else "NO_DATA",
        "records": [
            {
                "month": r.month,
                "year": r.year,
                "period": f"{r.year}-{r.month:02d}",
                "domestic_passengers": r.domestic_passengers,
                "source": r.source,
                "retrieved_at": r.retrieved_at.isoformat(),
            }
            for r in records
        ],
    }


@router.get("/mospi/cpi")
async def mospi_cpi(
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(select(MospiTransportSeries).order_by(
        MospiTransportSeries.base_year, MospiTransportSeries.period
    ))
    all_records = rows.scalars().all()
    base_year = 2024 if any(r.base_year == 2024 for r in all_records) else 2012
    records = all_records
    return {
        "count": len(records),
        "source": "OFFICIAL",
        "data_origin": "OFFICIAL" if records else "NO_DATA",
        "base_year": base_year if records else None,
        "available_base_years": sorted({r.base_year for r in all_records}),
        "series_coverage": [
            {"base_year": base, "first_period": min(r.period for r in all_records if r.base_year == base),
             "last_period": max(r.period for r in all_records if r.base_year == base),
             "months": sum(1 for r in all_records if r.base_year == base)}
            for base in sorted({r.base_year for r in all_records})
        ],
        "records": [
            {
                "period": r.period,
                "cpi_transport": r.value,
                "cpi_general": None,
                "base_year": r.base_year,
                "definition": r.definition,
                "series": r.series,
                "source_url": r.source_url,
                "source": "OFFICIAL",
                "retrieved_at": r.retrieved_at.isoformat(),
            }
            for r in records
        ],
    }


@router.get("/dgca/circulars")
async def dgca_circulars(
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(DgcaCircular).order_by(DgcaCircular.date.desc()).limit(20)
    )
    circulars = rows.scalars().all()
    return {
        "count": len(circulars),
        "data_origin": "OFFICIAL" if circulars else "NO_DATA",
        "circulars": [
            {
                "id": c.id,
                "title": c.title,
                "date": c.date,
                "category": c.category,
                "url": c.url,
            }
            for c in circulars
        ],
    }


@router.post("/refresh")
async def refresh_gov_data(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_analyst),
):
    """Refresh verified public-source data using this request's live DB session."""
    results = await run_gov_fetches(db)
    return {"status": "REFRESH_COMPLETE", "results": results}
