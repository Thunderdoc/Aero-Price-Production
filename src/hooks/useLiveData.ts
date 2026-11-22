/**
 * useLiveData — fetches real-time dashboard state from the backend API.
 *
 * Provenance contract:
 *   - isLive=true only when the API returns real (data_origin="REAL") observations.
 *   - connectionStatus="offline" ONLY when the backend is unreachable.
 *   - connectionStatus="live" when real data is available.
 *   - connectionStatus="delayed" when the backend is up but no data flows for
 *     this user yet — that covers signed-out (no token), a dashboard endpoint
 *     failing against a reachable backend (e.g. DB down), and genuinely no
 *     live observations. "Offline" must never be shown for those: the backend
 *     is reachable, the data is not.
 *
 * No synthetic price variance. No fake LIVE indicators.
 */
import { useState, useEffect } from 'react'
import { apiAviationLive, apiDashboard, isBackendAvailable } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

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
  const { token } = useAuth()
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
      // Backend is reachable but the user is signed out: no data can flow,
      // but the backend is NOT offline.
      if (!token) {
        setConnectionStatus('delayed')
        return
      }
      let dash
      try {
        dash = await apiDashboard(token)
      } catch {
        // Backend is up (isBackendAvailable passed) but the dashboard call
        // failed — e.g. the database is down. That is "no data", not offline.
        setConnectionStatus('delayed')
        return
      }
      setRealObservations(dash.real_observations ?? 0)
      setSourcesLive(dash.sources_live ?? 0)
      setIndexValue(dash.index_value ?? null)
      setLastUpdated(formatTimestamp())
      setConnectionStatus((dash.sources_live ?? 0) > 0 ? 'live' : 'delayed')
      // The radar feed is independent of the fare dashboard: a radar failure
      // must not flip the whole connection status to offline.
      try {
        // M2: /api/aviation/live requires auth — the old bare fetch() sent no
        // Authorization header and 401d. Route through the authed helper
        // with this hook's token, like apiDashboard above.
        const flightBody = await apiAviationLive(token ?? undefined)
        const aircraft = flightBody.aircraft.map((item, index) => ({
          icao24: item.icao24 || item.registration || `live-${index}`,
          callsign: (item.callsign || item.registration || 'UNKNOWN').trim(),
          lat: Number(item.latitude), lng: Number(item.longitude),
          altitude: Number(item.altitude_ft ?? 0), velocity: Number(item.ground_speed_kts ?? 0),
          heading: Number(item.track_deg ?? 0), origin_country: 'Unknown',
        })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        setLiveFlights(aircraft)
      } catch {
        // Keep the last known positions; the fare status above stands.
      }
    } catch {
      setConnectionStatus('offline')
    }
  }

  useEffect(() => {
    fetchDashboard()
    const timer = setInterval(fetchDashboard, REFRESH_MS)
    return () => clearInterval(timer)
  }, [token])

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
