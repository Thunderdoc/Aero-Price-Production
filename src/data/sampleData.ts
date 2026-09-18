export type FreshnessLevel = 'live' | 'fresh' | 'aging' | 'stale' | 'failed' | 'sample' | 'official'
export type TrendDirection = 'up' | 'down' | 'stable'
export type SourceStatus = 'LIVE' | 'HEALTHY' | 'AGING' | 'STALE' | 'FAILED' | 'NOT_CONFIGURED'

export interface Corridor {
  id: string
  from: string
  to: string
  fromCity: string
  toCity: string
  currentFare: number
  change7d: number
  change30d: number
  trend: TrendDirection
  freshness: number // minutes ago
  observations: number
  // SVG path coords for India map (approximate)
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RegionalIndex {
  region: 'North' | 'South' | 'West' | 'East'
  index: number
  change7d: number
  change30d: number
  coverage: number
  corridors: string[]
}

export interface BookingWindowPoint {
  window: string
  label: string
  median: number
  low: number
  high: number
  observations: number
}

export interface PriceHistoryPoint {
  date: string
  indigo: number
  airIndia: number
  akasa: number
  spicejet: number
  median: number
}

export interface DataSource {
  id: string
  name: string
  organization: string
  type: 'AIRLINE' | 'OTA' | 'PUBLIC_API' | 'PUBLIC_DATASET' | 'OFFICIAL_REFERENCE'
  status: SourceStatus
  lastSuccess: string
  nextRun: string
  frequency: string
  records: number
  latency: number // ms
  url: string
  accessMethod: 'PUBLIC' | 'AUTHENTICATED'
  format: 'JSON' | 'CSV' | 'HTML' | 'PDF'
  apiKeyRequired: boolean
  collectionMethod: string
}

export interface Collector {
  id: string
  name: string
  status: 'ACTIVE' | 'PAUSED' | 'FAILED'
  lastRun: string
  nextRun: string
  successRate: number
  recordsCollected: number
  recordsRejected: number
  avgLatency: number
  rateLimitEvents: number
  errors: string[]
}

export interface WeightEntry {
  route: string
  weight: number
  source: string
  version: string
  effectiveDate: string
}

// ── Main index ────────────────────────────────────────────────
export const indexValue = 115.85
export const indexBase = 100
export const indexChange7d = 2.14
export const indexChange30d = 4.72
export const lastUpdated = '18 minutes ago'
export const totalObservations = 21035
export const activeSources = 7

// ── Corridors ─────────────────────────────────────────────────
export const corridors: Corridor[] = [
  { id: 'DEL-BOM', from: 'DEL', to: 'BOM', fromCity: 'Delhi', toCity: 'Mumbai',
    currentFare: 4850, change7d: 4.2, change30d: 7.1, trend: 'up', freshness: 18,
    observations: 3840, x1: 155, y1: 135, x2: 130, y2: 230 },
  { id: 'DEL-BLR', from: 'DEL', to: 'BLR', fromCity: 'Delhi', toCity: 'Bengaluru',
    currentFare: 5210, change7d: 6.8, change30d: 11.3, trend: 'up', freshness: 22,
    observations: 2910, x1: 155, y1: 135, x2: 175, y2: 295 },
  { id: 'DEL-MAA', from: 'DEL', to: 'MAA', fromCity: 'Delhi', toCity: 'Chennai',
    currentFare: 5640, change7d: -1.2, change30d: 2.4, trend: 'stable', freshness: 35,
    observations: 2104, x1: 155, y1: 135, x2: 200, y2: 305 },
  { id: 'BOM-BLR', from: 'BOM', to: 'BLR', fromCity: 'Mumbai', toCity: 'Bengaluru',
    currentFare: 3120, change7d: -3.4, change30d: -5.2, trend: 'down', freshness: 28,
    observations: 3215, x1: 130, y1: 230, x2: 175, y2: 295 },
  { id: 'DEL-CCU', from: 'DEL', to: 'CCU', fromCity: 'Delhi', toCity: 'Kolkata',
    currentFare: 4320, change7d: 1.1, change30d: -0.8, trend: 'stable', freshness: 44,
    observations: 1870, x1: 155, y1: 135, x2: 248, y2: 185 },
  { id: 'BOM-CCU', from: 'BOM', to: 'CCU', fromCity: 'Mumbai', toCity: 'Kolkata',
    currentFare: 5890, change7d: -5.6, change30d: -8.3, trend: 'down', freshness: 51,
    observations: 1540, x1: 130, y1: 230, x2: 248, y2: 185 },
  { id: 'BLR-MAA', from: 'BLR', to: 'MAA', fromCity: 'Bengaluru', toCity: 'Chennai',
    currentFare: 2890, change7d: -2.1, change30d: -4.5, trend: 'down', freshness: 62,
    observations: 2240, x1: 175, y1: 295, x2: 200, y2: 305 },
  { id: 'HYD-DEL', from: 'HYD', to: 'DEL', fromCity: 'Hyderabad', toCity: 'Delhi',
    currentFare: 4670, change7d: 3.3, change30d: 6.9, trend: 'up', freshness: 33,
    observations: 1920, x1: 185, y1: 255, x2: 155, y2: 135 },
]

export const risingCorridors = corridors.filter(c => c.trend === 'up').sort((a, b) => b.change7d - a.change7d)
export const fallingCorridors = corridors.filter(c => c.trend === 'down').sort((a, b) => a.change7d - b.change7d)

// ── Regional index ────────────────────────────────────────────
export const regionalData: RegionalIndex[] = [
  { region: 'North', index: 118.4, change7d: 3.1, change30d: 6.8, coverage: 94, corridors: ['DEL-BOM', 'DEL-BLR', 'DEL-MAA', 'DEL-CCU', 'HYD-DEL'] },
  { region: 'South', index: 112.1, change7d: -1.8, change30d: 1.2, coverage: 87, corridors: ['BOM-BLR', 'BLR-MAA', 'DEL-MAA', 'DEL-BLR'] },
  { region: 'West', index: 116.9, change7d: 2.4, change30d: 5.3, coverage: 91, corridors: ['DEL-BOM', 'BOM-BLR', 'BOM-CCU'] },
  { region: 'East', index: 111.3, change7d: -0.6, change30d: -1.4, coverage: 79, corridors: ['DEL-CCU', 'BOM-CCU'] },
]

// ── Booking windows ───────────────────────────────────────────
export const bookingWindowData: BookingWindowPoint[] = [
  { window: 'T+1', label: 'Next day', median: 6840, low: 5900, high: 8200, observations: 412 },
  { window: 'T+7', label: '1 week', median: 5210, low: 4600, high: 6100, observations: 1840 },
  { window: 'T+15', label: '2 weeks', median: 4850, low: 4200, high: 5500, observations: 3210 },
  { window: 'T+30', label: '1 month', median: 4320, low: 3800, high: 5100, observations: 4820 },
  { window: 'T+45', label: '6 weeks', median: 4180, low: 3600, high: 4900, observations: 3940 },
]

// ── Price history (DEL-BOM, last 30 days sample) ──────────────
export const priceHistoryData: PriceHistoryPoint[] = [
  { date: 'Sep 1', indigo: 4200, airIndia: 4450, akasa: 4100, spicejet: 4050, median: 4200 },
  { date: 'Sep 4', indigo: 4350, airIndia: 4580, akasa: 4220, spicejet: 4180, median: 4285 },
  { date: 'Sep 7', indigo: 4510, airIndia: 4700, akasa: 4380, spicejet: 4290, median: 4445 },
  { date: 'Sep 10', indigo: 4620, airIndia: 4820, akasa: 4500, spicejet: 4410, median: 4560 },
  { date: 'Sep 13', indigo: 4580, airIndia: 4780, akasa: 4460, spicejet: 4380, median: 4520 },
  { date: 'Sep 16', indigo: 4700, airIndia: 4900, akasa: 4580, spicejet: 4490, median: 4640 },
  { date: 'Sep 18', indigo: 4850, airIndia: 5050, akasa: 4720, spicejet: 4620, median: 4785 },
]

// ── Data sources ──────────────────────────────────────────────
export const dataSources: DataSource[] = [
  { id: 'src-indigo', name: 'IndiGo', organization: 'InterGlobe Aviation', type: 'AIRLINE',
    status: 'LIVE', lastSuccess: '18 min ago', nextRun: '14:00 IST', frequency: 'Hourly',
    records: 8420, latency: 1840, url: 'https://www.goindigo.in', accessMethod: 'PUBLIC',
    format: 'HTML', apiKeyRequired: false, collectionMethod: 'Playwright' },
  { id: 'src-airindia', name: 'Air India', organization: 'Air India Ltd', type: 'AIRLINE',
    status: 'LIVE', lastSuccess: '21 min ago', nextRun: '14:00 IST', frequency: 'Hourly',
    records: 6210, latency: 2100, url: 'https://www.airindia.com', accessMethod: 'PUBLIC',
    format: 'HTML', apiKeyRequired: false, collectionMethod: 'Playwright' },
  { id: 'src-akasa', name: 'Akasa Air', organization: 'SNV Aviation', type: 'AIRLINE',
    status: 'FRESH', lastSuccess: '34 min ago', nextRun: '14:00 IST', frequency: 'Hourly',
    records: 3840, latency: 1620, url: 'https://www.akasaair.com', accessMethod: 'PUBLIC',
    format: 'HTML', apiKeyRequired: false, collectionMethod: 'Playwright' },
  { id: 'src-spicejet', name: 'SpiceJet', organization: 'SpiceJet Ltd', type: 'AIRLINE',
    status: 'AGING', lastSuccess: '2h 14min ago', nextRun: '14:30 IST', frequency: 'Hourly',
    records: 2910, latency: 3200, url: 'https://www.spicejet.com', accessMethod: 'PUBLIC',
    format: 'HTML', apiKeyRequired: false, collectionMethod: 'Playwright' },
  { id: 'src-mmt', name: 'MakeMyTrip', organization: 'MakeMyTrip Ltd', type: 'OTA',
    status: 'LIVE', lastSuccess: '19 min ago', nextRun: '14:00 IST', frequency: 'Hourly',
    records: 12400, latency: 1950, url: 'https://www.makemytrip.com', accessMethod: 'PUBLIC',
    format: 'HTML', apiKeyRequired: false, collectionMethod: 'Playwright' },
  { id: 'src-mospi', name: 'MoSPI CPI Data', organization: 'Ministry of Statistics', type: 'OFFICIAL_REFERENCE',
    status: 'HEALTHY', lastSuccess: '2 days ago', nextRun: 'Monthly', frequency: 'Monthly',
    records: 480, latency: 0, url: 'https://mospi.gov.in', accessMethod: 'PUBLIC',
    format: 'CSV', apiKeyRequired: false, collectionMethod: 'HTTP Download' },
  { id: 'src-dgca', name: 'DGCA Traffic Data', organization: 'DGCA', type: 'PUBLIC_DATASET',
    status: 'HEALTHY', lastSuccess: '5 days ago', nextRun: 'Monthly', frequency: 'Monthly',
    records: 1240, latency: 0, url: 'https://dgca.gov.in', accessMethod: 'PUBLIC',
    format: 'PDF', apiKeyRequired: false, collectionMethod: 'PDF Parser' },
]

// ── Collectors ────────────────────────────────────────────────
export const collectors: Collector[] = [
  { id: 'col-airfare-playwright', name: 'Airfare Playwright Collector', status: 'ACTIVE',
    lastRun: '13:02 IST', nextRun: '14:00 IST', successRate: 96.4,
    recordsCollected: 21035, recordsRejected: 764, avgLatency: 1920,
    rateLimitEvents: 3, errors: [] },
  { id: 'col-govt-download', name: 'Government Dataset Collector', status: 'ACTIVE',
    lastRun: '09:00 IST', nextRun: 'Tomorrow 09:00', successRate: 100,
    recordsCollected: 1720, recordsRejected: 0, avgLatency: 340,
    rateLimitEvents: 0, errors: [] },
  { id: 'col-spicejet-playwright', name: 'SpiceJet Fallback Collector', status: 'PAUSED',
    lastRun: '11:02 IST', nextRun: 'Manual', successRate: 71.2,
    recordsCollected: 2910, recordsRejected: 1180, avgLatency: 4200,
    rateLimitEvents: 18, errors: ['Rate limit hit at 11:02 IST', 'Challenge page at 10:58 IST'] },
]

// ── Weights ───────────────────────────────────────────────────
export const routeWeights: WeightEntry[] = [
  { route: 'DEL–BOM', weight: 0.212, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'DEL–BLR', weight: 0.168, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'DEL–MAA', weight: 0.143, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'BOM–BLR', weight: 0.159, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'DEL–CCU', weight: 0.121, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'BOM–CCU', weight: 0.098, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'BLR–MAA', weight: 0.055, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
  { route: 'HYD–DEL', weight: 0.044, source: 'DGCA Annual Traffic 2023-24', version: 'v2.1', effectiveDate: '01 Apr 2024' },
]

export const methodologySteps = [
  { id: 'source', label: 'SOURCE', description: 'Airline and OTA portals, government datasets',
    input: 'Live web portals, official government data endpoints',
    output: 'Raw HTML pages, CSV/JSON responses',
    qualityChecks: ['Source availability check', 'Response format validation'],
    method: 'Playwright browser automation for dynamic pages; HTTP for static endpoints',
    limitations: 'Subject to portal availability and anti-scraping measures' },
  { id: 'collection', label: 'COLLECTION', description: 'Automated hourly scraping via Playwright',
    input: 'Source URLs, corridor definitions, travel date parameters',
    output: 'Raw fare observations with metadata',
    qualityChecks: ['Challenge page detection', 'Rate limit detection', 'Timeout handling'],
    method: 'Headless browser automation with retry logic and exponential backoff',
    limitations: 'Individual fare changes between hourly observations are not captured' },
  { id: 'raw', label: 'RAW DATA', description: 'Unprocessed observations stored with full provenance',
    input: 'Scraped HTML/JSON fare data',
    output: 'Structured observation records with source, timestamp, route, fare, advance days',
    qualityChecks: ['Schema validation', 'Null check', 'Duplicate detection'],
    method: 'Structured storage with immutable provenance chain',
    limitations: 'Raw data may include promotional fares and ancillary bundles' },
  { id: 'validation', label: 'VALIDATION', description: 'Schema and business rule checks',
    input: 'Raw observation records',
    output: 'Validated or rejected records with rejection reason',
    qualityChecks: ['Fare range plausibility (₹500–₹50,000)', 'Route code validation', 'Date validity'],
    method: 'Rule-based validation with configurable thresholds',
    limitations: 'Extreme but valid fare spikes may be incorrectly rejected' },
  { id: 'cleaning', label: 'CLEANING', description: 'Duplicate removal, outlier flagging',
    input: 'Validated records',
    output: 'Cleaned observations without exact duplicates',
    qualityChecks: ['Duplicate fingerprint matching', 'Outlier z-score check'],
    method: 'Deterministic deduplication; MAD-based outlier scoring',
    limitations: 'Near-duplicates with minor fare differences are retained' },
  { id: 'normalization', label: 'NORMALIZATION', description: 'Standardize route codes, carrier names, fare types',
    input: 'Cleaned observations',
    output: 'Normalized observations with canonical route and carrier IDs',
    qualityChecks: ['Route code lookup', 'Carrier name mapping'],
    method: 'Reference table lookup with fuzzy matching fallback',
    limitations: 'New carriers may require manual mapping addition' },
  { id: 'matching', label: 'MATCHING', description: 'Match observations to route-date-window combinations',
    input: 'Normalized observations',
    output: 'Matched fare sets by (route, travel-date, booking-window)',
    qualityChecks: ['Minimum observation threshold per cell'],
    method: 'Exact key matching on (route, travel_date, advance_days)',
    limitations: 'Thin cells with fewer than 3 observations are flagged' },
  { id: 'booking-windows', label: 'BOOKING WINDOWS', description: 'Aggregate by T+1, T+7, T+15, T+30, T+45',
    input: 'Matched fare sets',
    output: 'Per-window median, range, and observation count',
    qualityChecks: ['Coverage threshold', 'Range plausibility'],
    method: 'Median and IQR calculation per booking-window bucket',
    limitations: 'Windows defined as ±3 days of nominal advance; boundary effects possible' },
  { id: 'route-weights', label: 'ROUTE WEIGHTS', description: 'Apply DGCA traffic-share weights',
    input: 'Route-level fares, weight table from DGCA',
    output: 'Weighted route fare contributions',
    qualityChecks: ['Weight sum = 1.0 check', 'Weight version validation'],
    method: 'Multiplicative weighting from DGCA annual passenger traffic data',
    limitations: 'Weights lag actual traffic by up to 12 months; seasonal effects not captured' },
  { id: 'jevons', label: 'JEVONS INDEX', description: 'Geometric mean price relative index',
    input: 'Weighted route fare medians',
    output: 'Route-level price relatives',
    qualityChecks: ['Positive fare check', 'Coverage requirement'],
    method: 'Jevons geometric mean: P_J = (∏ pᵢ/p₀)^(1/n) × 100',
    limitations: 'Sensitive to outlier fares; requires reference period baseline' },
  { id: 'regional', label: 'REGIONAL INDEX', description: 'Aggregate corridors to regional index',
    input: 'Route-level Jevons price relatives with weights',
    output: 'North, South, East, West regional airfare indices',
    qualityChecks: ['Region coverage threshold (>2 corridors)', 'Weight consistency'],
    method: 'Weighted geometric mean of corridor relatives within each region',
    limitations: 'Regional groupings follow DGCA classification; may not align with CPI regions' },
  { id: 'national', label: 'ALL-INDIA INDEX', description: 'Final national airfare price index',
    input: 'Regional indices with regional weights',
    output: 'Single all-India airfare price index (base 100)',
    qualityChecks: ['All regions present', 'Index plausibility check'],
    method: 'Weighted geometric mean of regional indices',
    limitations: 'Index reflects observed fares only, not actual transaction prices' },
  { id: 'forecast', label: 'FORECAST', description: 'Statistical range forecast (2/7/14 days)',
    input: 'Historical index series, booking window distributions',
    output: 'Directional forecast with confidence range',
    qualityChecks: ['Minimum history requirement (30 days)', 'Uncertainty threshold'],
    method: 'ARIMA-based point forecast with bootstrap confidence intervals',
    limitations: 'Forecasts are statistical estimates only; external shocks are not modeled' },
  { id: 'anomaly', label: 'ANOMALY DETECTION', description: 'MAD-based unusual movement detection',
    input: 'Route-level fare time series',
    output: 'Anomaly score and classification (Low/Medium/High)',
    qualityChecks: ['Minimum series length', 'Score threshold calibration'],
    method: 'Median Absolute Deviation (MAD): score = |x - median| / MAD',
    limitations: 'Method detects statistical anomalies, not causal drivers' },
  { id: 'publication', label: 'PUBLICATION', description: 'Version, sign, and publish index bulletin',
    input: 'Validated index, quality report, provenance chain',
    output: 'Signed publication with version ID, timestamp, and quality status',
    qualityChecks: ['Quality status assignment', 'Coverage sufficiency', 'Provenance completeness'],
    method: 'Deterministic versioning with SHA-256 content hash',
    limitations: 'Publication cadence is near-real-time; official statistical release requires separate validation' },
]
