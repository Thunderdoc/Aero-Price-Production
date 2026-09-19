MASTER BACKEND IMPLEMENTATION PROMPT
SIH26056 — REAL-TIME AIRFARE PRICE INDEX FOR INDIA

IMPORTANT:
This phase is BACKEND + REAL DATA + DATABASE + DATA PIPELINE ONLY.

DO NOT redesign the UI.
DO NOT improve UI/UX.
DO NOT add animations.
DO NOT change colors, layouts, typography, cards, navigation, charts, visual styling, landing pages, or dashboard design.
DO NOT spend time polishing React components except where a tiny API/type change is absolutely required to consume the backend.

The next phase will handle complete UI/UX redesign.

Your job in THIS phase is to make the existing application actually work end-to-end with real/authorized data and the real database.

==================================================
1. FIRST: FULL REPOSITORY AUDIT
==================================================

Before changing anything:

- Inspect the entire repository.
- Inspect frontend.
- Inspect backend.
- Inspect database schema.
- Inspect migrations.
- Inspect all scraper/collector code.
- Inspect all API routes.
- Inspect authentication/RBAC.
- Inspect government data integration.
- Inspect index calculation.
- Inspect forecasting.
- Inspect anomaly detection.
- Inspect scheduler/background jobs.
- Inspect configuration and environment variables.
- Inspect tests.
- Inspect scripts.
- Inspect existing sample/generated-data paths.

Do NOT assume that something works because the UI displays it.

Trace the actual execution path:

SOURCE
→ COLLECTION
→ RAW RESPONSE
→ PARSING
→ NORMALIZATION
→ VALIDATION
→ DATABASE
→ AGGREGATION
→ INDEX
→ ANOMALY
→ FORECAST
→ API
→ FRONTEND

Find every broken, mocked, fake, generated, placeholder, hardcoded, or disconnected section.

Create an internal implementation checklist and then execute it.

Do not stop after identifying problems.

==================================================
2. CORE OBJECTIVE
==================================================

The final result of this phase must be:

REAL/AUTHORIZED SOURCE
        ↓
COLLECTOR
        ↓
RAW FARE RESPONSE
        ↓
NORMALIZATION
        ↓
DATA QUALITY
        ↓
REAL DATABASE
        ↓
INDEX ENGINE
        ↓
ANOMALY ENGINE
        ↓
FORECAST ENGINE
        ↓
FASTAPI
        ↓
EXISTING FRONTEND

The system must be capable of operating without generated sample data in its production/live path.

Generated/sample data may remain ONLY for:

- automated tests
- development fallback
- deterministic unit tests
- demonstrations when no live source is configured

But it must NEVER be presented as LIVE data.

==================================================
3. REAL DATA SOURCE DISCOVERY
==================================================

Identify every potentially usable airfare source.

Prioritize:

A. Official airline APIs / NDC / authorized direct connections

Examples may include:

- IndiGo
- Air India
- Air India Express
- Akasa Air
- SpiceJet

B. Authorized flight-content providers / aggregators

C. Publicly accessible airline fare pages where automated access is explicitly permitted

D. Government/open datasets for contextual/reference information

For every source, determine:

- Is it publicly accessible?
- Does it require an API key?
- Does it require OAuth/token authentication?
- Does it require partner credentials?
- Is it NDC?
- Is it an aggregator?
- Does it provide real fare data?
- What routes can it support?
- What fields are returned?
- What rate limits exist?
- What terms/robots restrictions exist?
- What is the correct authentication mechanism?

DO NOT INVENT:

- API endpoints
- API keys
- credentials
- undocumented endpoints
- authentication tokens
- partner access
- fake responses

If credentials are required, implement the adapter completely and make the required environment variables/configuration explicit.

Do NOT attempt to bypass:

- CAPTCHA
- MFA
- authentication
- paywalls
- anti-bot controls
- rate limits
- robots restrictions
- access controls
- partner-only APIs

If a source blocks automated access, mark it as:

CHALLENGE_DETECTED

and continue with other legitimate sources.

==================================================
4. GOVERNMENT DATA
==================================================

Inspect the existing government-data integration.

Separate government data into two categories:

A. AIRFARE OBSERVATION DATA
B. OFFICIAL STATISTICAL / CONTEXTUAL DATA

Do not confuse the two.

Government datasets such as MoSPI/eSankhyiki/DGCA may be used for:

- CPI reference
- official statistical context
- route/passenger traffic information
- airline traffic
- historical benchmarks
- route basket construction
- methodology validation
- comparison/back-testing

They must NOT be falsely represented as hourly real-time airfare observations.

For every government source:

- determine the actual endpoint/resource
- determine authentication requirements
- implement the real connector where access is available
- store source metadata
- store retrieval timestamps
- store provenance
- store failures
- store response status
- never fabricate government values

If a government source requires credentials, configure it correctly and document exactly what is required.

==================================================
5. REAL FARE COLLECTION ENGINE
==================================================

Implement production-quality collection.

Required dimensions:

Origin
Destination
Travel date
Collection timestamp
Advance-purchase window
Airline
Flight number where available
Cabin
Fare family
Stops
Base fare
Taxes
Fees
Total fare
Currency
Availability
Source
Source type
Collection run ID
Data origin
Raw/source reference
Status

Required advance windows:

T+1
T+7
T+15
T+30
T+45

Do not hardcode only one window.

The collector must support:

- multiple routes
- multiple airlines
- multiple sources
- multiple travel dates
- multiple advance windows
- retries
- timeout handling
- rate limiting
- exponential backoff where appropriate
- source-specific throttling
- partial failures
- structured logging
- collection run IDs

==================================================
6. CANONICAL FARE DEFINITION
==================================================

Create one canonical definition used consistently throughout the system:

ONE-WAY
ADULT
ECONOMY
NON-STOP WHEN AVAILABLE
TOTAL PAYABLE FARE

Preserve components:

base fare
taxes
fees
surcharges
other charges
total fare

Never silently mix:

- base fare
- total fare
- round-trip fare
- different passenger counts
- different cabin classes
- different currencies

Normalize everything before inserting into analytical tables.

==================================================
7. RAW DATA MUST BE PRESERVED
==================================================

Do not throw away the original source response.

For each collection run where legally/technically possible, preserve:

- raw payload/reference
- source
- timestamp
- collection run ID
- parser version
- schema version

Then create normalized records.

This allows debugging and auditability.

==================================================
8. DATA QUALITY PIPELINE
==================================================

Implement a formal data-quality layer.

Detect and classify:

- missing fares
- malformed fares
- impossible prices
- duplicate observations
- stale observations
- sold-out flights
- cancelled flights
- unavailable routes
- currency mismatch
- tax inconsistencies
- negative values
- impossible travel dates
- invalid advance windows
- parser failures
- source failures

Every rejected record should have:

rejection_reason
source
collection_run_id
timestamp

Do NOT silently discard bad data.

==================================================
9. DATABASE
==================================================

Use the project's REAL database as the production source of truth.

Inspect the existing SQLite/PostgreSQL/Timescale-compatible architecture.

Do not create a second competing database unless there is a genuine architectural reason.

Ensure migrations are correct.

Ensure indexes exist for frequent queries.

Important query dimensions:

origin
destination
travel_date
observed_at
airline
source
advance_days
route
collection_run_id

Create/verify indexes appropriately.

Use timestamps consistently.

Prefer UTC internally where appropriate and convert to IST only at presentation boundaries.

==================================================
10. DATABASE TABLES / ENTITIES
==================================================

Verify that the database supports at minimum:

fare observations
collection runs
sources
source health
availability events
data-quality/rejections
routes/corridors
index observations
index publications
anomalies
forecasts
government datasets
audit logs
users
roles
configuration

Do not duplicate existing tables unnecessarily.

If an existing table is sufficient, extend it safely through migrations.

==================================================
11. SOURCE HEALTH
==================================================

Implement real source monitoring.

For each source track:

- enabled/disabled
- last successful collection
- last attempted collection
- last failure
- failure reason
- latency
- records collected
- records rejected
- quota usage
- authentication status
- freshness
- current status

Statuses should be truthful:

LIVE
DEGRADED
STALE
OFFLINE
CHALLENGE_DETECTED
INSUFFICIENT_DATA
CONFIGURATION_REQUIRED

Do not use LIVE merely because an adapter exists.

LIVE means:

A real source response was successfully received,
parsed,
validated,
and stored.

==================================================
12. HOURLY/HIGH-FREQUENCY COLLECTION
==================================================

Implement the collection architecture so that it can run approximately hourly.

Use a proper scheduler/background-job mechanism.

Do not simply create a frontend timer.

The backend scheduler must:

- start collection
- assign collection_run_id
- collect configured routes
- collect configured advance windows
- collect from enabled sources
- normalize
- validate
- persist
- update source health
- update aggregates
- trigger downstream processing when appropriate

Make scheduling configurable through environment/configuration.

Do not promise that hourly collection captures every fare change.

The system should report:

last_observed_at
freshness
collection_interval
source_status

==================================================
13. ROUTE BASKET
==================================================

Verify the route basket against the SIH problem requirements.

Support representative Indian city-pairs such as:

DEL-BOM
DEL-BLR
BOM-BLR
DEL-CCU
BLR-HYD
MAA-DEL

and the project's expanded 12-corridor basket.

Do not duplicate reverse routes unnecessarily.

Represent route direction explicitly.

Store:

origin
destination
route_code
region
weight
active
weight_source
effective_from
effective_to

Do not invent statistical weights.

If actual DGCA-derived weights are unavailable, clearly mark the weighting source/configuration rather than pretending they are official.

==================================================
14. INDEX ENGINE
==================================================

Audit the existing index engine.

Preserve the project's versioned methodology.

Support:

- matched-sample Jevons
- route aggregation
- national aggregation
- time-series publication
- base period
- weights
- missing-data handling
- publication version

Every index observation must contain:

index_version
method
base_period
calculation_timestamp
observation_period
sample_count
coverage
route_count
source_count
data_quality indicators

The index must never silently calculate from generated data when operating in LIVE mode.

If coverage is insufficient:

return INSUFFICIENT_DATA

rather than fabricating a number.

==================================================
15. INDEX AUDITABILITY
==================================================

For every published index, make it possible to answer:

- Which fares were used?
- Which routes were used?
- Which airlines were used?
- Which sources were used?
- What was the base period?
- What weights were used?
- How many observations?
- Which observations were rejected?
- What was missing?
- Which methodology version was used?
- When was it calculated?

Store a publication snapshot/version.

==================================================
16. ANOMALY DETECTION
==================================================

Keep the existing anomaly architecture where valid.

Verify that anomalies are calculated from real observations.

Record:

route
date
observed value
baseline
score
method
threshold
severity
source
calculation timestamp

Never label generated-test anomalies as real operational anomalies.

==================================================
17. FORECASTING
==================================================

Keep the existing forecasting architecture where valid.

Verify:

- minimum data requirement
- training window
- holdout validation
- MAE
- RMSE
- MAPE
- forecast horizon
- model version
- training timestamp

Do not produce forecasts when there is insufficient real data.

Return an explicit status instead.

Do not imply forecast certainty.

==================================================
18. API
==================================================

Audit every FastAPI endpoint.

Every API response must use the real database.

Verify endpoints including:

/api/health
/api/routes
/api/fares
/api/index
/api/indices
/api/dashboard
/api/forecast/{route}
/api/anomalies
/api/collections
/api/context
/api/data-sources
/api/compare

and every other existing endpoint.

Check:

- pagination
- filtering
- validation
- error handling
- database performance
- timestamps
- provenance
- freshness
- status fields

Remove hardcoded dashboard values.

No endpoint should return fake/generated data unless explicitly requested as a development/test mode.

==================================================
19. PROVENANCE
==================================================

Every observation/aggregate must make its origin traceable.

Use explicit values such as:

LIVE
OFFICIAL
GENERATED_TEST
DEGRADED
STALE
CHALLENGE_DETECTED

Do not allow generated data to masquerade as real data.

If the system has no real source configured:

say so.

Do not fake LIVE status just to make the dashboard look complete.

==================================================
20. AUTHENTICATION + RBAC
==================================================

Do not redesign the UI.

Audit backend authorization.

Roles currently intended:

PUBLIC
SUBSCRIBER
ANALYST
ADMIN

Ensure backend enforcement exists.

PUBLIC:
- public intelligence
- permitted public fare information
- limited analytics

SUBSCRIBER:
- saved routes
- alerts
- personal tracking

ANALYST:
- index
- historical analysis
- route/regional analysis
- anomalies
- forecasts
- government benchmarks
- exports
- methodology

ADMIN:
- sources
- collection
- data quality
- routes
- basket
- index configuration
- forecasts
- users
- roles
- audit
- system health

IMPORTANT:

Do not rely only on hiding frontend buttons.

Backend must enforce authorization.

==================================================
21. ADMIN PIPELINE
==================================================

The existing AdminDashboard pipeline must consume real backend state.

It should be able to show:

- source health
- last successful collection
- collection status
- record counts
- rejected records
- latency
- quota
- freshness
- government connector status
- database status
- scheduler status

Do not redesign the visual interface.

Only make the existing interface receive correct backend data.

==================================================
22. REMOVE PRODUCTION DEPENDENCY ON GENERATED DATA
==================================================

Search the entire repository for:

sample
mock
fake
dummy
generated
fixture
demo
hardcoded
fallback

Determine where each is used.

Classify each occurrence:

A. TEST ONLY
B. DEVELOPMENT FALLBACK
C. PRODUCTION DATA PATH
D. UI PLACEHOLDER

Remove generated data from category C.

Do not blindly delete test fixtures.

Make production/live mode explicitly distinguishable.

==================================================
23. ENVIRONMENT / SECRETS
==================================================

Create/verify:

.env.example

Document required configuration.

Never commit secrets.

Examples:

DATABASE_URL
API keys
OAuth credentials
NDC credentials
aggregator credentials
government API tokens
scheduler settings

Do not print secrets into logs.

Use masked logging.

==================================================
24. REAL DATABASE MIGRATION
==================================================

If schema changes are required:

- create proper migration
- back up database first
- migrate safely
- verify migration
- verify row counts
- verify indexes
- verify constraints

Do NOT wipe the database.

Preserve existing useful data.

==================================================
25. PERFORMANCE
==================================================

Do not repeatedly calculate expensive statistics for every frontend request.

Use:

- database indexes
- cached aggregates where appropriate
- incremental aggregation
- precomputed snapshots
- efficient SQL
- pagination

Test with the existing 20k+ observation dataset.

Ensure dashboard/API requests remain practical.

==================================================
26. FAILURE HANDLING
==================================================

The system must continue operating if one source fails.

Example:

IndiGo → success
Air India → success
Akasa → challenge
SpiceJet → timeout
Aggregator → success

The system should retain successful observations and clearly record failed sources.

One failed provider must not destroy the entire collection run.

==================================================
27. NO FAKE SUCCESS
==================================================

This is extremely important.

DO NOT claim:

"REAL-TIME"
"LIVE"
"CONNECTED"
"SUCCESSFUL"
"OFFICIAL"

unless the backend has actually verified the condition.

For example:

An adapter existing in code ≠ LIVE.

A configured API key ≠ LIVE.

A successful HTTP 200 from an unrelated endpoint ≠ LIVE airfare.

LIVE means actual airfare data was received, parsed, validated and persisted.

==================================================
28. TESTING
==================================================

After implementation, run:

- backend tests
- database tests
- migration tests
- API tests
- collector tests
- normalization tests
- data-quality tests
- index tests
- anomaly tests
- forecasting tests
- RBAC tests
- source-health tests
- scheduler tests
- frontend build

Run the complete test suite.

Fix failures instead of merely reporting them.

==================================================
29. REAL DATA SMOKE TEST
==================================================

This is mandatory.

Attempt a real collection against at least one legitimate configured source.

Use a representative route such as:

DEL-BOM

and at least:

T+1
T+7
T+15
T+30
T+45

where the source supports those travel dates.

Verify the complete chain:

SOURCE RESPONSE
→ PARSER
→ NORMALIZER
→ VALIDATION
→ DATABASE
→ INDEX INPUT
→ API

If credentials are missing:

DO NOT fake the test.

Instead report exactly:

SOURCE:
STATUS:
CREDENTIAL REQUIRED:
ENVIRONMENT VARIABLE:
ENDPOINT/ACCESS TYPE:
WHAT HAS ALREADY BEEN IMPLEMENTED:
WHAT THE USER MUST PROVIDE:

==================================================
30. DATABASE VERIFICATION
==================================================

After the smoke test, query the database directly.

Show:

- collection run ID
- source
- timestamp
- route
- travel date
- advance days
- airline
- total fare
- currency
- availability
- provenance

Verify that the records actually exist in the database.

Do not rely only on API response.

==================================================
31. END-TO-END VERIFICATION
==================================================

After backend implementation:

Run:

backend
+
database
+
scheduler
+
API
+
existing frontend

Then verify that the frontend's existing pages receive the backend's real responses.

Do not redesign them.

==================================================
32. DOCUMENTATION
==================================================

Update backend documentation with:

1. Architecture
2. Data flow
3. Sources
4. Authentication requirements
5. Environment variables
6. Database schema
7. Collection process
8. Scheduling
9. Data quality
10. Index methodology
11. Forecasting
12. Anomaly detection
13. API endpoints
14. RBAC
15. Troubleshooting
16. Running locally
17. Running production collection
18. Known source limitations

==================================================
33. FINAL AUDIT
==================================================

At the end, perform another complete repository audit.

Search for:

- fake live data
- hardcoded fares
- hardcoded index values
- fake source statuses
- fake government data
- missing authentication
- missing error handling
- missing migrations
- broken endpoints
- unused collectors
- duplicate collectors
- incorrect routes
- incorrect advance windows
- stale timestamps
- timezone bugs
- generated data entering production
- frontend endpoints returning mock data

Fix everything you find that belongs to this backend phase.

==================================================
34. FINAL REPORT
==================================================

When completely finished, do NOT just say "done".

Give me a technical implementation report with:

A. REAL SOURCES
- source
- status
- live/test/challenge
- credentials required
- actual records obtained

B. DATABASE
- database used
- migration status
- tables
- record counts

C. COLLECTION
- scheduler
- frequency
- routes
- advance windows
- success/failure

D. DATA QUALITY
- accepted
- rejected
- rejection reasons

E. INDEX
- methodology
- version
- coverage
- real-data status

F. FORECAST
- model
- training data
- validation metrics
- real-data status

G. ANOMALIES
- method
- threshold
- real-data status

H. API
- endpoints verified
- real DB status

I. RBAC
- backend enforcement status

J. GENERATED DATA
- where it still exists
- whether it can enter production
- how it is isolated

K. TEST RESULTS
- exact command
- passed
- failed
- skipped
- reason

L. REMAINING BLOCKERS
Only list genuine blockers.

If a real source requires credentials, explicitly state what I need to provide.

==================================================
FINAL RULE
==================================================

DO THE IMPLEMENTATION.

Do not stop at analysis.
Do not merely give recommendations.
Do not create a plan and wait for confirmation.

Inspect → implement → migrate → connect → test → verify → fix → retest.

Use the existing architecture wherever it is sound.

Do not rewrite working components unnecessarily.

Do not touch UI/UX except where required to consume corrected backend contracts.

The goal of this phase is:

A REAL BACKEND
+
REAL DATABASE
+
REAL/AUTHORIZED DATA SOURCES
+
REAL COLLECTION
+
REAL DATA QUALITY
+
REAL INDEX PIPELINE
+
REAL API
+
REAL PROVENANCE
+
REAL RBAC
+
REAL TESTS

No fake LIVE data.
No invented credentials.
No bypassing access controls.
No UI redesign.

Continue until the backend implementation is genuinely production-structured and all achievable work has been completed.