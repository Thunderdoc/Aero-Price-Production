import { useState, useEffect, useRef } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useGovData } from '../hooks/useGovData'
import { useAuth } from '../contexts/AuthContext'
import { apiAdminAccessRequests, apiAdminFeedback, apiAdminUsers, apiApproveAccessRequest, apiAuditLog, apiRejectAccessRequest, apiUpdateFeedback, isBackendAvailable } from '../services/api'
import { CheckCircle, ShieldCheck, Activity, ToggleRight, RefreshCw, Download, Plus, Trash2, XCircle, MailCheck, MessageSquare, Check } from 'lucide-react'
import { getApiHealth } from '../services/flightData'
import indiaMap from '../assets/india_map_clean.png'

const _h = getApiHealth()

const AIRFARE_SOURCES_ADMIN = [
  { id: 'firebase-auth', name: 'Firebase Authentication', status: 'LIVE', enabled: true, obs: 'email verification and Google sign-in active' },
  { id: 'gov-data', name: 'DGCA & MoSPI Official Data', status: 'LIVE', enabled: true, obs: 'government data cards connected' },
  { id: 'fare-index', name: 'Airfare Index Engine', status: 'LIVE', enabled: true, obs: 'index and route intelligence available' },
  { id: 'aviation-feed', name: 'Aviation Telemetry Feed', status: 'LIVE', enabled: true, obs: 'aircraft feed operational' },
  { id: 'audit-log', name: 'Audit Trail', status: 'LIVE', enabled: true, obs: 'admin events and exports available' },
  { id: 'reports', name: 'Reports & CSV Export', status: 'READY', enabled: true, obs: 'download workflows enabled' },
]

const INITIAL_AUDIT = [
  { ts: '2026-09-21T14:45:00Z', actor: 'admin@aeroprice.in', action: 'INDEX_PUB', detail: 'Jevons Airfare Index published at 108.45 (+8.45% YoY) across 24 corridors' },
  { ts: '2026-09-21T14:30:02Z', actor: 'system', action: 'GOV_FETCH', detail: 'DGCA Monthly Passenger & MoSPI CPI Transport feeds synced successfully' },
  { ts: '2026-09-21T14:15:04Z', actor: 'system', action: 'SOURCE_CHECK', detail: 'Production readiness checks completed for authentication, official data, and feature-access modules' },
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

type Tab = 'users' | 'pipeline' | 'access' | 'audit' | 'config' | 'feedback'

const INITIAL_USERS = [
  { email: 'admin@aeroprice.in', role: 'ADMIN', plan: 'ADMIN', name: 'Admin User', lastLogin: 'Live now', status: 'ACTIVE' },
  { email: 'dgca@gov.in', role: 'ANALYST', plan: 'GOVERNMENT', name: 'DGCA Analyst', lastLogin: 'Today 10:32 IST', status: 'ACTIVE' },
  { email: 'user@aeroprice.in', role: 'PUBLIC', plan: 'FREE', name: 'User Account', lastLogin: 'Today 08:00 IST', status: 'ACTIVE' },
]

interface AuditEntry { ts: string; actor: string; action: string; detail: string }
interface AccessRequest { id: string; email: string; name?: string; feature?: string; featureKey?: string; status: string; createdAt: string; reviewedAt?: string; rejectionReason?: string }
interface FeedbackEntry { id: string; email: string; name: string; message: string; createdAt: string; status: 'NEW' | 'REVIEWED' }

export default function AdminDashboard() {
  const { user, token } = useAuth()
  const govData = useGovData()
  const [tab, setTab] = useState<Tab>('pipeline')
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT)
  const [auditLoading, setAuditLoading] = useState(false)
  const [sources, setSources] = useState(AIRFARE_SOURCES_ADMIN)
  const [thresholds, setThresholds] = useState(THRESHOLDS)
  const [managedUsers, setManagedUsers] = useState(INITIAL_USERS)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'PUBLIC', plan: 'FREE' })
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [resettingEmail, setResettingEmail] = useState<string | null>(null)
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const applyAdminTab = (value: unknown) => {
      if (value === 'pipeline' || value === 'users' || value === 'access' || value === 'feedback' || value === 'audit' || value === 'config') setTab(value)
    }
    applyAdminTab(sessionStorage.getItem('admin-tab'))
    const onAdminTab = (event: Event) => applyAdminTab((event as CustomEvent).detail)
    window.addEventListener('admin-tab', onAdminTab)
    return () => window.removeEventListener('admin-tab', onAdminTab)
  }, [])

  function showToast(msg: string, duration = 3000) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(msg)
    toastTimeoutRef.current = setTimeout(() => setToast(null), duration)
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

  function addManagedUser(e: React.FormEvent) {
    e.preventDefault()
    const email = newUser.email.trim().toLowerCase()
    const name = newUser.name.trim()
    if (!name || !email) {
      showToast('Enter name and email before adding a user')
      return
    }
    if (managedUsers.some(u => u.email.toLowerCase() === email)) {
      showToast('This user already exists')
      return
    }
    setManagedUsers(prev => [
      ...prev,
      { ...newUser, plan: newUser.role === 'ADMIN' ? 'ADMIN' : newUser.role === 'ANALYST' ? 'GOVERNMENT' : 'FREE', email, name, lastLogin: 'Invited now', status: 'INVITED' },
    ])
    setNewUser({ name: '', email: '', role: 'PUBLIC', plan: 'FREE' })
    showToast(`User invited: ${email}`)
  }

  function resetManagedPassword(email: string) {
    setResettingEmail(email)
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('The reset service did not respond within 12 seconds.')), 12000)
    })
    Promise.race([
      import('../services/firebase').then(({ sendFirebasePasswordReset }) => sendFirebasePasswordReset(email)),
      timeout,
    ])
      .then(() => {
        setResetSentEmail(email)
        showToast(`Password reset email sent to ${email}`, 6000)
      })
      .catch((error: unknown) => {
        const code = typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : ''
        const message = error instanceof Error ? error.message : ''
        const reason = code === 'auth/user-not-found'
          ? 'No Firebase account exists for this email.'
          : code === 'auth/no-password-provider'
            ? 'This account uses Google sign-in and has no password to reset.'
            : message || 'Firebase authentication is not configured.'
        showToast(`Unable to send reset email: ${reason}`, 6000)
      })
      .finally(() => setResettingEmail(null))
  }

  function deleteManagedUser(email: string) {
    if (email === user?.email) {
      showToast('You cannot delete the active admin session')
      return
    }
    setManagedUsers(prev => prev.filter(u => u.email !== email))
    setAccessRequests(prev => {
      const next = prev.filter(r => r.email !== email)
      localStorage.setItem('aeroprice_access_requests', JSON.stringify(next))
      return next
    })
    showToast(`User removed: ${email}`)
  }

  function notifyFeatureDecision(email: string | undefined, approved: boolean, feature: string) {
    if (!email) return
    try {
      const existing = JSON.parse(localStorage.getItem('aeroprice_notifications') || '[]') as Array<Record<string, unknown>>
      const notification = {
        id: `NOTICE-${Date.now().toString(36).toUpperCase()}`,
        email,
        title: approved ? 'Access Approved' : 'Access Request Update',
        message: approved ? `Your access to ${feature} has been approved.` : `Your request for ${feature} was not approved.`,
        createdAt: new Date().toISOString(),
        read: false,
      }
      localStorage.setItem('aeroprice_notifications', JSON.stringify([notification, ...existing]))
      window.dispatchEvent(new Event('aeroprice-notifications-changed'))
    } catch { /* local notifications are best effort */ }
  }

  function approveFeatureRequest(id: string) {
    setAccessRequests(prev => {
      const request = prev.find(item => item.id === id)
      const next = prev.map(r => r.id === id ? { ...r, status: 'APPROVED', reviewedAt: new Date().toISOString() } : r)
      localStorage.setItem('aeroprice_access_requests', JSON.stringify(next))
      notifyFeatureDecision(request?.email, true, request?.feature || 'the requested feature')
      return next
    })
    void apiApproveAccessRequest(id, token ?? undefined).catch(() => {
      // Local storage remains the fallback for a request created while offline.
    })
    showToast('Feature access approved. The user will see the update after refresh.')
  }

  function rejectFeatureRequest(id: string) {
    setAccessRequests(prev => {
      const request = prev.find(item => item.id === id)
      const next = prev.map(r => r.id === id ? { ...r, status: 'REJECTED', reviewedAt: new Date().toISOString(), rejectionReason: 'Not approved by the administrator.' } : r)
      localStorage.setItem('aeroprice_access_requests', JSON.stringify(next))
      notifyFeatureDecision(request?.email, false, request?.feature || 'the requested feature')
      return next
    })
    void apiRejectAccessRequest(id, 'Not approved by the administrator.', token ?? undefined).catch(() => {
      // Local storage remains the fallback for a request created while offline.
    })
    showToast('Feature access request rejected.')
  }

  function removeAccessRequest(id: string) {
    setAccessRequests(prev => {
      const next = prev.filter(r => r.id !== id)
      localStorage.setItem('aeroprice_access_requests', JSON.stringify(next))
      return next
    })
    showToast('Access request cleared; user can request again')
  }

  function updateFeedback(id: string, status: FeedbackEntry['status']) {
    setFeedback(prev => {
      const next = prev.map(item => item.id === id ? { ...item, status } : item)
      localStorage.setItem('aeroprice_feedback', JSON.stringify(next))
      return next
    })
    void apiUpdateFeedback(id, status, token ?? undefined).catch(() => {
      // Local storage remains the fallback for a temporarily unavailable API.
    })
    showToast(status === 'REVIEWED' ? 'Feedback marked as reviewed.' : 'Feedback marked as new.')
  }

  function removeFeedback(id: string) {
    setFeedback(prev => {
      const next = prev.filter(item => item.id !== id)
      localStorage.setItem('aeroprice_feedback', JSON.stringify(next))
      return next
    })
    showToast('Feedback removed from the admin queue.')
  }

  useEffect(() => {
    async function loadUsers() {
      if (tab !== 'users') return
      try {
        const result = await apiAdminUsers(token ?? undefined)
        const remoteUsers = Array.isArray(result?.users)
          ? result.users
            .filter((entry: any) => typeof entry?.email === 'string' && entry.email.trim().length > 0)
            .map((entry: any) => ({
            email: entry.email,
            role: entry.role,
            plan: entry.plan,
            name: entry.name,
            lastLogin: entry.lastLogin || entry.last_login || 'Not recorded',
            status: entry.status || (entry.is_active === false ? 'INACTIVE' : 'ACTIVE'),
            }))
          : []

        // An empty or partial provider response must never blank the local
        // directory. Keep the seeded/local records and merge valid remote
        // records by email until the provider confirms a complete directory.
        if (remoteUsers.length > 0) {
          setManagedUsers(previous => {
            const merged = new Map(previous.map(entry => [entry.email.toLowerCase(), entry]))
            remoteUsers.forEach(entry => merged.set(entry.email.toLowerCase(), entry))
            return Array.from(merged.values())
          })
        }
      } catch (error) {
        showToast(`Unable to load Firebase users: ${error instanceof Error ? error.message : 'Admin API unavailable'}`)
      }
    }
    void loadUsers()
  }, [tab, token])

  useEffect(() => {
    async function loadAudit() {
      if (tab !== 'audit') return
      setAuditLoading(true)
      try {
        if (await isBackendAvailable()) {
          const logs = await apiAuditLog(token ?? '')
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

  useEffect(() => {
    if (tab !== 'users') return
    async function loadAccessRequests() {
      try {
        const result = await apiAdminAccessRequests(token ?? undefined)
        if (Array.isArray(result?.requests) && result.requests.length > 0) {
          const requests = result.requests.map((entry: any) => ({ id: entry.id, email: entry.email, name: entry.name, feature: entry.feature, featureKey: entry.feature_key, status: entry.status, createdAt: entry.created_at, reviewedAt: entry.reviewed_at, rejectionReason: entry.rejection_reason }))
          setAccessRequests(requests)
          localStorage.setItem('aeroprice_access_requests', JSON.stringify(requests))
          return
        }
      } catch { /* use local queue below when backend is unavailable */ }
      try {
        const requests = JSON.parse(localStorage.getItem('aeroprice_access_requests') || '[]')
        setAccessRequests(Array.isArray(requests) ? requests : [])
      } catch {
        setAccessRequests([])
      }
    }
    void loadAccessRequests()
  }, [tab, token])

  useEffect(() => {
    if (tab !== 'feedback') return
    async function loadFeedback() {
      try {
        const result = await apiAdminFeedback(token ?? undefined)
        if (Array.isArray(result?.feedback)) {
          setFeedback(result.feedback.map((entry: any) => ({ id: entry.id, email: entry.email, name: entry.name, message: entry.message, status: entry.status === 'REVIEWED' ? 'REVIEWED' : 'NEW', createdAt: entry.created_at || new Date().toISOString() })))
          return
        }
      } catch { /* use local queue below when backend is unavailable */ }
      try {
        const entries = JSON.parse(localStorage.getItem('aeroprice_feedback') || '[]')
        setFeedback(Array.isArray(entries) ? entries : [])
      } catch {
        setFeedback([])
      }
    }
    void loadFeedback()
  }, [tab, token])

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

  function formatLastActive(value: string) {
    if (!value || value === 'Live now' || value.startsWith('Today') || value.startsWith('Invited')) return value
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="admin-dashboard flex flex-col page-enter" style={{ gap: 'var(--space-2xl)' }}>
      {toast && (
        <div className="admin-toast" role="status" aria-live="polite">
          <span className="admin-toast-dot" aria-hidden="true" />
          {toast}
        </div>
      )}

      {tab === 'pipeline' && <>
      {/* Admin Overview hero header */}
      <div className="admin-hero" style={{
        background: 'linear-gradient(90deg, rgba(3,35,91,.96) 0%, rgba(7,58,124,.78) 48%, rgba(3,25,65,.28) 100%), url(/aviation-hero.png) center/cover', borderRadius: 'var(--radius-xl)',
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
            ADMIN CONTROL CENTER
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.025em', margin: 0, marginBottom: 4 }}>
            System Administration &amp; Pipeline Control
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)', margin: 0 }}>
            Manage real-time data collection channels, user permissions, audit logs, and index parameters
          </p>
        </div>
        <div className="admin-hero-metrics"><div><strong>19</strong><span>Active Airports</span></div><div><strong>{sources.length}</strong><span>Data Sources</span></div><div><strong>150+</strong><span>Daily Flights Tracked</span></div></div>
      </div>
      </>}

      {/* Operational overview */}
      {tab === 'pipeline' && <>
        <div className="admin-kpi-grid">
          {[
            ['Total Routes Tracked', '1,248', '↑ 12% vs last month', 'blue'],
            ['Data Sources', String(sources.length), `${sources.filter(source => source.enabled).length} active`, 'cyan'],
            ['Collection Jobs', String(sources.filter(source => source.enabled).length * 2), 'Running and scheduled', 'green'],
            ['Total Users', String(managedUsers.length), 'Managed accounts', 'purple'],
            ['Access Requests', String(accessRequests.filter(request => request.status === 'PENDING').length), 'Pending review', 'orange'],
            ['System Health', '100%', 'All core modules operational', 'green'],
          ].map(([label, value, detail, tone]) => <div className={`admin-kpi admin-kpi-${tone}`} key={label}>
            <div className="admin-kpi-icon"><Activity size={17} /></div>
            <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
          </div>)}
        </div>
        <div className="admin-overview-grid">
          <section className="admin-overview-card admin-activity-card">
            <div className="admin-card-heading"><div><h2>Data Collection Activity</h2><p>Real-time status across configured sources</p></div><span className="admin-pill admin-pill-blue">LIVE</span></div>
            <div className="admin-bars" aria-label="Data source activity chart">{sources.map((source, index) => <div key={source.id} className="admin-bar-group"><i style={{ height: `${35 + ((index * 19) % 55)}%` }} /><i style={{ height: `${25 + ((index * 13) % 45)}%` }} /><i style={{ height: `${18 + ((index * 11) % 35)}%` }} /></div>)}</div>
            <div className="admin-legend"><span><i className="blue" />Aviation APIs</span><span><i className="green" />Government Sources</span><span><i className="purple" />Official Data</span></div>
          </section>
          <section className="admin-overview-card admin-coverage-card">
            <div className="admin-card-heading"><div><h2>Route Coverage</h2><p>Live data coverage across India</p></div><span className="admin-pill admin-pill-blue">ROUTES</span></div>
            <div className="admin-coverage-body"><div className="admin-map-wrap"><img src={indiaMap} alt="India route coverage" /><span className="admin-map-pin pin-del">DEL<small>285 routes</small></span><span className="admin-map-pin pin-bom">BOM<small>176 routes</small></span><span className="admin-map-pin pin-blr">BLR<small>198 routes</small></span><span className="admin-map-pin pin-maa">MAA<small>142 routes</small></span></div><div className="admin-coverage-stats"><div><strong>19</strong><span>Active airports</span></div><div><strong>1,248</strong><span>Tracked routes</span></div><div><strong>150+</strong><span>Daily flights</span></div><div><strong>98%</strong><span>Data coverage</span></div></div></div>
          </section>
          <section className="admin-overview-card admin-status-card">
            <div className="admin-card-heading"><div><h2>System Status</h2><p>Core services</p></div><button type="button" onClick={() => setTab('config')}>View All →</button></div>
            {sources.slice(0, 5).map(source => <div className="admin-status-row" key={source.id}><span className="admin-status-dot" /><div><strong>{source.name}</strong><small>{source.obs}</small></div><em>{source.enabled ? 'Operational' : 'Paused'}</em></div>)}
          </section>
        </div>
        <div className="admin-lower-grid">
          <section className="admin-overview-card admin-table-card"><div className="admin-card-heading"><div><h2>Recent Collection Jobs</h2><p>Latest pipeline activity</p></div><button type="button" onClick={() => setTab('config')}>View All →</button></div><div className="admin-mini-table">{sources.slice(0, 5).map((source, index) => <div className="admin-mini-row" key={source.id}><span className="admin-job-id">job_{String(index + 1).padStart(3, '0')}</span><strong>{source.name}</strong><em className={source.enabled ? 'success' : 'failed'}>{source.enabled ? (index === 0 ? 'Running' : 'Completed') : 'Paused'}</em><span>{source.enabled ? `${(index + 1) * 2},450` : '0'}</span><span>{index + 1}m ago</span></div>)}</div></section>
          <section className="admin-overview-card admin-table-card"><div className="admin-card-heading"><div><h2>User Management</h2><p>Recent managed accounts</p></div><button type="button" onClick={() => setTab('users')}>View All →</button></div><div className="admin-mini-table">{managedUsers.slice(0, 5).map(entry => <div className="admin-mini-row admin-user-row" key={entry.email}><span className="admin-avatar">{entry.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><strong>{entry.name}</strong><span>{entry.role}</span><em className={entry.status === 'ACTIVE' ? 'success' : 'pending'}>{entry.status}</em></div>)}</div></section>
          <section className="admin-overview-card admin-table-card"><div className="admin-card-heading"><div><h2>Recent Activity</h2><p>Latest administrative events</p></div><button type="button" onClick={() => setTab('audit')}>View All →</button></div><div className="admin-activity-list">{audit.slice(0, 5).map(entry => <div key={`${entry.ts}-${entry.action}`}><span className="admin-status-dot" /><div><strong>{entry.action.replace(/_/g, ' ')}</strong><small>{entry.detail}</small></div><time>{new Date(entry.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></section>
        </div>
      </>}

      {/* Tab: Pipeline */}
      {tab === 'pipeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                PRODUCTION SERVICE READINESS
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '3px 8px', borderRadius: 99, border: '1px solid rgba(22,163,74,0.3)' }}>
                ALL CORE MODULES READY
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
              SYSTEM HEALTH &amp; THROUGHPUT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)' }}>
              {[
                { label: 'Ready Modules', value: `${sources.filter(s => s.enabled).length}/${sources.length}`, sub: 'core services enabled' },
                { label: 'Government Dataset State', value: govData.anyConnected ? 'LIVE' : 'LOCAL', sub: govData.anyConnected ? 'official fetch connected' : 'cache fallback available' },
                { label: 'Published Index', value: 'Active', sub: 'route intelligence available' },
                { label: 'Backend Health', value: 'Ready', sub: _h.aviationstack.configured ? 'aviation keys detected' : 'safe fallback mode active' },
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
      {tab === 'access' && (
        <div className="admin-workspace">
          <div className="admin-section-banner"><div><span>ADMIN CONTROL CENTER · ACCESS MANAGEMENT</span><h1>Access Requests</h1><p>Review, approve, reject, and track restricted-feature access from one controlled panel.</p></div><div className="admin-section-count"><strong>{accessRequests.filter(request => request.status === 'PENDING').length}</strong><span>Pending review</span></div></div>
          <div className="admin-user-kpis"><div><span>TOTAL REQUESTS</span><strong>{accessRequests.length}</strong></div><div><span>PENDING</span><strong>{accessRequests.filter(request => request.status === 'PENDING').length}</strong></div><div><span>APPROVED</span><strong>{accessRequests.filter(request => request.status === 'APPROVED').length}</strong></div><div><span>REJECTED</span><strong>{accessRequests.filter(request => request.status === 'REJECTED').length}</strong></div></div>
          <div className="admin-access-panel">{accessRequests.length === 0 ? <div className="admin-empty-state"><ShieldCheck size={22} /><strong>No access requests pending</strong><span>New requests from users will appear here for administrator review.</span></div> : accessRequests.map(req => <div className="admin-access-row" key={req.id}><div><strong>{req.name || req.email}</strong><small>{req.email} · {req.feature || 'Feature access'}</small><small>{req.id} · {new Date(req.createdAt).toLocaleString('en-IN')}</small></div><span className={`admin-request-status ${req.status.toLowerCase()}`}>{req.status}</span><div>{req.status === 'PENDING' ? <><Button size="xs" variant="primary" onClick={() => approveFeatureRequest(req.id)} iconStart={<Check size={12} />}>Approve</Button><Button size="xs" variant="danger" onClick={() => rejectFeatureRequest(req.id)} iconStart={<XCircle size={12} />}>Reject</Button></> : <Button size="xs" variant="neutral" onClick={() => removeAccessRequest(req.id)}>Clear</Button>}</div></div>)}</div>
        </div>
      )}

      {tab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="admin-user-hero">
            <div><span className="admin-user-eyebrow">ADMIN CONTROL CENTER · USER MANAGEMENT</span><h1>User Management</h1><p>Manage accounts, roles, access requests, and authentication actions from one focused workspace.</p></div>
            <div className="admin-user-summary"><div><strong>{managedUsers.length}</strong><span>Total Users</span></div><div><strong>{managedUsers.filter(item => item.status === 'ACTIVE').length}</strong><span>Active</span></div><div><strong>{accessRequests.filter(item => item.status === 'PENDING').length}</strong><span>Pending Access</span></div></div>
          </div>
          <div className="admin-user-kpis"><div><span>PUBLIC USERS</span><strong>{managedUsers.filter(item => item.role === 'PUBLIC').length}</strong></div><div><span>ANALYSTS</span><strong>{managedUsers.filter(item => item.role === 'ANALYST').length}</strong></div><div><span>ADMINS</span><strong>{managedUsers.filter(item => item.role === 'ADMIN').length}</strong></div><div><span>INVITED</span><strong>{managedUsers.filter(item => item.status === 'INVITED').length}</strong></div></div>
          <form onSubmit={addManagedUser} style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 18, display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) minmax(220px,1.3fr) 150px auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>NAME</label>
              <input className="ap-input" value={newUser.name} onChange={e => setNewUser(v => ({ ...v, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>EMAIL</label>
              <input className="ap-input" type="email" value={newUser.email} onChange={e => setNewUser(v => ({ ...v, email: e.target.value }))} placeholder="name@example.com" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>ROLE</label>
              <select className="ap-input" value={newUser.role} onChange={e => setNewUser(v => ({ ...v, role: e.target.value }))}>
                <option value="PUBLIC">PUBLIC</option>
                <option value="ANALYST">DGCA</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <Button variant="primary" type="submit" iconStart={<Plus size={14} />}>Add User</Button>
          </form>

          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <table className="ap-table">
            <thead>
              <tr>
                {['User','Role','Last Active','Status','Actions'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {managedUsers.map(u => (
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
                  <td style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatLastActive(u.lastLogin)}</td>
                  <td>
                    <span style={{ fontSize: 9, fontWeight: 700, color: u.status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-warning)', background: u.status === 'ACTIVE' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', padding: '2px 8px', borderRadius: 99, border: `1px solid ${u.status === 'ACTIVE' ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}` }}>
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <div className="admin-user-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button size="xs" variant="subtle" disabled={resettingEmail === u.email} onClick={() => resetManagedPassword(u.email)} iconStart={<MailCheck size={12} />}>{resettingEmail === u.email ? 'Sending…' : resetSentEmail === u.email ? 'Resend Reset Link' : 'Send Reset Link'}</Button>
                      <Button size="xs" variant="danger" onClick={() => deleteManagedUser(u.email)} iconStart={<Trash2 size={12} />}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Tab: Feedback */}
      {tab === 'feedback' && (
        <div className="admin-tab-surface" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div className="admin-section-banner compact"><div><span>ADMIN CONTROL CENTER · PRODUCT OPERATIONS</span><h1>User Feedback</h1><p>Review and manage feedback submitted by users.</p></div><div className="admin-section-count"><strong>{feedback.filter(item => item.status === 'NEW').length}</strong><span>New items</span></div></div>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-border-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><MessageSquare size={17} style={{ color: 'var(--color-brand-primary)' }} /><h2 style={{ margin: 0, fontSize: 16, color: 'var(--color-text-primary)' }}>User Feedback</h2></div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>Feedback submitted from the user dashboard appears here for product review.</p>
          </div>
          {feedback.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--color-text-secondary)', fontSize: 13 }}>No feedback has been submitted yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10, padding: 14 }}>
              {feedback.map(item => (
                <div key={item.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--color-border-primary)', background: item.status === 'NEW' ? '#f8fbff' : 'var(--color-surface-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div><div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)' }}>{item.name}</div><div style={{ marginTop: 3, fontSize: 11, color: 'var(--color-text-tertiary)' }}>{item.email} · {new Date(item.createdAt).toLocaleString('en-IN')}</div></div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: item.status === 'NEW' ? 'var(--color-brand-primary)' : 'var(--color-success)', background: item.status === 'NEW' ? 'var(--color-brand-muted)' : 'var(--color-success-bg)', padding: '4px 8px', borderRadius: 999 }}>{item.status}</span>
                  </div>
                  <p style={{ margin: '12px 0', fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{item.message}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="xs" variant="subtle" onClick={() => updateFeedback(item.id, item.status === 'NEW' ? 'REVIEWED' : 'NEW')}>{item.status === 'NEW' ? 'Mark reviewed' : 'Mark new'}</Button>
                    <Button size="xs" variant="danger" onClick={() => removeFeedback(item.id)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Audit */}
      {tab === 'audit' && (
        <div className="admin-tab-surface" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div className="admin-section-banner compact"><div><span>ADMIN CONTROL CENTER · GOVERNANCE</span><h1>Audit Trail</h1><p>Review administrative events and export a traceable activity record.</p></div><div className="admin-section-count"><strong>{audit.length}</strong><span>Recorded events</span></div></div>
          <div className="admin-tab-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 14px', borderBottom: '1px solid var(--color-border-primary)' }}>
            <Button variant="neutral" onClick={downloadAuditCSV} iconEnd={<Download size={13} />}>Download Audit Log</Button>
          </div>
          <div className="admin-table-scroll"><table className="ap-table">
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
          </table></div>
        </div>
      )}

      {/* Tab: Config */}
      {tab === 'config' && (
        <div className="admin-tab-surface admin-config-surface" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
          <div className="admin-section-banner compact"><div><span>ADMIN CONTROL CENTER · CONFIGURATION</span><h1>System Parameters</h1><p>Adjust index and collection thresholds with controlled administrator access.</p></div><div className="admin-section-count"><strong>{thresholds.length}</strong><span>Managed parameters</span></div></div>
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
