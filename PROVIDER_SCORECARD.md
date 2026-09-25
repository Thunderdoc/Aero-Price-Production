# AeroPrice fare-provider scorecard

Research and local verification performed 2026-09-25. No provider is treated as live merely because code exists; the result below reflects an actual request or a documented access requirement.

| Provider / project | Open source | Free / key | Indian fares | Server fit | Result |
|---|---|---|---|---|---|
| [fli](https://github.com/punitarani/fli) | Open source | Free, no key | Potentially | Reverse-engineered Google endpoint; provider changes possible | PARTIALLY WORKING candidate; not enabled because fast-flights already supplies the compatible path |
| [Flight Finder](https://github.com/affromero/flight-finder) | Open source | Self-hosted; may require an LLM | Potentially | Browser/LLM-dependent | NOT ENABLED — extra dependency and no verified result in this deployment |
| [swoop](https://github.com/saraswatayu/swoop) | Open source | Free, no key | Potentially | Google search dependency | NOT ENABLED — no end-to-end result verified here |
| [googleflights-mcp](https://github.com/altunoren/googleflights-mcp) | Open source | Free, no key | Potentially | MCP/server dependency | NOT ENABLED — no end-to-end result verified here |
| [googleflights-scraper](https://github.com/Hilsdalle/googleflights-scraper) | Open source | Self-hosted | Potentially | Browser automation / maintenance risk | NOT ENABLED — no end-to-end result verified here |
| [flight-tracker](https://github.com/sandeep-patel/flight-tracker) | Open source | Varies | Primarily tracking | Not a fare source | UNUSABLE for airfare observations |
| ADSB.lol / OpenSky / AvioADSB | Public/community | No key or anonymous tier | No | Server compatible | WORKING for aircraft positions only; never used as fare data |
| Amadeus / Duffel / SerpApi | Proprietary authorized APIs | Credentials required | Yes | Server compatible | Optional only; not required by the no-key path |

## Verified method

No public Google Flights scraper is enabled. Fare observations require an
authorized provider configured in the backend; otherwise the platform reports
fare data as unavailable.

## Verified evidence

No fare-provider result is claimed here without a current production health
record and provenance-backed observation.
