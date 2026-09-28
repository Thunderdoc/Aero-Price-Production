/**
 * useLiveData — fetches real-time dashboard state from the backend API.
 *
 * Provenance contract:
 *   - isLive=true only when the API returns real (data_origin="REAL") observations.
 *   - connectionStatus="offline" when the backend is unreachable.
 *   - connectionStatus="live" when real data is available.
 *   - connectionStatus="delayed" when backend is up but no real observations exist yet.
 *
 * No synthetic price variance. No fake LIVE indicators.
 */
import { useState, useEffect } from 'react'
import { apiDashboard, BASE_URL, isBackendAvailable } from '../services/api'

type Corridor = never

export interface LiveFlight {
  icao24: string
  callsign: string
  lat: number
  lng: number
  altitude: number
  velocity: number
  heading: number
  origin_country: string
}

export type ConnectionStatus = 'live' | 'delayed' | 'offline'

export interface UseLiveDataResult {
  corridors: Corridor[]
  indexValue: number | null
  indexChange7d: number | null
  lastUpdated: string
  isLive: boolean
  liveFlights: LiveFlight[]
  connectionStatus: ConnectionStatus
  realObservations: number
  sourcesLive: number
}

const REFRESH_MS = 60_000  // poll every 60 s

function formatTimestamp(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

export function useLiveData(): UseLiveDataResult {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline')
  const [indexValue, setIndexValue] = useState<number | null>(null)
  const [indexChange7d] = useState<number | null>(null)
  const [realObservations, setRealObservations] = useState(0)
  const [sourcesLive, setSourcesLive] = useState(0)
  const [liveFlights, setLiveFlights] = useState<LiveFlight[]>([])
  const [lastUpdated, setLastUpdated] = useState(formatTimestamp())
  async function fetchDashboard() {
    try {
      const up = await isBackendAvailable()
      if (!up) {
        setConnectionStatus('offline')
        return
      }
      const dash = await apiDashboard()
      setRealObservations(dash.real_observations ?? 0)
      setSourcesLive(dash.sources_live ?? 0)
      setIndexValue(dash.index_value ?? null)
      setLastUpdated(formatTimestamp())
      setConnectionStatus(dash.real_observations > 0 ? 'live' : 'delayed')
      const flightResponse = await fetch(`${BASE_URL}/api/aviation/live?limit=150`, { signal: AbortSignal.timeout(8000) })
      if (!flightResponse.ok) throw new Error('aviation feed unavailable')
      const flightBody = await flightResponse.json() as { aircraft?: Array<Record<string, unknown>> }
      const aircraft = (flightBody.aircraft ?? []).map((item, index) => ({
        icao24: String(item.icao24 ?? item.registration ?? `live-${index}`),
        callsign: String(item.callsign ?? item.registration ?? 'UNKNOWN').trim(),
        lat: Number(item.latitude ?? item.lat), lng: Number(item.longitude ?? item.lng),
        altitude: Number(item.altitude_ft ?? item.altitude ?? 0), velocity: Number(item.ground_speed_kts ?? item.velocity ?? 0),
        heading: Number(item.track_deg ?? item.heading ?? 0), origin_country: String(item.origin_country ?? 'Unknown'),
      })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
      setLiveFlights(aircraft)
    } catch {
      setConnectionStatus('offline')
    }
  }

  useEffect(() => {
    fetchDashboard()
    const timer = setInterval(fetchDashboard, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  return {
    corridors: [],            // no synthetic corridors — pages should use API directly
    indexValue,
    indexChange7d,
    lastUpdated,
    isLive: connectionStatus === 'live',
    liveFlights,
    connectionStatus,
    realObservations,
    sourcesLive,
  }
}
