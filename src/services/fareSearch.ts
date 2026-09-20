// AeroPrice — Real airfare search via SerpAPI Google Flights
// Key loaded from .env — never hardcoded.

const SERPAPI_KEY = import.meta.env.VITE_SERPAPI_KEY as string

export interface FareResult {
  origin: string
  destination: string
  airline: string
  flight_number: string
  departure_time: string
  arrival_time: string
  duration: string
  stops: number
  price: number
  currency: 'INR'
  cabin: 'ECONOMY' | 'BUSINESS'
  source: 'SERPAPI_GOOGLE_FLIGHTS'
  fetched_at: string
}

export interface FareSearchParams {
  origin: string
  destination: string
  date: string         // YYYY-MM-DD
  cabin?: 'economy' | 'business'
  adults?: number
}

export interface FareSearchResult {
  fares: FareResult[]
  source: 'REAL' | 'UNAVAILABLE'
  error?: string
  query: FareSearchParams
}

/** Search real Indian domestic fares via SerpAPI Google Flights */
export async function searchFares(params: FareSearchParams): Promise<FareSearchResult> {
  if (!SERPAPI_KEY) {
    return { fares: [], source: 'UNAVAILABLE', error: 'VITE_SERPAPI_KEY not set', query: params }
  }

  try {
    const qs = new URLSearchParams({
      engine: 'google_flights',
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.date,
      currency: 'INR',
      hl: 'en',
      type: '2',           // one-way
      adults: String(params.adults ?? 1),
      travel_class: params.cabin === 'business' ? '2' : '1',
      api_key: SERPAPI_KEY,
    })

    // SerpAPI doesn't allow direct browser CORS — use their JSON endpoint
    const url = `https://serpapi.com/search.json?${qs}`
    const res = await fetch(url)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SerpAPI HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    const json = await res.json()

    if (json.error) throw new Error(json.error)

    const rawFlights = [
      ...(json.best_flights ?? []),
      ...(json.other_flights ?? []),
    ]

    const now = new Date().toISOString()
    const fares: FareResult[] = []

    for (const f of rawFlights) {
      const legs: Record<string, unknown>[] = f.flights ?? [f]
      const first = legs[0] as Record<string, unknown>
      const last  = legs[legs.length - 1] as Record<string, unknown>

      const depAirport = first?.departure_airport as Record<string, unknown> | undefined
      const arrAirport = last?.arrival_airport   as Record<string, unknown> | undefined

      fares.push({
        origin:         params.origin,
        destination:    params.destination,
        airline:        (first?.airline as string) ?? 'Unknown',
        flight_number:  (first?.flight_number as string) ?? '',
        departure_time: (depAirport?.time as string) ?? '',
        arrival_time:   (arrAirport?.time as string) ?? '',
        duration:       f.total_duration
          ? `${Math.floor(f.total_duration / 60)}h ${f.total_duration % 60}m`
          : '',
        stops:          Math.max(0, legs.length - 1),
        price:          Number(f.price ?? 0),
        currency:       'INR',
        cabin:          params.cabin === 'business' ? 'BUSINESS' : 'ECONOMY',
        source:         'SERPAPI_GOOGLE_FLIGHTS',
        fetched_at:     now,
      })
    }

    return { fares, source: 'REAL', query: params }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { fares: [], source: 'UNAVAILABLE', error: msg, query: params }
  }
}

export const FARE_CORRIDORS = [
  { dep: 'DEL', arr: 'BOM', label: 'Delhi → Mumbai' },
  { dep: 'DEL', arr: 'BLR', label: 'Delhi → Bengaluru' },
  { dep: 'DEL', arr: 'CCU', label: 'Delhi → Kolkata' },
  { dep: 'DEL', arr: 'HYD', label: 'Delhi → Hyderabad' },
  { dep: 'BOM', arr: 'BLR', label: 'Mumbai → Bengaluru' },
  { dep: 'BOM', arr: 'MAA', label: 'Mumbai → Chennai' },
  { dep: 'BLR', arr: 'HYD', label: 'Bengaluru → Hyderabad' },
  { dep: 'BLR', arr: 'MAA', label: 'Bengaluru → Chennai' },
  { dep: 'DEL', arr: 'AMD', label: 'Delhi → Ahmedabad' },
  { dep: 'DEL', arr: 'JAI', label: 'Delhi → Jaipur' },
  { dep: 'BOM', arr: 'GOI', label: 'Mumbai → Goa' },
  { dep: 'CCU', arr: 'GAU', label: 'Kolkata → Guwahati' },
]

function offsetDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function fetchCorridorFareWindows(dep: string, arr: string) {
  const windows = [1, 7, 15, 30, 45]
  const results = await Promise.allSettled(
    windows.map(days =>
      searchFares({ origin: dep, destination: arr, date: offsetDate(days) })
        .then(r => ({ ...r, advance_days: days }))
    )
  )
  return results
    .filter((r): r is PromiseFulfilledResult<FareSearchResult & { advance_days: number }> =>
      r.status === 'fulfilled')
    .map(r => r.value)
}

export const SERPAPI_CONFIGURED = !!SERPAPI_KEY
