export interface AuditRecord {
  id: string
  ts: string
  actor: string
  actorName: string
  actorRole: string
  action: string
  resourceType: string
  resourceId: string
  target: string
  targetRole: string
  detail: string
  metadata: unknown
  ipAddress: string
}

const sensitiveKey = /password|passwd|passphrase|(^|_)pwd($|_)|token|secret|credential|authorization|cookie|session.?id|api.?key|private.?key/i
const redacted = '[REDACTED]'

/** Scrub display, search and export together, never just the visible summary. */
export function redactAuditValue(value: unknown, key = ''): unknown {
  if (sensitiveKey.test(key)) return redacted
  if (Array.isArray(value)) return value.map(item => redactAuditValue(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactAuditValue(item, name)]))
  if (typeof value !== 'string') return value
  try { return redactAuditValue(JSON.parse(value)) } catch { /* Unstructured historical details. */ }
  return value
    .replace(/\bBearer\s+[^\s,;"']+/gi, `Bearer ${redacted}`)
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, redacted)
    .replace(/((?:password|passwd|passphrase|pwd|[\w-]*token|[\w-]*secret|api[_-]?key|authorization|credentials?)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, `$1${redacted}`)
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, `$1${redacted}@`)
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, redacted)
}

function text(value: unknown): string {
  const safe = redactAuditValue(value)
  return safe === undefined || safe === null ? '' : typeof safe === 'string' ? safe : JSON.stringify(safe)
}

export function normalizeAuditRecord(entry: Record<string, unknown>): AuditRecord {
  const metadata = redactAuditValue(entry.details ?? entry.detail ?? {})
  const details = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}
  return {
    id: text(entry.id), ts: text(entry.created_at ?? entry.timestamp ?? entry.ts),
    actor: text(entry.user_email ?? entry.actor), actorName: text(entry.actor_name),
    actorRole: text(entry.actor_role ?? details.actor_role), action: text(entry.action),
    resourceType: text(entry.resource_type ?? details.target_type), resourceId: text(entry.resource_id),
    target: text(details.target_email ?? details.target_name ?? entry.resource_id),
    targetRole: text(details.target_role ?? details.role), detail: text(metadata), metadata,
    ipAddress: text(entry.ip_address),
  }
}

export function auditActionLabel(record: Pick<AuditRecord, 'action' | 'metadata'>): string {
  const labels: Record<string, string> = {
    ROLE_CHANGE: 'Role changed', USER_CREATE: 'User created', USER_UPDATE: 'User updated', USER_DELETE: 'User deleted',
    ACCESS_REQUESTED: 'Access requested', ACCESS_APPROVED: 'Access approved', ACCESS_REJECTED: 'Access rejected', ACCESS_REVOKED: 'Access revoked', ACCESS_REQUEST_DELETE: 'Access request removed',
    FEEDBACK_DELETE: 'Feedback removed', INDEX_PUB: 'Index published', GOV_FETCH: 'Government data fetched',
    SOURCE_CHECK: 'Source checked', LOGIN: 'Signed in',
  }
  if (record.action === 'FEEDBACK_STATUS') {
    const status = record.metadata && typeof record.metadata === 'object' ? (record.metadata as Record<string, unknown>).to : null
    return ({ REVIEWED: 'Feedback reviewed', NEW: 'Feedback reopened', IN_PROGRESS: 'Feedback in progress', RESOLVED: 'Feedback resolved' } as Record<string, string>)[String(status)] ?? 'Feedback status changed'
  }
  return labels[record.action] ?? (record.action ? record.action.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Action not recorded')
}

export function auditActionTone(action: string): string {
  if (action === 'ACCESS_APPROVED') return 'positive'
  if (action === 'ACCESS_REJECTED' || action === 'ACCESS_REVOKED' || action.endsWith('_DELETE')) return 'danger'
  if (action === 'ROLE_CHANGE') return 'amber'
  return 'neutral'
}

export function auditDate(timestamp: string): Date {
  // The audit backend stores UTC. Preserve that meaning for older zone-less rows.
  return new Date(timestamp && !/(Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) ? `${timestamp}Z` : timestamp)
}

export function auditDay(timestamp: string): string {
  const date = auditDate(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}

export function auditTimestamp(timestamp: string): { date: string; time: string } {
  const date = auditDate(timestamp)
  if (!Number.isFinite(date.getTime())) return { date: 'Timestamp not recorded', time: '' }
  return {
    date: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(date),
    time: `${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date)} IST`,
  }
}

const detailLabels: Record<string, string> = {
  target_email: 'User', feature_key: 'Feature', firebase_deleted: 'Firebase identity deleted',
  role: 'Role', plan: 'Plan', from: 'From', to: 'To', reason: 'Reason',
}
export function auditDetailSummary(record: AuditRecord): string {
  if (!record.metadata || typeof record.metadata !== 'object') return record.detail || 'No additional details recorded'
  const values = Object.entries(record.metadata)
    .filter(([key, value]) => !['target_email', 'target_name', 'actor_role'].includes(key) && value !== null && value !== '')
    .map(([key, value]) => `${detailLabels[key] ?? key.replace(/_/g, ' ')}: ${text(value)}`)
  return values.slice(0, 3).join(' · ') || 'No additional details recorded'
}

export interface AuditFilters { query: string; action: string; actor: string; targetType: string; from: string; to: string }
export const emptyAuditFilters: AuditFilters = { query: '', action: '', actor: '', targetType: '', from: '', to: '' }
export function filterAuditRecords(records: AuditRecord[], filters: AuditFilters): AuditRecord[] {
  const query = filters.query.trim().toLowerCase()
  return records.filter(record => {
    const day = auditDay(record.ts)
    return (!filters.action || record.action === filters.action)
      && (!filters.actor || record.actor === filters.actor)
      && (!filters.targetType || record.resourceType === filters.targetType)
      && (!filters.from || Boolean(day && day >= filters.from)) && (!filters.to || Boolean(day && day <= filters.to))
      && (!query || `${record.actor} ${record.actorName} ${record.action} ${auditActionLabel(record)} ${record.target} ${record.resourceType} ${record.detail}`.toLowerCase().includes(query))
  })
}

export function auditStats(records: AuditRecord[]) {
  return {
    total: records.length,
    actors: new Set(records.map(record => record.actor).filter(Boolean)).size,
    actions: new Set(records.map(record => record.action).filter(Boolean)).size,
    userChanges: records.filter(record => /^(USER_|ROLE_CHANGE$|ACCESS_APPROVED$|ACCESS_REJECTED$)/.test(record.action)).length,
    systemEvents: records.filter(record => ['system', 'data_source', 'pipeline', 'collection_job', 'index'].includes(record.resourceType.toLowerCase()) || ['INDEX_PUB', 'GOV_FETCH', 'SOURCE_CHECK'].includes(record.action)).length,
  }
}

export function auditCSV(records: AuditRecord[]): string {
  const cell = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`
  const rows = [
    ['Event ID', 'Timestamp (UTC)', 'Timestamp (IST)', 'Actor', 'Actor role', 'Action', 'Target', 'Target type', 'Resource ID', 'Details'],
    ...records.map(record => [record.id, Number.isFinite(auditDate(record.ts).getTime()) ? auditDate(record.ts).toISOString() : record.ts,
      Object.values(auditTimestamp(record.ts)).join(' '), record.actor, record.actorRole, record.action, record.target, record.resourceType, record.resourceId, record.detail]),
  ]
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
