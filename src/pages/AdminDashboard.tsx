import { useState, useEffect, useRef } from "react"

import { Button } from "../components/ui/Button"
import { Badge } from "../components/ui/Badge"
import { Modal } from "../components/ui/Modal"
import { useAuth } from "../contexts/AuthContext"
import {
  apiAdminAccessRequests,
  apiAdminAccessRequestDetails,
  apiAdminFeedback,
  apiAdminUserByEmail,
  apiAdminUsers,
  apiApproveAccessRequest,
  apiAuditLog,
  apiDeleteAccessRequest,
  apiDeleteFeedback,
  apiDeleteAdminUser,
  apiRejectAccessRequest,
  apiRevokeAccessRequest,
  apiUpdateFeedback,
  apiFeedbackScreenshot,
  apiSources,
  apiDashboard,
  apiHealth,
  apiSystemParameters,
  apiCreateAdminUser,
  apiUpdateAdminUserRole,
  apiUpdateAdminUserStatus,
  isBackendAvailable,
  type SystemParametersResponse,
} from "../services/api"
import {
  CheckCircle,
  ShieldCheck,
  Activity,
  RefreshCw,
  Download,
  Plus,
  Trash2,
  XCircle,
  MailCheck,
  MessageSquare,
  Check,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  Eye,
  Filter,
  X,
  BarChart3,
  CalendarDays,
  MoreVertical,
  ImagePlus,
  UsersRound,
  UserRound,
  Crown,
  Building2,
  ChevronDown,
} from "lucide-react"
import indiaMap from "../assets/india_map_clean.png"
import AuditTrail from "../components/admin/AuditTrail"
import {
  normalizeAuditRecord,
  type AuditRecord,
} from "../components/admin/auditTrailModel"

const AIRFARE_SOURCES_ADMIN: Array<{
  id: string
  name: string
  status: string
  enabled: boolean
  obs: string
}> = []

const INITIAL_AUDIT: AuditRecord[] = []

const ROLE_BADGE = {
  ADMIN: { color: "var(--color-danger)", bg: "var(--color-danger-bg)" },

  ANALYST: { color: "var(--color-info)", bg: "var(--color-info-bg)" },

  PUBLIC: {
    color: "var(--color-brand-primary)",
    bg: "var(--color-brand-muted)",
  },
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "ADMIN",
  ANALYST: "DGCA / ANALYST",
  PUBLIC: "USER",
}
const ROLE_DETAILS: Record<string, {
  access: string
  entitlement: string
  description: string
}> = {
  PUBLIC: {
    access: "User access",
    entitlement: "Subscription selected below",
    description:
      "Route exploration, fare snapshots, and subscription-based alerts.",
  },
  ANALYST: {
    access: "DGCA access",
    entitlement: "Government plan",
    description: "Government intelligence, aviation analysis, and DGCA tools.",
  },
  ADMIN: {
    access: "Administrator access",
    entitlement: "Admin plan",
    description:
      "User management, approvals, audit trail, and system controls.",
  },
}

const ACTION_COLOR: Record<string, string> = {
  INDEX_PUB: "var(--color-brand-primary)",
  GOV_FETCH: "var(--color-info)",
  SOURCE_CHECK: "var(--color-success)",
  LOGIN: "var(--color-success)",
  ROLE_CHANGE: "var(--color-danger)",
  USER_CREATE: "var(--color-success)",
  USER_DELETE: "var(--color-danger)",
  ACCESS_APPROVED: "var(--color-success)",
  ACCESS_REJECTED: "var(--color-danger)",
  ACCESS_REQUEST_DELETE: "var(--color-warning)",
  FEEDBACK_CREATE: "var(--color-brand-primary)",
  FEEDBACK_STATUS: "var(--color-info)",
  FEEDBACK_DELETE: "var(--color-danger)",
}

const ACTION_LABEL: Record<string, string> = {
  ROLE_CHANGE: "Role changed",
  USER_CREATE: "User created",
  USER_DELETE: "User deleted",
  ACCESS_APPROVED: "Access approved",
  ACCESS_REJECTED: "Access rejected",
  ACCESS_REQUEST_DELETE: "Request cleared",
  FEEDBACK_CREATE: "Feedback submitted",
  FEEDBACK_STATUS: "Feedback reviewed",
  FEEDBACK_DELETE: "Feedback removed",
}

type Tab = "overview" | "users" | "pipeline" | "health" | "access" | "audit" | "config" | "feedback"

type ManagedUser = {
  uid?: string
  email: string
  role: string
  plan: string
  name: string
  lastLogin: string
  status: string
  provider?: string
  verified?: boolean
}
type AccessRole = "PUBLIC" | "ANALYST" | "ADMIN"
type AccessPlan = "FREE" | "SUBSCRIBER" | "GOVERNMENT" | "ADMIN"
type AccessEditorState = {
  email: string
  role: AccessRole
  plan: AccessPlan
  originalRole: string
  originalPlan: string
}
const INITIAL_USERS: ManagedUser[] = []
const DIRECTORY_SNAPSHOT_MAX_AGE = 10 * 60 * 1000
const DIRECTORY_SNAPSHOT_KEY = "aeroprice_admin_directory_snapshot"

function readDirectorySnapshot(email?: string): ManagedUser[] | null {
  if (!email) return null
  try {
    const raw = localStorage.getItem(
      `${DIRECTORY_SNAPSHOT_KEY}:${email.toLowerCase()}`,
    )
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt?: number; users?: ManagedUser[] }
    if (
      !parsed.savedAt ||
      Date.now() - parsed.savedAt > DIRECTORY_SNAPSHOT_MAX_AGE ||
      !Array.isArray(parsed.users)
    )
      return null
    return parsed.users
  } catch {
    return null
  }
}

function writeDirectorySnapshot(
  email: string | undefined,
  users: ManagedUser[],
) {
  if (!email) return
  try {
    localStorage.setItem(
      `${DIRECTORY_SNAPSHOT_KEY}:${email.toLowerCase()}`,
      JSON.stringify({ savedAt: Date.now(), users }),
    )
  } catch {
    // Storage is only an instant-render enhancement; the backend remains authoritative.
  }
}

function subscriptionLabel(user: Pick<ManagedUser, "role" | "plan">) {
  if (user.role === "ADMIN") return "Administrator entitlement"
  if (user.role === "ANALYST") return "DGCA / Government entitlement"
  return user.plan === "SUBSCRIBER"
    ? "Premium subscription"
    : "Standard subscription"
}

function formatAuditDetails(detail: string) {
  if (!detail) return "No additional details"
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>
    const labels: Record<string, string> = {
      target_email: "User",
      feature_key: "Feature",
      firebase_deleted: "Firebase identity deleted",
      role: "Role",
      plan: "Plan",
      from: "From",
      to: "To",
      reason: "Reason",
    }
    return (
      Object.entries(parsed)
        .filter(
          ([, value]) => value !== null && value !== undefined && value !== "",
        )
        .map(
          ([key, value]) =>
            `${labels[key] || key.replace(/_/g, " ")}: ${String(value)}`,
        )
        .join(" · ") || "No additional details"
    )
  } catch {
    return detail
  }
}

interface AuditEntry extends AuditRecord {}
interface AccessRequest {
  id: string
  email: string
  name?: string
  feature?: string
  featureKey?: string
  requestMessage?: string
  status: string
  createdAt: string
  reviewedAt?: string
  rejectionReason?: string
  reviewedBy?: string
  currentPlan?: string
}
interface AccessHistoryEntry {
  action: string
  actor?: string
  created_at?: string
  details?: Record<string, unknown>
}
interface FeedbackEntry {
  id: string
  email: string
  name: string
  message: string
  createdAt: string
  status: "NEW" | "REVIEWED" | "IN_PROGRESS" | "RESOLVED"
  title?: string
  category?: string
  sourceModule?: string
  priority?: string
  role?: string
  plan?: string
  browser?: string
  device?: string
  reply?: string
  internalNotes?: string
  hasScreenshot?: boolean
  screenshotName?: string
  screenshotType?: string
}
function feedbackStatusLabel(status: FeedbackEntry["status"]) {
  return (
    ({
      NEW: "Needs review",
      REVIEWED: "Reviewed",
      IN_PROGRESS: "In progress",
      RESOLVED: "Resolved",
    } as Record<string, string>)[status] || status
  )
}

function feedbackCategoryLabel(category?: string) {
  return ({
    BUG: "Bug report",
    PRODUCT: "Product feedback",
    DATA: "Data or route issue",
    DESIGN: "UI/UX suggestion",
    SUPPORT: "Support request",
    PRAISE: "Praise / positive feedback",
  } as Record<string, string>)[category || ""] || category?.replace(/_/g, " ") || "Not recorded"
}

function premiumAccessHistoryLabel(action: string) {
  return ({
    ACCESS_REQUESTED: "Premium requested",
    ACCESS_APPROVED: "Premium approved and activated",
    ACCESS_REJECTED: "Premium request rejected",
    ACCESS_REVOKED: "Premium access revoked",
    ACCESS_REQUEST_DELETE: "Request removed",
  } as Record<string, string>)[action] || action.toLowerCase().replace(/_/g, " ")
}
interface QueueRemoval {
  kind: "access" | "feedback"
  id: string
  label: string
}

export default function AdminDashboard() {
  const { user, token } = useAuth()
  const [tab, setTab] = useState<Tab>("overview")
  const [audit, setAudit] = useState<AuditEntry[]>(INITIAL_AUDIT)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLoaded, setAuditLoaded] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditRefreshKey, setAuditRefreshKey] = useState(0)
  const [auditQuery, setAuditQuery] = useState("")
  const [auditAction, setAuditAction] = useState("ALL")
  const [auditPage, setAuditPage] = useState(1)
  const [sources, setSources] = useState(AIRFARE_SOURCES_ADMIN)

  const [systemParameters, setSystemParameters] =
    useState<SystemParametersResponse | null>(null)

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(
    () => readDirectorySnapshot(user?.email) || INITIAL_USERS,
  )
  const [usersLoading, setUsersLoading] = useState(false)

  const [usersLoaded, setUsersLoaded] = useState(false)

  const [usersError, setUsersError] = useState<string | null>(null)
  const [nextUsersPage, setNextUsersPage] = useState<string | null>(null)
  const [userQuery, setUserQuery] = useState("")
  const [userRoleFilter, setUserRoleFilter] =
    useState<"ALL" | "PUBLIC" | "ANALYST" | "ADMIN">("ALL")
  const [userPlanFilter, setUserPlanFilter] =
    useState<"ALL" | "FREE" | "SUBSCRIBER">("ALL")
  const [userStatusFilter, setUserStatusFilter] =
    useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL")
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null)
  const [userToToggleStatus, setUserToToggleStatus] = useState<ManagedUser | null>(null)
  const [statusReason, setStatusReason] = useState("")
  const [statusReasonMenuOpen, setStatusReasonMenuOpen] = useState(false)
  const [updatingUserStatus, setUpdatingUserStatus] = useState(false)
  const [selectedUserEmails, setSelectedUserEmails] = useState<string[]>([])
  const [bulkUserStatusDialog, setBulkUserStatusDialog] = useState<boolean | null>(null)
  const [bulkUserReasonCategory, setBulkUserReasonCategory] = useState("")
  const [bulkUserReasonDetail, setBulkUserReasonDetail] = useState("")
  const [deletingUserEmail, setDeletingUserEmail] = useState<string | null>(
    null,
  )
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "PUBLIC",
    plan: "FREE",
  })
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)

  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessLoaded, setAccessLoaded] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [accessRefreshKey, setAccessRefreshKey] = useState(0)
  const [accessQuery, setAccessQuery] = useState("")
  const [debouncedAccessQuery, setDebouncedAccessQuery] = useState("")
  const [accessStatusFilter, setAccessStatusFilter] =
    useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "REVOKED">("ALL")
  const [accessDateRange, setAccessDateRange] = useState<"ALL" | "7D" | "30D">("ALL")
  const [accessPage, setAccessPage] = useState(1)
  const [accessPageSize, setAccessPageSize] = useState(5)
  const [accessActivePremiumCount, setAccessActivePremiumCount] = useState<number | null>(null)
  const [selectedAccessIds, setSelectedAccessIds] = useState<string[]>([])
  const [selectedAccessRequest, setSelectedAccessRequest] = useState<AccessRequest | null>(null)
  const [accessRequestHistory, setAccessRequestHistory] = useState<AccessHistoryEntry[]>([])
  const [accessDetailLoading, setAccessDetailLoading] = useState(false)
  const [accessDetailError, setAccessDetailError] = useState<string | null>(null)
  const [accessMenuId, setAccessMenuId] = useState<string | null>(null)
  const [accessActionDialog, setAccessActionDialog] = useState<"APPROVE" | "REJECT" | "REVOKE" | "BULK_APPROVE" | "BULK_REJECT" | null>(null)
  const [accessActionReason, setAccessActionReason] = useState("")
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackLoaded, setFeedbackLoaded] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0)
  const [feedbackQuery, setFeedbackQuery] = useState("")
  const [feedbackStatusFilter, setFeedbackStatusFilter] =
    useState<"ALL" | "NEW" | "REVIEWED" | "IN_PROGRESS" | "RESOLVED">("ALL")
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState("ALL")
  const [feedbackDateRange, setFeedbackDateRange] =
    useState<"ALL" | "7D" | "30D">("ALL")
  const [feedbackAnalyticsOpen, setFeedbackAnalyticsOpen] = useState(false)
  const [feedbackMoreOpen, setFeedbackMoreOpen] = useState(false)
  const [feedbackBusyId, setFeedbackBusyId] = useState<string | null>(null)
  const [selectedFeedback, setSelectedFeedback] =
    useState<FeedbackEntry | null>(null)
  const [feedbackEditStatus, setFeedbackEditStatus] =
    useState<FeedbackEntry["status"]>("NEW")
  const [feedbackReplyDraft, setFeedbackReplyDraft] = useState("")
  const [feedbackInternalNotesDraft, setFeedbackInternalNotesDraft] = useState("")
  const [feedbackImageUrl, setFeedbackImageUrl] = useState("")
  const [feedbackImageLoading, setFeedbackImageLoading] = useState(false)
  const [feedbackFiltersOpen, setFeedbackFiltersOpen] = useState(false)
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<string[]>([])
  const [pendingRemoval, setPendingRemoval] = useState<QueueRemoval | null>(
    null,
  )
  const [removingQueueItem, setRemovingQueueItem] = useState<string | null>(
    null,
  )
  const [dashboardData, setDashboardData] = useState<any>(null)

  const [healthData, setHealthData] = useState<any>(null)

  const [toast, setToast] = useState<string | null>(null)

  const [resettingEmail, setResettingEmail] = useState<string | null>(null)
  const [savingUser, setSavingUser] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [accessEditor, setAccessEditor] = useState<AccessEditorState | null>(
    null,
  )
  const [accessEditorStep, setAccessEditorStep] = useState<"edit" | "review">(
    "edit",
  )
  const [resetSentEmail, setResetSentEmail] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appliedSnapshotEmailRef = useRef<string | null>(null)
  const auditPageSize = 20
  const filteredAudit = audit.filter((entry) => {
    const matchesAction = auditAction === "ALL" || entry.action === auditAction
    const query = auditQuery.trim().toLowerCase()
    return (
      matchesAction &&
      (!query ||
        `${entry.actor} ${entry.action} ${entry.detail}`
          .toLowerCase()
          .includes(query))
    )
  })
  const auditPageCount = Math.max(
    1,
    Math.ceil(filteredAudit.length / auditPageSize),
  )
  const visibleAudit = filteredAudit.slice(
    (auditPage - 1) * auditPageSize,
    auditPage * auditPageSize,
  )
  const auditActorCount = new Set(
    audit.map((entry) => entry.actor).filter(Boolean),
  ).size
  const auditActionCount = new Set(
    audit.map((entry) => entry.action).filter(Boolean),
  ).size
  const auditRecentCount = audit.filter((entry) => {
    const age = Date.now() - new Date(entry.ts).getTime()
    return Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000
  }).length
  const filteredManagedUsers = managedUsers.filter((entry) => {
    const query = userQuery.trim().toLowerCase()
    const matchesQuery =
      !query || `${entry.name} ${entry.email}`.toLowerCase().includes(query)
    const matchesRole =
      userRoleFilter === "ALL" || entry.role === userRoleFilter
    const matchesPlan =
      userPlanFilter === "ALL" ||
      (entry.role === "PUBLIC" &&
        (entry.plan === "SUBSCRIBER" ? "SUBSCRIBER" : "FREE") ===
          userPlanFilter)
    const matchesStatus =
      userStatusFilter === "ALL" || entry.status === userStatusFilter
    return matchesQuery && matchesRole && matchesPlan && matchesStatus
  })
  const selectableVisibleUsers = filteredManagedUsers.filter((entry) => entry.email.toLowerCase() !== user?.email?.toLowerCase())
  const visibleSelectedUsers = selectableVisibleUsers.filter((entry) => selectedUserEmails.includes(entry.email.toLowerCase()))
  const selectedUsers = managedUsers.filter((entry) => selectedUserEmails.includes(entry.email.toLowerCase()) && entry.email.toLowerCase() !== user?.email?.toLowerCase())
  const selectedActiveUsers = selectedUsers.filter((entry) => entry.status === "ACTIVE")
  const selectedInactiveUsers = selectedUsers.filter((entry) => entry.status !== "ACTIVE")
  const filteredAccessRequests = accessRequests.filter((request) => {
    const query = debouncedAccessQuery.trim().toLowerCase()
    const matchesQuery =
      !query ||
      `${request.name || ""} ${request.email} ${request.feature || ""} ${request.featureKey || ""} ${request.id}`
        .toLowerCase()
        .includes(query)
    const requestedAt = new Date(request.createdAt).getTime()
    const age = Date.now() - requestedAt
    const matchesDate = accessDateRange === "ALL" || (Number.isFinite(age) && age >= 0 && age <= (accessDateRange === "7D" ? 7 : 30) * 24 * 60 * 60 * 1000)
    return matchesQuery && matchesDate && (accessStatusFilter === "ALL" || request.status === accessStatusFilter)
  })
  const accessPageCount = Math.max(1, Math.ceil(filteredAccessRequests.length / accessPageSize))
  const visibleAccessRequests = filteredAccessRequests.slice((accessPage - 1) * accessPageSize, accessPage * accessPageSize)
  const visibleAccessIds = visibleAccessRequests.map((request) => request.id)
  const visiblePendingAccessIds = visibleAccessRequests.filter((request) => request.status === "PENDING").map((request) => request.id)
  const selectedPendingAccessIds = selectedAccessIds.filter((id) => accessRequests.some((request) => request.id === id && request.status === "PENDING"))
  const accessHasVerifiedSnapshot = accessLoaded && (!accessError || accessRequests.length > 0)
  const filteredFeedback = feedback.filter((item) => {
    const query = feedbackQuery.trim().toLowerCase()
    const matchesQuery =
      !query ||
      `${item.name} ${item.email} ${item.message}`.toLowerCase().includes(query)
    const matchesCategory =
      feedbackCategoryFilter === "ALL" ||
      item.category === feedbackCategoryFilter
    const createdAt = new Date(item.createdAt).getTime()
    const age = Date.now() - createdAt
    const matchesRange =
      feedbackDateRange === "ALL" ||
      (Number.isFinite(age) &&
        age >= 0 &&
        age <= (feedbackDateRange === "7D" ? 7 : 30) * 24 * 60 * 60 * 1000)
    return (
      matchesQuery &&
      matchesCategory &&
      matchesRange &&
      (feedbackStatusFilter === "ALL" || item.status === feedbackStatusFilter)
    )
  })
  const visibleSelectedFeedback = filteredFeedback.filter((item) => selectedFeedbackIds.includes(item.id))
  const selectedFeedbackEntries = feedback.filter((item) => selectedFeedbackIds.includes(item.id))
  const reviewableFeedbackIds = selectedFeedbackEntries
    .filter((item) => item.status === "NEW" || item.status === "IN_PROGRESS")
    .map((item) => item.id)
  const resolvableFeedbackIds = selectedFeedbackEntries
    .filter((item) => item.status !== "RESOLVED")
    .map((item) => item.id)

  useEffect(() => {
    const email = user?.email?.trim().toLowerCase()
    if (!email || appliedSnapshotEmailRef.current === email) return
    appliedSnapshotEmailRef.current = email
    const snapshot = readDirectorySnapshot(email)
    if (snapshot?.length) setManagedUsers(snapshot)
  }, [user?.email])

  useEffect(() => {
    async function loadPipelineData() {
      if (tab !== "pipeline" && tab !== "overview") return

      try {
        // Health is intentionally public so the admin shell can still explain

        // backend state when Firebase has expired the admin session.

        const healthResult = healthData
          ? null
          : await Promise.allSettled([apiHealth()])

        if (healthResult?.[0].status === "fulfilled")
          setHealthData(healthResult[0].value)

        if (!token) return

        const [directoryResult, dashboardResult] = await Promise.allSettled([
          apiSources(token),
          apiDashboard(token),
        ])

        if (dashboardResult.status === "fulfilled")
          setDashboardData(dashboardResult.value)

        if (directoryResult.status === "fulfilled") {
          const directory = directoryResult.value

          const airfare = directory.airfare || directory.airfare_sources || []

          const government =
            directory.government || directory.government_sources || []

          const liveSources = [...airfare, ...government]

          setSources(
            liveSources.map((source: any) => ({
              id: String(source.id || source.source_id),

              name: String(
                source.name || source.source_name || source.id || "Source",
              ),

              status: String(source.status || "NOT_CONFIGURED"),

              enabled: source.status === "LIVE",

              obs: `${Number(source.records_total || 0).toLocaleString()} records`,
            })),
          )
        }

        if (
          dashboardResult.status === "rejected" &&
          directoryResult.status === "rejected"
        ) {
          throw new Error("No admin data services responded")
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
    if (tab !== "health" || healthData) return

    void apiHealth()
      .then(setHealthData)
      .catch(() => showToast("Unable to load system health from the backend."))
  }, [tab, healthData])

  useEffect(() => {
    if (tab !== "config" || !token) return

    void apiSystemParameters(token)
      .then(setSystemParameters)
      .catch(() => setSystemParameters(null))
  }, [tab, token])

  useEffect(() => {
    const applyAdminTab = (value: unknown) => {
      if (
        value === "overview" ||
        value === "pipeline" ||
        value === "health" ||
        value === "users" ||
        value === "access" ||
        value === "feedback" ||
        value === "audit" ||
        value === "config"
      )
        setTab(value)
    }

    applyAdminTab(sessionStorage.getItem("admin-tab"))

    const onAdminTab = (event: Event) =>
      applyAdminTab((event as CustomEvent).detail)

    window.addEventListener("admin-tab", onAdminTab)

    return () => window.removeEventListener("admin-tab", onAdminTab)
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
      showToast("Enter a name and email before adding a user.")
      return
    }
    setSavingUser(true)
    try {
      const result = (await apiCreateAdminUser(
        {
          name,
          email,
          role: newUser.role as "PUBLIC" | "ANALYST" | "ADMIN",
          plan: newUser.plan as "FREE" | "SUBSCRIBER" | "GOVERNMENT" | "ADMIN",
        },
        token ?? undefined,
      )) as { user?: Record<string, any>; message?: string }
      const entry = result.user
      if (entry?.email) {
        setManagedUsers((prev) => {
          const next = [
            {
              uid: entry.uid,
              email: entry.email,
              role: entry.role,
              plan: entry.plan,
              name: entry.name,
              lastLogin: "Not recorded",
              status: "ACTIVE",
              verified: false,
            },
            ...prev.filter(
              (userEntry) => userEntry.email.toLowerCase() !== email,
            ),
          ]
          writeDirectorySnapshot(user?.email, next)
          return next
        })
      }
      setNewUser({ name: "", email: "", role: "PUBLIC", plan: "FREE" })
      setShowCreateUserForm(false)
      showToast(result.message || `User account created for ${email}.`, 6000)
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The user account could not be created.",
        6000,
      )
    } finally {
      setSavingUser(false)
    }
  }

  async function updateManagedUserRole(
    email: string,
    role: AccessRole,
    plan: AccessPlan,
  ) {
    setUpdatingRole(email)
    try {
      const existingEntry = managedUsers.find(
        (entry) => entry.email.toLowerCase() === email.toLowerCase(),
      )
      const result = (await apiUpdateAdminUserRole(
        email,
        role,
        plan,
        token ?? undefined,
        existingEntry?.uid,
      )) as { role: string; plan: string; firebase_sync?: string }
      let refreshedEntry: Partial<ManagedUser> | null = null
      if (token) {
        try {
          const refreshed = await apiAdminUserByEmail(email, token)
          const remote = Array.isArray(refreshed.users)
            ? refreshed.users[0]
            : null
          if (remote?.email) {
            refreshedEntry = {
              uid: remote.uid,
              email: remote.email,
              role: remote.role || result.role,
              plan: remote.plan || result.plan,
              name: remote.name || existingEntry?.name || remote.email,
              lastLogin:
                remote.lastLogin || remote.last_login || existingEntry?.lastLogin || "Not recorded",
              status:
                remote.status ||
                (remote.is_active === false ? "INACTIVE" : "ACTIVE"),
              provider: Array.isArray(remote.providers)
                ? remote.providers.join(", ")
                : existingEntry?.provider,
              verified:
                typeof remote.email_verified === "boolean"
                  ? remote.email_verified
                  : existingEntry?.verified,
            }
          }
        } catch {
          refreshedEntry = null
        }
      }
      setManagedUsers((prev) => {
        const next = prev.map((entry) =>
          entry.email.toLowerCase() === email.toLowerCase()
            ? {
                ...entry,
                ...refreshedEntry,
                role: refreshedEntry?.role || result.role,
                plan: refreshedEntry?.plan || result.plan,
              }
            : entry,
        )
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setAccessEditor(null)
      setAccessEditorStep("edit")
      showToast(`${email} is now ${ROLE_LABEL[result.role] || result.role}.${result.firebase_sync === 'DEFERRED' ? ' Firebase claim sync will retry; server access changed now.' : ''}`)
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "The user role could not be updated.",
        6000,
      )
    } finally {
      setUpdatingRole(null)
    }
  }

  function openAccessEditor(entry: ManagedUser) {
    const role = (
      entry.role === "ANALYST" || entry.role === "ADMIN" ? entry.role : "PUBLIC"
    ) as AccessRole
    const plan = (
      role === "PUBLIC" && entry.plan === "SUBSCRIBER"
        ? "SUBSCRIBER"
        : role === "ANALYST"
          ? "GOVERNMENT"
          : role === "ADMIN"
            ? "ADMIN"
            : "FREE"
    ) as AccessPlan
    setAccessEditor({
      email: entry.email,
      role,
      plan,
      originalRole: role,
      originalPlan: plan,
    })
    setAccessEditorStep("edit")
  }

  async function confirmToggleUserStatus() {
    if (!userToToggleStatus) return
    const entry = userToToggleStatus
    const isActive = entry.status !== "ACTIVE"
    if (!isActive && !statusReason.trim()) {
      showToast("Add a reason before disabling this account.", 5000)
      return
    }
    setUpdatingUserStatus(true)
    try {
      const result = (await apiUpdateAdminUserStatus(entry.email, isActive, token ?? undefined, statusReason, entry.uid)) as {
        status?: string
        is_active?: boolean
      }
      setManagedUsers((prev) => {
        const next = prev.map((item) =>
          item.email.toLowerCase() === entry.email.toLowerCase()
            ? { ...item, status: result.status || (isActive ? "ACTIVE" : "INACTIVE") }
            : item,
        )
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setSelectedUserEmails((selected) => selected.filter((email) => email !== entry.email.toLowerCase()))
      setUserToToggleStatus(null)
      setStatusReason("")
      showToast(`${entry.email} is now ${isActive ? "active" : "disabled"}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "The user status could not be updated."
      if (message.includes("/status: 404")) {
        showToast("This API server is running an older version without account status support. Restart or deploy the updated backend, then retry; the account was not changed.", 9000)
      } else {
        showToast(message, 6000)
      }
    } finally {
      setUpdatingUserStatus(false)
    }
  }

  async function confirmBulkUserStatus() {
    if (bulkUserStatusDialog === null) return
    const isActive = bulkUserStatusDialog
    const targets = isActive ? selectedInactiveUsers : selectedActiveUsers
    if (!targets.length) return
    if (!isActive && (!bulkUserReasonCategory || (bulkUserReasonCategory === "Other reason" && !bulkUserReasonDetail.trim()))) {
      showToast("Choose a reason before disabling selected users.", 5000)
      return
    }
    const reason = isActive
      ? ""
      : bulkUserReasonCategory === "Other reason"
        ? bulkUserReasonDetail.trim()
        : [bulkUserReasonCategory, bulkUserReasonDetail.trim()].filter(Boolean).join(": ")
    setUpdatingUserStatus(true)
    const succeeded: string[] = []
    const failed: string[] = []
    for (const entry of targets) {
      try {
        await apiUpdateAdminUserStatus(entry.email, isActive, token ?? undefined, reason, entry.uid)
        succeeded.push(entry.email.toLowerCase())
      } catch {
        failed.push(entry.email)
      }
    }
    if (succeeded.length) {
      setManagedUsers((previous) => {
        const next = previous.map((entry) => succeeded.includes(entry.email.toLowerCase())
          ? { ...entry, status: isActive ? "ACTIVE" : "INACTIVE" }
          : entry)
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setSelectedUserEmails((previous) => previous.filter((email) => !succeeded.includes(email)))
    }
    setUpdatingUserStatus(false)
    setBulkUserStatusDialog(null)
    setBulkUserReasonCategory("")
    setBulkUserReasonDetail("")
    if (failed.length) {
      showToast(`${succeeded.length} updated. ${failed.length} failed: ${failed.join(", ")}`, 8000)
    } else {
      showToast(`${succeeded.length} user account${succeeded.length === 1 ? "" : "s"} ${isActive ? "enabled" : "disabled"}.`)
    }
  }

  function resetManagedPassword(email: string) {
    setResettingEmail(email)

    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(
        () =>
          reject(
            new Error("The reset service did not respond within 12 seconds."),
          ),
        12000,
      )
    })

    Promise.race([
      import("../services/firebase").then(({ sendFirebasePasswordReset }) =>
        sendFirebasePasswordReset(email),
      ),

      timeout,
    ])

      .then(() => {
        setResetSentEmail(email)

        showToast(`Password reset email sent to ${email}`, 6000)
      })

      .catch((error: unknown) => {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: unknown }).code)
            : ""

        const message = error instanceof Error ? error.message : ""

        const reason =
          code === "auth/user-not-found"
            ? "No Firebase account exists for this email."
            : code === "auth/no-password-provider"
              ? "Firebase could not create a password reset for this account. Ask the user to continue with Google first, then request a reset again."
              : message || "Firebase authentication is not configured."

        showToast(`Unable to send reset email: ${reason}`, 6000)
      })

      .finally(() => setResettingEmail(null))
  }

  async function confirmDeleteManagedUser() {
    if (!userToDelete) return
    const { email, uid } = userToDelete
    if (email.toLowerCase() === user?.email?.toLowerCase()) {
      showToast("You cannot delete the currently signed-in administrator.")
      return
    }
    setDeletingUserEmail(email)
    try {
      const result = (await apiDeleteAdminUser(
        email,
        uid,
        token ?? undefined,
      )) as { status?: string; firebase_deleted?: boolean }
      setManagedUsers((previous) => {
        const next = previous.filter(
          (entry) => entry.email.toLowerCase() !== email.toLowerCase(),
        )
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setUserToDelete(null)
      showToast(
        result.firebase_deleted
          ? `${email} and the Firebase sign-in were deleted.`
          : `${email} was removed from the local directory.`,
        6000,
      )
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : `Could not delete ${email}. The account is unchanged.`,
        6000,
      )
    } finally {
      setDeletingUserEmail(null)
    }
  }

  async function approveFeatureRequest(id: string) {
    setAccessBusyId(id)
    try {
      const result = (await apiApproveAccessRequest(
        id,
        token ?? undefined,
      )) as { status: string; reviewed_at?: string }
      setAccessRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: result.status, reviewedAt: result.reviewed_at }
            : r,
        ),
      )
      showToast(
        "Feature access approved. The user will see the update after refresh.",
      )
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not approve access request.",
      )
    } finally {
      setAccessBusyId(null)
    }
  }

  async function rejectFeatureRequest(id: string) {
    setAccessBusyId(id)
    try {
      const result = (await apiRejectAccessRequest(
        id,
        "Not approved by the administrator.",
        token ?? undefined,
      )) as { status: string; reviewed_at?: string; rejection_reason?: string }
      setAccessRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: result.status,
                reviewedAt: result.reviewed_at,
                rejectionReason: result.rejection_reason,
              }
            : r,
        ),
      )
      showToast("Feature access request rejected.")
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not reject access request.",
      )
    } finally {
      setAccessBusyId(null)
    }
  }

  async function confirmAccessAction() {
    const action = accessActionDialog
    if (!action) return
    const bulk = action.startsWith("BULK_")
    const ids = bulk
      ? selectedPendingAccessIds
      : selectedAccessRequest ? [selectedAccessRequest.id] : []
    if (!ids.length) return
    setAccessBusyId(bulk ? "bulk" : ids[0])
    const succeeded: string[] = []
    const failed: string[] = []
    for (const id of ids) {
      try {
        if (action === "APPROVE" || action === "BULK_APPROVE") {
          await apiApproveAccessRequest(id, token ?? undefined)
        } else if (action === "REVOKE") {
          await apiRevokeAccessRequest(id, accessActionReason.trim() || "Access revoked by the administrator.", token ?? undefined)
        } else {
          await apiRejectAccessRequest(id, accessActionReason.trim() || undefined, token ?? undefined)
        }
        succeeded.push(id)
      } catch {
        failed.push(id)
      }
    }
    setAccessBusyId(null)
    setAccessActionDialog(null)
    setSelectedAccessRequest(null)
    setSelectedAccessIds((selected) => selected.filter((id) => !succeeded.includes(id)))
    setAccessActionReason("")
    if (action === "APPROVE" || action === "BULK_APPROVE" || action === "REVOKE") {
      const targetEmails = new Set(ids.flatMap((id) => {
        const request = accessRequests.find((entry) => entry.id === id)
        return request && succeeded.includes(id) ? [request.email.toLowerCase()] : []
      }))
      const restoredPlan = action === "REVOKE" ? "FREE" : "SUBSCRIBER"
      setManagedUsers((previous) => {
        const next = previous.map((entry) => targetEmails.has(entry.email.toLowerCase()) && entry.role === "PUBLIC"
          ? { ...entry, plan: restoredPlan }
          : entry)
        writeDirectorySnapshot(user?.email, next)
        return next
      })
    }
    setAccessRefreshKey((key) => key + 1)
    if (failed.length) {
      showToast(`${succeeded.length} succeeded. ${failed.length} failed: ${failed.join(", ")}`, 8000)
    } else {
      const verb = action.includes("APPROVE") ? "approved" : action === "REVOKE" ? "revoked" : "rejected"
      showToast(`${succeeded.length} request${succeeded.length === 1 ? "" : "s"} ${verb}.`)
    }
  }

  async function openAccessRequest(request: AccessRequest) {
    setSelectedAccessRequest(request)
    setAccessRequestHistory([])
    setAccessDetailError(null)
    setAccessDetailLoading(true)
    try {
      const result = await apiAdminAccessRequestDetails(request.id, token ?? undefined)
      const item = result.request
      const updated: AccessRequest = {
        ...request,
        requestMessage: typeof item.request_message === "string" ? item.request_message : request.requestMessage,
        reviewedAt: typeof item.reviewed_at === "string" ? item.reviewed_at : request.reviewedAt,
        reviewedBy: typeof item.reviewed_by === "string" ? item.reviewed_by : request.reviewedBy,
        rejectionReason: typeof item.rejection_reason === "string" ? item.rejection_reason : request.rejectionReason,
        status: typeof item.status === "string" ? item.status : request.status,
      }
      setSelectedAccessRequest(updated)
      setAccessRequests((previous) => previous.map((entry) => entry.id === updated.id ? updated : entry))
      setAccessRequestHistory(Array.isArray(result.history) ? result.history as AccessHistoryEntry[] : [])
    } catch (error) {
      setAccessDetailError(error instanceof Error ? error.message : "The request history could not be loaded.")
    } finally {
      setAccessDetailLoading(false)
    }
  }

  async function removeAccessRequest(id: string) {
    setRemovingQueueItem(id)
    try {
      await apiDeleteAccessRequest(id, token ?? undefined)
      setAccessRequests((prev) => prev.filter((r) => r.id !== id))
      setPendingRemoval(null)
      showToast("Access request cleared; user can request again")
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Could not clear access request.",
      )
    } finally {
      setRemovingQueueItem(null)
    }
  }

  function openFeedback(item: FeedbackEntry) {
    setSelectedFeedback(item)
    setFeedbackEditStatus(item.status)
    setFeedbackReplyDraft(item.reply || "")
    setFeedbackInternalNotesDraft(item.internalNotes || "")
  }

  async function viewFeedbackScreenshot(id: string) {
    setFeedbackImageLoading(true)
    try {
      const blob = await apiFeedbackScreenshot(id, token ?? "")
      setFeedbackImageUrl(URL.createObjectURL(blob))
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The screenshot could not be loaded.")
    } finally {
      setFeedbackImageLoading(false)
    }
  }

  async function updateFeedback(
    id: string,
    status: FeedbackEntry["status"],
    reply?: string,
    internalNotes?: string,
  ) {
    setFeedbackBusyId(id)
    try {
      await apiUpdateFeedback(id, status, token ?? undefined, reply, internalNotes)
      setFeedback((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status, reply: reply ?? item.reply, internalNotes: internalNotes ?? item.internalNotes }
            : item,
        ),
      )
      setSelectedFeedback((prev) =>
        prev?.id === id
          ? { ...prev, status, reply: reply ?? prev.reply, internalNotes: internalNotes ?? prev.internalNotes }
          : prev,
      )
      setSelectedFeedbackIds((selected) => selected.filter((selectedId) => selectedId !== id))
      setFeedbackEditStatus(status)
      showToast(
        status === "REVIEWED"
          ? "Feedback marked as reviewed."
          : status === "NEW"
            ? "Feedback reopened."
            : "Feedback status updated.",
      )
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not update feedback.",
      )
    } finally {
      setFeedbackBusyId(null)
    }
  }

  async function bulkUpdateFeedback(status: "REVIEWED" | "RESOLVED") {
    const ids = status === "REVIEWED" ? reviewableFeedbackIds : resolvableFeedbackIds
    if (!ids.length || feedbackBusyId) return
    setFeedbackBusyId("bulk")
    const succeeded: string[] = []
    const failed: string[] = []
    for (const id of ids) {
      try {
        await apiUpdateFeedback(id, status, token ?? undefined)
        succeeded.push(id)
      } catch {
        failed.push(id)
      }
    }
    if (succeeded.length) {
      setFeedback((previous) => previous.map((item) => succeeded.includes(item.id) ? { ...item, status } : item))
      setSelectedFeedback((previous) => previous && succeeded.includes(previous.id) ? { ...previous, status } : previous)
      setSelectedFeedbackIds((previous) => previous.filter((id) => !succeeded.includes(id)))
    }
    setFeedbackBusyId(null)
    if (failed.length) {
      showToast(`${succeeded.length} updated. ${failed.length} failed: ${failed.join(", ")}`, 8000)
    } else {
      showToast(`${succeeded.length} feedback message${succeeded.length === 1 ? "" : "s"} ${status === "REVIEWED" ? "marked reviewed" : "resolved"}.`)
    }
  }

  async function removeFeedback(id: string) {
    setRemovingQueueItem(id)
    try {
      await apiDeleteFeedback(id, token ?? undefined)
      setFeedback((prev) => prev.filter((item) => item.id !== id))
      setSelectedFeedbackIds((prev) => prev.filter((selectedId) => selectedId !== id))
      setPendingRemoval(null)
      showToast("Feedback removed from the admin queue.")
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not remove feedback.",
      )
    } finally {
      setRemovingQueueItem(null)
    }
  }

  function confirmQueueRemoval() {
    if (!pendingRemoval) return
    if (pendingRemoval.kind === "access")
      void removeAccessRequest(pendingRemoval.id)
    else void removeFeedback(pendingRemoval.id)
  }

  useEffect(() => {
    async function loadUsers() {
      // Firebase restores the session asynchronously. Do not send an

      // unauthenticated request on the first render and then leave a stale

      // 401 toast visible after the authenticated request succeeds.

      if (
        !token ||
        usersLoaded ||
        !["overview", "users", "access"].includes(tab)
      )
        return

      setUsersLoading(true)

      setUsersError(null)

      try {
        const result = await apiAdminUsers(token ?? undefined)

        const remoteUsers = Array.isArray(result?.users)
          ? result.users

              .filter(
                (entry: any) =>
                  typeof entry?.email === "string" &&
                  entry.email.trim().length > 0,
              )

              .map((entry: any) => ({
                email: entry.email,

                role: entry.role,

                plan: entry.plan,

                name: entry.name,

                lastLogin:
                  entry.lastLogin || entry.last_login || "Not recorded",

                status:
                  entry.status ||
                  (entry.is_active === false ? "INACTIVE" : "ACTIVE"),

                uid: entry.uid,

                provider: Array.isArray(entry.providers)
                  ? entry.providers.join(", ")
                  : undefined,

                verified: entry.email_verified,
              }))
          : []

        // Firebase is authoritative when configured. Do not merge it with
        // demo fixtures: that creates duplicate/fake users in the admin UI.
        if (remoteUsers.length > 0) {
          const uniqueUsers = Array.from(
            new Map(
              remoteUsers.map((entry) => [entry.email.toLowerCase(), entry]),
            ).values(),
          )
          setManagedUsers(uniqueUsers)
          writeDirectorySnapshot(user?.email, uniqueUsers)
        }
        if (remoteUsers.length === 0 && result?.note)
          setUsersError(String(result.note))

        setNextUsersPage(result?.next_page_token || null)

        setUsersLoaded(true)
      } catch (error) {
        setUsersError(
          error instanceof Error
            ? error.message
            : "The authenticated user directory could not be loaded.",
        )

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

      const more = (result.users || [])
        .filter((entry: any) => entry?.email)
        .map((entry: any) => ({
          uid: entry.uid,
          email: entry.email,
          role: entry.role,
          plan: entry.plan,
          name: entry.name,

          lastLogin: entry.lastLogin || entry.last_login || "Not recorded",

          status:
            entry.status || (entry.is_active === false ? "INACTIVE" : "ACTIVE"),

          provider: Array.isArray(entry.providers)
            ? entry.providers.join(", ")
            : undefined,

          verified: entry.email_verified,
        }))

      setManagedUsers((prev) => {
        const next = [...prev, ...more]
        writeDirectorySnapshot(user?.email, next)
        return next
      })
      setNextUsersPage(result.next_page_token || null)
    } catch (error) {
      setUsersError(
        error instanceof Error ? error.message : "Could not load more users.",
      )
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    async function loadAudit() {
      if (tab !== "audit") return
      setAuditLoading(true)
      setAuditError(null)
      try {
        const result = (await apiAuditLog(token ?? "", 200)) as {
          entries?: Array<Record<string, any>>
          total?: number
        }
        if (!Array.isArray(result?.entries))
          throw new Error("The audit service returned an invalid response.")
        if (!active) return
        setAudit(result.entries.map((entry) => normalizeAuditRecord(entry)))
        setAuditTotal(
          Number.isFinite(Number(result.total))
            ? Number(result.total)
            : result.entries.length,
        )
      } catch (error) {
        if (active)
          setAuditError(
            error instanceof Error
              ? error.message
              : "Could not load the audit trail.",
          )
      } finally {
        if (active) {
          setAuditLoading(false)
          setAuditLoaded(true)
        }
      }
    }
    void loadAudit()
    return () => {
      active = false
    }
  }, [tab, token, auditRefreshKey])

  useEffect(() => {
    setAuditPage(1)
  }, [auditQuery, auditAction])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedAccessQuery(accessQuery), 250)
    return () => window.clearTimeout(timeout)
  }, [accessQuery])

  useEffect(() => {
    setAccessPage(1)
  }, [debouncedAccessQuery, accessStatusFilter, accessDateRange, accessPageSize])

  useEffect(() => {
    if (tab !== "users" && tab !== "access") return
    let active = true
    async function loadAccessRequests() {
      setAccessLoading(true)
      setAccessError(null)
      try {
        const result = await apiAdminAccessRequests(token ?? undefined)
        if (Array.isArray(result?.requests)) {
          const requests = result.requests.map((entry: any) => ({
            id: entry.id,
            email: entry.email,
            name: entry.name,
            feature: entry.feature,
            featureKey: entry.feature_key,
            requestMessage: entry.request_message,
            status: entry.status,
            createdAt: entry.created_at,
            reviewedAt: entry.reviewed_at,
            rejectionReason: entry.rejection_reason,
            reviewedBy: entry.reviewed_by,
            currentPlan: entry.current_plan,
          })).filter((entry: AccessRequest) => entry.featureKey === "PRICE_ALERTS")
          if (active) {
            setAccessRequests(requests)
            setAccessActivePremiumCount(typeof result.active_premium_users === "number" && Number.isFinite(result.active_premium_users) ? result.active_premium_users : null)
            setSelectedAccessIds((selected) => selected.filter((id) => requests.some((entry: AccessRequest) => entry.id === id)))
          }
        } else {
          throw new Error(
            "The access-request service returned an invalid response.",
          )
        }
      } catch (error) {
        if (active)
          setAccessError(
            error instanceof Error
              ? error.message
              : "Could not load access requests.",
          )
      } finally {
        if (active) {
          setAccessLoading(false)
          setAccessLoaded(true)
        }
      }
    }
    void loadAccessRequests()
    return () => {
      active = false
    }
  }, [tab, token, accessRefreshKey])

  useEffect(() => {
    if (tab !== "feedback") return
    let active = true
    async function loadFeedback() {
      setFeedbackLoading(true)
      setFeedbackError(null)
      try {
        const result = await apiAdminFeedback(token ?? undefined)
        if (Array.isArray(result?.feedback)) {
          if (active)
            setFeedback(
              result.feedback.map((entry: any) => {
                const rawMessage = entry.message || ""
                const legacyCategory =
                  !entry.category && /^\[[^\]]+\]\s*/.test(rawMessage)
                    ? rawMessage.match(/^\[([^\]]+)\]\s*(.*)$/)
                    : null
                return {
                  id: entry.id,
                  email: entry.email || "",
                  name: entry.name || "",
                  message: legacyCategory?.[2] || rawMessage,
                  status: [
                    "NEW",
                    "REVIEWED",
                    "IN_PROGRESS",
                    "RESOLVED",
                  ].includes(entry.status)
                    ? entry.status
                    : "NEW",
                  createdAt: entry.created_at || "",
                  title: entry.title,
                  category: entry.category || legacyCategory?.[1],
                  sourceModule: entry.source_module,
                  priority: entry.priority,
                  role: entry.role,
                  plan: entry.plan,
                  browser: entry.browser,
                  device: entry.device,
                  reply: entry.admin_reply || entry.reply,
                  internalNotes: entry.internal_notes,
                  hasScreenshot: Boolean(entry.has_screenshot),
                  screenshotName: entry.screenshot_name,
                  screenshotType: entry.screenshot_type,
                }
              }),
            )
        } else {
          throw new Error("The feedback service returned an invalid response.")
        }
      } catch (error) {
        if (active)
          setFeedbackError(
            error instanceof Error ? error.message : "Could not load feedback.",
          )
      } finally {
        if (active) {
          setFeedbackLoading(false)
          setFeedbackLoaded(true)
        }
      }
    }
    void loadFeedback()
    return () => {
      active = false
    }
  }, [tab, token, feedbackRefreshKey])

  function downloadAuditCSV() {
    const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`
    const rows = [
      ["Timestamp", "Actor", "Action", "Detail"],
      ...filteredAudit.map((a) => [a.ts, a.actor, a.action, a.detail]),
    ]
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })

    const url = URL.createObjectURL(blob)

    const el = document.createElement("a")

    el.href = url

    el.download = `aeroprice-audit-${new Date().toISOString().slice(0, 10)}.csv`

    el.click()

    URL.revokeObjectURL(url)

    showToast("Audit log downloaded")
  }

  function formatLastActive(value: string) {
    if (
      !value ||
      value === "Live now" ||
      value.startsWith("Today") ||
      value.startsWith("Invited")
    )
      return value

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div
      className="admin-dashboard flex flex-col page-enter"
      style={{ gap: "var(--space-2xl)" }}
    >
      {toast && (
        <div className="admin-toast" role="status" aria-live="polite">
          <span className="admin-toast-dot" aria-hidden="true" />
          {toast}
        </div>
      )}

      <Modal
        isOpen={Boolean(accessEditor)}
        onClose={() => {
          if (!updatingRole) setAccessEditor(null)
        }}
        title={
          accessEditorStep === "review"
            ? "Review access change"
            : "Edit user access"
        }
        size="lg"
        footer={
          accessEditor ? (
            <div className="admin-access-editor-footer">
              {accessEditorStep === "review" ? (
                <Button
                  variant="neutral"
                  onClick={() => setAccessEditorStep("edit")}
                  disabled={Boolean(updatingRole)}
                  iconStart={<ArrowLeft size={14} />}
                >
                  Back
                </Button>
              ) : (
                <Button
                  variant="neutral"
                  onClick={() => setAccessEditor(null)}
                  disabled={Boolean(updatingRole)}
                >
                  Cancel
                </Button>
              )}
              {accessEditorStep === "review" ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    void updateManagedUserRole(
                      accessEditor.email,
                      accessEditor.role,
                      accessEditor.plan,
                    )
                  }
                  loading={Boolean(updatingRole)}
                >
                  Confirm &amp; save
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => setAccessEditorStep("review")}
                  disabled={
                    accessEditor.role === accessEditor.originalRole &&
                    accessEditor.plan === accessEditor.originalPlan
                  }
                  title={
                    accessEditor.role === accessEditor.originalRole &&
                    accessEditor.plan === accessEditor.originalPlan
                      ? "Choose a different role or subscription first"
                      : "Review the selected access changes"
                  }
                >
                  Review changes <ArrowUp size={14} />
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {accessEditor &&
          (() => {
            const entry = managedUsers.find(
              (item) =>
                item.email.toLowerCase() === accessEditor.email.toLowerCase(),
            )
            const details =
              ROLE_DETAILS[accessEditor.role] || ROLE_DETAILS.PUBLIC
            const changed =
              accessEditor.role !== accessEditor.originalRole ||
              accessEditor.plan !== accessEditor.originalPlan
            return (
              <div className="admin-access-editor">
                <div className="admin-access-editor-user">
                  <span className="admin-avatar">
                    {(entry?.name || accessEditor.email)
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>{entry?.name || accessEditor.email}</strong>
                    <span>{accessEditor.email}</span>
                  </div>
                </div>
                {accessEditorStep === "edit" ? (
                  <>
                    <p className="admin-access-editor-lead">
                      Choose the workspace access first, then select a
                      subscription only for standard users.
                    </p>
                    {entry && (
                      <div className="admin-account-status-section">
                        <div>
                          <span>ACCOUNT STATUS</span>
                          <strong>
                            {entry.status === "ACTIVE" ? "Active" : "Disabled"}
                            {" · "}
                            {ROLE_LABEL[entry.role] || entry.role}
                          </strong>
                          <small>
                            {subscriptionLabel(entry)}
                            {" · "}
                            {entry.status === "ACTIVE"
                              ? "Account can access the platform."
                              : "Account access is currently disabled."}
                          </small>
                        </div>
                        <Button
                          size="sm"
                          className="admin-account-status-button"
                          variant={entry.status === "ACTIVE" ? "danger" : "success"}
                          aria-label={entry.status === "ACTIVE" ? "Disable account" : "Enable account"}
                          onClick={() => { setStatusReason(""); setUserToToggleStatus(entry) }}
                          disabled={entry.email.toLowerCase() === user?.email?.toLowerCase()}
                          iconStart={<ShieldCheck size={16} />}
                        >
                          {entry.status === "ACTIVE" ? "Disable user" : "Enable user"}
                        </Button>
                      </div>
                    )}
                    <div className="admin-access-editor-fields">
                      <label className="admin-access-field">
                        <span>Workspace role</span>
                        <select
                          className="ap-input"
                          value={accessEditor.role}
                          onChange={(event) => {
                            const role = event.target.value as AccessRole
                            setAccessEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    role,
                                    plan:
                                      role === "PUBLIC"
                                        ? current.plan === "SUBSCRIBER"
                                          ? "SUBSCRIBER"
                                          : "FREE"
                                        : role === "ANALYST"
                                          ? "GOVERNMENT"
                                          : "ADMIN",
                                  }
                                : current,
                            )
                          }}
                        >
                          <option value="PUBLIC">User</option>
                          <option value="ANALYST">DGCA / Analyst</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </label>
                      <label className="admin-access-field">
                        <span>Subscription</span>
                        <select
                          className="ap-input"
                          value={
                            accessEditor.role === "PUBLIC"
                              ? accessEditor.plan
                              : accessEditor.role === "ANALYST"
                                ? "GOVERNMENT"
                                : "ADMIN"
                          }
                          disabled={accessEditor.role !== "PUBLIC"}
                          onChange={(event) =>
                            setAccessEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    plan: event.target.value as AccessPlan,
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="FREE">Standard</option>
                          <option value="SUBSCRIBER">Premium</option>
                          {accessEditor.role === "ANALYST" && (
                            <option value="GOVERNMENT">Government</option>
                          )}
                          {accessEditor.role === "ADMIN" && (
                            <option value="ADMIN">Administrator</option>
                          )}
                        </select>
                      </label>
                    </div>
                    <div className="admin-access-editor-preview">
                      <div>
                        <span className="admin-access-preview-kicker">
                          NEW ACCESS PREVIEW
                        </span>
                        <strong>{details.access}</strong>
                        <small>
                          {subscriptionLabel({
                            role: accessEditor.role,
                            plan: accessEditor.plan,
                          })}
                        </small>
                      </div>
                      <span className="admin-access-preview-badge">
                        {ROLE_LABEL[accessEditor.role]}
                      </span>
                    </div>
                    <div className="admin-access-editor-note">
                      <ShieldCheck size={16} />
                      <span>{details.description}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="admin-access-editor-review">
                      <div className="admin-access-review-kicker">
                        <Check size={15} /> Ready to apply
                      </div>
                      <p>
                        Review the access change below. It will update Firebase
                        permissions, the local directory, and the audit trail
                        together.
                      </p>
                      <div className="admin-access-change-grid">
                        <div>
                          <span>Current access</span>
                          <strong>
                            {ROLE_LABEL[accessEditor.originalRole] ||
                              accessEditor.originalRole}
                          </strong>
                          <small>
                            {subscriptionLabel({
                              role: accessEditor.originalRole,
                              plan: accessEditor.originalPlan,
                            })}
                          </small>
                        </div>
                        <ArrowRight size={18} />
                        <div className="next">
                          <span>New access</span>
                          <strong>{ROLE_LABEL[accessEditor.role]}</strong>
                          <small>
                            {subscriptionLabel({
                              role: accessEditor.role,
                              plan: accessEditor.plan,
                            })}
                          </small>
                        </div>
                      </div>
                      {!changed && (
                        <small className="admin-access-no-change">
                          No changes were made. Choose a different role or subscription to continue.
                        </small>
                      )}
                    </div>
                    <p className="admin-access-editor-footnote">
                      The user will receive the new access on their next
                      authenticated session.
                    </p>
                  </>
                )}
              </div>
            )
          })()}
      </Modal>

      <Modal
        isOpen={Boolean(userToToggleStatus)}
        onClose={() => {
          if (!updatingUserStatus) { setStatusReason(""); setUserToToggleStatus(null) }
        }}
        title={userToToggleStatus?.status === "ACTIVE" ? "Disable user" : "Enable user"}
        size="sm"
        footer={
          userToToggleStatus ? (
            <div className="admin-access-editor-footer">
              <Button
                variant="neutral"
                onClick={() => { setStatusReason(""); setUserToToggleStatus(null) }}
                disabled={updatingUserStatus}
              >
                Cancel
              </Button>
              <Button
                variant={userToToggleStatus.status === "ACTIVE" ? "danger" : "success"}
                onClick={() => void confirmToggleUserStatus()}
                loading={updatingUserStatus}
                iconStart={<ShieldCheck size={14} />}
              >
                {userToToggleStatus.status === "ACTIVE" ? "Disable user" : "Enable user"}
              </Button>
            </div>
          ) : null
        }
      >
        {userToToggleStatus && (
          <div className="admin-delete-user-dialog">
            <div className="admin-access-editor-user">
              <span className="admin-avatar">
                {userToToggleStatus.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>{userToToggleStatus.name}</strong>
                <span>{userToToggleStatus.email}</span>
              </div>
            </div>
            <p className="admin-role-confirmation-lead">
              {userToToggleStatus.status === "ACTIVE"
                ? "This account will no longer be able to access the platform until it is enabled again."
                : "This account will be allowed to access the platform again."}
            </p>
            {userToToggleStatus.status === "ACTIVE" && (
              <label className="admin-status-reason-field">
                <span>Reason for disabling</span>
                <div className="admin-reason-picker">
                  <button type="button" className="admin-reason-picker-trigger" onClick={() => setStatusReasonMenuOpen((open) => !open)} aria-expanded={statusReasonMenuOpen}>
                    <span>{statusReason || "Select a reason"}</span><ChevronDown size={16} />
                  </button>
                  {statusReasonMenuOpen && (
                    <div className="admin-reason-picker-menu" role="listbox">
                      {["Security concern", "Suspicious activity", "Policy violation", "Other reason"].map((reason) => (
                        <button key={reason} type="button" role="option" onClick={() => { setStatusReason(reason === "Other reason" ? "" : reason); setStatusReasonMenuOpen(false) }}>
                          <span className="admin-reason-picker-check">{statusReason === reason ? "✓" : ""}</span>{reason}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value.slice(0, 500))}
                  placeholder="Add context for the user and audit trail"
                  rows={3}
                  maxLength={500}
                />
                <small>The selected reason and any detail are saved in the audit trail and shown when the user tries to sign in.</small>
              </label>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={bulkUserStatusDialog !== null}
        onClose={() => {
          if (!updatingUserStatus) {
            setBulkUserStatusDialog(null)
            setBulkUserReasonCategory("")
            setBulkUserReasonDetail("")
          }
        }}
        title={bulkUserStatusDialog === false ? "Disable selected users" : "Enable selected users"}
        size="md"
        footer={bulkUserStatusDialog !== null ? (
          <div className="admin-access-editor-footer">
            <Button variant="neutral" disabled={updatingUserStatus} onClick={() => { setBulkUserStatusDialog(null); setBulkUserReasonCategory(""); setBulkUserReasonDetail("") }}>Cancel</Button>
            <Button variant={bulkUserStatusDialog ? "success" : "danger"} loading={updatingUserStatus} onClick={() => void confirmBulkUserStatus()} iconStart={bulkUserStatusDialog ? <CheckCircle size={14} /> : <ShieldCheck size={14} />}>
              {bulkUserStatusDialog ? "Enable selected" : "Disable selected"}
            </Button>
          </div>
        ) : null}
      >
        {bulkUserStatusDialog !== null && (
          <div className="admin-delete-user-dialog">
            <p className="admin-role-confirmation-lead">
              {bulkUserStatusDialog
                ? `These ${selectedInactiveUsers.length} accounts will be allowed to access the platform again.`
                : `These ${selectedActiveUsers.length} accounts will lose platform access. Each user will see the reason when they try to sign in.`}
            </p>
            <ul className="admin-user-bulk-list">
              {(bulkUserStatusDialog ? selectedInactiveUsers : selectedActiveUsers).map((entry) => (
                <li key={entry.email}><strong>{entry.name || entry.email}</strong><span>{entry.email}</span></li>
              ))}
            </ul>
            {!bulkUserStatusDialog && (
              <label className="admin-status-reason-field">
                <span>Reason for disabling</span>
                <select className="ap-input admin-users-filter" value={bulkUserReasonCategory} onChange={(event) => setBulkUserReasonCategory(event.target.value)}>
                  <option value="">Select a reason</option>
                  <option>Security concern</option>
                  <option>Suspicious activity</option>
                  <option>Policy violation</option>
                  <option>Other reason</option>
                </select>
                <textarea value={bulkUserReasonDetail} onChange={(event) => setBulkUserReasonDetail(event.target.value.slice(0, 500))} placeholder={bulkUserReasonCategory === "Other reason" ? "Explain the reason (required)" : "Additional context (optional)"} rows={3} maxLength={500} />
                <small>The chosen reason is recorded in the audit trail and shown to each user at sign-in.</small>
              </label>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(userToDelete)}
        onClose={() => {
          if (!deletingUserEmail) setUserToDelete(null)
        }}
        title="Delete user account?"
        size="md"
        footer={
          userToDelete ? (
            <div className="admin-access-editor-footer">
              <Button
                variant="neutral"
                onClick={() => setUserToDelete(null)}
                disabled={Boolean(deletingUserEmail)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void confirmDeleteManagedUser()}
                disabled={
                  userToDelete.email.toLowerCase() ===
                  user?.email?.toLowerCase()
                }
                loading={Boolean(deletingUserEmail)}
                iconStart={<Trash2 size={14} />}
              >
                Delete account
              </Button>
            </div>
          ) : null
        }
      >
        {userToDelete && (
          <div className="admin-delete-user-dialog">
            <div className="admin-delete-user-warning">
              <AlertTriangle size={19} />
              <span>This action cannot be undone.</span>
            </div>
            <div className="admin-access-editor-user">
              <span className="admin-avatar">
                {userToDelete.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>{userToDelete.name}</strong>
                <span>{userToDelete.email}</span>
              </div>
            </div>
            <p>
              Delete this user’s Firebase sign-in and local account data,
              including access requests, grants, and notifications. Feedback and
              audit history will remain available to admins.
            </p>
            {userToDelete.email.toLowerCase() ===
              user?.email?.toLowerCase() && (
              <p className="admin-delete-self-warning">
                You are signed in with this account, so it cannot be deleted
                here.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(pendingRemoval)}
        onClose={() => {
          if (!removingQueueItem) setPendingRemoval(null)
        }}
        title={
          pendingRemoval?.kind === "access"
            ? "Clear access request?"
            : "Remove feedback item?"
        }
        size="sm"
        footer={
          pendingRemoval ? (
            <div className="admin-access-editor-footer">
              <Button
                variant="neutral"
                onClick={() => setPendingRemoval(null)}
                disabled={Boolean(removingQueueItem)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmQueueRemoval}
                loading={removingQueueItem === pendingRemoval.id}
                iconStart={<Trash2 size={14} />}
              >
                Confirm removal
              </Button>
            </div>
          ) : null
        }
      >
        {pendingRemoval && (
          <div className="admin-delete-user-dialog">
            <div className="admin-delete-user-warning">
              <AlertTriangle size={19} />
              <span>This removes the item from its active queue.</span>
            </div>
            <p className="admin-access-editor-lead">
              {pendingRemoval.kind === "access"
                ? "The request history will remain in the audit trail, and the user may submit a new request afterward."
                : "This feedback message will be permanently removed. Its removal will be recorded in the audit trail."}
            </p>
            <div className="admin-access-editor-user">
              <span className="admin-avatar">
                {pendingRemoval.kind === "access" ? "AR" : "FB"}
              </span>
              <div>
                <strong>{pendingRemoval.label}</strong>
                <span>
                  {pendingRemoval.kind === "access"
                    ? "Access request"
                    : "Feedback item"}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {tab === "overview" && (
        <>
          {/* Admin Overview hero header */}
          <div
            className="admin-hero"
            style={{
              background:
                "linear-gradient(90deg, rgba(3,35,91,.96) 0%, rgba(7,58,124,.78) 48%, rgba(3,25,65,.28) 100%), url(/aviation-hero.png) center/cover",
              borderRadius: "var(--radius-xl)",

              overflow: "hidden",
              position: "relative",
              padding: "24px 28px",

              boxShadow: "0 16px 40px rgba(8,14,26,0.3)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
                backgroundSize: "32px 32px",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: "var(--gradient-brand)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShieldCheck size={14} color="white" />
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: "rgba(147,197,253,0.85)",
                    letterSpacing: "0.14em",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ADMIN CONTROL CENTER
                </span>
              </div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "rgba(255,255,255,0.95)",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "-0.025em",
                  margin: 0,
                  marginBottom: 4,
                }}
              >
                System Administration &amp; Pipeline Control
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.6)",
                  fontFamily: "var(--font-sans)",
                  margin: 0,
                }}
              >
                Monitor collection sources, user permissions, audit logs, and
                backend health.
              </p>
            </div>
            <div className="admin-hero-metrics">
              <div>
                <strong>{dashboardData?.routes_tracked ?? "—"}</strong>
                <span>Observed Routes</span>
              </div>
              <div>
                <strong>{healthData?.live_sources ?? "—"}</strong>
                <span>Healthy Fare Sources</span>
              </div>
              <div>
                <strong>{healthData?.data_status ?? "—"}</strong>
                <span>Data Status</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Operational overview */}
      {tab === "overview" && (
        <>
          <div className="admin-kpi-grid">
            {[
              [
                "Total Routes Tracked",
                dashboardData?.routes_tracked ?? "—",
                "Backend-reported only",
                "blue",
              ],

              [
                "Data Sources",
                String(sources.length),
                `${healthData?.live_sources ?? "—"} healthy fare sources`,
                "cyan",
              ],

              [
                "Collection Runs Today",
                dashboardData?.collection_runs_today ?? "—",
                "Backend-reported only",
                "green",
              ],

              [
                "Total Users",
                String(managedUsers.length),
                "Managed accounts",
                "purple",
              ],

              [
                "Access Requests",
                String(
                  accessRequests.filter(
                    (request) => request.status === "PENDING",
                  ).length,
                ),
                "Pending review",
                "orange",
              ],

              [
                "System Health",
                healthData?.status?.toUpperCase() ?? "—",
                healthData?.database
                  ? "Database connected"
                  : "Awaiting backend health",
                "green",
              ],
            ].map(([label, value, detail, tone]) => (
              <div className={`admin-kpi admin-kpi-${tone}`} key={label}>
                <div className="admin-kpi-icon">
                  <Activity size={17} />
                </div>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{detail}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="admin-overview-grid">
            <section className="admin-overview-card admin-activity-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Data Collection Activity</h2>
                  <p>Latest backend status for registered sources</p>
                </div>
                <span className="admin-pill admin-pill-blue">
                  {healthData?.data_status ?? "UNKNOWN"}
                </span>
              </div>
              <div
                className="admin-bars"
                aria-label="Data source activity chart"
              >
                {sources.length ? sources.slice(0, 8).map((source) => (
                    <div
                      key={source.id}
                      className="admin-bar-group"
                      title={`${source.name}: ${source.obs}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 70,
                        color: source.enabled
                          ? "var(--color-success)"
                          : "var(--color-warning)",
                        fontSize: 9,
                        writingMode: "vertical-rl",
                        overflow: "hidden",
                      }}
                    >
                      {source.status}
                    </div>
                  )) : <div
                    style={{ padding: 16, color: "var(--color-text-tertiary)" }}
                  >
                    No backend source activity returned.
                  </div>}
              </div>
              <div className="admin-legend">
                <span>
                  <i className="blue" />
                  Backend source status
                </span>
                <span>
                  <i className="green" />
                  Fresh/live
                </span>
                <span>
                  <i className="purple" />
                  Unavailable or stale
                </span>
              </div>
            </section>
            <section className="admin-overview-card admin-coverage-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Route Coverage</h2>
                  <p>Observed fare-route sample across India</p>
                </div>
                <span className="admin-pill admin-pill-blue">ROUTES</span>
              </div>
              <div className="admin-coverage-body">
                <div className="admin-map-wrap">
                  <img src={indiaMap} alt="India route coverage" />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      color: "var(--color-text-tertiary)",
                      fontSize: 12,
                      textAlign: "center",
                      padding: 20,
                    }}
                  >
                    Verified airport-level route facts are not available from
                    the backend yet.
                  </div>
                </div>
                <div className="admin-coverage-stats">
                  <div>
                    <strong>{dashboardData?.routes_tracked ?? "—"}</strong>
                    <span>Verified routes</span>
                  </div>
                  <div>
                    <strong>{dashboardData?.real_observations ?? "—"}</strong>
                    <span>Real observations</span>
                  </div>
                  <div>
                    <strong>{dashboardData?.sources_live ?? "—"}</strong>
                    <span>Live sources</span>
                  </div>
                  <div>
                    <strong>{healthData?.data_status ?? "—"}</strong>
                    <span>Data status</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="admin-overview-card admin-status-card">
              <div className="admin-card-heading">
                <div>
                  <h2>System Status</h2>
                  <p>Registered source states</p>
                </div>
                <button type="button" onClick={() => setTab("health")}>
                  View Health →
                </button>
              </div>
              {sources.length ? sources.slice(0, 5).map((source) => (
                  <div className="admin-status-row" key={source.id}>
                    <span className="admin-status-dot" />
                    <div>
                      <strong>{source.name}</strong>
                      <small>{source.obs}</small>
                    </div>
                    <em>{source.status}</em>
                  </div>
                )) : <div
                  style={{ padding: 16, color: "var(--color-text-tertiary)" }}
                >
                  No backend service status returned.
                </div>}
            </section>
          </div>
          <div className="admin-lower-grid">
            <section className="admin-overview-card admin-table-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Recent Collection Jobs</h2>
                  <p>Latest backend-reported pipeline activity</p>
                </div>
              </div>
              <div className="admin-mini-table">
                {dashboardData?.last_collection ? (
                  <div className="admin-mini-row">
                    <span className="admin-job-id">latest</span>
                    <strong>Collection service</strong>
                    <em className="success">Reported</em>
                    <span>
                      {dashboardData.collection_runs_today ?? "—"} runs
                    </span>
                    <span>
                      {new Date(dashboardData.last_collection).toLocaleString(
                        "en-IN",
                      )}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{ padding: 16, color: "var(--color-text-tertiary)" }}
                  >
                    No collection run records returned by the backend.
                  </div>
                )}
              </div>
            </section>
            <section className="admin-overview-card admin-table-card">
              <div className="admin-card-heading">
                <div>
                  <h2>User Management</h2>
                  <p>Recent managed accounts</p>
                </div>
                <button type="button" onClick={() => setTab("users")}>
                  View All →
                </button>
              </div>
              <div className="admin-mini-table">
                {managedUsers.slice(0, 5).map((entry) => (
                  <div
                    className="admin-mini-row admin-user-row"
                    key={entry.email}
                  >
                    <span className="admin-avatar">
                      {entry.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <strong>{entry.name}</strong>
                    <span>{entry.role}</span>
                    <em
                      className={
                        entry.status === "ACTIVE" ? "success" : "pending"
                      }
                    >
                      {entry.status}
                    </em>
                  </div>
                ))}
              </div>
            </section>
            <section className="admin-overview-card admin-table-card">
              <div className="admin-card-heading">
                <div>
                  <h2>Recent Activity</h2>
                  <p>Latest administrative events</p>
                </div>
                <button type="button" onClick={() => setTab("audit")}>
                  View All →
                </button>
              </div>
              <div className="admin-activity-list">
                {audit.slice(0, 5).map((entry) => (
                  <div key={`${entry.ts}-${entry.action}`}>
                    <span className="admin-status-dot" />
                    <div>
                      <strong>{entry.action.replace(/_/g, " ")}</strong>
                      <small>{entry.detail}</small>
                    </div>
                    <time>
                      {new Date(entry.ts).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {/* Tab: Pipeline */}
      {tab === "pipeline" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-lg)",
          }}
        >
          <div className="admin-section-banner">
            <div>
              <span>ADMIN CONTROL CENTER · DATA OPERATIONS</span>
              <h1>Data Pipeline</h1>
              <p>
                Monitor verified collection sources and their current backend
                health.
              </p>
            </div>
            <div className="admin-section-count">
              <strong>{healthData?.live_sources ?? "—"}</strong>
              <span>Healthy fare sources</span>
            </div>
          </div>
          <div
            style={{
              background: "var(--color-surface-bg)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border-primary)",
              padding: "var(--space-xl)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "var(--space-lg)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  color: "var(--color-text-tertiary)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                INTELLIGENT DATA PIPELINE
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--color-success)",
                  background: "var(--color-success-bg)",
                  padding: "3px 8px",
                  borderRadius: 99,
                  border: "1px solid rgba(22,163,74,0.3)",
                }}
              >
                {sources.length
                  ? `${healthData?.live_sources ?? "—"} HEALTHY FARE SOURCES`
                  : "LOADING SOURCE STATUS"}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "var(--space-sm)",
              }}
            >
              {sources.length === 0 ? (
                <div
                  style={{ padding: 18, color: "var(--color-text-tertiary)" }}
                >
                  Waiting for verified source health from the backend…
                </div>
              ) : (
                sources.map((src) => (
                  <div
                    key={src.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface-secondary)",
                      border: "1px solid var(--color-border-primary)",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <CheckCircle
                        size={14}
                        style={{
                          color: src.enabled
                            ? "var(--color-success)"
                            : "var(--color-warning)",
                        }}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {src.name}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--color-text-tertiary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {src.status} · {src.obs}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: src.enabled
                            ? "var(--color-success)"
                            : "var(--color-warning)",
                          background: src.enabled
                            ? "var(--color-success-bg)"
                            : "var(--color-warning-bg)",
                          padding: "2px 8px",
                          borderRadius: 99,
                          border: `1px solid ${
                            src.enabled
                              ? "rgba(22,163,74,0.3)"
                              : "rgba(217,119,6,0.3)"
                          }`,
                        }}
                      >
                        {src.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "health" && (
        <div className="admin-workspace">
          <div className="admin-section-banner">
            <div>
              <span>ADMIN CONTROL CENTER · SYSTEM HEALTH</span>
              <h1>System Health</h1>
              <p>
                Verified operational status for the AeroPrice backend and data
                services.
              </p>
            </div>
            <div className="admin-section-count">
              <strong>{healthData?.status?.toUpperCase() ?? "—"}</strong>
              <span>Backend status</span>
            </div>
          </div>
          <div className="admin-user-kpis">
            <div>
              <span>DATABASE</span>
              <strong>{healthData?.database?.toUpperCase() ?? "—"}</strong>
              <small>connection state</small>
            </div>
            <div>
              <span>DATA STATUS</span>
              <strong>{healthData?.data_status ?? "—"}</strong>
              <small>verified feed state</small>
            </div>
            <div>
              <span>LIVE SOURCES</span>
              <strong>{healthData?.live_sources ?? "—"}</strong>
              <small>currently reporting</small>
            </div>
            <div>
              <span>OBSERVATIONS</span>
              <strong>
                {healthData?.real_observations?.toLocaleString?.() ?? "—"}
              </strong>
              <small>stored real records</small>
            </div>
          </div>
          <div
            className="admin-tab-surface"
            style={{
              background: "var(--color-surface-bg)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border-primary)",
              padding: "var(--space-xl)",
            }}
          >
            <div className="admin-card-heading">
              <div>
                <h2>Service details</h2>
                <p>Values are read from the backend health endpoint.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHealthData(null)
                  showToast("Refreshing system health…")
                }}
              >
                Refresh
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "var(--space-md)",
                marginTop: "var(--space-lg)",
              }}
            >
              <div
                className="ap-card"
                style={{
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 84,
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-tertiary)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  LAST COLLECTION
                </span>
                <strong
                  style={{
                    fontSize: 16,
                    lineHeight: 1.25,
                    overflowWrap: "anywhere",
                  }}
                >
                  {healthData?.last_collection
                    ? new Date(healthData.last_collection).toLocaleString(
                        "en-IN",
                      )
                    : "—"}
                </strong>
              </div>
              <div
                className="ap-card"
                style={{
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 84,
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-tertiary)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  REGISTERED SOURCES
                </span>
                <strong style={{ fontSize: 22, lineHeight: 1.1 }}>
                  {healthData?.total_sources ?? "—"}
                </strong>
              </div>
              <div
                className="ap-card"
                style={{
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 84,
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-tertiary)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  STORAGE MODE
                </span>
                <strong
                  style={{
                    fontSize: 16,
                    lineHeight: 1.25,
                    overflowWrap: "anywhere",
                  }}
                >
                  {healthData?.storage_mode ?? "—"}
                </strong>
              </div>
              <div
                className="ap-card"
                style={{
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 84,
                }}
              >
                <span
                  style={{
                    color: "var(--color-text-tertiary)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                  }}
                >
                  COLLECTION ENABLED
                </span>
                <strong
                  style={{
                    fontSize: 22,
                    lineHeight: 1.1,
                    color: healthData?.collection_enabled
                      ? "var(--color-success)"
                      : "var(--color-text-primary)",
                  }}
                >
                  {healthData?.collection_enabled == null
                    ? "—"
                    : healthData.collection_enabled
                      ? "YES"
                      : "NO"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Users */}
      {tab === "access" && (
        <div className="admin-workspace">
          <div className="admin-section-banner queue-section-banner premium-access-banner">
            <span className="admin-section-banner-icon">
              <ShieldCheck size={34} strokeWidth={2.1} />
            </span>
            <div>
              <span>ADMIN CONTROL CENTER · PREMIUM ACCESS</span>
              <h1>Premium Access Requests</h1>
              <p>
                Review Premium upgrade requests, manage approvals, and control Premium entitlements from one workspace.
              </p>
            </div>
            <div className="admin-section-count">
              <strong>
                {
                  accessHasVerifiedSnapshot ? accessRequests.filter(
                    (request) => request.status === "PENDING",
                  ).length : accessLoading ? <span className="skeleton access-count-skeleton" aria-label="Loading pending request count" /> : "—"
                }
              </strong>
              <span>Pending review</span>
              {accessActivePremiumCount !== null && <small>{accessActivePremiumCount} active Premium accounts</small>}
            </div>
          </div>
          <div className="admin-user-kpis premium-access-kpis">
            <div className="access-kpi total"><span className="access-kpi-icon"><UsersRound aria-hidden="true" /></span>
              <span>TOTAL REQUESTS</span>
              <strong>{accessHasVerifiedSnapshot ? accessRequests.length : accessLoading ? <span className="skeleton access-kpi-value-skeleton" aria-label="Loading request count" /> : "—"}</strong>
              <small>All Premium requests</small>
            </div>
            <div className="access-kpi pending"><span className="access-kpi-icon"><Activity aria-hidden="true" /></span>
              <span>PENDING</span>
              <strong>
                {
                  accessHasVerifiedSnapshot ? accessRequests.filter(
                    (request) => request.status === "PENDING",
                  ).length : accessLoading ? <span className="skeleton access-kpi-value-skeleton" aria-label="Loading request count" /> : "—"
                }
              </strong>
              <small>Awaiting review</small>
            </div>
            <div className="access-kpi approved"><span className="access-kpi-icon"><CheckCircle aria-hidden="true" /></span>
              <span>APPROVED</span>
              <strong>
                {
                  accessHasVerifiedSnapshot ? accessRequests.filter(
                    (request) => request.status === "APPROVED",
                  ).length : accessLoading ? <span className="skeleton access-kpi-value-skeleton" aria-label="Loading request count" /> : "—"
                }
              </strong>
              <small>Premium access granted</small>
            </div>
            <div className="access-kpi rejected"><span className="access-kpi-icon"><XCircle aria-hidden="true" /></span>
              <span>REJECTED</span>
              <strong>
                {
                  accessHasVerifiedSnapshot ? accessRequests.filter(
                    (request) => request.status === "REJECTED",
                  ).length : accessLoading ? <span className="skeleton access-kpi-value-skeleton" aria-label="Loading request count" /> : "—"
                }
              </strong>
              <small>Access declined</small>
            </div>
          </div>
          <div className="admin-queue-toolbar premium-access-toolbar">
            <label className="admin-users-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={accessQuery}
                onChange={(event) => setAccessQuery(event.target.value)}
                placeholder="Search user, email, or request ID…"
                aria-label="Search access requests"
              />
            </label>
            <select
              className="ap-input admin-users-filter"
              value={accessStatusFilter}
              onChange={(event) =>
                setAccessStatusFilter(
                  event.target.value as typeof accessStatusFilter,
                )
              }
              aria-label="Filter access requests by status"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="REVOKED">Revoked</option>
            </select>
            <select className="ap-input admin-users-filter" value={accessDateRange} onChange={(event) => setAccessDateRange(event.target.value as typeof accessDateRange)} aria-label="Filter by request date">
              <option value="ALL">All time</option>
              <option value="7D">Last 7 days</option>
              <option value="30D">Last 30 days</option>
            </select>
            {(accessQuery || accessStatusFilter !== "ALL" || accessDateRange !== "ALL") && (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setAccessQuery("")
                  setAccessStatusFilter("ALL")
                  setAccessDateRange("ALL")
                }}
                iconStart={<X size={13} />}
              >
                Clear filters
              </Button>
            )}
            <span className="admin-users-result-count">
              {accessHasVerifiedSnapshot ? `${filteredAccessRequests.length} of ${accessRequests.length}` : "—"} requests
            </span>
            <Button
              size="xs"
              variant="neutral"
              onClick={() => setAccessRefreshKey((value) => value + 1)}
              disabled={accessLoading}
              loading={accessLoading}
              iconStart={<RefreshCw size={13} />}
            >
              {accessLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          <div className="access-status-tabs" role="tablist" aria-label="Premium request status">
            {(["ALL", "PENDING", "APPROVED", "REJECTED", "REVOKED"] as const).map((status) => {
              const count = !accessHasVerifiedSnapshot ? "—" : status === "ALL" ? accessRequests.length : accessRequests.filter((request) => request.status === status).length
              return <button key={status} type="button" role="tab" aria-selected={accessStatusFilter === status} className={accessStatusFilter === status ? "active" : ""} onClick={() => setAccessStatusFilter(status)}>{status === "ALL" ? "All requests" : status === "REVOKED" ? "Revoked" : status[0] + status.slice(1).toLowerCase()} <span>{count}</span></button>
            })}
          </div>
          {filteredAccessRequests.length > 0 && <div className="access-bulk-toolbar">
            <label><input type="checkbox" aria-label="Select all visible Premium requests" checked={visibleAccessIds.length > 0 && visibleAccessIds.every((id) => selectedAccessIds.includes(id))} disabled={visibleAccessIds.length === 0} onChange={(event) => setSelectedAccessIds((selected) => event.target.checked ? [...new Set([...selected, ...visibleAccessIds])] : selected.filter((id) => !visibleAccessIds.includes(id)))} /><span>Select all visible</span></label>
              <strong>{selectedAccessIds.length} selected · {selectedPendingAccessIds.length} pending eligible</strong>
              <div>
                <Button size="xs" variant="success" disabled={!selectedPendingAccessIds.length || Boolean(accessBusyId)} onClick={() => setAccessActionDialog("BULK_APPROVE")} iconStart={<Check size={13} />}>Approve ({selectedPendingAccessIds.length})</Button>
                <Button size="xs" variant="danger" disabled={!selectedPendingAccessIds.length || Boolean(accessBusyId)} onClick={() => setAccessActionDialog("BULK_REJECT")} iconStart={<XCircle size={13} />}>Reject ({selectedPendingAccessIds.length})</Button>
              {selectedAccessIds.length > 0 && <Button size="xs" variant="subtle" disabled={Boolean(accessBusyId)} onClick={() => setSelectedAccessIds([])}>Clear selection</Button>}
            </div>
          </div>}
          {accessError && (
            <div className="admin-data-error" role="alert">
              <div>
                <strong>Could not load access requests</strong>
                <span>{accessError}</span>
              </div>
              <Button
                size="xs"
                variant="neutral"
                onClick={() => setAccessRefreshKey((value) => value + 1)}
                disabled={accessLoading}
              >
                Try again
              </Button>
            </div>
          )}
          {accessLoading && accessRequests.length > 0 && (
            <div className="admin-directory-sync" role="status">
              <RefreshCw size={13} className="spin" /> Refreshing requests…
            </div>
          )}
          <div className="admin-access-panel">
            {accessLoading && accessRequests.length === 0 ? (
              <div className="premium-access-loading" role="status" aria-label="Loading Premium access requests">
                {[0, 1, 2].map((item) => <div className="premium-access-loading-card" key={item} aria-hidden="true"><span className="skeleton" /><div><i className="skeleton" /><i className="skeleton" /></div><span className="skeleton" /><span className="skeleton" /></div>)}
              </div>
            ) : !accessLoaded ? (
              <div className="admin-empty-state">
                <RefreshCw size={18} className="spin" />
                <strong>Preparing access requests…</strong>
              </div>
            ) : accessError && accessRequests.length === 0 ? (
              <div className="admin-empty-state">
                <AlertTriangle size={22} />
                <strong>Premium requests are temporarily unavailable</strong>
                <span>
                  Use “Try again” above to reload the live request queue.
                </span>
              </div>
            ) : accessRequests.length === 0 && !accessError ? (
              <div className="admin-empty-state">
                <ShieldCheck size={22} />
                <strong>No Premium requests yet</strong>
                <span>
                  New Premium upgrade requests from users will appear here for administrator review.
                </span>
              </div>
            ) : filteredAccessRequests.length === 0 && !accessError ? (
              <div className="admin-empty-state">
                <Search size={20} />
                <strong>No matching requests</strong>
                <span>Try another search or change the status filter.</span>
              </div>
            ) : (
              <div className="premium-access-table-wrap">
                <table className="premium-access-table">
                  <thead><tr><th>Select</th><th>User</th><th>Current plan</th><th>Requested plan</th><th>Requested at</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {visibleAccessRequests.map((req) => {
                      const rawPlan = managedUsers.find((entry) => entry.email.toLowerCase() === req.email.toLowerCase())?.plan || req.currentPlan || "FREE"
                      const currentPlan = rawPlan === "SUBSCRIBER" ? "PREMIUM" : rawPlan === "FREE" ? "STANDARD" : rawPlan
                      return (
                        <tr className={selectedAccessIds.includes(req.id) ? "is-selected" : ""} key={req.id}>
                          <td data-label="Select"><input type="checkbox" aria-label={`Select Premium request from ${req.name || req.email}`} checked={selectedAccessIds.includes(req.id)} onChange={(event) => setSelectedAccessIds((selected) => event.target.checked ? [...new Set([...selected, req.id])] : selected.filter((id) => id !== req.id))} /></td>
                          <td data-label="User"><div className="premium-access-user"><span className="admin-avatar">{(req.name || req.email).trim().slice(0, 1).toUpperCase()}</span><div><strong>{req.name || "User"}</strong><span>{req.email}</span><small>Request {req.id.slice(0, 8)}</small></div></div></td>
                          <td data-label="Current plan"><span className={`premium-plan-chip ${currentPlan === "PREMIUM" ? "is-premium" : ""}`}>{currentPlan}</span></td>
                          <td data-label="Requested plan"><span className="premium-plan-chip is-premium"><Crown size={13} /> PREMIUM</span></td>
                          <td data-label="Requested at">{req.createdAt && !Number.isNaN(new Date(req.createdAt).getTime()) ? new Date(req.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date unavailable"}</td>
                          <td data-label="Status"><span className={`admin-request-status ${req.status.toLowerCase()}`}>{req.status === "REVOKED" ? "Revoked" : req.status[0] + req.status.slice(1).toLowerCase()}</span></td>
                          <td data-label="Actions"><div className="admin-access-request-actions">
                            <Button size="xs" variant="neutral" onClick={() => void openAccessRequest(req)} iconStart={<Eye size={13} />}>View</Button>
                            <div className="access-row-menu-wrap">
                              <button type="button" className="access-row-menu-trigger" aria-label={`More actions for ${req.email}`} aria-expanded={accessMenuId === req.id} onClick={() => setAccessMenuId((current) => current === req.id ? null : req.id)}><MoreVertical size={16} /></button>
                              {accessMenuId === req.id && <div className="access-row-menu" role="menu">
                                {req.status === "PENDING" && <>
                                  <button type="button" role="menuitem" onClick={() => { setSelectedAccessRequest(req); setAccessActionDialog("APPROVE"); setAccessMenuId(null) }}><Check size={14} />Approve Premium</button>
                                  <button type="button" role="menuitem" onClick={() => { setSelectedAccessRequest(req); setAccessActionDialog("REJECT"); setAccessMenuId(null) }}><XCircle size={14} />Reject request</button>
                                </>}
                                {req.status === "APPROVED" && <button type="button" role="menuitem" className="is-danger" onClick={() => { setSelectedAccessRequest(req); setAccessActionDialog("REVOKE"); setAccessMenuId(null) }}><ShieldCheck size={14} />Revoke Premium</button>}
                                {(req.status === "REJECTED" || req.status === "REVOKED") && <button type="button" role="menuitem" className="is-danger" onClick={() => { setPendingRemoval({ kind: "access", id: req.id, label: `Premium request · ${req.email}` }); setAccessMenuId(null) }}><Trash2 size={14} />Remove request</button>}
                              </div>}
                            </div>
                          </div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {filteredAccessRequests.length > 0 && <div className="premium-access-pagination"><span>Showing {(accessPage - 1) * accessPageSize + 1}–{Math.min(accessPage * accessPageSize, filteredAccessRequests.length)} of {filteredAccessRequests.length} requests</span><div><Button size="xs" variant="neutral" disabled={accessPage <= 1} onClick={() => setAccessPage((page) => Math.max(1, page - 1))}>Previous</Button><strong>Page {accessPage} of {accessPageCount}</strong><Button size="xs" variant="neutral" disabled={accessPage >= accessPageCount} onClick={() => setAccessPage((page) => Math.min(accessPageCount, page + 1))}>Next</Button><select className="ap-input admin-users-filter" aria-label="Requests per page" value={accessPageSize} onChange={(event) => setAccessPageSize(Number(event.target.value))}><option value={5}>5 per page</option><option value={10}>10 per page</option><option value={20}>20 per page</option></select></div></div>}
          <Modal isOpen={Boolean(selectedAccessRequest) && !accessActionDialog} onClose={() => setSelectedAccessRequest(null)} title="Premium Access Request" size="lg" footer={selectedAccessRequest ? <div className="admin-access-editor-footer">
            <Button variant="neutral" onClick={() => setSelectedAccessRequest(null)}>Close</Button>
            {selectedAccessRequest.status === "PENDING" && <><Button variant="danger" onClick={() => setAccessActionDialog("REJECT")} iconStart={<XCircle size={14} />}>Reject request</Button><Button variant="success" onClick={() => setAccessActionDialog("APPROVE")} iconStart={<Check size={14} />}>Approve Premium</Button></>}
            {selectedAccessRequest.status === "APPROVED" && <Button variant="danger" onClick={() => setAccessActionDialog("REVOKE")} iconStart={<ShieldCheck size={14} />}>Revoke Premium</Button>}
          </div> : null}>
            {selectedAccessRequest && (() => {
              const matchedUser = managedUsers.find((entry) => entry.email.toLowerCase() === selectedAccessRequest.email.toLowerCase())
              const rawPlan = matchedUser?.plan || selectedAccessRequest.currentPlan || "FREE"
              const displayPlan = rawPlan === "SUBSCRIBER" ? "PREMIUM" : rawPlan === "FREE" ? "STANDARD" : rawPlan
              const previousRequests = accessRequests.filter((entry) => entry.email.toLowerCase() === selectedAccessRequest.email.toLowerCase() && entry.id !== selectedAccessRequest.id).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
              const approvedEvent = accessRequestHistory.find((event) => event.action === "ACCESS_APPROVED")
              const revokedEvent = accessRequestHistory.find((event) => event.action === "ACCESS_REVOKED")
              const formatAccessEvent = (event?: AccessHistoryEntry) => event
                ? `${event.actor || "Administrator not recorded"}${event.created_at ? ` · ${new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}`
                : "Not recorded"
              return <div className="access-request-detail premium-access-detail">
                <div className="access-request-detail-user"><span className="admin-avatar">{(selectedAccessRequest.name || selectedAccessRequest.email).trim().slice(0, 1).toUpperCase()}</span><div><strong>{selectedAccessRequest.name || "User"}</strong><span>{selectedAccessRequest.email}</span></div><span className={`admin-request-status ${selectedAccessRequest.status.toLowerCase()}`}>{selectedAccessRequest.status === "REVOKED" ? "REVOKED" : selectedAccessRequest.status}</span></div>
                <section className="premium-access-plan-flow" aria-label="Subscription change">
                  <div><span>CURRENT PLAN</span><strong>{displayPlan}</strong></div><ArrowRight size={18} aria-hidden="true"/><div><span>{selectedAccessRequest.status === "REVOKED" ? "CURRENT ENTITLEMENT" : "REQUESTED PLAN"}</span><strong>{selectedAccessRequest.status === "REVOKED" ? "STANDARD" : "PREMIUM"}</strong></div>
                </section>
                <dl>
                  <div><dt>Request ID</dt><dd>{selectedAccessRequest.id}</dd></div>
                  <div><dt>Requested at</dt><dd>{selectedAccessRequest.createdAt ? new Date(selectedAccessRequest.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Unavailable"}</dd></div>
                  {selectedAccessRequest.status === "APPROVED" && <div><dt>Approved by · date</dt><dd>{formatAccessEvent(approvedEvent)}</dd></div>}
                  {selectedAccessRequest.status === "REVOKED" && <>
                    <div><dt>Approved by · date</dt><dd>{formatAccessEvent(approvedEvent)}</dd></div>
                    <div><dt>Revoked by · date</dt><dd>{formatAccessEvent(revokedEvent)}</dd></div>
                  </>}
                  {selectedAccessRequest.status === "REJECTED" && <div><dt>Reviewed by · date</dt><dd>{selectedAccessRequest.reviewedBy || "Administrator not recorded"}{selectedAccessRequest.reviewedAt ? ` · ${new Date(selectedAccessRequest.reviewedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}</dd></div>}
                  <div><dt>Premium status</dt><dd>{selectedAccessRequest.status === "APPROVED" ? "Active" : selectedAccessRequest.status === "REVOKED" ? "Revoked · Standard restored" : selectedAccessRequest.status === "REJECTED" ? "Not granted" : "Awaiting decision"}</dd></div>
                </dl>
                <section className="premium-access-message"><h3>Request message</h3><p>{selectedAccessRequest.requestMessage || "No reason was provided with this request."}</p></section>
                {accessDetailLoading && <div className="premium-access-history-state"><RefreshCw size={14} className="spin"/>Loading verified request history…</div>}
                {accessDetailError && <div className="premium-access-history-error" role="alert">Request history could not be loaded: {accessDetailError}</div>}
                {!accessDetailLoading && accessRequestHistory.length > 0 && <section className="premium-access-history"><h3>Premium access history</h3><ol>{accessRequestHistory.map((event, index) => <li key={`${event.action}-${event.created_at}-${index}`}><span className="premium-access-history-dot"/><div><strong>{premiumAccessHistoryLabel(event.action)}</strong><span>{event.actor || "Actor not recorded"}{event.created_at ? ` · ${new Date(event.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}</span></div></li>)}</ol></section>}
                {previousRequests.length > 0 && <section className="premium-access-previous"><h3>Previous Premium requests</h3><ul>{previousRequests.map((entry) => <li key={entry.id}><span>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Date unavailable"}</span><strong className={`admin-request-status ${entry.status.toLowerCase()}`}>{entry.status}</strong></li>)}</ul></section>}
                {selectedAccessRequest.rejectionReason && <div className="access-request-decision-note"><strong>Decision reason</strong><span>{selectedAccessRequest.rejectionReason}</span></div>}
              </div>
            })()}
          </Modal>
          <Modal isOpen={Boolean(accessActionDialog)} onClose={() => { if (!accessBusyId) { setAccessActionDialog(null); setAccessActionReason("") } }} title={accessActionDialog?.includes("APPROVE") ? "Approve Premium Access" : accessActionDialog === "REVOKE" ? "Revoke Premium Access?" : "Reject Premium Request"} size="md" footer={<div className="admin-access-editor-footer"><Button variant="neutral" disabled={Boolean(accessBusyId)} onClick={() => { setAccessActionDialog(null); setAccessActionReason("") }}>Cancel</Button><Button variant={accessActionDialog?.includes("APPROVE") ? "success" : "danger"} loading={Boolean(accessBusyId)} onClick={() => void confirmAccessAction()} iconStart={accessActionDialog?.includes("APPROVE") ? <Check size={14} /> : <XCircle size={14} />}>{accessActionDialog?.includes("APPROVE") ? "Confirm Upgrade" : accessActionDialog === "REVOKE" ? "Confirm Revocation" : "Confirm Rejection"}</Button></div>}>
            {accessActionDialog?.includes("APPROVE") ? <>
              <p className="admin-role-confirmation-lead">{accessActionDialog.startsWith("BULK_") ? `Approve Premium for ${selectedPendingAccessIds.length} selected pending request${selectedPendingAccessIds.length === 1 ? "" : "s"}?` : "Upgrade this user to Premium?"}</p>
              <div className="premium-access-confirm-flow"><span>STANDARD</span><ArrowRight size={18}/><span className="is-premium">PREMIUM</span></div>
              <p className="premium-access-confirm-note">This will enable the Premium features available to this user. The user will receive an in-app notification after the server confirms the change.</p>
            </> : accessActionDialog === "REVOKE" ? <>
              <p className="admin-role-confirmation-lead">Revoke Premium access?</p>
              <div className="premium-access-confirm-flow"><span className="is-premium">PREMIUM</span><ArrowRight size={18}/><span>STANDARD</span></div>
              <p className="premium-access-confirm-note">The user’s Premium entitlement will be removed, their Standard access restored, and a notification sent after the backend confirms the change.</p>
            </> : <p className="admin-role-confirmation-lead">{accessActionDialog?.startsWith("BULK_") ? `Reject ${selectedPendingAccessIds.length} selected pending Premium request${selectedPendingAccessIds.length === 1 ? "" : "s"}?` : "Reject this Premium upgrade request? The user will be notified after confirmation."}</p>}
            {(accessActionDialog === "REJECT" || accessActionDialog === "REVOKE" || accessActionDialog === "BULK_REJECT") && <label className="access-action-reason"><span>{accessActionDialog === "REVOKE" ? "Reason (optional)" : "Rejection reason (optional)"}</span><textarea rows={3} value={accessActionReason} onChange={(event) => setAccessActionReason(event.target.value)} placeholder="Add a short note for the user and audit history" /></label>}
            {accessActionDialog?.startsWith("BULK_") && <ul className="access-bulk-confirm-list">{selectedPendingAccessIds.map((id) => { const req = accessRequests.find((entry) => entry.id === id); return <li key={id}><strong>{req?.name || req?.email}</strong><span>{req?.email}</span></li> })}</ul>}
            {!accessActionDialog?.startsWith("BULK_") && selectedAccessRequest && <div className="access-action-target"><span className="access-dialog-icon"><ShieldCheck size={18} /></span><div><strong>{selectedAccessRequest.name || selectedAccessRequest.email}</strong><span>{selectedAccessRequest.email}</span></div></div>}
          </Modal>
        </div>
      )}

      {tab === "users" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-lg)",
          }}
        >
          <div className="admin-user-hero">
            <span className="admin-user-hero-icon">
              <UsersRound size={24} />
            </span>
            <div>
              <span className="admin-user-eyebrow">
                ADMIN CONTROL CENTER · USER MANAGEMENT
              </span>
              <h1>User Management</h1>
              <p>
                Manage accounts, roles, access, subscriptions, and authentication
                actions from one focused workspace.
              </p>
            </div>
            <div className="admin-user-summary">
              <div>
                <strong>{managedUsers.length}</strong>
                <span>Total Users</span>
              </div>
              <div>
                <strong>
                  {
                    managedUsers.filter((item) => item.status === "ACTIVE")
                      .length
                  }
                </strong>
                <span>Active</span>
              </div>
              <div>
                <strong>
                  {
                    accessRequests.filter((item) => item.status === "PENDING")
                      .length
                  }
                </strong>
                <span>Pending Access</span>
              </div>
            </div>
          </div>
          <div className="admin-user-kpis">
            <div className="admin-user-kpi total">
              <span className="admin-user-kpi-icon"><UsersRound size={28} strokeWidth={2.2} /></span>
              <span>TOTAL USERS</span>
              <strong>{managedUsers.length}</strong>
              <small>All registered accounts</small>
            </div>
            <div>
              <span className="admin-user-kpi-icon"><UserRound size={28} strokeWidth={2.2} /></span>
              <span>STANDARD USERS</span>
              <strong>
                {
                  managedUsers.filter(
                    (item) =>
                      item.role === "PUBLIC" && item.plan !== "SUBSCRIBER",
                  ).length
                }
              </strong>
              <small>PUBLIC · FREE</small>
            </div>
            <div>
              <span className="admin-user-kpi-icon premium"><Crown size={28} strokeWidth={2.2} /></span>
              <span>PREMIUM USERS</span>
              <strong>
                {
                  managedUsers.filter(
                    (item) =>
                      item.role === "PUBLIC" && item.plan === "SUBSCRIBER",
                  ).length
                }
              </strong>
              <small>PUBLIC · SUBSCRIBER</small>
            </div>
            <div>
              <span className="admin-user-kpi-icon analyst"><Building2 size={28} strokeWidth={2.2} /></span>
              <span>DGCA / ANALYSTS</span>
              <strong>
                {managedUsers.filter((item) => item.role === "ANALYST").length}
              </strong>
              <small>GOVERNMENT access</small>
            </div>
            <div>
              <span className="admin-user-kpi-icon admin"><ShieldCheck size={28} strokeWidth={2.2} /></span>
              <span>ADMINS</span>
              <strong>
                {managedUsers.filter((item) => item.role === "ADMIN").length}
              </strong>
              <small>ADMIN access</small>
            </div>
          </div>
          {showCreateUserForm && (
            <Modal
              isOpen={showCreateUserForm}
              onClose={() => {
                if (!savingUser) setShowCreateUserForm(false)
              }}
              title="Add user"
              size="md"
            >
          <form
            className="admin-user-create-form is-open"
            onSubmit={addManagedUser}
            style={{
              background: "var(--color-surface-bg)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border-primary)",
              padding: 18,
              display: "grid",
              gridTemplateColumns:
                "minmax(160px,1fr) minmax(220px,1.3fr) 140px 150px auto",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}
              >
                NAME
              </label>
              <input
                className="ap-input"
                value={newUser.name}
                onChange={(e) =>
                  setNewUser((v) => ({ ...v, name: e.target.value }))
                }
                placeholder="Full name"
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}
              >
                EMAIL
              </label>
              <input
                className="ap-input"
                type="email"
                value={newUser.email}
                onChange={(e) =>
                  setNewUser((v) => ({ ...v, email: e.target.value }))
                }
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}
              >
                ROLE
              </label>
              <select
                className="ap-input"
                value={newUser.role}
                onChange={(e) =>
                  setNewUser((v) => ({
                    ...v,
                    role: e.target.value,
                    plan:
                      e.target.value === "PUBLIC"
                        ? v.plan === "SUBSCRIBER"
                          ? "SUBSCRIBER"
                          : "FREE"
                        : e.target.value === "ANALYST"
                          ? "GOVERNMENT"
                          : "ADMIN",
                  }))
                }
              >
                <option value="PUBLIC">USER</option>
                <option value="ANALYST">DGCA / ANALYST</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "var(--color-text-tertiary)",
                  marginBottom: 6,
                }}
              >
                SUBSCRIPTION
              </label>
              <select
                className="ap-input"
                value={
                  newUser.role === "PUBLIC"
                    ? newUser.plan
                    : newUser.role === "ANALYST"
                      ? "GOVERNMENT"
                      : "ADMIN"
                }
                disabled={newUser.role !== "PUBLIC"}
                onChange={(e) =>
                  setNewUser((v) => ({ ...v, plan: e.target.value }))
                }
              >
                <option value="FREE">STANDARD</option>
                <option value="SUBSCRIBER">PREMIUM</option>
                {newUser.role === "ANALYST" && (
                  <option value="GOVERNMENT">GOVERNMENT</option>
                )}
                {newUser.role === "ADMIN" && (
                  <option value="ADMIN">ADMIN</option>
                )}
              </select>
            </div>
            <Button
              variant="primary"
              type="submit"
              disabled={savingUser}
              iconStart={<Plus size={14} />}
            >
              {savingUser ? "Creating…" : "Add User"}
            </Button>
          </form>
            </Modal>
          )}

          <div className="admin-users-toolbar">
            <label className="admin-users-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Search users by name or email"
                aria-label="Search users by name or email"
              />
            </label>
            <select
              className="ap-input admin-users-filter"
              aria-label="Filter by role"
              value={userRoleFilter}
              onChange={(event) =>
                setUserRoleFilter(event.target.value as typeof userRoleFilter)
              }
            >
              <option value="ALL">All roles</option>
              <option value="PUBLIC">Users</option>
              <option value="ANALYST">DGCA / Analysts</option>
              <option value="ADMIN">Admins</option>
            </select>
            <select
              className="ap-input admin-users-filter"
              aria-label="Filter by subscription"
              value={userPlanFilter}
              onChange={(event) =>
                setUserPlanFilter(event.target.value as typeof userPlanFilter)
              }
            >
              <option value="ALL">All subscriptions</option>
              <option value="FREE">Standard</option>
                <option value="SUBSCRIBER">Premium</option>
            </select>
            <select
              className="ap-input admin-users-filter"
              aria-label="Filter by status"
              value={userStatusFilter}
              onChange={(event) =>
                setUserStatusFilter(event.target.value as typeof userStatusFilter)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Disabled</option>
            </select>
            <Button
              size="xs"
              variant="primary"
              className="admin-users-add-button"
              onClick={() => setShowCreateUserForm((value) => !value)}
              iconStart={<Plus size={13} />}
              aria-expanded={showCreateUserForm}
            >
              Add User
            </Button>
            {(userQuery ||
              userRoleFilter !== "ALL" ||
              userPlanFilter !== "ALL" ||
              userStatusFilter !== "ALL") && (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setUserQuery("")
                  setUserRoleFilter("ALL")
                  setUserPlanFilter("ALL")
                  setUserStatusFilter("ALL")
                }}
                iconStart={<X size={13} />}
              >
                Clear filters
              </Button>
            )}
            <span className="admin-users-result-count">
              {filteredManagedUsers.length} of {managedUsers.length} users
            </span>
            <Button
              size="xs"
              variant="neutral"
              onClick={() => {
                setUsersError(null)
                setUsersLoaded(false)
              }}
              disabled={usersLoading}
              iconStart={<RefreshCw size={13} />}
            >
              {usersLoading ? "Syncing…" : "Refresh"}
            </Button>
          </div>

          {selectableVisibleUsers.length > 0 && (
            <div className="admin-user-bulk-toolbar">
              <label className="admin-select-all-label">
                <input
                  type="checkbox"
                  aria-label="Select all visible users"
                  checked={visibleSelectedUsers.length === selectableVisibleUsers.length}
                  disabled={usersLoading || updatingUserStatus}
                  onChange={(event) => {
                    const visibleEmails = selectableVisibleUsers.map((entry) => entry.email.toLowerCase())
                    setSelectedUserEmails((selected) => event.target.checked
                      ? [...new Set([...selected, ...visibleEmails])]
                      : selected.filter((email) => !visibleEmails.includes(email)))
                  }}
                />
                <span>Select all visible</span>
              </label>
              <strong>{selectedUsers.length} selected</strong>
              <div>
                <Button size="xs" variant="danger" disabled={!selectedActiveUsers.length || updatingUserStatus} onClick={() => setBulkUserStatusDialog(false)} iconStart={<ShieldCheck size={13} />}>
                  Disable ({selectedActiveUsers.length})
                </Button>
                <Button size="xs" variant="success" disabled={!selectedInactiveUsers.length || updatingUserStatus} onClick={() => setBulkUserStatusDialog(true)} iconStart={<CheckCircle size={13} />}>
                  Enable ({selectedInactiveUsers.length})
                </Button>
                {selectedUsers.length > 0 && <Button size="xs" variant="subtle" onClick={() => setSelectedUserEmails([])} disabled={updatingUserStatus}>Clear selection</Button>}
              </div>
            </div>
          )}

          <div
            className="admin-users-table-wrap"
            style={{
              background: "var(--color-surface-bg)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border-primary)",
              overflow: "hidden",
            }}
          >
            {usersLoading && managedUsers.length > 0 && (
              <div className="admin-directory-sync" role="status">
                <RefreshCw size={13} className="spin" /> Syncing the directory
                in the background…
              </div>
            )}
            <table className="ap-table">
              <thead>
                <tr>
                  <th className="admin-table-select-cell">Select</th>
                  {[
                    "User",
                    "Access & plan",
                    "Last Active",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usersLoading && managedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="admin-empty-state">
                        <RefreshCw size={18} className="spin" />
                        <strong>Loading verified Firebase users…</strong>
                        <span>
                          The directory is being loaded from the authenticated
                          backend.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : managedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="admin-empty-state">
                        <strong>No users returned</strong>
                        <span>
                          {usersError ||
                            "The backend returned no authenticated users."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredManagedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="admin-empty-state">
                        <Search size={18} />
                        <strong>No matching users</strong>
                        <span>
                          Try another name, email, role, or subscription filter.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredManagedUsers.map((u) => (
                    <tr key={u.email} className={selectedUserEmails.includes(u.email.toLowerCase()) ? "admin-user-row-selected" : ""}>
                      <td className="admin-table-select-cell" data-label="Select">
                        <input
                          type="checkbox"
                          aria-label={`Select ${u.name || u.email}`}
                          checked={selectedUserEmails.includes(u.email.toLowerCase())}
                          disabled={u.email.toLowerCase() === user?.email?.toLowerCase() || usersLoading || updatingUserStatus}
                          onChange={(event) => setSelectedUserEmails((selected) => event.target.checked ? [...new Set([...selected, u.email.toLowerCase()])] : selected.filter((email) => email !== u.email.toLowerCase()))}
                        />
                      </td>
                      <td data-label="User">
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {u.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {u.email}
                          {u.verified ? " · verified" : ""}
                        </div>
                      </td>
                      <td data-label="Access & plan">
                        <div className="admin-role-cell">
                          <div className="admin-role-line">
                            <span
                              className="ap-badge"
                              style={{
                                background:
                                  ROLE_BADGE[
                                    (u.role as keyof typeof ROLE_BADGE)
                                  ]?.bg,
                                color:
                                  ROLE_BADGE[
                                    (u.role as keyof typeof ROLE_BADGE)
                                  ]?.color,
                              }}
                            >
                              {ROLE_LABEL[u.role] || u.role}
                            </span>
                            <span className="admin-role-access">
                              {ROLE_DETAILS[u.role]?.access ||
                                "Access configured"}
                            </span>
                          </div>
                          <span className="admin-entitlement">
                            {subscriptionLabel(u)}
                          </span>
                          <button
                            type="button"
                            className="admin-access-edit-button"
                            onClick={() => openAccessEditor(u)}
                            disabled={Boolean(updatingRole)}
                            aria-label={`Edit access for ${u.email}`}
                          >
                            <SlidersHorizontal size={13} />
                            <span>Edit access</span>
                          </button>
                        </div>
                      </td>
                      <td
                        data-label="Last active"
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatLastActive(u.lastLogin)}
                      </td>
                      <td data-label="Status">
                        <span className={`admin-user-status-chip ${u.status === "ACTIVE" ? "is-active" : "is-disabled"}`}>
                          {u.status === "ACTIVE" ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <div
                          className="admin-user-actions"
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <Button
                            size="xs"
                            variant="subtle"
                            disabled={resettingEmail === u.email}
                            onClick={() => resetManagedPassword(u.email)}
                            iconStart={<MailCheck size={12} />}
                          >
                            {resettingEmail === u.email
                              ? "Sending…"
                              : resetSentEmail === u.email
                                ? "Resend Reset Link"
                                : "Send Reset Link"}
                          </Button>
                          <Button
                            size="xs"
                            variant="danger"
                            disabled={
                              Boolean(deletingUserEmail) ||
                              u.email.toLowerCase() ===
                                user?.email?.toLowerCase()
                            }
                            onClick={() => setUserToDelete(u)}
                            iconStart={<Trash2 size={12} />}
                          >
                            {deletingUserEmail === u.email
                              ? "Deleting…"
                              : "Delete"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {nextUsersPage && (
              <div style={{ padding: 14, textAlign: "center" }}>
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={loadNextUsersPage}
                  disabled={usersLoading}
                >
                  {usersLoading ? "Loading…" : "Load more Firebase users"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Feedback */}
      {tab === "feedback" && (
        <div
          className="admin-tab-surface feedback-admin-surface"
          style={{
            background: "var(--color-surface-bg)",
            borderRadius: "var(--radius-xl)",
            border: "1px solid var(--color-border-primary)",
            overflow: "hidden",
          }}
        >
          <div className="feedback-admin-header">
            <span className="feedback-admin-header-icon">
              <MessageSquare size={25} />
            </span>
            <div>
              <span>ADMIN CONTROL CENTER · PRODUCT OPERATIONS</span>
              <h1>User Feedback</h1>
              <p>
                Review user-submitted messages, track what has been handled, and
                retain an auditable moderation history.
              </p>
            </div>
            <Button
              size="xs"
              variant="primary"
              onClick={() => setFeedbackAnalyticsOpen((value) => !value)}
              iconStart={<BarChart3 size={14} />}
            >
              {feedbackAnalyticsOpen ? "Hide analytics" : "View analytics"}
            </Button>
            <button
              className="feedback-header-more"
              type="button"
              aria-label="More feedback actions"
              title="More feedback actions"
              onClick={() => setFeedbackMoreOpen((value) => !value)}
            >
              <MoreVertical size={18} />
            </button>
            {feedbackMoreOpen && (
              <div className="feedback-header-menu">
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackRefreshKey((value) => value + 1)
                    setFeedbackMoreOpen(false)
                  }}
                >
                  Refresh data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackQuery("")
                    setFeedbackStatusFilter("ALL")
                    setFeedbackCategoryFilter("ALL")
                    setFeedbackDateRange("ALL")
                    setFeedbackMoreOpen(false)
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div className="feedback-admin-kpis">
            {([
              [
                "TOTAL MESSAGES",
                feedback.length,
                "blue",
                "ALL",
                <MessageSquare size={15} />,
              ],
              [
                "NEEDS REVIEW",
                feedback.filter((item) => item.status === "NEW").length,
                "amber",
                "NEW",
                <Activity size={15} />,
              ],
              [
                "REVIEWED",
                feedback.filter((item) => item.status === "REVIEWED").length,
                "green",
                "REVIEWED",
                <CheckCircle size={15} />,
              ],
              [
                "RESOLVED / CLOSED",
                feedback.filter((item) => item.status === "RESOLVED").length,
                "purple",
                "RESOLVED",
                <ShieldCheck size={15} />,
              ],
            ] as const).map(([label, value, tone, filter, icon]) => (
              <button
                className={`feedback-kpi ${tone} ${
                  feedbackStatusFilter === filter ? "selected" : ""
                }`}
                key={label}
                onClick={() =>
                  setFeedbackStatusFilter(filter as typeof feedbackStatusFilter)
                }
              >
                <span className="feedback-kpi-label">{label}</span>
                <strong>{value}</strong>
                <i className="feedback-kpi-icon">{icon}</i>
                <i className="feedback-kpi-spark" aria-hidden="true">
                  <b />
                  <b />
                  <b />
                  <b />
                </i>
              </button>
            ))}
          </div>
          {feedbackAnalyticsOpen && (
            <div className="feedback-analytics-panel">
              <div>
                <strong>Feedback overview</strong>
                <span>Live counts from the loaded feedback records.</span>
              </div>
              <div className="feedback-analytics-bars">
                {(["NEW", "REVIEWED", "IN_PROGRESS", "RESOLVED"] as const).map(
                  (status) => (
                    <div key={status}>
                      <span>{feedbackStatusLabel(status)}</span>
                      <b>
                        <i
                          style={{
                            width: `${
                              feedback.length
                                ? Math.round(
                                    (feedback.filter(
                                      (item) => item.status === status,
                                    ).length /
                                      feedback.length) *
                                      100,
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </b>
                      <strong>
                        {
                          feedback.filter((item) => item.status === status)
                            .length
                        }
                      </strong>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
          <div className="feedback-admin-toolbar">
            <label className="admin-users-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={feedbackQuery}
                onChange={(event) => setFeedbackQuery(event.target.value)}
                placeholder="Search message, name, or email"
                aria-label="Search feedback"
              />
            </label>
            <div className="feedback-filter-desktop">
              <select
                className="ap-input admin-users-filter"
                value={feedbackStatusFilter}
                onChange={(event) =>
                  setFeedbackStatusFilter(
                    event.target.value as typeof feedbackStatusFilter,
                  )
                }
                aria-label="Filter feedback by status"
              >
                <option value="ALL">All statuses</option>
                {Array.from(new Set(feedback.map((item) => item.status))).map(
                  (status) => (
                    <option key={status} value={status}>
                      {feedbackStatusLabel(status)}
                    </option>
                  ),
                )}
              </select>
              <select
                className="ap-input admin-users-filter"
                value={feedbackCategoryFilter}
                onChange={(event) =>
                  setFeedbackCategoryFilter(event.target.value)
                }
                aria-label="Filter feedback by category"
              >
                <option value="ALL">All categories</option>
                {Array.from(
                  new Set(
                    feedback.map((item) => item.category).filter(Boolean),
                  ),
                ).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                className="ap-input admin-users-filter"
                value={feedbackDateRange}
                onChange={(event) =>
                  setFeedbackDateRange(
                    event.target.value as typeof feedbackDateRange,
                  )
                }
                aria-label="Filter feedback by date"
              >
                <option value="ALL">All time</option>
                <option value="7D">Last 7 days</option>
                <option value="30D">Last 30 days</option>
              </select>
            </div>
            <Button
              className="feedback-filter-mobile"
              size="xs"
              variant="neutral"
              onClick={() => setFeedbackFiltersOpen(true)}
              iconStart={<Filter size={14} />}
            >
              Filters
            </Button>
            {(feedbackQuery ||
              feedbackStatusFilter !== "ALL" ||
              feedbackCategoryFilter !== "ALL" ||
              feedbackDateRange !== "ALL") && (
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  setFeedbackQuery("")
                  setFeedbackStatusFilter("ALL")
                  setFeedbackCategoryFilter("ALL")
                  setFeedbackDateRange("ALL")
                }}
                iconStart={<X size={13} />}
              >
                Clear filters
              </Button>
            )}
            <span className="admin-users-result-count">
              {filteredFeedback.length} of {feedback.length} messages
            </span>
            <Button
              size="xs"
              variant="neutral"
              onClick={() => setFeedbackRefreshKey((value) => value + 1)}
              disabled={feedbackLoading}
              loading={feedbackLoading}
              iconStart={<RefreshCw size={13} />}
            >
              {feedbackLoading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          <div
            className="feedback-status-tabs"
            role="tablist"
            aria-label="Feedback status"
          >
            <button
              className={feedbackStatusFilter === "ALL" ? "active" : ""}
              onClick={() => setFeedbackStatusFilter("ALL")}
            >
              All messages ({feedback.length})
            </button>
            {Array.from(new Set(feedback.map((item) => item.status))).map(
              (status) => (
                <button
                  key={status}
                  className={feedbackStatusFilter === status ? "active" : ""}
                  onClick={() => setFeedbackStatusFilter(status)}
                >
                  {feedbackStatusLabel(status)} (
                  {feedback.filter((item) => item.status === status).length})
                </button>
              ),
            )}
          </div>
          {filteredFeedback.length > 0 && (
            <div className="feedback-bulk-toolbar">
              <label>
                <input
                  type="checkbox"
                  aria-label="Select all visible feedback messages"
                  checked={filteredFeedback.length > 0 && visibleSelectedFeedback.length === filteredFeedback.length}
                  disabled={Boolean(feedbackBusyId)}
                  onChange={(event) => {
                    const visibleIds = filteredFeedback.map((item) => item.id)
                    setSelectedFeedbackIds((selected) => event.target.checked
                      ? [...new Set([...selected, ...visibleIds])]
                      : selected.filter((id) => !visibleIds.includes(id)))
                  }}
                />
                <span>Select all visible</span>
              </label>
              <strong>{selectedFeedbackEntries.length} selected</strong>
              <div className="feedback-bulk-actions">
                <Button
                  size="xs"
                  variant="neutral"
                  disabled={!reviewableFeedbackIds.length || Boolean(feedbackBusyId)}
                  loading={feedbackBusyId === "bulk"}
                  onClick={() => void bulkUpdateFeedback("REVIEWED")}
                  iconStart={<Check size={13} />}
                >
                  Mark reviewed ({reviewableFeedbackIds.length})
                </Button>
                <Button
                  size="xs"
                  variant="success"
                  disabled={!resolvableFeedbackIds.length || Boolean(feedbackBusyId)}
                  onClick={() => void bulkUpdateFeedback("RESOLVED")}
                  iconStart={<CheckCircle size={13} />}
                >
                  Resolve ({resolvableFeedbackIds.length})
                </Button>
                {selectedFeedbackEntries.length > 0 && (
                  <Button size="xs" variant="subtle" disabled={Boolean(feedbackBusyId)} onClick={() => setSelectedFeedbackIds([])}>
                    Clear selection
                  </Button>
                )}
              </div>
            </div>
          )}
          {feedbackError && (
            <div className="admin-data-error" role="alert">
              <div>
                <strong>Could not load feedback</strong>
                <span>{feedbackError}</span>
              </div>
              <Button
                size="xs"
                variant="neutral"
                onClick={() => setFeedbackRefreshKey((value) => value + 1)}
                disabled={feedbackLoading}
              >
                Try again
              </Button>
            </div>
          )}
          {feedbackLoading && feedback.length > 0 && (
            <div className="admin-directory-sync" role="status">
              <RefreshCw size={13} className="spin" /> Refreshing feedback…
            </div>
          )}
          {feedbackLoading && feedback.length === 0 ? (
            <div className="admin-empty-state">
              <RefreshCw size={18} className="spin" />
              <strong>Loading feedback…</strong>
              <span>Fetching messages from the authenticated backend.</span>
            </div>
          ) : !feedbackLoaded ? (
            <div className="admin-empty-state">
              <RefreshCw size={18} className="spin" />
              <strong>Preparing feedback…</strong>
            </div>
          ) : feedbackError && feedback.length === 0 ? (
            <div className="admin-empty-state">
              <AlertTriangle size={22} />
              <strong>Feedback unavailable</strong>
              <span>
                Use “Try again” above to reload messages from the backend.
              </span>
            </div>
          ) : feedback.length === 0 && !feedbackError ? (
            <div className="admin-empty-state">
              <MessageSquare size={22} />
              <strong>No feedback yet</strong>
              <span>
                Messages submitted from the user dashboard will appear here for
                review.
              </span>
            </div>
          ) : filteredFeedback.length === 0 && !feedbackError ? (
            <div className="admin-empty-state">
              <Search size={20} />
              <strong>No matching feedback</strong>
              <span>Try another search or change the status filter.</span>
            </div>
          ) : (
            <div className="feedback-admin-list">
              {filteredFeedback.map((item) => (
                <article
                  className={`feedback-admin-row ${
                    item.status === "NEW" ? "is-new" : ""
                  } ${selectedFeedbackIds.includes(item.id) ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <label className="feedback-admin-select" aria-label={`Select feedback from ${item.name || item.email}`}>
                    <input
                      type="checkbox"
                      checked={selectedFeedbackIds.includes(item.id)}
                      disabled={Boolean(feedbackBusyId)}
                      onChange={(event) => setSelectedFeedbackIds((selected) => event.target.checked ? [...new Set([...selected, item.id])] : selected.filter((id) => id !== item.id))}
                    />
                  </label>
                  <div className="feedback-admin-user">
                    <span className="feedback-admin-avatar">
                      {(item.name || item.email || "A")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>{item.name || "AeroPrice user"}</strong>
                      <span>{item.email}</span>
                      <time>
                        {item.createdAt &&
                        !Number.isNaN(new Date(item.createdAt).getTime())
                          ? new Date(item.createdAt).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "Date unavailable"}
                      </time>
                    </div>
                  </div>
                  <div className="feedback-admin-content">
                    <strong>{item.title || "Feedback message"}</strong>
                    <p>{item.message}</p>
                    <div className="feedback-admin-tags">
                      {item.category && (
                        <span>{feedbackCategoryLabel(item.category)}</span>
                      )}
                      {item.sourceModule && <span>{item.sourceModule}</span>}
                      {item.hasScreenshot && <span>Attachment</span>}
                    </div>
                  </div>
                  <span
                    className={`feedback-admin-status ${item.status.toLowerCase()}`}
                  >
                    {feedbackStatusLabel(item.status)}
                  </span>
                  <div className="feedback-admin-row-actions">
                    <Button
                      size="xs"
                      variant="neutral"
                      onClick={() => openFeedback(item)}
                      iconStart={<Eye size={13} />}
                    >
                      View details
                    </Button>
                    <Button
                      size="xs"
                      variant={item.status === "NEW" ? "primary" : "subtle"}
                      onClick={() =>
                        void updateFeedback(
                          item.id,
                          item.status === "NEW" ? "REVIEWED" : "NEW",
                        )
                      }
                      disabled={
                        Boolean(feedbackBusyId) || Boolean(removingQueueItem)
                      }
                      loading={feedbackBusyId === item.id}
                    >
                      {item.status === "NEW" ? "Mark reviewed" : "Reopen"}
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      aria-label={`Remove feedback from ${item.name || item.email}`}
                      onClick={() =>
                        setPendingRemoval({
                          kind: "feedback",
                          id: item.id,
                          label: item.name || item.email,
                        })
                      }
                      disabled={
                        Boolean(feedbackBusyId) || Boolean(removingQueueItem)
                      }
                      iconStart={<Trash2 size={12} />}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
          {selectedFeedback && (
            <div
              className="feedback-detail-backdrop"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget)
                  setSelectedFeedback(null)
              }}
            >
              <aside
                className="feedback-detail-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Feedback details"
              >
                <div className="feedback-detail-head">
                  <div>
                    <span>FEEDBACK DETAILS</span>
                    <h2>{selectedFeedback.title || "Feedback message"}</h2>
                  </div>
                  <button
                    aria-label="Close feedback details"
                    onClick={() => setSelectedFeedback(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="feedback-detail-body">
                  <div className="feedback-detail-user">
                    <span className="feedback-admin-avatar">
                      {(selectedFeedback.name || selectedFeedback.email || "A")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>
                        {selectedFeedback.name || "AeroPrice user"}
                      </strong>
                      <span>{selectedFeedback.email}</span>
                      <time>
                        {selectedFeedback.createdAt || "Date unavailable"}
                      </time>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <span
                          className={`feedback-admin-status ${selectedFeedback.status.toLowerCase()}`}
                        >
                          {feedbackStatusLabel(selectedFeedback.status)}
                        </span>
                      </dd>
                    </div>
                    {selectedFeedback.category && (
                      <div>
                        <dt>Category</dt>
                        <dd>{feedbackCategoryLabel(selectedFeedback.category)}</dd>
                      </div>
                    )}
                    {selectedFeedback.sourceModule && (
                      <div>
                        <dt>Page / module</dt>
                        <dd>{selectedFeedback.sourceModule}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Priority</dt>
                      <dd>{selectedFeedback.priority || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Account role</dt>
                      <dd>{selectedFeedback.role || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Entitlement</dt>
                      <dd>{selectedFeedback.plan || "Not recorded"}</dd>
                    </div>
                    <div>
                      <dt>Browser</dt>
                      <dd>{selectedFeedback.browser || "Not captured"}</dd>
                    </div>
                    <div>
                      <dt>Device</dt>
                      <dd>{selectedFeedback.device || "Not captured"}</dd>
                    </div>
                    <div>
                      <dt>Attachment</dt>
                      <dd>{selectedFeedback.screenshotName || "None"}</dd>
                    </div>
                  </dl>
                  {selectedFeedback.hasScreenshot && (
                    <button
                      type="button"
                      className="feedback-screenshot-button"
                      onClick={() => void viewFeedbackScreenshot(selectedFeedback.id)}
                      disabled={feedbackImageLoading}
                    >
                      <ImagePlus size={15} />
                      {feedbackImageLoading ? "Loading screenshot…" : "View attached screenshot"}
                    </button>
                  )}
                  <section className="feedback-moderation-section">
                    <h3>Moderation</h3>
                    <label className="feedback-status-editor">
                      Update status
                      <select
                        className="ap-input"
                        value={feedbackEditStatus}
                        onChange={(event) =>
                          setFeedbackEditStatus(
                            event.target.value as FeedbackEntry["status"],
                          )
                        }
                      >
                        <option value="NEW">Needs review</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="REVIEWED">Reviewed</option>
                        <option value="RESOLVED">Resolved / closed</option>
                      </select>
                    </label>
                    <label className="feedback-status-editor">
                      Reply to user <span className="form-optional">Optional</span>
                      <textarea
                        className="ap-input"
                        rows={3}
                        maxLength={5000}
                        value={feedbackReplyDraft}
                        onChange={(event) => setFeedbackReplyDraft(event.target.value)}
                        placeholder="Share a clear update that the submitter will see in My submissions."
                      />
                    </label>
                    <label className="feedback-status-editor">
                      Internal notes <span className="form-optional">Admins only</span>
                      <textarea
                        className="ap-input"
                        rows={3}
                        maxLength={5000}
                        value={feedbackInternalNotesDraft}
                        onChange={(event) => setFeedbackInternalNotesDraft(event.target.value)}
                        placeholder="Investigation notes, hand-off context, or follow-up steps. Never shown to the submitter."
                      />
                    </label>
                  </section>
                  <section>
                    <h3>Full message</h3>
                    <p className="feedback-detail-message">
                      {selectedFeedback.message}
                    </p>
                  </section>
                  {selectedFeedback.reply && (
                    <section>
                      <h3>Existing admin reply</h3>
                      <p className="feedback-detail-message">
                        {selectedFeedback.reply}
                      </p>
                    </section>
                  )}
                </div>
                <div className="feedback-detail-footer">
                  <Button
                    size="sm"
                    variant="neutral"
                    onClick={() => setSelectedFeedback(null)}
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void updateFeedback(selectedFeedback.id, feedbackEditStatus, feedbackReplyDraft, feedbackInternalNotesDraft)}
                    loading={feedbackBusyId === selectedFeedback.id}
                  >
                    Save changes
                  </Button>
                </div>
              </aside>
            </div>
          )}
          <Modal
            isOpen={Boolean(feedbackImageUrl)}
            title={selectedFeedback?.screenshotName || "Attached screenshot"}
            onClose={() => {
              if (feedbackImageUrl) URL.revokeObjectURL(feedbackImageUrl)
              setFeedbackImageUrl("")
            }}
            size="lg"
          >
            <img
              src={feedbackImageUrl || undefined}
              alt="Screenshot attached to feedback"
              className="feedback-screenshot-preview"
            />
          </Modal>
          {feedbackFiltersOpen && (
            <div
              className="feedback-filter-backdrop"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget)
                  setFeedbackFiltersOpen(false)
              }}
            >
              <div
                className="feedback-filter-sheet"
                role="dialog"
                aria-label="Feedback filters"
              >
                <div>
                  <h2>Filters</h2>
                  <button
                    aria-label="Close filters"
                    onClick={() => setFeedbackFiltersOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <label>
                  Status
                  <select
                    className="ap-input"
                    value={feedbackStatusFilter}
                    onChange={(event) =>
                      setFeedbackStatusFilter(
                        event.target.value as typeof feedbackStatusFilter,
                      )
                    }
                  >
                    <option value="ALL">All statuses</option>
                    {Array.from(
                      new Set(feedback.map((item) => item.status)),
                    ).map((status) => (
                      <option key={status} value={status}>
                        {feedbackStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    className="ap-input"
                    value={feedbackCategoryFilter}
                    onChange={(event) =>
                      setFeedbackCategoryFilter(event.target.value)
                    }
                  >
                    <option value="ALL">All categories</option>
                    {Array.from(
                      new Set(
                        feedback.map((item) => item.category).filter(Boolean),
                      ),
                    ).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Date range
                  <select
                    className="ap-input"
                    value={feedbackDateRange}
                    onChange={(event) =>
                      setFeedbackDateRange(
                        event.target.value as typeof feedbackDateRange,
                      )
                    }
                  >
                    <option value="ALL">All time</option>
                    <option value="7D">Last 7 days</option>
                    <option value="30D">Last 30 days</option>
                  </select>
                </label>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setFeedbackFiltersOpen(false)}
                >
                  Apply filters
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Audit */}
      {tab === "audit" && (
        <AuditTrail
          records={audit}
          total={auditTotal}
          loading={auditLoading}
          loaded={auditLoaded}
          error={auditError}
          onRefresh={() => setAuditRefreshKey((value) => value + 1)}
        />
      )}
      {false && tab === "audit" && (
        <div
          className="admin-tab-surface"
          style={{
            background: "var(--color-surface-bg)",
            borderRadius: "var(--radius-xl)",
            border: "1px solid var(--color-border-primary)",
            overflow: "hidden",
          }}
        >
          <div className="admin-section-banner compact">
            <div>
              <span>ADMIN CONTROL CENTER · GOVERNANCE</span>
              <h1>Audit Trail</h1>
              <p>
                Trace administrator changes with clear timestamps, actors, and
                affected accounts.
              </p>
            </div>
            <div className="admin-section-count">
              <strong>{auditTotal}</strong>
              <span>Recorded events</span>
            </div>
          </div>
          <div className="admin-audit-stats">
            <div>
              <span>LAST 24 HOURS</span>
              <strong>{auditRecentCount}</strong>
            </div>
            <div>
              <span>UNIQUE ACTORS</span>
              <strong>{auditActorCount}</strong>
            </div>
            <div>
              <span>ACTION TYPES</span>
              <strong>{auditActionCount}</strong>
            </div>
          </div>
          {audit.length > 0 && auditTotal > audit.length && (
            <div className="admin-audit-retention-note">
              Showing the latest {audit.length} of {auditTotal} events. Search,
              filters, and export apply to the events currently loaded.
            </div>
          )}
          <div className="admin-tab-toolbar admin-audit-toolbar">
            <div className="admin-audit-filters">
              <label className="admin-users-search">
                <Search size={16} aria-hidden="true" />
                <input
                  value={auditQuery}
                  onChange={(event) => setAuditQuery(event.target.value)}
                  placeholder="Search actor, action, or detail"
                  aria-label="Search audit log"
                />
              </label>
              <select
                className="ap-input admin-users-filter"
                value={auditAction}
                onChange={(event) => setAuditAction(event.target.value)}
                aria-label="Filter audit action"
              >
                <option value="ALL">All actions</option>
                {Array.from(new Set(audit.map((entry) => entry.action)))
                  .sort()
                  .map((action) => (
                    <option key={action} value={action}>
                      {ACTION_LABEL[action] || action.replace(/_/g, " ")}
                    </option>
                  ))}
              </select>
            </div>
            <div className="admin-audit-actions">
              <Button
                size="xs"
                variant="neutral"
                onClick={() => setAuditRefreshKey((value) => value + 1)}
                disabled={auditLoading}
                loading={auditLoading}
                iconStart={<RefreshCw size={13} />}
              >
                {auditLoading ? "Refreshing…" : "Refresh"}
              </Button>
              <Button
                size="xs"
                variant="neutral"
                onClick={downloadAuditCSV}
                disabled={filteredAudit.length === 0}
                iconStart={<Download size={13} />}
              >
                Export{" "}
                {filteredAudit.length
                  ? `${filteredAudit.length} events`
                  : "CSV"}
              </Button>
            </div>
          </div>
          {auditError && (
            <div className="admin-data-error" role="alert">
              <div>
                <strong>Audit trail could not be loaded</strong>
                <span>{auditError}</span>
              </div>
              <Button
                size="xs"
                variant="neutral"
                onClick={() => setAuditRefreshKey((value) => value + 1)}
                disabled={auditLoading}
              >
                Try again
              </Button>
            </div>
          )}
          {auditLoading && audit.length > 0 && (
            <div className="admin-directory-sync" role="status">
              <RefreshCw size={13} className="spin" /> Refreshing audit events…
            </div>
          )}
          {auditLoading && audit.length === 0 ? (
            <div className="admin-empty-state">
              <RefreshCw size={18} className="spin" />
              <strong>Loading audit trail…</strong>
              <span>Retrieving the latest administrator activity.</span>
            </div>
          ) : !auditLoaded ? (
            <div className="admin-empty-state">
              <RefreshCw size={18} className="spin" />
              <strong>Preparing audit trail…</strong>
            </div>
          ) : auditError && audit.length === 0 ? (
            <div className="admin-empty-state">
              <AlertTriangle size={22} />
              <strong>Audit events unavailable</strong>
              <span>
                Use “Try again” above to reload activity from the backend.
              </span>
            </div>
          ) : audit.length === 0 && !auditError ? (
            <div className="admin-empty-state">
              <ShieldCheck size={22} />
              <strong>No audit events recorded yet</strong>
              <span>
                Account, access, and feedback changes will be recorded here when
                performed.
              </span>
            </div>
          ) : filteredAudit.length === 0 && !auditError ? (
            <div className="admin-empty-state">
              <Search size={20} />
              <strong>No matching events</strong>
              <span>Try another search or choose a different action.</span>
            </div>
          ) : (
            <div className="admin-table-scroll admin-audit-table-wrap">
              <table className="ap-table admin-audit-table">
                <thead>
                  <tr>
                    {["Timestamp", "Actor", "Action", "Detail"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAudit.map((entry) => {
                    const timestamp = new Date(entry.ts)
                    const timestampLabel = Number.isFinite(timestamp.getTime())
                      ? timestamp.toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Timestamp unavailable"
                    return (
                      <tr
                        key={`${entry.ts}-${entry.actor}-${entry.action}-${entry.detail}`}
                      >
                        <td
                          data-label="Timestamp"
                          className="admin-audit-timestamp"
                        >
                          {timestampLabel}
                        </td>
                        <td data-label="Actor" className="admin-audit-actor">
                          {entry.actor}
                        </td>
                        <td data-label="Action">
                          <span
                            className="admin-audit-action"
                            style={{
                              color:
                                ACTION_COLOR[entry.action] ??
                                "var(--color-text-secondary)",
                            }}
                          >
                            {ACTION_LABEL[entry.action] ||
                              entry.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td data-label="Detail" className="admin-audit-detail">
                          {formatAuditDetails(entry.detail)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filteredAudit.length > 0 && (
            <div className="admin-audit-pagination">
              <span>
                {filteredAudit.length} matching loaded event
                {filteredAudit.length === 1 ? "" : "s"} · Page {auditPage} of{" "}
                {auditPageCount}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  disabled={auditPage >= auditPageCount}
                  onClick={() =>
                    setAuditPage((page) => Math.min(auditPageCount, page + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Config */}
      {tab === "config" && (
        <div
          className="admin-tab-surface admin-config-surface"
          style={{
            background: "var(--color-surface-bg)",
            borderRadius: "var(--radius-xl)",
            border: "1px solid var(--color-border-primary)",
            padding: "var(--space-xl)",
          }}
        >
          <div className="admin-section-banner compact">
            <div>
              <span>ADMIN CONTROL CENTER · CONFIGURATION</span>
              <h1>System Parameters</h1>
              <p>
                Backend-reported settings currently used for collection and
                analytics.
              </p>
            </div>
            <div className="admin-section-count">
              <strong>{systemParameters?.parameters.length ?? "—"}</strong>
              <span>Active parameters</span>
            </div>
          </div>
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontSize: 12,
              marginBottom: "var(--space-lg)",
            }}
          >
            {systemParameters?.note ??
              "Parameters are unavailable until the backend responds."}
          </p>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              color: "var(--color-text-tertiary)",
              fontFamily: "var(--font-sans)",
              marginBottom: "var(--space-lg)",
            }}
          >
            INDEX &amp; COLLECTION PARAMETERS
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-md)",
            }}
          >
            {systemParameters?.parameters.map((t) => (
              <div
                key={t.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-lg)",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-surface-secondary)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {t.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-tertiary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {t.key}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <strong
                    style={{
                      color: "var(--color-text-primary)",
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {t.value}
                  </strong>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-tertiary)",
                      minWidth: 64,
                    }}
                  >
                    {t.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
