import { useCallback, useEffect, useState } from 'react'
import { Activity, Plane, RefreshCw, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiAirlineFares, apiHealth } from '../services/api'
import type { AirlineFareSummary, AirlineFaresResponse, HealthResponse } from '../services/api'

const currency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const count = (value: number) => value.toLocaleString('en-IN')
const observedAt = (value: string | null) => value
  ? new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
    .toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
  : 'Not recorded'

const panel: React.CSSProperties = {
  background: 'var(--color-surface-bg)',
  border: '1px solid var(--color-border-primary)',
  borderRadius: 14,
}

export default function AirlineExplorer() {
  const { token } = useAuth()
  const [data, setData] = useState<AirlineFaresResponse | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [selected, setSelected] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [fares, currentHealth] = await Promise.all([
        apiAirlineFares(token ?? undefined),
        apiHealth(),
      ])
      setData(fares)
      setHealth(currentHealth)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Airline observations could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const airlines = data?.airlines ?? []
  const airline: AirlineFareSummary | undefined = airlines.find(item => item.name === selected) ?? airlines[0]
  const filtered = airlines.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()))
  const latest = airlines.reduce<string | null>((current, item) => {
    if (!item.latest_collected_at) return current
    return !current || item.latest_collected_at > current ? item.latest_collected_at : current
  }, null)

  return (
    <div style={{ overflowY: 'auto', height: '100%', padding: '24px 28px', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'start', marginBottom: 20 }}>
        <div>
          <div style={{ color: 'var(--color-brand-primary)', fontSize: 11, letterSpacing: '.1em', fontWeight: 800, marginBottom: 6 }}>AIRFARE INTELLIGENCE</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, margin: '0 0 6px' }}><Plane size={25} /> Airline Explorer</h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Actual stored economy fare quotes, grouped by airline. Quote counts are not passenger market share or scheduled flight frequency.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 9, cursor: 'pointer', ...panel, color: 'var(--color-brand-primary)' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>

      {error && (
        <div role="alert" style={{ ...panel, padding: 16, color: 'var(--color-danger, #b91c1c)', marginBottom: 16 }}>
          Could not load airline fares: {error}
        </div>
      )}
      {loading && !data && <div style={{ ...panel, padding: 24 }}>Loading stored fare observations…</div>}
      {!loading && !error && airlines.length === 0 && (
        <div style={{ ...panel, padding: 28 }}>No valid real or official INR economy fare observations are stored yet.</div>
      )}

      {airline && (
        <>
          <section style={{ ...panel, padding: '15px 18px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <Activity size={18} style={{ color: health?.data_status === 'LIVE' ? 'var(--color-success)' : 'var(--color-warning)' }} />
            <div style={{ flex: 1, minWidth: 260 }}>
              <strong style={{ fontSize: 13 }}>{health?.data_status === 'LIVE' ? 'Provider recently healthy' : 'Stored observations — provider not currently healthy'}</strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                {count(data?.total_observations ?? 0)} valid fare quotes across {airlines.length} airlines.
                {' '}Latest quote collected: {observedAt(latest)} IST. Prices may have changed since collection.
              </div>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <aside style={{ ...panel, overflow: 'hidden' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderBottom: '1px solid var(--color-border-primary)' }}>
                <Search size={15} style={{ color: 'var(--color-text-secondary)' }} />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search airlines"
                  style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'var(--color-text-primary)' }} />
              </label>
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {filtered.map(item => (
                  <button key={item.name} onClick={() => setSelected(item.name)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 15px', cursor: 'pointer',
                      border: 0, borderBottom: '1px solid var(--color-border-primary)',
                      borderLeft: item.name === airline.name ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                      background: item.name === airline.name ? 'var(--color-surface-secondary)' : 'transparent',
                      color: 'var(--color-text-primary)' }}>
                    <strong style={{ fontSize: 12 }}>{item.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {count(item.observations)} quotes · {item.routes} observed routes
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <div style={{ padding: 15, fontSize: 12 }}>No airline matches your search.</div>}
              </div>
            </aside>

            <main style={{ minWidth: 0 }}>
              <div style={{ ...panel, padding: 20, marginBottom: 16 }}>
                <h2 style={{ margin: '0 0 5px', fontSize: 20 }}>{airline.name}</h2>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Last observed {observedAt(airline.latest_collected_at)} IST · Stored INR economy quotes only
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10 }}>
                  {[
                    ['Observed routes', String(airline.routes)],
                    ['Fare quotes', count(airline.observations)],
                    ['Average quote', currency(airline.average_fare)],
                    ['Sample share', `${airline.share_of_observed_quotes_pct}%`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: 13, borderRadius: 10, background: 'var(--color-surface-secondary)' }}>
                      <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
                      <strong style={{ display: 'block', fontSize: 19, marginTop: 5 }}>{value}</strong>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  Sample share is this airline’s percentage of stored quotes, not its DGCA market share.
                </p>
              </div>

              <div style={{ ...panel, padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Booking-window observations</h3>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Observed mean fares by days before travel; these are not forecasts.
                </p>
                {airline.booking_windows.length === 0 ? <p>No observed booking windows.</p> : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {airline.booking_windows.map(window => (
                      <div key={window.advance_days} style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--color-surface-secondary)', minWidth: 110 }}>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>T+{window.advance_days} · {count(window.observations)} quotes</div>
                        <strong style={{ fontSize: 17 }}>{currency(window.average_fare)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ ...panel, padding: 20, overflowX: 'auto' }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Observed route fares</h3>
                <p style={{ margin: '0 0 15px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Routes with stored quotes for this airline. Values are sample statistics, not daily schedules.
                </p>
                <table style={{ width: '100%', minWidth: 550, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ color: 'var(--color-text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--color-border-primary)' }}>
                    {['Route', 'Quotes', 'Mean fare', 'Range', 'Last observed'].map(label => <th key={label} style={{ padding: '9px 7px' }}>{label}</th>)}
                  </tr></thead>
                  <tbody>{airline.route_details.map(route => (
                    <tr key={route.route} style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                      <td style={{ padding: '10px 7px', fontWeight: 700 }}>{route.route}</td>
                      <td style={{ padding: '10px 7px' }}>{count(route.observations)}</td>
                      <td style={{ padding: '10px 7px' }}>{currency(route.average_fare)}</td>
                      <td style={{ padding: '10px 7px' }}>{currency(route.minimum_fare)}–{currency(route.maximum_fare)}</td>
                      <td style={{ padding: '10px 7px' }}>{observedAt(route.latest_collected_at)} IST</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </main>
          </div>
        </>
      )}
    </div>
  )
}
