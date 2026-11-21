import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

// Shared empty state, modelled on GovernmentIntelligence's EmptyState — the
// best empty-state pattern in the app (audit §2.5). Every table/panel that
// can be empty renders this instead of bare headers, so "no data" never
// reads as broken. `tone` distinguishes empty (amber, neutral) from error
// (red): empty ≠ error ≠ success.
export default function EmptyState({
  title,
  detail,
  tone = 'empty',
  action,
  minHeight = 118,
}: {
  title: string
  detail?: string
  tone?: 'empty' | 'error'
  action?: ReactNode
  minHeight?: number
}) {
  const color = tone === 'error' ? 'var(--color-danger)' : 'var(--color-warning)'
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
        padding: '20px 16px',
      }}
    >
      <AlertTriangle size={20} style={{ color }} aria-hidden />
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-text-primary)' }}>{title}</div>
      {detail && <div style={{ fontSize: 11, maxWidth: 420, lineHeight: 1.5 }}>{detail}</div>}
      {action}
    </div>
  )
}
