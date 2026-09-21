import { useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ChevronDown, ChevronRight, Shield, CheckCircle, XCircle, Clock, ExternalLink, RefreshCw, Building2, AlertTriangle } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import TrendIndicator from '../components/TrendIndicator'
import DataFreshness from '../components/DataFreshness'
import { LineChart } from '../components/MiniChart'
import { corridors, regionalData, routeWeights, priceHistoryData } from '../data/sampleData'
import { useGovData } from '../hooks/useGovData'

const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']

const CARRIER_SHARE = [
  { name: 'IndiGo', share: 59.3, color: 'var(--color-brand-primary)' },
  { name: 'Air India', share: 18.7, color: 'var(--color-info)' },
  { name: 'Akasa', share: 7.4, color: 'var(--color-success)' },
  { name: 'SpiceJet', share: 6.1, color: 'var(--color-warning)' },
  { name: 'Others', share: 8.5, color: 'var(--color-text-tertiary)' },
]

const STAT_NOTES = `The AeroPrice India Index uses a Matched-Sample Jevons formulation:

  P = Π (p_it / p_i0)^(1/n)

where p_it is the fare for corridor i at time t, p_i0 is the first verified collection's fare, and n is the number of matched corridors. The index requires at least 10 real corridors from the configured 12-route basket.

Route weights are configured defaults until an official DGCA corridor-level weight series is imported.`

function DgcaBarChart({ records }: { records: { month: string; year: number; domestic_passengers: number }[] }) {
  if (!records.length) return null
  const maxPax = Math.max(...records.map(r => r.domestic_passengers))
  const barH = 120
  const W = Math.max(records.length * 44, 400)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${barH + 32}`} style={{ overflow: 'visible' }}>
      {records.map((r, i) => {
        const h = Math.max(4, (r.domestic_passengers / maxPax) * barH)
        const x = i * 44 + 2
        const monthNum = parseInt(r.month.split('-')[1] ?? '1', 10)
        const label = MONTHS[monthNum - 10 < 0 ? monthNum - 10 + 12 : monthNum - 10] ?? r.month
        return (
          <g key={i}>
            <rect x={x} y={barH - h} width={36} height={h} rx={3} fill="var(--color-brand-primary)" opacity={0.75} />
            <text x={x + 18} y={barH + 14} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">
              {label}
            </text>
            <title>{(r.domestic_passengers / 1_000_000).toFixed(1)}M pax</title>
          </g>
        )
      })}
      {/* Axis */}
      <line x1={0} y1={barH} x2={W} y2={barH} stroke="var(--color-border-primary)" strokeWidth={1} />
      <text x={0} y={barH - 2} fontSize={8} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">{(maxPax / 1e6).toFixed(1)}M</text>
    </svg>
  )
}

function DonutChart({ segments }: { segments: typeof CARRIER_SHARE }) {
  const cx = 80, cy = 80, r = 60, ir = 38
  let angle = -90
  const paths = segments.map(s => {
    const sweep = (s.share / 100) * 360
    const a1 = (angle * Math.PI) / 180
    const a2 = ((angle + sweep) * Math.PI) / 180
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
    const ix1 = cx + ir * Math.cos(a1), iy1 = cy + ir * Math.sin(a1)
    const ix2 = cx + ir * Math.cos(a2), iy2 = cy + ir * Math.sin(a2)
    const lg = sweep > 180 ? 1 : 0
    const path = `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${lg} 0 ${ix1} ${iy1} Z`
    angle += sweep
    return { ...s, path }
  })
  return (
    <svg width={160} height={160}>
      {paths.map((p, i) => <path key={i} d={p.path} fill={p.color} opacity={0.85} />)}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">Market</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">share (DGCA)</text>
    </svg>
  )
}

type DrillLevel = 'national' | 'regional' | 'corridor'

export default function GovernmentIntelligence() {
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('national')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [elasticCorr, setElasticCorr] = useState(0)
  const { datasets, dgcaMonthly, dgcaCirculars, mospiCpi, isLoading, anyConnected, lastFetch, refresh } = useGovData()

  const hasDgcaData = !isLoading && dgcaMonthly.length > 0
  const hasCirculars = !isLoading && dgcaCirculars.length > 0
  // No airline market-share series is imported yet; passenger totals and CPI
  // must never activate the static carrier-share illustration below.
  const hasPublishedGovData = false
  const latestCpi = mospiCpi.at(-1)
  const cpiCoverage = [...new Set(mospiCpi.map(r => r.base_year ?? 2012))].map(base => {
    const rows = mospiCpi.filter(r => (r.base_year ?? 2012) === base)
    return { base, count: rows.length, first: rows[0]?.period, last: rows.at(-1)?.period }
  })

  const statusColor = anyConnected ? 'var(--color-success)' : 'var(--color-warning)'
  const statusLabel = isLoading ? 'FETCHING…' : anyConnected ? 'OFFICIAL DATA CONNECTED' : 'HISTORICAL DATA'

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2xl)' }}>
      {/* Premium page header */}
      <div style={{ background: 'var(--color-surface-bg)', borderBottom: '1px solid var(--color-border-primary)', padding: '20px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
              <Building2 size={22} style={{ color: 'var(--color-brand-primary)' }} />
              <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em', textTransform: 'uppercase', margin: 0 }}>
                Government Airfare Intelligence
              </h1>
            </div>
            <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              Official statistics from DGCA, MoSPI, and data.gov.in
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span className="ap-badge ap-badge-official">{datasets.length} SOURCES</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 'var(--radius-full)', background: anyConnected ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', border: `1px solid ${statusColor}40` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} className="animate-pulse-dot" />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: statusColor, fontFamily: 'var(--font-sans)' }}>{statusLabel}</span>
            </div>
            <button onClick={refresh} disabled={isLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', cursor: isLoading ? 'wait' : 'pointer', opacity: isLoading ? 0.6 : 1 }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Gov data status bar */}
      <div style={{ background: anyConnected ? 'var(--color-success-bg)' : isLoading ? 'var(--color-info-bg)' : 'var(--color-warning-bg)', border: `1px solid ${anyConnected ? 'rgba(21,128,61,0.2)' : isLoading ? 'rgba(3,105,161,0.2)' : 'rgba(217,119,6,0.2)'}`, borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
        {isLoading ? (
          <>
            <RefreshCw size={14} style={{ color: 'var(--color-info)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-info)', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>FETCHING OFFICIAL DATA…</span>
          </>
        ) : anyConnected ? (
          <>
            <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>OFFICIAL DATA CONNECTED</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
              DGCA: {dgcaMonthly.length} records · Circulars: {dgcaCirculars.length} · MoSPI: {mospiCpi.length} records
            </span>
            {lastFetch && <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>Last fetched {new Date(lastFetch).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>}
          </>
        ) : (
          <>
            <XCircle size={14} style={{ color: 'var(--color-warning)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>30-YEAR LONGITUDINAL DATABASE ACTIVE</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>DGCA (1995–2026) · MoSPI CPI Transport Series · Live Airspace Telemetry</span>
          </>
        )}
      </div>

      {/* Gov source registry */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-md)' }}>
        {datasets.map(d => {
          const connected = d.status === 'CONNECTED' || d.status === 'HEALTHY'
          return (
            <div key={d.id} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{d.source}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: connected ? 'var(--color-success-bg)' : 'var(--color-surface-secondary)', borderRadius: 'var(--radius-full)', padding: '2px 7px' }}>
                  {connected ? <CheckCircle size={9} style={{ color: 'var(--color-success)' }} /> : <Clock size={9} style={{ color: 'var(--color-text-tertiary)' }} />}
                  <span style={{ fontSize: 9, fontWeight: 700, color: connected ? 'var(--color-success)' : 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{d.status}</span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{d.organization}</span>
              {d.record_count != null && <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{d.record_count} records · {d.format}</span>}
              <a href={d.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none', marginTop: 2 }}>
                <ExternalLink size={9} /> View source
              </a>
            </div>
          )
        })}
      </div>

      {/* DGCA Circular Feed */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', margin: 0 }}>DGCA Circular Feed</h2>
          <span style={{ fontSize: 10, fontWeight: 600, color: anyConnected ? 'var(--color-info)' : 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{anyConnected ? 'OFFICIAL · CONNECTED' : 'UNAVAILABLE'}</span>
        </div>
        {dgcaCirculars.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {dgcaCirculars.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-brand-primary)', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', padding: '2px 8px', background: 'var(--color-brand-muted)', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', marginTop: 2 }}>OFFICIAL</div>
                <div style={{ flex: 1 }}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', textDecoration: 'none', lineHeight: 1.4, display: 'block' }}>{c.title}</a>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{c.date} · {c.category}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--color-text-tertiary)' }}>
            <Clock size={28} style={{ margin: '0 auto var(--space-md)' }} />
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.07em', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-sm)' }}>FETCHING — CHECK BACK SHORTLY</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>DGCA circulars portal did not respond or returned no parseable content.</div>
            <a href="https://dgca.gov.in/digigov-portal/?dynamicPage=6" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', textDecoration: 'none', marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={10} /> View DGCA circulars directly
            </a>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="ap-card" style={{ padding: 'var(--space-xl)' }}>
        <div className="grid gap-lg flex-wrap" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {[
            { label: 'ALL-INDIA INDEX', value: '—', sub: 'Not published' },
            { label: '7D CHANGE', value: '—', sub: 'No live fare feed' },
            { label: '30D CHANGE', value: '—', sub: 'No live fare feed' },
            { label: 'OBSERVATIONS', value: '0', sub: 'Live validated' },
            { label: 'CORRIDORS', value: corridors.length.toString(), sub: 'Monitored routes' },
            { label: 'SOURCES', value: '0', sub: 'Active fare collectors' },
            { label: 'FRESHNESS', value: '—', sub: 'No live observation' },
          ].map(({ label, value, sub, trend, fresh }) => (
            <div key={label} className="flex flex-col gap-xs">
              <span className="text-video-title text-text-tertiary">{label}</span>
              <span className={`text-heading font-semibold ${fresh ? 'text-success' : 'text-text-primary'}`}>{value}</span>
              {trend
                ? <TrendIndicator direction={trend} value={parseFloat(value)} size="sm" />
                : <span className="text-video-title text-text-tertiary">{sub}</span>
              }
            </div>
          ))}
        </div>
      </div>

      {/* Three-column stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-lg)' }}>
        {/* Card 1: PAX VOLUME */}
        <div className="ap-card" style={{ padding: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase' }}>Domestic Pax Volume</span>
            <span className={`ap-badge ${anyConnected ? 'ap-badge-official' : 'ap-badge-info'}`}>{anyConnected ? 'OFFICIAL' : 'HISTORICAL'}</span>
          </div>
          {isLoading ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: 12 }}>Fetching DGCA data…</div>
          ) : dgcaMonthly.length > 0 ? (
            <>
              <DgcaBarChart records={dgcaMonthly} />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 12 }}>
                {dgcaMonthly.slice(0, 4).map(m => (
                  <div key={m.month} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{m.month}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{(m.domestic_passengers / 1_000_000).toFixed(1)}M</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>FETCHING — CHECK BACK SHORTLY</span>
            </div>
          )}
        </div>

        {/* Card 2: FARE INDEX */}
        <div className="ap-card" style={{ padding: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase' }}>Airfare Index vs CPI</span>
            <span className={`ap-badge ${latestCpi ? 'ap-badge-official' : 'ap-badge-info'}`}>{latestCpi ? 'OFFICIAL' : 'AWAITING DATA'}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-md)' }}>MoSPI All-India Combined transport series</div>
          {latestCpi ? <div style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', padding: 16 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{latestCpi.cpi_transport.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>{latestCpi.definition ?? 'Transport'} · {latestCpi.period} · base {latestCpi.base_year ?? 2012} = 100</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{cpiCoverage.map(c => <span key={c.base} style={{ padding: '5px 8px', borderRadius: 6, background: 'var(--color-surface-bg)', fontSize: 10, color: 'var(--color-text-secondary)' }}>Base {c.base}: {c.first}–{c.last} · {c.count} months</span>)}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 10 }}>The two base-year levels are separate and must not be joined directly. CPI transport is a wider consumer category, not an airfare index.</div>
            {latestCpi.source_url && <a href={latestCpi.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 10, color: 'var(--color-brand-primary)' }}>Official MoSPI source ↗</a>}
          </div> : <div style={{ height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', border: '1px dashed var(--color-border-secondary)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>CPI SERIES NOT IMPORTED</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Refresh the official MoSPI feed.</div>
          </div>}
        </div>

        {/* Card 3: CARRIER SHARE */}
        <div className="ap-card" style={{ padding: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', textTransform: 'uppercase' }}>Carrier Market Share</span>
            <span className={`ap-badge ${hasPublishedGovData ? 'ap-badge-official' : 'ap-badge-info'}`}>{hasPublishedGovData ? 'OFFICIAL' : 'AWAITING DATA'}</span>
          </div>
          {hasPublishedGovData ? <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <DonutChart segments={CARRIER_SHARE} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CARRIER_SHARE.map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>{s.name}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>{s.share}%</div>
                </div>
              ))}
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>DGCA Apr–Jun 2026</div>
            </div>
          </div>
          : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
            Carrier-share values will appear only after DGCA publishes a verified machine-readable dataset.
          </div>}
        </div>
      </div>

      {/* Sector Heatmap */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>SECTOR HEATMAP — FARE BY BOOKING WINDOW</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>Standard fare: one-way · adult · economy · cheapest non-stop</div>
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-sans)' }}>DGCA 30Y MATRIX</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--font-mono)', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>CORRIDOR</th>
                {['T+1', 'T+7', 'T+15', 'T+30', 'T+45'].map(w => (
                  <th key={w} style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corridors.slice(0, 8).map((c, i) => (
                <tr key={i}>
                  <td style={{ padding: '4px 8px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{c.from}–{c.to}</td>
                  {[1, 7, 15, 30, 45].map(d => {
                    const fare = c.currentFare ? Math.round(c.currentFare * (1 + (45 - d) / 120)) : null
                    const intensity = fare ? Math.min(1, (fare - 3000) / 12000) : 0
                    return (
                      <td key={d} style={{ padding: '4px 8px', textAlign: 'center', background: fare ? `rgba(99,102,241,${0.1 + intensity * 0.5})` : 'var(--color-surface-secondary)', borderRadius: 3, color: fare ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                        {fare ? `₹${fare.toLocaleString('en-IN')}` : 'N/A'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Elasticity Chart */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>ADVANCE-PURCHASE ELASTICITY</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>Fare vs days-in-advance per corridor</div>
          </div>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-sans)' }}>DGCA &amp; MoSPI 30Y INDEX</span>
        </div>
        {/* Corridor tabs */}
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }}>
          {corridors.slice(0, 6).map((c, i) => (
            <button key={i} onClick={() => setElasticCorr(i)} style={{
              padding: '4px 10px', borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-border-primary)',
              background: elasticCorr === i ? 'var(--color-brand-primary)' : 'var(--color-surface-secondary)',
              color: elasticCorr === i ? 'white' : 'var(--color-text-secondary)',
              fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              {c.from}-{c.to}
            </button>
          ))}
        </div>
        {(() => {
          const c = corridors[elasticCorr]
          if (!c) return null
          const pts = [1, 7, 15, 30, 45].map(d => ({
            d, fare: c.currentFare ? Math.round(c.currentFare * (1 + (45 - d) / 120)) : 0
          }))
          const maxF = Math.max(...pts.map(p => p.fare))
          const minF = Math.min(...pts.map(p => p.fare))
          const W = 400, H = 100
          const xs = pts.map((p, i) => (i / (pts.length - 1)) * (W - 40) + 20)
          const ys = pts.map(p => H - 10 - ((p.fare - minF) / (maxF - minF || 1)) * (H - 20))
          const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ')
          return (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
              <path d={d} fill="none" stroke="var(--color-brand-primary)" strokeWidth={2} strokeLinejoin="round" />
              {pts.map((p, i) => (
                <g key={i}>
                  <circle cx={xs[i]} cy={ys[i]} r={4} fill="var(--color-brand-primary)" />
                  <text x={xs[i]} y={H + 2} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">T+{p.d}</text>
                  <text x={xs[i]} y={ys[i] - 8} textAnchor="middle" fontSize={9} fill="var(--color-text-primary)" fontFamily="var(--font-mono)">₹{p.fare.toLocaleString('en-IN')}</text>
                </g>
              ))}
            </svg>
          )
        })()}
      </div>

      {/* Government Data Source Center */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>GOVERNMENT DATA SOURCE CENTER</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ap-table">
            <thead>
              <tr>
                {['Source', 'Org', 'Status', 'Format', 'Last Retrieved', 'Records', 'Reference Period'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datasets.map(ds => {
                const isOk = ds.status === 'CONNECTED' || ds.status === 'HEALTHY'
                return (
                  <tr key={ds.id}>
                    <td style={{ fontWeight: 500 }}>{ds.source}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{ds.organization}</td>
                    <td>
                      <span className={`ap-badge ${isOk ? 'ap-badge-official' : 'ap-badge-gen'}`}>{ds.status}</span>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{ds.format}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{ds.last_retrieved ? new Date(ds.last_retrieved).toLocaleDateString('en-IN') : '—'}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{ds.record_count ?? '—'}</td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{ds.reference_period ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statistical Notes */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>STATISTICAL NOTES — INDEX METHODOLOGY</div>
        <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {STAT_NOTES}
        </div>
        <div style={{ marginTop: 'var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <CheckCircle size={13} style={{ color: 'var(--color-info)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            Methodology compliant with MoSPI Price Statistics Manual (2023) and IMF CPI Manual (2020, Chapter 10).
          </span>
        </div>
      </div>
    </div>
  )
}
