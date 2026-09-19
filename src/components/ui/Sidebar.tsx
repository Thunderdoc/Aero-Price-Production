import type { ReactNode } from 'react'

interface SidebarButtonProps {
  icon: ReactNode
  active?: boolean
  label: string
  badge?: string
  onClick: () => void
  isSection?: boolean
}

export function SidebarButton({ icon, active, label, badge, onClick }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={[
        'w-full flex items-center gap-[var(--space-md)] rounded-[var(--radius-md)] transition-all duration-200',
        'focus-visible:outline-2 focus-visible:outline-[var(--color-brand-light)] focus-visible:outline-offset-1',
        'relative group',
        active
          ? 'bg-[var(--color-brand-primary)] text-white shadow-[var(--glow-brand)]'
          : 'text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.07)] hover:text-[rgba(255,255,255,0.9)]',
      ].join(' ')}
      style={{ padding: 'var(--space-sm) var(--space-md)', height: 36 }}
    >
      <span className="shrink-0 flex items-center justify-center" style={{ width: 18 }}>{icon}</span>
      <span
        className="text-left truncate"
        style={{
          fontSize: 'var(--text-body-size)',
          fontWeight: active ? 600 : 400,
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.3,
          flex: 1,
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            background: active ? 'rgba(255,255,255,0.25)' : 'var(--color-brand-primary)',
            color: 'white',
            borderRadius: 'var(--radius-full)',
            padding: '0 5px',
            lineHeight: '16px',
            minWidth: 16,
            textAlign: 'center',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export function SidebarSection({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.28)',
        padding: 'var(--space-lg) var(--space-md) var(--space-xs)',
      }}
    >
      {label}
    </div>
  )
}

interface SidebarNavigationProps {
  children: ReactNode
  footer?: ReactNode
}

export function SidebarNavigation({ children, footer }: SidebarNavigationProps) {
  return (
    <nav
      className="flex flex-col shrink-0 overflow-y-auto"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--color-surface-dark)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
      aria-label="Primary navigation"
    >
      {/* Logo */}
      <div
        style={{
          padding: 'var(--space-xl) var(--space-xl) var(--space-lg)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center" style={{ gap: 'var(--space-md)' }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-md)',
              background: 'var(--gradient-brand)',
              boxShadow: 'var(--glow-brand)',
            }}
          >
            <span style={{ color: 'white', fontWeight: 800, fontSize: 13, fontFamily: 'var(--font-sans)' }}>A</span>
          </div>
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-sans)', lineHeight: 1.2 }}>AeroPrice</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400, fontSize: 10, fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>INDIA</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex flex-col flex-1" style={{ padding: 'var(--space-md)' }}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div
          className="flex flex-col"
          style={{
            padding: 'var(--space-md)',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            gap: 'var(--space-xs)',
          }}
        >
          {footer}
        </div>
      )}
    </nav>
  )
}
