// AeroPrice — Real flight data service
// Keys loaded from .env (gitignored). Never hardcode keys in source.
import { BASE_URL } from './api'


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
  latitude?: number
  longitude?: number
  altitude_ft?: number | null
  ground_speed_kts?: number | null
  track_deg?: number | null
  registration?: string
  aircraft_type?: string
  source?: string
  freshness?: 'LIVE' | 'RECENT CACHE' | 'LAST KNOWN' | 'OFFICIAL PUBLISHED' | 'POSITION ONLY'
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

/** Fetch live domestic Indian flights from AviationStack or live radar stream */
export async function fetchLiveFlights(
  depIata: string,
  arrIata?: string
): Promise<{ flights: LiveFlight[]; source: 'REAL'; error?: string }> {
  try {
    const params = new URLSearchParams({ departure: depIata, limit: '25' })
    if (arrIata) params.set('arrival', arrIata)
    const res = await fetch(`${BASE_URL}/api/aviation/schedules?${params}`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const json = await res.json() as { flights?: LiveFlight[] }
      if (json.flights && json.flights.length > 0) {
        return { flights: json.flights, source: 'REAL' }
      }
    }
  } catch {
    // No fallback fleet: return an honest empty result instead of simulated
    // telemetry. The fake fleet generator was deleted (Nov 2026).
  }

  return { flights: [], source: 'REAL', error: 'No live schedule rows returned by the connected provider.' }
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

export async function fetchAllCorridorFlights(): Promise<Array<{ flights: LiveFlight[]; source: 'REAL' }>> {
  try {
    const response = await fetch(`${BASE_URL}/api/aviation/live?limit=150`, {
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      const body = await response.json()
      const aircraftList = body.aircraft ?? []
      if (aircraftList.length > 0) {
        const flights: LiveFlight[] = aircraftList.map((a: Record<string, unknown>) => {
          const callsign = String(a.callsign ?? '').trim()
          const prefix = callsign.slice(0, 3)
          const airlines: Record<string, string> = {
            IGO: 'IndiGo', AIC: 'Air India', AXB: 'Air India Express',
            AKJ: 'Akasa Air', SEJ: 'SpiceJet', VTI: 'Vistara',
          }
          return {
            flight_iata: callsign || String(a.registration ?? a.icao24 ?? ''),
            airline_name: airlines[prefix] ?? 'Live ADS-B aircraft',
            airline_iata: prefix,
            dep_iata: '', dep_city: '', arr_iata: '', arr_city: '',
            dep_scheduled: '', arr_scheduled: '', status: body.provider_status === 'CACHED' ? 'cached' : 'active',
            dep_actual: null, arr_actual: null,
            latitude: Number(a.latitude), longitude: Number(a.longitude),
            altitude_ft: a.altitude_ft as number | null,
            ground_speed_kts: a.ground_speed_kts as number | null,
            track_deg: a.track_deg as number | null,
            registration: String(a.registration ?? ''),
            aircraft_type: String(a.aircraft_type ?? ''),
            source: body.source ?? 'ADSB.lol',
            freshness: body.provider_status === 'CACHED' ? 'RECENT CACHE' : 'POSITION ONLY',
          }
        })
        return [{ flights, source: 'REAL' as const }]
      }
    }
  } catch {
    // Continue to fallback
  }

  // Never substitute a simulated fleet for a provider response. Aviation screens
  // must be honest when the live radar source has no rows available.
  return [{ flights: [], source: 'REAL' as const }]
}

// ── EF API (ak_live_ key) ─────────────────────────────────────────────────────
export const EF_CONFIGURED = false
export const IGNAV_CONFIGURED = false

/** Source health summary for the Data Sources page */
export function getApiHealth() {
  return {
    aviationstack: {
      name: 'AviationStack',
      configured: false,
      keyPrefix: null,
    },
    ef: {
      name: 'EF Live Fares API',
      configured: false,
      keyPrefix: 'ak_live_a9f...',
    },
    ignav: {
      name: 'Ignav Aviation Data',
      configured: false,
      keyPrefix: 'ig_prod_44b...',
    },
  }
}
