import { useState, useEffect, useRef } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useGovData } from '../hooks/useGovData'
import { useAuth } from '../contexts/AuthContext'
import { apiAuditLog, isBackendAvailable } from '../services/api'
import { CheckCircle, ShieldCheck, Activity, ToggleRight, RefreshCw, Download } from 'lucide-react'
import { getApiHealth } from '../services/flightData'

const _h = getApiHealth()

const AIRFARE_SOURCES_ADMIN = [
  { id: 'aviationstack', name: 'AviationStack (ADS-B Radar)', status: 'CONFIGURED', enabled: true, obs: 'awaiting live check' },
  { id: 'ef-api', name: 'EF Live Fares API', status: 'NEEDS KEY', enabled: false, obs: 'not connected' },
  { id: 'ignav', name: 'Ignav Aviation Data', status: 'NEEDS KEY', enabled: false, obs: 'not connected' },
  { id: 'indigo', name: 'IndiGo Direct Collector', status: 'AUTHORIZED ONLY', enabled: false, obs: 'NDC credentials required' },
  { id: 'airindia', name: 'Air India Direct / GDS', status: 'AUTHORIZED ONLY', enabled: false, obs: 'GDS credentials required' },
  { id: 'akasa', name: 'Akasa Air Direct Collector', status: 'AUTHORIZED ONLY', enabled: false, obs: 'NDC credentials required' },
  { id: 'spicejet', name: 'SpiceJet Webhook Stream', status: 'NOT BUILT', enabled: false, obs: 'webhook not configured' },
]

const INITIAL_AUDIT = [
  { ts: '2026-09-21T14:45:00Z', actor: 'admin@aeroprice.in', action: 'INDEX_PUB', detail: 'Jevons Airfare Index published at 108.45 (+8.45% YoY) across 24 corridors' },
  { ts: '2026-09-21T14:30:02Z', actor: 'system', action: 'GOV_FETCH', detail: 'DGCA Monthly Passenger & MoSPI CPI Transport feeds synced successfully' },
  { ts: '2026-09-21T14:15:04Z', actor: 'system', action: 'SOURCE_CHECK', detail: 'Direct airline collectors pending authorized credentials; demo mode remains enabled' },
  { ts: '2026-09-21T14:00:00Z', actor: 'admin@aeroprice.in', action: 'LOGIN', detail: 'Admin session authenticated (administrator access)' },
  { ts: '2026-09-21T13:30:00Z', actor: 'dgca@gov.in', action: 'LOGIN', detail: 'Analyst login (GOVERNMENT plan)' },
]

const THRESHOLDS = [
  { key: 'anomaly_zscore', label: 'Anomaly Z-score threshold', value: 3.5, unit: 'σ' },
  { key: 'consensus_deviation', label: 'Cross-source consensus deviation', value: 12, unit: '%' },
  { key: 'freshness_warning', label: 'Freshness warning threshold', value: 60, unit: 'min' },
  { key: 'min_corridors_index', label: 'Min corridors to publish index', value: 10, unit: 'corridors' },
]

const ROLE_BADGE = {
  ADMIN:   { color: 'var(--color-danger)',       bg: 'var(--color-danger-bg)' },
  ANALYST: { color: 'var(--color-info)',          bg: 'var(--color-info-bg)' },
  PUBLIC:  { color: 'var(--color-brand-primary)', bg: 'var(--color-brand-muted)' },
}

const ACTION_COLOR: Record<string, string> = {
  INDEX_PUB: 'var(--color-brand-primary)',
  GOV_FETCH: 'var(--color-info)',
  SOURCE_CHECK: 'var(--color-success)',
  LOGIN: 'var(--color-success)',
  ROLE_CHANGE: 'var(--color-danger)',
}

type Tab = 'users' | 'pipeline' | 'audit' | 'config'

const DEMO_USERS = [
  { email: 'admin@aeroprice.in', role: 'ADMIN', plan: 'ADMIN', name: 'Admin User', lastLogin: 'Live now', status: 'ACTIVE' },
  { email: 'dgca@gov.in', role: 'ANALYST', plan: 'GOVERNMENT', name: 'DGCA Analyst', lastLogin: 'Today 10:32 IST', status: 'ACTIVE' },
  { email: 'user@aeroprice.in', role: 'PUBLIC', plan: 'STANDARD', name: 'User Account', lastLogin: 'Today 08:00 IST', status: 'ACTIVE' },
]

interface AuditEntry { ts: string; actor: string; action: string; detail: string }

export default function AdminDashboard() {
  const { user } = useAuth()
  const govData = useGovData()
  const [tab, setTab] = useState<Tab>('pipeline')
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT)
  const [auditLoading, setAuditLoading] = useState(false)
  const [sources, setSources] = useState(AIRFARE_SOURCES_ADMIN)
  const [thresholds, setThresholds] = useState(THRESHOLDS)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(msg)
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000)
  }

  function handleThresholdChange(key: string, val: number) {
    setThresholds(prev => prev.map(t => t.key === key ? { ...t, value: val } : t))
    showToast(`Parameter updated: ${key} = ${val}`)
  }

  function toggleSource(id: string) {
    setSources(prev => prev.map(s => {
      if (s.id === id) {
        const next = !s.enabled
        showToast(`${s.name} ${next ? 'enabled' : 'paused'}`)
        return { ...s, enabled: next }
      }
      return s
    }))
  }

  useEffect(() => {
    async function loadAudit() {
      if (tab !== 'audit') return
      setAuditLoading(true)
      try {
        if (await isBackendAvailable()) {
          const logs = await apiAuditLog()
          if (Array.isArray(logs) && logs.length > 0) {
            setAudit(logs)
          }
        }
      } catch {
        // static audit log remains visible
      } finally {
        setAuditLoading(false)
      }
    }
    loadAudit()
  }, [tab])

  function downloadAuditCSV() {
    const rows = [
      ['Timestamp', 'Actor', 'Action', 'Detail'],
      ...audit.map(a => [a.ts, a.actor, a.action, `"${a.detail}"`]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `aeroprice-audit-${new Date().toISOString().slice(0, 10)}.csv`
    el.click()
    URL.revokeObjectURL(url)
    showToast('Audit log downloaded')
  }

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-2xl)' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--color-surface-dark)', color: 'white', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontSize: 12, fontFamily: 'var(--font-sans)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {toast}
        </div>
      )}

      {/* Dark hero header */}
      <div style={{
        background: 'var(--gradient-hero-dark)', borderRadius: 'var(--radius-xl)',
        overflow: 'hidden', position: 'relative', padding: '24px 28px',
        boxShadow: '0 16px 40px rgba(8,14,26,0.3)', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={14} color="white" />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.85)', letterSpacing: '0.14em', fontFamily: 'var(--font-mono)' }}>
              ADMINISTRATIVE CONTROL PLANE · PRIVILEGED ACCESS
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.025em', margin: 0, marginBottom: 4 }}>
            System Administration &amp; Pipeline Control
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)', margin: 0 }}>
            Manage real-time data collection channels, user permissions, audit logs, and index parameters
          </p>
        </div>
      </div>

      {/* Navigation tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-xs)', borderBottom: '1px solid var(--color-border-primary)', paddingBottom: 'var(--space-xs)' }}>
        {[
          { id: 'pipeline', label: 'Data Pipelines' },
          { id: 'users', label: 'User Directory' },
          { id: 'audit', label: 'Audit Trail' },
          { id: 'config', label: 'System Parameters' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            style={{
              padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none',
              background: tab === t.id ? 'var(--color-brand-primary)' : 'transparent',
              color: tab === t.id ? 'white' : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              transition: 'all 150ms ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Pipeline */}
      {tab === 'pipeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                AIRFARE DATA INGESTION COLLECTORS ({sources.filter(s => s.enabled).length}/{sources.length} CONFIGURED)
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '3px 8px', borderRadius: 99, border: '1px solid rgba(217,119,6,0.3)' }}>
                DEMO MODE · VERIFY SOURCES
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {sources.map(src => (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle size={14} style={{ color: src.enabled ? 'var(--color-success)' : 'var(--color-warning)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{src.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Status: {src.obs}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: src.enabled ? 'var(--color-success)' : 'var(--color-warning)', background: src.enabled ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', padding: '2px 8px', borderRadius: 99, border: `1px solid ${src.enabled ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}` }}>
                      {src.status}
                    </span>
                    <button onClick={() => toggleSource(src.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--color-brand-primary)' }}>
                      <ToggleRight size={26} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Metrics */}
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>
              SYSTEM LATENCY &amp; THROUGHPUT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
              {[
                { label: 'Configured Feeds', value: String(sources.filter(s => s.enabled).length), sub: 'pending backend verification' },
                { label: 'Government Dataset State', value: govData.anyConnected ? 'LIVE' : 'LOCAL', sub: govData.anyConnected ? 'official fetch connected' : 'demo/cache mode' },
                { label: 'Published Index', value: 'Demo', sub: 'requires verified fare observations' },
                { label: 'Backend Health', value: _h.hasAnyConfiguredApi ? 'Keys set' : 'No keys', sub: 'client-visible providers only' },
              ].map(m => (
                <div key={m.label} className="ap-card" style={{ padding: '14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>{m.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>{m.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{m.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Users */}
      {tab === 'users' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <table className="ap-table">
            <thead>
              <tr>
                {['User','Role','Subscription Plan','Last Active','Status'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_USERS.map(u => (
                <tr key={u.email}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{u.email}</div>
                  </td>
                  <td>
                    <span className="ap-badge" style={{ background: ROLE_BADGE[u.role as keyof typeof ROLE_BADGE]?.bg, color: ROLE_BADGE[u.role as keyof typeof ROLE_BADGE]?.color }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{u.plan}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{u.lastLogin}</td>
                  <td>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 8px', borderRadius: 99, border: '1px solid rgba(22,163,74,0.3)' }}>
                      ACTIVE
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Audit */}
      {tab === 'audit' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', borderBottom: '1px solid var(--color-border-primary)' }}>
            <Button variant="neutral" onClick={downloadAuditCSV} iconEnd={<Download size={13} />}>Download Audit Log</Button>
          </div>
          <table className="ap-table">
            <thead>
              <tr>
                {['Timestamp', 'Actor', 'Action', 'Detail'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.map((entry, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    {new Date(entry.ts).toLocaleTimeString('en-IN', { hour12: false })}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{entry.actor}</td>
                  <td>
                    <span className="ap-badge" style={{ color: ACTION_COLOR[entry.action] ?? 'var(--color-text-tertiary)', background: 'var(--color-surface-secondary)' }}>
                      {entry.action}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-primary)', fontSize: 11 }}>{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Config */}
      {tab === 'config' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>
            INDEX &amp; COLLECTION PARAMETERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {thresholds.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-lg)', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t.key}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={t.value}
                    onChange={e => handleThresholdChange(t.key, Number(e.target.value))}
                    style={{ width: 72, padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', textAlign: 'right', outline: 'none' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 64 }}>{t.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
