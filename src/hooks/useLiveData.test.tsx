import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useLiveData } from './useLiveData'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiDashboard: vi.fn(),
  apiAviationLive: vi.fn(),
  isBackendAvailable: vi.fn(),
}))

const api = await import('../services/api')

const dashboardBody = {
  real_observations: 3750, sources_live: 2, sources_challenge_detected: 0,
  gov_datasets_connected: 1, collection_runs_today: 3, last_collection: '2026-09-28T10:00:00Z',
  index_status: 'PUBLISHED', index_value: 101.2, note: '', timestamp: '2026-11-22T10:00:00Z',
}

const aviationBody = {
  source: 'ADSB.lol', data_origin: 'LIVE_ADSB', provider_status: 'LIVE' as const,
  retrieved_at: '2026-11-22T10:00:00.000Z', count: 2,
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
  ],
}

beforeEach(() => {
  vi.mocked(api.isBackendAvailable).mockResolvedValue(true)
  vi.mocked(api.apiDashboard).mockResolvedValue(dashboardBody)
  vi.mocked(api.apiAviationLive).mockResolvedValue(aviationBody)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('M2: the hook passes its AuthContext token to the aviation feed and surfaces live flights', async () => {
  const { result } = renderHook(() => useLiveData())
  await waitFor(() => expect(result.current.liveFlights).toHaveLength(2))
  expect(api.apiAviationLive).toHaveBeenCalledWith('test-token')
  expect(result.current.liveFlights[0]).toMatchObject({ icao24: '800123', callsign: 'IGO123', lat: 19.1, lng: 72.9 })
  expect(result.current.connectionStatus).toBe('live')
  expect(result.current.realObservations).toBe(3750)
})

test('a radar failure keeps the last dashboard status instead of flipping to offline', async () => {
  vi.mocked(api.apiAviationLive).mockRejectedValue(new Error('aviation feed unavailable'))
  const { result } = renderHook(() => useLiveData())
  await waitFor(() => expect(result.current.connectionStatus).toBe('live'))
  expect(result.current.liveFlights).toEqual([])
})

test('D3: a 60 s tick that arrives while a fetch is in flight is skipped, not overlapped', async () => {
  vi.useFakeTimers()
  try {
    // Hold the first dashboard response until the test releases it.
    let releaseDashboard!: (value: typeof dashboardBody) => void
    const dashboardDeferred = new Promise<typeof dashboardBody>(resolve => { releaseDashboard = resolve })
    vi.mocked(api.apiDashboard).mockReturnValue(dashboardDeferred)
    renderHook(() => useLiveData())
    await vi.advanceTimersByTimeAsync(0)
    expect(api.apiDashboard).toHaveBeenCalledTimes(1)

    // The 60 s tick fires while the first fetch is still in flight: the
    // guard skips it, so no second dashboard request starts.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.apiDashboard).toHaveBeenCalledTimes(1)

    // Once the first fetch completes, the next tick polls again.
    releaseDashboard(dashboardBody)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.apiDashboard).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})
