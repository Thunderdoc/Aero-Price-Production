import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
// AerialArc replaces AnimatedPolyline — curved great-circle routes with aircraft
import 'leaflet/dist/leaflet.css'
import { Activity, Radio, Filter } from 'lucide-react'

import { AIRPORTS } from '../data/airports'
import { useLiveData } from '../hooks/useLiveData'
import { useAuth } from '../contexts/AuthContext'
import { apiFareMovement, apiFareSummary, apiRouteBasket } from '../services/api'
import TrendIndicator from '../components/TrendIndicator'
import { useAviationRadar } from '../services/aviationRadar'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = 'ALL' | 'RISING' | 'FALLING' | 'STABLE'

interface MapCorridor {
  id: string
  from: string
  to: string
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  currentFare: number
  minFare: number
  maxFare: number
  observations: number
  samplePeriod: string
  observedAt: string | null
  trend: 'up' | 'down' | 'stable' | 'unknown'
  movementAvailable: boolean
  change7d: number
  weight: number
}

// ─── Colour helpers (raw hex needed by Leaflet) ───────────────────────────────

const TREND_COLORS: Record<MapCorridor['trend'], string> = {
  up: '#dc2626',      // var(--color-danger)
  down: '#16a34a',    // var(--color-success)
  stable: '#d97706',  // var(--color-warning)
  unknown: '#2563eb',
}

const TIER_RADIUS: Record<string, number> = {
  HIGH: 10,
  MEDIUM: 7,
  LOW: 5,
}

// ─── Arc helpers ─────────────────────────────────────────────────────────────

/** Generate N points along a quadratic bezier arc in lat/lng space */
function arcPoints(
  from: [number, number],
  to: [number, number],
  steps = 60,
): [number, number][] {
  const [lat1, lng1] = from
  const [lat2, lng2] = to

  // Midpoint offset — perpendicular deflection scaled by distance
  const mlat = (lat1 + lat2) / 2
  const mlng = (lng1 + lng2) / 2
  const dlat = lat2 - lat1
  const dlng = lng2 - lng1
  const dist  = Math.sqrt(dlat * dlat + dlng * dlng)
  // Perp unit vector (rotate 90°): (-dlng, dlat) / dist
  const k = 0.35 // arc height as fraction of chord
  const clat = mlat + (-dlng / dist) * dist * k
  const clng  = mlng + ( dlat / dist) * dist * k

  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const s = 1 - t
    // Quadratic bezier
    const lat = s * s * lat1 + 2 * s * t * clat + t * t * lat2
    const lng  = s * s * lng1 + 2 * s * t * clng  + t * t * lng2
    pts.push([lat, lng])
  }
  return pts
}

/** Tangent heading (degrees) at parameter t along the bezier arc */
function arcHeading(
  from: [number, number],
  to: [number, number],
  t: number,
): number {
  const [lat1, lng1] = from
  const [lat2, lng2] = to
  const mlat = (lat1 + lat2) / 2
  const mlng = (lng1 + lng2) / 2
  const dlat = lat2 - lat1
  const dlng = lng2 - lng1
  const dist  = Math.sqrt(dlat * dlat + dlng * dlng)
  const k = 0.35
  const clat = mlat + (-dlng / dist) * dist * k
  const clng  = mlng + ( dlat / dist) * dist * k

  // Derivative of quadratic bezier
  const s = 1 - t
  const dLat = 2 * (-s * lat1 + (1 - 2 * t) * clat + t * lat2)
  const dLng  = 2 * (-s * lng1 + (1 - 2 * t) * clng  + t * lng2)
  return Math.atan2(dLng, dLat) * (180 / Math.PI)
}

// ─── Aerial Arc Route ─────────────────────────────────────────────────────────

interface AerialArcProps {
  from: [number, number]
  to: [number, number]
  color: string
  weight: number
  highlighted?: boolean
  routeLabel: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function AerialArc({ from, to, color, weight, highlighted, routeLabel }: AerialArcProps) {
  const map = useMap()

  useEffect(() => {
    const pts = arcPoints(from, to, 80)

    // Glow layer (thick, low opacity)
    const glow = L.polyline(pts, {
      color,
      weight: highlighted ? weight + 8 : weight + 4,
      opacity: highlighted ? 0.18 : 0.08,
      smoothFactor: 1,
    }).addTo(map)

    // Main animated dashed arc
    const arc = L.polyline(pts, {
      color,
      weight: highlighted ? weight + 2 : weight,
      dashArray: highlighted ? '10 8' : '7 12',
      lineCap: 'round',
      opacity: highlighted ? 0.92 : 0.48,
      smoothFactor: 1,
    }).addTo(map)

    // Animate dash offset
    const svgPath = (arc as unknown as { _path: SVGPathElement | null })._path
    let offset = 0
    const id = setInterval(() => {
      offset -= 1.2
      if (svgPath) svgPath.style.strokeDashoffset = String(offset)
    }, 40)

    // Aircraft icon moving along the arc
    let planeT = Math.random() // stagger start position per route
    const planeIcon = L.divIcon({ className: '', html: '', iconSize: [20, 20], iconAnchor: [10, 10] })
    const planeMarker = L.marker(pts[0], { icon: planeIcon, zIndexOffset: 500 }).addTo(map)

    const STEPS = pts.length - 1
    const planeTick = setInterval(() => {
      planeT = (planeT + 0.004) % 1
      const idx = Math.min(Math.floor(planeT * STEPS), STEPS - 1)
      const heading = arcHeading(from, to, planeT)
      const pos = pts[idx]
      planeMarker.setLatLng(pos)
      planeMarker.setIcon(L.divIcon({
        className: '',
        html: `<div style="
          width:20px;height:20px;
          display:flex;align-items:center;justify-content:center;
          transform:rotate(${heading}deg);
          filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${color}" opacity="${highlighted ? 1 : 0.75}">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
        </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }))
    }, 80)

    // Bind tooltip on arc hover
    arc.bindTooltip(
      `<div style="font-family:monospace;font-size:11px;padding:2px 4px;">${escapeHtml(routeLabel)}</div>`,
      { sticky: true, opacity: 0.92 }
    )

    return () => {
      clearInterval(id)
      clearInterval(planeTick)
      map.removeLayer(glow)
      map.removeLayer(arc)
      map.removeLayer(planeMarker)
    }
  }, [map, from, to, color, weight, highlighted, routeLabel])

  return null
}

// ─── Custom airport marker ────────────────────────────────────────────────────

interface AirportMarkerProps {
  lat: number
  lng: number
  iata: string
  name: string
  city: string
  tier: string
}

function AirportMarker({ lat, lng, iata, name, city, tier }: AirportMarkerProps) {
  const map = useMap()

  useEffect(() => {
    const size = tier === 'HIGH' ? 13 : tier === 'MEDIUM' ? 10 : 8
    const pulseSize = size + 8

    const icon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:${pulseSize}px;height:${pulseSize}px;display:flex;align-items:center;justify-content:center;">
          <div style="
            position:absolute;inset:0;border-radius:50%;
            background:rgba(37,99,235,0.12);pointer-events:none;
          "></div>
          <div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:white;
            border:${tier === 'HIGH' ? 2.5 : 1.5}px solid #2563eb;
            box-shadow:0 1px 6px rgba(37,99,235,0.3),0 0 0 1px rgba(37,99,235,0.15);
            position:relative;z-index:1;
          ">
            <div style="
              position:absolute;top:50%;left:50%;
              transform:translate(-50%,-50%);
              width:${Math.max(3,size*0.38)}px;height:${Math.max(3,size*0.38)}px;
              border-radius:50%;background:#2563eb;
            "></div>
          </div>
        </div>`,
      iconSize: [pulseSize, pulseSize],
      iconAnchor: [pulseSize / 2, pulseSize / 2],
      tooltipAnchor: [pulseSize / 2 + 2, 0],
    })

    const marker = L.marker([lat, lng], { icon })
      .bindTooltip(
        `<div style="font-family:monospace;font-size:11px;line-height:1.5;">
          <strong style="font-size:12px;">${escapeHtml(iata)}</strong> &nbsp;${escapeHtml(name)}<br/>
          <span style="color:#64748b;">${escapeHtml(city)}</span>
        </div>`,
        { sticky: false, opacity: 0.95 }
      )
      .addTo(map)

    return () => { map.removeLayer(marker) }
  }, [map, lat, lng, iata, name, city, tier])

  return null
}

// ─── GeoJSON India layer ──────────────────────────────────────────────────────

function IndiaGeoJSON() {
  const [geoData, setGeoData] = useState<object | null>(null)

  useEffect(() => {
    fetch('/maps/india-states-2019.geojson')
      .then((r) => { if (!r.ok) throw new Error('India boundaries unavailable'); return r.json() })
      .then((d: object) => setGeoData(d))
      .catch(() => { /* silently skip if unavailable */ })
  }, [])

  if (!geoData) return null

  return (
    <GeoJSON
      data={geoData as Parameters<typeof GeoJSON>[0]['data']}
      style={() => ({
        fillColor: '#eff6ff',
        fillOpacity: 0.55,
        color: '#bfdbfe',
        weight: 1,
      })}
    />
  )
}

// ─── Map Controls overlay ─────────────────────────────────────────────────────

interface MapControlsProps {
  filter: FilterMode
  onChange: (f: FilterMode) => void
}

function MapControls({ filter, onChange }: MapControlsProps) {
  const filters: FilterMode[] = ['ALL', 'RISING', 'FALLING', 'STABLE']

  const labelFor = (f: FilterMode) => {
    if (f === 'RISING') return '▲ Rising'
    if (f === 'FALLING') return '▼ Falling'
    if (f === 'STABLE') return '● Stable'
    return 'All Routes'
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 'var(--space-xl)',
        right: 'var(--space-xl)',
        zIndex: 1000,
        background: 'var(--color-surface-bg)',
        border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-floating)',
        padding: 'var(--space-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xs)',
        minWidth: 130,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-xs)',
          paddingBottom: 'var(--space-xs)',
          borderBottom: '1px solid var(--color-border-primary)',
          marginBottom: 'var(--space-xs)',
        }}
      >
        <Filter size={12} style={{ color: 'var(--color-text-tertiary)' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
          Filter Routes
        </span>
      </div>
      {filters.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          style={{
            padding: 'var(--space-xs) var(--space-md)',
            borderRadius: 'var(--radius-sm)',
            border: filter === f ? '1px solid var(--color-brand-primary)' : '1px solid transparent',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: filter === f ? 700 : 500,
            background: filter === f ? 'var(--color-brand-muted)' : 'var(--color-surface-secondary)',
            color: filter === f ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            textAlign: 'left',
            transition: 'background 0.18s, border-color 0.18s, color 0.18s',
            letterSpacing: '0.05em',
          }}
        >
          {labelFor(f)}
        </button>
      ))}
    </div>
  )
}

// ─── Live flights badge ───────────────────────────────────────────────────────

interface FlightsBadgeProps {
  count: number
  connectionStatus: 'live' | 'delayed' | 'offline'
}

function FlightsBadge({ count, connectionStatus }: FlightsBadgeProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'var(--space-2xl)',
        left: 'var(--space-xl)',
        zIndex: 1000,
        background: 'var(--color-surface-dark)',
        color: 'var(--color-text-on-dark)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-md) var(--space-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        boxShadow: 'var(--shadow-lg)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <Activity
        size={14}
        style={{
          color: connectionStatus === 'live' ? 'var(--color-success)' : 'var(--color-warning)',
        }}
      />
      <span style={{ fontSize: 'var(--text-caption-size)', fontWeight: 600 }}>
        {count} flight positions over India
      </span>
      <span
        style={{
          fontSize: 'var(--text-caption-size)',
          color:
            connectionStatus === 'live'
              ? 'var(--color-success)'
              : connectionStatus === 'delayed'
              ? 'var(--color-warning)'
              : 'var(--color-danger)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {connectionStatus === 'live' ? 'checked' : connectionStatus}
      </span>
    </div>
  )
}

// ─── Legend overlay ───────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: 'Rising', color: '#dc2626' },
    { label: 'Falling', color: '#16a34a' },
    { label: 'Stable', color: '#d97706' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'var(--space-2xl)',
        right: 'var(--space-xl)',
        zIndex: 1000,
        background: 'var(--color-surface-bg)',
        border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-md) var(--space-lg)',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xs)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-caption-size)',
          color: 'var(--color-text-tertiary)',
          marginBottom: 'var(--space-xs)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Route Trend
      </span>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div
            style={{
              width: 28,
              height: 3,
              background: item.color,
              borderRadius: 2,
              opacity: 0.85,
            }}
          />
          <span style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-secondary)' }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Route Sidebar ────────────────────────────────────────────────────────────

interface RouteSidebarProps {
  corridors: MapCorridor[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function RouteSidebar({ corridors, selectedId, onSelect }: RouteSidebarProps) {
  return (
    <div
      style={{
        width: 280,
        height: '100%',
        background: 'var(--color-surface-bg)',
        borderLeft: '1px solid var(--color-border-primary)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-xl)',
          borderBottom: '1px solid var(--color-border-primary)',
          position: 'sticky',
          top: 0,
          background: 'var(--color-surface-bg)',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xs)' }}>
          <Radio size={14} style={{ color: 'var(--color-brand-primary)' }} />
          <span
            style={{
              fontSize: 'var(--text-label-size)',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            Observed Route Fares
          </span>
        </div>
        <span style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
          {corridors.length} routes with stored quotes
        </span>
      </div>

      {/* Route list */}
      <div style={{ flex: 1 }}>
        {corridors.map((corridor) => {
          const isSelected = selectedId === corridor.id
          return (
            <button
              key={corridor.id}
              onClick={() => onSelect(corridor.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 'var(--space-lg) var(--space-xl)',
                border: 'none',
                borderBottom: '1px solid var(--color-border-primary)',
                borderLeft: isSelected ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                cursor: 'pointer',
                background: isSelected ? 'var(--color-brand-muted)' : 'transparent',
                transition: 'background 0.18s, border-left-color 0.18s',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {/* Route code + fare */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-xs)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-label-size)',
                    fontWeight: 600,
                    color: isSelected ? 'var(--color-brand-primary)' : 'var(--color-text-primary)',
                  }}
                >
                  {corridor.from} → {corridor.to}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-label-size)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  ₹{corridor.currentFare.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Trend + freshness */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {corridor.movementAvailable && corridor.trend !== 'unknown'
                  ? <TrendIndicator direction={corridor.trend} value={corridor.change7d} period="vs prior collection" size="sm" />
                  : <span style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>No comparable prior collection</span>}
              </div>
              <div style={{ marginTop: 5, fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
                Latest-day median · {corridor.observations} quotes · {corridor.samplePeriod}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AirfareMap() {
  const { token } = useAuth()
  const { connectionStatus } = useLiveData()
  const radar = useAviationRadar(true)
  const apiStatus: 'loading' | 'REAL' | 'UNAVAILABLE' = radar.status === 'connected'
    ? 'REAL'
    : radar.status === 'loading'
      ? 'loading'
      : 'UNAVAILABLE'

  // Use the backend's live ADS-B contract directly. This avoids requiring an
  // optional AviationStack schedules key just to place real aircraft markers.
  const liveFlights = radar.aircraft.map(flight => ({
    icao24: flight.icao24 || flight.callsign,
    lat: flight.latitude,
    lng: flight.longitude,
    callsign: flight.callsign || flight.registration || flight.icao24,
    altitude: Math.max(0, Number(flight.altitude_ft ?? 0) * 0.3048),
  }))
  const realFlightCount = liveFlights.length

  const [corridors, setCorridors] = useState<MapCorridor[]>([])
  const [routesLoading, setRoutesLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  // Build map corridors only from backend route summaries. The former static
  // Kaggle corridor list made old fares look current and was removed.
  useEffect(() => {
    let active = true
    if (!token) {
      setCorridors([])
      setRouteError('Sign in to load verified route observations.')
      return () => { active = false }
    }

    setRoutesLoading(true)
    setRouteError(null)
    Promise.all([apiRouteBasket(token), apiFareMovement(token).catch(() => null)])
      .then(async ([basket, movement]) => {
        const results = await Promise.all(basket.routes.filter(item => item.has_data).map(async (item): Promise<MapCorridor | null> => {
          const [from, to] = item.route.split('-')
          const fromAirport = AIRPORTS[from]
          const toAirport = AIRPORTS[to]
          if (!fromAirport || !toAirport) return null
          const summary = await apiFareSummary(item.route, token) as {
            overall?: { median: number | null; min: number | null; max: number | null; count: number; sample_period: string | null; last_collected_at: string | null }
          }
          const fare = summary.overall
          if (!fare || fare.median == null || fare.min == null || fare.max == null || !fare.sample_period) return null
          const compared = movement?.routes.find(row => row.route === item.route)
          const trend = compared
            ? compared.status.includes('INCREASE') ? 'up' : compared.status.includes('DECREASE') ? 'down' : 'stable'
            : 'unknown'
          return {
            id: item.route,
            from,
            to,
            fromLat: fromAirport.lat,
            fromLng: fromAirport.lng,
            toLat: toAirport.lat,
            toLng: toAirport.lng,
            currentFare: fare.median,
            minFare: fare.min,
            maxFare: fare.max,
            change7d: compared?.change_pct ?? 0,
            trend,
            weight: 1,
            observations: fare.count,
            samplePeriod: fare.sample_period,
            observedAt: fare.last_collected_at,
            movementAvailable: Boolean(compared),
          } satisfies MapCorridor
        }))
        if (active) setCorridors(results.filter((corridor): corridor is MapCorridor => corridor != null))
      })
      .catch(() => { if (active) { setCorridors([]); setRouteError('Verified route summaries are unavailable.') } })
      .finally(() => { if (active) setRoutesLoading(false) })

    return () => { active = false }
  }, [token])

  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filter corridors based on selected mode
  const filteredCorridors = corridors.filter((c) => {
    if (filter === 'RISING') return c.trend === 'up'
    if (filter === 'FALLING') return c.trend === 'down'
    if (filter === 'STABLE') return c.movementAvailable && c.trend === 'stable'
    return true
  })

  const handleRouteSelect = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }

  return (
    <div
      style={{
        /* Bust out of AppShell's <main> padding (var(--space-2xl) = 24px on each side) */
        margin: 'calc(-1 * var(--space-2xl))',
        /* header = 48px, progress bar ≈ 6px, so ~54px total chrome above main */
        height: 'calc(100vh - 54px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* ── Premium header bar ── */}
      <div style={{
        background: 'var(--color-surface-dark)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 var(--space-2xl)',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-xl)',
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle grid background */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        {/* Left: title + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', position: 'relative', zIndex: 1 }}>
          <Activity size={15} style={{ color: 'var(--color-brand-primary)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-text-on-dark)',
            letterSpacing: '0.09em',
          }}>
            AIRFARE ROUTE MAP · INDIA
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)', letterSpacing: '0.07em', fontSize: 9, fontWeight: 700,
            color: apiStatus === 'REAL' ? 'var(--color-success)' : 'var(--color-warning)',
            background: apiStatus === 'REAL' ? 'rgba(22,163,74,0.15)' : 'rgba(217,119,6,0.15)',
            border: `1px solid ${apiStatus === 'REAL' ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}`,
            padding: '2px 8px', borderRadius: 4,
          }}>
            {apiStatus === 'REAL' ? 'AIRSPACE DATA CHECKED' : 'AIRSPACE DATA DEGRADED'}
          </span>
        </div>
        {/* Right: source status pill + flight count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-xs)',
            background: routesLoading ? 'rgba(217,119,6,0.15)' : corridors.length ? 'rgba(22,163,74,0.15)' : 'rgba(217,119,6,0.15)',
            border: `1px solid ${routesLoading || !corridors.length ? 'rgba(217,119,6,0.35)' : 'rgba(22,163,74,0.35)'}`,
            borderRadius: 'var(--radius-full)',
            padding: '3px 10px',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: routesLoading || !corridors.length ? 'var(--color-warning)' : 'var(--color-success)',
              boxShadow: `0 0 6px ${routesLoading || !corridors.length ? 'var(--color-warning)' : 'var(--color-success)'}`,
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--color-success)', letterSpacing: '0.08em' }}>
              {routesLoading ? 'LOADING' : corridors.length ? 'BACKEND DATA' : 'NO ROUTE DATA'}
            </span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>
            {apiStatus === 'REAL'
              ? `${realFlightCount} provider rows (AviationStack)`
              : apiStatus === 'loading'
              ? 'Connecting to AviationStack…'
              : liveFlights.length > 0
              ? `${liveFlights.length} tracked flight positions`
              : 'No live aircraft positions'}
          </span>
        </div>
      </div>

      {/* ── Map + sidebar row ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Map area ── */}
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        {(routesLoading || routeError || !corridors.length) && (
          <div style={{ position: 'absolute', zIndex: 500, top: 18, left: 18, maxWidth: 340, padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.94)', border: '1px solid var(--color-border-primary)', boxShadow: '0 4px 16px rgba(15,44,90,.12)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
            {routesLoading ? 'Loading verified route summaries…' : routeError ?? 'No verified route observations are available for the map.'}
          </div>
        )}
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          minZoom={4}
          maxZoom={10}
          style={{ flex: 1, height: '100%', width: '100%' }}
          zoomControl={true}
        >
          {/* Basemap — OpenStreetMap public tiles; no API key required or exposed. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            tileSize={256}
            maxZoom={19}
          />

          {/* India state boundaries */}
          <IndiaGeoJSON />

          {/* Aerial arc routes with animated aircraft */}
          {filteredCorridors.map((corridor) => (
            <AerialArc
              key={corridor.id}
              from={[corridor.fromLat, corridor.fromLng]}
              to={[corridor.toLat, corridor.toLng]}
              color={TREND_COLORS[corridor.trend]}
              weight={Math.max(1.5, corridor.weight * 2.2)}
              highlighted={selectedId === corridor.id}
              routeLabel={`${corridor.from} → ${corridor.to}  latest-day median ₹${corridor.currentFare.toLocaleString('en-IN')} · ${corridor.observations} quotes · ${corridor.samplePeriod}`}
            />
          ))}

          {/* Airport markers — custom precision dots */}
          {Object.values(AIRPORTS).map((airport) => (
            <AirportMarker
              key={airport.iata}
              lat={airport.lat}
              lng={airport.lng}
              iata={airport.iata}
              name={airport.name}
              city={airport.city}
              tier={airport.tier}
            />
          ))}

          {/* Live flight markers */}
          {liveFlights.map((flight) => (
            <CircleMarker
              key={flight.icao24}
              center={[flight.lat, flight.lng]}
              radius={3}
              pathOptions={{
                color: '#64748b',
                fillColor: '#94a3b8',
                fillOpacity: 0.7,
                weight: 1,
              }}
            >
              <Tooltip sticky={false} opacity={0.9}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {flight.callsign}
                  {flight.altitude > 0 && (
                    <span style={{ color: '#64748b' }}> · {Math.round(flight.altitude)}m</span>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* Overlays (rendered outside MapContainer but inside relative wrapper) */}
        <MapControls filter={filter} onChange={setFilter} />
        <FlightsBadge count={apiStatus === 'REAL' ? realFlightCount : liveFlights.length} connectionStatus={apiStatus === 'REAL' ? 'live' : connectionStatus} />
        <Legend />
      </div>

      {/* ── Route sidebar ── */}
      <RouteSidebar
        corridors={filteredCorridors}
        selectedId={selectedId}
        onSelect={handleRouteSelect}
      />
      </div>{/* end map+sidebar row */}
    </div>
  )
}
