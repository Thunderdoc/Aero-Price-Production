import { useState, useEffect, useRef } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useAuth } from '../contexts/AuthContext'
import { apiAdminAccessRequests, apiAdminFeedback, apiAdminUsers, apiApproveAccessRequest, apiAuditLog, apiDeleteAccessRequest, apiDeleteFeedback, apiDeleteAdminUser, apiRejectAccessRequest, apiUpdateFeedback, apiSources, apiDashboard, apiHealth, apiSystemParameters, apiCreateAdminUser, apiUpdateAdminUserRole, isBackendAvailable, type SystemParametersResponse } from '../services/api'
import { CheckCircle, ShieldCheck, Activity, RefreshCw, Download, Plus, Trash2, XCircle, MailCheck, MessageSquare, Check, ArrowRight, ArrowLeft, SlidersHorizontal, Search, AlertTriangle } from 'lucide-react'
import indiaMap from '../assets/india_map_clean.png'

const AIRFARE_SOURCES_ADMIN: Array<{ id: string; name: string; status: string; enabled: boolean; obs: string }> = []

const INITIAL_AUDIT: Array<{ ts: string; actor: string; action: string; detail: string }> = []

const ROLE_BADGE = {
  ADMIN:   { color: 'var(--color-danger)',       bg: 'var(--color-danger-bg)' },
  ANALYST: { color: 'var(--color-info)',          bg: 'var(--color-info-bg)' },
  PUBLIC:  { color: 'var(--color-brand-primary)', bg: 'var(--color-brand-muted)' },
}

const ROLE_LABEL: Record<string, string> = { ADMIN: 'ADMIN', ANALYST: 'DGCA / ANALYST', PUBLIC: 'USER' }
const ROLE_DETAILS: Record<string, { access: string; entitlement: string; description: string }> = {
  PUBLIC: { access: 'User access', entitlement: 'Subscription selected below', description: 'Route exploration, fare snapshots, and subscription-based alerts.' },
  ANALYST: { access: 'DGCA access', entitlement: 'Government plan', description: 'Government intelligence, aviation analysis, and DGCA tools.' },
  ADMIN: { access: 'Administrator access', entitlement: 'Admin plan', description: 'User management, approvals, audit trail, and system controls.' },
}

const ACTION_COLOR: Record<string, string> = {
  INDEX_PUB: 'var(--color-brand-primary)',
  GOV_FETCH: 'var(--color-info)',
  SOURCE_CHECK: 'var(--color-success)',
  LOGIN: 'var(--color-success)',
  ROLE_CHANGE: 'var(--color-danger)',
  USER_CREATE: 'var(--color-success)',
  USER_DELETE: 'var(--color-danger)',
  ACCESS_APPROVED: 'var(--color-success)',
  ACCESS_REJECTED: 'var(--color-danger)',
  ACCESS_REQUEST_DELETE: 'var(--color-warning)',
  FEEDBACK_STATUS: 'var(--color-info)',
  FEEDBACK_DELETE: 'var(--color-danger)',
}

const ACTION_LABEL: Record<string, string> = {
  ROLE_CHANGE: 'Role changed',
  USER_CREATE: 'User created',
  USER_DELETE: 'User deleted',
  ACCESS_APPROVED: 'Access approved',
  ACCESS_REJECTED: 'Access rejected',
  ACCESS_REQUEST_DELETE: 'Request cleared',
  FEEDBACK_STATUS: 'Feedback reviewed',
  FEEDBACK_DELETE: 'Feedback removed',
}

type Tab = 'overview' | 'users' | 'pipeline' | 'health' | 'access' | 'audit' | 'config' | 'feedback'

type ManagedUser = { uid?: string; email: string; role: string; plan: string; name: string; lastLogin: string; status: string; provider?: string; verified?: boolean }
type AccessRole = 'PUBLIC' | 'ANALYST' | 'ADMIN'
type AccessPlan = 'FREE' | 'SUBSCRIBER' | 'GOVERNMENT' | 'ADMIN'
type AccessEditorState = { email: string; role: AccessRole; plan: AccessPlan; originalRole: string; originalPlan: string }
const INITIAL_USERS: ManagedUser[] = []
const DIRECTORY_SNAPSHOT_MAX_AGE = 10 * 60 * 1000
const DIRECTORY_SNAPSHOT_KEY = 'aeroprice_admin_directory_snapshot'

function readDirectorySnapshot(email?: string): ManagedUser[] | null {
  if (!email) return null
  try {
    const raw = localStorage.getItem(`${DIRECTORY_SNAPSHOT_KEY}:${email.toLowerCase()}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: number; users?: ManagedUser[] }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DIRECTORY_SNAPSHOT_MAX_AGE || !Array.isArray(parsed.users)) return null
    return parsed.users
  } catch {
    return null
  }
}

function writeDirectorySnapshot(email: string | undefined, users: ManagedUser[]) {
  if (!email) return
  try {
    localStorage.setItem(`${DIRECTORY_SNAPSHOT_KEY}:${email.toLowerCase()}`, JSON.stringify({ savedAt: Date.now(), users }))
  } catch {
    // Storage is only an instant-render enhancement; the backend remains authoritative.
  }
}

function subscriptionLabel(user: Pick<ManagedUser, 'role' | 'plan'>) {
  if (user.role === 'ADMIN') return 'Administrator entitlement'
  if (user.role === 'ANALYST') return 'DGCA / Government entitlement'
  return user.plan === 'SUBSCRIBER' ? 'Premium subscription' : 'Standard subscription'
}

function formatAuditDetails(detail: string) {
  if (!detail) return 'No additional details'
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>
    const labels: Record<string, string> = {
      target_email: 'User', feature_key: 'Feature', firebase_deleted: 'Firebase identity deleted',
      role: 'Role', plan: 'Plan', from: 'From', to: 'To', reason: 'Reason',
    }
    return Object.entries(parsed)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${labels[key] || key.replace(/_/g, ' ')}: ${String(value)}`)
      .join(' · ') || 'No additional details'
  } catch {
    return detail
  }
}

interface AuditEntry { ts: string; actor: string; action: string; detail: string }
interface AccessRequest { id: string; email: string; name?: string; feature?: string; featureKey?: string; status: string; createdAt: string; reviewedAt?: string; rejectionReason?: string }
interface FeedbackEntry { id: string; email: string; name: string; message: string; createdAt: string; status: 'NEW' | 'REVIEWED' }
interface QueueRemoval { kind: 'access' | 'feedback'; id: string; label: string }

export default function AdminDashboard() {
  const { user, token } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLoaded, setAuditLoaded] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditRefreshKey, setAuditRefreshKey] = useState(0)
  const [auditQuery, setAuditQuery] = useState('')
  const [auditAction, setAuditAction] = useState('ALL')
  const [auditPage, setAuditPage] = useState(1)
  const [sources, setSources] = useState(AIRFARE_SOURCES_ADMIN)
  const [systemParameters, setSystemParameters] = useState<SystemParametersResponse | null>(null)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(() => readDirectorySnapshot(user?.email) || (user ? [{
    email: user.email,
    role: user.role,
    plan: user.plan,
    name: user.name || user.email,
    lastLogin: 'Current session',
    status: 'ACTIVE',
  }] : INITIAL_USERS))
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [nextUsersPage, setNextUsersPage] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | 'PUBLIC' | 'ANALYST' | 'ADMIN'>('ALL')
  const [userPlanFilter, setUserPlanFilter] = useState<'ALL' | 'FREE' | 'SUBSCRIBER'>('ALL')
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null)
  const [deletingUserEmail, setDeletingUserEmail] = useState<string | null>(null)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'PUBLIC', plan: 'FREE' })
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessLoaded, setAccessLoaded] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessRefreshKey, setAccessRefreshKey] = useState(0)
  const [accessQuery, setAccessQuery] = useState('')
  const [accessStatusFilter, setAccessStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackLoaded, setFeedbackLoaded] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0)
  const [feedbackQuery, setFeedbackQuery] = useState('')
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<'ALL' | 'NEW' | 'REVIEWED'>('ALL')
  const [feedbackBusyId, setFeedbackBusyId] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<QueueRemoval | null>(null)
  const [removingQueueItem, setRemovingQueueItem] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [healthData, setHealthData] = useState<any>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [resettingEmail, setResettingEmail] = useState<string | null>(null)
  const [savingUser, setSavingUser] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [accessEditor, setAccessEditor] = useState<AccessEditorState | null>(null)
  const [accessEditorStep, setAccessEditorStep] = useState<'edit' | 'review'>('edit')
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appliedSnapshotEmailRef = useRef<string | null>(null)
  const auditPageSize = 20
  const filteredAudit = audit.filter(entry => {
    const matchesAction = auditAction === 'ALL' || entry.action === auditAction
    const query = auditQuery.trim().toLowerCase()
    return matchesAction && (!query || `${entry.actor} ${entry.action} ${entry.detail}`.toLowerCase().includes(query))
  })
  const auditPageCount = Math.max(1, Math.ceil(filteredAudit.length / auditPageSize))
  const visibleAudit = filteredAudit.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize)
  const auditActorCount = new Set(audit.map(entry => entry.actor).filter(Boolean)).size
  const auditActionCount = new Set(audit.map(entry => entry.action).filter(Boolean)).size
  const auditRecentCount = audit.filter(entry => {
    const age = Date.now() - new Date(entry.ts).getTime()
    return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000
  }).length
  const filteredManagedUsers = managedUsers.filter(entry => {
    const query = userQuery.trim().toLowerCase()
    const matchesQuery = !query || `${entry.name} ${entry.email}`.toLowerCase().includes(query)
    const matchesRole = userRoleFilter === 'ALL' || entry.role === userRoleFilter
    const matchesPlan = userPlanFilter === 'ALL' || (entry.role === 'PUBLIC' && (entry.plan === 'SUBSCRIBER' ? 'SUBSCRIBER' : 'FREE') === userPlanFilter)
    return matchesQuery && matchesRole && matchesPlan
  })
  const filteredAccessRequests = accessRequests.filter(request => {
    const query = accessQuery.trim().toLowerCase()
    const matchesQuery = !query || `${request.name || ''} ${request.email} ${request.feature || ''} ${request.featureKey || ''} ${request.id}`.toLowerCase().includes(query)
    return matchesQuery && (accessStatusFilter === 'ALL' || request.status === accessStatusFilter)
  })
  const filteredFeedback = feedback.filter(item => {
    const query = feedbackQuery.trim().toLowerCase()
    const matchesQuery = !query || `${item.name} ${item.email} ${item.message}`.toLowerCase().includes(query)
    return matchesQuery && (feedbackStatusFilter === 'ALL' || item.status === feedbackStatusFilter)
  })

  useEffect(() => {
    const email = user?.email?.trim().toLowerCase()
    if (!email || appliedSnapshotEmailRef.current === email) return
    appliedSnapshotEmailRef.current = email
    const snapshot = readDirectorySnapshot(email)
    if (snapshot?.length) setManagedUsers(snapshot)
  }, [user?.email])

  useEffect(() => {
    async function loadPipelineData() {
      if (tab !== 'pipeline' && tab !== 'overview') return
      try {
        // Health is intentionally public so the admin shell can still explain
        // backend state when Firebase has expired the admin session.
        const healthResult = await Promise.allSettled([apiHealth()])
        if (healthResult[0].status === 'fulfilled') setHealthData(healthResult[0].value)
        if (!token) return

        const [directoryResult, dashboardResult] = await Promise.allSettled([apiSources(token), apiDashboard(token)])
        if (dashboardResult.status === 'fulfilled') setDashboardData(dashboardResult.value)
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
        if (dashboardResult.status === 'rejected' && directoryResult.status === 'rejected') {
          throw new Error('No admin data services responded')
        }
        // Loading the pipeline is silent; status is visible in the page itself.
      } catch {
        // Keep the admin workspace usable while optional pipeline services
        // recover. The page cards show their own unavailable state; do not
        // cover the user-management screen with a misleading toast.
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


  async function addManagedUser(e: React.FormEvent) {
    e.preventDefault()
    const name = newUser.name.trim()
    const email = newUser.email.trim().toLowerCase()
    if (!name || !email) {
      showToast('Enter a name and email before adding a user.')
      return
    }
    setSavingUser(true)
    try {
      const result = await apiCreateAdminUser({ name, email, role: newUser.role as 'PUBLIC' | 'ANALYST' | 'ADMIN', plan: newUser.plan as 'FREE' | 'SUBSCRIBER' | 'GOVERNMENT' | 'ADMIN' }, token ?? undefined) as { user?: Record<string, any>; message?: string }
      const entry = result.user
      if (entry?.email) {
        setManagedUsers(prev => {
          const next = [{
            uid: entry.uid, email: entry.email, role: entry.role, plan: entry.plan, name: entry.name,
            lastLogin: 'Not recorded', status: 'ACTIVE', verified: false,
          }, ...prev.filter(userEntry => userEntry.email.toLowerCase() !== email)]
          writeDirectorySnapshot(user?.email, next)
          return next
        })
      }
      setNewUser({ name: '', email: '', role: 'PUBLIC', plan: 'FREE' })
      showToast(result.message || `User account created for ${email}.`, 6000)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The user account could not be created.', 6000)
    } finally {
      setSavingUser(false)
    }
  }

  async function updateManagedUserRole(email: string, role: AccessRole, plan: AccessPlan) {
    setUpdatingRole(email)
    try {
      const result = await apiUpdateAdminUserRole(email, role, plan, token ?? undefined) as { role: string; plan: string }
      setManagedUsers(prev => {
        const next = prev.map(entry => entry.email.toLowerCase() === email.toLowerCase() ? { ...entry, role: result.role, plan: result.plan } : entry)
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setAccessEditor(null)
      setAccessEditorStep('edit')
      showToast(`${email} is now ${ROLE_LABEL[result.role] || result.role}.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The user role could not be updated.', 6000)
    } finally {
      setUpdatingRole(null)
    }
  }

  function openAccessEditor(entry: ManagedUser) {
    const role = (entry.role === 'ANALYST' || entry.role === 'ADMIN' ? entry.role : 'PUBLIC') as AccessRole
    const plan = (role === 'PUBLIC' && entry.plan === 'SUBSCRIBER' ? 'SUBSCRIBER' : role === 'ANALYST' ? 'GOVERNMENT' : role === 'ADMIN' ? 'ADMIN' : 'FREE') as AccessPlan
    setAccessEditor({ email: entry.email, role, plan, originalRole: role, originalPlan: plan })
    setAccessEditorStep('edit')
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

  async function confirmDeleteManagedUser() {
    if (!userToDelete) return
    const { email, uid } = userToDelete
    if (email.toLowerCase() === user?.email?.toLowerCase()) {
      showToast('You cannot delete the currently signed-in administrator.')
      return
    }
    setDeletingUserEmail(email)
    try {
      const result = await apiDeleteAdminUser(email, uid, token ?? undefined) as { status?: string; firebase_deleted?: boolean }
      setManagedUsers(previous => {
        const next = previous.filter(entry => entry.email.toLowerCase() !== email.toLowerCase())
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setUserToDelete(null)
      showToast(result.firebase_deleted ? `${email} and the Firebase sign-in were deleted.` : `${email} was removed from the local directory.` , 6000)
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Could not delete ${email}. The account is unchanged.`, 6000)
    } finally {
      setDeletingUserEmail(null)
    }
  }

  async function approveFeatureRequest(id: string) {
    setAccessBusyId(id)
    try {
      const result = await apiApproveAccessRequest(id, token ?? undefined) as { status: string; reviewed_at?: string }
      setAccessRequests(prev => prev.map(r => r.id === id ? { ...r, status: result.status, reviewedAt: result.reviewed_at } : r))
      showToast('Feature access approved. The user will see the update after refresh.')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not approve access request.') }
    finally { setAccessBusyId(null) }
  }

  async function rejectFeatureRequest(id: string) {
    setAccessBusyId(id)
    try {
      const result = await apiRejectAccessRequest(id, 'Not approved by the administrator.', token ?? undefined) as { status: string; reviewed_at?: string; rejection_reason?: string }
      setAccessRequests(prev => prev.map(r => r.id === id ? { ...r, status: result.status, reviewedAt: result.reviewed_at, rejectionReason: result.rejection_reason } : r))
      showToast('Feature access request rejected.')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not reject access request.') }
    finally { setAccessBusyId(null) }
  }

  async function removeAccessRequest(id: string) {
    setRemovingQueueItem(id)
    try {
      await apiDeleteAccessRequest(id, token ?? undefined)
      setAccessRequests(prev => prev.filter(r => r.id !== id))
      setPendingRemoval(null)
      showToast('Access request cleared; user can request again')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not clear access request.') }
    finally { setRemovingQueueItem(null) }
  }

  async function updateFeedback(id: string, status: FeedbackEntry['status']) {
    setFeedbackBusyId(id)
    try {
      await apiUpdateFeedback(id, status, token ?? undefined)
      setFeedback(prev => prev.map(item => item.id === id ? { ...item, status } : item))
      showToast(status === 'REVIEWED' ? 'Feedback marked as reviewed.' : 'Feedback marked as new.')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not update feedback.') }
    finally { setFeedbackBusyId(null) }
  }

  async function removeFeedback(id: string) {
    setRemovingQueueItem(id)
    try {
      await apiDeleteFeedback(id, token ?? undefined)
      setFeedback(prev => prev.filter(item => item.id !== id))
      setPendingRemoval(null)
      showToast('Feedback removed from the admin queue.')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not remove feedback.') }
    finally { setRemovingQueueItem(null) }
  }

  function confirmQueueRemoval() {
    if (!pendingRemoval) return
    if (pendingRemoval.kind === 'access') void removeAccessRequest(pendingRemoval.id)
    else void removeFeedback(pendingRemoval.id)
  }

  useEffect(() => {
    async function loadUsers() {
      // Firebase restores the session asynchronously. Do not send an
      // unauthenticated request on the first render and then leave a stale
      // 401 toast visible after the authenticated request succeeds.
      if (!token || usersLoaded || !['overview', 'users', 'access'].includes(tab)) return
      setUsersLoading(true)
      setUsersError(null)
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
            uid: entry.uid,
            provider: Array.isArray(entry.providers) ? entry.providers.join(', ') : undefined,
            verified: entry.email_verified,
            }))
          : []

        // Firebase is authoritative when configured. Do not merge it with
        // demo fixtures: that creates duplicate/fake users in the admin UI.
        if (remoteUsers.length > 0) {
          const uniqueUsers = Array.from(new Map(remoteUsers.map(entry => [entry.email.toLowerCase(), entry])).values())
          setManagedUsers(uniqueUsers)
          writeDirectorySnapshot(user?.email, uniqueUsers)
        }
        if (remoteUsers.length === 0 && result?.note) setUsersError(String(result.note))
        setNextUsersPage(result?.next_page_token || null)
        setUsersLoaded(true)
      } catch (error) {
        setUsersError(error instanceof Error ? error.message : 'The authenticated user directory could not be loaded.')
        if (user?.email && managedUsers.length === 0) {
          setManagedUsers([{
            email: user.email,
            name: user.name || user.email,
            role: user.role,
            plan: user.plan,
            lastLogin: 'Current session',
            status: 'ACTIVE',
          }])
        }
      } finally {
        setUsersLoading(false)
      }
    }
    void loadUsers()
  }, [token, usersLoaded, tab])

  async function loadNextUsersPage() {
    if (!token || !nextUsersPage) return
    setUsersLoading(true)
    try {
      const result = await apiAdminUsers(token, nextUsersPage)
      const more = (result.users || []).filter((entry: any) => entry?.email).map((entry: any) => ({
        uid: entry.uid, email: entry.email, role: entry.role, plan: entry.plan, name: entry.name,
        lastLogin: entry.lastLogin || entry.last_login || 'Not recorded',
        status: entry.status || (entry.is_active === false ? 'INACTIVE' : 'ACTIVE'),
        provider: Array.isArray(entry.providers) ? entry.providers.join(', ') : undefined,
        verified: entry.email_verified,
      }))
      setManagedUsers(prev => {
        const next = [...prev, ...more]
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setNextUsersPage(result.next_page_token || null)
    } catch (error) { setUsersError(error instanceof Error ? error.message : 'Could not load more users.') }
    finally { setUsersLoading(false) }
  }

  useEffect(() => {
    let active = true
    async function loadAudit() {
      if (tab !== 'audit') return
      setAuditLoading(true)
      setAuditError(null)
      try {
        const result = await apiAuditLog(token ?? '', 200) as { entries?: Array<Record<string, any>>; total?: number }
        if (!Array.isArray(result?.entries)) throw new Error('The audit service returned an invalid response.')
        if (!active) return
        setAudit(result.entries.map(entry => ({
          ts: entry.created_at || entry.timestamp || '',
          actor: entry.user_email || entry.actor || 'System',
          action: entry.action || 'UNKNOWN',
          detail: typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details || {}),
        })))
        setAuditTotal(Number.isFinite(Number(result.total)) ? Number(result.total) : result.entries.length)
      } catch (error) {
        if (active) setAuditError(error instanceof Error ? error.message : 'Could not load the audit trail.')
      } finally {
        if (active) {
          setAuditLoading(false)
          setAuditLoaded(true)
        }
      }
    }
    void loadAudit()
    return () => { active = false }
  }, [tab, token, auditRefreshKey])

  useEffect(() => {
    setAuditPage(1)
  }, [auditQuery, auditAction])

  useEffect(() => {
    if (tab !== 'users' && tab !== 'access') return
    let active = true
    async function loadAccessRequests() {
      setAccessLoading(true)
      setAccessError(null)
      try {
        const result = await apiAdminAccessRequests(token ?? undefined)
        if (Array.isArray(result?.requests)) {
          const requests = result.requests.map((entry: any) => ({ id: entry.id, email: entry.email, name: entry.name, feature: entry.feature, featureKey: entry.feature_key, status: entry.status, createdAt: entry.created_at, reviewedAt: entry.reviewed_at, rejectionReason: entry.rejection_reason }))
          if (active) setAccessRequests(requests)
        } else {
          throw new Error('The access-request service returned an invalid response.')
        }
      } catch (error) {
        if (active) setAccessError(error instanceof Error ? error.message : 'Could not load access requests.')
      } finally {
        if (active) {
          setAccessLoading(false)
          setAccessLoaded(true)
        }
      }
    }
    void loadAccessRequests()
    return () => { active = false }
  }, [tab, token, accessRefreshKey])

  useEffect(() => {
    if (tab !== 'feedback') return
    let active = true
    async function loadFeedback() {
      setFeedbackLoading(true)
      setFeedbackError(null)
      try {
        const result = await apiAdminFeedback(token ?? undefined)
        if (Array.isArray(result?.feedback)) {
          if (active) setFeedback(result.feedback.map((entry: any) => ({ id: entry.id, email: entry.email, name: entry.name, message: entry.message, status: entry.status === 'REVIEWED' ? 'REVIEWED' : 'NEW', createdAt: entry.created_at || '' })))
        } else {
          throw new Error('The feedback service returned an invalid response.')
        }
      } catch (error) {
        if (active) setFeedbackError(error instanceof Error ? error.message : 'Could not load feedback.')
      } finally {
        if (active) {
          setFeedbackLoading(false)
          setFeedbackLoaded(true)
        }
      }
    }
    void loadFeedback()
    return () => { active = false }
  }, [tab, token, feedbackRefreshKey])

  function downloadAuditCSV() {
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = [
      ['Timestamp', 'Actor', 'Action', 'Detail'],
      ...filteredAudit.map(a => [a.ts, a.actor, a.action, a.detail]),
    ]
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n')
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

      <Modal
        isOpen={Boolean(accessEditor)}
        onClose={() => { if (!updatingRole) setAccessEditor(null) }}
        title={accessEditorStep === 'review' ? 'Review access change' : 'Edit user access'}
        size="lg"
        footer={accessEditor ? <div className="admin-access-editor-footer">
          {accessEditorStep === 'review' ? <Button variant="neutral" onClick={() => setAccessEditorStep('edit')} disabled={Boolean(updatingRole)} iconStart={<ArrowLeft size={14} />}>Back</Button> : <Button variant="neutral" onClick={() => setAccessEditor(null)} disabled={Boolean(updatingRole)}>Cancel</Button>}
          {accessEditorStep === 'review' ? <Button variant="primary" onClick={() => void updateManagedUserRole(accessEditor.email, accessEditor.role, accessEditor.plan)} loading={Boolean(updatingRole)}>Confirm &amp; save</Button> : <Button variant="primary" onClick={() => setAccessEditorStep('review')} disabled={accessEditor.role === accessEditor.originalRole && accessEditor.plan === accessEditor.originalPlan}>Review changes <ArrowRight size={14} /></Button>}
        </div> : null}
      >
        {accessEditor && (() => {
          const entry = managedUsers.find(item => item.email.toLowerCase() === accessEditor.email.toLowerCase())
          const details = ROLE_DETAILS[accessEditor.role] || ROLE_DETAILS.PUBLIC
          const changed = accessEditor.role !== accessEditor.originalRole || accessEditor.plan !== accessEditor.originalPlan
          return <div className="admin-access-editor">
            <div className="admin-access-editor-user">
              <span className="admin-avatar">{(entry?.name || accessEditor.email).split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>
              <div><strong>{entry?.name || accessEditor.email}</strong><span>{accessEditor.email}</span></div>
            </div>
            {accessEditorStep === 'edit' ? <>
              <p className="admin-access-editor-lead">Choose the workspace access first, then select a subscription only for standard users.</p>
              <div className="admin-access-editor-fields">
                <label className="admin-access-field"><span>Workspace role</span><select className="ap-input" value={accessEditor.role} onChange={event => { const role = event.target.value as AccessRole; setAccessEditor(current => current ? { ...current, role, plan: role === 'PUBLIC' ? (current.plan === 'SUBSCRIBER' ? 'SUBSCRIBER' : 'FREE') : role === 'ANALYST' ? 'GOVERNMENT' : 'ADMIN' } : current) }}><option value="PUBLIC">User</option><option value="ANALYST">DGCA / Analyst</option><option value="ADMIN">Admin</option></select></label>
                <label className="admin-access-field"><span>Subscription</span><select className="ap-input" value={accessEditor.role === 'PUBLIC' ? accessEditor.plan : accessEditor.role === 'ANALYST' ? 'GOVERNMENT' : 'ADMIN'} disabled={accessEditor.role !== 'PUBLIC'} onChange={event => setAccessEditor(current => current ? { ...current, plan: event.target.value as AccessPlan } : current)}><option value="FREE">Standard</option><option value="SUBSCRIBER">Premium</option>{accessEditor.role === 'ANALYST' && <option value="GOVERNMENT">Government</option>}{accessEditor.role === 'ADMIN' && <option value="ADMIN">Administrator</option>}</select></label>
              </div>
              <div className="admin-access-editor-preview"><div><span className="admin-access-preview-kicker">NEW ACCESS PREVIEW</span><strong>{details.access}</strong><small>{subscriptionLabel({ role: accessEditor.role, plan: accessEditor.plan })}</small></div><span className="admin-access-preview-badge">{ROLE_LABEL[accessEditor.role]}</span></div>
              <div className="admin-access-editor-note"><ShieldCheck size={16} /><span>{details.description}</span></div>
            </> : <>
              <div className="admin-access-editor-review"><div className="admin-access-review-kicker"><Check size={15} /> Ready to apply</div><p>Review the access change below. It will update Firebase permissions, the local directory, and the audit trail together.</p><div className="admin-access-change-grid"><div><span>Current access</span><strong>{ROLE_LABEL[accessEditor.originalRole] || accessEditor.originalRole}</strong><small>{subscriptionLabel({ role: accessEditor.originalRole, plan: accessEditor.originalPlan })}</small></div><ArrowRight size={18} /><div className="next"><span>New access</span><strong>{ROLE_LABEL[accessEditor.role]}</strong><small>{subscriptionLabel({ role: accessEditor.role, plan: accessEditor.plan })}</small></div></div>{!changed && <small className="admin-access-no-change">No changes were made.</small>}</div>
              <p className="admin-access-editor-footnote">The user will receive the new access on their next authenticated session.</p>
            </>}
          </div>
        })()}
      </Modal>

      <Modal
        isOpen={Boolean(userToDelete)}
        onClose={() => { if (!deletingUserEmail) setUserToDelete(null) }}
        title="Delete user account?"
        size="md"
        footer={userToDelete ? <div className="admin-access-editor-footer">
          <Button variant="neutral" onClick={() => setUserToDelete(null)} disabled={Boolean(deletingUserEmail)}>Cancel</Button>
          <Button variant="danger" onClick={() => void confirmDeleteManagedUser()} disabled={userToDelete.email.toLowerCase() === user?.email?.toLowerCase()} loading={Boolean(deletingUserEmail)} iconStart={<Trash2 size={14} />}>Delete account</Button>
        </div> : null}
      >
        {userToDelete && <div className="admin-delete-user-dialog">
          <div className="admin-delete-user-warning"><AlertTriangle size={19} /><span>This action cannot be undone.</span></div>
          <div className="admin-access-editor-user">
            <span className="admin-avatar">{userToDelete.name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span>
            <div><strong>{userToDelete.name}</strong><span>{userToDelete.email}</span></div>
          </div>
          <p>Delete this user’s Firebase sign-in and local account data, including access requests, grants, and notifications. Feedback and audit history will remain available to admins.</p>
          {userToDelete.email.toLowerCase() === user?.email?.toLowerCase() && <p className="admin-delete-self-warning">You are signed in with this account, so it cannot be deleted here.</p>}
        </div>}
      </Modal>

      <Modal
        isOpen={Boolean(pendingRemoval)}
        onClose={() => { if (!removingQueueItem) setPendingRemoval(null) }}
        title={pendingRemoval?.kind === 'access' ? 'Clear access request?' : 'Remove feedback item?'}
        size="sm"
        footer={pendingRemoval ? <div className="admin-access-editor-footer">
          <Button variant="neutral" onClick={() => setPendingRemoval(null)} disabled={Boolean(removingQueueItem)}>Cancel</Button>
          <Button variant="danger" onClick={confirmQueueRemoval} loading={removingQueueItem === pendingRemoval.id} iconStart={<Trash2 size={14} />}>Confirm removal</Button>
        </div> : null}
      >
        {pendingRemoval && <div className="admin-delete-user-dialog">
          <div className="admin-delete-user-warning"><AlertTriangle size={19} /><span>This removes the item from its active queue.</span></div>
          <p className="admin-access-editor-lead">{pendingRemoval.kind === 'access' ? 'The request history will remain in the audit trail, and the user may submit a new request afterward.' : 'This feedback message will be permanently removed. Its removal will be recorded in the audit trail.'}</p>
          <div className="admin-access-editor-user"><span className="admin-avatar">{pendingRemoval.kind === 'access' ? 'AR' : 'FB'}</span><div><strong>{pendingRemoval.label}</strong><span>{pendingRemoval.kind === 'access' ? 'Access request' : 'Feedback item'}</span></div></div>
        </div>}
      </Modal>

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
          <div className="admin-queue-toolbar">
            <label className="admin-users-search"><Search size={16} aria-hidden="true" /><input type="search" value={accessQuery} onChange={event => setAccessQuery(event.target.value)} placeholder="Search user, feature, or request ID" aria-label="Search access requests" /></label>
            <select className="ap-input admin-users-filter" value={accessStatusFilter} onChange={event => setAccessStatusFilter(event.target.value as typeof accessStatusFilter)} aria-label="Filter access requests by status"><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>
            <span className="admin-users-result-count">{filteredAccessRequests.length} of {accessRequests.length} requests</span>
            <Button size="xs" variant="neutral" onClick={() => setAccessRefreshKey(value => value + 1)} disabled={accessLoading} loading={accessLoading} iconStart={<RefreshCw size={13} />}>{accessLoading ? 'Refreshing…' : 'Refresh'}</Button>
          </div>
          {accessError && <div className="admin-data-error" role="alert"><div><strong>Could not load access requests</strong><span>{accessError}</span></div><Button size="xs" variant="neutral" onClick={() => setAccessRefreshKey(value => value + 1)} disabled={accessLoading}>Try again</Button></div>}
          {accessLoading && accessRequests.length > 0 && <div className="admin-directory-sync" role="status"><RefreshCw size={13} className="spin" /> Refreshing requests…</div>}
          <div className="admin-access-panel">
            {accessLoading && accessRequests.length === 0 ? <div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Loading access requests…</strong><span>Fetching the latest requests from the authenticated backend.</span></div>
              : !accessLoaded ? <div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Preparing access requests…</strong></div>
              : accessError && accessRequests.length === 0 ? <div className="admin-empty-state"><AlertTriangle size={22} /><strong>Requests unavailable</strong><span>Use “Try again” above to reload the live request queue.</span></div>
              : accessRequests.length === 0 && !accessError ? <div className="admin-empty-state"><ShieldCheck size={22} /><strong>No access requests yet</strong><span>New requests from users will appear here for administrator review.</span></div>
              : filteredAccessRequests.length === 0 && !accessError ? <div className="admin-empty-state"><Search size={20} /><strong>No matching requests</strong><span>Try another search or change the status filter.</span></div>
              : filteredAccessRequests.map(req => <article className="admin-access-row" key={req.id}>
                <div className="admin-access-request-main"><strong>{req.name || req.email}</strong><small className="admin-access-request-email">{req.email}</small><div className="admin-access-request-meta"><span>{req.feature || 'Feature access'}</span><span>Requested {req.createdAt && !Number.isNaN(new Date(req.createdAt).getTime()) ? new Date(req.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'date unavailable'}</span></div><small className="admin-access-request-id">Reference: {req.id}</small>{req.rejectionReason && <small className="admin-access-request-reason">Reason: {req.rejectionReason}</small>}</div>
                <span className={`admin-request-status ${req.status.toLowerCase()}`}>{req.status}</span>
                <div className="admin-access-request-actions">{req.status === 'PENDING' ? <><Button size="xs" variant="primary" onClick={() => void approveFeatureRequest(req.id)} disabled={Boolean(accessBusyId)} loading={accessBusyId === req.id} iconStart={<Check size={12} />}>Approve</Button><Button size="xs" variant="danger" onClick={() => void rejectFeatureRequest(req.id)} disabled={Boolean(accessBusyId)} loading={accessBusyId === req.id} iconStart={<XCircle size={12} />}>Reject</Button></> : <><span className="admin-access-reviewed">Reviewed{req.reviewedAt && !Number.isNaN(new Date(req.reviewedAt).getTime()) ? ` · ${new Date(req.reviewedAt).toLocaleDateString('en-IN')}` : ''}</span><Button size="xs" variant="neutral" onClick={() => setPendingRemoval({ kind: 'access', id: req.id, label: `${req.feature || 'Feature request'} · ${req.email}` })} disabled={Boolean(removingQueueItem)}>Clear</Button></>}</div>
              </article>)}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="admin-user-hero">
            <div><span className="admin-user-eyebrow">ADMIN CONTROL CENTER · USER MANAGEMENT</span><h1>User Management</h1><p>Manage accounts, roles, access requests, and authentication actions from one focused workspace.</p></div>
            <div className="admin-user-summary"><div><strong>{managedUsers.length}</strong><span>Total Users</span></div><div><strong>{managedUsers.filter(item => item.status === 'ACTIVE').length}</strong><span>Active</span></div><div><strong>{accessRequests.filter(item => item.status === 'PENDING').length}</strong><span>Pending Access</span></div></div>
          </div>
          <div className="admin-user-kpis"><div><span>STANDARD USERS</span><strong>{managedUsers.filter(item => item.role === 'PUBLIC' && item.plan !== 'SUBSCRIBER').length}</strong><small>PUBLIC · FREE</small></div><div><span>PREMIUM USERS</span><strong>{managedUsers.filter(item => item.role === 'PUBLIC' && item.plan === 'SUBSCRIBER').length}</strong><small>PUBLIC · SUBSCRIBER</small></div><div><span>DGCA / ANALYSTS</span><strong>{managedUsers.filter(item => item.role === 'ANALYST').length}</strong><small>GOVERNMENT access</small></div><div><span>ADMINS</span><strong>{managedUsers.filter(item => item.role === 'ADMIN').length}</strong><small>ADMIN access</small></div></div>
          <form className="admin-user-create-form" onSubmit={addManagedUser} style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 18, display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) minmax(220px,1.3fr) 140px 150px auto', gap: 12, alignItems: 'end' }}>
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
              <select className="ap-input" value={newUser.role} onChange={e => setNewUser(v => ({ ...v, role: e.target.value, plan: e.target.value === 'PUBLIC' ? v.plan === 'SUBSCRIBER' ? 'SUBSCRIBER' : 'FREE' : e.target.value === 'ANALYST' ? 'GOVERNMENT' : 'ADMIN' }))}>
                <option value="PUBLIC">USER</option>
                <option value="ANALYST">DGCA / ANALYST</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: 'var(--color-text-tertiary)', marginBottom: 6 }}>SUBSCRIPTION</label>
              <select className="ap-input" value={newUser.role === 'PUBLIC' ? newUser.plan : newUser.role === 'ANALYST' ? 'GOVERNMENT' : 'ADMIN'} disabled={newUser.role !== 'PUBLIC'} onChange={e => setNewUser(v => ({ ...v, plan: e.target.value }))}>
                <option value="FREE">STANDARD</option>
                <option value="SUBSCRIBER">PREMIUM</option>
                {newUser.role === 'ANALYST' && <option value="GOVERNMENT">GOVERNMENT</option>}
                {newUser.role === 'ADMIN' && <option value="ADMIN">ADMIN</option>}
              </select>
            </div>
            <Button variant="primary" type="submit" disabled={savingUser} iconStart={<Plus size={14} />}>{savingUser ? 'Creating…' : 'Add User'}</Button>
          </form>

          <div className="admin-users-toolbar">
            <label className="admin-users-search"><Search size={16} aria-hidden="true" /><input type="search" value={userQuery} onChange={event => setUserQuery(event.target.value)} placeholder="Search users by name or email" aria-label="Search users by name or email" /></label>
            <select className="ap-input admin-users-filter" aria-label="Filter by role" value={userRoleFilter} onChange={event => setUserRoleFilter(event.target.value as typeof userRoleFilter)}><option value="ALL">All roles</option><option value="PUBLIC">Users</option><option value="ANALYST">DGCA / Analysts</option><option value="ADMIN">Admins</option></select>
            <select className="ap-input admin-users-filter" aria-label="Filter by subscription" value={userPlanFilter} onChange={event => setUserPlanFilter(event.target.value as typeof userPlanFilter)}><option value="ALL">All subscriptions</option><option value="FREE">Standard</option><option value="SUBSCRIBER">Premium</option></select>
            <span className="admin-users-result-count">{filteredManagedUsers.length} of {managedUsers.length} users</span>
            <Button size="xs" variant="neutral" onClick={() => { setUsersError(null); setUsersLoaded(false) }} disabled={usersLoading} iconStart={<RefreshCw size={13} />}>{usersLoading ? 'Syncing…' : 'Refresh'}</Button>
          </div>

          <div className="admin-users-table-wrap" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          {usersLoading && managedUsers.length > 0 && <div className="admin-directory-sync" role="status"><RefreshCw size={13} className="spin" /> Syncing the directory in the background…</div>}
          <table className="ap-table">
            <thead>
              <tr>
                {['User','Access & plan','Last Active','Status','Actions'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usersLoading && managedUsers.length === 0 ? <tr><td colSpan={5}><div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Loading verified Firebase users…</strong><span>The directory is being loaded from the authenticated backend.</span></div></td></tr> : managedUsers.length === 0 ? <tr><td colSpan={5}><div className="admin-empty-state"><strong>No users returned</strong><span>{usersError || 'The backend returned no authenticated users.'}</span></div></td></tr> : filteredManagedUsers.length === 0 ? <tr><td colSpan={5}><div className="admin-empty-state"><Search size={18} /><strong>No matching users</strong><span>Try another name, email, role, or subscription filter.</span></div></td></tr> : filteredManagedUsers.map(u => (
                <tr key={u.email}>
                  <td data-label="User">
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{u.email}{u.verified ? ' · verified' : ''}</div>
                  </td>
                  <td data-label="Access & plan">
                    <div className="admin-role-cell">
                      <div className="admin-role-line">
                        <span className="ap-badge" style={{ background: ROLE_BADGE[u.role as keyof typeof ROLE_BADGE]?.bg, color: ROLE_BADGE[u.role as keyof typeof ROLE_BADGE]?.color }}>
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                        <span className="admin-role-access">{ROLE_DETAILS[u.role]?.access || 'Access configured'}</span>
                      </div>
                      <span className="admin-entitlement">{subscriptionLabel(u)}</span>
                      <button type="button" className="admin-access-edit-button" onClick={() => openAccessEditor(u)} disabled={Boolean(updatingRole)} aria-label={`Edit access for ${u.email}`}>
                        <SlidersHorizontal size={13} />
                        <span>Edit access</span>
                      </button>
                    </div>
                  </td>
                  <td data-label="Last active" style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatLastActive(u.lastLogin)}</td>
                  <td data-label="Status">
                    <span style={{ fontSize: 9, fontWeight: 700, color: u.status === 'ACTIVE' ? 'var(--color-success)' : 'var(--color-warning)', background: u.status === 'ACTIVE' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)', padding: '2px 8px', borderRadius: 99, border: `1px solid ${u.status === 'ACTIVE' ? 'rgba(22,163,74,0.3)' : 'rgba(217,119,6,0.3)'}` }}>
                      {u.status}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div className="admin-user-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button size="xs" variant="subtle" disabled={resettingEmail === u.email} onClick={() => resetManagedPassword(u.email)} iconStart={<MailCheck size={12} />}>{resettingEmail === u.email ? 'Sending…' : resetSentEmail === u.email ? 'Resend Reset Link' : 'Send Reset Link'}</Button>
                      <Button size="xs" variant="danger" disabled={Boolean(deletingUserEmail) || u.email.toLowerCase() === user?.email?.toLowerCase()} onClick={() => setUserToDelete(u)} iconStart={<Trash2 size={12} />}>{deletingUserEmail === u.email ? 'Deleting…' : 'Delete'}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {nextUsersPage && <div style={{ padding: 14, textAlign: 'center' }}><Button size="xs" variant="subtle" onClick={loadNextUsersPage} disabled={usersLoading}>{usersLoading ? 'Loading…' : 'Load more Firebase users'}</Button></div>}
          </div>
        </div>
      )}

      {/* Tab: Feedback */}
      {tab === 'feedback' && (
        <div className="admin-tab-surface" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div className="admin-section-banner compact"><div><span>ADMIN CONTROL CENTER · PRODUCT OPERATIONS</span><h1>User Feedback</h1><p>Review user-submitted messages, track what has been handled, and retain an auditable moderation history.</p></div><div className="admin-section-count"><strong>{feedback.filter(item => item.status === 'NEW').length}</strong><span>Needs review</span></div></div>
          <div className="admin-feedback-summary"><div><span>ALL MESSAGES</span><strong>{feedback.length}</strong></div><div><span>NEEDS REVIEW</span><strong>{feedback.filter(item => item.status === 'NEW').length}</strong></div><div><span>REVIEWED</span><strong>{feedback.filter(item => item.status === 'REVIEWED').length}</strong></div></div>
          <div className="admin-queue-toolbar">
            <label className="admin-users-search"><Search size={16} aria-hidden="true" /><input type="search" value={feedbackQuery} onChange={event => setFeedbackQuery(event.target.value)} placeholder="Search message, name, or email" aria-label="Search feedback" /></label>
            <select className="ap-input admin-users-filter" value={feedbackStatusFilter} onChange={event => setFeedbackStatusFilter(event.target.value as typeof feedbackStatusFilter)} aria-label="Filter feedback by status"><option value="ALL">All statuses</option><option value="NEW">Needs review</option><option value="REVIEWED">Reviewed</option></select>
            <span className="admin-users-result-count">{filteredFeedback.length} of {feedback.length} messages</span>
            <Button size="xs" variant="neutral" onClick={() => setFeedbackRefreshKey(value => value + 1)} disabled={feedbackLoading} loading={feedbackLoading} iconStart={<RefreshCw size={13} />}>{feedbackLoading ? 'Refreshing…' : 'Refresh'}</Button>
          </div>
          {feedbackError && <div className="admin-data-error" role="alert"><div><strong>Could not load feedback</strong><span>{feedbackError}</span></div><Button size="xs" variant="neutral" onClick={() => setFeedbackRefreshKey(value => value + 1)} disabled={feedbackLoading}>Try again</Button></div>}
          {feedbackLoading && feedback.length > 0 && <div className="admin-directory-sync" role="status"><RefreshCw size={13} className="spin" /> Refreshing feedback…</div>}
          {feedbackLoading && feedback.length === 0 ? <div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Loading feedback…</strong><span>Fetching messages from the authenticated backend.</span></div>
            : !feedbackLoaded ? <div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Preparing feedback…</strong></div>
            : feedbackError && feedback.length === 0 ? <div className="admin-empty-state"><AlertTriangle size={22} /><strong>Feedback unavailable</strong><span>Use “Try again” above to reload messages from the backend.</span></div>
            : feedback.length === 0 && !feedbackError ? <div className="admin-empty-state"><MessageSquare size={22} /><strong>No feedback yet</strong><span>Messages submitted from the user dashboard will appear here for review.</span></div>
            : filteredFeedback.length === 0 && !feedbackError ? <div className="admin-empty-state"><Search size={20} /><strong>No matching feedback</strong><span>Try another search or change the status filter.</span></div>
            : <div className="admin-feedback-list">{filteredFeedback.map(item => <article className={`admin-feedback-card ${item.status === 'NEW' ? 'is-new' : ''}`} key={item.id}>
              <div className="admin-feedback-card-head"><div className="admin-feedback-identity"><span className="admin-feedback-avatar"><MessageSquare size={16} /></span><div><strong>{item.name || 'AeroPrice user'}</strong><span>{item.email}</span></div></div><span className={`admin-feedback-status ${item.status.toLowerCase()}`}>{item.status === 'NEW' ? 'Needs review' : 'Reviewed'}</span></div>
              <div className="admin-feedback-date">{item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime()) ? new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable'}</div>
              <p className="admin-feedback-message">{item.message}</p>
              <div className="admin-feedback-actions"><Button size="xs" variant={item.status === 'NEW' ? 'primary' : 'neutral'} onClick={() => void updateFeedback(item.id, item.status === 'NEW' ? 'REVIEWED' : 'NEW')} disabled={Boolean(feedbackBusyId) || Boolean(removingQueueItem)} loading={feedbackBusyId === item.id}>{item.status === 'NEW' ? 'Mark reviewed' : 'Reopen'}</Button><Button size="xs" variant="subtle" onClick={() => setPendingRemoval({ kind: 'feedback', id: item.id, label: item.name || item.email })} disabled={Boolean(feedbackBusyId) || Boolean(removingQueueItem)} iconStart={<Trash2 size={12} />}>Remove</Button></div>
            </article>)}</div>}
        </div>
      )}

      {/* Tab: Audit */}
      {tab === 'audit' && (
        <div className="admin-tab-surface" style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
          <div className="admin-section-banner compact"><div><span>ADMIN CONTROL CENTER · GOVERNANCE</span><h1>Audit Trail</h1><p>Trace administrator changes with clear timestamps, actors, and affected accounts.</p></div><div className="admin-section-count"><strong>{auditTotal}</strong><span>Recorded events</span></div></div>
          <div className="admin-audit-stats"><div><span>LAST 24 HOURS</span><strong>{auditRecentCount}</strong></div><div><span>UNIQUE ACTORS</span><strong>{auditActorCount}</strong></div><div><span>ACTION TYPES</span><strong>{auditActionCount}</strong></div></div>
          {audit.length > 0 && auditTotal > audit.length && <div className="admin-audit-retention-note">Showing the latest {audit.length} of {auditTotal} events. Search, filters, and export apply to the events currently loaded.</div>}
          <div className="admin-tab-toolbar admin-audit-toolbar">
            <div className="admin-audit-filters">
              <label className="admin-users-search"><Search size={16} aria-hidden="true" /><input value={auditQuery} onChange={event => setAuditQuery(event.target.value)} placeholder="Search actor, action, or detail" aria-label="Search audit log" /></label>
              <select className="ap-input admin-users-filter" value={auditAction} onChange={event => setAuditAction(event.target.value)} aria-label="Filter audit action">
                <option value="ALL">All actions</option>
                {Array.from(new Set(audit.map(entry => entry.action))).sort().map(action => <option key={action} value={action}>{ACTION_LABEL[action] || action.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="admin-audit-actions"><Button size="xs" variant="neutral" onClick={() => setAuditRefreshKey(value => value + 1)} disabled={auditLoading} loading={auditLoading} iconStart={<RefreshCw size={13} />}>{auditLoading ? 'Refreshing…' : 'Refresh'}</Button><Button size="xs" variant="neutral" onClick={downloadAuditCSV} disabled={filteredAudit.length === 0} iconStart={<Download size={13} />}>Export {filteredAudit.length ? `${filteredAudit.length} events` : 'CSV'}</Button></div>
          </div>
          {auditError && <div className="admin-data-error" role="alert"><div><strong>Audit trail could not be loaded</strong><span>{auditError}</span></div><Button size="xs" variant="neutral" onClick={() => setAuditRefreshKey(value => value + 1)} disabled={auditLoading}>Try again</Button></div>}
          {auditLoading && audit.length > 0 && <div className="admin-directory-sync" role="status"><RefreshCw size={13} className="spin" /> Refreshing audit events…</div>}
          {auditLoading && audit.length === 0 ? <div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Loading audit trail…</strong><span>Retrieving the latest administrator activity.</span></div>
            : !auditLoaded ? <div className="admin-empty-state"><RefreshCw size={18} className="spin" /><strong>Preparing audit trail…</strong></div>
            : auditError && audit.length === 0 ? <div className="admin-empty-state"><AlertTriangle size={22} /><strong>Audit events unavailable</strong><span>Use “Try again” above to reload activity from the backend.</span></div>
            : audit.length === 0 && !auditError ? <div className="admin-empty-state"><ShieldCheck size={22} /><strong>No audit events recorded yet</strong><span>Account, access, and feedback changes will be recorded here when performed.</span></div>
            : filteredAudit.length === 0 && !auditError ? <div className="admin-empty-state"><Search size={20} /><strong>No matching events</strong><span>Try another search or choose a different action.</span></div>
            : <div className="admin-table-scroll admin-audit-table-wrap"><table className="ap-table admin-audit-table">
            <thead>
              <tr>
                {['Timestamp', 'Actor', 'Action', 'Detail'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleAudit.map(entry => {
                const timestamp = new Date(entry.ts)
                const timestampLabel = Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Timestamp unavailable'
                return <tr key={`${entry.ts}-${entry.actor}-${entry.action}-${entry.detail}`}>
                  <td data-label="Timestamp" className="admin-audit-timestamp">{timestampLabel}</td>
                  <td data-label="Actor" className="admin-audit-actor">{entry.actor}</td>
                  <td data-label="Action"><span className="admin-audit-action" style={{ color: ACTION_COLOR[entry.action] ?? 'var(--color-text-secondary)' }}>{ACTION_LABEL[entry.action] || entry.action.replace(/_/g, ' ')}</span></td>
                  <td data-label="Detail" className="admin-audit-detail">{formatAuditDetails(entry.detail)}</td>
                </tr>
              })}
            </tbody>
          </table></div>}
          {filteredAudit.length > 0 && <div className="admin-audit-pagination">
            <span>{filteredAudit.length} matching loaded event{filteredAudit.length === 1 ? '' : 's'} · Page {auditPage} of {auditPageCount}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="xs" variant="subtle" disabled={auditPage <= 1} onClick={() => setAuditPage(page => Math.max(1, page - 1))}>Previous</Button>
              <Button size="xs" variant="subtle" disabled={auditPage >= auditPageCount} onClick={() => setAuditPage(page => Math.min(auditPageCount, page + 1))}>Next</Button>
            </div>
          </div>}
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
