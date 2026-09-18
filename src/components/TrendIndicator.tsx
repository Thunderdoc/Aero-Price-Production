import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TrendIndicatorProps {
  direction: 'up' | 'down' | 'stable'
  value: number
  period?: string
  size?: 'sm' | 'md'
}

export default function TrendIndicator({ direction, value, period, size = 'md' }: TrendIndicatorProps) {
  const iconSize = size === 'sm' ? 13 : 15
  const colorStyle = direction === 'up'
    ? 'color: var(--color-danger)'
    : direction === 'down'
    ? 'color: var(--color-success)'
    : 'color: var(--color-warning)'

  const textClass = size === 'sm' ? 'text-caption' : 'text-body'

  return (
    <span
      className={`inline-flex items-center gap-[var(--space-xs)] font-[var(--text-label-weight)] ${textClass}`}
      style={{ color: direction === 'up' ? 'var(--color-danger)' : direction === 'down' ? 'var(--color-success)' : 'var(--color-warning)' }}
    >
      {direction === 'up' && <TrendingUp size={iconSize} />}
      {direction === 'down' && <TrendingDown size={iconSize} />}
      {direction === 'stable' && <Minus size={iconSize} />}
      {direction === 'up' ? '+' : direction === 'down' ? '−' : '±'}{Math.abs(value).toFixed(1)}%
      {period && <span style={{ color: 'var(--color-text-tertiary)' }}>{period}</span>}
    </span>
  )
}
