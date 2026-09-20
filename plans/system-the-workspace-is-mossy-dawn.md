# AeroPrice India — Site-Wide Fix & Polish Pass

## Context
A full-codebase audit identified bugs, design inconsistencies, and UX gaps across all 15 pages and shared components. The user asked to plan all fixable issues. This pass addresses them in three tiers: critical bugs (breakage), design consistency (token/pattern unification), and UX polish (page-level improvements).

---

## Tier 1 — Critical Bugs (breakage/errors)

### 1. `useState` inside `.map()` in DataSources.tsx — Rules of Hooks violation
**File:** `src/pages/DataSources.tsx`
The hover state for source cards is created with `useState(false)` inside a `.map()` callback — illegal in React. Replace with a single `hoveredId: string | null` state at the component level.

### 2. `getSeverity` thresholds wrong scale in Anomalies.tsx
**File:** `src/pages/Anomalies.tsx`
`deviation` values are decimals (e.g. `0.45`), but thresholds compare `>= 60` and `>= 30`. Fix: compare `deviation * 100 >= 60` etc, or store deviation as a percent integer.

### 3. Admin user count stale
**File:** `src/pages/AdminDashboard.tsx`
Footer reads "3 users shown" but `DEMO_USERS` has 4 entries. Fix: derive the count from `DEMO_USERS.length`.

### 4. `msg2` timeout leak in LoginPage.tsx
**File:** `src/pages/LoginPage.tsx`
Second `setTimeout` is stored in a plain `const` not a `ref`, so cleanup on unmount only clears `msgRef.current`. Fix: use a `msg2Ref = useRef<ReturnType<typeof setTimeout>>(null)` and clear it in cleanup.

### 5. `spin` keyframe not globally defined
**File:** `src/index.css`
`animation: 'spin 1s linear infinite'` is applied to icons in LiveFares, Collection, and GovernmentIntelligence, but `@keyframes spin` only exists inside a `<style>` tag in LoginPage (leaking into global scope unreliably). Add it to `src/index.css`:
```css
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
```

---

## Tier 2 — Design Consistency (tokens + shared patterns)

### 6. Extract dark hero gradient into a CSS token
**File:** `src/styles/global.css` + 6 pages
`linear-gradient(145deg, #080e1a 0%, #0d1b3e 55%, #0f1a40 100%)` is copy-pasted in Overview, LiveFares, Anomalies, Forecast, HistoricalFares, LoginPage. Add to global.css:
```css
--gradient-hero-dark: linear-gradient(145deg, #080e1a 0%, #0d1b3e 55%, #0f1a40 100%);
```
Then replace all 6 occurrences with `background: var(--gradient-hero-dark)`.

### 7. Fix hardcoded hex colors that duplicate CSS vars
**Files:** Multiple pages
- `var(--color-teal, #0d9488)` → `var(--color-teal)` (remove fallback since token is defined)
- `rgba(37,99,235,0.12)` → use `var(--color-brand-primary)` with opacity wrapper in AppShell NavButton
- Leaflet `TREND_COLORS` can stay hex (Leaflet API requirement — not fixable)

### 8. Replace `onMouseOver`/`onMouseOut` with CSS hover
**Files:** AppShell.tsx, Overview.tsx, MarketInsights.tsx, Forecast.tsx
Inline JS hover handlers cause flicker (fires on child elements). Convert to a CSS utility class:
```css
.hover-lift:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
```
And use `onMouseEnter`/`onMouseLeave` where a JS state change is truly needed.

### 9. Fix `BarChart2` duplicate icon in nav
**File:** `src/components/AppShell.tsx`
Both `insights` and `historicalfares` nav items use `BarChart2`. Change `historicalfares` to use `Clock` or `History` icon (already imported set includes many options from lucide-react).

### 10. Sidebar width token mismatch
**File:** `src/components/AppShell.tsx`
Sidebar width is hardcoded as `224` (px number) but `--sidebar-width: 220px` exists in tokens. Align to `220` or update the token to `224`.

---

## Tier 3 — UX Polish (per-page improvements)

### 11. Methodology page — hero header + clickable "See Data Sources" link
**File:** `src/pages/Methodology.tsx`
- Add the dark gradient hero panel (same pattern as other pages) with title "Methodology" and subtitle
- Replace plain text "See Data Sources for current source status" with a clickable `<button>` that calls `onNavigate('sources')` (add `onNavigate` prop like Overview.tsx does)

### 12. Exports page — hero header + empty state
**File:** `src/pages/Exports.tsx`
- Add hero panel for visual consistency
- Replace `alert()` call with an inline error message state
- Show a gentle empty-state notice: "Export data will populate once real airfare observations are collected"

### 13. PriceAlerts — less aggressive modal
**File:** `src/pages/PriceAlerts.tsx`
Currently `upgradeOpen` initializes to `isFree` — modal fires instantly on page load for free users. Change: initialize to `false`, show the page with a locked state and a prominent CTA button, open modal only when CTA is clicked.

### 14. Duplicate DGCA Circulars section in GovernmentIntelligence
**File:** `src/pages/GovernmentIntelligence.tsx`
Two separate Circular Feed sections exist. Remove the second (lower) duplicate. Keep only the first.

### 15. `isoTimestamp` shared utility
**Files:** `src/pages/DataSources.tsx`, `src/pages/Collection.tsx`
Both define `function isoTimestamp(ts: string | null)` identically. Move to `src/utils/format.ts` and import from there.

### 16. RouteExplorer — prevent same-city FROM/TO selection
**File:** `src/pages/RouteExplorer.tsx`
In `handleToChange` / `handleFromChange`, if the new value equals the opposite field's value, swap them (not silently allow DEL→DEL).

### 17. Forecast page — fix CI width for +14 day
**File:** `src/pages/Forecast.tsx`
+14 day forecast card shares the same `ciLow1`/`ciHigh1` as +7 day. The +14 day CI should be wider. Multiply CI radius by 1.5 for the 14-day card.

### 18. Document title per page
**File:** `src/App.tsx`
Add `useEffect(() => { document.title = \`AeroPrice · \${PAGE_TITLES[currentPage]}\` }, [currentPage])` so the browser tab updates on navigation.

### 19. Remove dead code
- `AdminDashboard.tsx`: remove unused `AUDIT_LOG` constant and unused import (`apiAdminUsers`)
- `RouteExplorer.tsx`: remove unused `SelectField` import
- Anomalies filter: add empty-state card when filtered results = 0
- Forecast: fix `slice` happening after filter (should `filter` first, then `slice(0,8)`)

---

## Verification

1. **Bug fixes verified in browser**: Navigate to DataSources page — no React hook error in console. Anomalies page — HIGH severity anomalies appear. Admin user count reads "4 users shown".
2. **Spin animation**: Collection page "Trigger Collection" → spinner on `RefreshCw` animates correctly.
3. **Token consistency**: `grep -r '#080e1a\|#0d1b3e\|rgba(37,99,235' src/pages` → 0 results after migration to tokens.
4. **PriceAlerts**: Log in as free user → navigate to Price Alerts → page renders without instant modal; click "Upgrade" CTA → modal opens.
5. **Methodology link**: Click "See Data Sources" → navigates to DataSources page.
6. **TypeScript**: `npx tsc --noEmit` → 0 errors.

---

# AeroPrice India — SIH26056 Master Plan

---

## Phase 3: Real Data Acquisition — NEXT TO IMPLEMENT

### Objective
Get the first real, legitimately authorized airfare observation into the database and prove the complete pipeline end-to-end. Only after this proof should collection scale to all 12 routes.

### Why Plan 1 (Current Backend) Has Drawbacks

**The current backend is architecturally sound but produces zero real airfare data.** Specific drawbacks:

| # | Drawback | Impact |
|---|---|---|
| 1 | **All 5 airline adapters return CHALLENGE_DETECTED** | 0 fare observations in DB; every API endpoint returns empty/INSUFFICIENT_DATA |
| 2 | **No aggregator adapter implemented** — `AGGREGATOR_PROVIDER/API_KEY/BASE_URL` env vars exist in config but nothing calls them | The obvious unblocking path (authorized aggregator like Mystifly, Amadeus, Sabre) is not wired |
| 3 | **`data_origin = "REAL"` not `"LIVE"`** — the new phase prompt specifies `LIVE` as the canonical value for genuinely collected fares | Schema mismatch; needs a decision and consistent update |
| 4 | **Jevons index requires Jan 2025 baseline** — no baseline data seeded or fetched | Index can never publish even if current-period fares arrive; will always show INSUFFICIENT_DATA |
| 5 | **AllOrigins CORS proxy is unreliable** — not production-grade; DGCA portal HTML structure may change silently | Gov data shows STALE / FAILED unpredictably |
| 6 | **MoSPI is permanently STALE** — portal is a JS SPA; AllOrigins only returns shell HTML | MoSPI CPI-Transport data is permanently unavailable through this method |
| 7 | **Scheduler runs hourly but collects nothing** — APScheduler fires but all adapters immediately return CHALLENGE_DETECTED | Wastes scheduler cycles; misleads monitoring about collection "activity" |
| 8 | **No retry/backoff on transient failures** — collector has no exponential backoff for HTTP timeouts | A momentary network blip drops an entire collection window with no retry |
| 9 | **Raw payload storage not wired into collector** — `raw_fare_payloads` table exists but `run_collection()` never writes to it | Full audit trail / provenance chain is broken even when real data arrives |
| 10 | **No real smoke test executable** — Python unavailable in Figma Make sandbox | Cannot verify the backend actually works until run locally |

### Phase 3 Implementation Plan

#### Step 1 — Research and select a legitimate aggregator

Research which of the following can legitimately provide Indian domestic one-way economy fares with no credential fabrication:
- **Mystifly** — B2B flight aggregator, documented API, Indian market focus
- **Amadeus Self-Service APIs** — free tier, Test + Production, REST, supports Indian routes
- **Sabre Dev Studio** — documented REST APIs
- **TBO Holidays** — Indian B2B aggregator
- **RateGain** — airfare intelligence, India coverage

For the selected provider document: API endpoint, auth mechanism, free-tier limits, supported routes, response schema.

**Decision to make before implementation:** Amadeus Self-Service API is the most documentation-complete option with a public free sandbox tier. Proposed default.

#### Step 2 — Build `backend/app/collectors/aggregators/` adapter

Files to create:
```
backend/app/collectors/aggregators/__init__.py
backend/app/collectors/aggregators/base_aggregator.py   # common interface
backend/app/collectors/aggregators/amadeus.py           # Amadeus REST adapter
```

`AmadeusAdapter` implements `FareSourceAdapter`:
- `is_configured()` → checks `AMADEUS_API_KEY` + `AMADEUS_API_SECRET` env vars
- `collect(route, travel_date, advance_days, run_id)` → calls Amadeus Flight Offers Search API
- Maps response to `FareRecord` with `data_origin = "REAL"` (or "LIVE" — see Step 3)
- Stores raw response body in `raw_fare_payloads` table

Add to `backend/app/core/config.py`:
```python
AMADEUS_API_KEY: str = ""
AMADEUS_API_SECRET: str = ""
AMADEUS_BASE_URL: str = "https://test.api.amadeus.com"  # sandbox default
```

Add to `backend/.env.example`.

#### Step 3 — Resolve `data_origin` vocabulary

**Decision:** Adopt `"REAL"` as the canonical production value (already in the DB schema, TypeScript types, and all existing code). The new prompt's use of `"LIVE"` is a synonym — do NOT rename to avoid breaking changes. Add a note in the README clarifying that `REAL` = legitimately collected = what the prompt calls "LIVE".

#### Step 4 — Wire aggregator into collection service

`backend/app/services/collector.py`:
- Add `AmadeusAdapter` to `_make_adapters()`
- Update `AIRFARE_SOURCE_REGISTRY` with Amadeus entry (status: CONFIGURED when env vars present)
- Wire `raw_fare_payloads` write inside the SUCCESS branch of `run_collection()`

#### Step 5 — DEL-BOM smoke test (T+1, T+7, T+15, T+30, T+45)

After implementing the adapter, the user runs locally:
```bash
cd backend
cp .env.example .env    # fill AMADEUS_API_KEY + AMADEUS_API_SECRET
uvicorn main:app --reload --port 8000
curl -X POST http://localhost:8000/api/collections/trigger \
  -H "Authorization: Bearer <admin_token>"
```

Success criterion: DB query shows ≥1 row in `fare_observations` for route `DEL-BOM` with `data_origin = "REAL"`.

#### Step 6 — Verify full pipeline

```sql
SELECT route, travel_date, advance_days, airline, total_fare, data_origin
FROM fare_observations WHERE route = 'DEL-BOM';
```

Then verify via API:
- `GET /api/fares?route=DEL-BOM` → observations returned
- `GET /api/fares/summary/DEL-BOM` → per-window stats populated
- `GET /api/routes` → DEL-BOM shows `observations_7d > 0`
- `GET /api/index/current` → still INSUFFICIENT_DATA (correct — need 15 corridors)
- `GET /api/source-health` → Amadeus shows `status: LIVE`

#### Step 7 — Scale to all 12 routes

Only after Step 5 succeeds: extend `ROUTE_BASKET` runs through Amadeus for all 12 corridors × 5 windows.

#### Step 8 — Improve government data reliability

- Replace AllOrigins with direct fetch where CORS allows (data.gov.in supports direct JSON)
- Add structured retry with exponential backoff in `gov_fetcher.py`
- MoSPI: document as "manual download required" — do not pretend AllOrigins works

#### Files to create/modify in Phase 3

| File | Action |
|---|---|
| `backend/app/collectors/aggregators/__init__.py` | Create |
| `backend/app/collectors/aggregators/amadeus.py` | Create |
| `backend/app/collectors/aggregators/base_aggregator.py` | Create |
| `backend/app/core/config.py` | Add AMADEUS_* vars |
| `backend/app/services/collector.py` | Add Amadeus to adapters + wire raw_fare_payloads |
| `backend/.env.example` | Add AMADEUS_* entries |
| `backend/tests/test_amadeus_adapter.py` | Create — mock HTTP responses |
| `backend/README.md` | Add Amadeus setup section |

#### Verification

1. `pytest tests/test_amadeus_adapter.py -v` (mocked — no real API key needed)
2. User sets real Amadeus sandbox credentials, runs collection, queries DB directly
3. Frontend shows non-empty fares table for DEL-BOM
4. Source health shows Amadeus as LIVE
5. `npx tsc --noEmit` still passes (no TypeScript changes needed for this phase)

---

# Phase 1 (Complete) — SIH26056 Phase 2: Full Overhaul Plan — IMPLEMENTATION STATUS

## Current State (Post-Implementation)

All Phase 2 files have been implemented. The user manually refined `src/contexts/AuthContext.tsx`, `src/services/store.ts`, and `src/types/observation.ts`. The "hardcoded-astra-ui" Make Kit selected for this turn has no npm metadata and cannot be installed — the project continues using CSS custom properties from `src/styles/global.css`.

**Remaining action:** TypeScript verification and any fixes needed for the updated `FareObservation` type (new fields: `departure_time`, `arrival_time`, `availability_status`, `query_timestamp`).

---

## Context

This is a React 19 + Vite + Tailwind CSS v4 SPA (11 pages, Leaflet map, state-based routing, synthetic data). The brief (`aeroprice-india-brief.md`) mandates a transformation into a **real-data, real-provenance, statistically transparent** intelligence platform. The non-negotiables are: (1) no synthetic airfare shown as live, (2) honest empty states, (3) full RBAC, (4) real government data where technically accessible, (5) Bloomberg-quality UI.

Reference sites studied:
- **flyindex.vercel.app** — Live Fares table (base+taxes+total), pipeline banner, RBAC in nav, "3D Time-Travel Scrubber"
- **api-x-chi.vercel.app** — APIx: Sector Heatmap, Advance-Purchase Elasticity, ⓘ methodology tooltips, CSV export, "Trigger Live Scrape" button
- **airfare-index-engine.vercel.app** — terminal aesthetic, bracketed section labels, Policy Simulator, DGCA Validation tab, API Specs tab

Design constraint: every CSS property uses only `var(--*)` tokens from `src/styles/global.css`. Fonts: Inter + JetBrains Mono only.

---

## A. Source Discovery Audit (pre-coded into UI)

These statuses are confirmed based on known characteristics and will be displayed honestly in the Data Sources page:

| Source | Type | Status | Method | Reason |
|---|---|---|---|---|
| IndiGo (goindigo.in) | Airfare | CHALLENGE DETECTED | — | Cloudflare bot protection |
| Air India (airindia.com) | Airfare | CHALLENGE DETECTED | — | Anti-scrape protection |
| Air India Express | Airfare | CHALLENGE DETECTED | — | Same CDN protection |
| Akasa Air (akasaair.com) | Airfare | CHALLENGE DETECTED | — | JS-rendered SPA + CAPTCHA |
| SpiceJet (spicejet.com) | Airfare | CHALLENGE DETECTED | — | Cloudflare + fingerprinting |
| DGCA Statistics | Official | CONFIGURED | AllOrigins + HTML parse | Public HTML tables |
| MoSPI eSankhyiki | Official | CONFIGURED | AllOrigins + HTML/JSON | Public statistical portal |
| data.gov.in | Official | CONFIGURED | Direct JSON fetch | Open dataset, no key |
| PPAC Fuel Prices | Official | CONFIGURED | AllOrigins + HTML parse | Public price bulletin |

Airfare sources shown as CHALLENGE DETECTED. No synthetic prices shown as "LIVE." Government sources fetched and shown as OFFICIAL.

---

## B. Data Architecture

### `data_origin` taxonomy (new field on all data items)

```ts
type DataOrigin = 'REAL' | 'OFFICIAL' | 'DERIVED' | 'GENERATED'
```

Existing `sampleData.ts` values are tagged `GENERATED` and **never** displayed as current market prices. Government-fetched data tagged `OFFICIAL`. The index, if calculated from generated data, is hidden.

### Observation schema (TypeScript interface, `src/types/observation.ts`)

```ts
interface FareObservation {
  observation_id: string      // uuid
  collected_at: string        // ISO
  travel_date: string         // ISO date
  origin: string; destination: string; route: string
  carrier: string; flight_number: string
  source: string; source_url: string
  fare_family: 'SAVER'|'FLEX'|'BUSINESS'|'PREMIUM'
  cabin: 'ECONOMY'|'BUSINESS'|'FIRST'
  stops: number
  base_fare: number; taxes: number; fees: number; total_fare: number
  currency: 'INR'
  advance_days: number           // T+1, T+7, T+15, T+30, T+45
  collector_version: string
  raw_hash: string
  data_origin: DataOrigin
  quality_flags: string[]        // ['OUTLIER', 'LOW_SAMPLE', ...]
}
```

### Government dataset schema (`src/types/govDataset.ts`)

```ts
interface GovDataset {
  source: string; organization: string
  access_type: 'PUBLIC'|'AUTHENTICATED'
  api_key_required: boolean
  format: 'JSON'|'CSV'|'XLSX'|'PDF'|'HTML'
  last_retrieved: string|null
  last_attempt: string|null
  status: 'CONNECTED'|'HEALTHY'|'UNAVAILABLE'|'STALE'|'FAILED'|'NOT_CONFIGURED'|'AUTH_REQUIRED'
  record_count: number|null
  checksum: string|null
  reference_period: string|null
  source_url: string
}
```

### `localStorage` store (`src/services/store.ts`)

Persists fetched government data with TTL. Keys: `aeroprice_gov_{name}_{yyyymmdd}`. On load, checks cache freshness, serves stale if fetch fails and labels accordingly.

---

## C. Authentication & RBAC

### `src/contexts/AuthContext.tsx`

```ts
type UserRole = 'PUBLIC' | 'ANALYST' | 'ADMIN'

interface AuthUser {
  name: string; email: string; role: UserRole
  plan: 'FREE' | 'SUBSCRIBER' | 'GOVERNMENT' | 'ADMIN'
}
```

Demo credentials (hardcoded, clearly marked as demo):

| Role | Email | Password | Plan |
|---|---|---|---|
| ADMIN | admin@aeroprice.in | aeroadmin | ADMIN |
| ANALYST | dgca@gov.in | dgca2026 | GOVERNMENT |
| PUBLIC/SUBSCRIBER | user@aeroprice.in | aero123 | SUBSCRIBER |
| PUBLIC/FREE | (any valid email) | demo | FREE |

`App.tsx`: if `!user` → `<LoginPage>`, else `<AppShell user={user}>`.

### Role → page access matrix

| Page | PUBLIC | ANALYST | ADMIN |
|---|---|---|---|
| Overview | ✓ | ✓ | ✓ |
| India Map | ✓ | ✓ | ✓ |
| Route Explorer | ✓ | ✓ | ✓ |
| Market Insights | ✓ | ✓ | ✓ |
| Price Alerts (Track Price) | SUBSCRIBER+ | ✓ | ✓ |
| Government Intelligence | ✗ | ✓ | ✓ |
| Methodology | ✗ | ✓ | ✓ |
| Exports | ✗ | ✓ | ✓ |
| Data Sources | ✗ | ✓ | ✓ |
| Collection | ✗ | ✗ | ✓ |
| Admin Console | ✗ | ✗ | ✓ |

---

## D. LoginPage (`src/pages/LoginPage.tsx`)

Two-column layout filling viewport (no AppShell):

**Left panel (40%) — brand**
- Background: `--gradient-hero` (deep navy → indigo)
- AeroPrice wordmark SVG logo (abstract arc + data signal, NOT an emoji)
- Tagline: "Real-time visibility into India's airfare movement."
- Three role-teaser feature pills: "Government Analytics", "Live Route Intelligence", "Price Tracking"
- MoSPI/SIH26056 badge at bottom

**Right panel (60%) — form**
- White surface `--color-surface-bg`
- "Sign in to AeroPrice India" heading
- Email + Password fields using `src/components/ui/Field.tsx`
- Primary Button "SIGN IN"
- Demo quick-login pills: three role buttons (PUBLIC / ANALYST / ADMIN) that pre-fill credentials
- Expandable "Demo Credentials" tip with the table of passwords

---

## E. AppShell Overhaul (`src/components/AppShell.tsx`)

### Sidebar (220px)
- Role badge pill under logo: "ADMIN" (danger-bg), "ANALYST" (info-bg), "PRO" (brand-bg), "FREE" (surface-secondary)
- Nav filtered by role matrix
- Active item: left 3px brand-color border + gradient bg
- Footer: avatar (initials circle) + name + role label + logout button

### Top bar (48px)
- Left: breadcrumb — "AeroPrice India / {page title}"
- Center: global route search (autocomplete from AIRPORTS list, opens Route Explorer)
- Right: data status pill (government fetch status) + notification bell + avatar dropdown

### `SampleDataBanner` → renamed to `DataStatusBanner`
Shows "OFFICIAL DATA" (green) when gov fetch succeeded, "GENERATED DATA" (amber warning) when showing sample, "SOURCE UNAVAILABLE" (red) when fetch failed. Always honest.

---

## F. Real Data Services

### `src/services/govFetcher.ts`

```ts
const ALLORIGINS = 'https://api.allorigins.win/get?url='

// Fetch DGCA monthly passenger statistics (public HTML table)
export async function fetchDgcaMonthlyStats(): Promise<DgcaMonthlyRecord[]>

// Fetch DGCA circular/press releases (public HTML)
export async function fetchDgcaCirculars(): Promise<DgcaCircular[]>

// Fetch MoSPI CPI transport sub-index from eSankhyiki
export async function fetchMospiCpiTransport(): Promise<MospiCpiRecord[]>

// Fetch data.gov.in open aviation dataset (direct JSON, no key)
export async function fetchDataGovAviationDataset(): Promise<DataGovRecord[]>
```

Each function:
1. Checks localStorage cache with TTL
2. On miss: fetch via AllOrigins, parse HTML table with `DOMParser`, cache result
3. On failure: return null + set status `FAILED`/`UNAVAILABLE`

### `src/hooks/useGovData.ts`

Orchestrates all gov fetchers, returns typed results + per-source status. Used by Gov Intelligence page and Data Sources page.

### `src/hooks/useLiveData.ts` (modified)

- Remove synthetic price variance that simulates "LIVE" movement
- `connectionStatus` is now `'NO_DATA'` by default (no airfare sources connected)
- Only shows "FRESH" if a gov data fetch succeeded within last 6 hours
- Existing `generateSyntheticFlights()` kept for map flight display but clearly tagged `data_origin: 'GENERATED'` — map shows them with a "DEMO POSITIONS" badge

---

## G. Page-by-Page Changes

### Overview (`src/pages/Overview.tsx`)

**Remove**: animated price ticker with generated data, fake "LIVE" indicator, hardcoded index value as primary metric

**Add**:
- **Role-aware "For You" hero panel** at top (48px strip):
  - ADMIN: 3 collector status dots + pipeline health
  - ANALYST: DGCA data freshness + direct link to Gov Intel
  - SUBSCRIBER: triggered alert count + "Track a Route" CTA
  - FREE: "Upgrade for Price Alerts" with plan comparison link
- **Index section**: "ALL-INDIA AIRFARE INDEX" — shows value only if real data supports it. If generated: shows "INDEX UNAVAILABLE — No live airfare observations" with source status cards for each airline (all showing CHALLENGE DETECTED)
- **Source status strip**: horizontal row of 5 airline source cards each with honest status badge
- **DGCA reference section**: "Official Reference Data" — shows last DGCA fetch result (pax traffic, available routes) tagged OFFICIAL
- **Public Route Search**: FROM/TO/DATE form → result shows "NO LIVE OBSERVATION AVAILABLE" with source status + retry

### Live Fares Table (new page: `src/pages/LiveFares.tsx`)

Borrowed from flyindex.vercel.app:
- **Columns**: Timestamp · Route · Airline · Travel Date · Window · Base Fare · Taxes · Total · Source · Quality · Status · Audit
- **Filters**: Origin, Airline, Booking Window (T+1→T+45), Data Origin (REAL/OFFICIAL/GENERATED), Validation Status
- **Empty state**: "NO LIVE OBSERVATIONS — All airline sources show CHALLENGE DETECTED. Configure a backend collector to receive real observations."
- Pipeline banner: "Acquisition → ETL & Validation → Jevons Index → CPI Augmentation" horizontal flow
- Shows GENERATED rows dimmed with origin badge; REAL/OFFICIAL rows full-color

### Route Explorer (`src/pages/RouteExplorer.tsx`)

Add tabs:
- **Booking Windows**: real T+1/T+7/T+15/T+30/T+45 — each cell shows "INSUFFICIENT DATA" if no real obs for that window
- **Sources**: per-route source status table with last attempt, records received
- **Forecast**: 2/7/14 day — shows "FORECAST UNAVAILABLE — insufficient real observations"
- Add ⓘ methodology tooltip on every chart (borrowed from api-x)

### Government Intelligence (`src/pages/GovernmentIntelligence.tsx`)

Full premium workspace:
- **Top bar**: "GOVERNMENT AIRFARE INTELLIGENCE" + data freshness + export controls + "Download PDF Bulletin" (simulated)
- **3-chart row**: (a) DGCA monthly pax volume bars (real OFFICIAL data), (b) 12-month fare index line vs MoSPI CPI reference (real if available, else NOT PUBLISHED), (c) Carrier market share doughnut
- **Sector Heatmap** (borrowed from api-x): corridor × booking-window grid, color = fare level. Cells with no data = gray "N/A"
- **Advance-Purchase Elasticity curves** (borrowed from api-x): tabs per corridor showing fare vs advance days
- **DGCA Circular Feed**: real fetched circulars with title, date, category badge — or "SOURCE UNAVAILABLE" if fetch fails
- **Government Data Source Center**: table showing each gov source's status, format, checksum, reference period, last retrieved
- **Statistical Notes** prose panel: Jevons formula display, DGCA route weight table with provenance
- **Benchmark section**: AeroPrice Index vs MoSPI CPI Transport — shows "BENCHMARK NOT PUBLISHED — insufficient airfare observations" if no real data

### Price Alerts / Track Price (`src/pages/PriceAlerts.tsx`)

- FREE users: `UpgradeModal` overlay (plan comparison table, 3-tier pricing)
- SUBSCRIBER+: Full CRUD alert interface
- **Track Price form**: Route, Travel Date, Threshold fare, Notification method (Email/WhatsApp)
- **Alert cards**: show source status — "ALERT PENDING — awaiting first airfare observation for this route"
- Notification preferences panel: Email toggle, Daily Digest frequency

### Data Sources (`src/pages/DataSources.tsx`)

Complete rewrite using both schemas:

**Airfare Sources section**: 5 airline cards each showing:
- Status: CHALLENGE DETECTED (amber) or SOURCE BLOCKED (red)
- robots.txt status, CAPTCHA detected
- "Configure Backend Collector" CTA (links to Admin)
- Last attempt: null, Next attempt: manual only

**Government Sources section**: 4 gov source cards each showing:
- Status: CONNECTED / UNAVAILABLE (live from govFetcher)
- Organization, Access type, Format, API key required (No)
- Last retrieved, Record count, Checksum, Reference period
- "View Dataset" link to source URL

### Collection / Admin (`src/pages/AdminDashboard.tsx`)

- **User Management table**: demo user list with role, plan, last login
- **Pipeline controls**: source toggle switches (airlines show "CHALLENGE DETECTED — cannot enable"), gov sources show real status with last run time
- **Live metrics**: observations/hour (0 for airfare), gov fetch latency (real)
- **Audit log**: timestamped entries — role changes, source attempts, gov data fetches
- **Configuration panel**: Jevons weight overrides, anomaly thresholds, collection intervals

### Methodology (`src/pages/Methodology.tsx`)

Animated vertical pipeline (already accordion, improve visuals):
- Each node: icon + step number + title + status badge (ACTIVE / BLOCKED / PENDING)
- Collector nodes (COLLECTION): status = CHALLENGE DETECTED → blocked, shown in amber
- Index node (JEVONS): status = PENDING — no real observations yet
- Government data node: status = CONNECTED (if fetch succeeded)
- Each node links to relevant Data Source entry

---

## H. New Components

| File | Purpose |
|---|---|
| `src/contexts/AuthContext.tsx` | Auth state + useAuth hook |
| `src/pages/LoginPage.tsx` | Split-panel auth with demo quick-picks |
| `src/pages/LiveFares.tsx` | Full observation table (flyindex-style) |
| `src/components/UpgradeModal.tsx` | Paywall plan comparison modal |
| `src/components/NavAvatar.tsx` | Top-right avatar + dropdown menu |
| `src/components/DataStatusBanner.tsx` | Replaces SampleDataBanner — honest per-fetch status |
| `src/components/SourceCard.tsx` | Reusable card for source status display |
| `src/components/ProvenancePanel.tsx` | Slide-in panel showing full obs provenance |
| `src/components/SectorHeatmap.tsx` | Corridor × booking-window SVG heatmap |
| `src/components/ElasticityChart.tsx` | Advance-purchase elasticity SVG line chart |
| `src/components/PipelineBanner.tsx` | Horizontal pipeline flow (flyindex style) |
| `src/services/govFetcher.ts` | AllOrigins-based gov data fetcher |
| `src/services/store.ts` | localStorage cache with TTL |
| `src/hooks/useGovData.ts` | Orchestrates all gov fetches |
| `src/types/observation.ts` | FareObservation + GovDataset TypeScript interfaces |

---

## I. Borrowed UX Patterns from Reference Sites

| Pattern | From | Implementation |
|---|---|---|
| Base / Taxes / Total fare columns | flyindex live-fares | `LiveFares.tsx` table |
| Pipeline banner (Acquisition→ETL→Index→CPI) | flyindex | `PipelineBanner.tsx` in AppShell top |
| Sector heatmap (corridor × window) | api-x-chi | `SectorHeatmap.tsx` in Gov Intel |
| Advance-purchase elasticity | api-x-chi | `ElasticityChart.tsx` per-route tabs |
| ⓘ methodology tooltip on every chart | api-x-chi | Tooltip component on all chart headings |
| Trigger Live Scrape button | api-x-chi | Admin → source card action (shows CHALLENGE DETECTED) |
| Bracketed section labels `[INDEX-01]` | airfare-index-engine | Optional gov intel section headers |
| RBAC integrated in nav | flyindex | Role badge + filtered nav in sidebar |
| Honest DEMO DATA watermark | flyindex | DataStatusBanner shows data_origin |

---

## J. Files Modified

| File | Change |
|---|---|
| `src/App.tsx` | AuthProvider wrap, LoginPage gate, new `livefares` page case |
| `src/components/AppShell.tsx` | Role-filtered nav, role badge, enriched top bar, DataStatusBanner |
| `src/components/SampleDataBanner.tsx` | Replaced by DataStatusBanner |
| `src/hooks/useLiveData.ts` | Remove fake-LIVE indicators; all generated data tagged GENERATED |
| `src/data/sampleData.ts` | Add `data_origin: 'GENERATED'` to all records |
| `src/pages/Overview.tsx` | Role hero panel, source status strip, honest index section |
| `src/pages/GovernmentIntelligence.tsx` | Real gov data, heatmap, elasticity, circular feed, gov source center |
| `src/pages/PriceAlerts.tsx` | Role gate, UpgradeModal, honest alert states |
| `src/pages/DataSources.tsx` | Airfare sources (CHALLENGE DETECTED) + gov sources (real fetch status) |
| `src/pages/AdminDashboard.tsx` | User table, pipeline controls, audit log |
| `src/pages/Methodology.tsx` | Node status badges, animated pipeline, linked to source entries |
| `vite.config.ts` | Add `server.proxy` `/dgca` → `dgca.gov.in` for dev |

---

## K. Verification

1. **LoginPage**: Each demo credential → correct role → correct nav items visible/hidden
2. **FREE gate**: Free user → Price Alerts → UpgradeModal, no alert data accessible
3. **Gov data fetch**: Open Gov Intel → loading state → DGCA circular feed populates OR shows "SOURCE UNAVAILABLE" — never shows fake circulars
4. **Source honesty**: Data Sources page → all 5 airline cards show CHALLENGE DETECTED, not LIVE
5. **Index honesty**: Overview → Index section shows "INDEX UNAVAILABLE" or "LOW COVERAGE", not hardcoded 115.85
6. **Provenance**: Click any data point → ProvenancePanel shows data_origin, source, collection time
7. **Design system**: grep for hardcoded hex in new files → zero hits
8. **No console errors**: key props, undefined.toFixed, CORS warnings all absent
