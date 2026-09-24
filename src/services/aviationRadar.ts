import { useEffect, useSyncExternalStore } from 'react'
import { BASE_URL } from './api'

export type Aircraft = {
  icao24: string; callsign: string; registration: string; aircraft_type: string
  latitude: number; longitude: number; altitude_ft: number | null
  ground_speed_kts: number | null; track_deg: number | null
  vertical_rate_fpm: number | null; on_ground: boolean; seen_seconds: number | null
}
export type RadarSnapshot = {
  aircraft: Aircraft[]; source: string; retrievedAt: string | null
  status: 'loading' | 'connected' | 'unavailable'; refreshing: boolean
  history: { time: string; aircraft: Aircraft[] }[]
}
let snapshot: RadarSnapshot = { aircraft: [], source: '', retrievedAt: null, status: 'loading', refreshing: false, history: [] }
let pending: Promise<void> | null = null
let timer: ReturnType<typeof setInterval> | undefined
let consumers = 0
const listeners = new Set<() => void>()
function publish(next: RadarSnapshot) { snapshot = next; listeners.forEach(listener => listener()) }

export function refreshRadar(): Promise<void> {
  if (pending) return pending
  publish({ ...snapshot, refreshing: true })
  pending = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/aviation/live?limit=150`, { signal: AbortSignal.timeout(45000) })
      if (!response.ok) throw new Error('Tracking feed unavailable')
      const body = await response.json()
      if (!Array.isArray(body.aircraft) || !['LIVE_ADSB', 'LIVE_OPENSKY', 'LIVE_TRACKING_API'].includes(body.data_origin)) throw new Error('Invalid tracking response')
      const ids = new Set<string>()
      const aircraft = (body.aircraft as Aircraft[]).filter(a => {
        const id = a.icao24 || a.callsign
        if (!id || ids.has(id) || !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude)) return false
        ids.add(id); return true
      })
      const time = typeof body.retrieved_at === 'string' && Number.isFinite(Date.parse(body.retrieved_at)) ? body.retrieved_at : null
      publish({ aircraft, source: body.source || 'Aircraft feed', retrievedAt: time, status: 'connected', refreshing: false,
        history: time ? [...snapshot.history, { time, aircraft }].slice(-30) : snapshot.history })
    } catch {
      publish({ ...snapshot, aircraft: [], status: 'unavailable', refreshing: false })
    } finally { pending = null }
  })()
  return pending
}
export function useAviationRadar(enabled = true) {
  const state = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => snapshot)
  useEffect(() => {
    if (!enabled) return
    consumers++
    if (!timer) { void refreshRadar(); timer = setInterval(() => void refreshRadar(), 30000) }
    return () => { if (--consumers === 0) { clearInterval(timer); timer = undefined } }
  }, [enabled])
  return state
}

export const radarAirports = [
  { code: 'DEL', name: 'Delhi', lat: 28.5562, lng: 77.1000 },
  { code: 'BOM', name: 'Mumbai', lat: 19.0896, lng: 72.8656 },
  { code: 'BLR', name: 'Bengaluru', lat: 13.1986, lng: 77.7066 },
  { code: 'MAA', name: 'Chennai', lat: 12.9941, lng: 80.1709 },
  { code: 'CCU', name: 'Kolkata', lat: 22.6547, lng: 88.4467 },
  { code: 'HYD', name: 'Hyderabad', lat: 17.2403, lng: 78.4294 },
  { code: 'AMD', name: 'Ahmedabad', lat: 23.0732, lng: 72.6347 },
  { code: 'GAU', name: 'Guwahati', lat: 26.1061, lng: 91.5859 },
]
export const aircraftId = (a: Aircraft) => a.icao24 || a.callsign
export const aircraftLabel = (a: Aircraft) => a.callsign || a.registration || a.icao24.toUpperCase()
export function operatorName(a: Aircraft) {
  const operators: Record<string, string> = { IGO: 'IndiGo', AIC: 'Air India', AXB: 'Air India Express', AKJ: 'Akasa Air', SEJ: 'SpiceJet', UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad Airways', AEA: 'Air Europa', SIA: 'Singapore Airlines' }
  return operators[a.callsign.slice(0, 3)] || a.registration || 'Operator unavailable'
}
export function flightPhase(a: Aircraft) {
  if (a.on_ground) return { label: 'On ground', color: '#93a9bc', key: 'ground' }
  if (a.altitude_ft != null && a.altitude_ft < 16000 && (a.vertical_rate_fpm ?? 0) < -200) return { label: 'Descending', color: '#facc15', key: 'descending' }
  if (a.altitude_ft != null && a.altitude_ft < 16000 && (a.vertical_rate_fpm ?? 0) > 200) return { label: 'Climbing', color: '#fb923c', key: 'climbing' }
  return { label: 'Airborne', color: '#2ed75c', key: 'airborne' }
}
export function contactFreshness(a: Aircraft) {
  const seen = a.seen_seconds ?? 0
  if (seen > 300) return { label: 'STALE', tone: 'stale' }
  if (seen > 60) return { label: `${Math.round(seen / 60)}M OLD`, tone: 'old' }
  return { label: 'LIVE', tone: 'live' }
}
export const telemetry = (value: number | null, unit: string) => value == null ? '—' : `${Math.round(value).toLocaleString('en-IN')} ${unit}`
export function exportRadar(aircraft: Aircraft[]) {
  const fields: (keyof Aircraft)[] = ['callsign', 'registration', 'aircraft_type', 'latitude', 'longitude', 'altitude_ft', 'ground_speed_kts', 'track_deg', 'vertical_rate_fpm', 'seen_seconds', 'on_ground']
  const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
  const csv = [fields.join(','), ...aircraft.map(a => fields.map(f => cell(a[f])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a'); link.href = url; link.download = 'aeroprice-aircraft.csv'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
