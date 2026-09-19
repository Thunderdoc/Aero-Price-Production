import { useState, useEffect } from 'react'
import { corridors as baseCorridors, indexValue as baseIndex, type Corridor } from '../data/sampleData'

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
  indexValue: number
  indexChange7d: number
  lastUpdated: string
  isLive: boolean
  liveFlights: LiveFlight[]
  connectionStatus: ConnectionStatus
}

const PRICE_UPDATE_MS = 30_000   // 30 seconds
const FLIGHT_REFRESH_MS = 180_000 // 3 minutes — for synthetic refresh

function applyPriceVariance(corridors: Corridor[]): Corridor[] {
  return corridors.map((c) => {
    // ±0.5–2% random variation
    const variancePct = (Math.random() * 1.5 + 0.5) * (Math.random() < 0.5 ? 1 : -1)
    const delta = Math.round(c.currentFare * (variancePct / 100))
    const newFare = Math.max(c.minFare, Math.min(c.maxFare, c.currentFare + delta))

    // Derive trend from running change
    const newChange7d = +(c.change7d + variancePct * 0.1).toFixed(2)
    const trend: Corridor['trend'] =
      newChange7d > 0.5 ? 'up' : newChange7d < -0.5 ? 'down' : 'stable'

    return {
      ...c,
      currentFare: newFare,
      change7d: newChange7d,
      trend,
      freshness: Math.max(1, c.freshness - 1),
    }
  })
}


function formatTimestamp(): string {
  const now = new Date()
  return now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

export function useLiveData(): UseLiveDataResult {
  const [corridors, setCorridors] = useState<Corridor[]>(baseCorridors)
  const [indexValue, setIndexValue] = useState<number>(baseIndex)
  const [indexChange7d] = useState<number>(2.34)
  const [lastUpdated, setLastUpdated] = useState<string>(formatTimestamp())
  const [liveFlights, setLiveFlights] = useState<LiveFlight[]>(() => generateSyntheticFlights())
  // No real airfare sources connected — synthetic positions only
  const [connectionStatus] = useState<ConnectionStatus>('offline')

  // Update corridor prices every 30 s
  useEffect(() => {
    const priceTimer = setInterval(() => {
      setCorridors((prev) => {
        const updated = applyPriceVariance(prev)
        // Recalculate a synthetic index value (weighted average change)
        const weightedChange = updated.reduce(
          (acc, c) => acc + c.change7d * c.weight,
          0,
        )
        const totalWeight = updated.reduce((acc, c) => acc + c.weight, 0)
        const avgChange = weightedChange / totalWeight
        setIndexValue(+(baseIndex * (1 + avgChange / 100)).toFixed(2))
        setLastUpdated(formatTimestamp())
        return updated
      })
    }, PRICE_UPDATE_MS)

    return () => clearInterval(priceTimer)
  }, [])

  // Refresh synthetic flights every 3 minutes
  useEffect(() => {
    const flightTimer = setInterval(() => {
      setLiveFlights(generateSyntheticFlights())
    }, FLIGHT_REFRESH_MS)
    return () => clearInterval(flightTimer)
  }, [])

  return {
    corridors,
    indexValue,
    indexChange7d,
    lastUpdated,
    isLive: false,
    liveFlights,
    connectionStatus,
  }
}

// Synthetic fallback flights scattered over India when API is unavailable
function generateSyntheticFlights(): LiveFlight[] {
  const syntheticRoutes: Array<[number, number, string]> = [
    [28.56, 77.10, 'IGO123'],
    [19.09, 72.87, 'AIC456'],
    [13.20, 77.71, 'SGD789'],
    [22.65, 88.45, 'QPA012'],
    [17.24, 78.43, 'IGO345'],
    [12.99, 80.17, 'AIC678'],
    [26.82, 75.81, 'SGD901'],
    [15.38, 73.83, 'IGO234'],
    [10.15, 76.40, 'AIC567'],
    [23.08, 72.63, 'IGO890'],
    [20.24, 85.82, 'AIC123'],
    [26.11, 91.59, 'IGO456'],
    [30.67, 76.79, 'SGD012'],
    [8.90, 77.45, 'AIC789'],
    [25.59, 85.09, 'IGO321'],
  ]

  return syntheticRoutes.map(([lat, lng, callsign], i) => ({
    icao24: `syn${i.toString().padStart(4, '0')}`,
    callsign,
    lat: lat + (Math.random() - 0.5) * 2,
    lng: lng + (Math.random() - 0.5) * 2,
    altitude: 8000 + Math.random() * 4000,
    velocity: 200 + Math.random() * 150,
    heading: Math.random() * 360,
    origin_country: 'India',
  }))
}
