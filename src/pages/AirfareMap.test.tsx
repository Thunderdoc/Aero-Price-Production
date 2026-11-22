import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AerialArc, medianWindowLabel, registerArcAnimator, unregisterArcAnimator } from './AirfareMap'

// Leaflet is stubbed: polylines/markers record their calls and expose the
// internals AerialArc touches (_path for the dash, the marker element for
// the plane rotor).
vi.mock('leaflet', () => {
  const makePolyline = () => ({
    addTo: vi.fn().mockReturnThis(),
    bindTooltip: vi.fn(),
    _path: { style: {} as Record<string, string> },
  })
  const makeMarker = () => {
    const root = document.createElement('div')
    root.appendChild(document.createElement('div'))
    return {
      addTo: vi.fn().mockReturnThis(),
      setLatLng: vi.fn(),
      setIcon: vi.fn(),
      getElement: vi.fn(() => root),
    }
  }
  return {
    default: {
      polyline: vi.fn(() => makePolyline()),
      marker: vi.fn(() => makeMarker()),
      divIcon: vi.fn((options: unknown) => ({ options })),
    },
  }
})

// useMap must return one stable map object, as the real react-leaflet does —
// a fresh object per call would re-run every map effect on each render.
vi.mock('react-leaflet', () => {
  const map = { removeLayer: vi.fn() }
  return {
    useMap: () => map,
    MapContainer: () => null,
    TileLayer: () => null,
    CircleMarker: () => null,
    Tooltip: () => null,
    GeoJSON: () => null,
  }
})

const L = (await import('leaflet')).default
const polylineMock = vi.mocked(L.polyline)
const markerMock = vi.mocked(L.marker)

const arcProps = {
  fromLat: 28.5562, fromLng: 77.1, toLat: 19.0896, toLng: 72.8656,
  color: '#dc2626', weight: 2, routeLabel: 'DEL → BOM',
}
const arcPropsB = {
  fromLat: 28.5562, fromLng: 77.1, toLat: 13.1986, toLng: 77.7066,
  color: '#16a34a', weight: 2, routeLabel: 'DEL → BLR',
}

type StubPolyline = { _path: { style: Record<string, string> } }
type StubMarker = {
  setLatLng: ReturnType<typeof vi.fn>
  setIcon: ReturnType<typeof vi.fn>
  getElement: () => HTMLElement
}

beforeEach(() => {
  polylineMock.mockClear()
  markerMock.mockClear()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('M3: arc layers survive a parent re-render with identical coordinates', () => {
  const { rerender } = render(<AerialArc {...arcProps} />)
  expect(polylineMock).toHaveBeenCalledTimes(2) // glow + arc
  // A parent re-render (e.g. the 30 s radar poll) passes fresh props with
  // identical primitive values — the effect must not re-run.
  rerender(<AerialArc {...arcProps} />)
  rerender(<AerialArc {...arcProps} />)
  expect(polylineMock).toHaveBeenCalledTimes(2)
  // A real coordinate change still rebuilds the arc.
  rerender(<AerialArc {...arcProps} fromLat={28.6} />)
  expect(polylineMock).toHaveBeenCalledTimes(4)
})

test('M4: two arcs share one requestAnimationFrame loop and never use setInterval', () => {
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
  const intervalSpy = vi.spyOn(globalThis, 'setInterval')
  render(<><AerialArc {...arcProps} /><AerialArc {...arcPropsB} /></>)
  expect(rafSpy).toHaveBeenCalledTimes(1)
  expect(intervalSpy).not.toHaveBeenCalled()
})

test('M4: the plane icon is created once and rotated in place across frames', () => {
  const rafCallbacks: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  render(<AerialArc {...arcProps} />)
  const marker = markerMock.mock.results[0].value as unknown as StubMarker
  const arc = polylineMock.mock.results[1].value as unknown as StubPolyline

  // Drive five frames manually in 250 ms steps: t=0 (icon created), then
  // four 0.25 s steps (the per-frame dt clamp).
  rafCallbacks[0](0)
  expect(marker.setIcon).toHaveBeenCalledTimes(1)
  rafCallbacks[1](250)
  rafCallbacks[2](500)
  rafCallbacks[3](750)
  rafCallbacks[4](1000)
  expect(marker.setIcon).toHaveBeenCalledTimes(1)
  expect(marker.setLatLng).toHaveBeenCalledTimes(5)
  // Dash offset advanced at the old rate (−30/s): four 0.25 s steps.
  expect(arc._path.style.strokeDashoffset).toBe('-30')
  // The rotor element was rotated in place, not rebuilt.
  const rotor = marker.getElement().firstElementChild as HTMLElement
  expect(rotor.style.transform).toMatch(/^rotate\(.+deg\)$/)
})

test('M4: the shared loop ticks every animator and stops when the last one leaves', () => {
  const rafCallbacks: FrameRequestCallback[] = []
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb)
    return rafCallbacks.length
  })
  const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  const a = { tick: vi.fn() }
  const b = { tick: vi.fn() }
  registerArcAnimator(a)
  registerArcAnimator(b)
  expect(rafSpy).toHaveBeenCalledTimes(1)

  rafCallbacks[0](100)
  expect(a.tick).toHaveBeenCalledTimes(1)
  expect(b.tick).toHaveBeenCalledTimes(1)
  expect(rafSpy).toHaveBeenCalledTimes(2) // the loop re-scheduled itself

  unregisterArcAnimator(a)
  expect(cancelSpy).not.toHaveBeenCalled() // one animator remains
  unregisterArcAnimator(b)
  expect(cancelSpy).toHaveBeenCalledTimes(1)
})

// M5: the sidebar median label must match the window the backend used — a
// 7-day fallback median must not be called a "Latest-day median".
test('M5: median label follows the sample window', () => {
  expect(medianWindowLabel(1)).toBe('Latest-day median')
  expect(medianWindowLabel(undefined)).toBe('Latest-day median')
  expect(medianWindowLabel(7)).toBe('7-day median')
  expect(medianWindowLabel(3)).toBe('3-day median')
})
