import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useGovData } from '../hooks/useGovData'
import { apiFareSummary, apiIndexCurrent, apiRouteBasket, type IndexResponse, type RouteBasketItem } from '../services/api'

const WINDOWS = [1, 7, 15, 30, 45]

type FareWindow = {
  median?: number
  count?: number
  data_origin?: string
}

type FareSummary = {
  route: string
  status: string
  overall?: {
    median?: number
    count?: number
    sample_period?: string
    last_collected_at?: string
    data_origin?: string
  }
  windows?: Record<string, FareWindow>
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
}

function formatMonth(value?: string) {
  if (!value) return '—'
  const date = new Date(`${value}-01T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ minHeight: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
      <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ fontSize: 11, maxWidth: 360 }}>{detail}</div>
    </div>
  )
}

function Panel({ title, eyebrow, right, children }: { title: string; eyebrow?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ap-card" style={{ padding: 'var(--space-xl)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 'var(--space-lg)' }}>
        <div>
          {eyebrow && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{eyebrow}</div>}
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function DgcaBarChart({ records }: { records: { month: string; domestic_passengers: number }[] }) {
  if (!records.length) return null
  const ordered = [...records].sort((a, b) => a.month.localeCompare(b.month)).slice(-8)
  const maxPax = Math.max(...ordered.map(r => r.domestic_passengers), 1)
  const barH = 110
  const width = Math.max(ordered.length * 50, 360)

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${barH + 34}`} style={{ overflow: 'visible' }}>
      {ordered.map((record, index) => {
        const height = Math.max(4, (record.domestic_passengers / maxPax) * barH)
        const x = index * 50 + 8
        return (
          <g key={`${record.month}-${index}`}>
            <rect x={x} y={barH - height} width={34} height={height} rx={5} fill="var(--color-brand-primary)" opacity={0.78} />
            <text x={x + 17} y={barH + 16} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)">
              {formatMonth(record.month)}
            </text>
            <title>{(record.domestic_passengers / 1_000_000).toFixed(1)}M passengers</title>
          </g>
        )
      })}
      <line x1={0} y1={barH} x2={width} y2={barH} stroke="var(--color-border-primary)" strokeWidth={1} />
    </svg>
  )
}

function badgeClass(ok: boolean) {
  return ok ? 'ap-badge ap-badge-official' : 'ap-badge ap-badge-info'
}

export default function GovernmentIntelligence() {
  const { token } = useAuth()
  const { datasets, dgcaMonthly, dgcaCirculars, mospiCpi, ppacAtf, dataGovAviationCount, isLoading, anyConnected, lastFetch, refresh } = useGovData()
  const [indexStatus, setIndexStatus] = useState<IndexResponse | null>(null)
  const [routes, setRoutes] = useState<RouteBasketItem[]>([])
  const [summaries, setSummaries] = useState<FareSummary[]>([])
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
  const [fareLoading, setFareLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadFareContext() {
      setFareLoading(true)
      try {
        const [indexResponse, basketResponse] = await Promise.all([
          apiIndexCurrent(token ?? undefined).catch(() => null),
          apiRouteBasket(token ?? undefined).catch(() => null),
        ])
        if (cancelled) return
        setIndexStatus(indexResponse)
        const basketRoutes = basketResponse?.routes ?? []
        setRoutes(basketRoutes)
        const candidates = basketRoutes.filter(route => route.has_data).slice(0, 8)
        const loaded = await Promise.allSettled(candidates.map(route => apiFareSummary(route.route, token ?? undefined) as Promise<FareSummary>))
        if (cancelled) return
        const clean = loaded
          .filter((result): result is PromiseFulfilledResult<FareSummary> => result.status === 'fulfilled')
          .map(result => result.value)
          .filter(summary => summary?.status !== 'NO_DATA')
        setSummaries(clean)
        setSelectedRoute(current => current && clean.some(summary => summary.route === current) ? current : clean[0]?.route ?? null)
      } finally {
        if (!cancelled) setFareLoading(false)
      }
    }
    void loadFareContext()
    return () => { cancelled = true }
  }, [token])

  const latestCpi = useMemo(() => {
    return [...mospiCpi]
      .filter(record => Number.isFinite(Number(record.cpi_transport)))
      .sort((a, b) => Number(b.base_year ?? 0) - Number(a.base_year ?? 0) || String(b.period).localeCompare(String(a.period)))[0]
  }, [mospiCpi])

  const latestPpac = useMemo(() => {
    return [...ppacAtf].sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)))[0]
  }, [ppacAtf])

  const officialRecordCount = dgcaMonthly.length + dgcaCirculars.length + mospiCpi.length + ppacAtf.length + dataGovAviationCount
  const selectedSummary = summaries.find(summary => summary.route === selectedRoute) ?? summaries[0]
  const realFareValues = summaries.flatMap(summary => WINDOWS.map(day => summary.windows?.[`T+${day}`]?.median).filter((value): value is number => Number.isFinite(Number(value))))
  const minFare = realFareValues.length ? Math.min(...realFareValues) : 0
  const maxFare = realFareValues.length ? Math.max(...realFareValues) : 1
  const liveSourceCount = datasets.filter(dataset => ['CONNECTED', 'HEALTHY'].includes(dataset.status)).length
  const statusColor = anyConnected ? 'var(--color-success)' : 'var(--color-warning)'
  const statusLabel = isLoading ? 'FETCHING GOVERNMENT SOURCES' : anyConnected ? 'SOME SOURCES RESPONDING' : 'NO GOVERNMENT SOURCE RESPONSE'
  const indexPublished = indexStatus?.status === 'PUBLISHED' || indexStatus?.status === 'CALCULATED'
  const routeCoverageTotal = indexStatus?.route_count ?? routes.length

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2xl)' }}>
      <div className="ap-card" style={{ padding: 'var(--space-2xl)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Building2 size={22} style={{ color: 'var(--color-brand-primary)' }} />
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>Government Airfare Intelligence</h1>
          </div>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Official-source records are shown separately from AeroPrice fare observations. Missing feeds stay marked unavailable.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="ap-badge ap-badge-official">{liveSourceCount}/{datasets.length} SOURCES RESPONDING</span>
          <button onClick={refresh} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', cursor: isLoading ? 'wait' : 'pointer' }}>
            <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ background: anyConnected ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', border: `1px solid ${statusColor}40`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-xl)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {anyConnected ? <CheckCircle size={15} style={{ color: statusColor }} /> : <XCircle size={15} style={{ color: statusColor }} />}
        <span style={{ fontSize: 12, fontWeight: 800, color: statusColor, letterSpacing: '0.05em' }}>{statusLabel}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          DGCA monthly {dgcaMonthly.length} · DGCA circulars {dgcaCirculars.length} · MoSPI CPI {mospiCpi.length} · PPAC ATF {ppacAtf.length}
        </span>
        {lastFetch && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Checked {formatDate(lastFetch)}</span>}
      </div>

      <div className="ap-card" style={{ padding: 'var(--space-xl)' }}>
        <div className="grid gap-lg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          {[
            { label: 'AIRFARE INDEX', value: indexPublished && indexStatus?.index_value != null ? indexStatus.index_value.toFixed(2) : '—', sub: indexPublished ? indexStatus?.method ?? 'Backend published' : indexStatus?.message ?? 'Not published' },
            { label: 'ROUTE COVERAGE', value: `${indexStatus?.covered_routes_count ?? routes.filter(route => route.has_data).length}/${routeCoverageTotal || '—'}`, sub: `Requires ${indexStatus?.required_routes ?? indexStatus?.required ?? 10} routes` },
            { label: 'REAL FARES', value: (indexStatus?.real_observations ?? summaries.reduce((sum, summary) => sum + Number(summary.overall?.count ?? 0), 0)).toLocaleString('en-IN'), sub: 'Stored observations' },
            { label: 'GOV RECORDS', value: officialRecordCount.toLocaleString('en-IN'), sub: 'Rows returned' },
            { label: 'CPI TRANSPORT', value: latestCpi ? latestCpi.cpi_transport.toFixed(2) : '—', sub: latestCpi ? `${latestCpi.period}, base ${latestCpi.base_year ?? '—'}` : 'Not imported' },
            { label: 'PPAC ATF', value: latestPpac ? `₹${Number(latestPpac.atf_export_duty_per_litre).toFixed(2)}` : '—', sub: latestPpac ? 'Export duty/litre' : 'Not imported' },
          ].map(item => (
            <div key={item.label} className="flex flex-col gap-xs">
              <span className="text-video-title text-text-tertiary">{item.label}</span>
              <span className="text-heading font-semibold text-text-primary">{item.value}</span>
              <span className="text-video-title text-text-tertiary">{item.sub}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-lg)' }}>
        <Panel title="Route Fare Matrix" eyebrow="BACKEND VERIFIED FARE OBSERVATIONS" right={<span className={badgeClass(Boolean(summaries.length))}>{fareLoading ? 'LOADING' : summaries.length ? 'REAL STORED FARES' : 'NO DATA'}</span>}>
          {summaries.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="ap-table" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th>Route</th>
                    {WINDOWS.map(day => <th key={day}>T+{day}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {summaries.map(summary => (
                    <tr key={summary.route}>
                      <td style={{ fontWeight: 800 }}>{summary.route}</td>
                      {WINDOWS.map(day => {
                        const win = summary.windows?.[`T+${day}`]
                        const fare = win?.median
                        const intensity = fare ? (fare - minFare) / Math.max(1, maxFare - minFare) : 0
                        return (
                          <td key={day} style={{ background: fare ? `rgba(37,99,235,${0.08 + intensity * 0.24})` : undefined }}>
                            {fare ? `₹${fare.toLocaleString('en-IN')}` : '—'}
                            {win?.count ? <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>{win.count} obs</div> : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="NO VERIFIED FARE MATRIX" detail="The backend has not returned fare summaries for the current basket routes." />
          )}
        </Panel>

        <Panel title="Booking Window Profile" eyebrow={selectedSummary ? selectedSummary.route : 'NO ROUTE SELECTED'} right={<span className={badgeClass(Boolean(selectedSummary))}>{selectedSummary?.overall?.data_origin ?? 'UNAVAILABLE'}</span>}>
          {selectedSummary ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {summaries.map(summary => (
                  <button key={summary.route} onClick={() => setSelectedRoute(summary.route)} style={{ border: '1px solid var(--color-border-primary)', borderRadius: 8, padding: '6px 10px', background: selectedSummary.route === summary.route ? 'var(--color-brand-primary)' : 'var(--color-surface-secondary)', color: selectedSummary.route === summary.route ? 'white' : 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {summary.route}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {WINDOWS.map(day => {
                  const win = selectedSummary.windows?.[`T+${day}`]
                  const fare = win?.median
                  return (
                    <div key={day} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 90px', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-secondary)' }}>T+{day}</span>
                      <div style={{ height: 9, borderRadius: 999, background: 'var(--color-surface-secondary)', overflow: 'hidden' }}>
                        <div style={{ width: fare ? `${Math.max(8, ((fare - minFare) / Math.max(1, maxFare - minFare)) * 100)}%` : 0, height: '100%', background: 'var(--color-brand-primary)' }} />
                      </div>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 800, textAlign: 'right' }}>{fare ? `₹${fare.toLocaleString('en-IN')}` : '—'}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 14, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                Latest sample: {formatDate(selectedSummary.overall?.last_collected_at)}. These are stored verified observations, not live quotes.
              </div>
            </>
          ) : (
            <EmptyState title="NO WINDOW PROFILE" detail="Booking-window medians appear after verified route observations are available." />
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-lg)' }}>
        <Panel title="DGCA Passenger Volume" eyebrow="OFFICIAL MONTHLY FEED" right={<span className={badgeClass(Boolean(dgcaMonthly.length))}>{dgcaMonthly.length ? 'OFFICIAL' : 'UNAVAILABLE'}</span>}>
          {dgcaMonthly.length ? <DgcaBarChart records={dgcaMonthly} /> : <EmptyState title="DGCA MONTHLY NOT IMPORTED" detail="No DGCA monthly passenger records were returned by the backend." />}
        </Panel>

        <Panel title="MoSPI CPI Transport" eyebrow="OFFICIAL CPI SERIES" right={<span className={badgeClass(Boolean(latestCpi))}>{latestCpi ? 'OFFICIAL' : 'UNAVAILABLE'}</span>}>
          {latestCpi ? (
            <div>
              <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 900, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{latestCpi.cpi_transport.toFixed(2)}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>{latestCpi.definition ?? 'Transport'} · {latestCpi.period} · base {latestCpi.base_year ?? '—'} = 100</div>
              {latestCpi.source_url && <a href={latestCpi.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 11, color: 'var(--color-brand-primary)', textDecoration: 'none' }}><ExternalLink size={11} /> Official source</a>}
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--color-text-tertiary)' }}>This is transport CPI, not an airfare-only index.</div>
            </div>
          ) : <EmptyState title="CPI NOT IMPORTED" detail="The backend did not return a MoSPI transport CPI record." />}
        </Panel>

        <Panel title="PPAC ATF Duty" eyebrow="OFFICIAL FUEL DUTY SERIES" right={<span className={badgeClass(Boolean(latestPpac))}>{latestPpac ? 'OFFICIAL' : 'UNAVAILABLE'}</span>}>
          {latestPpac ? (
            <div>
              <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 900, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>₹{Number(latestPpac.atf_export_duty_per_litre).toFixed(2)}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>ATF export duty per litre · {formatDate(latestPpac.effective_date)}</div>
              <div style={{ marginTop: 10, fontSize: 10, color: 'var(--color-text-tertiary)' }}>This is a fuel-duty indicator and is not displayed as a ticket fare.</div>
            </div>
          ) : <EmptyState title="PPAC DATA NOT IMPORTED" detail="No ATF duty records were returned by the backend." />}
        </Panel>
      </div>

      <Panel title="DGCA Circular Feed" eyebrow="REGULATORY RECORDS" right={<span className={badgeClass(Boolean(dgcaCirculars.length))}>{dgcaCirculars.length ? 'OFFICIAL' : 'UNAVAILABLE'}</span>}>
        {dgcaCirculars.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {dgcaCirculars.slice(0, 6).map((circular, index) => (
              <div key={circular.id ?? circular.circular_id ?? index} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--color-surface-secondary)', borderRadius: 8 }}>
                <span className="ap-badge ap-badge-official">DGCA</span>
                <div style={{ flex: 1 }}>
                  <a href={circular.url ?? circular.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-primary)', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>{circular.title}</a>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{circular.date ?? circular.issued_date ?? '—'} · {circular.category}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="NO DGCA CIRCULARS IMPORTED" detail="The backend registry may know the source, but no circular rows are available for display." />
        )}
      </Panel>

      <Panel title="Government Data Source Center" eyebrow="BACKEND REGISTRY">
        <div style={{ overflowX: 'auto' }}>
          <table className="ap-table">
            <thead>
              <tr>
                {['Source', 'Org', 'Status', 'Format', 'Last Retrieved', 'Records', 'Reference Period'].map(header => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {datasets.map(dataset => {
                const ok = ['CONNECTED', 'HEALTHY'].includes(dataset.status)
                return (
                  <tr key={dataset.id}>
                    <td style={{ fontWeight: 700 }}>{dataset.source}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{dataset.organization}</td>
                    <td><span className={badgeClass(ok)}>{dataset.status}</span></td>
                    <td style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{dataset.format}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{formatDate(dataset.last_retrieved)}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{dataset.record_count ?? '—'}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{dataset.reference_period ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Index Methodology" eyebrow="AEROPRICE BACKEND">
        <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 8, padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          The current index endpoint reports status, route coverage, required route count, real observation count, method, and base period. This page displays the published index only when that endpoint returns a calculated or published value. It does not claim MoSPI/IMF compliance and does not use static carrier-share or fare fixtures.
        </div>
      </Panel>
    </div>
  )
}
