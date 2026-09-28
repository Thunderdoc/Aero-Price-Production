import { useState, useEffect, useRef } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../contexts/AuthContext'
import { apiAdminAccessRequests, apiAdminFeedback, apiAdminUsers, apiApproveAccessRequest, apiAuditLog, apiRejectAccessRequest, apiUpdateFeedback, apiSources, apiDashboard, apiHealth, apiSystemParameters, isBackendAvailable, type SystemParametersResponse } from '../services/api'
import { CheckCircle, ShieldCheck, Activity, RefreshCw, Download, Plus, Trash2, XCircle, MailCheck, MessageSquare, Check } from 'lucide-react'
import indiaMap from '../assets/india_map_clean.png'

const AIRFARE_SOURCES_ADMIN: Array<{ id: string; name: string; status: string; enabled: boolean; obs: string }> = []

const INITIAL_AUDIT: Array<{ ts: string; actor: string; action: string; detail: string }> = []

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

type Tab = 'overview' | 'users' | 'pipeline' | 'health' | 'access' | 'audit' | 'config' | 'feedback'

type ManagedUser = { email: string; role: string; plan: string; name: string; lastLogin: string; status: string }
const INITIAL_USERS: ManagedUser[] = []

interface AuditEntry { ts: string; actor: string; action: string; detail: string }
interface AccessRequest { id: string; email: string; name?: string; feature?: string; featureKey?: string; status: string; createdAt: string; reviewedAt?: string; rejectionReason?: string }
interface FeedbackEntry { id: string; email: string; name: string; message: string; createdAt: string; status: 'NEW' | 'REVIEWED' }

export default function AdminDashboard() {
  const { user, token } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT)
  const [auditLoading, setAuditLoading] = useState(false)
  const [sources, setSources] = useState(AIRFARE_SOURCES_ADMIN)
  const [systemParameters, setSystemParameters] = useState<SystemParametersResponse | null>(null)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(INITIAL_USERS)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'PUBLIC', plan: 'FREE' })
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [healthData, setHealthData] = useState<any>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [resettingEmail, setResettingEmail] = useState<string | null>(null)
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function loadPipelineData() {
      if ((tab !== 'pipeline' && tab !== 'overview') || !token) return
      try {
        const [directoryResult, dashboardResult, healthResult] = await Promise.allSettled([apiSources(token), apiDashboard(token), apiHealth()])
        if (dashboardResult.status === 'fulfilled') setDashboardData(dashboardResult.value)
        if (healthResult.status === 'fulfilled') setHealthData(healthResult.value)
        if (directoryResult.status === 'fulfilled') {
          const directory = directoryResult.value
          const airfare = directory.airfare || directory.airfare_sources || []
          const government = directory.government || directory.government_sources || []
          const liveSources = [...airfare, ...government]
          setSources(liveSources.map((source: any) => ({
            id: String(source.id || source.source_id),
            name: String(source.name || source.source_name || source.id || 'Source'),
            status: String(source.status || 'NOT_CONFIGURED'),
            enabled: source.status === 'LIVE',
            obs: `${Number(source.records_total || 0).toLocaleString()} records`,
          })))
        }
        if (dashboardResult.status === 'rejected' && healthResult.status === 'rejected' && directoryResult.status === 'rejected') {
          throw new Error('No admin data services responded')
        }
        // Loading the pipeline is silent; status is visible in the page itself.
      } catch {
        showToast('Unable to load live pipeline data. The backend is still starting or the session expired.')
      }
    }
    void loadPipelineData()
  }, [tab, token])

  useEffect(() => {
    if (tab !== 'health' || healthData) return
    void apiHealth().then(setHealthData).catch(() => showToast('Unable to load system health from the backend.'))
  }, [tab, healthData])

  useEffect(() => {
    if (tab !== 'config' || !token) return
    void apiSystemParameters(token).then(setSystemParameters).catch(() => setSystemParameters(null))
  }, [tab, token])

  useEffect(() => {
    const applyAdminTab = (value: unknown) => {
      if (value === 'overview' || value === 'pipeline' || value === 'health' || value === 'users' || value === 'access' || value === 'feedback' || value === 'audit' || value === 'config') setTab(value)
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
            ? 'Firebase could not create a password reset for this account. Ask the user to continue with Google first, then request a reset again.'
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
      // Firebase restores the session asynchronously. Do not send an
      // unauthenticated request on the first render and then leave a stale
      // 401 toast visible after the authenticated request succeeds.
      if (!token || usersLoaded || !['overview', 'users', 'access'].includes(tab)) return
      setUsersLoading(true)
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

        // Firebase is authoritative when configured. Do not merge it with
        // demo fixtures: that creates duplicate/fake users in the admin UI.
        if (remoteUsers.length > 0) {
          const uniqueUsers = Array.from(new Map(remoteUsers.map(entry => [entry.email.toLowerCase(), entry])).values())
          setManagedUsers(uniqueUsers)
        }
        setUsersLoaded(true)
      } catch (error) {
        if (tab === 'users' || tab === 'overview') showToast(`Unable to load users: ${error instanceof Error ? error.message : 'Admin API unavailable'}`)
      } finally {
        setUsersLoading(false)
      }
    }
    void loadUsers()
  }, [token, usersLoaded, tab])

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
    if (tab !== 'users' && tab !== 'access') return
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

      {tab === 'overview' && <>
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
            Monitor collection sources, user permissions, audit logs, and backend health.
          </p>
        </div>
        <div className="admin-hero-metrics"><div><strong>{dashboardData?.routes_tracked ?? '—'}</strong><span>Observed Routes</span></div><div><strong>{healthData?.live_sources ?? '—'}</strong><span>Healthy Fare Sources</span></div><div><strong>{healthData?.data_status ?? '—'}</strong><span>Data Status</span></div></div>
      </div>
      </>}

      {/* Operational overview */}
      {tab === 'overview' && <>
        <div className="admin-kpi-grid">
          {[
            ['Total Routes Tracked', dashboardData?.routes_tracked ?? '—', 'Backend-reported only', 'blue'],
            ['Data Sources', String(sources.length), `${healthData?.live_sources ?? '—'} healthy fare sources`, 'cyan'],
            ['Collection Runs Today', dashboardData?.collection_runs_today ?? '—', 'Backend-reported only', 'green'],
            ['Total Users', String(managedUsers.length), 'Managed accounts', 'purple'],
            ['Access Requests', String(accessRequests.filter(request => request.status === 'PENDING').length), 'Pending review', 'orange'],
            ['System Health', healthData?.status?.toUpperCase() ?? '—', healthData?.database ? 'Database connected' : 'Awaiting backend health', 'green'],
          ].map(([label, value, detail, tone]) => <div className={`admin-kpi admin-kpi-${tone}`} key={label}>
            <div className="admin-kpi-icon"><Activity size={17} /></div>
            <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
          </div>)}
        </div>
        <div className="admin-overview-grid">
          <section className="admin-overview-card admin-activity-card">
            <div className="admin-card-heading"><div><h2>Data Collection Activity</h2><p>Latest backend status for registered sources</p></div><span className="admin-pill admin-pill-blue">{healthData?.data_status ?? 'UNKNOWN'}</span></div>
            <div className="admin-bars" aria-label="Data source activity chart">{sources.length ? sources.slice(0, 8).map(source => <div key={source.id} className="admin-bar-group" title={`${source.name}: ${source.obs}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 70, color: source.enabled ? 'var(--color-success)' : 'var(--color-warning)', fontSize: 9, writingMode: 'vertical-rl', overflow: 'hidden' }}>{source.status}</div>) : <div style={{ padding: 16, color: 'var(--color-text-tertiary)' }}>No backend source activity returned.</div>}</div>
            <div className="admin-legend"><span><i className="blue" />Backend source status</span><span><i className="green" />Fresh/live</span><span><i className="purple" />Unavailable or stale</span></div>
          </section>
          <section className="admin-overview-card admin-coverage-card">
            <div className="admin-card-heading"><div><h2>Route Coverage</h2><p>Observed fare-route sample across India</p></div><span className="admin-pill admin-pill-blue">ROUTES</span></div>
            <div className="admin-coverage-body"><div className="admin-map-wrap"><img src={indiaMap} alt="India route coverage" /><div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--color-text-tertiary)', fontSize: 12, textAlign: 'center', padding: 20 }}>Verified airport-level route facts are not available from the backend yet.</div></div><div className="admin-coverage-stats"><div><strong>{dashboardData?.routes_tracked ?? '—'}</strong><span>Verified routes</span></div><div><strong>{dashboardData?.real_observations ?? '—'}</strong><span>Real observations</span></div><div><strong>{dashboardData?.sources_live ?? '—'}</strong><span>Live sources</span></div><div><strong>{healthData?.data_status ?? '—'}</strong><span>Data status</span></div></div></div>
          </section>
          <section className="admin-overview-card admin-status-card">
            <div className="admin-card-heading"><div><h2>System Status</h2><p>Registered source states</p></div><button type="button" onClick={() => setTab('health')}>View Health →</button></div>
            {sources.length ? sources.slice(0, 5).map(source => <div className="admin-status-row" key={source.id}><span className="admin-status-dot" /><div><strong>{source.name}</strong><small>{source.obs}</small></div><em>{source.status}</em></div>) : <div style={{ padding: 16, color: 'var(--color-text-tertiary)' }}>No backend service status returned.</div>}
          </section>
        </div>
        <div className="admin-lower-grid">
          <section className="admin-overview-card admin-table-card"><div className="admin-card-heading"><div><h2>Recent Collection Jobs</h2><p>Latest backend-reported pipeline activity</p></div></div><div className="admin-mini-table">{dashboardData?.last_collection ? <div className="admin-mini-row"><span className="admin-job-id">latest</span><strong>Collection service</strong><em className="success">Reported</em><span>{dashboardData.collection_runs_today ?? '—'} runs</span><span>{new Date(dashboardData.last_collection).toLocaleString('en-IN')}</span></div> : <div style={{ padding: 16, color: 'var(--color-text-tertiary)' }}>No collection run records returned by the backend.</div>}</div></section>
          <section className="admin-overview-card admin-table-card"><div className="admin-card-heading"><div><h2>User Management</h2><p>Recent managed accounts</p></div><button type="button" onClick={() => setTab('users')}>View All →</button></div><div className="admin-mini-table">{managedUsers.slice(0, 5).map(entry => <div className="admin-mini-row admin-user-row" key={entry.email}><span className="admin-avatar">{entry.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><strong>{entry.name}</strong><span>{entry.role}</span><em className={entry.status === 'ACTIVE' ? 'success' : 'pending'}>{entry.status}</em></div>)}</div></section>
          <section className="admin-overview-card admin-table-card"><div className="admin-card-heading"><div><h2>Recent Activity</h2><p>Latest administrative events</p></div><button type="button" onClick={() => setTab('audit')}>View All →</button></div><div className="admin-activity-list">{audit.slice(0, 5).map(entry => <div key={`${entry.ts}-${entry.action}`}><span className="admin-status-dot" /><div><strong>{entry.action.replace(/_/g, ' ')}</strong><small>{entry.detail}</small></div><time>{new Date(entry.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div></section>
        </div>
      </>}

      {/* Tab: Pipeline */}
      {tab === 'pipeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="admin-section-banner">
            <div>
              <span>ADMIN CONTROL CENTER · DATA OPERATIONS</span>
              <h1>Data Pipeline</h1>
              <p>Monitor verified collection sources and their current backend health.</p>
            </div>
            <div className="admin-section-count"><strong>{healthData?.live_sources ?? '—'}</strong><span>Healthy fare sources</span></div>
          </div>
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                INTELLIGENT DATA PIPELINE
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '3px 8px', borderRadius: 99, border: '1px solid rgba(22,163,74,0.3)' }}>
                {sources.length ? `${healthData?.live_sources ?? '—'} HEALTHY FARE SOURCES` : 'LOADING SOURCE STATUS'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-sm)' }}>
              {sources.length === 0 ? <div style={{ padding: 18, color: 'var(--color-text-tertiary)' }}>Waiting for verified source health from the backend…</div> : sources.map(src => (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle size={14} style={{ color: src.enabled ? 'var(--color-success)' : 'var(--color-warning)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{src.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{src.status} · {src.obs}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: src.enabled ? 'var(--color-success)' : 'var(--color-warning)', background: src.enabled ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', padding: '2px 8px', borderRadius: 99, border: `1px solid ${src.enabled ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}` }}>
                      {src.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {tab === 'health' && (
        <div className="admin-workspace">
          <div className="admin-section-banner">
            <div>
              <span>ADMIN CONTROL CENTER · SYSTEM HEALTH</span>
              <h1>System Health</h1>
              <p>Verified operational status for the AeroPrice backend and data services.</p>
            </div>
            <div className="admin-section-count">
              <strong>{healthData?.status?.toUpperCase() ?? '—'}</strong>
              <span>Backend status</span>
            </div>
          </div>
          <div className="admin-user-kpis">
            <div><span>DATABASE</span><strong>{healthData?.database?.toUpperCase() ?? '—'}</strong><small>connection state</small></div>
            <div><span>DATA STATUS</span><strong>{healthData?.data_status ?? '—'}</strong><small>verified feed state</small></div>
            <div><span>LIVE SOURCES</span><strong>{healthData?.live_sources ?? '—'}</strong><small>currently reporting</small></div>
            <div><span>OBSERVATIONS</span><strong>{healthData?.real_observations?.toLocaleString?.() ?? '—'}</strong><small>stored real records</small></div>
          </div>
          <div className="admin-tab-surface" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
            <div className="admin-card-heading"><div><h2>Service details</h2><p>Values are read from the backend health endpoint.</p></div><button type="button" onClick={() => { setHealthData(null); showToast('Refreshing system health…') }}>Refresh</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
              <div className="ap-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 84 }}><span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>LAST COLLECTION</span><strong style={{ fontSize: 16, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{healthData?.last_collection ? new Date(healthData.last_collection).toLocaleString('en-IN') : '—'}</strong></div>
              <div className="ap-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 84 }}><span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>REGISTERED SOURCES</span><strong style={{ fontSize: 22, lineHeight: 1.1 }}>{healthData?.total_sources ?? '—'}</strong></div>
              <div className="ap-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 84 }}><span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>STORAGE MODE</span><strong style={{ fontSize: 16, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{healthData?.storage_mode ?? '—'}</strong></div>
              <div className="ap-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 84 }}><span style={{ color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>COLLECTION ENABLED</span><strong style={{ fontSize: 22, lineHeight: 1.1, color: healthData?.collection_enabled ? 'var(--color-success)' : 'var(--color-text-primary)' }}>{healthData?.collection_enabled == null ? '—' : healthData.collection_enabled ? 'YES' : 'NO'}</strong></div>
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
              {usersLoading && managedUsers.length === 0 ? <tr><td colSpan={5}><div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Loading verified Firebase users…</strong><span>The directory is being loaded from the authenticated backend.</span></div></td></tr> : managedUsers.length === 0 ? <tr><td colSpan={5}><div className="admin-empty-state"><strong>No users returned</strong><span>Refresh the page after confirming the backend is available.</span></div></td></tr> : managedUsers.map(u => (
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
          <div className="admin-section-banner compact"><div><span>ADMIN CONTROL CENTER · CONFIGURATION</span><h1>System Parameters</h1><p>Backend-reported settings currently used for collection and analytics.</p></div><div className="admin-section-count"><strong>{systemParameters?.parameters.length ?? '—'}</strong><span>Active parameters</span></div></div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginBottom: 'var(--space-lg)' }}>{systemParameters?.note ?? 'Parameters are unavailable until the backend responds.'}</p>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>
            INDEX &amp; COLLECTION PARAMETERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {systemParameters?.parameters.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-lg)', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{t.key}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ color: 'var(--color-text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>{t.value}</strong>
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
