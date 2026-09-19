import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Activity, Radio, Filter } from 'lucide-react'

import type { Corridor } from '../data/sampleData'
import { AIRPORTS } from '../data/airports'
import { useLiveData } from '../hooks/useLiveData'
import TrendIndicator from '../components/TrendIndicator'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = 'ALL' | 'RISING' | 'FALLING' | 'STABLE'

// ─── Colour helpers (raw hex needed by Leaflet) ───────────────────────────────

const TREND_COLORS: Record<Corridor['trend'], string> = {
  up: '#dc2626',      // var(--color-danger)
  down: '#16a34a',    // var(--color-success)
  stable: '#d97706',  // var(--color-warning)
}

const TIER_RADIUS: Record<string, number> = {
  HIGH: 10,
  MEDIUM: 7,
  LOW: 5,
}

// ─── AnimatedPolyline ─────────────────────────────────────────────────────────

interface AnimatedPolylineProps {
  from: [number, number]
  to: [number, number]
  color: string
  weight: number
  highlighted?: boolean
}

function AnimatedPolyline({ from, to, color, weight, highlighted }: AnimatedPolylineProps) {
  const map = useMap()

  useEffect(() => {
    const line = L.polyline([from, to], {
      color,
      weight: highlighted ? weight + 2 : weight,
      dashArray: '12 8',
      opacity: highlighted ? 1 : 0.75,
    }).addTo(map)

    const path = (line as unknown as { _path: SVGPathElement | null })._path
    let offset = 0

    const frame = () => {
      offset -= 1
      if (path) path.style.strokeDashoffset = String(offset)
    }
    const id = setInterval(frame, 40)

    return () => {
      clearInterval(id)
      map.removeLayer(line)
    }
  }, [map, from, to, color, weight, highlighted])

  return null
}

// ─── GeoJSON India layer ──────────────────────────────────────────────────────

function IndiaGeoJSON() {
  const [geoData, setGeoData] = useState<object | null>(null)

  useEffect(() => {
    fetch('https://cdn.jsdelivr.net/gh/geohacker/india/state/india_state.geojson')
      .then((r) => r.json())
      .then((d: object) => setGeoData(d))
      .catch(() => { /* silently skip if unavailable */ })
  }, [])

  if (!geoData) return null

  return (
    <GeoJSON
      data={geoData as Parameters<typeof GeoJSON>[0]['data']}
      style={() => ({
        fillColor: '#f1f5f9',
        fillOpacity: 0.6,
        color: '#cbd5e1',
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
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-caption-size)',
            fontWeight: filter === f ? 600 : 400,
            background: filter === f ? 'var(--color-brand-muted)' : 'transparent',
            color: filter === f ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            textAlign: 'left',
            transition: 'background 0.15s',
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
        {count} flights over India
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
        {connectionStatus}
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
  corridors: Corridor[]
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
            Route Index
          </span>
        </div>
        <span style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
          {corridors.length} corridors shown
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
                cursor: 'pointer',
                background: isSelected ? 'var(--color-brand-muted)' : 'transparent',
                transition: 'background 0.15s',
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
                <TrendIndicator direction={corridor.trend} value={corridor.change7d} period="7d" size="sm" />
                <span style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
                  {corridor.freshness} min ago
                </span>
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
  const { corridors, liveFlights, connectionStatus } = useLiveData()
  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filter corridors based on selected mode
  const filteredCorridors = corridors.filter((c) => {
    if (filter === 'RISING') return c.trend === 'up'
    if (filter === 'FALLING') return c.trend === 'down'
    if (filter === 'STABLE') return c.trend === 'stable'
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
        gap: 0,
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* ── Map area ── */}
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          minZoom={4}
          maxZoom={10}
          style={{ flex: 1, height: '100%', width: '100%' }}
          zoomControl={true}
        >
          {/* Basemap — CartoDB Positron */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          {/* India state boundaries */}
          <IndiaGeoJSON />

          {/* Animated route polylines */}
          {filteredCorridors.map((corridor) => (
            <AnimatedPolyline
              key={corridor.id}
              from={[corridor.fromLat, corridor.fromLng]}
              to={[corridor.toLat, corridor.toLng]}
              color={TREND_COLORS[corridor.trend]}
              weight={Math.max(1.5, corridor.weight * 4)}
              highlighted={selectedId === corridor.id}
            />
          ))}

          {/* Airport markers */}
          {Object.values(AIRPORTS).map((airport) => (
            <CircleMarker
              key={airport.iata}
              center={[airport.lat, airport.lng]}
              radius={TIER_RADIUS[airport.tier] ?? 5}
              pathOptions={{
                color: '#2563eb',      // var(--color-brand-primary)
                fillColor: '#2563eb',
                fillOpacity: 0.85,
                weight: 1.5,
              }}
            >
              <Tooltip sticky={false} opacity={0.95}>
                <div style={{ fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>{airport.iata}</strong>{' '}
                  {airport.name}
                  <br />
                  <span style={{ color: '#64748b', fontSize: 12 }}>{airport.city}</span>
                </div>
              </Tooltip>
            </CircleMarker>
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
        <FlightsBadge count={liveFlights.length} connectionStatus={connectionStatus} />
        <Legend />
      </div>

      {/* ── Route sidebar ── */}
      <RouteSidebar
        corridors={filteredCorridors}
        selectedId={selectedId}
        onSelect={handleRouteSelect}
      />
    </div>
  )
}
