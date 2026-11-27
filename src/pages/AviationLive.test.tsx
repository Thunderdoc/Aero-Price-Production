import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AviationLive from './AviationLive'
import type { RadarSnapshot } from '../services/aviationRadar'

// The radar store is mocked: these tests drive the page with a fixed
// snapshot instead of the live feed. Everything else in the module
// (radarAirports, aircraftLabel, ...) stays real.
vi.mock('../services/aviationRadar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/aviationRadar')>()
  return { ...actual, useAviationRadar: vi.fn(), refreshRadar: vi.fn() }
})

// The Leaflet radar map is replaced by a stub that exposes the weather
// status prop it receives, so the tri-state wiring is observable.
vi.mock('../components/AviationRadarMap', () => ({
  default: ({ weatherStatus }: { weatherStatus?: string }) => (
    <div data-testid="radar-map" data-weather-status={weatherStatus ?? 'none'} />
  ),
}))

const radar = await import('../services/aviationRadar')
const useAviationRadarMock = vi.mocked(radar.useAviationRadar)
const fetchMock = vi.fn<typeof fetch>()

const unavailableSnapshot: RadarSnapshot = {
  aircraft: [], source: '', retrievedAt: null,
  status: 'unavailable', refreshing: false, history: [],
}

const delAircraft = {
  icao24: '800123', callsign: 'IGO123', registration: 'VT-ABC', aircraft_type: 'A320',
  latitude: 28.5562, longitude: 77.1, altitude_ft: 35000, ground_speed_kts: 450,
  track_deg: 90, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 5,
}

const connectedSnapshot: RadarSnapshot = {
  aircraft: [delAircraft], source: 'ADSB.lol', retrievedAt: '2026-11-22T10:00:00.000Z',
  status: 'connected', refreshing: false, history: [],
}

// One Open-Meteo block per mapped airport (8 airports), all 30 °C.
const weatherBlocks = Array.from({ length: 8 }, () => ({
  current: { temperature_2m: 30, wind_speed_10m: 10, weather_code: 0, time: '2026-11-22T10:00' },
}))

function openPanel(panel: string) {
  fireEvent(window, new CustomEvent('aviation-panel', { detail: panel }))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response(JSON.stringify(weatherBlocks)))
  sessionStorage.clear()
  useAviationRadarMock.mockReturnValue(unavailableSnapshot)
  // jsdom has no <dialog> showModal/close; the page calls both.
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

test('weather happy path: live rows connect the KPI and the radar layer', async () => {
  render(<AviationLive />)
  await waitFor(() => expect(screen.getByText('Live airport weather average')).toBeTruthy())
  expect(screen.getByText('30°C')).toBeTruthy()
  expect(screen.getByTestId('radar-map').getAttribute('data-weather-status')).toBe('connected')
})

test('ITEM 5: a failed weather fetch reports "unavailable", not "connecting"', async () => {
  // The old KPI detail said "Connecting weather feed" for every
  // non-connected state, so a failed feed looked identical to a slow one.
  fetchMock.mockRejectedValue(new Error('weather provider down'))
  render(<AviationLive />)
  await waitFor(() => expect(screen.getByText('Weather feed unavailable')).toBeTruthy())
  expect(screen.getByTestId('radar-map').getAttribute('data-weather-status')).toBe('unavailable')
})

test('ITEM 5: the Weather & Alerts dialog says the rows are unavailable after a failure', async () => {
  fetchMock.mockRejectedValue(new Error('weather provider down'))
  render(<AviationLive />)
  await waitFor(() => expect(screen.getByText('Weather feed unavailable')).toBeTruthy())
  openPanel('Weather & Alerts')
  await waitFor(() => expect(screen.getByText('Weather rows are unavailable from the provider.')).toBeTruthy())
})

test('S4: a timeout abort marks the weather feed unavailable instead of hanging on "loading"', async () => {
  // Simulates the 8 s AbortSignal.timeout firing: the fetch rejects with
  // AbortError while the component is still mounted. The old catch
  // swallowed every AbortError, so the panel stayed "loading" forever.
  fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
  render(<AviationLive />)
  await waitFor(() => expect(screen.getByText('Weather feed unavailable')).toBeTruthy())
})

test('S4: a hung Open-Meteo request times out at 8 s (real timers)', { timeout: 15_000 }, async () => {
  // End-to-end proof of the timeout: the request never answers unless its
  // signal fires. Without AbortSignal.timeout the panel would stay on
  // "Connecting weather feed" until the next 5-minute tick.
  // (AbortSignal.timeout uses Node-internal timers that vitest's fake
  // timers do not control, so this test runs on real time.)
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  render(<AviationLive />)
  await waitFor(() => expect(screen.getByText('Weather feed unavailable')).toBeTruthy(), { timeout: 12_000, interval: 250 })
})

test('ITEM 5: the Corridor Analysis dialog shows "—" for active zones when the feed is down', async () => {
  // liveCorridors counts from an empty aircraft array when the feed is
  // down, so the dialog showed a bare 0 — every other surface shows "—"
  // until the feed connects. A 0 implies a measured zero, not no data.
  render(<AviationLive />)
  openPanel('Corridor Analysis')
  await waitFor(() => expect(screen.getByText('active airport zones')).toBeTruthy())
  const zones = screen.getByText('active airport zones').closest('section')
  expect(zones?.textContent).toBe('—active airport zones')
})

test('ITEM 5: the Corridor Analysis dialog shows the real count once the feed connects', async () => {
  useAviationRadarMock.mockReturnValue(connectedSnapshot)
  render(<AviationLive />)
  openPanel('Corridor Analysis')
  await waitFor(() => expect(screen.getByText('active airport zones')).toBeTruthy())
  const zones = screen.getByText('active airport zones').closest('section')
  expect(zones?.textContent).toBe('1active airport zones')
})

// ── Corridor fine print (round 3, 24 Nov 2026) ──────────────────────────────
// The panel counts aircraft within 100 km of major airports; filed flight
// routes are not a published live feed anywhere, so "flight routes
// unavailable" read as a broken feature. The fine print now states what the
// panel shows and what does not exist as a feed.

test('round 3: the corridor fine print states positions only, never "flight routes unavailable"', async () => {
  render(<AviationLive />)
  expect(await screen.findByText('Position counts only · filed flight routes are not published live')).toBeTruthy()
  expect(screen.queryByText(/flight routes unavailable/)).toBeNull()
})
