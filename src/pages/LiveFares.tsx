import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw, Filter, Download, CheckCircle, Clock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import {
  apiFares, isBackendAvailable,
  type FareObservationApi,
} from '../services/api'

const PIPELINE_STAGES = ['Acquisition', 'ETL & Validation', 'Jevons Index', 'CPI Augmentation']

const AIRFARE_SOURCES = [
  { name: 'IndiGo', code: 'IGO', status: 'CHALLENGE_DETECTED', reason: 'Cloudflare bot protection' },
  { name: 'Air India', code: 'AIC', status: 'CHALLENGE_DETECTED', reason: 'Anti-scrape middleware' },
  { name: 'Air India Express', code: 'IAX', status: 'CHALLENGE_DETECTED', reason: 'Shared CDN protection' },
  { name: 'Akasa Air', code: 'QP', status: 'CHALLENGE_DETECTED', reason: 'JS-rendered SPA + CAPTCHA' },
  { name: 'SpiceJet', code: 'SG', status: 'CHALLENGE_DETECTED', reason: 'Cloudflare + fingerprinting' },
  { name: 'Amadeus API', code: 'AMD', status: 'AGGREGATOR', reason: 'Authorized B2B aggregator — configure AMADEUS_API_KEY' },
]

const ORIGINS = ['ALL', 'DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'CCU']
const AIRLINES = ['ALL', 'IndiGo', 'Air India', 'Akasa Air', 'SpiceJet', 'Air India Express']
const WINDOWS = ['ALL', 'T+1', 'T+7', 'T+15', 'T+30', 'T+45']
const DATA_ORIGINS = ['ALL', 'REAL', 'SANDBOX_TEST', 'OFFICIAL']
const TABLE_COLS = ['Collected', 'Route', 'Airline', 'Travel Date', 'Window', 'Base', 'Taxes', 'Total', 'Source', 'Provenance', 'Flags']

const PAGE_SIZE = 50

function provenanceBadge(origin: string) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    REAL: { bg: 'var(--color-success-bg)', color: 'var(--color-success)', label: 'REAL' },
    SANDBOX_TEST: { bg: 'var(--color-info-bg)', color: 'var(--color-info)', label: 'SANDBOX' },
    OFFICIAL: { bg: '#e0f2fe', color: '#0369a1', label: 'OFFICIAL' },
    GENERATED_TEST: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)', label: 'GENERATED' },
  }
  const c = cfg[origin] ?? { bg: 'var(--color-surface-secondary)', color: 'var(--color-text-tertiary)', label: origin }
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', background: c.bg, color: c.color, padding: '2px 6px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>
      {c.label}
    </span>
  )
}

export default function LiveFares() {
  const [filterOrigin, setFilterOrigin] = useState('ALL')
  const [filterAirline, setFilterAirline] = useState('ALL')
  const [filterWindow, setFilterWindow] = useState('ALL')
  const [filterDataOrigin, setFilterDataOrigin] = useState('ALL')
  const [observations, setObservations] = useState<FareObservationApi[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [apiStatus, setApiStatus] = useState<string>('NO_LIVE_OBSERVATIONS')
  const [lastFetched, setLastFetched] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchFares = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const up = await isBackendAvailable()
      setBackendUp(up)
      if (!up) {
        setObservations([])
        setTotal(0)
        setApiStatus('BACKEND_UNAVAILABLE')
        return
      }

      const params: Parameters<typeof apiFares>[0] = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (filterOrigin !== 'ALL') params.origin = filterOrigin
      if (filterAirline !== 'ALL') params.destination = undefined  // airline filter not in API yet
      if (filterWindow !== 'ALL') {
        // convert T+7 → 7
        const days = parseInt(filterWindow.replace('T+', ''), 10)
        if (!isNaN(days)) (params as Record<string, unknown>)['advance_days'] = days
      }
      if (filterDataOrigin !== 'ALL') (params as Record<string, unknown>)['data_origin'] = filterDataOrigin

      const resp = await apiFares(params)
      // The API returns { observations, total, status, data_origin_summary, message }
      const raw = resp as unknown as {
        observations: FareObservationApi[]
        total: number
        status: string
        data_origin_summary: string
        message: string | null
      }

      setObservations(raw.observations ?? [])
      setTotal(raw.total ?? 0)
      setApiStatus(raw.status ?? 'UNKNOWN')
      setLastFetched(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
      setObservations([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, filterOrigin, filterWindow, filterDataOrigin])

  useEffect(() => {
    fetchFares()
  }, [fetchFares])

  const hasRealData = observations.some(o => o.data_origin === 'REAL')
  const hasSandboxData = observations.some(o => o.data_origin === 'SANDBOX_TEST')

  const pipelineStatus = hasRealData ? 'LIVE' : hasSandboxData ? 'SANDBOX_ACTIVE' : 'BLOCKED'

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-xl)' }}>

      {/* ── Dramatic dark-panel header ───────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-xl)',
        background: 'linear-gradient(135deg, var(--color-surface-dark) 0%, #0f172a 55%, #1e3a5f 100%)',
        padding: 'var(--space-3xl) var(--space-3xl)',
        marginBottom: 'var(--space-xs)',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        {/* Glow blob — top right */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 280, height: 280,
          background: 'var(--color-brand-primary)',
          borderRadius: '50%',
          opacity: 0.12,
          filter: 'blur(72px)',
          pointerEvents: 'none',
        }} />
        {/* Glow blob — bottom left */}
        <div style={{
          position: 'absolute', bottom: -80, left: -40,
          width: 220, height: 220,
          background: 'var(--color-info)',
          borderRadius: '50%',
          opacity: 0.10,
          filter: 'blur(64px)',
          pointerEvents: 'none',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-xl)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <span className="ap-badge ap-badge-live" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.09em' }}>LIVE FEED</span>
              <span className="ap-badge ap-badge-sandbox">JEVONS MATCHED-SAMPLE</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-display-size)', fontWeight: 700, color: 'var(--color-text-on-dark)', letterSpacing: '-0.01em', lineHeight: 1.15, margin: 0 }}>
              LIVE FARES
            </h1>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'rgba(255,255,255,0.52)', marginTop: 'var(--space-sm)', letterSpacing: '0.05em' }}>
              ONE-WAY · ADULT · ECONOMY · CHEAPEST AVAILABLE
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-sm)' }}>
            {lastFetched && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>
                Updated {lastFetched}
              </span>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <Button variant="neutral" iconStart={<Download size={14} />} onClick={() => {}}>Export CSV</Button>
              <Button variant="neutral" iconStart={<RefreshCw size={14} />} loading={loading} onClick={() => fetchFares()}>Refresh</Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pipeline banner ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-surface-bg)',
        border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg) var(--space-xl)',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        flexWrap: 'wrap',
        overflow: 'hidden',
      }}>
        {PIPELINE_STAGES.map((stage, i) => {
          const STAGE_ICONS = ['⬇', '⚙', '∑', '📈']
          const isActive = i === 0
          const stageColor = isActive
            ? pipelineStatus === 'LIVE' ? 'var(--color-success)'
            : pipelineStatus === 'SANDBOX_ACTIVE' ? 'var(--color-info)'
            : 'var(--color-warning)'
            : 'var(--color-text-tertiary)'
          const stageBg = isActive
            ? pipelineStatus === 'LIVE' ? 'var(--color-success-bg)'
            : pipelineStatus === 'SANDBOX_ACTIVE' ? 'var(--color-info-bg)'
            : 'var(--color-warning-bg)'
            : 'var(--color-surface-secondary)'
          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: '1 1 auto' }}>
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-xs)',
                padding: 'var(--space-md) var(--space-lg)',
                background: stageBg,
                borderRadius: i === 0 ? 'var(--radius-md) 0 0 var(--radius-md)' : i === PIPELINE_STAGES.length - 1 ? '0 var(--radius-md) var(--radius-md) 0' : 0,
                borderRight: i < PIPELINE_STAGES.length - 1 ? '1px solid var(--color-border-primary)' : 'none',
              }}>
                <span style={{ fontSize: 14 }}>{STAGE_ICONS[i]}</span>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stageColor, letterSpacing: '0.07em', textAlign: 'center' }}>
                  {stage.toUpperCase()}
                </span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-sans)', color: isActive ? stageColor : 'var(--color-text-tertiary)', fontWeight: isActive ? 700 : 400, letterSpacing: '0.05em' }}>
                  {isActive
                    ? pipelineStatus === 'LIVE' ? '● ACTIVE'
                    : pipelineStatus === 'SANDBOX_ACTIVE' ? '● SANDBOX'
                    : '⚠ BLOCKED'
                    : '○ READY'
                  }
                </span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 16, padding: '0 2px', zIndex: 1 }}>→</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Backend status */}
      {backendUp === false && (
        <div style={{ background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
            Backend not reachable — set <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 2 }}>VITE_API_URL</code> in <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 2 }}>.env.local</code> and restart the dev server.
          </span>
        </div>
      )}

      {/* Source status strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 'var(--space-sm)' }}>
        {AIRFARE_SOURCES.map(src => (
          <div key={src.code} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{src.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: src.status === 'AGGREGATOR' ? 'var(--color-info)' : 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>{src.code}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 4 }}>
              {src.status === 'AGGREGATOR'
                ? <CheckCircle size={10} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
                : <AlertTriangle size={10} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              }
              <span style={{ fontSize: 9, fontWeight: 700, color: src.status === 'AGGREGATOR' ? 'var(--color-info)' : 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>
                {src.status === 'AGGREGATOR' ? 'AUTHORIZED API' : 'CHALLENGE DETECTED'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{src.reason}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Filter size={13} style={{ color: 'var(--color-text-tertiary)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>FILTERS</span>
          </div>
          {[
            { label: 'ORIGIN', value: filterOrigin, set: setFilterOrigin, opts: ORIGINS },
            { label: 'WINDOW', value: filterWindow, set: setFilterWindow, opts: WINDOWS },
            { label: 'PROVENANCE', value: filterDataOrigin, set: setFilterDataOrigin, opts: DATA_ORIGINS },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{f.label}</span>
              <select
                value={f.value}
                onChange={e => { f.set(e.target.value); setPage(0) }}
                style={{ fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}
              >
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
            {total} total · page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="ap-table">
            <thead>
              <tr>
                {TABLE_COLS.map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={TABLE_COLS.length} style={{ padding: 'var(--space-3xl) var(--space-xl)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-sm)' }}>
                      <Clock size={16} style={{ color: 'var(--color-text-tertiary)', animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>Loading observations…</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && observations.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLS.length} style={{ padding: 'var(--space-4xl) var(--space-xl)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
                      {/* Large icon block */}
                      <div style={{
                        width: 80, height: 80, borderRadius: 'var(--radius-xl)',
                        background: 'var(--color-warning-bg)',
                        border: '2px solid var(--color-warning)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 32px rgba(217,119,6,0.15)',
                      }}>
                        <AlertTriangle size={36} style={{ color: 'var(--color-warning)' }} />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
                          {backendUp === false ? 'BACKEND UNAVAILABLE' : 'NO LIVE OBSERVATIONS'}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)', letterSpacing: '0.1em', marginBottom: 'var(--space-md)' }}>
                          {backendUp === false ? 'CONNECTION_FAILED' : error ? 'API_ERROR' : 'CHALLENGE DETECTED — ACQUISITION BLOCKED'}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 480, lineHeight: 1.65, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                          {backendUp === false
                            ? 'Connect the FastAPI backend (VITE_API_URL) to view real fare observations.'
                            : error
                              ? `API error: ${error}`
                              : 'All direct airline scrapers are blocked by Cloudflare and anti-bot middleware. Configure AMADEUS_API_KEY + AMADEUS_API_SECRET and trigger a collection run from Admin → Collection.'
                          }
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span className="ap-badge ap-badge-gen">0 REAL OBSERVATIONS</span>
                        <span className="ap-badge ap-badge-sandbox">AMADEUS: CONFIG REQUIRED</span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && observations.map((o, idx) => (
                <tr
                  key={o.observation_id}
                  style={{ opacity: o.data_origin === 'SANDBOX_TEST' ? 0.82 : 1, background: idx % 2 === 1 ? 'var(--color-surface-secondary)' : undefined }}
                >
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                    {o.collected_at ? new Date(o.collected_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, whiteSpace: 'nowrap' }}>{o.route}</td>
                  <td>{o.airline}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{o.travel_date}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>T+{o.advance_days}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>₹{o.base_fare?.toLocaleString('en-IN')}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }}>₹{o.taxes?.toLocaleString('en-IN')}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right', color: 'var(--color-text-primary)' }}>₹{o.total_fare?.toLocaleString('en-IN')}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{o.source}</td>
                  <td>{provenanceBadge(o.data_origin)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    {Array.isArray(o.quality_flags) && o.quality_flags.length > 0
                      ? o.quality_flags.join(', ')
                      : <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>OK</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / pagination */}
        <div style={{ padding: 'var(--space-md) var(--space-xl)', borderTop: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            {observations.length} of {total} observations
            {hasSandboxData && !hasRealData && <span style={{ marginLeft: 8, color: 'var(--color-info)', fontWeight: 600 }}>· SANDBOX_TEST only — not production data</span>}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <Button variant="subtle" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</Button>
            <Button variant="subtle" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>Next →</Button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Jevons matched-sample · One-way · Economy · Cheapest available</span>
        </div>
      </div>

      {/* Info box */}
      {hasSandboxData && !hasRealData && (
        <div style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(3,105,161,0.2)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-xl)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-info)', marginBottom: 'var(--space-sm)', fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}>SANDBOX DATA VISIBLE</div>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.65, margin: 0 }}>
            These observations come from the Amadeus <strong>test sandbox</strong> and are tagged <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 2 }}>SANDBOX_TEST</code>.
            They contain synthetic fares that match the real Amadeus schema but are not actual market prices.
            They are excluded from the Jevons index and analytical engines.
            To get production data, set <code style={{ fontFamily: 'var(--font-mono)' }}>AMADEUS_ENV=production</code> with production-approved credentials.
          </p>
        </div>
      )}
    </div>
  )
}
