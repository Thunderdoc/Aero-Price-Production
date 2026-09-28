import { useState, useEffect, useCallback } from 'react'
import { Button } from '../components/ui/Button'
import { Play, RefreshCw, Database, CheckCircle, Clock, Zap, Activity, ShieldCheck } from 'lucide-react'
import { apiCollections, apiTriggerCollection, apiSourceHealth, isBackendAvailable } from '../services/api'
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
  const { user, token } = useAuth()
  const [runs, setRuns] = useState<CollectionRun[]>([])
  const [sourceHealth, setSourceHealth] = useState<SourceHealthItem[]>([])
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (await isBackendAvailable()) {
        const [runsResp, healthResp] = await Promise.allSettled([
          apiCollections(token ?? undefined),
          apiSourceHealth(token ?? undefined),
        ])
        if (runsResp.status === 'fulfilled') {
          const raw = runsResp.value as unknown as { runs?: CollectionRun[] }
          setRuns(raw.runs ?? [])
        }
        if (healthResp.status === 'fulfilled') {
          const raw = healthResp.value as unknown as { sources?: SourceHealthItem[] } | SourceHealthItem[]
          if (Array.isArray(raw)) setSourceHealth(raw)
          else if ('sources' in raw) setSourceHealth(raw.sources ?? [])
        }
      }
    } catch {
      setRuns([])
      setSourceHealth([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadData() }, [loadData])

  async function handleTrigger() {
    setTriggering(true)
    setRequestOpen(true)
    setTriggerMessage(null)
    try {
      const result = await apiTriggerCollection(token ?? undefined)
      setTriggerMessage(result?.message ?? 'The backend accepted the collection request.')
      await loadData()
    } catch (cause) {
      setTriggerMessage(cause instanceof Error ? cause.message : 'The backend rejected the collection request.')
    } finally {
      setTriggering(false)
    }
  }

  const liveCount = sourceHealth.filter(source => source.status === 'LIVE').length
  const totalObs = sourceHealth.reduce((sum, s) => sum + (s.records_total ?? 0), 0)
  const lastRun = runs[0]

  return (
    <div className="page-enter flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 1000 }}>
      {/* Dramatic Header */}
      <div style={{
        position: 'relative', borderRadius: 'var(--radius-xl)', overflow: 'hidden',
        background: 'var(--gradient-hero-dark)', padding: '28px 32px',
        boxShadow: '0 4px 32px rgba(0,0,0,0.35)',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Database size={18} color="white" />
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>
                    Data Ingestion &amp; Pipeline Engine
                  </h1>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-mono)' }}>
                    Backend collection control · {liveCount} live source{liveCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', maxWidth: 520, lineHeight: 1.6 }}>
                Real-time scraping, GDS direct queries, and government statistical feeds feeding into the AeroPrice Jevons Matched-Sample index engine.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handleTrigger}
              disabled={triggering}
              iconStart={triggering ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={15} />}
            >
              {triggering ? 'Collecting Feeds…' : 'Trigger Immediate Harvest'}
            </Button>
          </div>
        </div>
      </div>

      {/* Backend request status */}
      {requestOpen && (
        <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-brand-primary)40', borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)' }}>BACKEND COLLECTION REQUEST</span>
            <button onClick={() => setRequestOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 16 }}>×</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <div>{triggering ? 'Sending request to backend collection worker...' : triggerMessage ?? 'No collection request is currently running.'}</div>
            <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-tertiary)' }}>Counts and source results below are refreshed from the backend; this panel does not invent progress or observation totals.</div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--space-md)' }}>
        {[
          { label: 'SOURCES LIVE', value: `${liveCount} / ${sourceHealth.length}`, color: liveCount ? 'var(--color-success)' : 'var(--color-warning)', icon: ShieldCheck },
          { label: 'TOTAL OBSERVATIONS', value: totalObs.toLocaleString('en-IN'), color: 'var(--color-brand-primary)', icon: Database },
          { label: 'LAST COLLECTION', value: lastRun ? relativeTime(lastRun.started_at) : '—', color: 'var(--color-text-secondary)', icon: Clock },
          { label: 'COLLECTION STATUS', value: lastRun?.status ?? 'NO RUNS', color: lastRun?.status === 'COMPLETED' ? 'var(--color-success)' : 'var(--color-warning)', icon: Activity },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="ap-card" style={{ padding: 'var(--space-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-sm)' }}>
              <Icon size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)' }}>{label}</span>
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Source health list */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
          ACTIVE COLLECTOR CHANNELS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sourceHealth.length ? sourceHealth.map(s => (
            <div key={s.source_id} style={{
              background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)',
              borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.source_name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{s.source_type}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>RECORDS</div>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{(s.records_total ?? 0).toLocaleString('en-IN')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>LATENCY</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)', fontWeight: 600 }}>{s.latency_ms_avg} ms</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: s.status === 'LIVE' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', color: s.status === 'LIVE' ? 'var(--color-success)' : 'var(--color-warning)', border: `1px solid ${s.status === 'LIVE' ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}` }}>
                  {s.status}
                </span>
              </div>
            </div>
          )) : (
            <div style={{ padding: 18, border: '1px dashed var(--color-border-primary)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 12 }}>
              {loading ? 'Loading collector channels from backend...' : 'No collector channels were returned by the backend.'}
            </div>
          )}
        </div>
      </div>

      {/* Collection runs */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border-primary)', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)' }}>
          RECENT HARVEST RUNS
        </div>
        <table className="ap-table">
          <thead>
            <tr>
              {['Run ID', 'Trigger', 'Corridors', 'Observations', 'Completed', 'Status'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.length ? runs.map(r => (
              <tr key={r.run_id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand-primary)' }}>{r.run_id}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{r.triggered_by}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{r.routes_done} / {r.routes_planned}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.observations_collected?.toLocaleString('en-IN')}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{relativeTime(r.ended_at)}</td>
                <td>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid rgba(22,163,74,0.3)' }}>
                    {r.status}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} style={{ padding: 18, color: 'var(--color-text-secondary)' }}>
                  {loading ? 'Loading harvest runs from backend...' : 'No backend harvest runs were returned.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
