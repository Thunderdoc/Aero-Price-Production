// Freshness bands for stored fares (Phase 2 handoff, audit §4.3 P2):
// fares older than 24h are STALE in the UI — never presented as current.
function getLevel(minutes: number) {
  if (minutes <= 5)    return { label: 'LIVE',  color: 'var(--color-success)' }
  if (minutes <= 60)   return { label: 'FRESH', color: 'var(--color-success)' }
  if (minutes <= 1440) return { label: 'AGING', color: 'var(--color-warning)' }
  return                      { label: 'STALE', color: 'var(--color-danger)' }
}

export default function DataFreshness({ minutesAgo, className = '' }: { minutesAgo: number; className?: string }) {
  const lvl = getLevel(minutesAgo)
  const time = minutesAgo < 60
    ? `${minutesAgo} min ago`
    : minutesAgo < 1440
      ? `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`
      : `${Math.floor(minutesAgo / 1440)}d ${Math.floor((minutesAgo % 1440) / 60)}h ago`

  return (
    <span className={`inline-flex items-center gap-[var(--space-xs)] ${className}`} role="status" title={`Data is ${time} old`}>
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: lvl.color, animation: lvl.label === 'LIVE' ? 'pulse-dot 2s ease-in-out infinite' : 'none' }}
        aria-hidden
      />
      <span className="text-caption font-[var(--text-caption-weight)]" style={{ color: lvl.color }}>{lvl.label}</span>
      <span className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>· {time}</span>
    </span>
  )
}
