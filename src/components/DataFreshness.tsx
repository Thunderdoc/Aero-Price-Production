function getLevel(minutes: number) {
  if (minutes <= 5)   return { label: 'LIVE',   color: 'var(--color-success)' }
  if (minutes <= 30)  return { label: 'FRESH',  color: 'var(--color-success)' }
  if (minutes <= 120) return { label: 'AGING',  color: 'var(--color-warning)' }
  return                     { label: 'STALE',  color: 'var(--color-danger)' }
}

export default function DataFreshness({ minutesAgo, className = '' }: { minutesAgo: number; className?: string }) {
  const lvl = getLevel(minutesAgo)
  const time = minutesAgo < 60
    ? `${minutesAgo} min ago`
    : `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`

  return (
    <span className={`inline-flex items-center gap-[var(--space-xs)] ${className}`}>
      <span
        className="w-2 h-2 rounded-full animate-pulse-dot"
        style={{ background: lvl.color }}
        aria-hidden
      />
      <span className="text-caption font-[var(--text-caption-weight)]" style={{ color: lvl.color }}>{lvl.label}</span>
      <span className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>· {time}</span>
    </span>
  )
}
