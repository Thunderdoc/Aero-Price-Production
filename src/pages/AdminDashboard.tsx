import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useGovData } from '../hooks/useGovData'
import { AlertTriangle, CheckCircle, XCircle, Shield, Users, Activity, FileText, Settings, ToggleLeft } from 'lucide-react'

const AIRFARE_SOURCES_ADMIN = [
  { id: 'indigo', name: 'IndiGo', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'airindia', name: 'Air India', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'aiex', name: 'Air India Express', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'akasa', name: 'Akasa Air', status: 'CHALLENGE_DETECTED', enabled: false },
  { id: 'spicejet', name: 'SpiceJet', status: 'CHALLENGE_DETECTED', enabled: false },
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

const AUDIT_LOG = [
  { ts: new Date().toISOString(), level: 'INFO' as const, message: 'Admin dashboard opened · admin@aeroprice.in' },
  { ts: new Date(Date.now() - 60000).toISOString(), level: 'WARN' as const, message: 'Gov fetch attempted: dgca.gov.in — awaiting AllOrigins proxy response' },
  { ts: new Date(Date.now() - 120000).toISOString(), level: 'INFO' as const, message: 'Auth: dgca@gov.in logged in (ANALYST/GOVERNMENT)' },
  { ts: new Date(Date.now() - 300000).toISOString(), level: 'INFO' as const, message: 'Auth: user@aeroprice.in logged in (PUBLIC/SUBSCRIBER)' },
  { ts: new Date(Date.now() - 600000).toISOString(), level: 'WARN' as const, message: 'Airfare collection attempt: IndiGo — CHALLENGE DETECTED. Cloudflare blocked request.' },
  { ts: new Date(Date.now() - 660000).toISOString(), level: 'WARN' as const, message: 'Airfare collection attempt: Air India — CHALLENGE DETECTED. Imperva middleware blocked.' },
  { ts: new Date(Date.now() - 720000).toISOString(), level: 'ERROR' as const, message: 'No live airfare observations available — all 5 sources blocked by bot protection' },
  { ts: new Date(Date.now() - 1800000).toISOString(), level: 'INFO' as const, message: 'System started · SIH26056 AeroPrice India v2.0.0' },
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

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('users')
  const [audit] = useState(INITIAL_AUDIT)
  const [thresholds, setThresholds] = useState(THRESHOLDS)
  const govData = useGovData()
  const now = new Date()
  const timestamp = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST'

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
          { label: 'Observations/hr', value: '0', color: 'var(--color-text-tertiary)', sub: 'no airfare sources connected' },
          { label: 'Active Users', value: '3', color: 'var(--color-brand-primary)', sub: 'demo session' },
          { label: 'Gov Fetches/day', value: '4', color: 'var(--color-info)', sub: 'CONFIGURED' },
          { label: 'Anomalies (24h)', value: '0', color: 'var(--color-success)', sub: 'no real data' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', border: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'var(--font-sans)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-primary)', gap: 0 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 12, fontWeight: tab === id ? 600 : 400, fontFamily: 'var(--font-sans)',
            color: tab === id ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
            borderBottom: tab === id ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'users' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}>
                  {['User', 'Email', 'Role', 'Plan', 'Last Login', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_USERS.map(u => {
                  const rb = ROLE_BADGE[u.role as keyof typeof ROLE_BADGE] ?? ROLE_BADGE['PUBLIC']
                  return (
                    <tr key={u.email} style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{u.name}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.email}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: rb.color, background: rb.bg, padding: '2px 6px', borderRadius: 3 }}>{u.role}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary)' }}>{u.plan}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--color-text-secondary)', fontSize: 11 }}>{u.lastLogin}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 6px', borderRadius: 3 }}>{u.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', borderTop: '1px solid var(--color-border-primary)' }}>
            Demo environment — 3 users shown. Production would include full user CRUD, invite flows, and SSO.
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
                <div key={m.label} style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 14px', minWidth: 120 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{m.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}>
                  {['Timestamp', 'Actor', 'Action', 'Detail'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((entry, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                    <td style={{ padding: '8px 14px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(entry.ts).toLocaleTimeString('en-IN', { hour12: false })}
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{entry.actor}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: ACTION_COLOR[entry.action] ?? 'var(--color-text-tertiary)', padding: '2px 6px', borderRadius: 3, background: 'var(--color-surface-secondary)' }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ padding: '8px 14px', color: 'var(--color-text-secondary)', fontSize: 11 }}>{entry.detail}</td>
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
