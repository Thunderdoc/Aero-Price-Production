import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { clearApiAuthSession } from './api'

const { authState } = vi.hoisted(() => ({ authState: { token: 'test-token' as string | null } }))

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: authState.token }) }))

const fetchMock = vi.fn<typeof fetch>()

function aircraftRow(icao24: string, callsign: string, latitude: number, longitude: number) {
  return {
    icao24, callsign, registration: `VT-${icao24}`, aircraft_type: 'A320',
    latitude, longitude, altitude_ft: 35000, ground_speed_kts: 450,
    track_deg: 90, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 5,
  }
}

const liveBody = {
  source: 'ADSB.lol', data_origin: 'LIVE_ADSB', provider_status: 'LIVE',
  retrieved_at: '2026-11-22T10:00:00.000Z', count: 2,
  aircraft: [aircraftRow('800123', 'IGO123', 19.1, 72.9), aircraftRow('800456', 'AIC456', 28.5, 77.1)],
}
const cachedBody = { ...liveBody, provider_status: 'CACHED' }

beforeEach(() => {
  vi.resetModules()
  clearApiAuthSession()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
  sessionStorage.clear()
  authState.token = 'test-token'
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

test('M2: the radar poll sends the signed-in user Bearer token and goes live', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(liveBody)))
  const radar = await import('./aviationRadar')
  const { result } = renderHook(() => radar.useAviationRadar(true))
  await act(async () => { await radar.refreshRadar() })

  expect(fetchMock.mock.calls[0][0]).toContain('/api/aviation/live?limit=150')
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-token')
  expect(result.current.status).toBe('connected')
  expect(result.current.aircraft).toHaveLength(2)
  expect(result.current.providerStatus).toBe('LIVE')
})

test('M2: a direct refreshRadar() falls back to the persisted session token', async () => {
  authState.token = null
  localStorage.setItem('aeroprice_token', 'stored-token')
  fetchMock.mockResolvedValue(new Response(JSON.stringify(liveBody)))
  const radar = await import('./aviationRadar')
  await radar.refreshRadar()
  expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer stored-token')
})

test('D2: a CACHED poll retries after 20 s, not every 3 s', async () => {
  vi.useFakeTimers()
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(cachedBody)))
  const radar = await import('./aviationRadar')
  expect(radar.CACHED_RETRY_MS).toBe(20_000)
  renderHook(() => radar.useAviationRadar(true))
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  expect(fetchMock).toHaveBeenCalledTimes(1)

  // The old 3 s retry would already have fired six times by now.
  await act(async () => { await vi.advanceTimersByTimeAsync(19_000) })
  expect(fetchMock).toHaveBeenCalledTimes(1)

  await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
