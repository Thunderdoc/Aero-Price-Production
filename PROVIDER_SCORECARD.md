# AeroPrice fare-provider scorecard

Research and local verification performed 2026-09-25. No provider is treated as live merely because code exists; the result below reflects an actual request or a documented access requirement.

| Provider / project | Open source | Free / key | Indian fares | Server fit | Result |
|---|---|---|---|---|---|
| [fast-flights](https://github.com/AWeirdDev/flights) | MIT project | Free, no key | Yes | Plain HTTP; low-volume only | **WORKING** — returned DEL-BOM, BLR-DEL and MAA-DEL results; persisted as REAL |
| [fli](https://github.com/punitarani/fli) | Open source | Free, no key | Potentially | Reverse-engineered Google endpoint; provider changes possible | PARTIALLY WORKING candidate; not enabled because fast-flights already supplies the compatible path |
| [Flight Finder](https://github.com/affromero/flight-finder) | Open source | Self-hosted; may require an LLM | Potentially | Browser/LLM-dependent | NOT ENABLED — extra dependency and no verified result in this deployment |
| [swoop](https://github.com/saraswatayu/swoop) | Open source | Free, no key | Potentially | Google search dependency | NOT ENABLED — no end-to-end result verified here |
| [googleflights-mcp](https://github.com/altunoren/googleflights-mcp) | Open source | Free, no key | Potentially | MCP/server dependency | NOT ENABLED — no end-to-end result verified here |
| [googleflights-scraper](https://github.com/Hilsdalle/googleflights-scraper) | Open source | Self-hosted | Potentially | Browser automation / maintenance risk | NOT ENABLED — no end-to-end result verified here |
| [flight-tracker](https://github.com/sandeep-patel/flight-tracker) | Open source | Varies | Primarily tracking | Not a fare source | UNUSABLE for airfare observations |
| ADSB.lol / OpenSky / AvioADSB | Public/community | No key or anonymous tier | No | Server compatible | WORKING for aircraft positions only; never used as fare data |
| Amadeus / Duffel / SerpApi | Proprietary authorized APIs | Credentials required | Yes | Server compatible | Optional only; not required by the no-key path |

## Verified method

`fast-flights` v3 queries the public Google Flights response. The adapter supports its list-like v3 result shape, extracts airline, fare, currency, stops and segment times, splits the all-in fare into the existing base/tax fields while marking `BASE_TAX_HEURISTIC`, and sends records through the existing normalization, quality, deduplication and database pipeline.

## Verified evidence

- Provider test: DEL-BOM, 2026-10-10 returned 52 parsed records; example Air India INR 6425, 07:30–09:55.
- Collection run: `daee1939-b6a6-4a85-b574-93d6169b1f31`, status `COMPLETED`, 181 stored, 157 rejected.
- Database: 1,369 REAL observations; sources include `google-flights`; DEL-BOM 193, BLR-DEL 63, MAA-DEL 118.
- Index: 99.66, 12 matched corridors, existing Jevons engine.
- Dashboard API: authenticated response reported `real_observations=1369`, `index_value=99.66`.

Google Flights results are observed prices at collection time, not guaranteed final booking prices. Collection must remain low-volume, rate-limited and subject to the provider's terms; no CAPTCHA bypass, proxy rotation or browser impersonation is used.
