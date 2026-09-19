import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { dataSources } from '../data/sampleData'

// ── Types ──────────────────────────────────────────────────

interface Toast {
  id: number
  message: string
}

interface LogEntry {
  ts: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}

// ── Static data ────────────────────────────────────────────

const pipelineLogs: LogEntry[] = [
  { ts: '13:02:04', level: 'INFO',  message: 'collector-mumbai-01: batch complete — 482 records ingested from MakeMyTrip API' },
  { ts: '13:02:01', level: 'INFO',  message: 'collector-delhi-01: Amadeus GDS ping OK — latency 308ms' },
  { ts: '13:01:58', level: 'INFO',  message: 'Index recomputed — v2026.09.18.1302 published. Value: 115.85' },
  { ts: '13:01:52', level: 'INFO',  message: 'collector-mumbai-01: IndiGo Direct heartbeat OK' },
  { ts: '13:01:48', level: 'WARN',  message: 'collector-bangalore-01: DGCA Public Tariff latency high (892ms) — threshold 500ms' },
  { ts: '13:01:45', level: 'INFO',  message: 'collector-delhi-01: heartbeat OK — 3,960 req/hr' },
  { ts: '13:01:38', level: 'INFO',  message: 'Yatra OTA Feed: 391 new observations pushed to dedup queue' },
  { ts: '13:01:32', level: 'INFO',  message: 'Dedup engine: 23 duplicates resolved across 3 sources' },
  { ts: '13:01:25', level: 'INFO',  message: 'Outlier check: DEL-BOM p99 fare ₹13,500 — within 3.5σ band. Accepted.' },
  { ts: '13:01:20', level: 'ERROR', message: 'Alert anom-001 (DEL-SXR +99.0% spike) — quarantined, awaiting second source confirmation' },
  { ts: '13:01:14', level: 'INFO',  message: 'Booking window segmentation: 15,240 obs tagged across T+1..T+90 buckets' },
  { ts: '13:01:08', level: 'INFO',  message: 'Route weight refresh skipped — next scheduled 2026-10-01' },
  { ts: '13:01:00', level: 'INFO',  message: 'Index publish: 1,247 jobs queued across 3 workers' },
  { ts: '13:00:55', level: 'WARN',  message: 'Skyscanner Aggregate: success rate dropped to 94.1% — monitoring' },
  { ts: '13:00:48', level: 'INFO',  message: 'STL decomposition: seasonal components updated for 21 corridors' },
  { ts: '13:00:40', level: 'INFO',  message: 'Isolation Forest anomaly scan: 6 open anomalies, 3 resolved this cycle' },
  { ts: '13:00:33', level: 'INFO',  message: 'Cross-source consensus check: all active sources within 12% median band' },
  { ts: '13:00:28', level: 'WARN',  message: 'DGCA Public Tariff: freshness 234 min — interpolating corridor contributions' },
  { ts: '13:00:22', level: 'INFO',  message: 'Freshness scorer: DEL-SXR freshness 18 min — within threshold' },
  { ts: '13:00:15', level: 'INFO',  message: 'Holiday calendar sync: 9 upcoming events loaded through 2027-03-01' },
  { ts: '13:00:08', level: 'INFO',  message: 'Audit log flush: 4,820 records persisted to ap-south-1a and ap-south-1b' },
  { ts: '13:00:00', level: 'INFO',  message: 'Scheduler: next index run in 14 min — all workers healthy' },
]

const userSessions = [
  { username: 'arjun.sharma@aeroprice.in',  ip: '10.0.4.21',  lastActivity: '13:01:55', pages: 14 },
  { username: 'priya.menon@aeroprice.in',   ip: '10.0.4.38',  lastActivity: '12:58:40', pages: 7  },
  { username: 'rahul.verma@aeroprice.in',   ip: '10.0.4.57',  lastActivity: '12:47:12', pages: 3  },
  { username: 'sneha.iyer@aeroprice.in',    ip: '192.168.3.9', lastActivity: '12:31:09', pages: 22 },
  { username: 'devops-bot@aeroprice.in',    ip: '10.0.1.1',   lastActivity: '13:02:03', pages: 1  },
]

const levelColor: Record<string, string> = {
  INFO:  'var(--color-text-tertiary)',
  WARN:  'var(--color-warning)',
  ERROR: 'var(--color-danger)',
}

const levelBg: Record<string, string> = {
  INFO:  'transparent',
  WARN:  'rgba(217,119,6,0.08)',
  ERROR: 'rgba(220,38,38,0.1)',
}

// ── Sub-components ─────────────────────────────────────────

function PulseDot({ color = 'var(--color-success)' }: { color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 10, height: 10 }}>
      <span style={{
        display: 'block', width: 10, height: 10,
        borderRadius: '50%', background: color, position: 'absolute',
      }} />
      <span style={{
        display: 'block', width: 10, height: 10,
        borderRadius: '50%', background: color, position: 'absolute',
        animation: 'ping 1.4s cubic-bezier(0,0,0.2,1) infinite',
        opacity: 0.6,
      }} />
    </span>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-bg)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-xl)',
      minWidth: 140,
      flexShrink: 0,
    }}>
      <div className="text-caption" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 'var(--space-xs)' }}>{label}</div>
      <div className="text-heading" style={{ color: 'rgba(255,255,255,0.9)' }}>{value}</div>
    </div>
  )
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-xl)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', border: 'none',
        }}
      >
        <span className="text-label" style={{ color: 'rgba(255,255,255,0.85)' }}>{title}</span>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-xl)' }}>
      <span className="text-body" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      {children}
    </div>
  )
}

function FakeSelect({ value }: { value: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 'var(--radius-md)', padding: '6px 12px', color: 'rgba(255,255,255,0.85)',
      fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'default',
    }}>
      {value} <span style={{ color: 'rgba(255,255,255,0.3)' }}>▾</span>
    </div>
  )
}

function FakeToggle({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? 'var(--color-brand-primary)' : 'rgba(255,255,255,0.15)',
        position: 'relative', cursor: 'default',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2, left: checked ? 18 : 2,
          transition: 'left 0.2s ease',
        }} />
      </div>
      <span className="text-caption" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export default function AdminDashboard() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const now = new Date()
  const timestamp = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST'

  function showToast(message: string) {
    const id = Date.now()
    setToasts(t => [...t, { id, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }

  const statusBadge = (s: string) => {
    if (s === 'LIVE') return <Badge label="LIVE" variant="success" />
    if (s === 'HEALTHY') return <Badge label="HEALTHY" variant="success" />
    if (s === 'AGING') return <Badge label="AGING" variant="warning" />
    if (s === 'STALE') return <Badge label="STALE" variant="danger" />
    if (s === 'FAILED') return <Badge label="FAILED" variant="danger" />
    return <Badge label={s} variant="default" />
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface-dark)', fontFamily: 'var(--font-sans)' }}>

      {/* Toast layer */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: 'var(--color-surface-bg)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 'var(--radius-md)', padding: '10px 16px',
            color: 'var(--color-text-primary)', fontSize: 13, boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.15s ease',
          }}>
            {t.message}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'var(--space-2xl)' }}>

        {/* 1. Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 'var(--space-3xl)', flexWrap: 'wrap', gap: 'var(--space-xl)',
        }}>
          <div>
            <div className="text-caption" style={{ color: 'var(--color-brand-primary)', letterSpacing: '0.12em', marginBottom: 'var(--space-xs)' }}>
              ADMIN CONSOLE
            </div>
            <h1 className="text-title" style={{ color: 'rgba(255,255,255,0.9)', margin: 0 }}>System Administration</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexShrink: 0 }}>
            <PulseDot />
            <span className="text-body" style={{ color: 'rgba(255,255,255,0.7)' }}>All Systems Operational</span>
            <span className="text-caption" style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 'var(--space-md)' }}>{timestamp}</span>
          </div>
        </div>

        {/* 2. System Health Grid */}
        <div style={{ marginBottom: 'var(--space-3xl)' }}>
          <div className="text-label" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 'var(--space-lg)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            SYSTEM HEALTH
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 'var(--space-xl)' }}>
            {[
              { title: 'API Gateway',   status: 'HEALTHY', lines: ['99.7% uptime', '42ms avg latency'] },
              { title: 'Data Pipeline', status: 'ACTIVE',  lines: ['3 collectors running', '1,247 jobs queued'] },
              { title: 'Database',      status: 'HEALTHY', lines: ['4.2 GB used', '95.8 GB free'] },
              { title: 'Scheduler',     status: 'RUNNING', lines: ['Next run in 14 min', 'Last: success'] },
            ].map(card => (
              <div key={card.title} style={{
                background: 'var(--color-surface-bg)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-xl)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
                  <span className="text-label" style={{ color: 'rgba(255,255,255,0.85)' }}>{card.title}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PulseDot />
                    <span className="text-caption" style={{ color: 'var(--color-success)' }}>{card.status}</span>
                  </div>
                </div>
                {card.lines.map(l => (
                  <div key={l} className="text-body" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{l}</div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 3. Live Metrics Strip */}
        <div style={{ marginBottom: 'var(--space-3xl)' }}>
          <div className="text-caption" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 'var(--space-lg)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            LIVE METRICS
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-xl)', overflowX: 'auto', paddingBottom: 4 }}>
            {[
              { label: 'Requests/min',    value: '1,847' },
              { label: 'Avg Response',    value: '127ms' },
              { label: 'Cache Hit Rate',  value: '89.3%' },
              { label: 'Error Rate',      value: '0.12%' },
              { label: 'Active Sessions', value: '23' },
            ].map(m => <MetricCard key={m.label} {...m} />)}
          </div>
        </div>

        {/* 4. Source Health Matrix */}
        <div style={{ marginBottom: 'var(--space-3xl)' }}>
          <div className="text-caption" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 'var(--space-lg)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            SOURCE HEALTH MATRIX
          </div>
          <div style={{
            background: 'var(--color-surface-bg)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Source', 'Status', 'Last Fetch', 'Records', 'Latency', 'Error Rate', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left', fontWeight: 500, fontSize: 11,
                        color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataSources.map((src, i) => {
                    const lastFetch = new Date(src.lastPing)
                    const fetchStr = lastFetch.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                    const errorRate = (100 - src.successRate).toFixed(1)
                    return (
                      <tr key={src.id} style={{
                        borderBottom: i < dataSources.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        transition: 'background 0.15s',
                      }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{src.name}</div>
                          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 }}>{src.type} · {src.apiVersion}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{statusBadge(src.status)}</td>
                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.55)', fontSize: 12, whiteSpace: 'nowrap' }}>{fetchStr} IST</td>
                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)' }}>{src.recordsToday.toLocaleString()}</td>
                        <td style={{ padding: '12px 16px', color: src.latencyMs > 500 ? 'var(--color-warning)' : 'rgba(255,255,255,0.7)' }}>{src.latencyMs}ms</td>
                        <td style={{ padding: '12px 16px', color: parseFloat(errorRate) > 3 ? 'var(--color-warning)' : 'rgba(255,255,255,0.7)' }}>{errorRate}%</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button variant="neutral" size="sm" onClick={() => showToast(`Refreshing ${src.name}…`)}>Refresh</Button>
                            <Button variant="danger" size="sm" onClick={() => showToast(`${src.name} disabled.`)}>Disable</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 5. Pipeline Activity */}
        <div style={{ marginBottom: 'var(--space-3xl)' }}>
          <div className="text-caption" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 'var(--space-lg)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            PIPELINE ACTIVITY
          </div>
          <div style={{
            background: 'var(--color-surface-dark)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          }}>
            <div style={{ height: 360, overflowY: 'auto', padding: 'var(--space-lg)' }}>
              {pipelineLogs.map((entry, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 'var(--space-lg)',
                  padding: '5px var(--space-md)',
                  borderRadius: 'var(--radius-sm)',
                  background: levelBg[entry.level],
                  marginBottom: 2,
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)', fontSize: 12, flexShrink: 0 }}>{entry.ts}</span>
                  <span style={{ color: levelColor[entry.level], fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, flexShrink: 0, width: 42 }}>{entry.level}</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 6. Configuration Panel */}
        <div style={{ marginBottom: 'var(--space-3xl)' }}>
          <div className="text-caption" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 'var(--space-lg)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            CONFIGURATION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <CollapsibleSection title="Collection Settings">
              <ConfigRow label="Collection interval">
                <FakeSelect value="30 minutes" />
              </ConfigRow>
              <ConfigRow label="Max retries per request">
                <FakeSelect value="3" />
              </ConfigRow>
              <ConfigRow label="Request timeout">
                <FakeSelect value="30 seconds" />
              </ConfigRow>
              <ConfigRow label="Dedup fingerprinting">
                <FakeToggle checked label="Enabled" />
              </ConfigRow>
            </CollapsibleSection>

            <CollapsibleSection title="Index Settings">
              <ConfigRow label="Base period">
                <FakeSelect value="January 2025" />
              </ConfigRow>
              <ConfigRow label="Update frequency">
                <FakeSelect value="Hourly" />
              </ConfigRow>
              <ConfigRow label="Fare smoothing window">
                <FakeSelect value="7-day rolling" />
              </ConfigRow>
              <ConfigRow label="STL decomposition">
                <FakeToggle checked label="Active" />
              </ConfigRow>
            </CollapsibleSection>

            <CollapsibleSection title="Alert Thresholds">
              <ConfigRow label="Spike detection threshold">
                <FakeSelect value="> 15% deviation" />
              </ConfigRow>
              <ConfigRow label="Staleness warning">
                <FakeSelect value="> 2 hours" />
              </ConfigRow>
              <ConfigRow label="Cross-source deviation cap">
                <FakeSelect value="12%" />
              </ConfigRow>
              <ConfigRow label="Auto-quarantine on anomaly">
                <FakeToggle checked label="Enabled" />
              </ConfigRow>
            </CollapsibleSection>
          </div>
        </div>

        {/* 7. User Sessions */}
        <div style={{ marginBottom: 'var(--space-3xl)' }}>
          <div className="text-caption" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 'var(--space-lg)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 11 }}>
            ACTIVE SESSIONS
          </div>
          <div style={{
            background: 'var(--color-surface-bg)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['User', 'IP Address', 'Last Activity', 'Pages Viewed'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userSessions.map((s, i) => (
                  <tr key={s.username} style={{ borderBottom: i < userSessions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{s.username}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.ip}</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.lastActivity} IST</td>
                    <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)' }}>{s.pages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
