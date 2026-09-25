# AeroPrice fare-provider scorecard

Research and local verification performed 2026-09-25. No provider is treated as live merely because code exists; the result below reflects an actual request or a documented access requirement.

| Provider / project | Open source | Free / key | Indian fares | Server fit | Result |
|---|---|---|---|---|---|
| [fli](https://github.com/punitarani/fli) | Open source | Free, no key | Potentially | Reverse-engineered Google endpoint; provider changes possible | RESEARCH LEAD only — no adapter exists in this repository and no route result has been verified here |
| [fast-flights](https://github.com/AWeirdDev/flights) | MIT | Free, no key | Potentially | Python package; Google public-interface scraping and maintenance risk | RESEARCH LEAD only — package is not installed or wired into the backend; no route result has been verified here |
| [Flight Finder](https://github.com/affromero/flight-finder) | Open source | Self-hosted; may require an LLM | Potentially | Browser/LLM-dependent | NOT ENABLED — extra dependency and no verified result in this deployment |
| [swoop](https://github.com/saraswatayu/swoop) | Open source | Free, no key | Potentially | Google search dependency | NOT ENABLED — no end-to-end result verified here |
| [googleflights-mcp](https://github.com/altunoren/googleflights-mcp) | MIT | Free, no key | Potentially | Local Python process; not a hosted API; consent/layout and rate-limit risk | RESEARCH LEAD — documented structured output and direct Python entry point, but no Indian-route result has been verified here |
| [googleflights-scraper](https://github.com/Hilsdalle/googleflights-scraper) | Open source | Self-hosted | Potentially | Browser automation / maintenance risk | NOT ENABLED — no end-to-end result verified here |
| [flight-tracker](https://github.com/sandeep-patel/flight-tracker) | Open source | Varies | Primarily tracking | Not a fare source | UNUSABLE for airfare observations |
| ADSB.lol / OpenSky / AvioADSB | Public/community | No key or anonymous tier | No | Server compatible | WORKING for aircraft positions only; never used as fare data |
| Amadeus / Duffel / SerpApi | Proprietary authorized APIs | Credentials required | Yes | Server compatible | Optional only; not required by the no-key path |
| **fast-flights (integrated)** | MIT | Free, no key | **Verified for 10/10 tested directions** | Python worker; public-interface/rate-limit risk | **LIVE local result** — real structured fares persisted for all ten DEL/BOM/BLR/MAA/HYD directions; one MAA→BLR date initially hit an upstream `list index out of range` error, while a later date succeeded and was persisted |

## Repository reality

The active collector (`backend/app/services/collector.py`) now includes an
explicitly disabled-by-default `GoogleFlightsWorkerAdapter` boundary. It does
not install or scrape Google by itself: a separately managed worker must be
configured with `GOOGLEFLIGHTS_WORKER_COMMAND` and return the documented JSON
contract. The `fast-flights`, `fli`, and `googleflights-mcp` projects remain
research candidates rather than bundled dependencies. Amadeus and Duffel are also
credentialed paths; Amadeus sandbox responses are explicitly synthetic and
must not be treated as live market fares.

The public-interface collector is enabled only through the explicit
`fast-flights` adapter; the separate worker boundary remains disabled by
default. If no provider is configured or a provider fails, the platform reports
fare data as unavailable rather than fabricating observations.

## Verified evidence

No fare-provider result is claimed here without a current production health
record and provenance-backed observation. Web research is discovery evidence,
not proof that a provider works for Indian routes in this deployment.

## Local route evidence

The constrained route sweep used `fast-flights`, economy, one-way, INR, and
future travel dates. REAL rows were persisted for all ten directions:
DEL-BOM, BOM-DEL, DEL-BLR, BLR-DEL, DEL-MAA, MAA-DEL, HYD-DEL, DEL-HYD,
BLR-MAA, and MAA-BLR. The MAA-BLR request for 2026-10-02 raised the upstream
`list index out of range` parser error; a retry for 2026-10-16 returned 11
offers and 5 validated rows were persisted. The collector records failures
instead of treating them as empty successes.

The database also contains legacy rows from `serpapi-google-flights` and
`google-flights` whose provenance predates this recovery work. Some are
foreign-airline observations on domestic-looking routes, so those rows should
be audited before production analytics; the new route proof is from the
`fast-flights` source and is queryable by `source` and `data_origin`.
