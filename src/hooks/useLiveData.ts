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
 * Flight positions are always synthetic and always labelled as such.
 */
import { useState, useEffect } from 'react'
import { type Corridor } from '../data/sampleData'
import { apiDashboard, isBackendAvailable } from '../services/api'

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

// Synthetic flight blips — static module-level constant so they don't shift hook counts
const SYNTHETIC_FLIGHTS: LiveFlight[] = (() => {
  const waypoints: [number, number, string][] = [
    [28.56, 77.10, 'IGO123'], [19.09, 72.87, 'AIC456'], [13.20, 77.71, 'SGD789'],
    [22.65, 88.45, 'QPA012'], [17.24, 78.43, 'IGO345'], [12.99, 80.17, 'AIC678'],
    [26.82, 75.81, 'SGD901'], [15.38, 73.83, 'IGO234'], [10.15, 76.40, 'AIC567'],
    [23.08, 72.63, 'IGO890'], [20.24, 85.82, 'AIC123'], [26.11, 91.59, 'IGO456'],
    [30.67, 76.79, 'SGD012'], [8.90,  77.45, 'AIC789'], [25.59, 85.09, 'IGO321'],
  ]
  return waypoints.map(([lat, lng, callsign], i) => ({
    icao24: `syn${i.toString().padStart(4, '0')}`,
    callsign,
    lat: lat + (Math.random() - 0.5) * 1.5,
    lng: lng + (Math.random() - 0.5) * 1.5,
    altitude: 8000 + Math.random() * 4000,
    velocity: 200 + Math.random() * 150,
    heading: Math.random() * 360,
    origin_country: 'India',
  }))
})()

export function useLiveData(): UseLiveDataResult {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline')
  const [indexValue, setIndexValue] = useState<number | null>(null)
  const [indexChange7d] = useState<number | null>(null)
  const [realObservations, setRealObservations] = useState(0)
  const [sourcesLive, setSourcesLive] = useState(0)
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
    liveFlights: SYNTHETIC_FLIGHTS,
    connectionStatus,
    realObservations,
    sourcesLive,
  }
}
