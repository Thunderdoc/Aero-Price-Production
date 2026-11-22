import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import Overview from './Overview'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'test@example.test', name: 'Test', role: 'PUBLIC', plan: 'FREE' }, token: 'test-token' }),
}))
vi.mock('../services/api', () => ({
  apiDashboard: vi.fn(),
  apiFareMovement: vi.fn(),
  apiFares: vi.fn(),
  apiPriceAlerts: vi.fn(),
  apiAviationLive: vi.fn(),
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
