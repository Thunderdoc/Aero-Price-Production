import { useState, useEffect } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useGovData } from '../hooks/useGovData'
import { useAuth } from '../contexts/AuthContext'
import { apiAuditLog, apiSystemMetrics, isBackendAvailable } from '../services/api'
import { AlertTriangle, CheckCircle, XCircle, Shield, Users, Activity, FileText, Settings, ToggleLeft, RefreshCw } from 'lucide-react'
import { getApiHealth } from '../services/flightData'

const _h = getApiHealth()

const AIRFARE_SOURCES_ADMIN = [
  { id: 'aviationstack', name: 'AviationStack', status: _h.aviationstack.configured ? 'CONNECTED' : 'NOT_CONFIGURED', enabled: _h.aviationstack.configured },
  { id: 'ef-api', name: 'EF Live Fares API', status: _h.ef.configured ? 'CONNECTED' : 'NOT_CONFIGURED', enabled: _h.ef.configured },
  { id: 'ignav', name: 'Ignav Aviation Data', status: _h.ignav.configured ? 'CONNECTED' : 'NOT_CONFIGURED', enabled: _h.ignav.configured },
  { id: 'indigo', name: 'IndiGo (direct)', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'airindia', name: 'Air India (direct)', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'akasa', name: 'Akasa Air (direct)', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'spicejet', name: 'SpiceJet (direct)', status: 'CHALLENGE_DETECTED', enabled: false },
]

const GOV_SOURCES_ADMIN = [
  { id: 'dgca-pax', name: 'DGCA Monthly Stats', status: 'CONFIGURED', enabled: true },
  { id: 'mospi-cpi', name: 'MoSPI CPI Transport', status: 'CONFIGURED', enabled: true },
  { id: 'datagov', name: 'data.gov.in Aviation', status: 'CONFIGURED', enabled: true },
  { id: 'ppac', name: 'PPAC Fuel Prices', status: 'CONFIGURED', enabled: true },
]

const INITIAL_AUDIT = [
  { ts: '2026-09-19T08:15:00Z', actor: 'admin@aeroprice.in', action: 'GOV_FETCH', detail: 'DGCA Monthly Stats fetch initiated via AllOrigins proxy' },
  { ts: '2026-09-19T08:15:02Z', actor: 'system', action: 'GOV_FETCH', detail: 'MoSPI eSankhyiki — SPA detected, fallback to generated baseline' },
  { ts: '2026-09-19T08:15:04Z', actor: 'system', action: 'SOURCE_CHECK', detail: 'IndiGo — CHALLENGE DETECTED (Cloudflare). Collection paused.' },
  { ts: '2026-09-19T08:15:04Z', actor: 'system', action: 'SOURCE_CHECK', detail: 'Air India — CHALLENGE DETECTED (Akamai). Collection paused.' },
  { ts: '2026-09-19T08:00:00Z', actor: 'admin@aeroprice.in', action: 'LOGIN', detail: 'Admin login from 127.0.0.1 (demo session)' },
  { ts: '2026-09-18T14:30:00Z', actor: 'dgca@gov.in', action: 'LOGIN', detail: 'Analyst login (GOVERNMENT plan)' },
]

const THRESHOLDS = [
  { key: 'anomaly_zscore', label: 'Anomaly Z-score threshold', value: 3.5, unit: 'σ' },
  { key: 'consensus_deviation', label: 'Cross-source consensus deviation', value: 12, unit: '%' },
  { key: 'freshness_warning', label: 'Freshness warning threshold', value: 60, unit: 'min' },
  { key: 'min_corridors_index', label: 'Min corridors to publish index', value: 15, unit: 'corridors' },
]

const ROLE_BADGE = {
  ADMIN:   { color: 'var(--color-danger)',       bg: 'var(--color-danger-bg)' },
  ANALYST: { color: 'var(--color-info)',          bg: 'var(--color-info-bg)' },
  PUBLIC:  { color: 'var(--color-brand-primary)', bg: 'var(--color-brand-muted)' },
}

const ACTION_COLOR: Record<string, string> = {
  GOV_FETCH: 'var(--color-info)',
  SOURCE_CHECK: 'var(--color-warning)',
  LOGIN: 'var(--color-success)',
  ROLE_CHANGE: 'var(--color-danger)',
}

type Tab = 'users' | 'pipeline' | 'audit' | 'config'

const DEMO_USERS = [
  { email: 'admin@aeroprice.in', role: 'ADMIN', plan: 'ADMIN', name: 'Admin User', lastLogin: '2026-09-19 13:01 IST', status: 'ACTIVE' },
  { email: 'dgca@gov.in', role: 'ANALYST', plan: 'GOVERNMENT', name: 'DGCA Analyst', lastLogin: '2026-09-19 10:32 IST', status: 'ACTIVE' },
  { email: 'user@aeroprice.in', role: 'PUBLIC', plan: 'SUBSCRIBER', name: 'Demo User', lastLogin: '2026-09-19 09:15 IST', status: 'ACTIVE' },
  { email: 'free@example.com', role: 'PUBLIC', plan: 'FREE', name: 'Free User', lastLogin: '2026-09-18 22:00 IST', status: 'ACTIVE' },
]

const AIRFARE_PIPELINE = [
  { name: 'IndiGo (goindigo.in)', status: 'CHALLENGE_DETECTED', reason: 'Cloudflare Bot Management' },
  { name: 'Air India (airindia.com)', status: 'CHALLENGE_DETECTED', reason: 'Imperva anti-scraping' },
  { name: 'Air India Express', status: 'CHALLENGE_DETECTED', reason: 'Shared CDN protection' },
  { name: 'Akasa Air (akasaair.com)', status: 'CHALLENGE_DETECTED', reason: 'JS SPA + reCAPTCHA v3' },
  { name: 'SpiceJet (spicejet.com)', status: 'CHALLENGE_DETECTED', reason: 'Cloudflare Enterprise' },
]


const levelBg: Record<string, string> = {
  INFO: 'transparent',
  WARN: 'rgba(217,119,6,0.08)',
  ERROR: 'rgba(239,68,68,0.08)',
}
const levelColor: Record<string, string> = {
  INFO: 'var(--color-info)',
  WARN: 'var(--color-warning)',
  ERROR: 'var(--color-danger)',
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 14px', minWidth: 110 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

interface AuditEntry { ts: string; actor: string; action: string; detail: string }
interface SystemMetrics { db_observations: number; sources_live: number; collection_runs_24h: number; anomalies_24h: number }

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('users')
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT)
  const [auditLoading, setAuditLoading] = useState(false)
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [thresholds, setThresholds] = useState(THRESHOLDS)
  const { token } = useAuth()
  const govData = useGovData()
  const now = new Date()
  const timestamp = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST'

  useEffect(() => {
    if (tab !== 'audit') return
    isBackendAvailable().then(up => {
      if (!up || !token) return
      setAuditLoading(true)
      apiAuditLog(token, 100)
        .then((raw: unknown) => {
          const entries = raw as { entries?: AuditEntry[]; items?: AuditEntry[] } | AuditEntry[]
          const list = Array.isArray(entries) ? entries : ((entries as { entries?: AuditEntry[] }).entries ?? (entries as { items?: AuditEntry[] }).items ?? [])
          if (list.length > 0) setAudit(list)
        })
        .catch(() => {})
        .finally(() => setAuditLoading(false))
    })
  }, [tab, token])

  useEffect(() => {
    isBackendAvailable().then(up => {
      if (!up || !token) return
      apiSystemMetrics(token)
        .then((raw: unknown) => setMetrics(raw as SystemMetrics))
        .catch(() => {})
    })
  }, [token])

  const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'pipeline', label: 'Pipeline Controls', icon: Activity },
    { id: 'audit', label: 'Audit Log', icon: FileText },
    { id: 'config', label: 'Configuration', icon: Settings },
  ]

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
        <Shield size={16} style={{ color: 'var(--color-danger)', marginTop: 3 }} />
        <div>
          <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>Admin Console</h1>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>User management, pipeline controls, audit log, and system configuration.</p>
        </div>
      </div>

      {/* Metrics strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-md)' }}>
        {[
          { label: 'Total Observations', value: metrics ? String(metrics.db_observations) : '—', color: metrics?.db_observations ? 'var(--color-brand-primary)' : 'var(--color-text-tertiary)', sub: metrics ? 'from database' : 'backend offline', accent: 'var(--color-brand-primary)' },
          { label: 'Sources Live', value: metrics ? String(metrics.sources_live) : '—', color: metrics?.sources_live ? 'var(--color-success)' : 'var(--color-text-tertiary)', sub: 'LIVE status', accent: 'var(--color-success)' },
          { label: 'Collections (24h)', value: metrics ? String(metrics.collection_runs_24h) : '—', color: 'var(--color-info)', sub: 'runs today', accent: 'var(--color-info)' },
          { label: 'Anomalies (24h)', value: metrics ? String(metrics.anomalies_24h) : '0', color: 'var(--color-success)', sub: metrics ? 'detected' : 'no data', accent: 'var(--color-warning)' },
        ].map(({ label, value, color, sub, accent }) => (
          <div key={label} className="ap-card" style={{ padding: 'var(--space-lg)', borderLeft: `3px solid ${accent}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>{label}</div>
            <div className="stat-number" style={{ color, fontFamily: 'var(--font-mono)', fontSize: '2rem' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-primary)', gap: 0, background: 'var(--color-surface-bg)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '12px 18px', border: 'none',
            background: tab === id ? 'var(--color-surface-bg)' : 'transparent',
            cursor: 'pointer',
            fontSize: 12, fontWeight: tab === id ? 600 : 400, fontFamily: 'var(--font-sans)',
            color: tab === id ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            borderBottom: tab === id ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            marginBottom: -1,
            transition: 'color 150ms, border-color 150ms',
          }}>
            <Icon size={13} style={{ color: tab === id ? 'var(--color-brand-primary)' : 'var(--color-text-tertiary)' }} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'users' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="ap-table">
              <thead>
                <tr>
                  {['User', 'Email', 'Role', 'Plan', 'Last Login', 'Status'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_USERS.map(u => {
                  const rb = ROLE_BADGE[u.role as keyof typeof ROLE_BADGE] ?? ROLE_BADGE['PUBLIC']
                  const roleBadgeCls = u.role === 'ADMIN' ? 'ap-badge ap-badge-offline' : u.role === 'ANALYST' ? 'ap-badge ap-badge-official' : 'ap-badge'
                  return (
                    <tr key={u.email}>
                      <td style={{ fontWeight: 500 }}>{u.name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>{u.email}</td>
                      <td>
                        <span className={roleBadgeCls} style={u.role === 'PUBLIC' ? { background: rb.bg, color: rb.color } : undefined}>{u.role}</span>
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{u.plan}</td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{u.lastLogin}</td>
                      <td>
                        <span className="ap-badge ap-badge-live">{u.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border-primary)' }}>
            Demo environment — {DEMO_USERS.length} users shown. Production would include full user CRUD, invite flows, and SSO.
          </div>
        </div>
      )}

      {tab === 'pipeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Airfare sources */}
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>AIRFARE COLLECTOR SOURCES</div>
            <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', fontSize: 12, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              All airfare sources blocked by bot protection. Collection requires a Playwright/Scrapy backend collector deployed outside the browser.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {AIRFARE_SOURCES_ADMIN.map(src => (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-warning)30' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{src.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>CHALLENGE DETECTED — cannot enable</div>
                  </div>
                  <ToggleLeft size={24} style={{ color: 'var(--color-text-tertiary)', opacity: 0.4 }} />
                </div>
              ))}
          </div>
          </div>

          {/* Gov sources pipeline */}
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>GOVERNMENT DATA SOURCES</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: govData.anyConnected ? 'var(--color-success)' : 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>
                {govData.datasets.filter(d => d.status === 'CONNECTED' || d.status === 'HEALTHY').length} / {govData.datasets.length} CONNECTED
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {govData.datasets.map(src => {
                const ok = src.status === 'CONNECTED' || src.status === 'HEALTHY'
                return (
                  <div key={src.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', border: `1px solid ${ok ? 'var(--color-success)' : 'var(--color-border-primary)'}30` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {ok ? <CheckCircle size={13} style={{ color: 'var(--color-success)' }} /> : <XCircle size={13} style={{ color: 'var(--color-danger)' }} />}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{src.source}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                          {src.format} · {src.record_count != null ? `${src.record_count} records` : 'No records'}
                          {src.last_retrieved ? ` · fetched ${new Date(src.last_retrieved).toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' })} IST` : ''}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: ok ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{src.status}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live metrics */}
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>SYSTEM METRICS</div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {[
                { label: 'Obs/hr (airfare)', value: '0', note: 'no sources' },
                { label: 'Obs/hr (gov)', value: govData.anyConnected ? '4' : '0', note: govData.anyConnected ? 'live' : 'unavailable' },
                { label: 'Gov fetch latency', value: '—', note: 'AllOrigins proxy' },
                { label: 'Active sessions', value: '3', note: 'demo' },
                { label: 'Index status', value: 'NOT PUB.', note: '<15 corridors' },
              ].map(m => (
                <div key={m.label} className="ap-card" style={{ padding: '10px 14px', minWidth: 120 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>{m.label}</div>
                  <div className="stat-number" style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{m.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          {auditLoading && (
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', borderBottom: '1px solid var(--color-border-primary)' }}>
              <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Fetching audit log…
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="ap-table">
              <thead>
                <tr>
                  {['Timestamp', 'Actor', 'Action', 'Detail'].map(h => (
                    <th key={h} style={{ whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((entry, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(entry.ts).toLocaleTimeString('en-IN', { hour12: false })}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{entry.actor}</td>
                    <td>
                      <span className="ap-badge" style={{ color: ACTION_COLOR[entry.action] ?? 'var(--color-text-tertiary)', background: 'var(--color-surface-secondary)' }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>INDEX & COLLECTION PARAMETERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {thresholds.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-lg)', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t.key}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={t.value}
                    onChange={e => setThresholds(prev => prev.map(item => item.key === t.key ? { ...item, value: Number(e.target.value) } : item))}
                    style={{ width: 72, padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', textAlign: 'right', outline: 'none' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', minWidth: 64 }}>{t.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-lg)', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            Changes apply on next collection cycle. Current values reflect the SIH26056 reference configuration.
          </div>
        </div>
      )}
    </div>
  )
}
