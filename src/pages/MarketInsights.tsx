import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart2, TrendingDown, TrendingUp } from 'lucide-react'
import { apiAnomalies, apiFareMovement, apiFares, type AnomalyResponse, type FareMovementResponse, type FareObservationApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

type TabId = 'price' | 'carriers' | 'routes' | 'anomalies'
const TABS: { id: TabId; label: string }[] = [
  { id: 'price', label: 'Price History' }, { id: 'carriers', label: 'Carrier Benchmarks' }, { id: 'routes', label: 'Route Analysis' }, { id: 'anomalies', label: 'Anomalies' },
]
const card: React.CSSProperties = { background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function fare(value: number | null) { return value == null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` }

function MultiLineChart({ series, labels }: { series: Array<{ name: string; data: number[]; color: string }>; labels: string[] }) {
  if (labels.length < 2 || !series.length) return <div style={{ minHeight: 220, display: 'grid', placeItems: 'center', color: 'var(--color-text-tertiary)', background: 'var(--color-surface-secondary)', borderRadius: 10 }}>Two verified collection days are required for a chart.</div>
  const width = 720, height = 235, pad = { top: 18, right: 18, bottom: 34, left: 52 }
  const values = series.flatMap(item => item.data).filter(value => Number.isFinite(value))
  const min = Math.min(...values) * .98, max = Math.max(...values) * 1.02, range = Math.max(1, max - min)
  const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom
  const x = (index: number) => pad.left + index / Math.max(1, labels.length - 1) * plotWidth
  const y = (value: number) => pad.top + plotHeight - (value - min) / range * plotHeight
  return <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 520, display: 'block' }} role="img" aria-label="Verified fare history">{[0, .33, .66, 1].map(ratio => { const value = min + range * ratio; return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="var(--color-border-primary)" /><text x={pad.left - 8} y={y(value) + 4} textAnchor="end" fill="var(--color-text-tertiary)" fontSize="10">{Math.round(value).toLocaleString('en-IN')}</text></g> })}{series.map(item => <polyline key={item.name} points={item.data.map((value, index) => `${x(index)},${y(value)}`).join(' ')} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}{labels.map((label, index) => <text key={label} x={x(index)} y={height - 8} textAnchor="middle" fill="var(--color-text-tertiary)" fontSize="10">{label.slice(5)}</text>)}</svg>
}

export default function MarketInsights() {
  const { token } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('price')
  const [rows, setRows] = useState<FareObservationApi[]>([])
  const [movement, setMovement] = useState<FareMovementResponse | null>(null)
  const [anomalies, setAnomalies] = useState<AnomalyResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    Promise.allSettled([apiFares({ limit: 600 }, token ?? undefined), apiFareMovement(token ?? undefined), apiAnomalies(token ?? undefined)]).then(([fares, fareMovement, anomalyData]) => {
      if (!active) return
      if (fares.status === 'fulfilled') setRows(fares.value.observations.filter(row => row.data_origin === 'REAL' || row.data_origin === 'OFFICIAL'))
      if (fareMovement.status === 'fulfilled') setMovement(fareMovement.value)
      if (anomalyData.status === 'fulfilled') setAnomalies(anomalyData.value)
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
  const historyDays = [...new Set(historyRoutes.flatMap(item => item.rows.map(row => row.collected_at.slice(0, 10))))].sort()
  const series = historyRoutes.map((item, index) => ({ name: item.route, color: ['#2563eb', '#7c3aed', '#0891b2'][index], data: historyDays.map(day => median(item.rows.filter(row => row.collected_at.startsWith(day)).map(row => row.total_fare)) ?? 0) }))

  return <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 1180 }}>
    <header style={{ paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border-primary)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--gradient-brand)', color: '#fff' }}><BarChart2 size={20} /></div><div><div style={{ color: 'var(--color-brand-primary)', fontSize: 10, fontWeight: 800, letterSpacing: '.12em' }}>MARKET INSIGHTS</div><h1 className="text-title text-primary" style={{ margin: '2px 0 0' }}>Verified airfare trends across Indian corridors</h1></div></div><p className="text-body text-secondary" style={{ margin: '10px 0 0' }}>Only REAL and OFFICIAL observations are included. No sample trend data is shown.</p></header>
    <nav style={{ display: 'flex', overflowX: 'auto', borderBottom: '2px solid var(--color-border-primary)' }}>{TABS.map(item => <button key={item.id} onClick={() => setActiveTab(item.id)} style={{ padding: '10px 20px', border: 0, borderBottom: `2px solid ${activeTab === item.id ? 'var(--color-brand-primary)' : 'transparent'}`, marginBottom: -2, color: activeTab === item.id ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)', fontWeight: activeTab === item.id ? 700 : 500, background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}>{item.label}</button>)}</nav>

    {loading && <div style={{ ...card, color: 'var(--color-text-secondary)' }}>Loading verified fare observations…</div>}
    {!loading && activeTab === 'price' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}><div><h2 className="text-heading text-primary" style={{ margin: 0 }}>Price History</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Route medians by verified collection date</p></div><span style={{ color: 'var(--color-brand-primary)', fontSize: 12, fontWeight: 700 }}>{historyDays.length} collection days</span></div><div style={{ overflowX: 'auto' }}><MultiLineChart series={series} labels={historyDays} /></div><div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>{series.map(item => <span key={item.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontSize: 12 }}><i style={{ width: 20, height: 3, background: item.color, borderRadius: 99 }} />{item.name}</span>)}</div><div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border-primary)', fontSize: 12, color: 'var(--color-text-secondary)' }}>Coverage: {rows.length.toLocaleString('en-IN')} verified fare records across {routeStats.length} routes.</div></section>}

    {!loading && activeTab === 'carriers' && <section style={card}><h2 className="text-heading text-primary" style={{ margin: 0 }}>Carrier Benchmarks</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Medians and coverage calculated from verified fare observations.</p>{carrierStats.length ? <div style={{ overflowX: 'auto', marginTop: 18 }}><table className="ap-table"><thead><tr>{['Carrier', 'Median fare', 'Verified records', 'Routes observed'].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{carrierStats.map(item => <tr key={item.airline}><td>{item.airline}</td><td>{fare(item.median)}</td><td>{item.count}</td><td>{item.routes}</td></tr>)}</tbody></table></div> : <p className="text-body text-secondary" style={{ marginTop: 18 }}>No verified carrier records are available.</p>}</section>}

    {!loading && activeTab === 'routes' && <section style={card}><h2 className="text-heading text-primary" style={{ margin: 0 }}>Route Analysis</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Latest comparison uses the two most recent verified collections.</p>{routeStats.length ? <div style={{ display: 'grid', gap: 11, marginTop: 18 }}>{routeStats.map(item => { const change = item.movement?.change_pct; const rising = change != null && change > 0; return <div key={item.route} style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto auto', gap: 14, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--color-border-primary)', borderRadius: 10 }}><b>{item.route}</b><span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{item.count} verified records · {item.carriers} carriers</span><b>{fare(item.median)}</b><span style={{ color: change == null ? 'var(--color-text-tertiary)' : rising ? 'var(--color-danger)' : change < 0 ? 'var(--color-success)' : 'var(--color-info)', fontSize: 12, fontWeight: 800 }}>{change == null ? 'Comparison pending' : <>{rising ? <TrendingUp size={14} style={{ verticalAlign: 'middle' }} /> : <TrendingDown size={14} style={{ verticalAlign: 'middle' }} />} {change > 0 ? '+' : ''}{change.toFixed(2)}%</>}</span></div> })}</div> : <p className="text-body text-secondary" style={{ marginTop: 18 }}>No verified routes are available.</p>}</section>}

    {!loading && activeTab === 'anomalies' && <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}><div><h2 className="text-heading text-primary" style={{ margin: 0 }}>Verified Anomalies</h2><p className="text-body text-secondary" style={{ marginTop: 3 }}>Outlier analysis is calculated from verified fare observations only.</p></div><span style={{ alignSelf: 'flex-start', padding: '5px 9px', borderRadius: 99, background: anomalies?.status === 'ACTIVE' ? 'var(--color-success-bg)' : 'var(--color-surface-secondary)', color: anomalies?.status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-text-secondary)', fontSize: 10, fontWeight: 800 }}>{anomalies?.status === 'ACTIVE' ? 'ANALYSIS ACTIVE' : 'ANALYSIS PENDING'}</span></div>{anomalies?.anomalies?.length ? <div style={{ overflowX: 'auto', marginTop: 18 }}><table className="ap-table"><thead><tr>{['Route', 'Airline', 'Fare', 'Collected'].map(item => <th key={item}>{item}</th>)}</tr></thead><tbody>{anomalies.anomalies.map(item => <tr key={item.observation_id}><td>{item.route}</td><td>{item.airline}</td><td>{fare(item.total_fare)}</td><td>{item.collected_at.slice(0, 16).replace('T', ' ')}</td></tr>)}</tbody></table></div> : <div style={{ marginTop: 18, padding: 16, borderRadius: 11, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}><div style={{ display: 'flex', gap: 9, alignItems: 'center', color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 13 }}><AlertTriangle size={17} color="var(--color-success)" />No verified price outliers detected</div><p style={{ margin: '7px 0 0', color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>The detector examined {anomalies?.summary.total_observations?.toLocaleString('en-IN') ?? 'the available'} real observations using a z-score threshold of {anomalies?.threshold ?? 3}. A clean result is normal and does not mean the analysis failed.</p><div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, color: 'var(--color-text-tertiary)', fontSize: 11 }}><span>Flagged: {anomalies?.summary.flagged_anomalies ?? 0}</span><span>Flag rate: {anomalies?.summary.flag_rate_pct ?? 0}%</span><span>Minimum bucket: {anomalies?.min_sample ?? 10} observations</span></div></div>}</section>}
  </div>
}
