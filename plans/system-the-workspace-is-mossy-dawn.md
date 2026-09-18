# AeroPrice India — UI/UX Build Plan

## Context

The user has provided a comprehensive design brief (attachment `7bd731eb`) for **AEROPRICE INDIA** — "India's Airfare Intelligence Layer" — a national airfare price index platform serving two audiences: public travelers and government/statistical analysts.

The Astra UI Kit (`@figma/astraui` v1.0.0 via `@figma/astraui-kit` v0.1.3) is already installed in `package.json`. The project is a blank Vite + React 19 + Tailwind CSS v4 app.

The user's instruction: all UI must use CSS variables from the design system (Astra kit tokens), and typography must use only the font faces defined in the kit CSS. Since there is no custom `src/styles/global.css`, the Astra kit's own token system (`@figma/astraui/styles.css`) is the authoritative source.

---

## Approach

Build a multi-page AeroPrice India application using Astra UI Kit components throughout. Use **sample data clearly labeled as "SAMPLE DATA"** since there is no real backend. Focus on the key screens the brief prioritizes for the SIH judge demo flow.

---

## File Changes

### `src/index.css`
- Add `import '@figma/astraui/styles.css'` before `@import 'tailwindcss'`

### `src/main.tsx`
- Wrap `<App>` with `<ThemeProvider>` from `@figma/astraui`

### `src/App.tsx`
- Add client-side routing via `useState` (no react-router needed for this single-SPA approach)
- Render `<AppShell>` with sidebar navigation and page outlet

### New files under `src/`

#### `src/components/AppShell.tsx`
- `SidebarNavigation` with `SidebarButton` items: Home (Overview), Map, Route Explorer, Bar Chart (Market Insights), Building (Government Intelligence), Database (Data Sources), Settings (Collection), BookOpen (Methodology), Download (Exports)
- Footer: Settings icon + Avatar
- Main content area: `bg-brand-tertiary p-2xl overflow-y-auto flex-1`

#### `src/pages/Overview.tsx`
- Hero: large "AIRFARE PRICE INDEX — INDIA" heading with tagline
- KPI strip: Index value (115.85 SAMPLE), 7D change, 30D change, last updated, status badge
- Live status bar: collection active, corridors, observations, sources
- Market movement section: AIRFARES RISING / FALLING panels with route list
- Booking window chart (Recharts AreaChart): T+1 through T+45
- Regional index cards: NORTH / SOUTH / WEST / EAST
- Public search section: FROM / TO / DATE inputs + CTA button

#### `src/pages/AirfareMap.tsx`
- SVG-based simplified India map with animated route arcs (CSS animation)
- Route corridors: DEL-BOM, DEL-BLR, DEL-MAA, BOM-BLR, DEL-CCU, BOM-CCU
- Color-coded: green (falling), red (rising), amber (stable)
- Hover tooltip showing route name, fare, 7D%, freshness
- Legend + zoom controls (CSS scale transform)

#### `src/pages/RouteExplorer.tsx`
- Route selector header with fare, trend badge, freshness
- Tabs (Astra `Tabs`): Overview, Price History, Booking Windows, Airlines, Forecast, Anomalies, Sources
- Overview tab: hierarchical KPI layout (primary metric dominates)
- Price History tab: Recharts LineChart with 7D/30D/90D toggle
- Booking Windows tab: bar chart T+1→T+45
- Forecast tab: range display with uncertainty note
- Anomaly tab: MAD-detection result card
- Sources tab: provenance table

#### `src/pages/GovernmentIntelligence.tsx`
- KPI header: All-India Index, 7D change, 30D change, observations, corridors, sources, freshness
- Index hierarchy drill-down: All India → Regions → Corridors
- Weights table: Route, Weight, Source, Version, Effective Date
- Benchmark section: comparison chart vs official reference
- Data quality dashboard: valid/rejected/duplicates/outliers metrics

#### `src/pages/DataSources.tsx`
- Source registry table: Source, Type, Status badge, Last Success, Next Run, Frequency, Records, Latency
- Status variants: LIVE, HEALTHY, AGING, STALE, FAILED
- Source detail panel (Modal) with provenance info

#### `src/pages/Collection.tsx`
- Collector cards: ACTIVE/PAUSED/FAILED with run stats
- Hourly collection frequency display
- Action buttons: RUN NOW, PAUSE, RESUME, VIEW LOGS (non-functional but styled)

#### `src/pages/Methodology.tsx`
- Interactive pipeline: vertical stepper SOURCE → COLLECTION → RAW DATA → VALIDATION → CLEANING → NORMALIZATION → MATCHING → BOOKING WINDOWS → ROUTE WEIGHTS → JEVONS → REGIONAL INDEX → ALL-INDIA INDEX → FORECAST → ANOMALY → PUBLICATION
- Clicking stage opens detail panel (inline expand)
- Formula display for Jevons index

#### `src/pages/Exports.tsx`
- Export cards: CSV, JSON, PDF Bulletin
- Each shows Publication ID, Timestamp, Data version, Quality status
- Download buttons (simulate)

#### `src/components/StatusBadge.tsx`
- Reusable badge: LIVE (green), FRESH (green), AGING (amber), STALE (red), FAILED (red), SAMPLE DATA (blue)
- Uses Astra `Badge` component with appropriate variant

#### `src/components/DataFreshness.tsx`
- Pulse dot + "Observed X min ago" text
- Respects `prefers-reduced-motion`

#### `src/components/MetricCard.tsx`
- Large number + label + trend indicator
- Wraps Astra surface pattern: `bg-surface-bg rounded-corner-lg p-xl`

#### `src/components/TrendIndicator.tsx`
- Arrow up/down/right + percentage + color (red/green/amber)
- Uses lucide-react `TrendingUp`, `TrendingDown`, `Minus`

#### `src/components/ProvenancePanel.tsx`
- Source, Collected, Travel Date, Advance, Fare, Collector, Status, Publication ID
- Wrapped in Astra `Modal`

#### `src/components/SampleDataBanner.tsx`
- Persistent top banner when showing sample data: "SAMPLE DATA — Deterministic demonstration dataset"
- Uses Astra `Badge` with `brand` variant inside a surface strip

#### `src/data/sampleData.ts`
- All mock data centralized here, clearly typed
- Exports: corridors, indexValue, regionalData, bookingWindowData, sources, collectorStats

---

## Design Token Usage

- Page canvas: `bg-brand-tertiary`
- Cards: `bg-surface-bg rounded-corner-lg p-xl`
- Page padding: `p-2xl`
- Card stack gap: `gap-xl` between cards, `gap-lg` between fields
- Typography: `text-title`, `text-heading`, `text-label`, `text-label-sm`, `text-video-title`
- Colors: kit tokens only — `text-text-primary/secondary/tertiary`, `bg-brand-primary`, etc.
- Status colors: `bg-success` (falling fares), `bg-danger` (rising fares), `bg-warning` (stable/uncertain)
- No raw hex values, no arbitrary Tailwind values

---

## Navigation Structure

```
SidebarNavigation (60px, always visible)
├── Home → Overview
├── Map → Airfare Map  
├── Film → Route Explorer
├── BarChart2 → Market Insights (within Overview)
├── Building2 → Government Intelligence
├── Database → Data Sources
├── Settings → Collection
├── BookOpen → Methodology
└── Download → Exports
```

---

## Animations

- Hero index number: CSS counter animation on mount
- Route arcs on map: SVG `stroke-dashoffset` animation
- KPI cards: `opacity` + `translateY` fade-in on mount
- Freshness dot: `pulse` CSS animation (respects `prefers-reduced-motion`)
- Chart draw: Recharts built-in `isAnimationActive`
- All transitions: `transition-all duration-200`

---

## What Is NOT Built (out of scope for this pass)

- Real backend API calls (all data is sample, clearly labeled)
- Authentication / login flow
- Track Price notifications
- AI Insights chat interface
- Admin interface
- Full responsive mobile optimization (desktop-first, basic responsive)

---

## Verification

1. Dev server already running on `$PORT` — preview visually after each page
2. Check `ThemeProvider` wraps app root (dark/light mode toggle works)
3. Confirm no raw hex codes in JSX — only Astra token class names
4. Confirm SAMPLE DATA banner is visible on every data-driven page
5. Confirm SidebarNavigation appears on every page
6. Confirm Recharts renders booking window and price history charts
