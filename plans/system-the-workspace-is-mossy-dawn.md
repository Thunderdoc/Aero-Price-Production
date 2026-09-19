# AeroPrice India — SIH26056 Phase 2: Full Overhaul Plan — IMPLEMENTATION STATUS

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
