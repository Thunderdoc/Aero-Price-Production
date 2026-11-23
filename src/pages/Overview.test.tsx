import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import Overview from './Overview'
import type { FareObservationApi } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' }, token: 'test-token' }),
}))
vi.mock('../services/api', () => ({
  apiDashboard: vi.fn(),
  apiFareMovement: vi.fn(),
  apiFares: vi.fn(),
  apiPriceAlerts: vi.fn(),
  apiAviationLive: vi.fn(),
  apiIndexHistory: vi.fn(),
}))

const api = await import('../services/api')
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

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
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
  vi.mocked(api.apiAviationLive).mockResolvedValue(aviationBody)
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

test('M2: the Aircraft-tracked KPI comes from the authed aviation feed', async () => {
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiAviationLive).toHaveBeenCalledWith('test-token'))
  const label = await screen.findByText('Aircraft tracked')
  expect(label.previousElementSibling?.textContent).toBe('3')
})

test('an aviation failure leaves the KPI blank instead of inventing a count', async () => {
  vi.mocked(api.apiAviationLive).mockRejectedValue(new Error('feed unavailable'))
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiAviationLive).toHaveBeenCalled())
  const label = await screen.findByText('Aircraft tracked')
  expect(label.previousElementSibling?.textContent).toBe('—')
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
    data_origin: 'PUBLIC_INTERFACE', collected_at: '2026-11-22T13:44:34Z', quality_flags: [],
  }
}

const faresResponse = (fares: number[]) => ({
  observations: fares.map((total_fare, index) => fareRow(`OBS-${index}`, total_fare)),
  total: fares.length, page: 1, page_size: 200, note: '',
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

test('a failed history fetch leaves the index KPI on "Verified index pending"', async () => {
  vi.mocked(api.apiIndexHistory).mockRejectedValue(new Error('history unavailable'))
  render(<Overview onNavigate={() => {}} />)
  await waitFor(() => expect(api.apiIndexHistory).toHaveBeenCalled())
  await screen.findByText('Verified index pending')
})
