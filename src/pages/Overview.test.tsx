import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import Overview from './Overview'
import { __resetIndiaGeoJsonCache } from '../services/indiaGeoJson'
import type { FareObservationApi } from '../services/api'

const authState = vi.hoisted(() => ({
  user: { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' } as { email: string; name: string; role: string; plan: string } | null,
  token: 'test-token' as string | null,
}))
const radarState = vi.hoisted(() => ({
  snapshot: null as { aircraft: unknown[]; source: string; retrievedAt: string | null; status: string; refreshing: boolean; history: [] } | null,
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}))
vi.mock('../services/api', () => ({
  apiDashboard: vi.fn(),
  apiFareMovement: vi.fn(),
  apiFares: vi.fn(),
  apiPriceAlerts: vi.fn(),
  apiIndexHistory: vi.fn(),
}))
vi.mock('../services/aviationRadar', () => ({
  useAviationRadar: vi.fn(() => radarState.snapshot ?? { aircraft: [], source: '', retrievedAt: null, status: 'loading', refreshing: false, history: [] }),
}))

const api = await import('../services/api')
const radar = await import('../services/aviationRadar')
const fetchMock = vi.fn<typeof fetch>()

const aviationBody = {
  source: 'ADSB.lol', data_origin: 'LIVE_ADSB', provider_status: 'LIVE' as const,
  retrieved_at: '2026-11-22T10:00:00.000Z', count: 3,
  aircraft: [
    {
      icao24: '800123', callsign: 'IGO123', registration: 'VT-ABC', aircraft_type: 'A320',
      latitude: 19.1, longitude: 72.9, altitude_ft: 35000, ground_speed_kts: 450,
      track_deg: 90, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 5,
    },
    {
      icao24: '800456', callsign: 'AIC456', registration: 'VT-DEF', aircraft_type: 'B787',
      latitude: 28.5, longitude: 77.1, altitude_ft: 38000, ground_speed_kts: 470,
      track_deg: 180, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 8,
    },
    {
      icao24: '800789', callsign: 'AKJ789', registration: 'VT-GHI', aircraft_type: 'B737',
      latitude: 13.2, longitude: 77.7, altitude_ft: 33000, ground_speed_kts: 430,
      track_deg: 270, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 3,
    },
  ],
}

function radarSnapshot(status: string, aircraft: unknown[]) {
  return { aircraft, source: 'ADSB.lol', retrievedAt: '2026-11-22T10:00:00.000Z', status, refreshing: false, history: [] as [] }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  authState.user = { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' }
  authState.token = 'test-token'
  radarState.snapshot = radarSnapshot('connected', aviationBody.aircraft)
  __resetIndiaGeoJsonCache()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ features: [] })))
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(api.apiDashboard).mockResolvedValue({
    real_observations: 3750, sources_live: 2, sources_challenge_detected: 0,
    gov_datasets_connected: 1, collection_runs_today: 3, last_collection: '2026-09-28T10:00:00Z',
    index_status: 'PUBLISHED', index_value: 101.2, routes_tracked: 12, price_drops: 2,
    note: '', timestamp: '2026-11-22T10:00:00Z',
  })
  vi.mocked(api.apiFareMovement).mockResolvedValue({
    available: true, price_drops: 2, routes: [], states: {},
  })
  vi.mocked(api.apiFares).mockResolvedValue({ observations: [], total: 0, page: 1, page_size: 200, note: '' })
  vi.mocked(api.apiPriceAlerts).mockResolvedValue({ alerts: [] })
  // Default: a single published day, so the index KPI helper stays on
  // "Verified index pending" unless a test seeds two days.
  vi.mocked(api.apiIndexHistory).mockResolvedValue({
    frequency: 'daily', count: 1,
    observations: [
      { period: '2026-11-23', value: 100.56, status: 'PUBLISHED', route_count: 12, observation_count: 601, data_origin: 'DERIVED' },
    ],
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

test('M7: the state map uses the shared cached GeoJSON loader — one fetch across remounts', async () => {
  // Track A shares one cached load of india-states-2019.geojson between
  // the fare map, the radar map and this Overview map. A second mount must
  // reuse the cached load instead of fetching the 271-feature file again.
  const { unmount } = render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  unmount()
  render(<Overview onNavigate={() => {}} />)
  await screen.findByText('Popular Routes')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('/maps/india-states-2019.geojson')
})

test('D4: the Aircraft-tracked KPI comes from the shared radar store, not a page poller', async () => {
  // The Overview no longer polls /api/aviation/live itself every 60 s —
  // the shared radar store (single authed 30 s poll, M2-fixed) serves this
  // KPI, the fare map and the radar map. The KPI still shows the live
  // feed's aircraft count (3 here).
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(radar.useAviationRadar).toHaveBeenCalledWith(true))
  const label = await screen.findByText('Aircraft tracked')
  expect(label.previousElementSibling?.textContent).toBe('3')
})

test('D4: an unavailable radar feed leaves the KPI blank instead of inventing a count', async () => {
  radarState.snapshot = radarSnapshot('unavailable', [])
  render(<Overview onNavigate={() => {}} />)
  const label = await screen.findByText('Aircraft tracked')
  expect(label.previousElementSibling?.textContent).toBe('—')
})

test('D4: cached radar positions still count, and an empty feed honestly shows 0', async () => {
  radarState.snapshot = radarSnapshot('cached', aviationBody.aircraft.slice(0, 2))
  const { rerender } = render(<Overview onNavigate={() => {}} />)
  const label = await screen.findByText('Aircraft tracked')
  expect(label.previousElementSibling?.textContent).toBe('2')
  radarState.snapshot = radarSnapshot('empty', [])
  rerender(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(label.previousElementSibling?.textContent).toBe('0'))
})

test('D4 + ITEM 4: a guest never polls the radar and never sees a stale aircraft count', async () => {
  // No token: the radar hook stays disabled, so no unauthenticated poll
  // fires a 401 — and the KPI stays blank even though the shared store
  // still holds positions from an earlier signed-in session.
  authState.user = null
  authState.token = null
  radarState.snapshot = radarSnapshot('connected', aviationBody.aircraft)
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(radar.useAviationRadar).toHaveBeenCalledWith(false))
  const label = await screen.findByText('Aircraft tracked')
  expect(label.previousElementSibling?.textContent).toBe('—')
  // The guest Overview also skips the auth-gated index history (ITEM 4):
  // firing it token-less would log a pointless 401 on every guest visit.
  await waitFor(() => expect(api.apiDashboard).toHaveBeenCalled())
  expect(api.apiIndexHistory).not.toHaveBeenCalled()
  expect(api.apiPriceAlerts).not.toHaveBeenCalled()
})

test('Aircraft tracked and Fare observations are two different figures', async () => {
  // Round 2 item 5: the browser report read "Aircraft tracked 4137" — that
  // was the adjacent Fare observations KPI. The aircraft KPI is the live
  // feed's aircraft count (3 here); the observations KPI is the dashboard's
  // real_observations (3750 here, rendered unformatted in the hero). They
  // must never be confused.
  render(<Overview onNavigate={() => {}} />)
  const aircraftLabel = await screen.findByText('Aircraft tracked')
  expect(aircraftLabel.previousElementSibling?.textContent).toBe('3')
  const observationsLabel = await screen.findByText('Fare observations')
  expect(observationsLabel.previousElementSibling?.textContent).toBe('3750')
})

function fareRow(id: string, totalFare: number): FareObservationApi {
  return {
    observation_id: id, route: 'DEL-BOM', airline: 'IndiGo', flight_number: '6E123',
    departure_time: null, arrival_time: null, stops: 0, travel_date: '2026-12-01',
    advance_days: 7, fare_family: 'ECONOMY', cabin: 'ECONOMY', base_fare: totalFare,
    taxes: 0, total_fare: totalFare, currency: 'INR', source: 'Google Flights',
    data_origin: 'PUBLIC_INTERFACE', collected_at: '2026-09-28T10:00:00Z', quality_flags: [],
  }
}

const faresResponse = (fares: number[]) => ({
  observations: fares.map((total_fare, index) => fareRow(`OBS-${index}`, total_fare)),
  total: fares.length, page: 1, page_size: 200, note: '',
})

test('ITEM 3: every loaded route card shows a freshness badge from its latest collection', async () => {
  vi.mocked(api.apiFares).mockImplementation(async () => faresResponse([5000, 6000]))
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(screen.getAllByText('₹5,500').length).toBeGreaterThan(0), { timeout: 5000 })
  // One DataFreshness badge per card (role="status"), each stamped from
  // the newest collected_at of that card's fares — same pattern as
  // LiveFares. The fixture rows carry the live data's newest collection
  // (28 Sep 2026), so the badge reads STALE with an "ago" age rather than
  // pretending to be current.
  expect(screen.getAllByRole('status')).toHaveLength(3)
  expect(screen.getAllByText('STALE')).toHaveLength(3)
  expect(screen.getAllByText(/ago/)).toHaveLength(3)
})

test('a cold-start route failure retries once and recovers', async () => {
  const calls: string[] = []
  vi.mocked(api.apiFares).mockImplementation(async (params: { route?: string }) => {
    const route = params.route ?? ''
    calls.push(route)
    if (route === 'DEL-BOM' && calls.filter(call => call === 'DEL-BOM').length === 1) {
      throw new Error('cold start timeout')
    }
    return faresResponse([5000, 6000])
  })
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(screen.getAllByText('₹5,500').length).toBeGreaterThan(0), { timeout: 5000 })
  // 3 routes + 1 retry of DEL-BOM.
  expect(calls.filter(call => call === 'DEL-BOM')).toHaveLength(2)
  expect(screen.queryByText('No verified observation for this route yet.')).toBeNull()
})

test('a partial route snapshot is never cached', async () => {
  vi.mocked(api.apiFares).mockImplementation(async (params: { route?: string }) => {
    if (params.route === 'DEL-MAA') return faresResponse([4000, 4400])
    throw new Error('cold start timeout')
  })
  render(<Overview onNavigate={() => {}} />)
  // DEL-MAA loads; the two failed routes honestly show no observation...
  await waitFor(() => expect(screen.getAllByText('₹4,200').length).toBeGreaterThan(0), { timeout: 5000 })
  await waitFor(() => expect(screen.getAllByText('No verified observation for this route yet.')).toHaveLength(2), { timeout: 5000 })
  // ...but the partial snapshot must NOT be cached, or the next visit would
  // start from pinned nulls.
  expect(sessionStorage.getItem('aeroprice:verified-route-cards:v1')).toBeNull()
})

test('a refetch failure keeps the previously loaded fare', async () => {
  sessionStorage.setItem('aeroprice:verified-route-cards:v1', JSON.stringify([
    { key: 'DEL-BOM', code: 'DEL → BOM', name: 'Delhi to Mumbai', fare: 5500, minFare: 5000, maxFare: 6000, sampleCount: 2 },
    { key: 'DEL-BLR', code: 'DEL → BLR', name: 'Delhi to Bengaluru', fare: 4500, minFare: 4000, maxFare: 5000, sampleCount: 2 },
    { key: 'DEL-MAA', code: 'DEL → MAA', name: 'Delhi to Chennai', fare: 4200, minFare: 4000, maxFare: 4400, sampleCount: 2 },
  ]))
  vi.mocked(api.apiFares).mockImplementation(async (params: { route?: string }) => {
    if (params.route === 'DEL-BOM') throw new Error('cold start timeout')
    if (params.route === 'DEL-BLR') return faresResponse([7000, 7000])
    return faresResponse([4200, 4200])
  })
  render(<Overview onNavigate={() => {}} />)
  // DEL-BLR refreshes to its new fare, while DEL-BOM keeps the cached one.
  await waitFor(() => expect(screen.getAllByText('₹7,000').length).toBeGreaterThan(0), { timeout: 5000 })
  expect(screen.getAllByText('₹5,500').length).toBeGreaterThan(0)
  expect(screen.queryByText('No verified observation for this route yet.')).toBeNull()
})

test('the index KPI shows the index\'s own change from history, not the route mean', async () => {
  // 23 Nov 2026: the mean of route-level fare changes was +42.3% while the
  // index itself FELL 106.20 → 100.56. The KPI must show the index's own
  // change (↓5.3%), and the trend-card Movement the same figure (−5.31%).
  vi.mocked(api.apiFareMovement).mockResolvedValue({
    available: true, price_drops: 0,
    routes: [
      { route: 'DEL-BOM', previous_fare: 6234, current_fare: 8877, change_pct: 42.3, status: 'SIGNIFICANT_INCREASE' },
      { route: 'DEL-BLR', previous_fare: 6234, current_fare: 8877, change_pct: 42.3, status: 'SIGNIFICANT_INCREASE' },
    ],
    states: {},
  })
  vi.mocked(api.apiIndexHistory).mockResolvedValue({
    frequency: 'daily', count: 2,
    observations: [
      { period: '2026-11-23', value: 100.56, status: 'PUBLISHED', route_count: 12, observation_count: 601, data_origin: 'DERIVED' },
      { period: '2026-11-22', value: 106.20, status: 'PUBLISHED', route_count: 12, observation_count: 387, data_origin: 'DERIVED' },
    ],
  })
  render(<Overview onNavigate={() => {}} />)
  await screen.findByText('↓ 5.3% vs prior collection')
  expect(screen.queryByText('↑ 42.3% vs prior collection')).toBeNull()
  await screen.findByText('-5.31%')
})

test('a single published day leaves the index KPI on "Verified index pending"', async () => {
  // Even with route movement available, one published day means no index
  // change figure exists — the KPI must not fall back to the route mean.
  vi.mocked(api.apiFareMovement).mockResolvedValue({
    available: true, price_drops: 0,
    routes: [
      { route: 'DEL-BOM', previous_fare: 6234, current_fare: 8877, change_pct: 42.3, status: 'SIGNIFICANT_INCREASE' },
    ],
    states: {},
  })
  vi.mocked(api.apiIndexHistory).mockResolvedValue({
    frequency: 'daily', count: 1,
    observations: [
      { period: '2026-11-23', value: 100.56, status: 'PUBLISHED', route_count: 12, observation_count: 601, data_origin: 'DERIVED' },
    ],
  })
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiIndexHistory).toHaveBeenCalled())
  await screen.findByText('Verified index pending')
  expect(screen.queryByText('↑ 42.3% vs prior collection')).toBeNull()
})

test('a failed history fetch leaves the index KPI on "Index change unavailable", not "Verified index pending"', async () => {
  // Round 3: a fetch that fails twice (even after the one retry) is a
  // load failure, not a data condition — "Verified index pending" must
  // only appear when the fetch settled with fewer than two published days.
  vi.mocked(api.apiIndexHistory).mockRejectedValue(new Error('history unavailable'))
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiIndexHistory).toHaveBeenCalledTimes(2), { timeout: 5000 })
  await screen.findByText('Index change unavailable', {}, { timeout: 5000 })
  expect(screen.queryByText('Verified index pending')).toBeNull()
})

// ── Movement failure vs genuinely-insufficient (round 3, 24 Nov 2026) ─────
// 24 Nov 2026: the movement endpoint took 10.3–12.4 s under a concurrent
// page-load burst (vs 2.5 s sequential), so the 12 s client timeout aborted
// it and the Overview showed "Comparison pending" on reload even though the
// data was there. The fetch now retries once and says "Movement
// unavailable" when it genuinely cannot load.

const movementResponse = {
  available: true, price_drops: 0,
  routes: [
    { route: 'DEL-BOM', previous_fare: 7601.5, current_fare: 7706, change_pct: 1.37, status: 'STABLE' as const },
    { route: 'DEL-BLR', previous_fare: 11433, current_fare: 11510.5, change_pct: 0.68, status: 'STABLE' as const },
    { route: 'DEL-MAA', previous_fare: 11687, current_fare: 12183.5, change_pct: 4.25, status: 'MODERATE_INCREASE' as const },
  ],
  states: {},
}

test('movement: a failed movement fetch retries once and recovers', async () => {
  vi.mocked(api.apiFares).mockImplementation(async () => faresResponse([5000, 6000]))
  vi.mocked(api.apiFareMovement)
    .mockRejectedValueOnce(new Error('cold start timeout'))
    .mockResolvedValue(movementResponse)
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiFareMovement).toHaveBeenCalledTimes(2), { timeout: 5000 })
  // All three route cards show their movement from the retry, with the
  // "Backend movement" footer — no "Comparison pending" anywhere.
  await waitFor(() => expect(screen.getAllByText('Backend movement')).toHaveLength(3), { timeout: 5000 })
  expect(screen.queryByText('Comparison pending')).toBeNull()
  expect(screen.queryByText('Movement unavailable')).toBeNull()
})

test('movement: a double-failed movement fetch says "Movement unavailable", never "Comparison pending"', async () => {
  vi.mocked(api.apiFares).mockImplementation(async () => faresResponse([5000, 6000]))
  vi.mocked(api.apiFareMovement).mockRejectedValue(new Error('cold start timeout'))
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiFareMovement).toHaveBeenCalledTimes(2), { timeout: 5000 })
  // ChangeLabel + footer on each of the three route cards.
  await waitFor(() => expect(screen.getAllByText('Movement unavailable')).toHaveLength(6), { timeout: 5000 })
  expect(screen.queryByText('Comparison pending')).toBeNull()
  // The alerts empty state says the comparison could not be loaded — it
  // must not blame a missing second collection for a failed fetch.
  expect(screen.getByText('Movement data could not be loaded')).toBeTruthy()
  expect(screen.queryByText('Movement data is not available yet')).toBeNull()
  expect(screen.queryByText(/A second verified collection is required/)).toBeNull()
})

// ── Loading states (follow-up, 23 Nov 2026 — Ankit's order: no
// "Data unavailable" text while a fetch is still in flight) ───────────────

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

test('loading: route cards show a loading state, not "Data unavailable", while fares load', async () => {
  const fares = makeDeferred<ReturnType<typeof faresResponse>>()
  vi.mocked(api.apiFares).mockReturnValue(fares.promise)
  render(<Overview onNavigate={() => {}} />)
  expect(await screen.findAllByText('Loading verified fares…')).toHaveLength(3)
  expect(screen.queryByText('Data unavailable')).toBeNull()
  expect(screen.queryByText('No verified observation for this route yet.')).toBeNull()
  await fares.resolve(faresResponse([5000, 6000]))
  await waitFor(() => expect(screen.getAllByText('₹5,500').length).toBeGreaterThan(0), { timeout: 5000 })
  expect(screen.queryByText('Loading verified fares…')).toBeNull()
})

test('loading: KPIs show "Loading…" while the dashboard loads, never "Data unavailable"', async () => {
  const dashboard = makeDeferred<Awaited<ReturnType<typeof api.apiDashboard>>>()
  const movement = makeDeferred<Awaited<ReturnType<typeof api.apiFareMovement>>>()
  const history = makeDeferred<Awaited<ReturnType<typeof api.apiIndexHistory>>>()
  const fares = makeDeferred<ReturnType<typeof faresResponse>>()
  vi.mocked(api.apiDashboard).mockReturnValue(dashboard.promise)
  vi.mocked(api.apiFareMovement).mockReturnValue(movement.promise)
  vi.mocked(api.apiIndexHistory).mockReturnValue(history.promise)
  vi.mocked(api.apiFares).mockReturnValue(fares.promise)
  render(<Overview onNavigate={() => {}} />)
  // Every in-flight surface shows a loading state…
  expect(await screen.findAllByText('Loading verified fares…')).toHaveLength(3)
  expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  expect(screen.getByText('Loading index…')).toBeTruthy()
  expect(screen.getByText('Loading verified movements…')).toBeTruthy()
  // …and no settled-empty text appears anywhere while loading.
  expect(screen.queryByText('Data unavailable')).toBeNull()
  expect(screen.queryByText('No verified observation for this route yet.')).toBeNull()
  expect(screen.queryByText('Movement data is not available yet')).toBeNull()
  expect(screen.queryByText('Verified index pending')).toBeNull()
  await dashboard.resolve({
    real_observations: 3750, sources_live: 2, sources_challenge_detected: 0,
    gov_datasets_connected: 1, collection_runs_today: 3, last_collection: '2026-09-28T10:00:00Z',
    index_status: 'PUBLISHED', index_value: 101.2, routes_tracked: 12, price_drops: 2,
    note: '', timestamp: '2026-11-22T10:00:00Z',
  })
  await movement.resolve({ available: true, price_drops: 2, routes: [], states: {} })
  await history.resolve({
    frequency: 'daily', count: 1,
    observations: [
      { period: '2026-11-23', value: 100.56, status: 'PUBLISHED', route_count: 12, observation_count: 601, data_origin: 'DERIVED' },
    ],
  })
  await fares.resolve(faresResponse([5000, 6000]))
  await waitFor(() => expect(screen.getByText('3,750')).toBeTruthy(), { timeout: 5000 })
  expect(screen.queryByText('Loading…')).toBeNull()
  expect(screen.getByText('Verified index pending')).toBeTruthy()
})

test('loading: the index helper reads "Loading index…" while history loads, then "Verified index pending"', async () => {
  // One published day means no change figure exists — but while the
  // history fetch is still in flight the helper must say it is loading,
  // not that the index is pending. The two states are different facts.
  const history = makeDeferred<Awaited<ReturnType<typeof api.apiIndexHistory>>>()
  vi.mocked(api.apiIndexHistory).mockReturnValue(history.promise)
  render(<Overview onNavigate={() => {}} />)
  expect(await screen.findByText('Loading index…')).toBeTruthy()
  expect(screen.queryByText('Verified index pending')).toBeNull()
  await history.resolve({
    frequency: 'daily', count: 1,
    observations: [
      { period: '2026-11-23', value: 100.56, status: 'PUBLISHED', route_count: 12, observation_count: 601, data_origin: 'DERIVED' },
    ],
  })
  await screen.findByText('Verified index pending')
  expect(screen.queryByText('Loading index…')).toBeNull()
})

test('route contribution rows label origin and destination, not just the origin city', async () => {
  render(<Overview onNavigate={vi.fn()} />)
  await screen.findByText('Route Contribution to Index')
  // The contribution row and the route card both carry the full corridor.
  expect(screen.getAllByText('DEL → BOM').length).toBeGreaterThanOrEqual(2)
  expect(screen.getAllByText('Delhi to Mumbai').length).toBeGreaterThanOrEqual(1)
})

test('a stale dashboard cache is ignored instead of painting old KPIs as current', async () => {
  // 26 Nov 2026 live inspection: Overview showed index 102.98 and 5,219
  // observations from an old localStorage dashboard while the API had
  // already moved to 109.77 / 6,252. A cache without a fresh saved_at must
  // not paint at all.
  localStorage.setItem('aeroprice:verified-dashboard:v1', JSON.stringify({
    routes_tracked: 24, real_observations: 5219, price_drops: 3, index_value: 102.98,
  }))
  const dashboard = makeDeferred<Awaited<ReturnType<typeof api.apiDashboard>>>()
  vi.mocked(api.apiDashboard).mockReturnValue(dashboard.promise)
  render(<Overview onNavigate={() => {}} />)
  expect(screen.queryByText('102.98')).toBeNull()
  expect(screen.queryByText('5219')).toBeNull()
  expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  await dashboard.resolve({
    real_observations: 6252, sources_live: 1, sources_challenge_detected: 5,
    gov_datasets_connected: 1, collection_runs_today: 44, last_collection: '2026-11-26T01:55:01Z',
    index_status: 'PUBLISHED', index_value: 109.77, routes_tracked: 24, price_drops: 6,
    note: '', timestamp: '2026-11-26T17:00:00Z',
  })
  await waitFor(() => expect(screen.getAllByText('109.77').length).toBeGreaterThan(0), { timeout: 5000 })
  expect(screen.queryByText('102.98')).toBeNull()
})

test('a signed-in alerts failure retries once and never says "sign in"', async () => {
  vi.mocked(api.apiPriceAlerts).mockRejectedValue(new Error('alerts unavailable'))
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiPriceAlerts).toHaveBeenCalledTimes(2), { timeout: 5000 })
  await screen.findByText('Alerts could not be loaded', {}, { timeout: 5000 })
  expect(screen.queryByText('Sign in to view account alerts')).toBeNull()
})
