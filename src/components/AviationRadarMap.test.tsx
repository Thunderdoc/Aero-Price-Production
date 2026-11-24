import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import AviationRadarMap from './AviationRadarMap'
import type { Aircraft, RadarSnapshot } from '../services/aviationRadar'

// The Leaflet map is not under test — the legend is plain JSX outside
// MapContainer, so every Leaflet component renders nothing. MapContainer
// returning null also keeps MapControls (useMap + ResizeObserver) out of
// the jsdom run entirely.
vi.mock('react-leaflet', () => ({
  Circle: () => null,
  CircleMarker: () => null,
  GeoJSON: () => null,
  MapContainer: () => null,
  Marker: () => null,
  Polyline: () => null,
  Popup: () => null,
  TileLayer: () => null,
  Tooltip: () => null,
  useMap: () => ({}),
}))

vi.mock('../services/indiaGeoJson', () => ({
  useIndiaGeoJson: () => ({ data: null, failed: false }),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

function aircraft(overrides: Partial<Aircraft> & { icao24: string }): Aircraft {
  return {
    callsign: 'IGO123', registration: 'VT-ABC', aircraft_type: 'A320',
    latitude: 28.5562, longitude: 77.1, altitude_ft: 35000, ground_speed_kts: 450,
    track_deg: 90, vertical_rate_fpm: 0, on_ground: false, seen_seconds: 5,
    ...overrides,
  }
}

// One aircraft per phase, plus a second airborne one so the counts are
// distinguishable: Airborne 2, Descending 1, Climbing 1, On ground 1.
// flightPhase is real here — the fixtures must satisfy its thresholds
// (descending/climbing need altitude < 16000 ft and |vertical rate| > 200).
const mixedAircraft: Aircraft[] = [
  aircraft({ icao24: '800001' }),
  aircraft({ icao24: '800002', latitude: 19.1, longitude: 72.9 }),
  aircraft({ icao24: '800003', altitude_ft: 8000, vertical_rate_fpm: -900 }),
  aircraft({ icao24: '800004', altitude_ft: 9000, vertical_rate_fpm: 1200 }),
  aircraft({ icao24: '800005', on_ground: true, altitude_ft: 0, ground_speed_kts: 0 }),
]

function snapshot(status: RadarSnapshot['status'], planes: Aircraft[]): RadarSnapshot {
  return { aircraft: planes, source: 'ADSB.lol', retrievedAt: '2026-11-22T10:00:00.000Z', status, refreshing: false, history: [] }
}

// The legend's four <b> cells, in Airborne/Descending/Climbing/On-ground order.
function legendCounts(): string[] {
  const legend = document.querySelector('.av-map-legend')
  if (!legend) throw new Error('legend not rendered')
  return [...legend.querySelectorAll('b')].map(cell => cell.textContent ?? '')
}

test('legend: dashes, not zeros, while the feed is still connecting', () => {
  render(<AviationRadarMap state={snapshot('loading', [])} selected={null} onSelect={() => {}} layer="Live" fullscreen={false} />)
  expect(legendCounts()).toEqual(['—', '—', '—', '—'])
})

test('legend: dashes, not zeros, when the feed is down', () => {
  render(<AviationRadarMap state={snapshot('unavailable', [])} selected={null} onSelect={() => {}} layer="Live" fullscreen={false} />)
  expect(legendCounts()).toEqual(['—', '—', '—', '—'])
})

test('legend: real per-phase counts when connected', () => {
  render(<AviationRadarMap state={snapshot('connected', mixedAircraft)} selected={null} onSelect={() => {}} layer="Live" fullscreen={false} />)
  expect(legendCounts()).toEqual(['2', '1', '1', '1'])
})

test('legend: counts still show from retained positions while cached', () => {
  render(<AviationRadarMap state={snapshot('cached', mixedAircraft)} selected={null} onSelect={() => {}} layer="Live" fullscreen={false} />)
  expect(legendCounts()).toEqual(['2', '1', '1', '1'])
})

test('legend: a measured zero shows 0 — the provider returned no aircraft', () => {
  render(<AviationRadarMap state={snapshot('empty', [])} selected={null} onSelect={() => {}} layer="Live" fullscreen={false} />)
  expect(legendCounts()).toEqual(['0', '0', '0', '0'])
})
