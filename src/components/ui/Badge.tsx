type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'brand' | 'info'

interface BadgeProps {
  label: string
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default:  'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]',
  success:  'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  warning:  'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  danger:   'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
  brand:    'bg-[var(--color-brand-muted)] text-[var(--color-brand-primary)]',
  info:     'bg-[var(--color-info-bg)] text-[var(--color-info)]',
}

export function Badge({ label, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={[
      'inline-flex items-center px-[var(--space-sm)] py-[var(--space-xs)] rounded-[var(--radius-md)] text-caption font-[var(--text-caption-weight)]',
      variantStyles[variant],
      className,
    ].join(' ')}>
      {label}
    </span>
  )
}
