import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Info, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { BarChart, LineChart } from '../components/MiniChart'
import { apiAnomalies, apiFares, apiLiveFares, apiForecast, apiRouteBasket, isBackendAvailable, type AnomalyResponse, type FareObservationApi, type ForecastResponse } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import DataFreshness from '../components/DataFreshness'
import { buildDailyMedianSeries, collectionDays } from '../lib/fareSeries'
import { formatDateIST, formatDateTimeIST, median } from '../lib/liveStatus'

const card: React.CSSProperties = { background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }
const TABS = ['Overview', 'Price History', 'Booking Windows', 'Forecast', 'Anomalies', 'Sources'] as const
type Tab = typeof TABS[number]

function formatFare(value: number | null) {
  return value == null ? 'Data unavailable' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function changeBetweenCollections(rows: FareObservationApi[]) {
  const byDay = new Map<string, number[]>()
  rows.forEach(row => {
    const day = row.collected_at.slice(0, 10)
    byDay.set(day, [...(byDay.get(day) ?? []), row.total_fare])
  })
  const days = [...byDay.keys()].sort()
  if (days.length < 2) return null
  const previous = median(byDay.get(days.at(-2)!) ?? [])
  const current = median(byDay.get(days.at(-1)!) ?? [])
  if (previous == null || current == null || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export default function RouteExplorer() {
  const { token, user } = useAuth()
  const [route, setRoute] = useState('DEL-BOM')
  const [tab, setTab] = useState<Tab>('Overview')
  const [showProv, setShowProv] = useState(false)
  const [rows, setRows] = useState<FareObservationApi[]>([])
  const [basketRoutes, setBasketRoutes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [searchDate, setSearchDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10) })
  const [filteredToDate, setFilteredToDate] = useState(false)
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyResponse | null>(null)
  // R2: request-id guard — a slow loadRoute for a route the user has already
  // left must not overwrite the current route's fares when it lands.
  const requestIdRef = useRef(0)

  const verifiedRows = useMemo(() => rows.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL' || row.data_origin === 'PUBLIC_INTERFACE'), [rows])
  // R3: the picker comes from GET /api/routes (the authoritative basket), not
  // from a 600-row fare sample that could never list routes outside it.
  const routeOptions = useMemo(() => {
    return basketRoutes.length ? basketRoutes : [route]
  }, [basketRoutes, route])
  const [from, to] = route.split('-')

  async function loadRoute(date?: string) {
    const requestId = ++requestIdRef.current
    const isCurrent = () => requestId === requestIdRef.current
    setLoading(true)
    setMessage(null)
    try {
      const response = await apiLiveFares(route, date ?? searchDate, token ?? undefined)
      if (!isCurrent()) return
      let next = response.observations.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL' || row.data_origin === 'PUBLIC_INTERFACE')
      // The on-demand provider can temporarily fail or time out even while
      // the verified snapshot is healthy. Keep the route usable by falling
      // back to persisted index-eligible rows and label the result honestly.
      if (!next.length) {
        const cached = await apiFares({ route, limit: 200 }, token ?? undefined)
        if (!isCurrent()) return
        next = cached.observations.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL' || row.data_origin === 'PUBLIC_INTERFACE')
        setFilteredToDate(false)
        if (next.length) setMessage('Live fare source is temporarily unavailable; showing cached verified observations.')
      }
      setRows(next)
      setFilteredToDate(Boolean(date))
      if (user?.email) {
        const key = `aeroprice_route_activity:${user.email}`
        const activity = { id: `${route}-${Date.now()}`, route, searchedAt: new Date().toISOString(), travelDate: date ?? null, resultCount: next.length }
        try {
          const existing = JSON.parse(localStorage.getItem(key) || '[]') as typeof activity[]
          const recentDuplicate = existing[0] && existing[0].route === route && Date.now() - new Date(existing[0].searchedAt).getTime() < 90_000
          if (!recentDuplicate) localStorage.setItem(key, JSON.stringify([activity, ...existing].slice(0, 25)))
        } catch { localStorage.setItem(key, JSON.stringify([activity])) }
      }
      if (!next.length) setMessage(date ? `No verified fare records are available for ${route} on ${date}.` : `No verified fare records are available for ${route}.`)
    } catch {
      try {
        const cached = await apiFares({ route, limit: 200 }, token ?? undefined)
        if (!isCurrent()) return
        const next = cached.observations.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL' || row.data_origin === 'PUBLIC_INTERFACE')
        setRows(next)
        setFilteredToDate(false)
        setMessage(next.length ? 'Live fare source is temporarily unavailable; showing cached verified observations.' : 'No verified fare records are available for this route.')
      } catch {
        if (!isCurrent()) return
        setRows([])
        setMessage('The verified fare service is not available right now.')
      }
    } finally { if (isCurrent()) setLoading(false) }
  }

  useEffect(() => {
    let active = true
    isBackendAvailable().then(available => {
      if (!available) throw new Error('backend unavailable')
      return apiRouteBasket(token ?? undefined)
    }).then(response => {
      if (!active || !response) return
      setBasketRoutes(response.routes.map(item => item.route).sort())
    }).catch(() => { if (active) setBasketRoutes([]) })
    return () => { active = false }
  }, [token])

  useEffect(() => { void loadRoute(searchDate) }, [route, token, searchDate])

  useEffect(() => {
    apiForecast(route, 7, token ?? undefined).then(setForecast).catch(() => setForecast(null))
    apiAnomalies(token ?? undefined).then(setAnomalies).catch(() => setAnomalies(null))
  }, [route, token])

  const fares = verifiedRows.map(row => row.total_fare)
  const currentFare = median(fares)
  const minFare = fares.length ? Math.min(...fares) : null
  const maxFare = fares.length ? Math.max(...fares) : null
  const collectionChange = changeBetweenCollections(verifiedRows)
  const carriers = [...new Set(verifiedRows.map(row => row.airline).filter(Boolean))]
  const sources = [...new Set(verifiedRows.map(row => row.source).filter(Boolean))]
  const latestCollectedAt = verifiedRows.map(row => row.collected_at).sort().at(-1) ?? null
  // Missing days are null in the series — the line breaks there instead of
  // plotting ₹0 or silently compressing the time axis (audit §2.11).
  const historyDays = collectionDays(verifiedRows)
  const dailyHistory = buildDailyMedianSeries(verifiedRows, [route], historyDays)[0]?.data ?? []
  const dailyHistoryPoints = dailyHistory.filter((value): value is number => value != null).length
  const bookingWindows = [...new Set(verifiedRows.map(row => row.advance_days))].sort((a, b) => a - b).map(days => ({ label: `${days}d`, value: median(verifiedRows.filter(row => row.advance_days === days).map(row => row.total_fare)) ?? 0 })).filter(point => point.value > 0)
  const sourceRows = sources.map(source => ({ source, count: verifiedRows.filter(row => row.source === source).length, latest: verifiedRows.filter(row => row.source === source).map(row => row.collected_at).sort().at(-1) }))

  const setRouteFromCodes = (nextFrom: string, nextTo: string) => {
    const candidate = `${nextFrom}-${nextTo}`
    if (routeOptions.includes(candidate)) setRoute(candidate)
  }

  return <div className="flex flex-col animate-fade-up" style={{ gap: 'var(--space-xl)', maxWidth: 1180 }}>
    <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-xl)' }}>
      <div><h1 className="text-title text-primary">Route Explorer</h1><p className="text-body text-secondary" style={{ marginTop: 'var(--space-xs)' }}>Verified fare observations by Indian corridor.</p></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>FROM</label><select value={from} onChange={event => setRouteFromCodes(event.target.value, to)} style={{ padding: '10px 14px', minWidth: 90, fontFamily: 'var(--font-mono)', fontWeight: 700, border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-bg)' }}>{[...new Set(routeOptions.map(item => item.split('-')[0]))].map(code => <option key={code}>{code}</option>)}</select></div>
        <button onClick={() => setRouteFromCodes(to, from)} title="Swap route" aria-label="Swap origin and destination" style={{ padding: 10, border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}><ArrowLeftRight size={16} /></button>
        <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>TO</label><select value={to} onChange={event => setRouteFromCodes(from, event.target.value)} style={{ padding: '10px 14px', minWidth: 90, fontFamily: 'var(--font-mono)', fontWeight: 700, border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-bg)' }}>{[...new Set(routeOptions.map(item => item.split('-')[1]))].map(code => <option key={code}>{code}</option>)}</select></div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{routeOptions.slice(0, 12).map(option => <button key={option} onClick={() => setRoute(option)} style={{ border: `1px solid ${route === option ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`, borderRadius: 99, padding: '5px 12px', background: route === option ? 'var(--color-brand-muted)' : 'transparent', color: route === option ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)', fontSize: 11, fontWeight: route === option ? 700 : 500, cursor: 'pointer' }}>{option.replace('-', ' → ')}</button>)}</div>

    <div style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', color: 'var(--color-text-tertiary)', marginBottom: 3 }}>TRAVEL DATE</label><input type="date" value={searchDate} onChange={event => setSearchDate(event.target.value)} style={{ padding: '7px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-secondary)' }} /></div>
      <button onClick={() => void loadRoute(searchDate)} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 0, borderRadius: 'var(--radius-md)', background: 'var(--color-brand-primary)', color: '#fff', fontWeight: 700, cursor: loading ? 'wait' : 'pointer', opacity: loading ? .7 : 1 }}><RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />{loading ? 'Loading…' : 'Search Verified Fares'}</button>
      <span style={{ fontSize: 11, color: verifiedRows.length ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 650 }}>{verifiedRows.length ? `${verifiedRows.length} verified records loaded` : 'No verified records loaded'}</span>
      {latestCollectedAt && <DataFreshness minutesAgo={Math.max(0, Math.floor((Date.now() - new Date(latestCollectedAt).getTime()) / 60000))} />}
      {filteredToDate && <button onClick={() => void loadRoute()} style={{ border: 0, background: 'transparent', color: 'var(--color-brand-primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Clear date filter</button>}
    </div>

    <div style={card}>
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-lg)' }}>
        <div><div className="flex items-center" style={{ gap: 9, marginBottom: 12 }}><span className="text-heading text-primary" style={{ fontWeight: 750 }}>{route.replace('-', ' → ')}</span><span style={{ borderRadius: 99, padding: '3px 8px', color: verifiedRows.length ? 'var(--color-success)' : 'var(--color-text-tertiary)', background: verifiedRows.length ? 'var(--color-success-bg)' : 'var(--color-surface-secondary)', fontSize: 10, fontWeight: 800 }}>{verifiedRows.length ? 'VERIFIED' : 'NO DATA'}</span></div><div className="flex items-baseline" style={{ gap: 12 }}><span style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, color: 'var(--color-text-primary)' }}>{formatFare(currentFare)}</span><span className="text-caption text-secondary">Observed median</span></div><div style={{ marginTop: 13, fontSize: 12, color: collectionChange == null ? 'var(--color-text-tertiary)' : collectionChange < 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700 }}>{collectionChange == null ? 'A second collection is required for movement.' : `${collectionChange < 0 ? '↓' : '↑'} ${Math.abs(collectionChange).toFixed(2)}% versus the previous verified collection`}</div></div>
        <div style={{ textAlign: 'right' }}><div className="text-caption text-tertiary">OBSERVATIONS</div><div className="text-label text-primary" style={{ fontWeight: 700 }}>{verifiedRows.length.toLocaleString('en-IN')}</div><button onClick={() => setShowProv(true)} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', color: 'var(--color-brand-primary)', cursor: 'pointer' }}><Info size={13} />Data provenance</button></div>
      </div>
      {message && <div style={{ marginTop: 16, padding: 10, borderRadius: 8, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', fontSize: 12 }}>{message}</div>}
    </div>

    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div className="flex overflow-x-auto" role="tablist" aria-label="Route detail tabs" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>{TABS.map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} style={{ padding: '14px 20px', border: 0, borderBottom: `2px solid ${tab === item ? 'var(--color-brand-primary)' : 'transparent'}`, background: 'transparent', color: tab === item ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)', fontWeight: tab === item ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{item}</button>)}</div>
      <div style={{ padding: 'var(--space-xl)' }}>
        {tab === 'Overview' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 14 }}>{[
          ['Current Fare', formatFare(currentFare), 'Observed median'], ['Observed Range', minFare == null ? 'Data unavailable' : `${formatFare(minFare)} – ${formatFare(maxFare)}`, 'Minimum–maximum'], ['Collection Change', collectionChange == null ? 'Data unavailable' : `${collectionChange > 0 ? '+' : ''}${collectionChange.toFixed(2)}%`, 'Latest comparison'], ['Observations', verifiedRows.length.toLocaleString('en-IN'), 'Verified records'], ['Airlines', carriers.length.toLocaleString('en-IN'), 'Observed carriers'], ['Sources', sources.length.toLocaleString('en-IN'), 'Recorded sources'],
        ].map(([label, value, sub]) => <div key={label} style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)' }}><div className="text-caption text-tertiary">{label}</div><div className="text-label text-primary" style={{ marginTop: 5, fontWeight: 700 }}>{value}</div><div className="text-caption text-tertiary">{sub}</div></div>)}</div>}

        {tab === 'Price History' && (dailyHistoryPoints >= 2 ? <div><h3 className="text-label text-primary" style={{ fontWeight: 700 }}>Verified collection history</h3><p className="text-caption text-secondary" style={{ marginTop: 4 }}>Each point is the actual route median recorded on that collection day. Days with no observation break the line.</p><div style={{ marginTop: 18, overflowX: 'auto' }}><LineChart series={[{ name: route, data: dailyHistory, color: 'var(--color-brand-primary)' }]} labels={historyDays} width={720} height={220} /></div></div> : <p className="text-body text-secondary">At least two verified collection days are required to draw a history chart.</p>)}

        {tab === 'Booking Windows' && (bookingWindows.length ? <div><h3 className="text-label text-primary" style={{ fontWeight: 700 }}>Observed advance-purchase windows</h3><p className="text-caption text-secondary" style={{ marginTop: 4 }}>Medians are calculated only from the fare records currently stored for this route.</p><div style={{ marginTop: 18, overflowX: 'auto' }}><BarChart data={bookingWindows} width={620} height={190} /></div></div> : <p className="text-body text-secondary">No verified booking-window records are available for this route.</p>)}

        {tab === 'Forecast' && (forecast?.status === 'FORECAST' && forecast.forecasts.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>{forecast.forecasts.map(item => <div key={item.horizon_days} style={{ padding: 15, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)' }}><div className="text-caption text-tertiary">{item.horizon_days}-day outlook</div><div className="text-label text-primary" style={{ marginTop: 7, fontWeight: 750 }}>{formatFare(item.forecast_fare)}</div><div className="text-caption text-tertiary">Range {formatFare(item.lower_bound)} – {formatFare(item.upper_bound)}</div></div>)}</div> : <div style={{ padding: 14, borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', color: 'var(--color-text-secondary)', fontSize: 12 }}><AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{forecast?.message ?? 'A forecast needs more verified history before it can be produced.'}</div>)}

        {tab === 'Anomalies' && (anomalies?.anomalies?.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['Route', 'Airline', 'Fare', 'Collected'].map(item => <th key={item} style={{ textAlign: 'left', padding: 9, color: 'var(--color-text-tertiary)', fontSize: 10 }}>{item}</th>)}</tr></thead><tbody>{anomalies.anomalies.filter(item => item.route === route).map(item => <tr key={item.observation_id} style={{ borderTop: '1px solid var(--color-border-primary)' }}><td style={{ padding: 9 }}>{item.route}</td><td style={{ padding: 9 }}>{item.airline}</td><td style={{ padding: 9 }}>{formatFare(item.total_fare)}</td><td style={{ padding: 9 }}>{formatDateIST(item.collected_at)}</td></tr>)}</tbody></table></div> : <p className="text-body text-secondary">No verified anomaly records are available for this route.</p>)}

        {tab === 'Sources' && (sourceRows.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['Source', 'Status', 'Verified records', 'Latest collection'].map(item => <th key={item} style={{ textAlign: 'left', padding: 9, color: 'var(--color-text-tertiary)', fontSize: 10 }}>{item}</th>)}</tr></thead><tbody>{sourceRows.map(item => <tr key={item.source} style={{ borderTop: '1px solid var(--color-border-primary)' }}><td style={{ padding: 9 }}>{item.source}</td><td style={{ padding: 9, color: 'var(--color-success)', fontWeight: 700 }}>VERIFIED</td><td style={{ padding: 9 }}>{item.count}</td><td style={{ padding: 9 }}>{item.latest ? formatDateTimeIST(item.latest) : '—'}</td></tr>)}</tbody></table></div> : <p className="text-body text-secondary">No verified source records are available for this route.</p>)}
      </div>
    </div>

    <Modal isOpen={showProv} onClose={() => setShowProv(false)} title="Data Provenance" footer={<Button variant="neutral" onClick={() => setShowProv(false)}>Close</Button>}><div className="flex flex-col" style={{ gap: 12, fontSize: 13 }}><div><b>Route:</b> {route}</div><div><b>Origin:</b> REAL / OFFICIAL fare observations only</div><div><b>Verified records:</b> {verifiedRows.length}</div><div><b>Latest collection:</b> {latestCollectedAt ? formatDateTimeIST(latestCollectedAt) : 'Unavailable'}</div><div><b>Recorded sources:</b> {sources.join(', ') || 'Unavailable'}</div></div></Modal>
  </div>
}
