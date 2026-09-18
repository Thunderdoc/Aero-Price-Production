import { Badge } from './ui/Badge'

interface StatusBadgeProps {
  status: string
  className?: string
}

type BV = 'default' | 'success' | 'warning' | 'danger' | 'brand' | 'info'

const statusConfig: Record<string, { label: string; variant: BV }> = {
  live:           { label: 'LIVE',             variant: 'success' },
  LIVE:           { label: 'LIVE',             variant: 'success' },
  fresh:          { label: 'FRESH',            variant: 'success' },
  FRESH:          { label: 'FRESH',            variant: 'success' },
  HEALTHY:        { label: 'HEALTHY',          variant: 'success' },
  ACTIVE:         { label: 'ACTIVE',           variant: 'success' },
  aging:          { label: 'AGING',            variant: 'warning' },
  AGING:          { label: 'AGING',            variant: 'warning' },
  stable:         { label: 'STABLE',           variant: 'warning' },
  PAUSED:         { label: 'PAUSED',           variant: 'warning' },
  stale:          { label: 'STALE',            variant: 'danger' },
  STALE:          { label: 'STALE',            variant: 'danger' },
  failed:         { label: 'FAILED',           variant: 'danger' },
  FAILED:         { label: 'FAILED',           variant: 'danger' },
  sample:         { label: 'SAMPLE DATA',      variant: 'info' },
  official:       { label: 'OFFICIAL REF',     variant: 'brand' },
  NOT_CONFIGURED: { label: 'NOT CONFIGURED',   variant: 'default' },
}

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, variant: 'default' as BV }
  return <Badge label={cfg.label} variant={cfg.variant} className={className} />
}
