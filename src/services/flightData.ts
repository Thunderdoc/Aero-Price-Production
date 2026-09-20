// AeroPrice — Real flight data service
// Keys loaded from .env (gitignored). Never hardcode keys in source.

const AVIATION_KEY = import.meta.env.VITE_FLIGHT_API_KEY as string
const EF_KEY       = import.meta.env.VITE_EF_API_KEY as string
const IGNAV_KEY    = import.meta.env.VITE_IGNAV_API_KEY as string

// ── AviationStack — live domestic flights ─────────────────────────────────────
// Docs: https://aviationstack.com/documentation
const AVIATION_BASE = 'https://api.aviationstack.com/v1'

export interface LiveFlight {
  flight_iata: string
  airline_name: string
  airline_iata: string
  dep_iata: string
  dep_city: string
  arr_iata: string
  arr_city: string
  dep_scheduled: string
  arr_scheduled: string
  status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | string
  dep_actual: string | null
  arr_actual: string | null
}

export interface LiveFare {
  origin: string
  destination: string
  airline: string
  flight_number: string
  departure: string
  arrival: string
  price: number
  currency: string
  cabin: string
  available_seats: number
}

/** Fetch live domestic Indian flights from AviationStack */
export async function fetchLiveFlights(
  depIata: string,
  arrIata?: string
): Promise<{ flights: LiveFlight[]; source: 'REAL' | 'UNAVAILABLE'; error?: string }> {
  if (!AVIATION_KEY) {
    return { flights: [], source: 'UNAVAILABLE', error: 'VITE_FLIGHT_API_KEY not set' }
  }

  try {
    const params = new URLSearchParams({
      access_key: AVIATION_KEY,
      dep_iata: depIata,
      flight_status: 'active',
      limit: '25',
    })
    if (arrIata) params.set('arr_iata', arrIata)

    const res = await fetch(`${AVIATION_BASE}/flights?${params}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = await res.json()
    if (json.error) throw new Error(json.error.message ?? 'AviationStack error')

    const flights: LiveFlight[] = (json.data ?? []).map((f: Record<string, unknown>) => {
      const dep = f.departure as Record<string, unknown>
      const arr = f.arrival as Record<string, unknown>
      const al  = f.airline  as Record<string, unknown>
      const fl  = f.flight   as Record<string, unknown>
      return {
        flight_iata:   (fl?.iata as string)  ?? '',
        airline_name:  (al?.name as string)  ?? '',
        airline_iata:  (al?.iata as string)  ?? '',
        dep_iata:      (dep?.iata as string) ?? depIata,
        dep_city:      (dep?.airport as string) ?? '',
        arr_iata:      (arr?.iata as string) ?? (arrIata ?? ''),
        arr_city:      (arr?.airport as string) ?? '',
        dep_scheduled: (dep?.scheduled as string) ?? '',
        arr_scheduled: (arr?.scheduled as string) ?? '',
        status:        (f.flight_status as string) ?? 'unknown',
        dep_actual:    (dep?.actual as string | null) ?? null,
        arr_actual:    (arr?.actual as string | null) ?? null,
      }
    })

    return { flights, source: 'REAL' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { flights: [], source: 'UNAVAILABLE', error: msg }
  }
}

/** Fetch Indian domestic flights across the 6 major corridors for the map */
export const INDIA_CORRIDORS = [
  { dep: 'DEL', arr: 'BOM' },
  { dep: 'DEL', arr: 'BLR' },
  { dep: 'DEL', arr: 'CCU' },
  { dep: 'BOM', arr: 'MAA' },
  { dep: 'BLR', arr: 'HYD' },
  { dep: 'DEL', arr: 'HYD' },
]

export async function fetchAllCorridorFlights() {
  const results = await Promise.allSettled(
    INDIA_CORRIDORS.map(c => fetchLiveFlights(c.dep, c.arr))
  )
  return results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchLiveFlights>>> =>
      r.status === 'fulfilled')
    .map(r => r.value)
}

// ── EF API (ak_live_ key) ─────────────────────────────────────────────────────
// Forward to backend when EF base URL is known. Using as identifier only for now.
export const EF_CONFIGURED  = !!EF_KEY
export const IGNAV_CONFIGURED = !!IGNAV_KEY

/** Source health summary for the Data Sources page */
export function getApiHealth() {
  return {
    aviationstack: {
      name: 'AviationStack',
      configured: !!AVIATION_KEY,
      keyPrefix: AVIATION_KEY ? AVIATION_KEY.slice(0, 6) + '…' : null,
    },
    ef: {
      name: 'EF Live Fares API',
      configured: !!EF_KEY,
      keyPrefix: EF_KEY ? EF_KEY.slice(0, 9) + '…' : null,
    },
    ignav: {
      name: 'Ignav Aviation Data',
      configured: !!IGNAV_KEY,
      keyPrefix: IGNAV_KEY ? IGNAV_KEY.slice(0, 8) + '…' : null,
    },
  }
}
