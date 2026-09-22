AEROPRICE INDIA — MASTER PRODUCT CORRECTION & ENGINEERING PLAN

IMPORTANT:
Do NOT start by redesigning the UI.

The current UI is temporary.

The objective of this phase is to make the entire AeroPrice system functionally correct, role-correct, data-correct, statistically defensible, secure, and production-structured.

After the engineering foundation is correct, we will perform a separate premium UI/UX redesign.

==================================================
1. PRODUCT IDENTITY
==================================================

AeroPrice India is an airfare intelligence and statistical measurement platform.

It is NOT a flight booking website.

It has two major purposes:

1. Government/statistical intelligence
2. Public/subscriber airfare price intelligence

The government/statistical capability is the primary SIH purpose.

The public experience is a secondary layer built on top of the same verified airfare observation infrastructure.

Never blur these two purposes.

==================================================
2. CURRENT PROBLEM
==================================================

The current application visually contains:

- generated/sample fares
- route index
- forecasts
- anomalies
- India map
- route explorer
- collection operations
- public overview
- admin overview

However, the UI, role permissions, real-data state, and backend capabilities are not yet fully aligned.

The application must therefore be audited before further UI work.

==================================================
3. FIRST TASK — FULL REPOSITORY AUDIT
==================================================

Inspect the entire repository.

Do not assume a feature exists because a UI button exists.

For every feature determine:

IMPLEMENTED
PARTIAL
UI ONLY
MOCKED
GENERATED
REAL
BROKEN
MISSING

Audit:

- authentication
- authorization
- roles
- frontend routes
- backend routes
- database
- data sources
- collectors
- scheduler
- fare normalization
- deduplication
- data quality
- route basket
- route weights
- advance windows
- index
- anomalies
- forecasts
- government data
- exports
- audit logs
- source health
- API performance

Produce a gap report before major modifications.

==================================================
4. REMOVE SAMPLE DATA FROM THE PRODUCT PATH
==================================================

Generated data must NOT appear as real data.

Development test fixtures may remain for automated testing.

Every observation must carry provenance:

data_origin
source
source_id
collected_at
source_timestamp
collection_run_id
origin
destination
travel_date
advance_days
airline
flight_number
fare_family
cabin
stops
base_fare
taxes
fees
total_fare
currency
availability

Possible origins:

REAL
OFFICIAL
DERIVED
GENERATED_TEST

GENERATED_TEST must never be presented as LIVE.

If real data is unavailable:

show:

NO LIVE DATA
STALE DATA
SOURCE UNAVAILABLE
INSUFFICIENT DATA

Never fabricate a number to make the dashboard look complete.

==================================================
5. REAL DATA
==================================================

Audit every current source.

Identify:

- actually working real sources
- public sources
- authorized APIs
- authenticated sources
- unavailable sources
- blocked sources
- sources requiring credentials

Do not invent API keys.

Do not invent undocumented endpoints.

Do not bypass CAPTCHA.

Do not bypass authentication.

Do not bypass robots.txt or terms.

Use an adapter architecture:

FareSource
  ├── source A
  ├── source B
  ├── source C
  └── aggregator/authorized source

Every source must expose health and provenance.

==================================================
6. FARE DEFINITION
==================================================

Use a canonical comparison fare:

ONE-WAY
ADULT
ECONOMY
NON-STOP WHEN AVAILABLE
TOTAL PAYABLE FARE

Store fare components separately.

Never compare incomparable fares silently.

==================================================
7. ADVANCE PURCHASE
==================================================

Support:

T+1
T+7
T+15
T+30
T+45

Store:

observation_date
travel_date
advance_days

Do not hard-code a single advance window.

==================================================
8. DATA QUALITY
==================================================

Implement validation for:

- missing fare
- invalid fare
- duplicate
- sold out
- unavailable
- stale
- outlier
- incomplete fare
- invalid currency
- invalid date
- insufficient observations

Every rejection must have a reason code.

==================================================
9. INDEX ENGINE
==================================================

Audit the current index implementation.

Verify:

- route basket
- route weights
- base period
- matched samples
- missing data handling
- outlier handling
- route index
- regional aggregation
- all-India aggregation
- index continuity

Never invent official weights.

Clearly label:

OBSERVED
DERIVED
OFFICIAL
BENCHMARK

Government benchmark data must never silently alter observed fare data.

Every methodology change must be versioned.

==================================================
10. FORECAST ENGINE
==================================================

Treat the current forecasting model as a baseline.

Evaluate:

MAE
RMSE
MAPE where appropriate
holdout performance
route-level performance

Prefer forecast intervals:

₹5,400–₹6,100

rather than false precision:

₹5,782.34

If data is insufficient:

INSUFFICIENT DATA FOR FORECAST

Do not fabricate confidence.

==================================================
11. PERFORMANCE
==================================================

Find APIs that repeatedly recompute large datasets.

Use:

- incremental aggregation
- precomputed statistics
- caching
- index snapshots
- forecast snapshots

Dashboard endpoints should not repeatedly load and recompute the entire fare database.

==================================================
12. ROLE SYSTEM
==================================================

Implement exactly:

PUBLIC
SUBSCRIBER
ANALYST
ADMIN

IMPORTANT:

The user does NOT choose their production role at login.

Authentication determines the account.

The backend determines the role.

Demo buttons may exist only in DEMO MODE.

==================================================
13. PUBLIC PERMISSIONS
==================================================

PUBLIC can access:

- public overview
- airfare search
- route intelligence
- current observed fares
- limited forecasts
- public trends
- public methodology

PUBLIC cannot access:

- government index internals
- data quality
- collection operations
- source configuration
- audit logs
- user management
- administrative settings

==================================================
14. SUBSCRIBER PERMISSIONS
==================================================

SUBSCRIBER gets PUBLIC capabilities plus:

- tracked routes
- saved searches
- price alerts
- threshold alerts
- movement alerts
- personal dashboard
- alert history

==================================================
15. ANALYST PERMISSIONS
==================================================

ANALYST gets:

- airfare index
- route intelligence
- regional analysis
- historical analysis
- advance purchase analysis
- airline analysis
- anomalies
- forecasts
- government benchmarks
- data quality statistics
- methodology
- exports

ANALYST must NOT modify system configuration or source credentials.

==================================================
16. ADMIN PERMISSIONS
==================================================

ADMIN gets authorized administrative capabilities:

COMMAND CENTER
COLLECTION
SOURCES
ROUTES & BASKET
DATA QUALITY
INDEX ENGINE
FORECAST ENGINE
USERS & ROLES
SYSTEM HEALTH
AUDIT LOGS
EXPORTS
SETTINGS

Admin must be able to see:

- collector health
- source health
- scheduler status
- last successful collection
- next collection
- request counts
- success/failure counts
- rejected records
- source latency
- quotas
- route coverage
- data freshness
- index calculation state
- forecast state
- system errors

==================================================
17. RBAC SECURITY
==================================================

Hiding a button is NOT authorization.

Every protected backend endpoint must enforce permissions.

Examples:

PUBLIC → ADMIN API = 403
SUBSCRIBER → ANALYST API = 403
ANALYST → ADMIN configuration API = 403

Protect both:

frontend routes
backend APIs

Never expose API keys or credentials to the browser.

==================================================
18. ADMIN SOURCE MANAGEMENT
==================================================

Create source management with:

source name
source type
status
authentication state
quota
rate limit
last success
last failure
latency
observation count
error count
enabled/disabled
schedule

Allow admin to disable a failing source.

Never delete historical verified observations simply because a source is disabled.

==================================================
19. COLLECTION OPERATIONS
==================================================

Every collection must have a run ID.

Show:

run ID
start time
end time
sources
routes
requests
successful
failed
valid
rejected

Allow drill-down into failures.

==================================================
20. DATA QUALITY DASHBOARD
==================================================

Show database-derived:

total observations
valid
rejected
duplicate rate
outlier rate
stale rate
missing rate
coverage

Show rejection reasons.

No hard-coded numbers.

==================================================
21. ROUTE BASKET
==================================================

Create a route-basket configuration system.

Each route:

origin
destination
region
weight
weight source
DGCA reference
status
effective date

Changes must be versioned and audited.

==================================================
22. INDEX ENGINE ADMINISTRATION
==================================================

Show:

methodology version
base period
routes included
route coverage
observation count
calculation timestamp
status

Do not silently modify historical index calculations.

==================================================
23. FORECAST ADMINISTRATION
==================================================

Show:

model
training date
forecast horizon
routes
MAE
RMSE
MAPE
route-level performance
insufficient-data cases

==================================================
24. USER MANAGEMENT
==================================================

Admin can:

view users
view roles
change authorized roles
suspend accounts
revoke sessions
review login history

All sensitive actions must be audited.

==================================================
25. AUDIT LOG
==================================================

Log:

login
logout
failed login
role change
source configuration
source enable/disable
collection start/stop
route basket changes
index configuration
forecast configuration
user suspension
export

Store:

actor
action
timestamp
target
old value
new value
request/session reference where appropriate

==================================================
26. DATA STATUS MODEL
==================================================

Implement globally:

LIVE
DEGRADED
STALE
OFFLINE
INSUFFICIENT_DATA
GENERATED_TEST

Never show generated data as live.

Never show stale data as current.

==================================================
27. PUBLIC UX FUNCTIONALITY
==================================================

Public homepage should prioritize:

FROM
TO
TRAVEL DATE

Then:

current observed fare
freshness
source
fare definition
7-day movement
expected price range
tracking option

Do not turn it into a booking website.

==================================================
28. SUBSCRIBER UX
==================================================

Subscriber dashboard:

tracked routes
current fare
target fare
trend
last observation
alert state

Track-price workflow:

route
travel date
target fare
alert rule
notification channel

==================================================
29. ANALYST UX
==================================================

Analyst dashboard:

Airfare Index
Index change
Route contribution
Regional movement
Route coverage
Data quality
Forecasts
Anomalies
Government benchmarks

Provide methodological transparency.

==================================================
30. ADMIN UX
==================================================

Admin dashboard should be an operations command center, not a public dashboard with extra buttons.

Primary cards:

SYSTEM HEALTH
COLLECTION HEALTH
SOURCE HEALTH
DATA QUALITY
INDEX ENGINE
FORECAST ENGINE
USERS
ALERTS

==================================================
31. MAP
==================================================

Simplify the India map.

Default:

important corridors only.

Filters:

All
Rising
Falling
Stable

Metrics:

Fare movement
Index movement
Observation volume
Forecast

Clicking a corridor opens detailed intelligence.

Do not overload the map with unnecessary labels.

==================================================
32. LOGIN
==================================================

Production login:

Email
Password
Show/hide password
Remember device
Forgot password
Secure authentication
Optional organization SSO if implemented
Optional passwordless/email-link authentication if supported

Demo environment:

Public Demo
Subscriber Demo
Analyst Demo
Admin Demo

Demo buttons must explicitly be demo-only.

Never allow a normal user to select a privileged role merely through frontend state.

==================================================
33. ACCESSIBILITY
==================================================

Follow WCAG 2.2 principles.

Ensure:

keyboard navigation
proper labels
accessible error messages
visible focus
adequate contrast
accessible authentication
password-manager compatibility
paste support
reduced-motion support
screen-reader-compatible status messages

==================================================
34. TESTING
==================================================

Create automated tests for:

authentication
RBAC
API authorization
role isolation
source ingestion
normalization
deduplication
advance windows
data quality
index
anomalies
forecast
source failure
stale data
missing data
performance

==================================================
35. NO UI REDESIGN YET
==================================================

Do NOT spend significant effort on visual redesign during this phase.

The existing UI is a temporary shell.

Make functionality correct first.

==================================================
36. FINAL REPORT
==================================================

After implementation report:

1. Current architecture
2. Real data sources working
3. Sources requiring credentials
4. Sources unavailable
5. Remaining sample/test paths
6. Model weaknesses
7. Index weaknesses
8. Forecast weaknesses
9. Data-quality weaknesses
10. RBAC weaknesses
11. Performance weaknesses
12. Security weaknesses
13. Functions implemented
14. Functions still missing
15. Tests passed
16. Tests failed
17. Exact commands to run
18. Exact next steps for UI/UX

Do not claim a feature works unless it was actually tested.

Do not claim LIVE data unless a real source response was successfully received.

Do not replace missing real data with generated numbers.


1. First: what I see in the current UI
Login

Your current login is visually reasonable as a temporary prototype, but there is one major conceptual problem:

The user should not normally select ADMIN / ANALYST / SUBSCRIBER / PUBLIC as a login identity.

The role should come from the authenticated account.

Instead of:

ADMIN
ANALYST
SUBSCRIBER
PUBLIC

being four buttons that potentially let somebody choose their privilege, it should be:

Email
Password
        ↓
Authentication
        ↓
Account
        ↓
Assigned Role
        ↓
Correct workspace

You can retain Demo Login buttons for the SIH presentation, but make it explicit:

Demo accounts

and have the backend assign the role.

2. Your current public dashboard has another major problem

The screenshot currently says:

GENERATED DATA — AIRFARE SOURCES UNAVAILABLE

but then displays:

₹5,840
₹6,120
+3.2%
route trends
regional index
anomalies
forecasts

That creates a credibility problem.

A government/statistical system should never make the user wonder:

“Is this number real?”

Every number should have provenance.

For example:

Instead of

DEL → BOM ₹5,840

show:

₹5,840
Observed fare
LIVE · 8 min ago
IndiGo · Economy · Non-stop
1 source / 4 observations

And if the system doesn't have a real observation:

No live observation available
Last successful observation: 09:14 IST
Source unavailable

This is one of the most important changes.

3. I would redesign the entire product around 4 workspaces

Not four completely different websites.

One platform:

AeroPrice India

with four controlled experiences:

                 AEROPRICE
                     │
          ┌──────────┼──────────┐
          │          │          │
       PUBLIC    SUBSCRIBER   ANALYST
                                  │
                               ADMIN
4. PUBLIC workspace

The public user does not need government statistical machinery.

Their question is:

“What is happening with my flight price?”

Public navigation
Overview
Search Fare
Route Explorer
Price Trends
How It Works

Not:

Collection Operations
Data Quality
Index Methodology
Source Registry
Forecast Model
Audit Logs

Those are unnecessary for the public.

Public homepage

The first screen should immediately answer:

“Where are you flying?”
FROM
Delhi (DEL)

TO
Mumbai (BOM)

TRAVEL DATE
25 Oct 2026

[ CHECK FARES ]

Then:

Current observed fare
₹5,840
Observed 8 min ago

↓ 3.2% vs previous observation

IndiGo
Economy
Non-stop

Then:

Expected movement
NEXT 7 DAYS

₹5,600 — ₹6,300

Trend
↗ Increasing

Forecast confidence
Moderate

Do not present a forecast as an exact guaranteed future ticket price.

5. PUBLIC needs a much better route intelligence page

Currently the map is doing too much.

The India map should answer:

Where are airfare movements happening?

Click:

DEL → BOM

Then open:

Route Intelligence
────────────────────────

Delhi → Mumbai

Current observed fare
₹5,840

7-day movement
+3.2%

Observation freshness
8 min

Available observations
24

Sources
3

Forecast
₹5,600–₹6,300

Advance purchase
T+1
T+7
T+15
T+30
T+45

Then charts.

6. SUBSCRIBER workspace

Subscriber should not simply be “Public + one button.”

It should be a personal price-monitoring workspace.

Navigation:

Dashboard
My Tracked Routes
Price Alerts
Price History
Saved Searches
Profile
Dashboard
Tracked Routes

DEL → BOM
₹5,840
↑ 3.2%
Alert: ₹5,500

DEL → BLR
₹6,120
↓ 1.8%
No alert

MAA → DEL
₹6,480
↓ 0.9%
Alert active
Track Route

User chooses:

Origin
Destination
Travel date
Maximum acceptable fare
Alert condition

Example:

Notify me when:

DEL → BOM

fare ≤ ₹5,500

or:

Notify me when price changes
by more than 5%

or:

Notify me when trend changes
from Stable → Rising

That is much more meaningful than simply adding a “Track” button.

7. ANALYST workspace

This is where AeroPrice becomes an actual statistical intelligence platform rather than a flight-price website.

Navigation should be something like:

Overview
Airfare Index
Route Intelligence
Regional Analysis
Advance Purchase
Airline Analysis
Anomalies
Forecasts
Government Benchmarks
Data Quality
Methodology
Exports
Analyst Overview

The first screen should show:

AIRFARE PRICE INDEX — INDIA

Current Index
103.42

7D change
+1.8%

30D change
+4.7%

Routes monitored
24

Valid observations
18,420

Data freshness
8 min

Collection coverage
92.4%

Then:

Index trend
          /
       __/
   ___/
__/

Then:

Contribution by corridor
DEL-BOM       +0.42 pp
DEL-BLR       +0.31 pp
BOM-BLR       +0.27 pp
DEL-CCU       +0.18 pp
...

This is much more useful for an analyst than a list of ticket prices.

8. The Analyst needs an actual index methodology screen

This is currently missing as a serious analytical product.

It should explain:

Raw observations
       ↓
Validation
       ↓
Standardization
       ↓
Deduplication
       ↓
Matched samples
       ↓
Route-level index
       ↓
Weighted aggregation
       ↓
All-India Airfare Index

And show actual parameters:

Index methodology
Jevons / geometric mean

Base period
[configured period]

Route basket
[24 corridors]

Route weights
DGCA-derived / documented source

Advance windows
T+1
T+7
T+15
T+30
T+45

Fare definition
One-way adult economy
...

This is essential because your SIH solution is supposed to produce an index, not merely scrape prices.

MoSPI's current CPI material is particularly relevant here: it says the CPI 2024 series uses alternative data sources, includes online sources for airfares, and that airfare collection uses specified protocols; the report also references Jevons short-index methodology for elementary-level indices.

9. ADMIN is currently far too weak

This is the area I'd change most.

The Admin should be the operations control centre.

Admin navigation:

Command Center
Collection
Sources
Routes & Basket
Data Quality
Index Engine
Forecast Engine
Users & Roles
System Health
Audit Logs
Exports
Settings
10. Admin Command Center

Admin should immediately see:

SYSTEM STATUS

Airfare collectors       7/8 healthy
Government sources       3/4 healthy
Database                 Healthy
Scheduler                Running
Last collection          09:00 IST
Next collection          10:00 IST

Then:

TODAY'S COLLECTION

Sources queried          8
Routes                   24
Requests                 1,240
Successful               1,186
Failed                      54
Valid observations       1,104
Rejected                    82

This should all be database-derived.

11. Admin → Sources

This is a major missing module.

Each source gets a card:

INDIGO
────────────────
Status       HEALTHY
Last success 09:04
Latency      1.4s
Observations 342
Errors       4
Last failure None

[View]
[Run Test]

Another:

SERP/AGGREGATOR
────────────────
Status       DEGRADED
Last success 08:51
Quota        78%
Errors       12

[View]

Admin needs:

source status
source type
authentication state
quota
rate limit
last successful request
last failed request
error reason
response latency
observation count
robots/terms status where applicable
enabled/disabled
collection schedule

Never display secret API keys in the UI.

Show:

API KEY
••••••••••••••9F2A

Status: Configured

not the actual key.

12. Admin → Collection Operations

Your current Collection Operations should become much stronger.

Admin should be able to see:

COLLECTION RUN

RUN-2026-09-19-1000

Started       10:00:03
Completed     10:08:22

Routes        24
Sources       7

Requests      1,482
Success       1,397
Failed           85

Valid         1,311
Rejected         86

Then drill into failures.

Example:

DEL-BOM
IndiGo
FAILED

Reason:
SOURCE_TIMEOUT

Retry:
[Retry route]
13. Admin → Data Quality

This is absolutely necessary for a serious statistical system.

Dashboard:

DATA QUALITY

Total collected       18,420
Valid                 17,890
Rejected                 530

Completeness            97.1%
Duplicate rate           1.2%
Outlier rate             0.8%
Stale observations       0.4%

Then reasons:

Rejected because:

Missing fare              112
Sold out                   86
Duplicate                  74
Invalid date               32
Currency mismatch          14
Outlier                    91
Incomplete fare            63
Stale                      58
14. Admin → Route Basket

This is missing as a first-class administrative concept.

Admin should control/configure:

Route
Origin
Destination
Region
DGCA traffic reference
Weight
Enabled
Priority

Example:

DEL → BOM

Weight
8.43%

Traffic basis
DGCA

Status
ACTIVE

But don't let the Admin casually overwrite an official methodology without an audit trail.

Any change should create:

Who changed it
What changed
Old value
New value
Timestamp
Reason
15. Admin → Index Engine

Admin needs to see:

INDEX ENGINE

Current version
fixed-base-jevons-v1

Base period
2024

Last calculation
10:12 IST

Routes included
24/24

Observations
17,890

Missing routes
0

Status
VALID

And if someone changes methodology:

Create new methodology version

rather than silently altering history.

This is extremely important for reproducibility.

16. Admin → Forecast Engine

Admin should see:

FORECAST ENGINE

Model
Holt baseline

Forecast horizon
7 days

Routes
24

Last training
09:30

MAE
₹XXX

RMSE
₹XXX

MAPE
X.X%

And route-specific performance:

DEL-BOM
MAE ₹XXX

DEL-BLR
MAE ₹XXX

BOM-BLR
MAE ₹XXX

If a route has poor historical performance, show:

Insufficient forecast confidence

instead of pretending the prediction is reliable.

17. Admin → Users & Roles

This needs to be a real RBAC system.

Example:

User	Role	Status	Last login
admin@...	ADMIN	Active	10:02
analyst@...	ANALYST	Active	09:44
user@...	SUBSCRIBER	Active	08:21
visitor	PUBLIC	Anonymous	—

Admin actions:

View user
Change role
Suspend
Reset authentication
View sessions
Revoke sessions

Role changes should be audited.

18. ADMIN should have a kill switch

Very important for your collector.

Suppose a source suddenly returns garbage.

Admin should be able to:

Disable source

Then:

IndiGo collector
        ↓
DISABLED
        ↓
No new observations
        ↓
Existing verified data retained

Not delete historical data.

19. Your map needs a conceptual redesign

The current map is visually busy.

You have:

airport dots
corridor lines
country labels
map labels
legends
side panel
status indicator
search

all competing for attention.

Instead:

Default

Only important corridors.

Then:

Filter:

☑ All
☐ Rising
☐ Falling
☐ Stable

Metric:

● Price movement
○ Index movement
○ Observation volume
○ Forecast

Clicking a corridor should open the intelligence panel.

The map becomes an analytical tool rather than decoration.

20. The “offline” indicator needs to be much smarter

Currently:

15 flights over India — OFFLINE

That's ambiguous.

Offline what?

Instead:

DATA STATUS

● Collection system: OFFLINE
● Last successful collection: 09:42 IST
● Last verified data: 09:42 IST

Or:

● LIVE
Last observation: 3 min ago

Or:

● DEGRADED
6/8 sources responding

This distinction is important.

21. You also need a global data-status system

Every page should know:

LIVE
DEGRADED
STALE
OFFLINE
GENERATED TEST

And the visual system should be consistent.

For example:

LIVE
Observed 4 min ago

STALE
Last observed 3h ago

OFFLINE
No successful source response

INSUFFICIENT DATA
Not enough observations

GENERATED TEST
Development-only data

Don't hide this information.

22. Login should become substantially better

I'd change your current login into:

Left
AEROPRICE
INDIA

Real-time airfare intelligence
for India.

Observe.
Measure.
Understand.

────────────────

Government intelligence
Live route intelligence
Price monitoring
Right
Welcome to AeroPrice

Sign in to continue

Work email
[________________]

Password
[________________] 👁

☐ Remember this device

[ SIGN IN ]

Forgot password?

──────── OR ────────

[ Continue with organization SSO ]

[ Email magic link ]

For demo:

DEMO ENVIRONMENT

[ Public Demo ]
[ Subscriber Demo ]
[ Analyst Demo ]
[ Admin Demo ]

This makes it clear that those are demonstration accounts, not role selection.

For accessibility, use properly labelled email/password fields, allow password managers and paste, and provide an accessible authentication path. WCAG 2.2 explicitly addresses accessible authentication and supports properly marked-up email/password fields and mechanisms such as email-link authentication.

23. One very important login-security rule

Do not do this:

user clicks ADMIN
       ↓
frontend sets role = ADMIN

Do:

credentials
     ↓
backend authentication
     ↓
server-side account lookup
     ↓
role
     ↓
signed session/token
     ↓
RBAC middleware

And every protected endpoint checks authorization.

24. Role matrix I want you to implement

This should become a central permission definition in the code.

PUBLIC
├── public.overview
├── public.search
├── public.route
├── public.forecast
└── public.methodology

SUBSCRIBER
├── all public permissions
├── tracking.read
├── tracking.create
├── tracking.delete
├── alerts.read
└── alerts.manage

ANALYST
├── index.read
├── routes.read
├── historical.read
├── forecast.read
├── anomaly.read
├── benchmark.read
├── data_quality.read
├── methodology.read
└── exports.create

ADMIN
├── all analyst permissions
├── sources.read
├── sources.configure
├── collection.run
├── collection.stop
├── routes.configure
├── index.configure
├── forecast.configure
├── users.manage
├── roles.manage
├── audit.read
└── system.configure
25. What is missing at the PRODUCT level

These are the important missing functions I would add:

Data
Real-source registry
Data provenance
Source health
Freshness
Collection runs
Data-quality score
Rejection reasons
Duplicate detection
Staleness detection
Route coverage
Advance-window coverage
Statistical
Route weights
Index version
Base period
Contribution analysis
Route-level index
Regional index
All-India index
Methodology versioning
Backtesting
Forecasting
Forecast interval
Confidence/uncertainty
Model performance
Route-specific accuracy
Insufficient-data handling
Forecast history
Operations
Scheduler
Retry
Failure management
Source disable/enable
Collection logs
Quotas
Latency
Health checks
Security
Authentication
RBAC
Session management
Password reset
MFA/SSO possibility for privileged users
API authorization
Audit logs
Secret management
Public
Search
Current fare
Forecast range
Route trend
Track price
Alerts
Saved routes
Analyst
Index
Route analysis
Regional analysis
Historical data
Advance purchase
Airline comparison
anomalies
forecasts
government benchmark
exports
26. One thing I would NOT add

Don't turn this into:

MakeMyTrip + dashboard + AI chatbot + booking.

That would dilute the SIH problem.

Your core identity should remain:

Airfare measurement and intelligence infrastructure

with a public-facing price intelligence layer on top.

The MoSPI documentation is actually supportive of this direction: the current CPI 2024 framework discusses alternative data sources, online airfare collection and more granular data dissemination.

27. Final architecture

This is the system I would aim for:

                    AEROPRICE INDIA
                           │
             ┌─────────────┴─────────────┐
             │                           │
       DATA PLATFORM              USER PLATFORM
             │                           │
    ┌────────┼────────┐        ┌─────────┼─────────┐
    │        │        │        │         │         │
 Airlines   OTA   Government  Public Subscriber Analyst
    │        │        │
    └────────┼────────┘
             ↓
       SOURCE ADAPTERS
             ↓
       RAW OBSERVATIONS
             ↓
       NORMALIZATION
             ↓
       DATA QUALITY
             ↓
       DEDUPLICATION
             ↓
       VERIFIED FARES
             ↓
    ┌────────┼─────────┐
    │        │         │
   INDEX   ANOMALY   FORECAST
    │        │         │
    └────────┼─────────┘
             ↓
       ANALYTICS API
             ↓
      ┌──────┼───────┐
      │      │       │
    PUBLIC ANALYST  ADMIN
             │
        AUDIT / RBAC