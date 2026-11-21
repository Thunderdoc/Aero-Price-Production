import { LIVE_STATE_BG, LIVE_STATE_COLOR, LIVE_STATE_LABEL, lastCheckedLabel, liveSignal, type LiveCheck } from '../lib/liveStatus'

// One shared live-status badge (Phase 4, audit §7.1). Green renders ONLY
// when `check.ok` is true for a successful, timestamped backend response in
// this session; anything else is amber/grey/red + "Unavailable" + the
// last-checked time. Pages must not hand-roll green dots anymore.
export default function LiveBadge({
  check,
  label,
  showCheckedAt = true,
}: {
  check: LiveCheck
  /** Override the state word (e.g. "ADS-B LIVE FEED") — the colour still follows the state. */
  label?: string
  showCheckedAt?: boolean
}) {
  const state = liveSignal(check)
  const color = LIVE_STATE_COLOR[state]
  const word = label ?? LIVE_STATE_LABEL[state]
  const pulse = state === 'live'
  return (
    <span
      role="status"
      title={lastCheckedLabel(check.checkedAt)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 99,
        background: LIVE_STATE_BG[state],
        color,
        border: `1px solid ${color}44`,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: pulse ? `0 0 8px ${color}` : 'none',
          animation: pulse ? 'pulse-dot 2s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }}
      />
      {word}
      {showCheckedAt && check.checkedAt && (
        <span style={{ fontWeight: 500, letterSpacing: 0, opacity: 0.85 }}>
          · {check.checkedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' })} IST
        </span>
      )}
      {showCheckedAt && !check.checkedAt && !check.loading && (
        <span style={{ fontWeight: 500, letterSpacing: 0, opacity: 0.85 }}>· Not checked</span>
      )}
    </span>
  )
}
