# MoSPI CPI — Transport benchmark (`mospi_cpi_transport.csv`)

Monthly values of the **MoSPI Consumer Price Index, Division 07 "Transport",
All-India Combined, base 2024=100** — the benchmark the backtest
(`backend/app/analytics/backtest.py`, `GET /api/index/backtest`, default
`benchmark=mospi-cpi`) compares the AeroPrice monthly Jevons index against.

## Why this benchmark, and why not DGCA fares

SIH26056 asks for a backtest against "publicly available DGCA monthly
average-fare data". Verified 22 Nov 2026: **DGCA does not publish monthly
average fares anywhere public** — the monthly traffic reports carry no fare
table, the Tariff Monitoring Unit's 72-route fare monitoring is internal
only, and data.gov.in holds no fare dataset (full findings:
`~/workspace/goals/aeroprice-sih-audit-and-fix/hidden_files/dgca-fare-data-findings.md`).
The DGCA benchmark path is retained in the code (`benchmark=dgca`) and
honestly reports `NO_DGCA_DATA`; it must never be fed invented fares.

The MoSPI CPI Transport division is the honest substitute: a real, public,
monthly official series that measures transport-price movement in India.
It is an **index, not a fare** — the backtest compares month-over-month
percentage changes of the two index series, never rupee levels — and it is
labelled as MoSPI CPI everywhere, never as DGCA data.

## Why "Transport", not "Transport and communication"

MoSPI rebased the CPI from 2012=100 to **2024=100 on 12 Feb 2026** and moved
from 6 groups to 12 COICOP divisions. The old "Transport and communication"
group no longer exists: it split into Division 07 "Transport" and Division
08 "Information and communication". This file uses the current Division 07
"Transport" series. Do not mix in 2012-base "Transport and communication"
values — the bases and baskets differ.

## Coverage

10 months: **Jan 2026 – Oct 2026** (the latest release at the time of
writing; the November 2026 release is due 14 Dec 2026). Each value was read
from that month's MoSPI press release, Annexure I, "07 Transport" row,
Combined column. The new base-2024 series publishes division values only
from Jan 2026; the 2025 back-series exists on MoSPI's eSankhyiki portal
only and was not fetched. Ten months far exceeds the 30-day backtest
requirement, and the backtest reports its actual coverage window.

## Cross-checks performed (22 Nov 2026)

- Oct 2026 = 106.31 with YoY +5.84% implies Oct 2025 ≈ 100.44 — matches
  Trading Economics' "record low of 100.44 points in October of 2025"
  (sourced from MoSPI).
- May 102.73 → Jun 105.45 is +2.65% MoM — matches the Indian Express
  report that "the index for the transport category rising 2.6%
  month-on-month" in June 2026 after the May fuel price hikes.
- Sep 2026 = 106.12 confirmed independently by Trading Economics
  ("CPI Transport ... 106.31 in October ... from 106.12 in September").

## Extending the file

When MoSPI releases a new month (around the 12th of the following month),
append one row from that release's Annexure I "07 Transport" Combined
value, with the release's PIB/MoSPI URL in `source_url`. The test
`test_shipped_mospi_csv_has_verified_months` pins the rows in this file —
update it when appending.
