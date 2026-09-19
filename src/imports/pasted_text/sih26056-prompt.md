============================================================
AEROPRICE INDIA — SIH26056
MASTER END-TO-END COMPLETION / AUTONOMOUS EXECUTION PROMPT
============================================================

THIS IS THE FINAL IMPLEMENTATION PHASE.

You are taking over the CURRENT AeroPrice India repository exactly as it exists now.

Do NOT restart the project.
Do NOT replace working architecture unnecessarily.
Do NOT ask me to manually plan the next phase.
Do NOT stop after completing only one phase.
Do NOT stop after writing code without verification.

Your job is to continuously inspect → implement → test → fix → verify → improve → retest → deploy until the project is as complete and operational as the current environment and legitimately available external services allow.

Treat this as a continuous execution loop.

============================================================
0. PRIMARY OBJECTIVE
============================================================

Finish AeroPrice India SIH26056 as a complete end-to-end:

REAL-TIME AIRFARE PRICE INTELLIGENCE
AND
AIRFARE PRICE INDEX PLATFORM FOR INDIA.

The final system must connect:

REAL/AUTHORIZED DATA SOURCES
        ↓
COLLECTORS
        ↓
RAW DATA
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
AUTHENTICATION/RBAC
        ↓
REACT FRONTEND
        ↓
PRODUCTION DEPLOYMENT

The final product must feel like a serious statistical/government intelligence platform, NOT a flight-booking clone.

============================================================
1. ABSOLUTE EXECUTION RULE
============================================================

DO NOT stop after making a plan.

DO NOT ask me:

"What should I do next?"

DO NOT ask me:

"Should I continue?"

DO NOT ask for confirmation between phases.

DO NOT pause merely because one phase is complete.

DO NOT repeatedly return status updates instead of implementing.

After every completed task:

1. inspect what remains
2. select the highest-priority unfinished task
3. implement it
4. test it
5. fix failures
6. continue

Repeat this loop continuously.

Conceptually:

WHILE project_is_not_fully_verified:
    inspect
    implement
    test
    fix
    verify
    improve
    continue

Only stop when the completion criteria in Section 34 are satisfied OR when an unavoidable external dependency genuinely prevents completion.

============================================================
2. CURRENT PROJECT CONTEXT
============================================================

The project already contains substantial work.

DO NOT throw it away.

Existing work includes:

Frontend:
- React
- Vite
- Tailwind CSS
- multiple role-based dashboards/pages
- Market Overview
- Route Explorer
- Government Intelligence
- Collection Operations
- Market Insights
- Forecasts
- Anomalies
- Exports
- Price Alerts
- Admin Dashboard
- Methodology/data views

Backend:
- FastAPI
- SQLAlchemy
- SQLite/aiosqlite
- PostgreSQL-ready configuration
- Alembic
- collection scheduler
- source registry
- source health
- raw fare payload storage
- fare observations
- government datasets
- authentication
- JWT
- RBAC
- index engine
- anomaly engine
- forecasting engine
- exports
- audit logging

Current route basket:
12 corridors.

Current advance windows:

T+1
T+7
T+15
T+30
T+45

Current direct airline adapters exist for:

IndiGo
Air India
Air India Express
Akasa Air
SpiceJet

Amadeus aggregator integration is currently being implemented.

Current provenance architecture includes:

REAL
SANDBOX_TEST
GENERATED_TEST
OFFICIAL
DERIVED

Preserve these distinctions.

============================================================
3. FIRST ACTION — FULL AUDIT
============================================================

Before making major changes, inspect the CURRENT repository.

Do not rely on previous reports.

Verify actual code.

Inspect:

frontend
backend
database
migrations
API
collectors
scheduler
authentication
RBAC
analytics
government connectors
Amadeus
configuration
deployment files
tests
documentation

Search for:

TODO
FIXME
mock
sample
fake
dummy
generated
hardcoded
placeholder
temporary
console.log
unused
dead code

Determine what is:

IMPLEMENTED
WORKING
PARTIALLY WORKING
NOT VERIFIED
BROKEN
MISSING

Then immediately begin fixing the highest-priority problems.

Do not wait for user approval.

============================================================
4. REAL DATA IS THE HIGHEST PRIORITY
============================================================

The most important requirement is real airfare.

The system must eventually demonstrate:

REAL SOURCE
↓
REAL RESPONSE
↓
REAL FARE
↓
NORMALIZATION
↓
VALIDATION
↓
DATABASE
↓
API
↓
FRONTEND

Do not consider an adapter complete merely because its Python code exists.

A source is LIVE only if:

1. legitimate authentication succeeds
2. actual source request succeeds
3. actual airfare response is received
4. response is parsed
5. required fare fields are valid
6. observation is stored in database

Then:

data_origin = REAL

Otherwise use appropriate status:

CONFIGURATION_REQUIRED
CHALLENGE_DETECTED
SANDBOX_TEST
STALE
OFFLINE
INSUFFICIENT_DATA

Never fake LIVE.

============================================================
5. AMADEUS
============================================================

Finish the Amadeus integration.

Support:

AMADEUS_ENV=sandbox
AMADEUS_ENV=production

Sandbox results:

data_origin = SANDBOX_TEST

Production results:

data_origin = REAL

ONLY after actual production fare validation.

Never classify sandbox responses as REAL.

Implement:

authentication
token handling
request handling
timeouts
retry logic
rate limiting
error handling
response parsing
fare normalization
raw response storage
source health
collection run tracking

Do not expose credentials to frontend.

Do not invent production credentials.

============================================================
6. OTHER AIRLINE SOURCES
============================================================

Maintain adapters for:

IndiGo
Air India
Air India Express
Akasa Air
SpiceJet

Where legitimate APIs/NDC credentials are available:

integrate them.

Where unavailable:

keep them correctly marked:

CONFIGURATION_REQUIRED

Where an actual access challenge is encountered:

CHALLENGE_DETECTED

Never bypass:

CAPTCHA
MFA
Cloudflare
Imperva
Akamai
authentication
rate limits
robots restrictions
partner restrictions
paywalls
access controls

Never fabricate credentials.

============================================================
7. MULTI-SOURCE COLLECTION
============================================================

Build a source-agnostic collection architecture.

Example:

Amadeus → LIVE
IndiGo → CONFIGURATION_REQUIRED
Air India → CONFIGURATION_REQUIRED
Akasa → CHALLENGE_DETECTED
DGCA → OFFICIAL

The system must continue functioning when individual sources fail.

One failed source must not terminate the entire collection run.

============================================================
8. FIRST END-TO-END REAL TEST
============================================================

Before scaling:

prove one real route.

Use:

DEL-BOM

with:

T+1
T+7
T+15
T+30
T+45

where supported by the source.

Verify:

source response
→ parser
→ normalizer
→ validator
→ database
→ API
→ frontend

Directly inspect the database.

Do not rely solely on the UI.

============================================================
9. SCALE TO FULL ROUTE BASKET
============================================================

After one route succeeds:

scale to all 12 configured corridors.

Verify:

12 routes
×
5 advance windows
×
available sources

Track:

successful observations
rejected observations
unavailable flights
source failures
latency
freshness

Do not fabricate missing observations.

============================================================
10. HOURLY COLLECTION
============================================================

The backend scheduler must perform high-frequency collection.

Default:

COLLECTION_INTERVAL_MINUTES=60

Make it configurable.

The scheduler must:

create collection run
collect configured sources
collect configured routes
collect advance windows
normalize
validate
deduplicate
persist
update source health
update aggregates
record errors

Do NOT implement this as a frontend timer.

============================================================
11. RAW DATA
============================================================

Preserve raw source payloads/references where permitted.

Store:

source
collection_run_id
timestamp
request metadata
response metadata
parser version

Never store API secrets.

============================================================
12. DATA QUALITY
============================================================

Implement robust data-quality handling.

Detect:

duplicates
missing fares
invalid fares
negative values
currency mismatch
invalid dates
stale observations
sold-out flights
cancelled flights
parser failures
source failures
extreme outliers

Record rejection reason.

Never silently discard data.

============================================================
13. PROVENANCE
============================================================

Centralize provenance rules.

Use:

REAL
SANDBOX_TEST
GENERATED_TEST
OFFICIAL
DERIVED

Airfare production analytics may use:

REAL only.

Government observations:

OFFICIAL

Computed outputs:

DERIVED

Testing:

SANDBOX_TEST
GENERATED_TEST

Never mix these silently.

============================================================
14. INDEX ENGINE
============================================================

Complete and verify the Jevons index engine.

Support:

matched samples
base period
route weights
coverage
publication version
sample counts
source coverage
data quality

Use only REAL airfare observations.

If insufficient:

INSUFFICIENT_DATA

Never use generated/sandbox data to force an index.

Provide transparent methodology metadata.

============================================================
15. INDEX AUDITABILITY
============================================================

For every index publication, make it possible to identify:

observations used
routes used
sources used
weights
base period
methodology version
sample count
coverage
calculation timestamp

============================================================
16. FORECAST ENGINE
============================================================

Complete forecasting.

Use REAL airfare observations only.

Maintain:

model version
training period
sample count
forecast horizon
MAE
RMSE
MAPE
training timestamp

Do not produce misleading forecasts with insufficient data.

============================================================
17. ANOMALY ENGINE
============================================================

Complete anomaly detection.

Use real observations only.

Record:

route
advance window
value
baseline
score
threshold
method
severity
timestamp

============================================================
18. GOVERNMENT DATA
============================================================

Complete legitimate government-data integration.

Prioritize:

MoSPI/eSankhiki
DGCA
data.gov.in
official CPI/reference datasets

Keep government data separate from airfare observations.

Use government data for:

official reference
benchmarking
route context
traffic context
historical validation
methodology context

Never claim government CPI data is real-time airfare data.

============================================================
19. DATABASE
============================================================

Verify:

SQLite development
PostgreSQL production readiness
SQLAlchemy
Alembic
indexes
constraints
transactions
backups
migrations

Do not wipe existing useful data.

Create safe migrations.

============================================================
20. PERFORMANCE
============================================================

Optimize backend queries.

Use:

indexes
pagination
aggregation
caching where appropriate
incremental calculations

Do not repeatedly perform expensive full-table calculations on every dashboard request.

Test against the existing dataset and the expanded real-data dataset.

============================================================
21. AUTHENTICATION
============================================================

Complete production-grade authentication.

Support:

PUBLIC
SUBSCRIBER
ANALYST
ADMIN

Backend must enforce authorization.

Never rely solely on frontend visibility.

Ensure:

password hashing
JWT/session handling
token expiry
protected endpoints
role dependencies
logout/session handling where applicable

============================================================
22. ROLE-SPECIFIC FUNCTIONALITY
============================================================

PUBLIC:

public airfare intelligence
current observed fares
route intelligence
limited analytics
methodology

SUBSCRIBER:

saved routes
tracking
alerts
threshold alerts
personal dashboard

ANALYST:

index
historical analysis
route analysis
regional analysis
airline analysis
advance-purchase analysis
anomalies
forecast
government benchmarks
exports
data quality
methodology

ADMIN:

source management
collection control
source health
route basket
index configuration
forecast configuration
users
roles
audit logs
system health
configuration

Backend must enforce all of this.

============================================================
23. API
============================================================

Verify all existing endpoints.

At minimum:

/api/health
/api/fares
/api/routes
/api/index
/api/indices
/api/dashboard
/api/forecast/{route}
/api/anomalies
/api/collections
/api/context
/api/data-sources
/api/sources
/api/source-health
/api/government/...
/api/compare
/api/exports/...
/api/auth/...
/api/admin/...

No hardcoded production data.

Everything should come from database/services.

============================================================
24. FRONTEND INTEGRATION
============================================================

Create/complete a centralized API client.

Use:

VITE_API_URL

All production data requests should go through the backend.

Remove unnecessary direct mock-data dependencies.

Demo/generated data must be explicitly controlled.

If backend unavailable:

show honest degraded/offline state.

Never silently turn backend failure into fake LIVE data.

============================================================
25. UI/UX FINAL PHASE
============================================================

ONLY after backend/data pipeline is stable, perform the complete UI/UX upgrade.

The final product should NOT look like a generic flight booking website.

Design it as:

Government Statistical Intelligence
+
Airfare Market Intelligence
+
Public Price Intelligence

Make the UI:

premium
professional
modern
clear
responsive
accessible
fast
data-dense but understandable

Improve:

login
role dashboards
navigation
information hierarchy
cards
charts
maps
tables
filters
empty states
loading states
error states
source-status indicators
freshness indicators
tooltips
methodology explanations
data provenance
responsive mobile/tablet/desktop layouts

Use meaningful animation only where it improves usability.

Do not add decorative animation that hurts performance.

============================================================
26. LOGIN
============================================================

Create a professional authentication experience.

Do not allow production users to arbitrarily choose their role.

Role must come from authenticated account.

If demo accounts exist:

clearly label them DEMO.

============================================================
27. PUBLIC DASHBOARD
============================================================

Public users should understand immediately:

What is happening to Indian airfare?

Show:

current observed fare
route
freshness
advance window
trend
coverage
source
provenance

Do not turn it into a booking clone.

============================================================
28. ANALYST DASHBOARD
============================================================

Prioritize:

Airfare Price Index
route contribution
regional comparison
advance-purchase elasticity
airline comparison
anomalies
forecast
government benchmarks
data quality
coverage

Make methodology accessible.

============================================================
29. ADMIN COMMAND CENTER
============================================================

Provide clear visibility into:

source health
collection runs
database
scheduler
API
data quality
routes
basket
index engine
forecast engine
users
roles
audit logs

Use truthful statuses:

LIVE
DEGRADED
STALE
OFFLINE
CONFIGURATION_REQUIRED
CHALLENGE_DETECTED
INSUFFICIENT_DATA

============================================================
30. MAP / ROUTE EXPLORER
============================================================

Improve the existing India route map.

Show meaningful analytical information.

Avoid visual clutter.

Allow:

route selection
fare trend
current fare
index movement
advance window
airline/source filtering
freshness

============================================================
31. DATA VISUALIZATION
============================================================

All charts must use actual API data.

Clearly distinguish:

observed
forecast
derived
official benchmark
test/demo

Never make a forecast visually indistinguishable from an observed value.

============================================================
32. ACCESSIBILITY
============================================================

Verify:

keyboard navigation
contrast
focus states
ARIA labels
form errors
screen-reader labels
responsive behavior

Do not sacrifice accessibility for visual effects.

============================================================
33. DEPLOYMENT
============================================================

Prepare production deployment.

Frontend:

Vercel or appropriate frontend hosting.

Backend:

appropriate FastAPI-compatible hosting.

Database:

PostgreSQL production configuration.

Configure:

environment variables
CORS
HTTPS
secret management
database migrations
health checks
logging
error handling

Do not expose secrets.

Create production documentation.

============================================================
34. AUTOMATED VERIFICATION LOOP
============================================================

After every major implementation:

RUN AVAILABLE TESTS.

Then:

BUILD FRONTEND.

Then:

VERIFY BACKEND CONTRACTS.

Then:

CHECK DATABASE.

Then:

CHECK API.

Then:

CHECK UI.

Then:

FIX EVERYTHING FOUND.

Then repeat.

Use this loop:

IMPLEMENT
↓
TEST
↓
BUILD
↓
VERIFY
↓
FIND BUGS
↓
FIX
↓
RETEST
↓
CONTINUE

Do not stop merely because compilation succeeds.

============================================================
35. BROWSER / E2E VERIFICATION
============================================================

Where browser automation is available:

test:

login
role access
dashboard
route explorer
filters
API loading
error state
source status
analytics
exports
admin functions

Verify no console errors.

If browser automation is unavailable in the current environment, still write the tests and clearly document that execution limitation.

============================================================
36. TEST SUITE
============================================================

Complete tests for:

backend
database
migrations
authentication
RBAC
collectors
normalization
data quality
provenance
index
forecast
anomaly
government connectors
scheduler
API
frontend
critical UI flows

Never claim a test passed if it was not executed.

Distinguish:

WRITTEN
EXECUTED
PASSED
FAILED
BLOCKED_BY_ENVIRONMENT

============================================================
37. GENERATED DATA AUDIT
============================================================

Search the complete repository for:

sample
mock
fake
dummy
generated
fixture
demo
hardcoded

Determine whether each is:

TEST ONLY
DEMO ONLY
PRODUCTION

Remove generated-data paths from production.

Do not delete useful test fixtures unnecessarily.

============================================================
38. SECURITY AUDIT
============================================================

Check:

secrets
CORS
JWT
password hashing
input validation
SQL injection
unsafe SQL
authentication bypass
RBAC bypass
file export access
admin endpoints
API credentials
logging of secrets

Fix all discovered issues.

============================================================
39. PERFORMANCE AUDIT
============================================================

Check:

frontend bundle
API latency
database query performance
large tables
chart rendering
map rendering
unnecessary requests
memory leaks
scheduler duplication

Optimize only where useful.

============================================================
40. DOCUMENTATION
============================================================

Update:

README
backend README
.env.example
API documentation
deployment instructions
data-source documentation
methodology documentation
architecture documentation
troubleshooting documentation

Document:

local setup
database setup
backend startup
frontend startup
source credentials
scheduler
production deployment
RBAC
index methodology
provenance
known limitations

============================================================
41. PRODUCTION READINESS
============================================================

Before declaring completion verify:

frontend builds
backend starts
database connects
migrations work
API responds
authentication works
RBAC works
scheduler works
source health works
real-data pipeline works where legitimate access exists
provenance works
index works when sufficient real data exists
forecast works when sufficient real data exists
anomaly engine works when sufficient data exists
government data works where available
exports work
admin works
public works
subscriber works
analyst works
production configuration exists

============================================================
42. NO FALSE COMPLETION
============================================================

NEVER claim:

LIVE
REAL-TIME
PRODUCTION READY
CONNECTED
VERIFIED
SUCCESSFUL

unless the corresponding condition has actually been demonstrated.

Especially:

SANDBOX ≠ REAL

GENERATED ≠ REAL

ADAPTER EXISTS ≠ SOURCE CONNECTED

HTTP 200 ≠ VALID AIRFARE DATA

API KEY CONFIGURED ≠ REAL DATA

FRONTEND DISPLAY ≠ DATABASE PROOF

DATABASE ROW ≠ VALIDATED REAL FARE unless provenance is REAL

============================================================
43. EXTERNAL BLOCKERS
============================================================

If an unavoidable external dependency prevents a final LIVE step:

DO NOT fabricate a result.

DO NOT bypass the restriction.

DO NOT repeatedly ask me for confirmation.

Complete every other possible part automatically.

Then clearly record:

BLOCKER
WHY IT EXISTS
WHAT HAS ALREADY BEEN IMPLEMENTED
EXACT CREDENTIAL/ACCESS REQUIRED
EXACT STEP NEEDED OUTSIDE THE CODEBASE

Then continue working on everything else that is not blocked.

============================================================
44. DEPLOYMENT VERIFICATION
============================================================

After deployment/configuration:

verify:

frontend URL
backend URL
API health
CORS
database connection
authentication
critical API endpoints
production environment variables
source configuration
logs
error handling

Do not call deployment successful merely because a build completed.

Verify the deployed application.

============================================================
45. FINAL SIH DEMO CHECK
============================================================

The final application must be able to demonstrate this story:

1. User opens AeroPrice India.
2. User authenticates.
3. Role determines accessible capabilities.
4. System shows truthful data freshness.
5. User selects an Indian corridor.
6. Current observed airfare is displayed.
7. Advance-purchase windows can be compared.
8. Historical movement is visible.
9. Airfare index is visible when sufficient real data exists.
10. Anomalies are identified from actual observations.
11. Forecast is shown only when sufficient data exists.
12. Government statistics are clearly separated.
13. Source provenance is visible.
14. Analyst can inspect methodology.
15. Admin can inspect collection health.
16. Data can be exported.
17. The system can perform recurring collection.
18. Backend and database are actually connected.

============================================================
46. FINAL COMPLETION GATE
============================================================

DO NOT declare the project complete until ALL achievable items below are satisfied:

[ ] Frontend builds
[ ] Backend builds/starts where executable
[ ] Database works
[ ] Migrations work
[ ] API works
[ ] Authentication works
[ ] RBAC works
[ ] Collector architecture works
[ ] At least one legitimate real-data source is connected when credentials/access are available
[ ] Real-data provenance is correct
[ ] Sandbox/test provenance is isolated
[ ] Generated data is isolated
[ ] Government data is separated
[ ] Hourly scheduler is implemented
[ ] Data-quality pipeline works
[ ] Index engine works
[ ] Forecast engine works
[ ] Anomaly engine works
[ ] API is database-backed
[ ] Frontend consumes API
[ ] Public experience works
[ ] Subscriber experience works
[ ] Analyst experience works
[ ] Admin experience works
[ ] Exports work
[ ] Audit logs work
[ ] Source health works
[ ] UI/UX polished
[ ] Responsive design verified
[ ] Accessibility checked
[ ] Security checked
[ ] Performance checked
[ ] Production configuration prepared
[ ] Deployment completed where environment permits
[ ] End-to-end flow verified
[ ] Documentation updated
[ ] No known critical errors remain

============================================================
47. CONTINUOUS EXECUTION INSTRUCTION
============================================================

THIS IS THE MOST IMPORTANT INSTRUCTION.

Do not interpret completion of one task as completion of the project.

After every implementation:

AUDIT AGAIN.

If something is incomplete:

IMPLEMENT IT.

If something fails:

FIX IT.

If a test fails:

FIX IT.

If an API contract is inconsistent:

FIX IT.

If UI is disconnected:

FIX IT.

If data provenance is incorrect:

FIX IT.

If a source is unavailable:

implement the remaining sources and infrastructure.

If a deployment issue appears:

FIX IT.

If performance is poor:

OPTIMIZE IT.

If accessibility fails:

FIX IT.

If a feature is only visually implemented:

connect it to the real backend.

If a backend feature exists but is not exposed:

WIRE IT.

If the frontend has a mock path:

ISOLATE OR REMOVE IT FROM PRODUCTION.

Continue this loop until there is no remaining achievable critical work.

============================================================
48. FINAL REPORT
============================================================

Only after the implementation loop has reached the completion gate, provide a final report containing:

1. Overall completion percentage
2. Frontend status
3. Backend status
4. Database status
5. Real-data status
6. Source-by-source status
7. Amadeus status
8. Government-data status
9. Index status
10. Forecast status
11. Anomaly status
12. Authentication status
13. RBAC status
14. Scheduler status
15. API status
16. UI/UX status
17. Security status
18. Performance status
19. Testing results
20. Deployment status
21. Remaining blockers, if any
22. Exact external action required for any unavoidable blocker

For every status distinguish:

IMPLEMENTED
VERIFIED
NOT VERIFIED
BLOCKED

Do not use vague statements such as "mostly complete."

============================================================
FINAL COMMAND
============================================================

START NOW.

Do not ask me what to do next.

Do not wait for confirmation.

Do not stop after one phase.

Do not stop after backend completion.

Do not stop after frontend completion.

Do not stop after testing.

Do not stop after deployment preparation.

Continuously execute:

AUDIT
→ IMPLEMENT
→ TEST
→ FIX
→ VERIFY
→ POLISH
→ DEPLOY
→ VERIFY AGAIN

until the complete AeroPrice India SIH26056 system is genuinely functioning end-to-end to the maximum extent possible in the current environment.

The goal is NOT "code written."

The goal is:

A COMPLETE, VERIFIED, DEPLOYED, PROFESSIONAL, END-TO-END AEROPRICE INDIA SYSTEM.

Begin immediately.