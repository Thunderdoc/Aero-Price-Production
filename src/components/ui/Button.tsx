import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'neutral' | 'subtle' | 'danger'
  size?: 'sm' | 'md'
  iconStart?: ReactNode
  iconEnd?: ReactNode
  children?: ReactNode
}

const variantStyles: Record<string, string> = {
  primary: 'bg-[var(--color-brand-primary)] text-[var(--color-text-on-brand)] hover:bg-[var(--color-brand-secondary)] border-transparent',
  neutral: 'bg-[var(--color-surface-bg)] text-[var(--color-text-primary)] border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)]',
  subtle:  'bg-transparent text-[var(--color-text-secondary)] border-transparent hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]',
  danger:  'bg-[var(--color-danger)] text-white hover:opacity-90 border-transparent',
}

const sizeStyles: Record<string, string> = {
  sm: 'px-[var(--space-md)] py-[var(--space-xs)] text-[length:var(--text-body-size)] gap-[var(--space-xs)]',
  md: 'px-[var(--space-xl)] py-[var(--space-md)] text-[length:var(--text-label-size)] gap-[var(--space-sm)]',
}

export function Button({
  variant = 'neutral', size = 'md', iconStart, iconEnd,
  children, className = '', disabled, ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center font-[var(--text-label-weight)] rounded-[var(--radius-full)] border transition-all duration-[var(--transition-base)] whitespace-nowrap select-none',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
    >
      {iconStart}
      {children}
      {iconEnd}
    </button>
  )
}
