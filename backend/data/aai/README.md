# AAI domestic passenger traffic (`aai_domestic_passengers_2026-09.csv`)

Per-airport **domestic passenger counts for September 2026** from the Airports
Authority of India (AAI) monthly Traffic News, Annexure-III B — the data the
index route weights are derived from
(`backend/app/config/weights.py`, gravity model). No API key or registration
is needed: AAI publishes these reports openly on aai.aero.

## Source

- **Publisher:** Airports Authority of India (AAI), Traffic News, September 2026.
- **Document:** Annexure-III, "Passengers" — Annexure-III B (Domestic
  Passengers), "For The Month / September 2026" column.
- **File URL:** https://www.aai.aero/sites/default/files/traffic-news/Sep2k26Annex_3.pdf
- **Landing page:** https://www.aai.aero/en/business-opportunities/aai-traffic-news
- **Retrieved:** 22 Nov 2026. September 2026 was the latest month published
  on the Traffic News page at retrieval time.
- **Coverage:** the 12 airports appearing in the 19-route basket
  (DEL, BOM, BLR, HYD, CCU, MAA, GAU, LKO, JAI, PAT, SXR, IMF).
  AAI counts arriving + departing passengers; figures are as reported by the
  respective airports and subject to revision (AAI's own note).

## Why AAI airport traffic, and why not DGCA route traffic

SIH26056 asks for the basket to be weighted on DGCA passenger-traffic data.
Verified 22 Nov 2026: **DGCA does not publish route-level (city-pair)
traffic in any machine-readable public form** — the DGCA monthly reports
carry airline-level totals only, and the Tariff Monitoring Unit's route
monitoring is internal. So true DGCA route weights remain unavailable and
`DGCA_WEIGHTS_STATUS` stays `UNAVAILABLE`.

The honest substitute: AAI publishes **per-airport** domestic passenger
totals monthly. Route weights are derived from them with a gravity model
(see `backend/app/config/weights.py` for the exact formula). A gravity
weight is a modelled proxy for route traffic — it is **not** measured
route traffic, and it is labelled as such everywhere (API metadata, Airfare
Index page, pitch deck). It must never be presented as DGCA data.

## Columns

- `domestic_pax_sep_2026` — domestic passengers at that airport in
  September 2026. **This is the column the weights are computed from.**
- `domestic_pax_apr_sep_2026` — the same airport's April–September 2026-27
  period total, recorded for context and stability checks. Not used by the
  weight computation.

## Cross-checks performed (22 Nov 2026)

- Category totals in Annexure-III B sum exactly to the printed domestic
  grand total: 23,995,887 for September 2026.
- Domestic (23,995,887) + international (6,103,919, Annexure-III A) =
  30,099,806, the printed total-passenger grand total (Annexure-III C) —
  and the figure reported by The New Indian Express / PTI for September 2026.
- April–September 2026-27 domestic total 159,544,222 matches the press
  reports of AAI's half-yearly release.
- Delhi April–September domestic 28,126,333 (+6.2%) and Mumbai −9.5%,
  Hyderabad −12.8%, Chennai −11.8% all match the reported half-year figures.

## Extending the file

When AAI publishes a new month, replace this file with that month's
Annexure-III B "For The Month" figures (same columns, new filename), update
`AAI_TRAFFIC_PERIOD` / `AAI_TRAFFIC_SOURCE` / `WEIGHTS_VERSION` in
`backend/app/config/weights.py`, and update the pinned values in
`backend/tests/test_weights.py`. Do not mix months inside one file.
