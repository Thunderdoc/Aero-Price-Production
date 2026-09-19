import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/ui/Button'
import { Play, RefreshCw, Database, AlertTriangle, CheckCircle, Clock, Zap, Activity } from 'lucide-react'
import {
  apiCollections, apiTriggerCollection, apiSourceHealth, isBackendAvailable,
} from '../services/api'
import { useAuth } from '../contexts/AuthContext'

interface CollectionRun {
  run_id: string
  triggered_by: string
  status: string
  routes_planned?: number
  routes_done?: number
  observations_collected?: number
  observations_rejected?: number
  started_at?: string
  ended_at?: string
  error_summary?: string | null
}

interface SourceHealthItem {
  source_id: string
  source_name: string
  source_type: string
  status: string
  last_success?: string | null
  last_attempt?: string | null
  records_total?: number
  latency_ms_avg?: number
  challenge_reason?: string | null
  failure_reason?: string | null
  auth_status?: string | null
}

function statusColor(status: string): string {
  const m: Record<string, string> = {
    LIVE: 'var(--color-success)',
    COMPLETED: 'var(--color-success)',
    RUNNING: 'var(--color-info)',
    CHALLENGE_DETECTED: 'var(--color-warning)',
    NOT_CONFIGURED: 'var(--color-text-tertiary)',
    DEGRADED: 'var(--color-warning)',
    FAILED: 'var(--color-danger)',
    PARTIAL: 'var(--color-warning)',
    NO_DATA: 'var(--color-text-tertiary)',
  }
  return m[status] ?? 'var(--color-text-tertiary)'
}

function statusBg(status: string): string {
  const m: Record<string, string> = {
    LIVE: 'var(--color-success-bg)',
    COMPLETED: 'var(--color-success-bg)',
    RUNNING: 'var(--color-info-bg)',
    CHALLENGE_DETECTED: 'var(--color-warning-bg)',
    NOT_CONFIGURED: 'var(--color-surface-secondary)',
    DEGRADED: 'var(--color-warning-bg)',
    FAILED: 'var(--color-danger-bg)',
    PARTIAL: 'var(--color-warning-bg)',
    NO_DATA: 'var(--color-surface-secondary)',
  }
  return m[status] ?? 'var(--color-surface-secondary)'
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export default function Collection() {
  const { user } = useAuth()
  const [runs, setRuns] = useState<CollectionRun[]>([])
  const [sourceHealth, setSourceHealth] = useState<SourceHealthItem[]>([])
  const [backendUp, setBackendUp] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const up = await isBackendAvailable()
      setBackendUp(up)
      if (!up) return

      const [runsResp, healthResp] = await Promise.allSettled([
        apiCollections(),
        apiSourceHealth(),
      ])

      if (runsResp.status === 'fulfilled') {
        const raw = runsResp.value as unknown as { runs?: CollectionRun[]; collection_runs?: CollectionRun[] }
        setRuns((raw.runs ?? raw.collection_runs ?? [raw as unknown as CollectionRun]).filter(Boolean).slice(0, 20))
      }
      if (healthResp.status === 'fulfilled') {
        const raw = healthResp.value as unknown as { sources?: SourceHealthItem[] } | SourceHealthItem[]
        if (Array.isArray(raw)) setSourceHealth(raw)
        else setSourceHealth(raw.sources ?? [])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleTrigger() {
    setTriggering(true)
    setTriggerResult(null)
    try {
      const resp = await apiTriggerCollection() as unknown as { run_id?: string; message?: string }
      setTriggerResult(resp.run_id ? `Collection run started: ${resp.run_id.slice(0, 8)}…` : 'Collection triggered')
      setTimeout(loadData, 3000)  // refresh after 3s
    } catch (e: unknown) {
      setTriggerResult(`Error: ${e instanceof Error ? e.message : 'Trigger failed'}`)
    } finally {
      setTriggering(false)
    }
  }

  const liveCount = sourceHealth.filter(s => s.status === 'LIVE').length
  const challengeCount = sourceHealth.filter(s => s.status === 'CHALLENGE_DETECTED').length
  const totalObs = sourceHealth.reduce((sum, s) => sum + (s.records_total ?? 0), 0)
  const lastRun = runs[0]

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 960 }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>
            Collection Operations
          </h1>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
            Automated data collection status, source health, and run history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <Button variant="neutral" iconStart={<RefreshCw size={14} />} loading={loading} onClick={loadData}>Refresh</Button>
          {user?.role === 'ADMIN' && (
            <Button variant="primary" iconStart={<Zap size={14} />} loading={triggering} onClick={handleTrigger} disabled={!backendUp}>
              Trigger Collection
            </Button>
          )}
        </div>
      </div>

      {/* Backend unavailable */}
      {backendUp === false && (
        <div style={{ background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-lg)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
            Backend not connected — set <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 2 }}>VITE_API_URL</code> to connect to the FastAPI backend.
          </span>
        </div>
      )}

      {/* Trigger result */}
      {triggerResult && (
        <div style={{ background: triggerResult.startsWith('Error') ? 'var(--color-danger-bg)' : 'var(--color-success-bg)', border: `1px solid ${triggerResult.startsWith('Error') ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.3)'}`, borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-lg)', fontSize: 12, fontFamily: 'var(--font-sans)', color: triggerResult.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {triggerResult}
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-md)' }}>
        {[
          { label: 'SOURCES LIVE', value: liveCount, color: liveCount > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)', icon: CheckCircle },
          { label: 'CHALLENGE DETECTED', value: challengeCount, color: challengeCount > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)', icon: AlertTriangle },
          { label: 'TOTAL OBSERVATIONS', value: totalObs.toLocaleString('en-IN'), color: 'var(--color-text-primary)', icon: Database },
          { label: 'LAST RUN', value: lastRun ? relativeTime(lastRun.started_at) : '—', color: 'var(--color-text-secondary)', icon: Clock },
          { label: 'LAST RUN STATUS', value: lastRun?.status ?? '—', color: statusColor(lastRun?.status ?? ''), icon: Activity },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
              <Icon size={12} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{label}</span>
            </div>
            <span style={{ fontSize: 'var(--text-heading-size)', fontWeight: 700, color, fontFamily: 'var(--font-sans)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Source health table */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-md) var(--space-xl)', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Activity size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>SOURCE HEALTH</span>
          {backendUp && sourceHealth.length === 0 && !loading && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>No source health data yet — trigger a collection run first.</span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border-primary)' }}>
                {['Source', 'Type', 'Status', 'Records', 'Last Success', 'Latency', 'Notes'].map(col => (
                  <th key={col} style={{ padding: 'var(--space-sm) var(--space-lg)', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceHealth.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 'var(--space-2xl)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                    {backendUp ? 'No source health records. Trigger a collection run to populate.' : 'Connect backend to see source health.'}
                  </td>
                </tr>
              )}
              {sourceHealth.map((s, idx) => (
                <tr key={s.source_id} style={{ borderBottom: '1px solid var(--color-border-primary)', background: idx % 2 === 0 ? 'var(--color-surface-bg)' : 'var(--color-surface-secondary)' }}>
                  <td style={{ padding: '10px var(--space-lg)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{s.source_name}</td>
                  <td style={{ padding: '10px var(--space-lg)', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{s.source_type}</td>
                  <td style={{ padding: '10px var(--space-lg)' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: statusBg(s.status), color: statusColor(s.status), padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px var(--space-lg)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                    {(s.records_total ?? 0).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '10px var(--space-lg)', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {relativeTime(s.last_success)}
                  </td>
                  <td style={{ padding: '10px var(--space-lg)', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    {s.latency_ms_avg != null ? `${Math.round(s.latency_ms_avg)}ms` : '—'}
                  </td>
                  <td style={{ padding: '10px var(--space-lg)', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                    {s.challenge_reason ?? s.failure_reason ?? (s.auth_status === 'VALID' ? 'Authenticated' : s.auth_status ?? '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection runs */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-md) var(--space-xl)', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Clock size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>RECENT COLLECTION RUNS</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border-primary)' }}>
                {['Run ID', 'Triggered By', 'Status', 'Routes', 'Collected', 'Rejected', 'Started', 'Duration'].map(col => (
                  <th key={col} style={{ padding: 'var(--space-sm) var(--space-lg)', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 'var(--space-2xl)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                    {backendUp ? 'No collection runs yet. Click "Trigger Collection" above.' : 'Connect backend to see run history.'}
                  </td>
                </tr>
              )}
              {runs.map((r, idx) => {
                const durationMs = r.started_at && r.ended_at
                  ? new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()
                  : null
                return (
                  <tr key={r.run_id} style={{ borderBottom: '1px solid var(--color-border-primary)', background: idx % 2 === 0 ? 'var(--color-surface-bg)' : 'var(--color-surface-secondary)' }}>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{r.run_id?.slice(0, 8)}…</td>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>{r.triggered_by}</td>
                    <td style={{ padding: '10px var(--space-lg)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: statusBg(r.status), color: statusColor(r.status), padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                      {r.routes_done ?? 0}/{r.routes_planned ?? 0}
                    </td>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: (r.observations_collected ?? 0) > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                      {(r.observations_collected ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                      {(r.observations_rejected ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                      {relativeTime(r.started_at)}
                    </td>
                    <td style={{ padding: '10px var(--space-lg)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                      {durationMs != null ? `${Math.round(durationMs / 1000)}s` : r.status === 'RUNNING' ? '…' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule info */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <Clock size={14} style={{ color: 'var(--color-brand-primary)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>SCHEDULER CONFIGURATION</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-lg)' }}>
          {[
            { label: 'COLLECTION INTERVAL', value: '60 min (configurable)' },
            { label: 'ROUTES IN BASKET', value: '12 corridors' },
            { label: 'ADVANCE WINDOWS', value: 'T+1, T+7, T+15, T+30, T+45' },
            { label: 'BACKEND SCHEDULER', value: 'APScheduler (server-side)' },
            { label: 'PIPELINE', value: 'Normalize → Validate → Dedup → Store' },
            { label: 'AMADEUS RATE LIMIT', value: '1 req/s (sandbox)' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 4, fontFamily: 'var(--font-sans)' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--color-info-bg)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-info)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
          The scheduler runs server-side via APScheduler. Collection is not driven by the frontend.
          Configure <code style={{ fontFamily: 'var(--font-mono)' }}>COLLECTION_INTERVAL_MINUTES</code> and <code style={{ fontFamily: 'var(--font-mono)' }}>AMADEUS_API_KEY</code> in <code style={{ fontFamily: 'var(--font-mono)' }}>backend/.env</code>.
        </div>
      </div>
    </div>
  )
}
