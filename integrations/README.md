# External aviation integrations

The three requested projects were audited at these pinned revisions:

| Project | Revision | Adopted capability |
| --- | --- | --- |
| `affromero/flight-finder` | `76e5a5c59d49f4040b8cf7e818ea5426ea0f43f4` | Server-side provider fallback and source status |
| `YUVRAJ1178/farecast-airfare-intelligence` | `c3f22122d76650abd8f8b7114d96c11459668d09` | Historical provenance and India fare analytics |
| `bilawalsidhu/gods-eye-view` | `0d41b6be5490db1f10a171f238be75db4d4ec3b4` | Live ADS-B telemetry and map model |

These are separate full applications with incompatible runtimes (Next.js/Prisma,
FastAPI/React, and Cesium/Vite). They are integrated at the service boundary
instead of copied into the production bundle. Run `install-sources.ps1` to get
pinned source checkouts locally for development and license review.

Active integrations:

- `GET /api/aviation/live` returns keyless ADS-B positions from ADSB.lol.
- The aviation map/list uses the local backend, with AviationStack as a configured fallback.
- Kaggle 2019 Excel data is retained and clearly labelled historical, never live.
- DGCA/MoSPI data is fetched and cached by FastAPI with explicit source status.

Additional pinned source checkouts include OpenSky/ADS-B analysis examples,
Aviation Edge's keyed flight-tracker contract, local SDR tracking, and two
India airfare-index implementations. Their patterns are used as references;
credentials, browser bypasses, and incompatible standalone UIs are not copied
into AeroPrice.
