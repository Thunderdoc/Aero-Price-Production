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
import { useEffect, useRef, useState } from 'react'
import { apiAviationLive, apiDashboard } from '../services/api'
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('delayed')
  const [indexValue, setIndexValue] = useState<number | null>(null)
  const [indexChange7d] = useState<number | null>(null)
  const [realObservations, setRealObservations] = useState(0)
  const [sourcesLive, setSourcesLive] = useState(0)
  const [liveFlights, setLiveFlights] = useState<LiveFlight[]>([])
  const [lastUpdated, setLastUpdated] = useState(formatTimestamp())
  // D3: a slow dashboard response must not overlap the next 60 s tick — a
  // tick that arrives while a fetch is in flight is skipped, and the
  // following tick retries. (With the 3 s health probe + 12 s dashboard
  // abort + 30 s aviation budget, a full pass now finishes well inside
  // 60 s; the guard protects the poll against future slow paths.)
  const inFlightRef = useRef(false)
  async function fetchDashboard() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      // No health-probe gate: its 3 s timeout false-negatived on slow wakes
      // and marked the connection offline while the real calls would have
      // succeeded. The dashboard result itself is the reachability signal.
      if (!token) {
        setConnectionStatus('delayed')
        return
      }
      // Dashboard and aviation are independent — fetch them in parallel.
      // A radar failure must not flip the fare status, and vice versa.
      const [dashResult, flightResult] = await Promise.allSettled([
        apiDashboard(token),
        apiAviationLive(token),
      ])
      if (dashResult.status === 'rejected') {
        setConnectionStatus('delayed')
      } else {
        const dash = dashResult.value
        setRealObservations(dash.real_observations ?? 0)
        setSourcesLive(dash.sources_live ?? 0)
        setIndexValue(dash.index_value ?? null)
        setLastUpdated(formatTimestamp())
        setConnectionStatus((dash.sources_live ?? 0) > 0 ? 'live' : 'delayed')
      }
      if (flightResult.status === 'fulfilled') {
        const flightBody = flightResult.value
        const aircraft = flightBody.aircraft.map((item, index) => ({
          icao24: item.icao24 || item.registration || `live-${index}`,
          callsign: (item.callsign || item.registration || 'UNKNOWN').trim(),
          lat: Number(item.latitude), lng: Number(item.longitude),
          altitude: Number(item.altitude_ft ?? 0), velocity: Number(item.ground_speed_kts ?? 0),
          heading: Number(item.track_deg ?? 0), origin_country: 'Unknown',
        })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng))
        setLiveFlights(aircraft)
      }
      // A rejected radar call keeps the last known positions.
    } catch {
      setConnectionStatus('offline')
    } finally {
      inFlightRef.current = false
    }
  }

  // D3 note — why the 60 s poll stays instead of folding into the radar
  // store: the two polls measure different things. This hook's
  // connectionStatus comes from the fare dashboard (backend reachability +
  // sources_live); the radar store's status comes from the ADS-B provider
  // feed. ADS-B can be up while the fare database is down, and vice versa —
  // merging them would report one feed's health as the other's. Folding
  // would also just move the dashboard poll into the radar store, not
  // remove a request. The single consumer (AirfareMap) uses only
  // connectionStatus, but that field still needs a live dashboard read.
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
