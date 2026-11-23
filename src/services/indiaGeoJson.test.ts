import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { __resetIndiaGeoJsonCache, INDIA_GEOJSON_URL, loadIndiaGeoJson, useIndiaGeoJson } from './indiaGeoJson'

const fetchMock = vi.fn<typeof fetch>()
const geoBody = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ST_NM: 'Delhi' }, geometry: null }] }

beforeEach(() => {
  __resetIndiaGeoJsonCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response(JSON.stringify(geoBody)))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test('M7: two concurrent loads share one fetch for the same file', async () => {
  const [first, second] = await Promise.all([loadIndiaGeoJson(), loadIndiaGeoJson()])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe(INDIA_GEOJSON_URL)
  expect(first).toEqual(geoBody)
  expect(second).toEqual(geoBody)
})

test('M7: a later load reuses the cached result without a second request', async () => {
  await loadIndiaGeoJson()
  await loadIndiaGeoJson()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('M7: a failed load does not poison the cache — the next caller retries', async () => {
  fetchMock.mockRejectedValueOnce(new Error('network down'))
  await expect(loadIndiaGeoJson()).rejects.toThrow('network down')
  // The retry must fetch again (a cached rejection would fail without one)
  // and can succeed once the network recovers.
  await expect(loadIndiaGeoJson()).resolves.toEqual(geoBody)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('M7: a non-OK response rejects and clears the cache', async () => {
  fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }))
  await expect(loadIndiaGeoJson()).rejects.toThrow('India boundaries unavailable')
  await expect(loadIndiaGeoJson()).resolves.toEqual(geoBody)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('M7: the hook surfaces the loaded boundaries', async () => {
  const { result } = renderHook(() => useIndiaGeoJson())
  await waitFor(() => expect(result.current.data).toEqual(geoBody))
  expect(result.current.failed).toBe(false)
})

test('M7: the hook reports failure instead of failing silently', async () => {
  fetchMock.mockRejectedValue(new Error('network down'))
  const { result } = renderHook(() => useIndiaGeoJson())
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.data).toBeNull()
})

test('M7: two hook instances (fare map + radar map) share one fetch', async () => {
  const first = renderHook(() => useIndiaGeoJson())
  const second = renderHook(() => useIndiaGeoJson())
  await waitFor(() => expect(first.result.current.data).toEqual(geoBody))
  await waitFor(() => expect(second.result.current.data).toEqual(geoBody))
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
