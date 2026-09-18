============================================================
AEROPRICE INDIA — SIH26056
PREMIUM UI/UX REDESIGN MASTER PROMPT
============================================================

You are an elite product designer, UI/UX architect, frontend designer,
motion designer, data-visualization designer and design-system engineer.

You are redesigning the EXISTING SIH26056 project:

"A Real-Time Airfare Price Index for India through Automated Web Scraping
of Airline and Online Travel Aggregator Portals for Augmentation of the CPI."

PROJECT NAME:

AEROPRICE INDIA

TAGLINE:

"India's Airfare Intelligence Layer"

Alternative supporting line:

"From live fare observations to a transparent national airfare index."

============================================================
CORE DESIGN OBJECTIVE
============================================================

The current application is functional but its UI/UX feels:

- dull
- generic
- difficult to understand
- overly dashboard-like
- insufficiently visual
- insufficiently polished
- not memorable for an SIH presentation

Completely redesign the UI/UX.

DO NOT simply change the colors.

DO NOT just add gradients.

DO NOT add random animations.

DO NOT create a generic SaaS dashboard.

DO NOT make it look like MakeMyTrip, Cleartrip, Google Flights,
a banking dashboard, or a generic AI dashboard.

The final product should feel like a combination of:

NATIONAL STATISTICAL INTELLIGENCE PLATFORM
+
AVIATION MARKET INTELLIGENCE
+
MODERN DATA VISUALIZATION
+
PREMIUM GOVERNMENT TECHNOLOGY PRODUCT

The interface must be:

MODERN
PREMIUM
INTELLIGENT
CLEAR
DATA-DRIVEN
TRUSTWORTHY
FAST
ANIMATED
ACCESSIBLE
RESPONSIVE

============================================================
MOST IMPORTANT UX PRINCIPLE
============================================================

A user should understand the platform within 10 seconds.

The first question the interface must answer:

"WHAT IS HAPPENING TO AIRFARES IN INDIA?"

Then:

"WHERE IS IT HAPPENING?"

Then:

"HOW MUCH HAS IT CHANGED?"

Then:

"WHEN WAS IT MEASURED?"

Then:

"WHERE DID THE DATA COME FROM?"

Then:

"HOW RELIABLE/FRESH IS IT?"

Every major screen must communicate:

WHAT
WHERE
WHEN
HOW MUCH
SOURCE
FRESHNESS
QUALITY

============================================================
TWO EXPERIENCES IN ONE PLATFORM
============================================================

The application serves two audiences.

PRIMARY:

Government / Statistical Analyst

SECONDARY:

Public / Traveler / Researcher

Do NOT mix both experiences into one confusing dashboard.

Create a clear product architecture:

PUBLIC INTELLIGENCE
and
GOVERNMENT INTELLIGENCE

Both use the same underlying data platform.

============================================================
GLOBAL VISUAL LANGUAGE
============================================================

Create a completely new design system.

Use:

- premium typography
- strong visual hierarchy
- large meaningful numbers
- precise spacing
- elegant borders
- subtle shadows
- high-quality charts
- map-centric visualization
- clear tables
- strong empty states
- polished loading states
- excellent hover states
- smooth transitions
- restrained gradients
- professional iconography

Do NOT overuse:

- glassmorphism
- glowing cards
- neon purple
- neon blue
- excessive rounded rectangles
- huge shadows
- decorative illustrations
- unnecessary 3D
- meaningless AI effects

The design should feel credible enough for a government statistical platform.

============================================================
COLOR SYSTEM
============================================================

Use semantic colors.

RED:
Airfare increase

GREEN:
Airfare decrease

AMBER:
Stable / uncertain / insufficient confidence

BLUE:
Information / official/reference data

GRAY:
Unavailable / stale / inactive

Do not use color as the only signal.

Always combine colors with:

icons
arrows
labels
text
status badges

============================================================
MOTION DESIGN
============================================================

The website must feel alive.

Use purposeful animation.

Examples:

1. Hero index number smoothly counts from previous value to current value.

2. Map corridors animate subtly when data updates.

3. Route selection transitions smoothly.

4. Charts draw/transition when loaded.

5. KPI cards fade/slide into view.

6. Data freshness indicator pulses subtly.

7. Source status changes animate.

8. Forecast range expands smoothly.

9. Navigation transitions smoothly.

10. Modal/panel transitions should feel natural.

11. Hovering over a corridor should highlight the route.

12. Route map arcs should animate very subtly.

DO NOT use excessive animation.

Animations must never interfere with reading data.

Respect:

prefers-reduced-motion

============================================================
APP SHELL
============================================================

Create a premium application shell.

Desktop navigation:

AEROPRICE INDIA
--------------------------------

Overview
Airfare Map
Route Explorer
Market Insights
Government Intelligence
Data Sources
Collection
Methodology
Exports

--------------------------------

System status

User profile / role

For public users:

Overview
Map
Routes
Track Prices

For analysts:

Government Intelligence
Benchmarks
Weights
Data Quality
Sources
Collection
Methodology
Exports

For admins:

System
Source Management
Collector Controls
Audit

============================================================
LANDING / OVERVIEW PAGE
============================================================

This is the most important screen.

It should immediately communicate:

AIRFARE PRICE INTELLIGENCE
INDIA

Hero section:

------------------------------------------------------------

AIRFARE PRICE INDEX — INDIA

"Real-time observations of domestic airfare movement,
transformed into transparent statistical intelligence."

[ View India Map ]
[ Explore a Route ]

------------------------------------------------------------

Large index number:

115.85

BUT:

DO NOT hard-code this value.

Read dynamically from the API.

Below:

+X.XX% · 7 DAYS

+X.XX% · 30 DAYS

Base: 100

Last updated:
XX minutes ago

Status:

LIVE
or
CERTIFIED
or
SAMPLE DATA

depending on actual backend state.

============================================================
LIVE STATUS BAR
============================================================

Create a beautiful status strip:

● COLLECTION ACTIVE

12 corridors
21,035 observations
X sources
Last successful collection:
XX minutes ago

Again:

DO NOT hard-code these values.

Everything must come from the API.

============================================================
NATIONAL AIRFARE MAP
============================================================

This should be one of the visual centerpieces.

Display India map.

Show monitored airport/city corridors.

Animated route lines.

Route colors:

GREEN
decreasing

RED
increasing

AMBER
stable/uncertain

GRAY
insufficient data

When user hovers:

DEL → BOM

Current:
₹X,XXX

7D:
+X.X%

Freshness:
X min

Clicking opens Route Intelligence.

Add:

zoom
pan
reset
route filtering

Do NOT make the map decorative.

It must be analytically useful.

============================================================
MARKET MOVEMENT SECTION
============================================================

Title:

"Where airfare is moving"

Create two analytical panels:

AIRFARES RISING

AIRFARES FALLING

Each corridor:

DEL → BOM
+X.X%

DEL → BLR
+X.X%

etc.

Use actual data.

Click → Route Explorer.

============================================================
BOOKING WINDOW VISUALIZATION
============================================================

Create a visually excellent chart:

"How advance booking changes airfare"

X axis:

T+1
T+7
T+15
T+30
T+45

Y axis:

Observed Fare

Show:

median
range
sample size

Use an elegant curve.

Explain in simple language:

"Earlier booking generally changes the observed fare profile.
This curve shows how fare levels vary by advance-purchase window."

Do not claim causal relationships.

============================================================
REGIONAL AIRFARE INDEX
============================================================

Create:

NORTH
SOUTH
WEST
EAST

ONLY if the route-to-region methodology actually supports these groupings.

Show:

index
7D movement
30D movement
coverage

Interactive.

Click region → region intelligence.

============================================================
PUBLIC USER FLOW
============================================================

Create a prominent public search experience.

Headline:

"Check how airfare is moving."

Inputs:

FROM
TO
TRAVEL DATE

Button:

CHECK AIRFARE INTELLIGENCE

Do NOT call this:

"Book Flight"

Do NOT create booking checkout.

============================================================
PUBLIC ROUTE RESULT
============================================================

Example structure:

DEL → BOM

Travel:
25 Sep 2026

------------------------------------------------

CURRENT OBSERVED FARE

₹4,850

Observed:
18 minutes ago

------------------------------------------------

PRICE MOVEMENT

↑ Increasing

+4.2% over recent period

------------------------------------------------

EXPECTED RANGE

₹4,700 — ₹5,200

Forecast:
7 days

------------------------------------------------

BOOKING WINDOW

T+1
₹X

T+7
₹X

T+15
₹X

T+30
₹X

T+45
₹X

------------------------------------------------

SOURCES

3 airlines
2 permitted OTA sources

------------------------------------------------

[ TRACK PRICE ]

All values must be dynamically generated.

============================================================
TRACK PRICE UX
============================================================

Create a beautiful Track Price interaction.

Button:

TRACK PRICE

Panel:

Route
Travel date
Optional threshold

Notification preference

Enable tracking.

Status:

TRACKING ACTIVE

Show:

Current price
Previous observed price
Last change
Last checked

Possible alert states:

PRICE DROPPED
PRICE INCREASED
PRICE CHANGED
FORECAST CHANGED
DATA STALE

============================================================
ROUTE EXPLORER
============================================================

Create a premium analytical route page.

Header:

DEL → BOM

Current observed fare
Trend
Freshness
Coverage

Tabs:

OVERVIEW
PRICE HISTORY
BOOKING WINDOWS
AIRLINES
FORECAST
ANOMALIES
SOURCES

============================================================
ROUTE OVERVIEW
============================================================

Show:

Current fare
7-day movement
30-day movement
Observed range
Number of observations
Airlines observed
Sources
Freshness

Use visual hierarchy.

Do not create 15 equal-sized cards.

The most important metric must visually dominate.

============================================================
PRICE HISTORY
============================================================

Create:

7D
30D
90D

Interactive line chart.

Allow:

airline comparison
median
range
observations

Tooltips must show:

date
fare
carrier
source
observation count

============================================================
AIRLINE COMPARISON
============================================================

Show carriers as comparable series.

Example:

IndiGo
Air India
Air India Express
Akasa Air
SpiceJet

Only show carriers with actual observations.

Do not fabricate missing airlines.

============================================================
FORECAST UI
============================================================

Do not show fake precision.

Show:

EXPECTED DIRECTION

Increasing

EXPECTED RANGE

₹X,XXX — ₹X,XXX

Forecast horizon:

2 days
7 days
14 days

If uncertainty is high:

"Forecast uncertainty is high."

Explain:

"Forecasts are statistical estimates based on observed platform data."

============================================================
ANOMALY UI
============================================================

Show:

UNUSUAL PRICE MOVEMENT

Observed:
₹X

Expected:
₹X–₹X

Anomaly:
High

Method:
MAD-based detection

Possible driver:
"Possible driver: short-term supply/availability movement."

Never state unsupported causes.

============================================================
DATA SOURCE PROVENANCE
============================================================

This is a major differentiator.

Every important metric/chart must have:

ⓘ Data source

Click opens provenance panel.

Example:

SOURCE

IndiGo

COLLECTED

18 Sep 2026 · 21:42 IST

TRAVEL DATE

25 Sep 2026

ADVANCE

T+7

FARE

₹4,850

COLLECTOR

Playwright

STATUS

LIVE

PUBLICATION

publication-id

This creates trust.

============================================================
DATA FRESHNESS
============================================================

Every live screen should display freshness.

Examples:

LIVE
Observed 4 min ago

FRESH
Observed 21 min ago

AGING
Observed 2h ago

STALE
Observed 9h ago

FAILED
Last successful observation:
yesterday

SAMPLE DATA
Deterministic demonstration dataset

OFFICIAL REFERENCE
Government-published data

Never display LIVE unless the backend confirms it.

============================================================
GOVERNMENT INTELLIGENCE
============================================================

This should be a completely different analytical experience.

Title:

GOVERNMENT AIRFARE INTELLIGENCE

Subtitle:

"High-frequency airfare observations for statistical analysis,
benchmarking and early market visibility."

Sections:

NATIONAL INDEX
REGIONAL INDEX
CORRIDORS
BOOKING WINDOWS
WEIGHTS
DATA QUALITY
BENCHMARKS
PROVENANCE
METHODOLOGY

============================================================
GOVERNMENT KPI HEADER
============================================================

Show:

ALL-INDIA INDEX

7D CHANGE

30D CHANGE

OBSERVATIONS

CORRIDORS

SOURCES

FRESHNESS

No hard-coded values.

============================================================
INDEX HIERARCHY
============================================================

Visual hierarchy:

ALL INDIA
↓
REGIONS
↓
CORRIDORS
↓
CARRIERS

Make it easy to drill down.

============================================================
WEIGHTS SCREEN
============================================================

Show route weights.

Columns:

Route
Weight
Source
Version
Effective date

Explain:

"Route weights are methodology inputs and should be traceable to
documented traffic/reference sources."

Do not fabricate weights.

============================================================
BENCHMARK SCREEN
============================================================

Create:

OUR AIRFARE INDEX

versus

OFFICIAL REFERENCE DATA

Show:

time period
reference series
coverage
methodology

Charts:

monthly comparison
backtest
directional comparison

Any correlation/MAPE must be dynamically calculated.

Never hard-code benchmark statistics.

============================================================
DATA QUALITY SCREEN
============================================================

Create a visual data-quality dashboard.

Show:

Valid observations
Rejected observations
Duplicates
Missing fares
Outliers
Stale sources
Source failures
Low coverage

Use:

quality score

ONLY if the score has a documented calculation.

============================================================
DATA SOURCES SCREEN
============================================================

Create a premium source registry.

Each source row:

Source
Organization
Type
Status
Last success
Next run
Frequency
Records
Latency

Status examples:

LIVE
HEALTHY
AGING
STALE
FAILED
NOT CONFIGURED

Government source types:

PUBLIC API
PUBLIC DATASET
PUBLIC PDF
OFFICIAL REFERENCE
AUTHENTICATED

Airfare sources:

AIRLINE
OTA
OTHER PERMITTED SOURCE

============================================================
GOVERNMENT DATA ACCESS UX
============================================================

The UI must clearly answer:

"How does this platform obtain government data?"

Create a source detail panel.

Show:

SOURCE URL

ACCESS METHOD

PUBLIC / AUTHENTICATED

API KEY:

REQUIRED / NOT REQUIRED / NOT CONFIGURED

FORMAT:

JSON / CSV / XLSX / PDF / HTML

UPDATE FREQUENCY

LAST RETRIEVAL

LAST SUCCESS

RECORDS

PROVENANCE

If an API key is required but unavailable:

show:

NOT CONFIGURED

Do not show:

LIVE

Do not fabricate government data.

============================================================
COLLECTION OPERATIONS
============================================================

Create a professional operations console.

Show:

COLLECTORS

ACTIVE
PAUSED
FAILED

Last run

Next run

Success rate

Records collected

Records rejected

Average latency

Rate-limit events

Challenge events

Errors

Buttons:

RUN NOW
PAUSE
RESUME
VIEW LOGS

Buttons must work.

============================================================
HOURLY COLLECTION UI
============================================================

Make the collection frequency visible.

Example:

AIRFARE SOURCES

Collection target:
Hourly

Next collection:
14:00 IST

Last successful:
13:02 IST

Freshness:
58 min

Do NOT say:

"No flight will ever be missed."

Instead say:

"Hourly polling provides high-frequency observations.
Individual price changes may occur between observations."

This distinction is important.

============================================================
METHODOLOGY UI
============================================================

Make methodology visually understandable.

Create an interactive pipeline:

SOURCE
↓
COLLECTION
↓
RAW DATA
↓
VALIDATION
↓
CLEANING
↓
NORMALIZATION
↓
MATCHING
↓
BOOKING WINDOWS
↓
ROUTE WEIGHTS
↓
JEVONS
↓
REGIONAL INDEX
↓
ALL-INDIA INDEX
↓
FORECAST
↓
ANOMALY
↓
PUBLICATION

Each stage should be clickable.

Clicking a stage opens:

What happens?
Input
Output
Quality checks
Method
Limitations

============================================================
STATISTICAL FORMULAS
============================================================

Use clean mathematical presentation.

Explain:

Jevons index

Laspeyres/experimental weighted relative index

Route aggregation

Booking-window statistics

MAD anomaly detection

Forecast methodology

Do not overwhelm public users.

Methodology is primarily for analyst/government users.

============================================================
AI INSIGHTS UI
============================================================

Keep the grounded Q&A interface.

Design it as:

ASK AIRFARE INTELLIGENCE

Example questions:

"Which corridors increased most this week?"

"How did T+1 fares change?"

"Which regions show the strongest movement?"

"What happened to DEL-BOM?"

Answers must include:

ANSWER

DATA USED

SOURCE

TIME PERIOD

COVERAGE

The AI must never invent data.

============================================================
EXPORT CENTER
============================================================

Create:

DOWNLOAD DATA

CSV
JSON
PDF BULLETIN

Each export should show:

Publication ID
Timestamp
Data version
Method version
Quality status

============================================================
LOGIN / ACCESS
============================================================

Create a polished role-aware authentication experience.

Roles:

PUBLIC
ANALYST
ADMIN

Do not make public users log in just to explore basic airfare intelligence.

Analyst/admin areas should be protected.

============================================================
ADMIN EXPERIENCE
============================================================

Admin interface should NOT visually dominate the public product.

Admin pages:

Source Management
Collector Controls
System Health
Audit Logs
Configuration

Use a professional operations-console style.

============================================================
EMPTY STATES
============================================================

Every screen must have a useful empty state.

Example:

NO LIVE OBSERVATIONS

"The selected source has not returned a successful observation yet."

Buttons:

VIEW SOURCE
VIEW LAST CERTIFIED DATA

Never leave blank white/gray areas.

============================================================
ERROR STATES
============================================================

Create beautiful error states.

Examples:

SOURCE UNAVAILABLE

"Live data from this source could not be retrieved."

Show:

Last successful observation
Retry
Source status

Do not show technical stack traces to normal users.

============================================================
LOADING STATES
============================================================

Use skeleton loaders.

Avoid giant spinners.

Charts should have chart-specific skeletons.

Map should have map skeleton.

Tables should have row skeletons.

============================================================
RESPONSIVE DESIGN
============================================================

Optimize separately for:

1920px
1440px
1280px
1024px
768px
mobile

Desktop:

Government analytics first.

Mobile:

Public route intelligence first.

Do not merely shrink desktop.

Reorganize content.

============================================================
ACCESSIBILITY
============================================================

Implement:

ARIA labels
keyboard navigation
visible focus states
semantic HTML
high contrast
screen reader descriptions
non-color status indicators

Respect:

prefers-reduced-motion

============================================================
DESIGN SYSTEM
============================================================

Create reusable tokens:

colors
typography
spacing
radius
shadows
motion
breakpoints
chart styles
status styles

Create reusable components:

Metric
TrendIndicator
StatusBadge
DataFreshness
SourceBadge
ChartCard
MapLegend
RouteCard
DataTable
ProvenancePanel
MethodologyStep
EmptyState
ErrorState
LoadingState
Modal
Drawer
FilterBar
DateSelector
RouteSelector

Do not duplicate UI patterns.

============================================================
CHART DESIGN
============================================================

Charts must be analytical.

Every chart needs:

title
subtitle/context
axis labels
tooltip
legend if required
source
time period
empty state

Avoid unnecessary chart junk.

Charts must remain readable in dark and light modes.

============================================================
TABLE DESIGN
============================================================

Tables should support:

sorting
filtering
pagination

Use sticky headers where appropriate.

Important values should have visual hierarchy.

Do not create giant unstructured tables.

============================================================
MICROINTERACTIONS
============================================================

Add subtle professional interactions:

button hover
route hover
chart point hover
map corridor hover
tab transition
filter transition
drawer transition
status update
data refresh

Animations should feel:

FAST
SMOOTH
PURPOSEFUL

Not flashy.

============================================================
PERFORMANCE
============================================================

Do not sacrifice performance for animation.

Lazy-load:

maps
heavy charts
admin pages
exports
advanced analytics

Avoid unnecessary re-renders.

Use existing Recharts optimization.

============================================================
NO FAKE DATA
============================================================

CRITICAL:

Never hard-code:

index values
fare values
observation counts
anomaly counts
forecast values
benchmark values
source status
freshness

The UI must consume the API.

If sample data is being used, visibly label:

SAMPLE / DETERMINISTIC DATA

If official data is used:

OFFICIAL REFERENCE DATA

If live airfare data is successfully retrieved:

LIVE

============================================================
NO FAKE LIVE STATUS
============================================================

Do not display:

LIVE STREAM ACTIVE

unless a real source has successfully returned data.

Use:

CERTIFIED BASELINE

when appropriate.

Use:

SAMPLE DATA

for deterministic data.

Use:

SOURCE UNAVAILABLE

when live retrieval failed.

============================================================
SIH JUDGE EXPERIENCE
============================================================

Design a perfect 3-minute demonstration flow.

STEP 1

Landing page:

AIRFARE PRICE INDEX — INDIA

STEP 2

Scroll to:

India Airfare Movement Map

STEP 3

Click:

DEL → BOM

STEP 4

Show:

Current fare

Trend

Freshness

STEP 5

Show:

T+1
T+7
T+15
T+30
T+45

STEP 6

Show:

Forecast range

STEP 7

Show:

Anomaly

STEP 8

Open:

Data Source / Provenance

STEP 9

Switch:

Government Intelligence

STEP 10

Show:

All-India Index

Route weights

Benchmark

Data quality

STEP 11

Open:

Methodology

STEP 12

Export:

PDF bulletin

The judge should understand the complete story without needing a long
verbal explanation.

============================================================
FINAL VISUAL TARGET
============================================================

The final product should create this impression:

"India's airfare market is being continuously observed,
cleaned, statistically analyzed and transformed into a transparent
national airfare intelligence layer."

It should look:

PREMIUM
NATIONAL
STATISTICAL
TECHNICAL
TRUSTWORTHY
MODERN

============================================================
DO NOT
============================================================

Do NOT:

- rebuild backend
- change database unnecessarily
- create a flight booking system
- add checkout
- fabricate live data
- fabricate government data
- fabricate API keys
- fabricate benchmark statistics
- use fake government logos
- claim government endorsement
- create meaningless charts
- overuse gradients
- overuse glassmorphism
- use excessive animations
- use generic stock images
- hard-code dashboard numbers
- call sample data LIVE
- hide data provenance
- hide freshness
- hide data limitations

============================================================
IMPLEMENTATION INSTRUCTIONS
============================================================

FIRST:

Inspect the existing frontend.

Identify:

- all pages
- all routes
- components
- API calls
- current design tokens
- current charts
- current map
- navigation
- role system
- loading states
- error states

SECOND:

Create a complete UI/UX redesign plan.

THIRD:

Implement the design system.

FOURTH:

Redesign application shell/navigation.

FIFTH:

Redesign Overview.

SIXTH:

Redesign India Airfare Map.

SEVENTH:

Redesign Route Explorer.

EIGHTH:

Redesign Public Price Intelligence.

NINTH:

Redesign Government Intelligence.

TENTH:

Redesign Data Sources.

ELEVENTH:

Redesign Collection Operations.

TWELFTH:

Redesign Methodology.

THIRTEENTH:

Redesign Insights.

FOURTEENTH:

Redesign Exports.

FIFTEENTH:

Implement responsive behavior.

SIXTEENTH:

Implement animations and microinteractions.

SEVENTEENTH:

Implement accessibility.

EIGHTEENTH:

Run frontend build.

NINETEENTH:

Check every API-powered value.

TWENTIETH:

Check every navigation link.

TWENTY-FIRST:

Check every button.

TWENTY-SECOND:

Check dark mode/light mode.

TWENTY-THIRD:

Check loading/error/empty states.

TWENTY-FOURTH:

Perform browser verification if browser tooling is available.

If browser verification is unavailable, report:

BLOCKED

Never claim PASS without actually testing.

============================================================
FINAL ACCEPTANCE CRITERIA
============================================================

The redesign is complete only when:

[ ] UI no longer looks like a generic dashboard

[ ] Public and Government experiences are clearly separated

[ ] India map is visually prominent and useful

[ ] Route Explorer is intuitive

[ ] Current fare is immediately understandable

[ ] Forecast is shown as a range where appropriate

[ ] T+1/T+7/T+15/T+30/T+45 are visible

[ ] Track Price flow exists

[ ] Data freshness is visible

[ ] Source provenance is visible

[ ] Sample/live/reference states are truthful

[ ] Government data access is understandable

[ ] Government Intelligence dashboard is professional

[ ] Methodology is visually understandable

[ ] Data quality is understandable

[ ] Benchmarking is understandable

[ ] All numbers come dynamically from APIs

[ ] No fake statistics

[ ] No fake live status

[ ] Loading states exist

[ ] Error states exist

[ ] Empty states exist

[ ] Dark mode works

[ ] Light mode works

[ ] Mobile works

[ ] Accessibility is implemented

[ ] Animations are smooth but restrained

[ ] Frontend build passes

[ ] Existing backend functionality remains intact

[ ] Existing tests remain passing

[ ] Browser verification is honestly reported

============================================================
FINAL INSTRUCTION
============================================================

Do not tell me that the interface is "modern" merely because gradients,
animations or glass cards were added.

The final interface must be demonstrably easier to understand.

A first-time user should immediately understand:

WHAT AEROPRICE INDIA IS

WHERE AIRFARE DATA COMES FROM

HOW CURRENT AIRFARES ARE MOVING

WHAT THE CURRENT INDEX MEANS

HOW ADVANCE BOOKING AFFECTS OBSERVED FARES

HOW THE DATA IS CLEANED

HOW THE INDEX IS CALCULATED

HOW FRESH THE DATA IS

WHICH DATA IS OFFICIAL

WHICH DATA IS OBSERVED

WHICH DATA IS FORECAST

AND WHY THE PLATFORM IS USEFUL TO BOTH GOVERNMENT ANALYSTS
AND ORDINARY USERS.

Start by inspecting the existing frontend.

Do not rewrite the backend.

Do not fabricate data.

Do not stop after changing colors.

Implement the complete UI/UX transformation.