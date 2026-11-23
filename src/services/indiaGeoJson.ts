/**
 * Shared India state-boundaries GeoJSON loader (M7).
 *
 * The fare map (AirfareMap) and the radar map (AviationRadarMap) both need
 * the same bundled file, and each used to fetch it separately — two
 * requests for one 271-feature file, with the fare map swallowing failures
 * silently. This module fetches it once per page load and shares the
 * result; a failed load clears the cache so a later mount retries instead
 * of caching the failure forever.
 *
 * No per-component AbortController: the promise is shared, so one
 * unmounting component must not cancel a load another component is still
 * waiting on. The hook guards setState with its own `active` flag instead.
 */
import { useEffect, useState } from 'react'
import type { GeoJsonObject } from 'geojson'

export const INDIA_GEOJSON_URL = '/maps/india-states-2019.geojson'

let cachedPromise: Promise<GeoJsonObject> | null = null

export function loadIndiaGeoJson(): Promise<GeoJsonObject> {
  if (!cachedPromise) {
    cachedPromise = fetch(INDIA_GEOJSON_URL)
      .then((response) => {
        if (!response.ok) throw new Error('India boundaries unavailable')
        return response.json() as Promise<GeoJsonObject>
      })
      .catch((error: unknown) => {
        // A failed load must not poison the cache: clear it so the next
        // caller retries the fetch instead of re-reading the failure.
        cachedPromise = null
        throw error
      })
  }
  return cachedPromise
}

/** Test-only: drop the cached load so each test starts from a fresh fetch. */
export function __resetIndiaGeoJsonCache(): void {
  cachedPromise = null
}

export interface IndiaGeoJsonState {
  data: GeoJsonObject | null
  failed: boolean
}

export function useIndiaGeoJson(): IndiaGeoJsonState {
  const [data, setData] = useState<GeoJsonObject | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    loadIndiaGeoJson()
      .then((geo) => { if (active) setData(geo) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])

  return { data, failed }
}
