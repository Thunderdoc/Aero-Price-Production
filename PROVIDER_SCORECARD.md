# AeroPrice fare-provider scorecard

Research and local verification performed 2026-09-25; wiring status updated 2026-11-21. No provider is treated as live merely because code exists; the result below reflects an actual request or a documented access requirement.

| Provider / project | Open source | Free / key | Indian fares | Server fit | Result |
|---|---|---|---|---|---|
| [fli](https://github.com/punitarani/fli) | Open source | Free, no key | Potentially | Reverse-engineered Google endpoint; provider changes possible | RESEARCH LEAD only — no adapter exists in this repository and no route result has been verified here |
| [fast-flights](https://github.com/AWeirdDev/flights) | MIT | Free, no key | **Verified for 10/10 tested directions** | Python package; Google public-interface scraping and maintenance risk | **WIRED + LIVE local result** — `fast-flights==3.0` is installed and wired into the collector (`backend/app/services/collector.py`, `_make_adapters()`); real structured fares persisted for all ten DEL/BOM/BLR/MAA/HYD directions (25 Sep 2026). Fares are labelled `PUBLIC_INTERFACE`, never `REAL` |
| [Flight Finder](https://github.com/affromero/flight-finder) | Open source | Self-hosted; may require an LLM | Potentially | Browser/LLM-dependent | NOT ENABLED — extra dependency and no verified result in this deployment |
| [swoop](https://github.com/saraswatayu/swoop) | Open source | Free, no key | Potentially | Google search dependency | NOT ENABLED — no end-to-end result verified here |
| [googleflights-mcp](https://github.com/altunoren/googleflights-mcp) | MIT | Free, no key | Potentially | Local Python process; not a hosted API; consent/layout and rate-limit risk | RESEARCH LEAD — documented structured output and direct Python entry point, but no Indian-route result has been verified here |
| [googleflights-scraper](https://github.com/Hilsdalle/googleflights-scraper) | Open source | Self-hosted | Potentially | Browser automation / maintenance risk | NOT ENABLED — no end-to-end result verified here |
| [flight-tracker](https://github.com/sandeep-patel/flight-tracker) | Open source | Varies | Primarily tracking | Not a fare source | UNUSABLE for airfare observations |
| ADSB.lol / OpenSky / AvioADSB | Public/community | No key or anonymous tier | No | Server compatible | WORKING for aircraft positions only; never used as fare data |
| Amadeus Self-Service | Proprietary authorized API | Free test env (key + secret) | Partial — test env returns synthetic fares; production excludes low-cost carriers | Server compatible | **WIRED** (`_make_adapters()`, 21 Nov 2026) — pipeline validation only. Test-env responses are tagged `SANDBOX_TEST` and excluded from the index and all live analytics |
| Duffel Air | Proprietary authorized API | Free test mode (token) | Test mode returns fake "Duffel Airways" fares | Server compatible | **WIRED** (`_make_adapters()`, 21 Nov 2026) — pipeline validation only. Test-mode responses are tagged `SANDBOX_TEST` and excluded from the index and all live analytics |
| SerpApi (Google Flights engine) | Proprietary authorized API | Free plan, 250 searches/mo | Yes — real Google Flights results incl. LCCs | Server compatible | **WIRED** (`_make_adapters()`) — needs `SERPAPI_API_KEY`; quota-guarded to T+7 only. Best free authorised-ish path |

## Repository reality

The active collector (`backend/app/services/collector.py`, `_make_adapters()`)
wires 11 adapters: Amadeus, Duffel, fast-flights, SerpApi, Scrapling Google
Flights, the Google Flights external worker, and the five airline-direct
adapters. Adapters without credentials return `NOT_CONFIGURED` per call — no
data is fabricated for them.

- **fast-flights is the demo fare source.** It is installed (`fast-flights==3.0`
  in both requirements files), wired, and verified locally for 10/10 tested
  directions. It runs from the GitHub Actions worker (`.github/workflows/collect.yml`),
  throttled, because a full sweep cannot finish inside Vercel's 60-second
  function limit. Its fares are labelled `PUBLIC_INTERFACE` — real observed
  fares from the Google Flights public interface, honestly labelled, never
  `REAL` and never "GDS fare". They feed the index under the disclosed
  SIH-demo methodology (see `backend/app/services/index_engine.py`).
- **Amadeus and Duffel are wired** (21 Nov 2026) for pipeline validation.
  Their test environments return synthetic fares, explicitly tagged
  `SANDBOX_TEST` and excluded from the index and all live analytics. They are
  not live fare sources in this deployment: Amadeus production excludes
  low-cost carriers and needs a signed contract, and Duffel live needs a
  company + IATA accreditation.
- The `GoogleFlightsWorkerAdapter` boundary is disabled by default: a
  separately managed worker must be configured with
  `GOOGLEFLIGHTS_WORKER_COMMAND` and return the documented JSON contract.
- The five airline-direct adapters (IndiGo, Air India, Air India Express,
  Akasa, SpiceJet) return `CHALLENGE_DETECTED` — no NDC access exists on free
  tiers. See the pitch-deck notes for the honest position.

If no provider is configured or a provider fails, the platform reports fare
data as unavailable rather than fabricating observations.

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

> Provenance note (21 Nov 2026): those September rows were stored with
> `data_origin="REAL"` at the time — that label was wrong for scraped fares.
> New collections label fast-flights fares `PUBLIC_INTERFACE`. The legacy
> rows are re-tagged by migration `0006_retag_scraped_fares` (chains from
> `0005`); until it is applied to a live database, treat pre-November `REAL`
> rows from `fast-flights`/`serpapi-google-flights`/`google-flights` sources
> as public-interface fares, not GDS fares.

The database also contains legacy rows from `serpapi-google-flights` and
`google-flights` whose provenance predates this recovery work. Some are
foreign-airline observations on domestic-looking routes, so those rows should
be audited before production analytics; the new route proof is from the
`fast-flights` source and is queryable by `source` and `data_origin`.
