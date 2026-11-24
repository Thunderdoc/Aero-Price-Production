import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RouteExplorer from './RouteExplorer'
import type { FareObservationApi } from '../services/api'

const authState = vi.hoisted(() => ({
  user: { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' } as { email: string; name: string; role: string; plan: string } | null,
  token: 'test-token' as string | null,
}))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../services/api', () => ({
  apiAnomalies: vi.fn(),
  apiFares: vi.fn(),
  apiFareSummary: vi.fn(),
  apiLiveFares: vi.fn(),
  apiForecast: vi.fn(),
  apiRouteBasket: vi.fn(),
  isBackendAvailable: vi.fn(),
}))

function fareSummary(overall: { median: number | null; min: number | null; max: number | null; count: number }) {
  return {
    route: 'DEL-BOM',
    overall: { ...overall, sample_period: '2026-09-28', last_collected_at: '2026-09-28T10:00:00Z', data_origin: 'PUBLIC_INTERFACE', status: 'STORED_OBSERVATIONS' },
    windows: {}, has_real_data: true, timestamp: '2026-09-28T10:00:00Z',
  }
}

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
  authState.user = { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' }
  authState.token = 'test-token'
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
  // Default: no summary figures — the headline falls back to the row median.
  vi.mocked(api.apiFareSummary).mockResolvedValue(fareSummary({ median: null, min: null, max: null, count: 0 }))
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
  // The cached-first mount calls the live upgrade only after the stored
  // rows resolve, so the call lands a microtask after the click.
  await waitFor(() => expect(api.apiLiveFares).toHaveBeenCalledWith('DEL-BLR', expect.any(String), 'test-token'))

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
  // The cached-first mount loads stored rows before the live upgrade, so
  // apiFares IS called — but the picker still comes from the basket, not
  // from any fare sample.
  expect(api.apiFares).toHaveBeenCalledWith({ route: 'DEL-BOM', limit: 1000 }, 'test-token')
})

function anomalyRow(route: string, totalFare: number, id: string) {
  return {
    observation_id: id, route, advance_days: 7, cabin: 'ECONOMY', total_fare: totalFare,
    airline: 'IndiGo', travel_date: '2026-12-01', data_origin: 'PUBLIC_INTERFACE',
    quality_flags: ['OUTLIER'], collected_at: '2026-09-28T10:00:00Z',
  }
}

function anomaliesPayload(rows: ReturnType<typeof anomalyRow>[]) {
  return {
    anomalies: rows, total_shown: rows.length,
    summary: { total_observations: rows.length, flagged_anomalies: rows.length, flag_rate_pct: 0 },
    method: 'z-score', threshold: 3, min_sample: 10, status: 'ok',
  }
}

test('R4: anomalies that exist only for other routes show the empty message, not a header-only table', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiLiveFares).mockResolvedValue(livePayload('DEL-BOM', [fareRow('DEL-BOM', 5200, 'OBS-1')]))
  // An anomaly exists — but for DEL-BLR, not the selected DEL-BOM.
  vi.mocked(api.apiAnomalies).mockResolvedValue(anomaliesPayload([anomalyRow('DEL-BLR', 9000, 'OBS-A1')]))

  render(<RouteExplorer />)
  await screen.findAllByText('₹5,200')
  fireEvent.click(screen.getByRole('tab', { name: 'Anomalies' }))
  expect(await screen.findByText('No verified anomaly records are available for this route.')).toBeTruthy()
  // No table at all: no header, no other-route fare.
  expect(screen.queryByText('Collected')).toBeNull()
  expect(screen.queryByText('₹9,000')).toBeNull()
})

test('R4: an anomaly for the selected route still renders its table row', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiLiveFares).mockResolvedValue(livePayload('DEL-BOM', [fareRow('DEL-BOM', 5200, 'OBS-1')]))
  vi.mocked(api.apiAnomalies).mockResolvedValue(anomaliesPayload([anomalyRow('DEL-BOM', 9000, 'OBS-A1')]))

  render(<RouteExplorer />)
  await screen.findAllByText('₹5,200')
  fireEvent.click(screen.getByRole('tab', { name: 'Anomalies' }))
  expect(await screen.findByText('₹9,000')).toBeTruthy()
  expect(screen.queryByText('No verified anomaly records are available for this route.')).toBeNull()
})

test('P5: on the cached path the headline comes from the backend summary, not the capped row sample', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  // The live source returns nothing, so the cached fallback runs.
  vi.mocked(api.apiLiveFares).mockResolvedValue(livePayload('DEL-BOM', []))
  // The loaded rows median to ₹5,000; the summary's complete latest day
  // medians to ₹7,500. The headline must be the summary figure.
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [fareRow('DEL-BOM', 4000, 'OBS-1'), fareRow('DEL-BOM', 6000, 'OBS-2')],
    total: 2, page: 1, page_size: 1000, note: '',
  })
  vi.mocked(api.apiFareSummary).mockResolvedValue(fareSummary({ median: 7500, min: 7000, max: 8000, count: 55 }))

  render(<RouteExplorer />)
  // Hero + Overview tile both show the summary median.
  expect(await screen.findAllByText('₹7,500')).toHaveLength(2)
  expect(screen.getByText('₹7,000 – ₹8,000')).toBeTruthy()
  expect(screen.queryByText('₹5,000')).toBeNull()
  expect(api.apiFareSummary).toHaveBeenCalledWith('DEL-BOM', 'test-token')
  // The cached fallback loads the full route (limit 1000 covers the ~494
  // rows of the biggest route), not the old newest-200 subsample.
  expect(api.apiFares).toHaveBeenCalledWith({ route: 'DEL-BOM', limit: 1000 }, 'test-token')
})

test('P5: live rows keep their own median — the stored summary never overrides a live scrape', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiLiveFares).mockResolvedValue(livePayload('DEL-BOM', [fareRow('DEL-BOM', 5000, 'OBS-1')]))
  vi.mocked(api.apiFareSummary).mockResolvedValue(fareSummary({ median: 7500, min: 7000, max: 8000, count: 55 }))

  render(<RouteExplorer />)
  expect(await screen.findAllByText('₹5,000')).toHaveLength(2)
  expect(screen.queryByText('₹7,500')).toBeNull()
  // The cached-first mount fetched stored rows (empty) before the live
  // upgrade supplied the scrape — the summary still never overrides it.
  expect(api.apiFares).toHaveBeenCalledWith({ route: 'DEL-BOM', limit: 1000 }, 'test-token')
  expect(api.apiLiveFares).toHaveBeenCalledWith('DEL-BOM', expect.any(String), 'test-token')
})

test('P5: a failed summary falls back to the row figures instead of blanking the headline', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7, 15, 30, 45], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiLiveFares).mockResolvedValue(livePayload('DEL-BOM', []))
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [fareRow('DEL-BOM', 4000, 'OBS-1'), fareRow('DEL-BOM', 6000, 'OBS-2')],
    total: 2, page: 1, page_size: 1000, note: '',
  })
  vi.mocked(api.apiFareSummary).mockRejectedValue(new Error('summary unavailable'))

  render(<RouteExplorer />)
  expect(await screen.findAllByText('₹5,000')).toHaveLength(2)
})

// ── Cached-first mount (follow-up, 23 Nov 2026): the old mount called the
// live-first loadRoute, which has no retry — a mount-time live failure plus
// a cold-start cached failure left the page empty forever, until the user
// clicked Search. The mount now loads stored rows first (one retry), then
// upgrades to live rows in the background. ────────────────────────────────

test('cached-first mount: stored rows render before the live call resolves, then live rows swap in', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7], basket_version: 'v1.0', timestamp: '',
  })
  // Cached rows median to ₹5,500; the live scrape medians to ₹4,200.
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [fareRow('DEL-BOM', 5000, 'OBS-C1'), fareRow('DEL-BOM', 6000, 'OBS-C2')],
    total: 2, page: 1, page_size: 1000, note: '',
  })
  const live = makeDeferred<ReturnType<typeof livePayload>>()
  vi.mocked(api.apiLiveFares).mockReturnValue(live.promise)

  render(<RouteExplorer />)
  // The page populates from the cache while the live call is still pending.
  expect(await screen.findAllByText('₹5,500')).toHaveLength(2)
  expect(screen.getByText('2 verified records loaded')).toBeTruthy()
  // The mount logged the cached load (the live upgrade is a background
  // refresh, not a second search).
  const activity = JSON.parse(localStorage.getItem('aeroprice_route_activity:test@example.test') || '[]')
  expect(activity).toHaveLength(1)
  expect(activity[0].route).toBe('DEL-BOM')
  expect(activity[0].resultCount).toBe(2)

  await act(async () => { live.resolve(livePayload('DEL-BOM', [fareRow('DEL-BOM', 4200, 'OBS-L1')])) })
  expect(await screen.findAllByText('₹4,200')).toHaveLength(2)
  expect(screen.queryByText('₹5,500')).toBeNull()
  expect(screen.getByText('1 verified records loaded')).toBeTruthy()
})

test('cached-first mount: a failed stored-rows fetch retries once and recovers', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiFares)
    .mockRejectedValueOnce(new Error('cold start'))
    .mockResolvedValue({
      observations: [fareRow('DEL-BOM', 5000, 'OBS-1'), fareRow('DEL-BOM', 6000, 'OBS-2')],
      total: 2, page: 1, page_size: 1000, note: '',
    })
  // The live source is down too — the page must still populate from the
  // retried cache instead of settling empty.
  vi.mocked(api.apiLiveFares).mockRejectedValue(new Error('live unavailable'))

  render(<RouteExplorer />)
  expect(await screen.findAllByText('₹5,500', {}, { timeout: 4000 })).toHaveLength(2)
  expect(api.apiFares).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Live fare source is temporarily unavailable; showing cached verified observations.')).toBeTruthy()
})

test('cached-first mount: empty cache and empty live show the honest no-records message', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiFares).mockResolvedValue({ observations: [], total: 0, page: 1, page_size: 1000, note: '' })
  vi.mocked(api.apiLiveFares).mockResolvedValue(livePayload('DEL-BOM', []))

  render(<RouteExplorer />)
  expect(await screen.findByText(/No verified fare records are available for DEL-BOM/)).toBeTruthy()
  expect(screen.getByText('No verified records loaded')).toBeTruthy()
})

test('explicit search stays live-first: the live call runs before any cached fetch', async () => {
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [fareRow('DEL-BOM', 5000, 'OBS-C1'), fareRow('DEL-BOM', 6000, 'OBS-C2')],
    total: 2, page: 1, page_size: 1000, note: '',
  })
  const live = makeDeferred<ReturnType<typeof livePayload>>()
  vi.mocked(api.apiLiveFares).mockReturnValue(live.promise)

  render(<RouteExplorer />)
  expect(await screen.findAllByText('₹5,500')).toHaveLength(2)
  // Forget the mount calls; the search below must start with the live call.
  vi.clearAllMocks()
  fireEvent.click(screen.getByRole('button', { name: 'Search Verified Fares' }))
  await waitFor(() => expect(api.apiLiveFares).toHaveBeenCalledTimes(1))
  // The live call is still pending — the cached fallback must not have run.
  expect(api.apiFares).not.toHaveBeenCalled()
  await act(async () => { live.resolve(livePayload('DEL-BOM', [fareRow('DEL-BOM', 4200, 'OBS-L1')])) })
  expect(await screen.findAllByText('₹4,200')).toHaveLength(2)
  expect(api.apiFares).not.toHaveBeenCalled()
})

test('guest mount: cached rows load and the live upgrade is never attempted', async () => {
  authState.user = null
  authState.token = null
  vi.mocked(api.apiRouteBasket).mockResolvedValue({
    routes: [basketItem('DEL-BOM')],
    total: 1, advance_windows: [1, 7], basket_version: 'v1.0', timestamp: '',
  })
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [fareRow('DEL-BOM', 5000, 'OBS-C1'), fareRow('DEL-BOM', 6000, 'OBS-C2')],
    total: 2, page: 1, page_size: 1000, note: '',
  })

  render(<RouteExplorer />)
  expect(await screen.findAllByText('₹5,500')).toHaveLength(2)
  expect(api.apiLiveFares).not.toHaveBeenCalled()
  // Live was never attempted, so there is no "temporarily unavailable" message.
  expect(screen.queryByText(/temporarily unavailable/)).toBeNull()
})
