// Shared live-status rule (Phase 4, audit §7.1).
//
// ONE RULE, EVERYWHERE: no green/live/active treatment unless a successful,
// timestamped backend response backs it in this session. Otherwise the UI
// shows amber/grey + "Unavailable" + the last-checked time.
//
// Pages pass the outcome of their own fetch (ok + checkedAt) into
// `liveSignal()` / `LiveBadge` instead of hardcoding green. That keeps the
// rule enforceable in one place: a future page cannot regress it by copying
// a hardcoded green dot.

export type LiveState = 'live' | 'connected' | 'stale' | 'unavailable' | 'loading' | 'error'

export interface LiveCheck {
  /** True only when a backend call succeeded in this session. */
  ok: boolean
  /** When the successful response arrived (null = never checked). */
  checkedAt: Date | null
  /** True while the check is still in flight. */
  loading?: boolean
  /** True when the last attempt failed (network/5xx), distinct from "no data". */
  failed?: boolean
  /** Age of the newest stored record behind the signal, in ms (optional). */
  newestRecordAt?: Date | null
}

/** Fares older than 24h are stale in the UI (Phase 2 handoff, audit §4.3 P2). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000

export function isStaleRecord(collectedAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!collectedAt) return true
  const at = collectedAt instanceof Date ? collectedAt : new Date(collectedAt)
  if (Number.isNaN(at.getTime())) return true
  return now.getTime() - at.getTime() > STALE_AFTER_MS
}

/**
 * Resolve a fetch outcome to one display state. `live` requires both a
 * successful response AND a fresh record; a successful response with only
 * old records is `stale`, never green.
 */
export function liveSignal(check: LiveCheck, now: Date = new Date()): LiveState {
  if (check.loading) return 'loading'
  if (check.failed) return 'error'
  if (!check.ok || !check.checkedAt) return 'unavailable'
  if (check.newestRecordAt != null) {
    return isStaleRecord(check.newestRecordAt, now) ? 'stale' : 'live'
  }
  return 'connected'
}

/** True only for states that may use green/live treatment. */
export function mayShowLive(state: LiveState): boolean {
  return state === 'live' || state === 'connected'
}

export const LIVE_STATE_LABEL: Record<LiveState, string> = {
  live: 'LIVE',
  connected: 'CONNECTED',
  stale: 'STALE',
  unavailable: 'UNAVAILABLE',
  loading: 'CHECKING',
  error: 'UNAVAILABLE',
}

export const LIVE_STATE_COLOR: Record<LiveState, string> = {
  live: 'var(--color-success)',
  connected: 'var(--color-success)',
  stale: 'var(--color-warning)',
  unavailable: 'var(--color-text-tertiary)',
  loading: 'var(--color-text-tertiary)',
  error: 'var(--color-danger)',
}

export const LIVE_STATE_BG: Record<LiveState, string> = {
  live: 'var(--color-success-bg)',
  connected: 'var(--color-success-bg)',
  stale: 'var(--color-warning-bg)',
  unavailable: 'var(--color-surface-secondary)',
  loading: 'var(--color-surface-secondary)',
  error: 'var(--color-danger-bg)',
}

// ── Dates: day/month/year order, always with the date (audit §1.7) ──────────

/** "21 Nov 2026, 20:30 IST" — date + time, IST, day/month/year order. */
export function formatDateTimeIST(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return (
    date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }) + ' IST'
  )
}

/** "21 Nov 2026" — date only, day/month/year order. */
export function formatDateIST(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/** "Last checked 21 Nov 2026, 20:30 IST" or "Not checked yet". */
export function lastCheckedLabel(checkedAt: Date | null | undefined): string {
  return checkedAt ? `Last checked ${formatDateTimeIST(checkedAt)}` : 'Not checked yet'
}

// ── Numbers: one median definition for the whole app (audit §1.7) ───────────
// Every page averages the two middle values for even counts. BookingWindow
// previously used the upper median, so the same route showed a different
// "median" there than everywhere else.

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function formatINR(value: number | null | undefined): string {
  return value == null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// ── Fare direction: for airfares, up = more expensive = bad (audit §2.9) ────

/** Colour for a fare/index change: increase renders red, decrease green. */
export function fareChangeColor(changePct: number | null | undefined): string {
  if (changePct == null || changePct === 0) return 'var(--color-text-tertiary)'
  return changePct > 0 ? 'var(--color-danger)' : 'var(--color-success)'
}
