REAL DATA ACQUISITION PHASE — CONTINUE FROM CURRENT BACKEND

The backend implementation is now complete enough for the next phase.

DO NOT rewrite the FastAPI architecture.
DO NOT redesign the frontend.
DO NOT change UI/UX.
DO NOT replace the current database architecture unnecessarily.

The current verified blocker is:

All 5 direct airline adapters currently return CHALLENGE_DETECTED and have collected 0 fare observations.

The system is correctly refusing to fabricate data.

The next objective is therefore:

GET THE FIRST REAL, LEGITIMATELY ACCESSIBLE AIRFARE OBSERVATION INTO THE DATABASE AND PROVE THE COMPLETE PIPELINE.

==================================================
1. DO NOT ASSUME DIRECT AIRLINE ACCESS
==================================================

The existing direct airline adapters may remain:

CHALLENGE_DETECTED

unless legitimate credentials/access are actually available.

Do NOT bypass:

- CAPTCHA
- Cloudflare
- Imperva
- Akamai
- authentication
- rate limits
- partner-only APIs
- access controls
- robots restrictions

Do not invent API keys or undocumented endpoints.

==================================================
2. INVESTIGATE AUTHORIZED AGGREGATOR OPTIONS
==================================================

The current backend already identifies:

Mystifly / Amadeus / other legitimate flight-content providers

as possible aggregator sources.

Research which provider can legitimately provide the required airfare data.

For each candidate determine:

- official API
- current availability
- authentication requirements
- pricing/free-tier information
- supported Indian domestic routes
- airline coverage
- one-way economy fares
- taxes
- total fare
- travel-date search
- availability
- rate limits
- commercial restrictions
- whether it is suitable for this prototype

Do NOT fabricate availability.

Prefer an official provider API/documentation.

==================================================
3. BUILD THE AGGREGATOR ADAPTER
==================================================

Create:

backend/app/collectors/aggregators/

with a common aggregator interface.

Implement the selected provider using environment variables.

Example:

AGGREGATOR_PROVIDER=
AGGREGATOR_API_KEY=
AGGREGATOR_BASE_URL=

Do not hardcode credentials.

Do not require the frontend to know the API key.

==================================================
4. FIRST REAL TEST
==================================================

Do NOT immediately attempt all 12 routes.

First test:

DEL-BOM

with:

T+1
T+7
T+15
T+30
T+45

for:

one-way
adult
economy

where supported.

The goal is to prove:

SOURCE
↓
API RESPONSE
↓
PARSER
↓
NORMALIZER
↓
VALIDATOR
↓
DATABASE
↓
API

==================================================
5. RAW RESPONSE
==================================================

For a successful source response, preserve the raw response/reference according to the existing raw_fare_payloads architecture.

Record:

source
request timestamp
response timestamp
route
travel date
request parameters
collection run ID
parser version

Never store secrets in the raw payload.

==================================================
6. NORMALIZATION
==================================================

Map the provider response to the existing canonical schema:

origin
destination
travel_date
observed_at
advance_days
airline
flight_number
cabin
fare_family
stops
base_fare
taxes
fees
total_fare
currency
availability
source
data_origin

Use:

data_origin = LIVE

ONLY after a genuine source response has been successfully received and validated.

==================================================
7. DATABASE PROOF
==================================================

After the first successful request:

query the database directly.

Show:

collection_run_id
source
route
travel_date
advance_days
airline
base_fare
taxes
fees
total_fare
currency
availability
observed_at
data_origin

Verify the record really exists.

==================================================
8. API PROOF
==================================================

Call:

GET /api/fares

and:

GET /api/fares/summary/DEL-BOM

Verify that the same database observation is returned.

Then verify:

GET /api/routes

shows the observation count.

==================================================
9. INDEX PROOF
==================================================

Do NOT force the index to calculate if the minimum sample requirement is not satisfied.

Instead verify that the index endpoint correctly says:

INSUFFICIENT_DATA

until the required real observations exist.

If sufficient observations eventually exist, verify that the calculated index uses only real observations.

==================================================
10. SOURCE HEALTH PROOF
==================================================

After successful collection, source health must change appropriately.

It must no longer say:

CHALLENGE_DETECTED

if the source actually succeeded.

Record:

last_success
latency
records_collected
status
freshness

==================================================
11. MULTI-SOURCE ARCHITECTURE
==================================================

After proving one source, prepare the architecture to support additional legitimate sources.

Do not require all sources to be available simultaneously.

Example:

Aggregator A → LIVE
IndiGo direct → CONFIGURATION_REQUIRED
Air India direct → CONFIGURATION_REQUIRED
Akasa → CHALLENGE_DETECTED
DGCA → OFFICIAL
MoSPI → STALE

The system must continue operating honestly with partial source coverage.

==================================================
12. GOVERNMENT DATA
==================================================

Continue improving the existing government connectors where legitimate.

For each source distinguish:

LIVE
OFFICIAL
STALE
CONFIGURATION_REQUIRED
CHALLENGE_DETECTED

Do not label a source LIVE merely because an HTTP request was attempted.

A source is successful only when meaningful expected data has actually been parsed.

==================================================
13. HOURLY COLLECTION
==================================================

Once the first real source works:

run the same collector through the existing APScheduler.

Verify:

manual collection
→ successful

scheduled collection
→ successful

Do not create a frontend timer.

==================================================
14. GENERATED DATA
==================================================

Keep generated/sample data isolated.

Never use it to fill missing real observations.

Never convert:

GENERATED_TEST → LIVE

just to satisfy minimum sample requirements.

==================================================
15. NO FAKE INDEX
==================================================

This is mandatory.

If only 3 real observations exist:

return INSUFFICIENT_DATA.

If only one route is covered:

return INSUFFICIENT_DATA.

If baseline matching is unavailable:

return INSUFFICIENT_DATA.

Never fabricate January 2025 baseline data.

==================================================
16. FINAL VERIFICATION
==================================================

At the end provide an exact report:

SOURCE:
ACCESS METHOD:
STATUS:
REAL RECORDS:
ROUTES:
ADVANCE WINDOWS:
DATABASE ROWS:
LAST SUCCESS:
API VERIFICATION:
SOURCE HEALTH:
INDEX STATUS:
FORECAST STATUS:
ANOMALY STATUS:

Also explicitly state:

- what was actually executed
- what could not be executed
- what credentials are still required
- what source access remains blocked

Do not claim "LIVE" unless real data has actually entered the database.

==================================================
SUCCESS CRITERION
==================================================

This phase is successful when we can demonstrate:

A real authorized airfare source
        ↓
real airfare response
        ↓
real normalized observation
        ↓
real database row
        ↓
GET /api/fares
        ↓
existing React frontend

for at least one real Indian domestic route.

Only after this proof should you scale collection to all 12 routes and all five advance windows.

Do the implementation, not merely the planning.