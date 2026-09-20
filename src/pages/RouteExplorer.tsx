import { useState, useEffect } from 'react'
import { Info, AlertTriangle, ArrowLeftRight, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import StatusBadge from '../components/StatusBadge'
import TrendIndicator from '../components/TrendIndicator'
import DataFreshness from '../components/DataFreshness'
import { BarChart, LineChart } from '../components/MiniChart'
import { corridors, bookingWindowData, priceHistoryData, dataSources } from '../data/sampleData'
import { apiFares, isBackendAvailable, type FareObservationApi } from '../services/api'
import { searchFares, type FareResult } from '../services/fareSearch'

const card = { background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)' } as const

const TABS = ['Overview', 'Price History', 'Booking Windows', 'Forecast', 'Anomalies', 'Sources'] as const
type Tab = typeof TABS[number]

const historySeries = [
  { name: 'DEL–BOM',  data: priceHistoryData.map(d => d.DEL_BOM), color: 'var(--color-brand-primary)' },
  { name: 'DEL–BLR',  data: priceHistoryData.map(d => d.DEL_BLR), color: 'var(--color-danger)' },
  { name: 'BOM–BLR',  data: priceHistoryData.map(d => d.BOM_BLR), color: 'var(--color-success)' },
  { name: 'Index×55', data: priceHistoryData.map(d => d.index * 55), color: 'var(--color-warning)' },
]

export default function RouteExplorer() {
  const [route, setRoute]           = useState('DEL-BOM')
  const [tab, setTab]               = useState<Tab>('Overview')
  const [showProv, setShowProv]     = useState(false)
  const [realFares, setRealFares]   = useState<FareObservationApi[]>([])
  const [liveFares, setLiveFares]   = useState<FareResult[]>([])
  const [fareLoading, setFareLoading] = useState(false)
  const [fareError, setFareError]   = useState<string | null>(null)
  const [searchDate, setSearchDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const corridor = corridors.find(c => c.id === route) ?? corridors[0]
  const routeOptions = corridors.map(c => ({ value: c.id, label: `${c.from} → ${c.to}` }))
  const bookingData  = bookingWindowData.map(d => ({ label: d.label, value: d.avgFare }))

  const origins = [...new Set(corridors.map(c => c.from))]
  const destinations = [...new Set(corridors.map(c => c.to))]
  const [fromCity, toCity] = route.split('-')

  function handleFromChange(newFrom: string) {
    if (newFrom === toCity) {
      // Swap to avoid same-city route
      const newRoute = `${toCity}-${fromCity}`
      if (corridors.find(c => c.id === newRoute)) { setRoute(newRoute); return }
    }
    const newRoute = `${newFrom}-${toCity}`
    if (corridors.find(c => c.id === newRoute)) { setRoute(newRoute); return }
    const first = corridors.find(c => c.from === newFrom)
    if (first) setRoute(first.id)
  }
  function handleToChange(newTo: string) {
    if (newTo === fromCity) {
      // Swap to avoid same-city route
      const newRoute = `${toCity}-${fromCity}`
      if (corridors.find(c => c.id === newRoute)) { setRoute(newRoute); return }
    }
    const newRoute = `${fromCity}-${newTo}`
    if (corridors.find(c => c.id === newRoute)) { setRoute(newRoute); return }
    const first = corridors.find(c => c.to === newTo)
    if (first) setRoute(first.id)
  }
  function handleSwap() {
    const reversed = `${toCity}-${fromCity}`
    if (corridors.find(c => c.id === reversed)) setRoute(reversed)
  }

  useEffect(() => {
    setRealFares([])
    isBackendAvailable().then(up => {
      if (!up) return
      apiFares({ route }).then(r => setRealFares(r.observations ?? [])).catch(() => {})
    })
  }, [route])

  async function fetchLiveFares() {
    setFareLoading(true)
    setFareError(null)
    const [dep, arr] = route.split('-')
    const result = await searchFares({ origin: dep, destination: arr, date: searchDate })
    if (result.source === 'REAL') {
      setLiveFares(result.fares)
    } else {
      setFareError(result.error ?? 'Could not fetch fares')
      setLiveFares([])
    }
    setFareLoading(false)
  }

  useEffect(() => {
    fetchLiveFares()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route])

  return (
    <div className="flex flex-col animate-fade-up" style={{ gap: 'var(--space-xl)', maxWidth: 860 }}>
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-xl)' }}>
        <div>
          <h1 className="text-title text-primary">Route Explorer</h1>
          <p className="text-body text-secondary" style={{ marginTop: 'var(--space-xs)' }}>Deep-dive corridor intelligence.</p>
        </div>
        {/* Premium FROM/TO selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-sm)' }}>
            {/* FROM */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>FROM</label>
              <select
                value={fromCity}
                onChange={e => handleFromChange(e.target.value)}
                style={{ padding: '10px 14px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', background: 'var(--color-surface-bg)', border: '1.5px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer', outline: 'none', minWidth: 90 }}
              >
                {origins.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {/* Swap button */}
            <button
              onClick={handleSwap}
              title="Swap route"
              style={{ padding: '10px', background: 'var(--color-surface-secondary)', border: '1.5px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 150ms, color 150ms', marginBottom: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-brand-muted)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-brand-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-secondary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary)' }}
            >
              <ArrowLeftRight size={16} />
            </button>
            {/* TO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>TO</label>
              <select
                value={toCity}
                onChange={e => handleToChange(e.target.value)}
                style={{ padding: '10px 14px', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', background: 'var(--color-surface-bg)', border: '1.5px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer', outline: 'none', minWidth: 90 }}
              >
                {destinations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {/* Quick route chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
            {corridors.slice(0, 6).map(c => (
              <button
                key={c.id}
                onClick={() => setRoute(c.id)}
                style={{
                  border: `1px solid ${route === c.id ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`,
                  borderRadius: 'var(--radius-full)',
                  padding: '4px 12px',
                  background: route === c.id ? 'var(--color-brand-muted)' : 'transparent',
                  color: route === c.id ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
                  fontSize: 11,
                  fontFamily: 'var(--font-sans)',
                  fontWeight: route === c.id ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms, background 150ms',
                }}
              >
                {c.from}→{c.to}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live fare search bar */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>TRAVEL DATE</label>
          <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', outline: 'none' }} />
        </div>
        <button onClick={fetchLiveFares} disabled={fareLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-brand-primary)', color: 'white', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', border: 'none', cursor: fareLoading ? 'not-allowed' : 'pointer', opacity: fareLoading ? 0.7 : 1 }}>
          <RefreshCw size={12} style={{ animation: fareLoading ? 'spin 1s linear infinite' : 'none' }} />
          {fareLoading ? 'Searching…' : 'Search Real Fares'}
        </button>
        {liveFares.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
            ✓ {liveFares.length} live fares from Google Flights
          </span>
        )}
        {fareError && (
          <span style={{ fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={11} /> {fareError}
          </span>
        )}
      </div>

      {/* Route hero */}
      <div style={card}>
        <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-lg)' }}>
          <div>
            <div className="flex items-center" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <span className="text-heading text-primary" style={{ fontWeight: 700 }}>{corridor.from} → {corridor.to}</span>
              <StatusBadge status="sample" />
            </div>
            <div className="flex items-baseline" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
              <span className="text-primary" style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-sans)' }}>
                ₹{corridor.currentFare.toLocaleString('en-IN')}
              </span>
              <span className="text-caption text-secondary">Observed median</span>
            </div>
            <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
              <div><span className="text-caption text-tertiary">7D </span><TrendIndicator direction={corridor.trend} value={Math.abs(corridor.change7d)} /></div>
              <div><span className="text-caption text-tertiary">30D </span><TrendIndicator direction={corridor.change30d > 0 ? 'up' : 'down'} value={Math.abs(corridor.change30d)} /></div>
              {realFares.length > 0
                ? <DataFreshness minutesAgo={Math.floor((Date.now() - new Date(realFares[0].collected_at).getTime()) / 60000)} />
                : <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>GENERATED</span>
              }
            </div>
          </div>
          <div className="flex flex-col items-end" style={{ gap: 'var(--space-md)' }}>
            <div className="text-right">
              <span className="text-caption text-tertiary">OBSERVATIONS</span>
              <div className="text-label text-primary" style={{ fontWeight: 500 }}>{corridor.observations.toLocaleString('en-IN')}</div>
            </div>
            <button onClick={() => setShowProv(true)}
              className="flex items-center text-body focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2 rounded"
              style={{ gap: 'var(--space-xs)', color: 'var(--color-brand-primary)', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <Info size={13} /> Data provenance
            </button>
          </div>
        </div>
      </div>

      {/* Tab panel */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {/* Tab bar */}
        <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="text-body whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
              style={{
                padding: 'var(--space-md) var(--space-xl)',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: `2px solid ${tab === t ? 'var(--color-brand-primary)' : 'transparent'}`,
                color: tab === t ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
                fontWeight: tab === t ? 600 : 400,
                background: 'transparent',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
              }}>
              {t}
            </button>
          ))}
        </div>

        <div style={{ padding: 'var(--space-xl)' }}>
          {tab === 'Overview' && (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-lg)' }}>
              {[
                { label: 'Current Fare',     value: `₹${corridor.currentFare.toLocaleString('en-IN')}`, sub: 'Observed median' },
                { label: 'Observed Range',   value: `₹${(corridor.currentFare * 0.88).toFixed(0)}–₹${(corridor.currentFare * 1.12).toFixed(0)}`, sub: 'Min–Max' },
                { label: '7-Day Change',     value: `${corridor.change7d > 0 ? '+' : ''}${corridor.change7d.toFixed(1)}%`, sub: 'vs prior week' },
                { label: 'Observations',     value: corridor.observations.toLocaleString('en-IN'), sub: 'Total recorded' },
                { label: 'Airlines',         value: '4', sub: 'Carriers observed' },
                { label: 'Sources',          value: '5', sub: 'Active' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                  <div className="text-caption text-tertiary" style={{ marginBottom: 'var(--space-xs)' }}>{label}</div>
                  <div className="text-label text-primary" style={{ fontWeight: 500 }}>{value}</div>
                  <div className="text-caption text-tertiary">{sub}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Price History' && (
            <div className="flex flex-col" style={{ gap: 'var(--space-lg)' }}>
              <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-md)' }}>
                <h3 className="text-label text-primary" style={{ fontWeight: 500 }}>30-Day Price History</h3>
                <div className="flex flex-wrap" style={{ gap: 'var(--space-lg)' }}>
                  {historySeries.map(s => (
                    <div key={s.name} className="flex items-center" style={{ gap: 'var(--space-xs)' }}>
                      <div style={{ width: 16, height: 2, background: s.color, borderRadius: 2 }} />
                      <span className="text-caption text-secondary">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <LineChart series={historySeries} labels={priceHistoryData.map(d => d.date)} width={600} height={200} />
              </div>
            </div>
          )}

          {tab === 'Booking Windows' && (
            <div className="flex flex-col" style={{ gap: 'var(--space-lg)' }}>
              <div>
                <h3 className="text-label text-primary" style={{ fontWeight: 500 }}>Fare by Booking Window</h3>
                <p className="text-body text-secondary" style={{ marginTop: 'var(--space-xs)' }}>Median fare per advance-purchase window. Range = observed min–max.</p>
              </div>

              {/* Live fares from Serper/Google Flights */}
              {liveFares.length > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-success-bg)', border: '1px solid rgba(22,163,74,0.2)', fontSize: 11, color: 'var(--color-success)', fontFamily: 'var(--font-sans)' }}>
                    ✓ {liveFares.length} real fares from Google Flights · {searchDate} · Source: Serper.dev
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}>
                          {['Airline', 'Flight', 'Departure', 'Arrival', 'Duration', 'Stops', 'Price (INR)', 'Cabin'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveFares.map((f, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--color-border-primary)', background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                            <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{f.airline}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{f.flight_number || '—'}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{f.departure_time || '—'}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{f.arrival_time || '—'}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--color-text-tertiary)' }}>{f.duration || '—'}</td>
                            <td style={{ padding: '9px 12px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>{f.stops}</td>
                            <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                              ₹{f.price.toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontFamily: 'var(--font-sans)' }}>
                                {f.cabin}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : fareLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                  Searching Google Flights for {route} on {searchDate}…
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto"><BarChart data={bookingData} width={520} height={160} /></div>
                  <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>
                    {bookingWindowData.map(d => (
                      <div key={d.window} style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
                        <div className="text-caption text-tertiary">{d.window}</div>
                        <div className="text-label text-primary" style={{ fontWeight: 500 }}>₹{d.avgFare.toLocaleString('en-IN')}</div>
                        <div className="text-caption text-tertiary">demand {(d.demand * 100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
                    {fareError ? `Google Flights: ${fareError}` : 'Click "Search Real Fares" above to fetch live prices from Google Flights.'}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'Forecast' && (
            <div className="flex flex-col" style={{ gap: 'var(--space-lg)' }}>
              <Badge label="STATISTICAL ESTIMATE — Not a guarantee" variant="info" />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-lg)' }}>
                {[
                  { horizon: '2 days',  dir: 'up' as const,     range: '₹4,800–₹5,200', conf: 'Moderate' },
                  { horizon: '7 days',  dir: 'up' as const,     range: '₹4,900–₹5,600', conf: 'Low' },
                  { horizon: '14 days', dir: 'stable' as const, range: '₹4,600–₹6,100', conf: 'Low' },
                ].map(f => (
                  <div key={f.horizon} style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)' }}>
                    <div className="text-caption text-tertiary" style={{ textTransform: 'uppercase', marginBottom: 'var(--space-md)' }}>{f.horizon}</div>
                    <TrendIndicator direction={f.dir} value={f.dir === 'up' ? 3.2 : 0} />
                    <div className="text-caption text-tertiary" style={{ marginTop: 'var(--space-sm)' }}>Expected range</div>
                    <div className="text-body text-primary" style={{ fontWeight: 500 }}>{f.range}</div>
                    <div className="text-caption text-tertiary" style={{ marginTop: 'var(--space-xs)' }}>Confidence: {f.conf}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-start" style={{ gap: 'var(--space-sm)', padding: 'var(--space-md)', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)' }}>
                <AlertTriangle size={13} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
                <p className="text-body text-secondary">Forecasts are statistical estimates based on observed platform data. External events are not modeled.</p>
              </div>
            </div>
          )}

          {tab === 'Anomalies' && (
            <div className="flex flex-col" style={{ gap: 'var(--space-lg)' }}>
              <h3 className="text-label text-primary" style={{ fontWeight: 500 }}>Anomaly Detection — MAD Method</h3>
              <div style={{ padding: 'var(--space-lg)', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-primary)' }}>
                <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--color-warning)' }} />
                  <span className="text-label" style={{ fontWeight: 500, color: 'var(--color-warning)' }}>Unusual Price Movement</span>
                  <Badge label="HIGH" variant="warning" />
                </div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-md)' }}>
                  {[
                    { label: 'Observed',      value: `₹${corridor.currentFare.toLocaleString('en-IN')}` },
                    { label: 'Expected',      value: `₹${(corridor.currentFare * 0.82).toFixed(0)}–₹${(corridor.currentFare * 0.96).toFixed(0)}` },
                    { label: 'Anomaly Score', value: '3.4σ' },
                    { label: 'Method',        value: 'MAD-based' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-caption text-tertiary">{label}</div>
                      <div className="text-body text-primary" style={{ fontWeight: 500 }}>{value}</div>
                    </div>
                  ))}
                </div>
                <p className="text-body text-secondary" style={{ marginTop: 'var(--space-lg)' }}>
                  Possible driver: Short-term supply/availability movement. Causal attribution requires further investigation.
                </p>
              </div>
            </div>
          )}

          {tab === 'Sources' && (
            <div className="flex flex-col" style={{ gap: 'var(--space-lg)' }}>
              <h3 className="text-label text-primary" style={{ fontWeight: 500 }}>Data Sources — {corridor.from} → {corridor.to}</h3>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                      {['Source', 'Type', 'Status', 'Last Success', 'Records'].map(h => (
                        <th key={h} className="text-caption text-tertiary" style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-lg) var(--space-sm) 0', fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataSources.filter(s => ['AIRLINE_DIRECT','OTA'].includes(s.type)).map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                        <td className="text-body text-primary" style={{ padding: 'var(--space-sm) var(--space-lg) var(--space-sm) 0', fontWeight: 500 }}>{s.name}</td>
                        <td className="text-body text-secondary" style={{ padding: 'var(--space-sm) var(--space-lg) var(--space-sm) 0' }}>{s.type}</td>
                        <td style={{ padding: 'var(--space-sm) var(--space-lg) var(--space-sm) 0' }}><StatusBadge status={s.status} /></td>
                        <td className="text-body text-secondary" style={{ padding: 'var(--space-sm) var(--space-lg) var(--space-sm) 0' }}>{s.lastPing}</td>
                        <td className="text-body text-secondary" style={{ padding: 'var(--space-sm) 0' }}>{s.recordsToday.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showProv} onClose={() => setShowProv(false)} title="Data Provenance"
        footer={<Button variant="neutral" onClick={() => setShowProv(false)}>Close</Button>}>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          {[
            { label: 'SOURCE',       value: 'IndiGo (InterGlobe Aviation)' },
            { label: 'COLLECTED',    value: '18 Sep 2026 · 21:42 IST' },
            { label: 'TRAVEL DATE',  value: '25 Sep 2026' },
            { label: 'ADVANCE',      value: 'T+7 (7 days)' },
            { label: 'FARE',         value: `₹${corridor.currentFare.toLocaleString('en-IN')}` },
            { label: 'COLLECTOR',    value: 'Playwright Automation' },
            { label: 'PUBLICATION',  value: 'AP-2026-09-18-001' },
            { label: 'STATUS',       value: 'SAMPLE DATA' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-caption text-tertiary">{label}</div>
              <div className="text-body text-primary" style={{ fontWeight: 500, marginTop: 'var(--space-xs)' }}>{value}</div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
