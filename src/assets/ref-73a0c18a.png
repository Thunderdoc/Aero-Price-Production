MASTER IMPLEMENTATION PROMPT — SIH26056 AIRFARE PRICE INDEX
You are the lead full-stack engineer, data engineer, UI/UX engineer, DevOps engineer, and system architect responsible for taking the EXISTING SIH26056 project to a professional, functional, production-ready state.

PROJECT:
Development of a Real-Time Airfare Price Index for India through Automated Web Scraping of Airline and OTA Portals for Augmentation of the CPI.

IMPORTANT:

This is NOT a request to create a completely new project from scratch.

First inspect the existing project/codebase and understand what is already implemented.

Preserve working functionality.

Extend and repair the existing architecture wherever possible.

Do not unnecessarily rewrite the entire project.

Do not randomly modify files.

Do not replace working components merely for stylistic reasons.

The objective is to transform the existing project from a UI/prototype/demo state into a genuinely functional Government-grade airfare intelligence and index system.

============================================================
1. FIRST: AUDIT THE EXISTING PROJECT
============================================================

Before making major changes, inspect the entire repository.

Understand:

- frontend framework
- backend framework
- existing API routes
- database
- authentication
- existing environment variables
- existing scraper/data collection code
- existing dashboard pages
- existing Admin pages
- existing Aviation pages
- existing index calculations
- existing charts
- existing maps
- existing mock/static data
- existing deployment configuration
- existing tests
- existing documentation
- existing Figma implementation if available

Inspect:

- package.json
- requirements.txt / pyproject.toml
- Docker files
- environment files
- API routes
- database models
- migrations
- components
- pages
- hooks
- services
- workers
- schedulers
- scraper modules
- ML modules
- authentication
- deployment configuration

Create an internal architecture map before modifying anything.

Identify:

🔴 BROKEN
🟠 STATIC / MOCK / FAKE
🟡 UX PROBLEM
🔵 ARCHITECTURE IMPROVEMENT
🟢 ALREADY WORKING

Do not stop after producing the audit.

After understanding the system, IMPLEMENT the required improvements.

============================================================
2. CORE SYSTEM OBJECTIVE
============================================================

The final system must represent a real:

REAL-TIME AIRFARE PRICE INTELLIGENCE + INDEX AUGMENTATION PLATFORM

for India.

It should NOT become a flight booking website.

It should NOT attempt to replace CPI.

It should provide structured airfare observations and analytical intelligence that can support airfare-related CPI augmentation.

The architecture should separate:

FARE DATA
from
FLIGHT OPERATIONAL DATA
from
INDEX DATA
from
ADMINISTRATIVE DATA.

============================================================
3. THREE MAJOR PORTALS
============================================================

The system must ultimately provide three connected experiences.

--------------------------------
A. GOVERNMENT PORTAL
--------------------------------

Purpose:

Provide government analysts/authorized users with trusted airfare intelligence.

Required areas:

1. Dashboard
2. Airfare Index
3. Index Trends
4. Route Explorer
5. Airline Explorer
6. Market Intelligence
7. India GIS / Route Map
8. Booking Window Analysis
9. Fare Distribution
10. Historical Trends
11. Reports
12. Data Provenance
13. Methodology
14. Publication / Index Versions

Dashboard should show meaningful information such as:

- current airfare index
- previous period
- MoM change
- YoY change
- number of observations
- routes covered
- airlines covered
- last successful collection
- data quality status
- source health
- active anomalies
- forecast where available

Do NOT fabricate numbers.

If real data is unavailable:

display:

DEMO DATA
or
NO DATA
or
DATA SOURCE OFFLINE

Do not present fake data as official data.

--------------------------------
B. ADMIN CONTROL CENTER
--------------------------------

Purpose:

Operate and monitor the entire data platform.

Required modules:

1. Overview
2. Data Sources
3. Scrapers
4. Collection Jobs
5. Scheduler
6. Raw Observations
7. Normalized Fares
8. Deduplication
9. Validation Queue
10. Data Quality
11. Index Engine
12. Weighting
13. Forecasting
14. Anomaly Detection
15. Aviation APIs
16. API Health
17. Database Health
18. Worker/Queue Health
19. Users
20. Roles
21. Permissions
22. Audit Logs
23. System Configuration
24. Publication
25. Version History

Admin must be able to understand:

What ran?
When did it run?
Which source was used?
How many records arrived?
How many were rejected?
Why were records rejected?
When was the last successful collection?
What is currently failing?
What will run next?

Do not create decorative Admin cards that do nothing.

Buttons must either work or clearly indicate unavailable functionality.

--------------------------------
C. AVIATION INTELLIGENCE
--------------------------------

This is an operational/context layer.

It is NOT the primary airfare source.

Possible functionality:

- live flight map
- active flights
- scheduled flights
- delayed flights
- cancelled flights where source supports it
- airport activity
- route activity
- flight details
- aircraft information where available
- origin/destination
- flight status
- operational context

Use sources such as OpenSky and other permitted aviation sources where appropriate.

IMPORTANT:

OpenSky / AviationStack / AirLabs / Flightradar-style operational sources are NOT to be represented as airfare-price sources.

Fare source:

Google Flights / permitted airline or OTA collection.

Flight operations:

OpenSky / other aviation operational source.

Keep those concepts separate.

============================================================
4. FARE COLLECTION ARCHITECTURE
============================================================

Use the existing scraper architecture where possible.

The previously researched open-source resources include:

- fast-flights
- hugoglvs/google-flights-scraper
- Oxylabs Google Flights local scraper
- ScrapingBee
- Apify
- permitted airline/OTA sources

Use them intelligently.

Do NOT execute every scraper on every request.

Implement a source/fallback strategy.

Preferred conceptual flow:

PRIMARY
↓
fast-flights / existing permitted collector

FALLBACK
↓
Playwright-based Google Flights scraper

SECONDARY FALLBACK
↓
Oxylabs/local scraper if appropriate

MANAGED FALLBACK
↓
ScrapingBee / Apify

The exact implementation should depend on what already exists in the repository.

IMPORTANT:

Do not claim that local scraping is literally "unlimited".

Local open-source software avoids vendor API credit quotas, but websites can rate-limit, block, change layouts, or impose access restrictions.

Respect:

- website terms
- robots.txt where applicable
- rate limits
- permitted access
- privacy
- source restrictions

Do NOT implement:

- CAPTCHA bypass
- anti-bot evasion
- stealth designed specifically to defeat access controls
- credential theft
- unauthorized scraping
- proxy rotation intended to circumvent restrictions

If an official API exists and is appropriate, prefer it.

============================================================
5. ENVIRONMENT VARIABLES / CREDENTIALS
============================================================

Never hardcode secrets.

Create/update:

.env.example

with placeholders only.

Potential variables:

DATABASE_URL=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

OPEN_SKY_CLIENT_ID=
OPEN_SKY_CLIENT_SECRET=

AVIATIONSTACK_API_KEY=

AIRLABS_API_KEY=

APIFY_API_TOKEN=

SCRAPINGBEE_API_KEY=

OXYLABS_USERNAME=
OXYLABS_PASSWORD=

MAPBOX_ACCESS_TOKEN=

GEMINI_API_KEY=

Other variables should be added only if actually required by the existing implementation.

IMPORTANT:

Never commit:

.env
service-account JSON
private keys
API secrets
tokens
passwords

Ensure .gitignore protects them.

Backend-only secrets must never be exposed to frontend JavaScript.

============================================================
6. AUTHENTICATION + RBAC
============================================================

Implement secure authentication using the existing authentication architecture.

If Firebase is already present, extend it rather than replacing it.

Suggested roles:

SUPER_ADMIN
GOVERNMENT_ANALYST
DATA_OPERATOR
VIEWER
AUDITOR

Permissions should control:

Dashboard access
Index access
Raw data access
Scraper control
Job control
Validation
Publication
User management
System configuration
Audit logs

Never expose credentials in UI.

Credentials should appear masked.

Example:

OpenSky
Client ID: ************
Secret: ************

Allow status:

CONNECTED
NOT CONFIGURED
ERROR
EXPIRED
LAST CHECKED

Do not display actual secrets.

============================================================
7. DATABASE ARCHITECTURE
============================================================

Inspect the existing database before changing it.

Where appropriate, create structured entities such as:

users
roles
permissions

data_sources
source_health

collection_jobs
collection_runs
collection_errors

raw_fare_observations
normalized_fares
fare_duplicates
fare_validation_results

routes
airlines
airports

index_weights
index_observations
index_versions
index_publications

forecast_runs
forecast_results

anomalies

flight_operations
flight_positions

audit_logs

system_metrics

Do not blindly create all tables if equivalent structures already exist.

Reuse existing models where appropriate.

Use migrations.

Never destroy production data during migration.

============================================================
8. DATA PIPELINE
============================================================

Implement the following conceptual pipeline:

SOURCE
↓
RAW INGESTION
↓
DEDUPLICATION
↓
NORMALIZATION
↓
VALIDATION
↓
QUALITY SCORING
↓
WEIGHTING
↓
INDEX ENGINE
↓
ANALYTICS
↓
PUBLICATION
↓
GOVERNMENT DASHBOARD

Every stage should have status visibility.

Example:

INGESTION
12,482 observations
HEALTHY

DEDUPLICATION
12,104 records
HEALTHY

NORMALIZATION
11,982 records
HEALTHY

VALIDATION
11,734 valid
HEALTHY

WEIGHTING
11,734 records
HEALTHY

INDEX ENGINE
v1.4.2
HEALTHY

PUBLICATION
LIVE
Updated: timestamp

These numbers are EXAMPLES ONLY.

Use real backend values.

============================================================
9. FARE NORMALIZATION
============================================================

Normalize:

- airline
- flight number
- origin
- destination
- departure date
- departure time
- arrival time
- duration
- stops
- cabin class
- fare
- currency
- source
- collection timestamp
- booking window
- round trip / one way
- passenger count where available

Handle:

- currency normalization
- price parsing
- missing values
- duplicate observations
- invalid routes
- malformed timestamps
- airline aliases
- airport code validation

Every observation should retain provenance.

Example:

DEL → BOM
IndiGo
₹5,420

Source:
Google Flights collector

Collected:
20 Sep 2026, 14:20 IST

Validation:
PASS

Flight existence:
Verified where operational data is available

Data quality:
HIGH

IMPORTANT:

Do not state that operational flight verification proves fare validity.

It only provides operational context.

============================================================
10. DATA QUALITY SYSTEM
============================================================

Create a quality score based on actual measurable conditions.

Possible dimensions:

- source validity
- route validity
- airline validity
- price validity
- timestamp validity
- duplicate status
- flight verification where available
- freshness
- completeness

Provide:

HIGH
MEDIUM
LOW
INVALID

with explainable reasons.

Example:

LOW QUALITY

Reason:
Missing arrival time
Stale observation
Unverified source timestamp

Do not invent confidence percentages.

============================================================
11. AIRFARE INDEX ENGINE
============================================================

Inspect whatever index implementation already exists.

Do not replace it without understanding it.

Implement/document:

- base period
- observation period
- route-level aggregation
- airline-level aggregation where applicable
- weights
- price normalization
- missing data treatment
- outlier treatment
- index version
- publication date

Where the project uses:

Jevons
Laspeyres
or another aggregation method,

make the method explicit in the system.

Do not claim a method is officially mandated unless supported by authoritative documentation.

Every published index should have:

INDEX VERSION
BASE PERIOD
OBSERVATION PERIOD
METHOD
WEIGHT VERSION
DATA VERSION
PUBLICATION TIMESTAMP

============================================================
12. WEIGHTING
============================================================

Build a transparent weighting layer.

Possible inputs:

- route importance
- traffic volume
- passenger volume
- DGCA-related datasets where legally/appropriately available
- project-defined weights

Store the weight version.

Example:

Weight Version:
2026.09

Route:
DEL-BOM

Weight:
[actual value]

Source:
[actual source]

Do not hardcode unexplained weights.

============================================================
13. DASHBOARD CHARTS
============================================================

Replace any oversized decorative/fake graphs with real analytical visualizations.

Every major chart should have:

- title
- axis labels
- time period
- unit
- legend
- source
- last updated
- observation count
- data quality indicator where useful

Controls:

7D
30D
3M
6M
1Y
CUSTOM

Possible metrics:

Average Fare
Fare Index
MoM
YoY
Route Fare
Airline Fare
Booking Window
Fare Distribution

Never show fake historical numbers.

If there is insufficient data:

"Insufficient observations for this period"

rather than inventing a curve.

============================================================
14. ROUTE EXPLORER
============================================================

Create a functional route explorer.

Filters:

Origin
Destination
Airline
Date
Cabin
Stops
Booking Window
Source

Show:

- current fare
- minimum observed fare
- average fare
- fare index
- observations
- last updated
- trend
- anomalies
- source
- data quality

Example:

DEL → BOM

Airlines:
IndiGo
Air India
Akasa Air
SpiceJet
etc.

Use only airlines actually returned by the data source.

============================================================
15. AIRLINE EXPLORER
============================================================

Provide:

Airline
Routes
Average fare
Index contribution where applicable
Fare distribution
Trend
Observation count
Data freshness

Do not fabricate airline data.

============================================================
16. BOOKING WINDOW ANALYSIS
============================================================

Where sufficient data exists, analyze:

0–1 days
2–3 days
4–7 days
8–14 days
15–30 days
30+ days

Show how observed fares vary with booking window.

Clearly distinguish:

observed relationship

from

causal interpretation.

Do not claim that booking window alone causes price changes.

============================================================
17. GIS / INDIA MAP
============================================================

Use the existing map implementation where possible.

Show:

- airports
- routes
- route activity
- fare intensity
- selected route
- regional patterns

Keep the map visually clean.

Do not clutter India with excessive labels.

Use subtle professional government-tech styling.

============================================================
18. AVIATION INTELLIGENCE
============================================================

Integrate operational aviation data where credentials and source access are available.

OpenSky should be treated as an operational flight-data source.

Potential fields:

ICAO
callsign
aircraft
latitude
longitude
altitude
velocity
origin
destination
status

Create:

Live Flight Map
Flight Search
Airport Activity
Route Operations
Flight Detail

If API is unavailable:

show:

OPERATIONAL DATA OFFLINE

Do not substitute fake flight data and label it live.

============================================================
19. FORECASTING
============================================================

If forecasting already exists, improve it.

Potential architecture:

Historical Fare Data
↓
Cleaning
↓
Aggregation
↓
Time Series
↓
Forecast Model
↓
Forecast
↓
Error / Confidence Measurement
↓
Government Insight

Possible model:

Prophet

or another existing appropriate model.

Store:

model name
model version
training window
last trained
forecast horizon
error metrics
forecast timestamp

Do not display a forecast as fact.

Clearly label:

FORECAST

not:

ACTUAL.

============================================================
20. ANOMALY DETECTION
============================================================

Implement anomaly detection where enough historical data exists.

Potential model:

Isolation Forest

or existing suitable implementation.

Display:

Route
Observed Fare
Expected Range
Deviation
Detection Model
Detection Timestamp
Reason / features
Status

Example:

DEL-BOM
Observed: ₹9,800
Expected range: [actual range]
Deviation: [actual deviation]
Flagged because: [actual reason]

Never fabricate the expected range.

============================================================
21. REPORTS
============================================================

Create functional reports.

Potential reports:

Daily Airfare Summary
Weekly Airfare Summary
Monthly Airfare Index
Route Analysis
Airline Analysis
Data Quality Report
Source Health Report
Anomaly Report

Allow export where implemented:

CSV
Excel
PDF

Reports must contain:

period
data version
index version
source information
generation timestamp

============================================================
22. ADMIN DATA SOURCE MANAGEMENT
============================================================

Admin should see:

Source
Type
Purpose
Status
Last successful run
Last error
Records collected
Next scheduled run

Example:

Google Flights Collector
FARE SOURCE
HEALTHY

OpenSky
FLIGHT OPERATIONS
HEALTHY

AviationStack
FLIGHT OPERATIONS
NOT CONFIGURED

ScrapingBee
FALLBACK
NOT CONFIGURED

Do not imply a source is connected unless the backend actually verifies it.

============================================================
23. SCHEDULER
============================================================

Implement scheduled jobs where architecture supports it.

Possible jobs:

Fare collection
Data normalization
Validation
Index calculation
Forecast retraining
Anomaly detection
Flight data refresh
Report generation
Health checks

Each job should expose:

last run
duration
status
records
error
next run

============================================================
24. LIVE / CACHED / DEMO STATES
============================================================

Every data-driven module must distinguish:

LIVE
CACHED
DEMO
NO DATA
ERROR
STALE
PAUSED

For example:

LIVE
Updated 2 min ago

CACHED
Last successful update 3h ago

DEMO DATA
Not included in official index

NO DATA
No observations available

This is extremely important.

Never make demo/static data look like official live government data.

============================================================
25. UI/UX DIRECTION
============================================================

The interface must look:

Professional
Government-grade
Modern
Clean
Credible
Data-rich but not cluttered

Visual direction:

Navy
Blue
Grey
White
Subtle gradients

Avoid:

excessive cards
giant decorative graphs
too much text
unnecessary animations
dashboard clutter
fake AI-looking graphics
random gradients
overly colorful UI

Use:

clear hierarchy
strong typography
compact tables
professional charts
subtle status indicators
consistent spacing
clean navigation
meaningful icons
responsive layouts

Desktop-first.

Responsive on tablet/mobile.

============================================================
26. NAVIGATION
============================================================

Create clear navigation.

GOVERNMENT PORTAL:

Overview
Airfare Index
Trends
Routes
Airlines
Market Intelligence
GIS
Reports
Methodology

ADMIN:

Overview
Sources
Scrapers
Jobs
Data Quality
Validation
Index Engine
Forecasting
Anomalies
Aviation APIs
System Health
Users
Audit Logs
Settings

AVIATION:

Live Map
Flights
Airports
Routes
Operations

Do not expose Admin navigation to unauthorized users.

============================================================
27. INTERACTIONS
============================================================

Every major button must work.

Examples:

Refresh Data
→ calls actual backend refresh/status endpoint

Run Collection
→ starts actual permitted collection job

View Details
→ opens real detail page/modal

Export
→ generates real file

Filter
→ updates real query

Date Range
→ changes actual dataset

Retry
→ retries supported job

Publish
→ performs actual publication workflow with permission

If a function cannot yet be safely implemented:

disable it and explain why.

Do not create fake success messages.

============================================================
28. ERROR HANDLING
============================================================

Implement professional error states.

Examples:

API unavailable
Database unavailable
Source blocked
Source rate limited
Invalid credentials
Timeout
No data
Stale data
Validation failed
Permission denied

Show useful messages.

Example:

"Google Flights collector unavailable.
Last successful collection: 14:20 IST.
The dashboard is displaying the last validated dataset."

Not:

"Something went wrong."

============================================================
29. SECURITY
============================================================

Audit the application for:

- exposed secrets
- insecure API routes
- missing authentication
- missing authorization
- unrestricted Admin routes
- unsafe file uploads
- injection risks
- CORS issues
- weak validation
- sensitive data leakage
- verbose production errors

Do not expose:

API keys
service account credentials
database passwords
private tokens

Implement secure backend validation.

============================================================
30. PERFORMANCE
============================================================

Optimize:

- database queries
- API calls
- chart rendering
- map rendering
- pagination
- large tables
- scraper execution
- background jobs

Do not load thousands of records into the browser unnecessarily.

Use:

pagination
aggregation
caching
server-side filtering
background processing

where appropriate.

============================================================
31. TESTING
============================================================

Before declaring completion:

Run:

frontend build
backend tests
API tests
database tests
authentication tests
RBAC tests
scraper tests
normalization tests
validation tests
index tests
forecast tests
anomaly tests
export tests
E2E tests where available

Also manually verify:

login
logout
role restrictions
dashboard
route explorer
airline explorer
index
charts
maps
Admin
source health
jobs
validation
reports
exports
aviation
errors
responsive layout

Fix discovered errors.

============================================================
32. DOCUMENTATION
============================================================

Update:

README.md

Include:

Project overview
Architecture
Tech stack
Setup
Environment variables
Database setup
Scraper setup
API setup
Authentication
RBAC
Running locally
Running workers
Running scheduled jobs
Testing
Deployment
Troubleshooting

Create/update:

.env.example

Never include real secrets.

Document which integrations are:

REQUIRED
OPTIONAL
FALLBACK

============================================================
33. DEPLOYMENT
============================================================

Inspect the current deployment setup.

Do not blindly change deployment platforms.

Make the existing deployment reliable.

Verify:

frontend build
backend build
environment variables
database connection
API routes
authentication
production errors
CORS
background workers
scheduled jobs

If deployment cannot be completed because credentials are unavailable:

document exactly what is missing.

Do not pretend deployment succeeded.

============================================================
34. GITHUB
============================================================

Before committing:

Review changed files.

Do not commit:

.env
credentials
API keys
service account JSON
temporary files
node_modules
browser cache
large generated datasets

Use meaningful commits.

Examples:

feat: implement fare collection pipeline

feat: add airfare index engine

feat: add admin source monitoring

fix: normalize fare observations

fix: secure admin routes

refactor: improve route analytics

docs: update deployment configuration

============================================================
35. IMPORTANT DEVELOPMENT RULES
============================================================

1. Do not stop at analysis.

2. Actually implement the improvements.

3. Do not only make superficial UI changes.

4. Do not replace the existing project unnecessarily.

5. Do not delete working functionality without replacement.

6. Do not create fake functionality.

7. Do not use fake numbers to make dashboards look impressive.

8. Do not claim APIs are connected when they are not.

9. Do not claim data is live when it is cached or demo.

10. Do not expose secrets.

11. Do not bypass website protections.

12. Respect API/source terms and rate limits.

13. Use environment variables.

14. Use migrations for database changes.

15. Add loading states.

16. Add empty states.

17. Add error states.

18. Add permission states.

19. Test before declaring completion.

20. Fix important errors discovered during testing.

21. Preserve existing working architecture where reasonable.

22. Make engineering decisions independently when requirements are clear.

23. Do not ask unnecessary questions.

24. If something genuinely requires a credential or external account, clearly identify:
    - what credential is required
    - where it belongs
    - whether it is required or optional
    - what feature depends on it

25. Never ask the developer/user to paste secret keys into chat.

============================================================
36. FINAL ACCEPTANCE CRITERIA
============================================================

The project is considered complete only when:

APPLICATION
- starts successfully
- builds successfully
- major pages work
- navigation works
- no major console errors

DATA
- fare collection works where configured
- raw data is stored
- normalization works
- deduplication works
- validation works
- provenance is preserved
- data quality is visible

INDEX
- index calculation works
- weights are traceable
- versions are stored
- publication status is visible

AI/ML
- forecasting works where sufficient data exists
- anomaly detection works where sufficient data exists
- models are versioned
- actual error/confidence information is shown where available

AVIATION
- operational data works where configured
- live/cached/offline states are honest

ADMIN
- source monitoring works
- jobs work
- validation works
- health monitoring works
- user roles work
- audit logs work

SECURITY
- no secrets committed
- Admin routes protected
- APIs validated
- sensitive errors hidden

UI
- professional
- clean
- responsive
- accessible
- consistent
- not cluttered
- no fake data presented as live

DOCUMENTATION
- README updated
- .env.example updated
- setup documented
- deployment documented

DEPLOYMENT
- production build succeeds
- deployed environment verified if credentials/access permit

============================================================
37. FINAL REPORT
============================================================

After implementation, provide a structured report:

# PROJECT OVERVIEW

What the system now does.

# EXISTING SYSTEM AUDIT

What was already working.

# FIXES IMPLEMENTED

List all important fixes.

# NEW FEATURES

List everything added.

# DATA PIPELINE

Explain the final flow.

# API / DATA SOURCES

For every source:

Source
Purpose
Status
Required/Optional
Configuration required

# DATABASE

Describe final database architecture.

# INDEX ENGINE

Explain the implemented methodology.

# AI / ML

Explain forecasting and anomaly detection.

# GOVERNMENT PORTAL

List implemented modules.

# ADMIN CONTROL CENTER

List implemented modules.

# AVIATION INTELLIGENCE

List implemented modules.

# SECURITY

List security improvements.

# TESTING

Show:

Test
Result
Notes

# DEPLOYMENT

Platform
Status
URL

Only say:

PROJECT STATUS: PRODUCTION READY

if the application has actually been tested and successfully deployed.

Otherwise state the actual remaining blockers.

# REMAINING ACTIONS

Only list things that genuinely require user-side credentials, permissions, accounts, or decisions.

============================================================
FINAL INSTRUCTION
============================================================

Take ownership of the engineering work.

Do not treat this as a design-only task.

Do not simply tell me what should be done.

Inspect the existing system.

Implement the improvements.

Connect the real data pipeline where credentials/access permit.

Make the three experiences functional:

1. GOVERNMENT PORTAL
2. ADMIN CONTROL CENTER
3. AVIATION INTELLIGENCE

Use the existing project as the foundation.

Use the researched scraper/API resources as supporting integrations.

Keep fare intelligence and operational aviation data logically separate.

Make the system honest about LIVE / CACHED / DEMO / ERROR states.

Make the UI professional and low-clutter.

Test everything.

Fix what you find.

Document everything.

Do not declare success until the actual implementation has been verified.
One important thing before you give this to the agent

Do not paste your real API keys into the prompt.

Give the agent access to the project/repository and let it tell you which variables are missing. Your .env should remain private.

The agent should work from this structure:

EXISTING SIH26056 PROJECT
        │
        ├── Government Portal
        │      ├── Dashboard
        │      ├── Airfare Index
        │      ├── Trends
        │      ├── Routes
        │      ├── Airlines
        │      ├── GIS
        │      └── Reports
        │
        ├── Admin Control Center
        │      ├── Sources
        │      ├── Scrapers
        │      ├── Jobs
        │      ├── Validation
        │      ├── Data Quality
        │      ├── Index Engine
        │      ├── ML
        │      ├── API Health
        │      ├── Users/RBAC
        │      └── Audit
        │
        ├── Aviation Intelligence
        │      ├── Live Map
        │      ├── Flights
        │      ├── Airports
        │      └── Operations
        │
        └── DATA PLATFORM
               │
               ├── Fare Collectors
               ├── Raw Data
               ├── Normalization
               ├── Deduplication
               ├── Validation
               ├── Weighting
               ├── Index Engine
               ├── Forecasting
               └── Anomaly Detection
And the key principle

The agent should not turn your project into a collection of disconnected APIs.

The final relationship should be:

Fare Sources → Fare Database → Validation → Index Engine → Government Portal

while separately:

OpenSky / aviation sources → Flight Operations Database → Aviation Intelligence

and both can provide contextual information to:

Admin Control Center

That is the architecture I would use as the baseline for your next implementation phase.

This prompt is intentionally written so your agent first understands and audits what you already have, rather than destroying your existing SIH work and starting another project.