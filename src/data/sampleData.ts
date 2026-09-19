// Core index values
export const indexValue = 115.85
export const indexChange7d = 2.34
export const indexChange30d = 5.67
export const totalObservations = 21528
export const activeSources = 7
export const lastUpdated = '18 Sep 2026 · 13:02 IST'

// Types
export type TrendDirection = 'up' | 'down' | 'stable'
export type SourceStatus = 'LIVE' | 'HEALTHY' | 'AGING' | 'STALE' | 'FAILED'
export type CollectorStatus = 'ACTIVE' | 'PAUSED' | 'FAILED'

// Corridor
export interface Corridor {
  id: string
  from: string
  to: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  currentFare: number
  minFare: number
  maxFare: number
  change7d: number
  change30d: number
  trend: TrendDirection
  freshness: number
  weight: number
  observations: number
  carriers: string[]
  bookingWindowOptimal: number
  anomalyScore: number
}

export const corridors: Corridor[] = [
  {
    id: 'DEL-BOM',
    from: 'DEL',
    to: 'BOM',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 19.0896,
    toLng: 72.8656,
    currentFare: 5840,
    minFare: 3200,
    maxFare: 13500,
    change7d: 3.2,
    change30d: 8.1,
    trend: 'up',
    freshness: 4,
    weight: 0.95,
    observations: 2841,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 21,
    anomalyScore: 0.08,
  },
  {
    id: 'DEL-BLR',
    from: 'DEL',
    to: 'BLR',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 13.1986,
    toLng: 77.7066,
    currentFare: 6120,
    minFare: 3500,
    maxFare: 14200,
    change7d: 1.8,
    change30d: 6.4,
    trend: 'up',
    freshness: 6,
    weight: 0.92,
    observations: 2610,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 18,
    anomalyScore: 0.05,
  },
  {
    id: 'DEL-MAA',
    from: 'DEL',
    to: 'MAA',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 12.9941,
    toLng: 80.1709,
    currentFare: 6480,
    minFare: 3800,
    maxFare: 14800,
    change7d: -0.9,
    change30d: 4.2,
    trend: 'down',
    freshness: 9,
    weight: 0.88,
    observations: 1980,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 22,
    anomalyScore: 0.11,
  },
  {
    id: 'DEL-CCU',
    from: 'DEL',
    to: 'CCU',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 22.652,
    toLng: 88.4463,
    currentFare: 5650,
    minFare: 3100,
    maxFare: 12800,
    change7d: 2.1,
    change30d: 7.3,
    trend: 'up',
    freshness: 7,
    weight: 0.87,
    observations: 1854,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 19,
    anomalyScore: 0.07,
  },
  {
    id: 'DEL-HYD',
    from: 'DEL',
    to: 'HYD',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 17.2403,
    toLng: 78.4294,
    currentFare: 5920,
    minFare: 3400,
    maxFare: 13200,
    change7d: 0.5,
    change30d: 3.8,
    trend: 'stable',
    freshness: 5,
    weight: 0.89,
    observations: 2102,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 20,
    anomalyScore: 0.06,
  },
  {
    id: 'DEL-AMD',
    from: 'DEL',
    to: 'AMD',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 23.0772,
    toLng: 72.6347,
    currentFare: 4380,
    minFare: 2600,
    maxFare: 9800,
    change7d: -1.4,
    change30d: 2.1,
    trend: 'down',
    freshness: 12,
    weight: 0.78,
    observations: 1243,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 17,
    anomalyScore: 0.09,
  },
  {
    id: 'DEL-JAI',
    from: 'DEL',
    to: 'JAI',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 26.8242,
    toLng: 75.8122,
    currentFare: 2980,
    minFare: 1800,
    maxFare: 6200,
    change7d: 4.6,
    change30d: 9.2,
    trend: 'up',
    freshness: 15,
    weight: 0.65,
    observations: 890,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 14,
    anomalyScore: 0.14,
  },
  {
    id: 'DEL-SXR',
    from: 'DEL',
    to: 'SXR',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 33.9871,
    toLng: 74.7742,
    currentFare: 4120,
    minFare: 2800,
    maxFare: 10500,
    change7d: 8.3,
    change30d: 22.1,
    trend: 'up',
    freshness: 18,
    weight: 0.72,
    observations: 762,
    carriers: ['6E', 'AI'],
    bookingWindowOptimal: 25,
    anomalyScore: 0.31,
  },
  {
    id: 'DEL-GOI',
    from: 'DEL',
    to: 'GOI',
    fromLat: 28.5665,
    fromLng: 77.1031,
    toLat: 15.3808,
    toLng: 73.8314,
    currentFare: 6750,
    minFare: 4200,
    maxFare: 15200,
    change7d: 5.7,
    change30d: 14.3,
    trend: 'up',
    freshness: 8,
    weight: 0.82,
    observations: 1456,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 28,
    anomalyScore: 0.18,
  },
  {
    id: 'BOM-BLR',
    from: 'BOM',
    to: 'BLR',
    fromLat: 19.0896,
    fromLng: 72.8656,
    toLat: 13.1986,
    toLng: 77.7066,
    currentFare: 3940,
    minFare: 2500,
    maxFare: 8600,
    change7d: 1.2,
    change30d: 4.8,
    trend: 'stable',
    freshness: 5,
    weight: 0.91,
    observations: 2380,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 16,
    anomalyScore: 0.04,
  },
  {
    id: 'BOM-MAA',
    from: 'BOM',
    to: 'MAA',
    fromLat: 19.0896,
    fromLng: 72.8656,
    toLat: 12.9941,
    toLng: 80.1709,
    currentFare: 4280,
    minFare: 2800,
    maxFare: 9400,
    change7d: -0.6,
    change30d: 3.1,
    trend: 'stable',
    freshness: 10,
    weight: 0.86,
    observations: 1876,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 18,
    anomalyScore: 0.06,
  },
  {
    id: 'BOM-CCU',
    from: 'BOM',
    to: 'CCU',
    fromLat: 19.0896,
    fromLng: 72.8656,
    toLat: 22.652,
    toLng: 88.4463,
    currentFare: 5580,
    minFare: 3600,
    maxFare: 11800,
    change7d: 2.8,
    change30d: 6.9,
    trend: 'up',
    freshness: 13,
    weight: 0.80,
    observations: 1320,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 20,
    anomalyScore: 0.09,
  },
  {
    id: 'BOM-HYD',
    from: 'BOM',
    to: 'HYD',
    fromLat: 19.0896,
    fromLng: 72.8656,
    toLat: 17.2403,
    toLng: 78.4294,
    currentFare: 3760,
    minFare: 2400,
    maxFare: 8200,
    change7d: -1.1,
    change30d: 2.4,
    trend: 'down',
    freshness: 7,
    weight: 0.84,
    observations: 1698,
    carriers: ['6E', 'AI', 'SG', 'QP'],
    bookingWindowOptimal: 15,
    anomalyScore: 0.05,
  },
  {
    id: 'BOM-GOI',
    from: 'BOM',
    to: 'GOI',
    fromLat: 19.0896,
    fromLng: 72.8656,
    toLat: 15.3808,
    toLng: 73.8314,
    currentFare: 3420,
    minFare: 2200,
    maxFare: 7800,
    change7d: 6.4,
    change30d: 18.2,
    trend: 'up',
    freshness: 6,
    weight: 0.77,
    observations: 1105,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 22,
    anomalyScore: 0.22,
  },
  {
    id: 'BOM-COK',
    from: 'BOM',
    to: 'COK',
    fromLat: 19.0896,
    fromLng: 72.8656,
    toLat: 10.152,
    toLng: 76.4019,
    currentFare: 4650,
    minFare: 3000,
    maxFare: 10200,
    change7d: 1.9,
    change30d: 5.6,
    trend: 'up',
    freshness: 11,
    weight: 0.76,
    observations: 980,
    carriers: ['6E', 'AI', 'SG'],
    bookingWindowOptimal: 19,
    anomalyScore: 0.08,
  },
  {
    id: 'BLR-MAA',
    from: 'BLR',
    to: 'MAA',
    fromLat: 13.1986,
    fromLng: 77.7066,
    toLat: 12.9941,
    toLng: 80.1709,
    currentFare: 2780,
    minFare: 1800,
    maxFare: 5800,
    change7d: 0.3,
    change30d: 1.9,
    trend: 'stable',
    freshness: 8,
    weight: 0.83,
    observations: 1562,
    carriers: ['6E', 'AI', 'SG', 'S5'],
    bookingWindowOptimal: 12,
    anomalyScore: 0.03,
  },
  {
    id: 'BLR-HYD',
    from: 'BLR',
    to: 'HYD',
    fromLat: 13.1986,
    fromLng: 77.7066,
    toLat: 17.2403,
    toLng: 78.4294,
    currentFare: 2920,
    minFare: 1900,
    maxFare: 6100,
    change7d: -0.7,
    change30d: 2.3,
    trend: 'stable',
    freshness: 9,
    weight: 0.80,
    observations: 1340,
    carriers: ['6E', 'AI', 'SG', 'S5'],
    bookingWindowOptimal: 13,
    anomalyScore: 0.04,
  },
  {
    id: 'BLR-CCU',
    from: 'BLR',
    to: 'CCU',
    fromLat: 13.1986,
    fromLng: 77.7066,
    toLat: 22.652,
    toLng: 88.4463,
    currentFare: 5240,
    minFare: 3400,
    maxFare: 11200,
    change7d: 3.4,
    change30d: 7.8,
    trend: 'up',
    freshness: 16,
    weight: 0.74,
    observations: 876,
    carriers: ['6E', 'AI'],
    bookingWindowOptimal: 21,
    anomalyScore: 0.12,
  },
  {
    id: 'MAA-HYD',
    from: 'MAA',
    to: 'HYD',
    fromLat: 12.9941,
    fromLng: 80.1709,
    toLat: 17.2403,
    toLng: 78.4294,
    currentFare: 2650,
    minFare: 1700,
    maxFare: 5600,
    change7d: -1.8,
    change30d: 0.8,
    trend: 'down',
    freshness: 14,
    weight: 0.79,
    observations: 1124,
    carriers: ['6E', 'AI', 'SG', 'S5'],
    bookingWindowOptimal: 11,
    anomalyScore: 0.05,
  },
  {
    id: 'CCU-GAU',
    from: 'CCU',
    to: 'GAU',
    fromLat: 22.652,
    fromLng: 88.4463,
    toLat: 26.1061,
    toLng: 91.5859,
    currentFare: 3180,
    minFare: 2100,
    maxFare: 7200,
    change7d: 4.2,
    change30d: 10.6,
    trend: 'up',
    freshness: 22,
    weight: 0.68,
    observations: 642,
    carriers: ['6E', 'AI'],
    bookingWindowOptimal: 16,
    anomalyScore: 0.16,
  },
]

// Regional data
export interface RegionalData {
  region: string
  avgFare: number
  change7d: number
  change30d: number
  trend: TrendDirection
  topRoute: string
  routeCount: number
  observations: number
}

export const regionalData: RegionalData[] = [
  {
    region: 'North India',
    avgFare: 5120,
    change7d: 2.8,
    change30d: 7.4,
    trend: 'up',
    topRoute: 'DEL-BOM',
    routeCount: 12,
    observations: 6840,
  },
  {
    region: 'South India',
    avgFare: 3890,
    change7d: 0.6,
    change30d: 3.2,
    trend: 'stable',
    topRoute: 'BLR-MAA',
    routeCount: 9,
    observations: 5102,
  },
  {
    region: 'West India',
    avgFare: 4340,
    change7d: 3.1,
    change30d: 9.8,
    trend: 'up',
    topRoute: 'BOM-GOI',
    routeCount: 8,
    observations: 4280,
  },
  {
    region: 'East India',
    avgFare: 4680,
    change7d: 3.6,
    change30d: 8.5,
    trend: 'up',
    topRoute: 'CCU-GAU',
    routeCount: 6,
    observations: 2840,
  },
  {
    region: 'Northeast India',
    avgFare: 5420,
    change7d: 5.2,
    change30d: 14.1,
    trend: 'up',
    topRoute: 'DEL-GAU',
    routeCount: 4,
    observations: 1460,
  },
  {
    region: 'Island Routes',
    avgFare: 7890,
    change7d: 6.8,
    change30d: 19.3,
    trend: 'up',
    topRoute: 'DEL-IXZ',
    routeCount: 3,
    observations: 1006,
  },
]

// Booking window data T+1 to T+45
export const bookingWindowData: Array<{
  window: number
  label: string
  avgFare: number
  indexValue: number
  demand: number
}> = [
  { window: 1, label: 'T+1', avgFare: 14200, indexValue: 198.4, demand: 0.42 },
  { window: 2, label: 'T+2', avgFare: 13100, indexValue: 183.1, demand: 0.46 },
  { window: 3, label: 'T+3', avgFare: 11800, indexValue: 164.9, demand: 0.51 },
  { window: 4, label: 'T+4', avgFare: 10600, indexValue: 148.1, demand: 0.55 },
  { window: 5, label: 'T+5', avgFare: 9800, indexValue: 136.9, demand: 0.58 },
  { window: 7, label: 'T+7', avgFare: 8600, indexValue: 120.2, demand: 0.64 },
  { window: 10, label: 'T+10', avgFare: 7400, indexValue: 103.4, demand: 0.71 },
  { window: 14, label: 'T+14', avgFare: 6200, indexValue: 86.6, demand: 0.78 },
  { window: 18, label: 'T+18', avgFare: 5480, indexValue: 76.6, demand: 0.83 },
  { window: 21, label: 'T+21', avgFare: 4900, indexValue: 68.5, demand: 0.88 },
  { window: 25, label: 'T+25', avgFare: 4580, indexValue: 64.0, demand: 0.91 },
  { window: 30, label: 'T+30', avgFare: 4200, indexValue: 58.7, demand: 0.94 },
  { window: 35, label: 'T+35', avgFare: 3980, indexValue: 55.6, demand: 0.96 },
  { window: 40, label: 'T+40', avgFare: 3740, indexValue: 52.3, demand: 0.97 },
  { window: 45, label: 'T+45', avgFare: 3500, indexValue: 48.9, demand: 0.98 },
]

// Price history (90 days) for top routes
export const priceHistoryData: Array<{
  date: string
  DEL_BOM: number
  DEL_BLR: number
  BOM_BLR: number
  DEL_MAA: number
  index: number
}> = (() => {
  const data: Array<{ date: string; DEL_BOM: number; DEL_BLR: number; BOM_BLR: number; DEL_MAA: number; index: number }> = []
  const base = new Date('2026-06-20')
  const seedDEL_BOM = 5200
  const seedDEL_BLR = 5600
  const seedBOM_BLR = 3600
  const seedDEL_MAA = 6000
  const seedIndex = 108.5
  for (let i = 0; i < 90; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const wave = Math.sin(i * 0.31 + 1.2) * 0.04 + Math.sin(i * 0.11) * 0.03 + (i / 90) * 0.06
    const festival = i >= 55 && i <= 65 ? 0.12 : 0
    data.push({
      date: dateStr,
      DEL_BOM: Math.round(seedDEL_BOM * (1 + wave + festival)),
      DEL_BLR: Math.round(seedDEL_BLR * (1 + wave * 0.9 + festival * 0.8)),
      BOM_BLR: Math.round(seedBOM_BLR * (1 + wave * 0.7 + festival * 0.5)),
      DEL_MAA: Math.round(seedDEL_MAA * (1 + wave * 0.85 + festival * 0.9)),
      index: Math.round((seedIndex * (1 + wave * 0.6 + festival * 0.4)) * 100) / 100,
    })
  }
  return data
})()

// Data sources
export interface DataSource {
  id: string
  name: string
  type: 'OTA' | 'GDS' | 'DGCA' | 'AIRLINE_DIRECT' | 'AGGREGATOR'
  status: SourceStatus
  lastPing: string
  latencyMs: number
  successRate: number
  recordsToday: number
  coverageRoutes: number
  weight: number
  apiVersion: string
  region: string
}

export const dataSources: DataSource[] = [
  {
    id: 'src-001',
    name: 'MakeMyTrip API',
    type: 'OTA',
    status: 'LIVE',
    lastPing: '2026-09-18T13:01:44Z',
    latencyMs: 182,
    successRate: 99.2,
    recordsToday: 4820,
    coverageRoutes: 148,
    weight: 0.22,
    apiVersion: 'v3.4',
    region: 'IN',
  },
  {
    id: 'src-002',
    name: 'Yatra OTA Feed',
    type: 'OTA',
    status: 'LIVE',
    lastPing: '2026-09-18T13:01:38Z',
    latencyMs: 241,
    successRate: 97.8,
    recordsToday: 3910,
    coverageRoutes: 122,
    weight: 0.18,
    apiVersion: 'v2.9',
    region: 'IN',
  },
  {
    id: 'src-003',
    name: 'Amadeus GDS',
    type: 'GDS',
    status: 'HEALTHY',
    lastPing: '2026-09-18T13:00:12Z',
    latencyMs: 310,
    successRate: 98.5,
    recordsToday: 5640,
    coverageRoutes: 198,
    weight: 0.26,
    apiVersion: 'v21.3',
    region: 'GLOBAL',
  },
  {
    id: 'src-004',
    name: 'DGCA Public Tariff',
    type: 'DGCA',
    status: 'AGING',
    lastPing: '2026-09-18T09:15:00Z',
    latencyMs: 892,
    successRate: 91.4,
    recordsToday: 1240,
    coverageRoutes: 87,
    weight: 0.14,
    apiVersion: 'v1.2',
    region: 'IN',
  },
  {
    id: 'src-005',
    name: 'IndiGo Direct',
    type: 'AIRLINE_DIRECT',
    status: 'LIVE',
    lastPing: '2026-09-18T13:01:52Z',
    latencyMs: 145,
    successRate: 99.7,
    recordsToday: 3280,
    coverageRoutes: 94,
    weight: 0.20,
    apiVersion: 'v4.1',
    region: 'IN',
  },
  {
    id: 'src-006',
    name: 'Air India API',
    type: 'AIRLINE_DIRECT',
    status: 'HEALTHY',
    lastPing: '2026-09-18T12:58:20Z',
    latencyMs: 278,
    successRate: 96.3,
    recordsToday: 2180,
    coverageRoutes: 76,
    weight: 0.16,
    apiVersion: 'v3.0',
    region: 'IN',
  },
  {
    id: 'src-007',
    name: 'Skyscanner Aggregate',
    type: 'AGGREGATOR',
    status: 'HEALTHY',
    lastPing: '2026-09-18T12:55:00Z',
    latencyMs: 420,
    successRate: 94.1,
    recordsToday: 2980,
    coverageRoutes: 161,
    weight: 0.12,
    apiVersion: 'v5.2',
    region: 'GLOBAL',
  },
]

// Collectors
export interface Collector {
  id: string
  name: string
  status: CollectorStatus
  sourcesAssigned: string[]
  requestsPerHour: number
  successRate: number
  avgLatencyMs: number
  lastHeartbeat: string
  region: string
  ipAddress: string
  uptimeHours: number
}

export const collectors: Collector[] = [
  {
    id: 'col-001',
    name: 'collector-mumbai-01',
    status: 'ACTIVE',
    sourcesAssigned: ['src-001', 'src-002', 'src-005'],
    requestsPerHour: 4820,
    successRate: 98.6,
    avgLatencyMs: 189,
    lastHeartbeat: '2026-09-18T13:01:58Z',
    region: 'ap-south-1',
    ipAddress: '10.0.1.42',
    uptimeHours: 312,
  },
  {
    id: 'col-002',
    name: 'collector-delhi-01',
    status: 'ACTIVE',
    sourcesAssigned: ['src-003', 'src-006', 'src-007'],
    requestsPerHour: 3960,
    successRate: 97.2,
    avgLatencyMs: 256,
    lastHeartbeat: '2026-09-18T13:01:45Z',
    region: 'ap-south-1',
    ipAddress: '10.0.2.18',
    uptimeHours: 289,
  },
  {
    id: 'col-003',
    name: 'collector-bangalore-01',
    status: 'ACTIVE',
    sourcesAssigned: ['src-004'],
    requestsPerHour: 1240,
    successRate: 91.4,
    avgLatencyMs: 890,
    lastHeartbeat: '2026-09-18T09:16:00Z',
    region: 'ap-south-1',
    ipAddress: '10.0.3.77',
    uptimeHours: 504,
  },
]

// Route weights
export interface RouteWeight {
  route: string
  weight: number
  basis: string
  dgcaPaxShare: number
  revenueShare: number
  lastReviewed: string
}

export const routeWeights: RouteWeight[] = [
  { route: 'DEL-BOM', weight: 0.95, basis: 'DGCA + Revenue', dgcaPaxShare: 18.4, revenueShare: 21.2, lastReviewed: '2026-09-01' },
  { route: 'DEL-BLR', weight: 0.92, basis: 'DGCA + Revenue', dgcaPaxShare: 15.2, revenueShare: 17.8, lastReviewed: '2026-09-01' },
  { route: 'BOM-BLR', weight: 0.91, basis: 'DGCA + Revenue', dgcaPaxShare: 14.8, revenueShare: 16.4, lastReviewed: '2026-09-01' },
  { route: 'DEL-MAA', weight: 0.88, basis: 'DGCA + Revenue', dgcaPaxShare: 11.6, revenueShare: 13.1, lastReviewed: '2026-09-01' },
  { route: 'DEL-HYD', weight: 0.89, basis: 'DGCA + Revenue', dgcaPaxShare: 12.1, revenueShare: 13.8, lastReviewed: '2026-09-01' },
  { route: 'DEL-CCU', weight: 0.87, basis: 'DGCA + Revenue', dgcaPaxShare: 10.4, revenueShare: 11.9, lastReviewed: '2026-09-01' },
  { route: 'BOM-HYD', weight: 0.84, basis: 'DGCA', dgcaPaxShare: 9.2, revenueShare: 10.1, lastReviewed: '2026-09-01' },
  { route: 'BOM-MAA', weight: 0.86, basis: 'DGCA', dgcaPaxShare: 9.8, revenueShare: 11.2, lastReviewed: '2026-09-01' },
  { route: 'BLR-MAA', weight: 0.83, basis: 'DGCA', dgcaPaxShare: 8.6, revenueShare: 9.4, lastReviewed: '2026-09-01' },
  { route: 'BLR-HYD', weight: 0.80, basis: 'DGCA', dgcaPaxShare: 7.9, revenueShare: 8.6, lastReviewed: '2026-09-01' },
]

// Methodology steps
export interface MethodologyStep {
  step: number
  title: string
  description: string
  category: 'COLLECTION' | 'PROCESSING' | 'INDEXING' | 'VALIDATION' | 'DISTRIBUTION'
}

export const methodologySteps: MethodologyStep[] = [
  {
    step: 1,
    title: 'Multi-Source Data Ingestion',
    description: 'Raw fare data is ingested continuously from 7+ sources including OTAs, GDS systems, airline direct APIs, and the DGCA public tariff database. Collectors run distributed across three Indian cloud regions with sub-minute polling intervals on Tier-1 routes.',
    category: 'COLLECTION',
  },
  {
    step: 2,
    title: 'Deduplication and Record Merging',
    description: 'Duplicate observations arising from multiple sources reporting the same flight are detected using a fingerprint composed of (carrier, flight number, departure date, booking class, cabin). The lowest fare wins when duplicates conflict, reflecting actual consumer-available pricing.',
    category: 'PROCESSING',
  },
  {
    step: 3,
    title: 'Outlier Scrubbing',
    description: 'Fare records more than 3.5 standard deviations from the rolling 30-day corridor median are flagged and held in quarantine. Quarantined records trigger an anomaly alert and require confirmation from a second source before inclusion, preventing data poisoning from OTA pricing errors.',
    category: 'PROCESSING',
  },
  {
    step: 4,
    title: 'Cabin and Class Normalisation',
    description: 'All fares are normalised to Economy-class base fares. Business and Premium Economy fares are retained in a parallel index. Sub-class variants (Saver, Flexi, Full-Flex) are mapped to a standardised fare ladder using carrier-specific class hierarchies updated quarterly.',
    category: 'PROCESSING',
  },
  {
    step: 5,
    title: 'Tax and Surcharge Stripping',
    description: 'Government taxes (GST, UDF, PSF, CUTE) and fuel surcharges are stripped using carrier-published surcharge tables to produce a comparable base fare. The all-in fare is retained for consumer-facing displays. Both metrics are stored in the time-series database.',
    category: 'PROCESSING',
  },
  {
    step: 6,
    title: 'Booking Window Segmentation',
    description: 'Each observation is tagged with the booking window bucket (T+1 through T+90) based on the difference between observation timestamp and the scheduled departure date. Observations within each bucket are aggregated separately, enabling the booking-window demand curve to be constructed per corridor.',
    category: 'PROCESSING',
  },
  {
    step: 7,
    title: 'DGCA Traffic Weighting',
    description: 'Each corridor receives a weight proportional to its share of total Indian domestic passenger traffic as reported in the DGCA Monthly Traffic Statistics. Weights are recomputed quarterly. The current weighting reflects the April–June 2026 DGCA release.',
    category: 'INDEXING',
  },
  {
    step: 8,
    title: 'Laspeyres Price Index Construction',
    description: 'The AeroPrice India Index is computed as a weighted Laspeyres index with base period January 2025 = 100. Each corridor\'s current-period average fare (T+21 observation window) is compared to its base-period fare and multiplied by the DGCA traffic weight before summation.',
    category: 'INDEXING',
  },
  {
    step: 9,
    title: 'Seasonality Decomposition',
    description: 'An STL (Seasonal-Trend decomposition using Loess) model decomposes each corridor\'s fare time series into trend, seasonal, and residual components. The seasonal component captures recurring patterns around festivals, school holidays, and cricket events. The residual component feeds the anomaly detector.',
    category: 'INDEXING',
  },
  {
    step: 10,
    title: 'Anomaly Detection',
    description: 'Corridor residuals are monitored with an Isolation Forest model retrained weekly on 52 weeks of data. Observations with an anomaly score above 0.7 trigger an alert classified as SPIKE, DIP, or SUSTAINED depending on the direction and duration of the deviation relative to the seasonal trend.',
    category: 'VALIDATION',
  },
  {
    step: 11,
    title: 'Cross-Source Consensus Validation',
    description: 'For each corridor, the 7-day rolling average fare is compared across all active sources. If any source deviates by more than 12% from the consensus median its weight is halved and a data quality flag is raised. Persistent deviation beyond 72 hours triggers a source health alert.',
    category: 'VALIDATION',
  },
  {
    step: 12,
    title: 'Freshness Scoring',
    description: 'Each corridor record is assigned a freshness score (minutes since last confirmed observation) displayed in the dashboard. Corridors with no fresh observation for more than 60 minutes have their index contribution interpolated from the trend model rather than replaced with stale data.',
    category: 'VALIDATION',
  },
  {
    step: 13,
    title: 'Holiday and Event Calendar Integration',
    description: 'A curated calendar of Indian public holidays, major festivals (Diwali, Holi, Eid, Durga Puja), IPL schedule, and long weekends is integrated into the forecasting model. Routes with known event sensitivity are tagged, and expected price pressure multipliers are published in the corridor metadata.',
    category: 'INDEXING',
  },
  {
    step: 14,
    title: 'Index Publication and Versioning',
    description: 'The index is computed and published every 15 minutes. Each release is assigned an immutable version number and retained for 24 months. Downstream API consumers can pin to a specific version or subscribe to the live stream. Methodology revisions increment the minor version; basket changes increment the major version.',
    category: 'DISTRIBUTION',
  },
  {
    step: 15,
    title: 'Audit Trail and Regulatory Compliance',
    description: 'All raw fare observations, intermediate computations, and final index values are written to an append-only audit log stored in two geographically separate Indian data centres. The audit trail is available to DGCA and SEBI upon request in compliance with the Digital Personal Data Protection Act 2023 and the proposed Aviation Data Governance Framework.',
    category: 'DISTRIBUTION',
  },
]

// Carriers
export interface Carrier {
  name: string
  code: string
  color: string
  marketShare: number
  avgFare: number
  routes: number
  onTimePerf: number
}

export const carriers: Carrier[] = [
  {
    name: 'IndiGo',
    code: '6E',
    color: '#4F46E5',
    marketShare: 58.2,
    avgFare: 4820,
    routes: 94,
    onTimePerf: 82.4,
  },
  {
    name: 'Air India',
    code: 'AI',
    color: '#DC2626',
    marketShare: 19.6,
    avgFare: 6240,
    routes: 76,
    onTimePerf: 74.8,
  },
  {
    name: 'SpiceJet',
    code: 'SG',
    color: '#EA580C',
    marketShare: 10.4,
    avgFare: 4120,
    routes: 58,
    onTimePerf: 68.2,
  },
  {
    name: 'Akasa Air',
    code: 'QP',
    color: '#F59E0B',
    marketShare: 8.1,
    avgFare: 4560,
    routes: 42,
    onTimePerf: 88.6,
  },
  {
    name: 'StarAir',
    code: 'S5',
    color: '#0891B2',
    marketShare: 3.7,
    avgFare: 3890,
    routes: 18,
    onTimePerf: 79.3,
  },
]

// Price alerts
export interface PriceAlert {
  id: string
  route: string
  targetFare: number
  currentFare: number
  triggered: boolean
  createdAt: string
}

export const sampleAlerts: PriceAlert[] = [
  {
    id: 'alert-001',
    route: 'DEL-GOI',
    targetFare: 5500,
    currentFare: 6750,
    triggered: false,
    createdAt: '2026-09-10T08:30:00Z',
  },
  {
    id: 'alert-002',
    route: 'BOM-BLR',
    targetFare: 3800,
    currentFare: 3940,
    triggered: false,
    createdAt: '2026-09-12T14:15:00Z',
  },
  {
    id: 'alert-003',
    route: 'DEL-BOM',
    targetFare: 5500,
    currentFare: 5840,
    triggered: false,
    createdAt: '2026-09-14T09:00:00Z',
  },
  {
    id: 'alert-004',
    route: 'BLR-MAA',
    targetFare: 2600,
    currentFare: 2780,
    triggered: false,
    createdAt: '2026-09-15T11:45:00Z',
  },
  {
    id: 'alert-005',
    route: 'DEL-SXR',
    targetFare: 3800,
    currentFare: 4120,
    triggered: true,
    createdAt: '2026-09-05T07:20:00Z',
  },
]

// Holiday / event calendar
export interface PricePressureEvent {
  date: string
  name: string
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  routes: string[]
}

export const pricePressureEvents: PricePressureEvent[] = [
  {
    date: '2026-10-02',
    name: 'Gandhi Jayanti (Long Weekend)',
    impact: 'MEDIUM',
    routes: ['DEL-BOM', 'DEL-BLR', 'DEL-GOI', 'BOM-GOI'],
  },
  {
    date: '2026-10-20',
    name: 'Dussehra',
    impact: 'HIGH',
    routes: ['DEL-BOM', 'DEL-BLR', 'DEL-MAA', 'DEL-HYD', 'BOM-BLR', 'BOM-MAA'],
  },
  {
    date: '2026-10-29',
    name: 'Diwali Eve',
    impact: 'HIGH',
    routes: ['DEL-BOM', 'DEL-BLR', 'DEL-MAA', 'DEL-CCU', 'DEL-HYD', 'DEL-AMD', 'DEL-JAI', 'BOM-BLR'],
  },
  {
    date: '2026-11-01',
    name: 'Diwali Post Long Weekend',
    impact: 'HIGH',
    routes: ['DEL-BOM', 'BOM-BLR', 'DEL-BLR', 'CCU-GAU'],
  },
  {
    date: '2026-11-15',
    name: 'Guru Nanak Jayanti',
    impact: 'MEDIUM',
    routes: ['DEL-ATQ', 'DEL-IXC', 'BOM-ATQ'],
  },
  {
    date: '2026-12-25',
    name: 'Christmas',
    impact: 'HIGH',
    routes: ['DEL-GOI', 'BOM-GOI', 'DEL-IXZ', 'BOM-COK', 'DEL-BLR'],
  },
  {
    date: '2026-12-31',
    name: 'New Year Eve',
    impact: 'HIGH',
    routes: ['DEL-GOI', 'BOM-GOI', 'DEL-BOM', 'BOM-BLR', 'DEL-BLR'],
  },
  {
    date: '2027-01-26',
    name: 'Republic Day (Long Weekend)',
    impact: 'MEDIUM',
    routes: ['DEL-BOM', 'DEL-BLR', 'DEL-GOI', 'DEL-JAI'],
  },
  {
    date: '2027-03-01',
    name: 'Holi',
    impact: 'HIGH',
    routes: ['DEL-BOM', 'DEL-BLR', 'DEL-HYD', 'DEL-CCU', 'BOM-BLR'],
  },
]

// Anomalies
export interface Anomaly {
  id: string
  route: string
  detectedAt: string
  fare: number
  expectedFare: number
  deviation: number
  type: 'SPIKE' | 'DIP' | 'SUSTAINED'
  resolved: boolean
}

export const recentAnomalies: Anomaly[] = [
  {
    id: 'anom-001',
    route: 'DEL-SXR',
    detectedAt: '2026-09-17T08:24:00Z',
    fare: 8200,
    expectedFare: 4120,
    deviation: 99.0,
    type: 'SPIKE',
    resolved: false,
  },
  {
    id: 'anom-002',
    route: 'DEL-GOI',
    detectedAt: '2026-09-16T14:52:00Z',
    fare: 9800,
    expectedFare: 6750,
    deviation: 45.2,
    type: 'SPIKE',
    resolved: false,
  },
  {
    id: 'anom-003',
    route: 'BOM-GOI',
    detectedAt: '2026-09-15T10:18:00Z',
    fare: 5600,
    expectedFare: 3420,
    deviation: 63.7,
    type: 'SUSTAINED',
    resolved: false,
  },
  {
    id: 'anom-004',
    route: 'DEL-JAI',
    detectedAt: '2026-09-14T17:40:00Z',
    fare: 1400,
    expectedFare: 2980,
    deviation: -53.0,
    type: 'DIP',
    resolved: true,
  },
  {
    id: 'anom-005',
    route: 'BLR-CCU',
    detectedAt: '2026-09-13T06:15:00Z',
    fare: 7900,
    expectedFare: 5240,
    deviation: 50.8,
    type: 'SPIKE',
    resolved: true,
  },
  {
    id: 'anom-006',
    route: 'MAA-HYD',
    detectedAt: '2026-09-12T21:33:00Z',
    fare: 1100,
    expectedFare: 2650,
    deviation: -58.5,
    type: 'DIP',
    resolved: true,
  },
]
