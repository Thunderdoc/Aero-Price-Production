import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import RouteExplorer from './RouteExplorer'
import type { FareObservationApi } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' }, token: 'test-token' }),
}))
vi.mock('../services/api', () => ({
  apiAnomalies: vi.fn(),
  apiFares: vi.fn(),
  apiLiveFares: vi.fn(),
  apiForecast: vi.fn(),
  apiRouteBasket: vi.fn(),
  isBackendAvailable: vi.fn(),
}))

const api = await import('../services/api')

function fareRow(route: string, totalFare: number, id: string): FareObservationApi {
  return {
    observation_id: id, route, airline: 'IndiGo', flight_number: '6E123',
    departure_time: null, arrival_time: null, stops: 0, travel_date: '2026-12-01',
    advance_days: 7, fare_family: 'ECONOMY', cabin: 'ECONOMY', base_fare: totalFare - 500,
    taxes: 500, total_fare: totalFare, currency: 'INR', source: 'Google Flights',
    data_origin: 'PUBLIC_INTERFACE', collected_at: '2026-09-28T10:00:00Z', quality_flags: [],
  }
}

function livePayload(route: string, observations: FareObservationApi[]) {
  return {
    status: 'LIVE', provider_status: 'LIVE', route, travel_date: '2026-12-01',
    source: 'Google Flights', data_origin: 'PUBLIC_INTERFACE', observations, rejected_count: 0,
  }
}

function basketItem(route: string) {
  const [origin, destination] = route.split('-')
  return {
    route, origin, destination, origin_name: origin, destination_name: destination,
    observations_7d: 10, has_data: true, status: 'ACTIVE',
  }
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.mocked(api.isBackendAvailable).mockResolvedValue(true)
  vi.mocked(api.apiForecast).mockResolvedValue({
    status: 'INSUFFICIENT_DATA', route: 'DEL-BOM', advance_days: 7, cabin: 'ECONOMY',
    message: 'A forecast needs more verified history.', forecasts: [], metrics: null,
  })
  vi.mocked(api.apiAnomalies).mockResolvedValue({
    anomalies: [], total_shown: 0,
    summary: { total_observations: 0, flagged_anomalies: 0, flag_rate_pct: 0 },
    method: 'z-score', threshold: 3, min_sample: 10, status: 'ok',
  })
  vi.mocked(api.apiFares).mockResolvedValue({ observations: [], total: 0, page: 1, page_size: 200, note: '' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('R2: a slow stale route response never overwrites the current route fares', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BLR'), basketItem('DEL-BOM')],
    total: 2, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  const liveByRoute = new Map<string, Deferred<ReturnType<typeof livePayload>>>()
  vi.mocked(api.apiLiveFares).mockImplementation((route: string) => {
    let deferred = liveByRoute.get(route)
    if (!deferred) { deferred = makeDeferred(); liveByRoute.set(route, deferred) }
    return deferred.promise
  })

  render(<RouteExplorer />)
  // The initial DEL-BOM load is still in flight (deferred); switch routes.
  const blrChip = await screen.findByText('DEL → BLR')
  fireEvent.click(blrChip)
  expect(api.apiLiveFares).toHaveBeenCalledWith('DEL-BLR', expect.any(String), 'test-token')

  // The current route's fares land first.
  await act(async () => {
    liveByRoute.get('DEL-BLR')!.resolve(livePayload('DEL-BLR', [fareRow('DEL-BLR', 5000, 'OBS-BLR')]))
  })
  expect(await screen.findAllByText('₹5,000')).toHaveLength(2)

  // The stale DEL-BOM response lands last and must be ignored.
  await act(async () => {
    liveByRoute.get('DEL-BOM')!.resolve(livePayload('DEL-BOM', [fareRow('DEL-BOM', 3000, 'OBS-BOM')]))
  })
  expect(screen.getAllByText('₹5,000')).toHaveLength(2)
  expect(screen.queryByText('₹3,000')).toBeNull()
})

test('R3: the route picker comes from GET /api/routes, including routes no fare sample lists', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('CCU-GAU'), basketItem('DEL-BLR'), basketItem('DEL-BOM')],
    total: 3, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiLiveFares).mockResolvedValue(
    livePayload('DEL-BOM', [fareRow('DEL-BOM', 5200, 'OBS-1')]),
  )

  render(<RouteExplorer />)
  // CCU-GAU appears as a chip even though no fare row mentions it — the old
  // 600-row fare sample could never have offered it.
  await screen.findByText('CCU → GAU')
  expect(api.apiRouteBasket).toHaveBeenCalledWith('test-token')
  // The picker no longer fetches fares to build its options, and the live
  // search succeeded so no cached-fares fallback ran either.
  expect(api.apiFares).not.toHaveBeenCalled()
})
