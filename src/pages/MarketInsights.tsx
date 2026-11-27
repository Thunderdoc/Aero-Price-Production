import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart2, TrendingDown, TrendingUp } from 'lucide-react'
import { apiAnomalies, apiFareMovement, apiFares, type AnomalyResponse, type FareMovementResponse, type FareObservationApi } from '../services/api'
import ElasticityChart, { type ElasticityPoint } from '../components/ElasticityChart'
import DataFreshness from '../components/DataFreshness'
import { formatDateTimeIST, median } from '../lib/liveStatus'
import { buildDailyMedianSeries, collectionDays } from '../lib/fareSeries'
import { useAuth } from '../contexts/AuthContext'

type TabId = 'price' | 'carriers' | 'routes' | 'anomalies'
const TABS: { id: TabId; label: string }[] = [
  { id: 'price', label: 'Price History' }, { id: 'carriers', label: 'Carrier Benchmarks' }, { id: 'routes', label: 'Route Analysis' }, { id: 'anomalies', label: 'Anomalies' },
]
const card: React.CSSProperties = { background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }

function fare(value: number | null) { return value == null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` }

// Missing days are `null` in the series: the line breaks there instead of
// plunging to a ₹0 fare (audit §2.11 — a chart must never invent a fare).
function MultiLineChart({ series, labels }: { series: Array<{ name: string; data: Array<number | null>; color: string }>; labels: string[] }) {
  if (labels.length < 2 || !series.length) return <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--color-text-tertiary)', background: 'var(--color-surface-secondary)', borderRadius: 10 }}>Two verified collection days are required for a chart.</div>
  const width = 720, height = 235, pad = { top: 18, right: 18, bottom: 34, left: 52 }
  const values = series.flatMap(item => item.data).filter((value): value is number => value != null && Number.isFinite(value))
  const min = Math.min(...values) * .98, max = Math.max(...values) * 1.02, range = Math.max(1, max - min)
  const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom
  const x = (index: number) => pad.left + index / Math.max(1, labels.length - 1) * plotWidth
  const y = (value: number) => pad.top + plotHeight - (value - min) / range * plotHeight
  // Split each series into segments at null points so gaps break the line.
  const segmentsFor = (data: Array<number | null>) => {
    const segments: string[][] = [[]]
    data.forEach((value, index) => {
      if (value == null) { if (segments[segments.length - 1].length) segments.push([]); return }
      segments[segments.length - 1].push(`${x(index)},${y(value)}`)
    })
    return segments.filter(seg => seg.length >= 2)
  }
  return <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 520, display: 'block' }} role="img" aria-label="Verified fare history">{[0, .33, .66, 1].map(ratio => { const value = min + range * ratio; return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="var(--color-border-primary)" /><text x={pad.left - 8} y={y(value) + 4} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="10">{Math.round(value).toLocaleString('en-IN')}</text></g> })}{series.flatMap(item => segmentsFor(item.data).map((seg, si) => <polyline key={`${item.name}-${si}`} points={seg.join(' ')} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />))}{labels.map((label, index) => <text key={label} x={x(index)} y={height - 8} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="10">{label.slice(5)}</text>)}</svg>
}

export default function MarketInsights() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('price')
  const [rows, setRows] = useState<FareObservationApi[]>([])
  const [movement, setMovement] = useState<FareMovementResponse | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyResponse | null>(null)
  const [faresFailed, setFaresFailed] = useState(false)
  const [movementFailed, setMovementFailed] = useState(false)
  const [anomaliesFailed, setAnomaliesFailed] = useState(false)
  const [historyRows, setHistoryRows] = useState<typeof rows>([])
  const [loading, setLoading] = useState(true)
  const [elasticityRoute, setElasticityRoute] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const withOneRetry = async <T,>(call: () => Promise<T>): Promise<T> => {
      try {
        return await call()
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        if (!active) throw error
        return call()
      }
    }
    setLoading(true)
    setFaresFailed(false)
    setMovementFailed(false)
    setAnomaliesFailed(false)
    // /api/anomalies requires auth: guests skip it entirely instead of
    // rendering its rejection as a clean "no outliers" result.
    const anomaliesCall = token
      ? withOneRetry(() => apiAnomalies(token))
      : Promise.resolve(null)
    Promise.allSettled([
      withOneRetry(() => apiFares({ limit: 600 }, token ?? undefined)),
      withOneRetry(() => apiFareMovement(token ?? undefined)),
      anomaliesCall,
    ]).then(([fares, fareMovement, anomalyData]) => {
      if (!active) return
      if (fares.status === 'fulfilled') setRows(fares.value.observations.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL' || row.data_origin === 'PUBLIC_INTERFACE'))
      else setFaresFailed(true)
      if (fareMovement.status === 'fulfilled') setMovement(fareMovement.value)
      else setMovementFailed(true)
      if (anomalyData.status === 'fulfilled') setAnomalies(anomalyData.value)
      else setAnomaliesFailed(true)
      setLoading(false)
    })
    return () => { active = false }
  }, [token])

  const routeStats = useMemo(() => [...new Set(rows.map(row => row.route))].map(route => {
    const routeRows = rows.filter(row => row.route === route)
    return { route, rows: routeRows, count: routeRows.length, median: median(routeRows.map(row => row.total_fare)), carriers: new Set(routeRows.map(row => row.airline)).size, movement: movement?.routes.find(item => item.route === route) }
  }).sort((a, b) => b.count - a.count), [rows, movement])
  const carrierStats = useMemo(() => [...new Set(rows.map(row => row.airline))].filter(Boolean).map(airline => {
    const carrierRows = rows.filter(row => row.airline === airline)
    return { airline, count: carrierRows.length, median: median(carrierRows.map(row => row.total_fare)), routes: new Set(carrierRows.map(row => row.route)).size }
  }).sort((a, b) => b.count - a.count), [rows])
  const historyRoutes = routeStats.slice(0, 3)
  // The 600-row aggregate load is newest-first across all routes, so a top
  // route can hold a single collection day there and its line vanishes.
  // Fetch each history route's own stored fares so every legend route has a
  // real per-collection-day series.
  useEffect(() => {
    if (!historyRoutes.length) { setHistoryRows([]); return }
    let active = true
    void Promise.all(historyRoutes.map(item => apiFares({ route: item.route, limit: 200 }, token ?? undefined).then(result => result.observations.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL' || row.data_origin === 'PUBLIC_INTERFACE')).catch(() => item.rows)))
      .then(groups => { if (active) setHistoryRows(groups.flat()) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyRoutes.map(item => item.route).join(','), token])
  const historySourceRows = historyRows.length ? historyRows : historyRoutes.flatMap(item => item.rows)
  const historyDays = collectionDays(historySourceRows)
  // Missing days are null in the series — never 0 (see buildDailyMedianSeries).
  const series = buildDailyMedianSeries(
    historySourceRows,
    historyRoutes.map(item => item.route),
    historyDays,
  ).map((item, index) => ({ name: item.route, color: ['#2563eb', '#7c3aed', '#0891b2'][index], data: item.data }))
  // Freshness of the newest stored fare shown on this page.
  const newestCollectedAt = rows.length ? rows.reduce((latest, row) => row.collected_at > latest ? row.collected_at : latest, rows[0].collected_at) : null
  const newestAgeMinutes = newestCollectedAt ? Math.max(0, Math.floor((Date.now() - new Date(newestCollectedAt).getTime()) / 60000)) : null
  // Lead-time elasticity: median stored fare per advance window for the
  // selected route, from the same verified observations. Windows with no
  // verified observations are omitted, never estimated.
  const elasticityRouteStat = routeStats.find(item => item.route === elasticityRoute) ?? routeStats[0]
  const elasticityPoints: ElasticityPoint[] = elasticityRouteStat
    ? [1, 7, 15, 30, 45].map((window): ElasticityPoint | null => {
        const windowRows = elasticityRouteStat.rows.filter(row => row.advance_days === window)
        const windowMedian = median(windowRows.map(row => row.total_fare))
        return windowMedian == null ? null : { advance_days: window, median: windowMedian, count: windowRows.length }
      }).filter((point): point is ElasticityPoint => point != null)
    : []

  return <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 1180 }}>
    <header style={{ paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border-primary)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--gradient-brand)', color: '#fff' }}><BarChart2 size={20} /></div><div><div style={{ color: 'var(--color-brand-primary)', fontSize: 10, fontWeight: 800, letterSpacing: '.12em' }}>MARKET INSIGHTS</div><h1 className="text-title text-primary" style={{ margin: '2px 0 0' }}>Verified airfare trends across Indian corridors</h1></div></div><p className="text-body text-secondary" style={{ margin: '10px 0 0' }}>Only REAL, OFFICIAL and PUBLIC_INTERFACE (Google Flights public interface) observations are included. No sample trend data is shown.</p></header>
    <nav style={{ display: 'flex', overflowX: 'auto', borderBottom: '2px solid var(--color-border-primary)' }}>{TABS.map(item => <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ padding: '10px 20px', border: 0, borderBottom: `2px solid ${activeTab === item.id ? 'var(--color-brand-primary)' : 'transparent'}`, marginBottom: -2, color: activeTab === item.id ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)', fontWeight: activeTab === item.id ? 700 : 500, background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>{item.label}</button>)}</nav>

    {loading && <div style={{ ...card, color: 'var(--color-text-secondary)' }}>Loading verified fare observations…</div>}
    {!loading && activeTab === 'price' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}><div><h2 className="text-heading text-primary" style={{ margin: 0 }}>Price History</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Route medians by verified collection date — days with no observation break the line, they are never plotted as ₹0.</p></div><span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><span style={{ color: 'var(--color-brand-primary)', fontSize: 12, fontWeight: 700 }}>{historyDays.length} collection days</span>{newestAgeMinutes != null && <DataFreshness minutesAgo={newestAgeMinutes} />}</span></div><div style={{ overflowX: 'auto' }}>{faresFailed ? <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--color-warning)', background: 'var(--color-warning-bg)', borderRadius: 10 }}>Fare history could not be loaded. Please retry.</div> : <MultiLineChart series={series} labels={historyDays} />}</div><div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>{series.map(item => <span key={item.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: 12 }}><i style={{ width: 20, height: 3, background: item.color, borderRadius: 99 }} />{item.name}</span>)}</div><div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border-primary)', fontSize: 12, color: 'var(--color-text-secondary)' }}>Coverage: {faresFailed ? 'could not be loaded' : `${rows.length.toLocaleString('en-IN')} verified fare records across ${routeStats.length} routes`}.</div></section>}

    {!loading && activeTab === 'carriers' && <section style={card}><h2 className="text-heading text-primary" style={{ margin: 0 }}>Carrier Benchmarks</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Medians and coverage calculated from verified fare observations.</p>{carrierStats.length ? <div style={{ overflowX: 'auto', marginTop: 18 }}><table className="ap-table"><thead><tr>{['Carrier', 'Median fare', 'Verified records', 'Routes observed'].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{carrierStats.map(item => <tr key={item.airline}><td>{item.airline}</td><td>{fare(item.median)}</td><td>{item.count}</td><td>{item.routes}</td></tr>)}</tbody></table></div> : <p className="text-body text-secondary" style={{ marginTop: 18 }}>{faresFailed ? 'Carrier benchmarks could not be loaded. Please retry.' : 'No verified carrier records are available.'}</p>}</section>}

    {!loading && activeTab === 'routes' && <section style={card}><h2 className="text-heading text-primary" style={{ margin: 0 }}>Route Analysis</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Latest comparison uses the two most recent verified collections.</p>{routeStats.length ? <div style={{ display: 'grid', gap: 11, marginTop: 18 }}>{routeStats.map(item => { const change = item.movement?.change_pct; const rising = change != null && change > 0; return <div key={item.route} style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto auto', gap: 14, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--color-border-primary)', borderRadius: 10 }}><b>{item.route}</b><span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{item.count} verified records · {item.carriers} carriers</span><b>{fare(item.median)}</b><span style={{ color: change == null ? 'var(--color-text-tertiary)' : rising ? 'var(--color-danger)' : change < 0 ? 'var(--color-success)' : 'var(--color-info)', fontSize: 12, fontWeight: 800 }}>{change == null ? (movementFailed ? 'Movement could not be loaded' : 'Comparison pending') : <>{rising ? <TrendingUp size={14} style={{ verticalAlign: 'middle' }} /> : <TrendingDown size={14} style={{ verticalAlign: 'middle' }} />} {change > 0 ? '+' : ''}{change.toFixed(2)}%</>}</span></div> })}</div> : <p className="text-body text-secondary" style={{ marginTop: 18 }}>{faresFailed ? 'Route analysis could not be loaded. Please retry.' : 'No verified routes are available.'}</p>}
    {routeStats.length > 0 && elasticityRouteStat && <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--color-border-primary)' }}><h3 className="text-heading text-primary" style={{ margin: 0 }}>Lead-Time Elasticity</h3><p className="text-body text-secondary" style={{ marginTop: 3 }}>How the median stored fare for one corridor varies with advance-purchase window.</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>{routeStats.slice(0, 6).map(item => <button key={item.route} onClick={() => setElasticityRoute(item.route)} style={{ border: '1px solid var(--color-border-primary)', borderRadius: 8, padding: '6px 10px', background: elasticityRouteStat.route === item.route ? 'var(--color-brand-primary)' : 'var(--color-surface-secondary)', color: elasticityRouteStat.route === item.route ? 'white' : 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{item.route}</button>)}</div><ElasticityChart route={elasticityRouteStat.route} from={elasticityRouteStat.route.split('-')[0] ?? elasticityRouteStat.route} to={elasticityRouteStat.route.split('-')[1] ?? ''} points={elasticityPoints} width={560} height={220} /></div>}</section>}

    {!loading && activeTab === 'anomalies' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}><div><h2 className="text-heading text-primary" style={{ margin: 0 }}>Verified Anomalies</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Outlier analysis is calculated from verified fare observations only.</p></div><span style={{ alignSelf: 'flex-start', padding: '5px 9px', borderRadius: 99, background: anomalies?.status === 'ACTIVE' ? 'var(--color-success-bg)' : 'var(--color-surface-secondary)', color: anomalies?.status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-text-secondary)', fontSize: 10, fontWeight: 800 }}>{!token ? 'SIGN IN REQUIRED' : anomaliesFailed ? 'COULD NOT LOAD' : anomalies?.status === 'ACTIVE' ? 'ANALYSIS ACTIVE' : 'ANALYSIS PENDING'}</span></div>{!token ? <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)', fontSize: 12 }}>Sign in to view verified anomaly analysis.</div> : anomaliesFailed ? <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: '1px solid rgba(217,119,6,0.35)', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: 12 }}>Anomaly analysis could not be loaded. Please retry.</div> : anomalies?.anomalies?.length ? <div style={{ overflowX: 'auto', marginTop: 18 }}><table className="ap-table"><thead><tr>{['Route', 'Airline', 'Fare', 'Collected'].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{anomalies.anomalies.map(item => <tr key={item.observation_id}><td>{item.route}</td><td>{item.airline}</td><td>{fare(item.total_fare)}</td><td>{formatDateTimeIST(item.collected_at)}</td></tr>)}</tbody></table></div> : <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}><div style={{ display: 'flex', gap: 9, alignItems: 'center', color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13 }}><AlertTriangle size={17} color="var(--color-success)" />No verified price outliers detected</div><p style={{ margin: '7px 0 0', color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>The detector examined {anomalies?.summary.total_observations?.toLocaleString('en-IN') ?? 'the available'} real observations using a z-score threshold of {anomalies?.threshold ?? 3}. A clean result is normal and does not mean the analysis failed.</p><div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, color: 'var(--color-text-tertiary)', fontSize: 11 }}><span>Flagged: {anomalies?.summary.flagged_anomalies ?? 0}</span><span>Flag rate: {anomalies?.summary.flag_rate_pct ?? 0}%</span><span>Minimum bucket: {anomalies?.min_sample ?? 10} observations</span></div></div>}</section>}
  </div>
}
