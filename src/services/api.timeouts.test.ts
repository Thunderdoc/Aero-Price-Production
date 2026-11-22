import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  apiAviationLive,
  apiAviationSchedules,
  apiFares,
  apiLiveFares,
  clearApiAuthSession,
  getStoredSessionToken,
  LIVE_FARES_TIMEOUT_MS,
} from './api'

const fetchMock = vi.fn<typeof fetch>()

const aviationBody = {
  source: 'ADSB.lol',
  data_origin: 'LIVE_ADSB',
  provider_status: 'LIVE',
  retrieved_at: '2026-11-22T10:00:00.000Z',
  count: 1,
  aircraft: [{
    icao24: '800123', callsign: 'IGO123', registration: 'VT-ABC', aircraft_type: 'A320',
    latitude: 19.1, longitude: 72.9, altitude_ft: 35000, ground_speed_kts: 450,
    track_deg: 90, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 5,
  }],
}

// A request that never answers unless its abort signal fires.
function hangUntilAborted() {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
}

beforeEach(() => {
  clearApiAuthSession()
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

test('R1: a live-fares search survives past the 12 s global abort and times out at 50 s', async () => {
  expect(LIVE_FARES_TIMEOUT_MS).toBe(50_000)
  hangUntilAborted()
  const result = apiLiveFares('DEL-BOM', '2026-12-01', 'test-token').catch((error: Error) => error.message)
  // The old 12 s abort killed every live search by construction: the
  // server-side scrape takes up to 45 s.
  await vi.advanceTimersByTimeAsync(12_000)
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(37_999)
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toBe('The server is taking too long to respond. Please retry in a moment.')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('R1: ordinary endpoints still abort at 12 s — only the live-fares call gets the longer budget', async () => {
  hangUntilAborted()
  const result = apiFares({ limit: 10 }, 'test-token').catch((error: Error) => error.message)
  await vi.advanceTimersByTimeAsync(11_999)
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toBe('The server is taking too long to respond. Please retry in a moment.')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('M2: the aviation live call sends the signed-in user Bearer token', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(aviationBody)))
  const body = await apiAviationLive('test-token')
  expect(body.aircraft).toHaveLength(1)
  expect(fetchMock.mock.calls[0][0]).toContain('/api/aviation/live?limit=150')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-token')
})

test('M2: the aviation live call never serves the 20 s GET cache (live positions must be fresh)', async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(aviationBody)))
  await apiAviationLive('test-token')
  await apiAviationLive('test-token')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('M2: the aviation schedules call sends the Bearer token with the route params', async () => {
  const schedulesBody = {
    source: 'AviationStack', data_origin: 'LIVE_SCHEDULE_API', retrieved_at: null, count: 1,
    flights: [{ flight_iata: 'AI202', airline_name: 'Air India', airline_iata: 'AI', dep_iata: 'DEL', dep_city: 'Delhi', arr_iata: 'BOM', arr_city: 'Mumbai', dep_scheduled: '', arr_scheduled: '', status: 'active', dep_actual: null, arr_actual: null }],
    status: 'LIVE',
  }
  fetchMock.mockResolvedValue(new Response(JSON.stringify(schedulesBody)))
  const body = await apiAviationSchedules('DEL', 'BOM', 'test-token')
  expect(body.flights).toHaveLength(1)
  const url = String(fetchMock.mock.calls[0][0])
  expect(url).toContain('/api/aviation/schedules')
  expect(url).toContain('departure=DEL')
  expect(url).toContain('arrival=BOM')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-token')
})

test('getStoredSessionToken reads the token AuthContext persists on sign-in', () => {
  expect(getStoredSessionToken()).toBeUndefined()
  localStorage.setItem('aeroprice_token', 'remembered-token')
  expect(getStoredSessionToken()).toBe('remembered-token')
  localStorage.removeItem('aeroprice_token')
  sessionStorage.setItem('aeroprice_session_token', 'session-token')
  expect(getStoredSessionToken()).toBe('session-token')
})
