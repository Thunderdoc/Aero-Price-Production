import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'neutral' | 'subtle' | 'danger' | 'ghost' | 'success'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  iconStart?: ReactNode
  iconEnd?: ReactNode
  loading?: boolean
  children?: ReactNode
}

const variantStyles: Record<string, string> = {
  primary: [
    'text-white border-transparent',
    'shadow-[0_2px_8px_rgba(37,99,235,0.35)]',
    'hover:shadow-[0_4px_16px_rgba(37,99,235,0.45)] hover:scale-[1.02]',
    'active:scale-[0.98]',
  ].join(' '),
  neutral: [
    'bg-[var(--color-surface-bg)] text-[var(--color-text-primary)]',
    'border-[var(--color-border-primary)]',
    'hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-border-secondary)]',
    'active:scale-[0.98]',
  ].join(' '),
  subtle: [
    'bg-transparent text-[var(--color-text-secondary)] border-transparent',
    'hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]',
    'active:scale-[0.98]',
  ].join(' '),
  danger: [
    'bg-[var(--color-danger)] text-white border-transparent',
    'shadow-[0_2px_8px_rgba(220,38,38,0.25)]',
    'hover:opacity-90 hover:shadow-[0_4px_12px_rgba(220,38,38,0.35)]',
    'active:scale-[0.98]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--color-brand-primary)] border-[var(--color-brand-primary)]',
    'hover:bg-[var(--color-brand-muted)]',
    'active:scale-[0.98]',
  ].join(' '),
  success: [
    'bg-[var(--color-success)] text-white border-transparent',
    'shadow-[0_2px_8px_rgba(22,163,74,0.25)]',
    'hover:opacity-90',
    'active:scale-[0.98]',
  ].join(' '),
}

const sizeStyles: Record<string, string> = {
  xs: 'px-[var(--space-sm)] py-[var(--space-xs)] text-[11px] gap-[var(--space-xs)] rounded-[var(--radius-md)]',
  sm: 'px-[var(--space-md)] py-[var(--space-xs)] text-[length:var(--text-body-size)] gap-[var(--space-xs)]',
  md: 'px-[var(--space-xl)] py-[var(--space-sm)] text-[length:var(--text-label-size)] gap-[var(--space-sm)]',
  lg: 'px-[var(--space-2xl)] py-[var(--space-md)] text-[length:var(--text-heading-size)] gap-[var(--space-md)]',
}

export function Button({
  variant = 'neutral', size = 'md', iconStart, iconEnd, loading,
  children, className = '', disabled, ...rest
}: ButtonProps) {
  const isPrimary = variant === 'primary'

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-medium border transition-all duration-200 whitespace-nowrap select-none',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none',
        size === 'xs' || size === 'sm' ? '' : 'rounded-[var(--radius-full)]',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
      style={
        isPrimary
          ? { background: 'var(--gradient-brand)', fontFamily: 'var(--font-sans)' }
          : { fontFamily: 'var(--font-sans)' }
      }
    >
      {loading ? (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : iconStart}
      {children && <span>{children}</span>}
      {!loading && iconEnd}
    </button>
  )
}
