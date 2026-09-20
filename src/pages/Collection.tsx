import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/ui/Button'
import { Play, RefreshCw, Database, AlertTriangle, CheckCircle, Clock, Zap, Activity, ArrowRight } from 'lucide-react'
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

function isoTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

const PIPELINE_STEPS = [
  { key: 'COLLECTION', label: 'COLLECTION', icon: Database, desc: 'Source fetch' },
  { key: 'ETL', label: 'ETL', icon: Zap, desc: 'Transform & normalize' },
  { key: 'VALIDATION', label: 'VALIDATION', icon: CheckCircle, desc: 'Schema + dedup' },
  { key: 'INDEX', label: 'INDEX', icon: Activity, desc: 'Store & index' },
]

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
      setTimeout(loadData, 3000)
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
  const isRunning = lastRun?.status === 'RUNNING'

  return (
    <div className="page-enter flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 960 }}>

      {/* ── Dramatic Header Strip ─────────────────────────────────── */}
      <div style={{
        position: 'relative',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        background: 'var(--gradient-hero-dark)',
        padding: 'var(--space-3xl) var(--space-3xl) var(--space-2xl)',
        boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(37,99,235,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(37,99,235,0.07) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }} />
        {/* Glowing orbs */}
        <div style={{
          position: 'absolute', top: -40, right: 60, width: 220, height: 220,
          borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(circle, rgba(37,99,235,0.22) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: -30, left: 80, width: 160, height: 160,
          borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 70%)',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 14px rgba(37,99,235,0.5)',
                }}>
                  <Database size={18} style={{ color: '#fff' }} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                  color: 'rgba(99,179,237,0.7)', fontFamily: 'var(--font-mono)',
                }}>AEROPRICE INDIA</span>
              </div>
              <h1 style={{
                fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em',
                color: '#fff', fontFamily: 'var(--font-sans)', margin: 0,
                textShadow: '0 0 30px rgba(37,99,235,0.4)',
              }}>
                DATA COLLECTION PIPELINE
              </h1>
              <p style={{
                fontSize: 13, color: 'rgba(148,163,184,0.8)',
                fontFamily: 'var(--font-sans)', margin: 0,
                marginTop: 6,
              }}>
                Automated source ingestion · ETL · Validation · Indexing
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignSelf: 'flex-start', marginTop: 4 }}>
              <Button variant="neutral" iconStart={<RefreshCw size={14} />} loading={loading} onClick={loadData}>Refresh</Button>
              {user?.role === 'ADMIN' && (
                <Button variant="primary" iconStart={<Zap size={14} />} loading={triggering} onClick={handleTrigger} disabled={!backendUp}>
                  Trigger Collection
                </Button>
              )}
            </div>
          </div>

          {/* Pipeline flow */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            marginTop: 'var(--space-2xl)',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}>
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon
              const isActive = isRunning && i <= 1
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{
                    flex: 1, padding: '14px var(--space-lg)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    borderRight: i < PIPELINE_STEPS.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 'var(--radius-md)',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(37,99,235,0.6), rgba(16,185,129,0.4))'
                        : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isActive ? '0 0 10px rgba(37,99,235,0.4)' : 'none',
                      transition: 'all 0.3s ease',
                    }}>
                      <Icon size={14} style={{ color: isActive ? '#fff' : 'rgba(148,163,184,0.6)' }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                        color: isActive ? 'rgba(147,210,255,0.9)' : 'rgba(148,163,184,0.5)',
                        fontFamily: 'var(--font-mono)', marginBottom: 2,
                      }}>{step.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-sans)' }}>
                        {step.desc}
                      </div>
                    </div>
                    {/* Active indicator */}
                    {isActive && (
                      <div style={{
                        position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2,
                        background: 'linear-gradient(90deg, transparent, rgba(37,99,235,0.8), transparent)',
                        borderRadius: 1,
                      }} />
                    )}
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ArrowRight size={10} style={{ color: 'rgba(148,163,184,0.25)', flexShrink: 0, marginLeft: -1 }} />
                  )}
                </div>
              )
            })}
          </div>
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

      {error && (
        <div style={{ background: 'var(--color-danger-bg)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-lg)', fontSize: 12, color: 'var(--color-danger)', fontFamily: 'var(--font-sans)' }}>
          {error}
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
          <div key={label} className="ap-card" style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
              <Icon size={12} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{label}</span>
            </div>
            <span style={{ fontSize: 'var(--text-heading-size)', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Source health cards */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <Activity size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>SOURCE HEALTH</span>
          {backendUp && sourceHealth.length === 0 && !loading && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>No data — trigger a collection run first.</span>
          )}
          {!backendUp && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>Connect backend to see source health.</span>
          )}
        </div>

        {sourceHealth.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {sourceHealth.map(s => {
              const isChallenge = s.status === 'CHALLENGE_DETECTED' || s.status === 'DEGRADED' || s.status === 'FAILED'
              const isConnected = s.status === 'LIVE' || s.status === 'COMPLETED'
              const leftBorderColor = isChallenge
                ? 'var(--color-warning)'
                : isConnected
                  ? 'var(--color-success)'
                  : 'var(--color-border-secondary)'
              return (
                <div key={s.source_id} style={{
                  background: 'var(--color-surface-bg)',
                  border: '1px solid var(--color-border-primary)',
                  borderLeft: `3px solid ${leftBorderColor}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-lg) var(--space-xl)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto auto auto',
                  alignItems: 'center',
                  gap: 'var(--space-xl)',
                  transition: 'box-shadow 0.2s, border-color 0.2s',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{s.source_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{s.source_type}</div>
                  </div>
                  <span className={`ap-badge ${isConnected ? 'ap-badge-live' : isChallenge ? 'ap-badge-gen' : 'ap-badge-sandbox'}`}>
                    {s.status}
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}>RECORDS</div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{(s.records_total ?? 0).toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}>LATENCY</div>
                    <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                      {s.latency_ms_avg != null ? `${Math.round(s.latency_ms_avg)}ms` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}>LAST ATTEMPT</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                      {isoTimestamp(s.last_attempt)}
                    </div>
                  </div>
                  {(s.challenge_reason ?? s.failure_reason) && (
                    <div style={{ maxWidth: 180 }}>
                      <div style={{ fontSize: 10, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', lineHeight: 1.4 }}>
                        {s.challenge_reason ?? s.failure_reason}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="ap-table">
                <thead>
                  <tr>
                    {['Source', 'Type', 'Status', 'Records', 'Last Success', 'Latency', 'Notes'].map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-2xl)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                      {backendUp ? 'No source health records. Trigger a collection run to populate.' : 'Connect backend to see source health.'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Collection runs table */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-md) var(--space-xl)', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <Clock size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>RECENT COLLECTION RUNS</span>
          {isRunning && (
            <span style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontWeight: 700, color: 'var(--color-info)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--color-info)',
                animation: 'pulse-dot 1.4s ease-in-out infinite',
                display: 'inline-block',
              }} />
              RUNNING
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ap-table">
            <thead>
              <tr>
                {['Run ID', 'Triggered By', 'Status', 'Routes', 'Collected', 'Rejected', 'Started', 'Duration'].map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 'var(--space-2xl)', textAlign: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {backendUp ? 'No collection runs yet. Click "Trigger Collection" above.' : 'Connect backend to see run history.'}
                  </td>
                </tr>
              )}
              {runs.map(r => {
                const durationMs = r.started_at && r.ended_at
                  ? new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()
                  : null
                return (
                  <tr key={r.run_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>{r.run_id?.slice(0, 8)}…</td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.triggered_by}</td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: statusBg(r.status), color: statusColor(r.status), padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.routes_done ?? 0}/{r.routes_planned ?? 0}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: (r.observations_collected ?? 0) > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                      {(r.observations_collected ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{(r.observations_rejected ?? 0).toLocaleString('en-IN')}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                      {isoTimestamp(r.started_at)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {durationMs != null ? `${Math.round(durationMs / 1000)}s` : r.status === 'RUNNING' ? '…' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scheduler config */}
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
