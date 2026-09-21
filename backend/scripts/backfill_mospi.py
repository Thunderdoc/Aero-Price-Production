"""Backfill official MoSPI transport CPI rows into the local database.

Run from backend/: .venv/Scripts/python.exe scripts/backfill_mospi.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import AsyncSessionLocal, create_all_tables
from app.services.gov_fetcher import ensure_gov_dataset_registry, fetch_mospi_cpi


async def main() -> None:
    await create_all_tables()
    async with AsyncSessionLocal() as db:
        await ensure_gov_dataset_registry(db)
        result = await fetch_mospi_cpi(db)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
