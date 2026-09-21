import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchAllCorridorFlights, type LiveFlight } from '../services/flightData'

const proj = (lat: number, lng: number) => ({
  x: ((lng - 67.5) / 30) * 280,
  y: ((37.5 - lat) / 30) * 310,
})

const INDIA_BORDER =
  'M130,22 C132,18 138,12 144,14 C150,16 156,22 158,28 C160,34 168,36 172,42 C176,48 174,56 170,62 C168,68 166,74 168,80 C170,86 178,92 184,94 C190,96 198,94 204,98 C210,102 212,110 216,116 C220,122 226,124 232,126 C238,128 244,134 250,138 C254,142 258,148 260,154 C262,160 258,166 254,170 C248,174 242,176 238,182 C234,188 232,196 230,202 C228,208 224,214 220,218 C216,222 210,224 206,228 C202,232 198,238 194,244 C190,250 186,256 182,262 C178,268 172,274 168,280 C164,286 160,294 156,300 C152,306 148,312 144,316 C142,320 140,324 138,328 C136,324 134,318 132,312 C128,306 124,300 120,294 C116,288 112,282 108,276 C104,270 98,264 94,258 C90,252 86,246 84,240 C82,234 80,226 78,220 C76,214 72,208 68,202 C64,196 58,192 54,186 C50,180 46,172 44,166 C42,160 44,154 48,148 C52,142 58,138 64,134 C70,130 76,126 80,120 C84,114 88,108 92,102 C96,96 100,90 104,84 C108,78 112,70 116,64 C120,58 122,50 124,42 C126,34 128,26 130,22 Z'

const AIRPORTS = {
  DEL: { name: 'Delhi', lat: 28.7, lng: 77.1, major: true },
  BOM: { name: 'Mumbai', lat: 19.1, lng: 72.9, major: true },
  BLR: { name: 'Bengaluru', lat: 12.9, lng: 77.6, major: true },
  MAA: { name: 'Chennai', lat: 13.1, lng: 80.3, major: true },
  HYD: { name: 'Hyderabad', lat: 17.4, lng: 78.5, major: true },
  CCU: { name: 'Kolkata', lat: 22.6, lng: 88.4, major: true },
  AMD: { name: 'Ahmedabad', lat: 23.1, lng: 72.6, major: false },
  GOI: { name: 'Goa', lat: 15.4, lng: 73.8, major: false },
  GAU: { name: 'Guwahati', lat: 26.1, lng: 91.6, major: false },
  SXR: { name: 'Srinagar', lat: 34.0, lng: 74.8, major: false },
}

const AIRPORT_POINTS = Object.entries(AIRPORTS).map(([code, airport]) => ({
  code,
  ...airport,
  ...proj(airport.lat, airport.lng),
}))

const CORRIDORS = [
  ['DEL', 'BOM'],
  ['DEL', 'BLR'],
  ['DEL', 'CCU'],
  ['BOM', 'MAA'],
  ['BLR', 'HYD'],
  ['DEL', 'HYD'],
  ['DEL', 'GAU'],
  ['BOM', 'GOI'],
  ['DEL', 'SXR'],
] as const

function statusColor(status: string) {
  if (status === 'active') return '#16a34a'
  if (status === 'landed') return '#0284c7'
  if (status === 'scheduled') return '#d97706'
  return '#64748b'
}

function fmtTime(value: Date | null) {
  return value
    ? `${value.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Kolkata',
      })} IST`
    : 'not checked yet'
}

export default function AviationLive() {
  const [flights, setFlights] = useState<LiveFlight[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [selectedFlight, setSelectedFlight] = useState<LiveFlight | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    setLoading(true)
    try {
      const results = await fetchAllCorridorFlights()
      const all = results.flatMap((result) => result.flights)
      setFlights(all)
      setSelectedFlight((prev) => prev ?? all[0] ?? null)
    } catch {
      setFlights([])
      setSelectedFlight(null)
    } finally {
      setLoading(false)
      setLastFetch(new Date())
    }
  }

  useEffect(() => {
    void load()
    intervalRef.current = setInterval(load, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const stats = useMemo(
    () => ({
      active: flights.filter((flight) => flight.status === 'active').length,
      scheduled: flights.filter((flight) => flight.status === 'scheduled').length,
      landed: flights.filter((flight) => flight.status === 'landed').length,
    }),
    [flights],
  )

  const plottedFlights = flights.filter((flight) => flight.latitude != null && flight.longitude != null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minHeight: 'calc(100vh - 120px)', fontFamily: 'var(--font-sans)' }}>
      <section
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'flex-start',
          padding: '20px 24px',
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Activity size={16} style={{ color: 'var(--color-brand-primary)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-brand-primary)', letterSpacing: '0.09em' }}>ADS-B AIRSPACE MONITOR</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            India Airspace Monitor
          </h1>
          <p style={{ margin: '6px 0 0', maxWidth: 760, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
            Aircraft positions are displayed when the configured ADS-B provider returns telemetry. This is a situational view, not a complete ATC radar feed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 11px',
              borderRadius: 999,
              background: plottedFlights.length ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)',
              border: `1px solid ${plottedFlights.length ? 'rgba(22,163,74,0.28)' : 'rgba(217,119,6,0.28)'}`,
              color: plottedFlights.length ? 'var(--color-success)' : 'var(--color-warning)',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            <ShieldCheck size={13} />
            {plottedFlights.length ? `${plottedFlights.length} aircraft plotted` : 'telemetry unavailable'}
          </span>
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 13px',
              borderRadius: 9,
              border: '1px solid var(--color-border-primary)',
              background: 'var(--color-surface-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 18, flex: 1, minHeight: 620 }}>
        <section
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid var(--color-border-primary)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              ['Active', stats.active, '#16a34a'],
              ['Scheduled', stats.scheduled, '#d97706'],
              ['Landed', stats.landed, '#0284c7'],
            ].map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  padding: '7px 10px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.92)',
                  border: '1px solid var(--color-border-primary)',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  gap: 7,
                  alignItems: 'center',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color as string }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 900, fontFamily: 'var(--font-mono)' }}>{value}</span>
              </div>
            ))}
          </div>

          <svg viewBox="-12 0 304 322" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <filter id="soft-shadow">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
              </filter>
              <linearGradient id="india-fill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#e0f2fe" />
                <stop offset="100%" stopColor="#dbeafe" />
              </linearGradient>
            </defs>
            <rect x="-12" y="0" width="304" height="322" fill="#f8fafc" />
            <path d="M0 162 H280 M140 20 V300" stroke="#dbeafe" strokeWidth="0.8" strokeDasharray="3 5" />
            {[44, 82, 120].map((radius) => (
              <circle key={radius} cx="140" cy="160" r={radius} fill="none" stroke="#dbeafe" strokeWidth="1" strokeDasharray="4 6" />
            ))}
            <path d={INDIA_BORDER} fill="url(#india-fill)" stroke="#2563eb" strokeWidth="1.6" filter="url(#soft-shadow)" />

            {CORRIDORS.map(([dep, arr]) => {
              const a = AIRPORT_POINTS.find((point) => point.code === dep)
              const b = AIRPORT_POINTS.find((point) => point.code === arr)
              if (!a || !b) return null
              const mx = (a.x + b.x) / 2
              const my = (a.y + b.y) / 2 - 18
              return <path key={`${dep}-${arr}`} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none" stroke="#93c5fd" strokeWidth="1" strokeDasharray="4 4" />
            })}

            {AIRPORT_POINTS.map((airport) => (
              <g key={airport.code}>
                <circle cx={airport.x} cy={airport.y} r={airport.major ? 6.5 : 4.5} fill="#fff" stroke="#2563eb" strokeWidth="1.8" />
                <circle cx={airport.x} cy={airport.y} r="2" fill="#2563eb" />
                <text x={airport.x} y={airport.y + (airport.major ? 16 : 13)} textAnchor="middle" fontSize={airport.major ? 7.5 : 6} fontWeight="800" fill="#1e293b">
                  {airport.code}
                </text>
              </g>
            ))}

            {plottedFlights.map((flight, index) => {
              const point = proj(flight.latitude!, flight.longitude!)
              const selected = selectedFlight?.flight_iata === flight.flight_iata
              const showLabel = selected || index < 8
              return (
                <g key={`${flight.flight_iata}-${index}`} onClick={() => setSelectedFlight(flight)} style={{ cursor: 'pointer' }}>
                  <circle cx={point.x} cy={point.y} r={selected ? 8 : 5} fill={`${statusColor(flight.status)}22`} stroke={statusColor(flight.status)} strokeWidth={selected ? 2 : 1.2} />
                  <g transform={`translate(${point.x} ${point.y}) rotate(${flight.track_deg ?? 0})`}>
                    <path d="M0 -5 L3 4 L0 2.6 L-3 4 Z" fill={statusColor(flight.status)} />
                  </g>
                  {showLabel && (
                    <g>
                      <rect x={point.x + 6} y={point.y - 9} width="36" height="16" rx="4" fill="#0f172a" opacity="0.9" />
                      <text x={point.x + 10} y={point.y - 2} fontSize="5.2" fontWeight="800" fill="#e2e8f0" fontFamily="monospace">
                        {flight.flight_iata || 'FLT'}
                      </text>
                      <text x={point.x + 10} y={point.y + 4} fontSize="4.2" fill="#bae6fd" fontFamily="monospace">
                        {flight.altitude_ft ? `${Math.round(flight.altitude_ft / 1000)}k ft` : 'pos'}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 14,
              right: 14,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.93)',
              border: '1px solid var(--color-border-primary)',
              boxShadow: 'var(--shadow-sm)',
              fontSize: 11,
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>Source: configured ADS-B/aviation provider. Coverage may be incomplete.</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>Last checked: {fmtTime(lastFetch)}</span>
          </div>
        </section>

        <aside
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 16,
            background: 'var(--color-surface-bg)',
            border: '1px solid var(--color-border-primary)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)' }}>Aircraft Stream</div>
            <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>{flights.length} rows returned by current provider</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {flights.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                No aircraft telemetry is available right now. The page will retry automatically every 30 seconds.
              </div>
            ) : (
              flights.map((flight, index) => {
                const selected = selectedFlight?.flight_iata === flight.flight_iata
                return (
                  <button
                    key={`${flight.flight_iata}-${index}`}
                    onClick={() => setSelectedFlight(flight)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      border: 'none',
                      borderBottom: '1px solid var(--color-border-primary)',
                      borderLeft: selected ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                      background: selected ? 'rgba(37,99,235,0.08)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{flight.flight_iata || 'UNKNOWN'}</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          color: statusColor(flight.status),
                          background: `${statusColor(flight.status)}18`,
                          border: `1px solid ${statusColor(flight.status)}33`,
                          borderRadius: 999,
                          padding: '2px 7px',
                        }}
                      >
                        {flight.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {flight.airline_name || flight.airline_iata || 'Unknown airline'} · {flight.registration || 'registration unavailable'}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      <span>
                        {flight.dep_iata || '---'} -&gt; {flight.arr_iata || '---'}
                      </span>
                      {flight.altitude_ft != null && <span>{Math.round(flight.altitude_ft).toLocaleString()} ft</span>}
                      {flight.ground_speed_kts != null && <span>{Math.round(flight.ground_speed_kts)} kts</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
