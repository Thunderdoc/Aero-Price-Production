import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { clearApiAuthSession } from './api'
import { fetchAllCorridorFlights, fetchLiveFlights } from './flightData'

const fetchMock = vi.fn<typeof fetch>()

const liveBody = {
  source: 'ADSB.lol', data_origin: 'LIVE_ADSB', provider_status: 'LIVE',
  retrieved_at: '2026-11-22T10:00:00.000Z', count: 1,
  aircraft: [{
    icao24: '800123', callsign: 'IGO123', registration: 'VT-ABC', aircraft_type: 'A320',
    latitude: 19.1, longitude: 72.9, altitude_ft: 35000, ground_speed_kts: 450,
    track_deg: 90, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 5,
  }],
}

const schedulesBody = {
  source: 'AviationStack', data_origin: 'LIVE_SCHEDULE_API', retrieved_at: null, count: 1,
  flights: [{
    flight_iata: 'AI202', airline_name: 'Air India', airline_iata: 'AI',
    dep_iata: 'DEL', dep_city: 'Delhi', arr_iata: 'BOM', arr_city: 'Mumbai',
    dep_scheduled: '2026-11-22T06:00:00Z', arr_scheduled: '2026-11-22T08:00:00Z',
    status: 'active', dep_actual: null, arr_actual: null,
  }],
  status: 'LIVE',
}

beforeEach(() => {
  clearApiAuthSession()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => { vi.unstubAllGlobals() })

test('M2: corridor flights send the persisted session token and map aircraft to flights', async () => {
  localStorage.setItem('aeroprice_token', 'stored-token')
  fetchMock.mockResolvedValue(new Response(JSON.stringify(liveBody)))
  const [result] = await fetchAllCorridorFlights()
  expect(result.flights).toHaveLength(1)
  expect(result.flights[0].flight_iata).toBe('IGO123')
  expect(result.flights[0].airline_name).toBe('IndiGo')
  expect(result.flights[0].latitude).toBe(19.1)
  expect(fetchMock.mock.calls[0][0]).toContain('/api/aviation/live?limit=150')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer stored-token')
})

test('M2: an explicitly passed token overrides the persisted one', async () => {
  localStorage.setItem('aeroprice_token', 'stored-token')
  fetchMock.mockResolvedValue(new Response(JSON.stringify(liveBody)))
  await fetchAllCorridorFlights('explicit-token')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer explicit-token')
})

test('M2: live schedules send the token and return the provider rows', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(schedulesBody)))
  const result = await fetchLiveFlights('DEL', 'BOM', 'test-token')
  expect(result.flights).toHaveLength(1)
  expect(result.flights[0].flight_iata).toBe('AI202')
  expect(result.flights[0].airline_name).toBe('Air India')
  expect(fetchMock.mock.calls[0][0]).toContain('/api/aviation/schedules')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-token')
})

test('a failed schedule lookup still returns an honest empty result', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  const result = await fetchLiveFlights('DEL', undefined, 'test-token')
  expect(result.flights).toEqual([])
  expect(result.error).toBe('No live schedule rows returned by the connected provider.')
})

test('a provider ERROR is surfaced, not converted to a successful empty feed', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    source: 'Aircraft providers', data_origin: 'ERROR', provider_status: 'ERROR',
    retrieved_at: null, count: 0, aircraft: [], note: 'Live aircraft providers are temporarily unavailable.',
  })))
  const [result] = await fetchAllCorridorFlights('test-token')
  expect(result.flights).toEqual([])
  expect(result.provider_status).toBe('ERROR')
  expect(result.error).toContain('temporarily unavailable')
})
