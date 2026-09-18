import type { ReactNode } from 'react'

interface SidebarButtonProps {
  icon: ReactNode
  active?: boolean
  label: string
  onClick: () => void
}

export function SidebarButton({ icon, active, label, onClick }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={[
        'w-full flex items-center justify-center rounded-[var(--radius-md)] transition-all duration-[var(--transition-base)]',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2',
        active
          ? 'bg-[var(--color-brand-primary)] text-white'
          : 'text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.08)] hover:text-white',
      ].join(' ')}
      style={{ width: 40, height: 40 }}
    >
      {icon}
    </button>
  )
}

interface SidebarNavigationProps {
  children: ReactNode
  footer?: ReactNode
}

export function SidebarNavigation({ children, footer }: SidebarNavigationProps) {
  return (
    <nav
      className="flex flex-col items-center py-[var(--space-lg)] border-r border-[rgba(255,255,255,0.08)] shrink-0"
      style={{ width: 'var(--sidebar-width)', background: 'var(--color-surface-dark)' }}
      aria-label="Primary navigation"
    >
      {/* Logo mark */}
      <div className="mb-[var(--space-xl)] flex items-center justify-center">
        <div
          className="flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-primary)]"
          style={{ width: 32, height: 32 }}
        >
          <span className="text-white font-bold" style={{ fontSize: 14, fontFamily: 'var(--font-sans)' }}>A</span>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-[var(--space-xs)] flex-1 w-full px-[var(--space-md)]">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="flex flex-col gap-[var(--space-xs)] w-full px-[var(--space-md)] pt-[var(--space-lg)] border-t border-[rgba(255,255,255,0.08)]">
          {footer}
        </div>
      )}
    </nav>
  )
}
