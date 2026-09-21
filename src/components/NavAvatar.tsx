import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { LogOut, ChevronDown, User } from 'lucide-react'

const ROLE_STYLE = {
  ADMIN:   { color: 'var(--color-danger)',        bg: 'var(--color-danger-bg)' },
  ANALYST: { color: 'var(--color-info)',           bg: 'var(--color-info-bg)' },
  PUBLIC:  { color: 'var(--color-brand-primary)',  bg: 'var(--color-brand-muted)' },
}

const PLAN_LABEL = {
  ADMIN: 'Admin', GOVERNMENT: 'Analyst', SUBSCRIBER: 'Subscribed', FREE: 'User'
}

export default function NavAvatar() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!user) return null

  const st = ROLE_STYLE[user.role] ?? ROLE_STYLE['PUBLIC']

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px 4px 4px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--color-border-primary)',
          background: 'var(--color-surface-bg)',
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
        }}>
          {user.initials}
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{user.name}</div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: st.color }}>{PLAN_LABEL[user.plan]}</div>
        </div>
        <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 200,
          background: 'var(--color-surface-bg)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-primary)',
          boxShadow: 'var(--shadow-floating)',
          overflow: 'hidden', zIndex: 100,
        }}>
          {/* User info */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{user.email}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: st.color, background: st.bg, padding: '2px 6px', borderRadius: 3 }}>
                {user.role === 'PUBLIC' ? 'USER' : user.role} · {user.plan === 'FREE' ? 'Standard' : PLAN_LABEL[user.plan]}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: '6px 0' }}>
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--color-text-secondary)',
              }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <User size={14} />
              Profile
            </button>
            <button
              onClick={() => { logout(); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 14px', border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--color-danger)',
              }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-bg)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
