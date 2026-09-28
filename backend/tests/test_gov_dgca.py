import pytest
from sqlalchemy import select

from app.models.government import DgcaCircular, DgcaMonthlyRecord, GovDataset
from app.services import gov_fetcher


DGCA_SHELL_HTML = """
<html>
  <head><title>Directorate General of Civil Aviation</title></head>
  <body>
    <nav>About Us Regulations Services</nav>
    <main>Welcome to DGCA eGCA portal.</main>
  </body>
</html>
"""


DGCA_MONTHLY_HTML = """
<html>
  <body>
    <table>
      <tr>
        <th>Month</th>
        <th>Year</th>
        <th>Passengers Carried (in number)</th>
      </tr>
      <tr>
        <td>Apr</td>
        <td>2026</td>
        <td>1,23,45,678</td>
      </tr>
      <tr>
        <td>May</td>
        <td>2026</td>
        <td>13,456,789</td>
      </tr>
    </table>
  </body>
</html>
"""


DGCA_CIRCULAR_HTML = """
<html>
  <body>
    <a href="/digigov-portal/?page=jsp/dgca/circulars/sample.pdf">
      Office Circular 12/2026 dated 27 September 2026
    </a>
    <a href="https://example.com/not-dgca.pdf">
      Office Circular 13/2026 dated 27 September 2026
    </a>
    <a href="/digigov-portal/?page=jsp/dgca/circulars/undated.pdf">
      Office Circular without a publication date
    </a>
  </body>
</html>
"""


def test_parse_dgca_monthly_rows_rejects_generic_portal_shell():
    assert gov_fetcher._parse_dgca_monthly_rows(DGCA_SHELL_HTML) == []


def test_parse_dgca_monthly_rows_accepts_verified_passenger_table():
    rows = gov_fetcher._parse_dgca_monthly_rows(DGCA_MONTHLY_HTML)

    assert rows == [
        {"month": 4, "year": 2026, "domestic_passengers": 12345678},
        {"month": 5, "year": 2026, "domestic_passengers": 13456789},
    ]


def test_parse_dgca_circular_links_requires_dgca_host_and_date():
    links = gov_fetcher._parse_dgca_circular_links(
        DGCA_CIRCULAR_HTML,
        "https://www.dgca.gov.in/digigov-portal/?page=newsdetail/officecircular/officecircular.html",
    )

    assert links == [
        {
            "title": "Office Circular 12/2026 dated 27 September 2026",
            "date": "2026-09-27",
            "category": "CIRCULAR",
            "url": "https://www.dgca.gov.in/digigov-portal/?page=jsp/dgca/circulars/sample.pdf",
        }
    ]


@pytest.mark.asyncio
async def test_fetch_dgca_monthly_marks_shell_response_stale(db, monkeypatch):
    async def fake_get(url):
        return {"contents": DGCA_SHELL_HTML, "status_code": 200, "latency_ms": 7}

    monkeypatch.setattr(gov_fetcher, "_official_get", fake_get)

    result = await gov_fetcher.fetch_dgca_monthly(db)
    dataset = await db.get(GovDataset, "dgca-pax")
    count = await db.scalar(select(DgcaMonthlyRecord))

    assert result == {"status": "STALE", "records": 0}
    assert dataset.status == "STALE"
    assert "verified monthly passenger table" in dataset.failure_reason
    assert count is None


@pytest.mark.asyncio
async def test_fetch_dgca_monthly_stores_verified_rows(db, monkeypatch):
    async def fake_get(url):
        return {"contents": DGCA_MONTHLY_HTML, "status_code": 200, "latency_ms": 7}

    monkeypatch.setattr(gov_fetcher, "_official_get", fake_get)

    result = await gov_fetcher.fetch_dgca_monthly(db)
    stored = (await db.execute(select(DgcaMonthlyRecord))).scalars().all()
    dataset = await db.get(GovDataset, "dgca-pax")

    assert result == {"status": "CONNECTED", "records": 2, "new_records": 2}
    assert [(row.month, row.year, row.domestic_passengers) for row in stored] == [
        (4, 2026, 12345678),
        (5, 2026, 13456789),
    ]
    assert dataset.status == "CONNECTED"
    assert dataset.record_count == 2
    assert dataset.reference_period == "2026-05"


@pytest.mark.asyncio
async def test_fetch_dgca_circulars_stores_only_verified_dated_dgca_links(db, monkeypatch):
    async def fake_get(url):
        return {"contents": DGCA_CIRCULAR_HTML, "status_code": 200, "latency_ms": 7}

    monkeypatch.setattr(gov_fetcher, "_official_get", fake_get)

    result = await gov_fetcher.fetch_dgca_circulars(db)
    stored = (await db.execute(select(DgcaCircular))).scalars().all()
    dataset = await db.get(GovDataset, "dgca-circulars")

    assert result == {"status": "CONNECTED", "records": 1, "new_records": 1}
    assert len(stored) == 1
    assert stored[0].date == "2026-09-27"
    assert stored[0].url.startswith(("https://www.dgca.gov.in/", "https://dgca.gov.in/"))
    assert dataset.status == "CONNECTED"
    assert dataset.record_count == 1
