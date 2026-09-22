import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Clock3, Gauge, Navigation, Plane, Radio, RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchAllCorridorFlights, type LiveFlight } from '../services/flightData'

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

function statusColor(status: string) {
  if (status === 'active') return '#16a34a'
  if (status === 'landed') return '#0284c7'
  if (status === 'scheduled') return '#d97706'
  return '#64748b'
}

export default function AviationLive() {
  const [flights, setFlights] = useState<LiveFlight[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    setLoading(true)
    try {
      const results = await fetchAllCorridorFlights()
      setFlights(results.flatMap((result) => result.flights))
    } catch {
      setFlights([])
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

  const visibleFlights = flights.slice(0, 12)
  const featuredFlights = flights.slice(0, 5)
  const avgAltitude = Math.round(
    flights.reduce((sum, flight) => sum + (flight.altitude_ft || 0), 0) / Math.max(1, flights.filter((flight) => flight.altitude_ft).length),
  )
  const avgSpeed = Math.round(
    flights.reduce((sum, flight) => sum + (flight.ground_speed_kts || 0), 0) / Math.max(1, flights.filter((flight) => flight.ground_speed_kts).length),
  )
  const busiestRoutes = useMemo(() => {
    const routeCounts = new Map<string, number>()
    flights.forEach((flight) => {
      const route = `${flight.dep_iata || '---'} → ${flight.arr_iata || '---'}`
      routeCounts.set(route, (routeCounts.get(route) || 0) + 1)
    })
    return [...routeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [flights])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: 'var(--font-sans)', maxWidth: 1280 }}>
      <section
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
          padding: '18px 22px',
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-sm)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Activity size={15} style={{ color: 'var(--color-brand-primary)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-brand-primary)', letterSpacing: '0.09em' }}>AIRSPACE MONITOR</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 850, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Air Traffic Control
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.45 }}>
            Operational aviation telemetry console with aircraft feed, corridor activity, provider health, and ATC-style monitoring.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ap-button ap-button-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 36 }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(320px, 420px)', gap: 18, alignItems: 'stretch' }}>
        <section style={{ background: 'linear-gradient(145deg, #f8fbff, #eef6ff)', border: '1px solid var(--color-border-primary)', borderRadius: 18, boxShadow: 'var(--shadow-sm)', padding: 18, minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['Active', stats.active, '#16a34a'],
              ['Scheduled', stats.scheduled, '#d97706'],
              ['Landed', stats.landed, '#0284c7'],
            ].map(([label, value, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 999, background: '#fff', border: '1px solid var(--color-border-primary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color as string }} />
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 750 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 900, fontFamily: 'var(--font-mono)' }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, borderRadius: 18, background: 'linear-gradient(145deg, #071426, #0f2746 62%, #082038)', border: '1px solid rgba(14,165,233,0.25)', overflow: 'hidden', padding: 20, display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 16, color: '#e0f2fe', boxShadow: 'inset 0 0 40px rgba(14,165,233,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Radio size={15} style={{ color: '#38bdf8' }} />
                  <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', color: '#7dd3fc' }}>ATC OPERATIONS BOARD</span>
                </div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 950, color: '#f8fafc', letterSpacing: '-0.03em' }}>Air Traffic Control View</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 999, background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.28)', color: '#86efac', fontSize: 12, fontWeight: 850 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 12px #22c55e' }} />
                Provider feed connected
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(220px, 0.8fr)', gap: 14, minHeight: 250 }}>
              <div style={{ position: 'relative', minHeight: 250, borderRadius: 18, border: '1px solid rgba(125,211,252,0.18)', background: 'radial-gradient(circle at 50% 50%, rgba(37,99,235,0.35), rgba(2,6,23,0.05) 38%, rgba(2,6,23,0.28) 100%)', overflow: 'hidden' }}>
                {[72, 132, 196].map((size) => (
                  <div key={size} style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', border: '1px dashed rgba(125,211,252,0.28)', top: `calc(50% - ${size / 2}px)`, left: `calc(50% - ${size / 2}px)` }} />
                ))}
                <div style={{ position: 'absolute', inset: '50% 18px auto', borderTop: '1px solid rgba(125,211,252,0.18)' }} />
                <div style={{ position: 'absolute', inset: '18px auto 18px 50%', borderLeft: '1px solid rgba(125,211,252,0.18)' }} />
                {featuredFlights.length === 0 ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#bfdbfe', fontSize: 13, textAlign: 'center', padding: 20 }}>
                    Waiting for aircraft rows from the provider feed.
                  </div>
                ) : featuredFlights.map((flight, index) => {
                  const spots = [
                    { top: '22%', left: '28%' },
                    { top: '37%', left: '58%' },
                    { top: '55%', left: '38%' },
                    { top: '64%', left: '70%' },
                    { top: '78%', left: '22%' },
                  ]
                  return (
                    <div key={`${flight.flight_iata}-radar-${index}`} style={{ position: 'absolute', ...spots[index], transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(134,239,172,0.42)', color: '#86efac', boxShadow: '0 0 24px rgba(34,197,94,0.25)' }}>
                        <Navigation size={16} />
                      </div>
                      <div style={{ padding: '7px 9px', borderRadius: 10, background: 'rgba(2,6,23,0.72)', border: '1px solid rgba(125,211,252,0.24)', backdropFilter: 'blur(8px)' }}>
                        <div style={{ fontSize: 12, fontWeight: 950, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>{flight.flight_iata || 'FLT'}</div>
                        <div style={{ fontSize: 10, color: '#93c5fd', fontFamily: 'var(--font-mono)' }}>{flight.dep_iata || '---'} → {flight.arr_iata || '---'}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  { icon: <Plane size={16} />, label: 'Aircraft Rows', value: flights.length.toLocaleString('en-IN') },
                  { icon: <Gauge size={16} />, label: 'Avg Speed', value: avgSpeed ? `${avgSpeed} kts` : '—' },
                  { icon: <Activity size={16} />, label: 'Avg Altitude', value: avgAltitude ? `${avgAltitude.toLocaleString('en-IN')} ft` : '—' },
                  { icon: <Clock3 size={16} />, label: 'Last Checked', value: fmtTime(lastFetch) },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(125,211,252,0.14)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(14,165,233,0.16)', color: '#7dd3fc' }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 850, letterSpacing: '0.08em' }}>{item.label}</div>
                      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 950, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(125,211,252,0.14)' }}>
                <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 850, marginBottom: 8 }}>Busiest corridors</div>
                {(busiestRoutes.length ? busiestRoutes : [['DEL → BOM', 0], ['BLR → DEL', 0], ['HYD → CCU', 0]]).map(([route, count]) => (
                  <div key={route} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12, color: '#e0f2fe', fontFamily: 'var(--font-mono)' }}>
                    <span>{route}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
              <div style={{ padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(125,211,252,0.14)' }}>
                <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 850, marginBottom: 8 }}>Operational note</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#dbeafe' }}>
                  The unreliable basemap has been replaced by a stable ATC board so users see useful telemetry without broken map keys or distorted India outlines.
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 18, boxShadow: 'var(--shadow-sm)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 560 }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 850, color: 'var(--color-text-primary)' }}>Aircraft Feed</div>
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>{flights.length} provider rows returned</div>
            </div>
            <ShieldCheck size={18} style={{ color: flights.length ? 'var(--color-success)' : 'var(--color-warning)' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {visibleFlights.length === 0 ? (
              <div style={{ padding: 22, color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
                No aircraft rows are available right now. The page retries every 30 seconds.
              </div>
            ) : visibleFlights.map((flight, index) => (
              <div key={`${flight.flight_iata}-${index}`} style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-primary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: `${statusColor(flight.status)}16`, color: statusColor(flight.status) }}>
                      <Plane size={15} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{flight.flight_iata || 'UNKNOWN'}</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--color-text-secondary)' }}>{flight.airline_name || flight.airline_iata || 'Unknown airline'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 850, color: statusColor(flight.status), background: `${statusColor(flight.status)}18`, border: `1px solid ${statusColor(flight.status)}33`, borderRadius: 999, padding: '3px 8px' }}>
                    {flight.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--color-text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <span>{flight.dep_iata || '---'} → {flight.arr_iata || '---'}</span>
                  {flight.altitude_ft != null && <span>{Math.round(flight.altitude_ft).toLocaleString()} ft</span>}
                  {flight.ground_speed_kts != null && <span>{Math.round(flight.ground_speed_kts)} kts</span>}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
