import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'

interface DemoCredential {
  label: string
  role: string
  email: string
  password: string
  color: string
}

const DEMO_CREDS: DemoCredential[] = [
  { label: 'ADMIN', role: 'Full system access', email: 'admin@aeroprice.in', password: 'aeroadmin', color: 'var(--color-danger)' },
  { label: 'ANALYST', role: 'Government intelligence', email: 'dgca@gov.in', password: 'dgca2026', color: 'var(--color-info)' },
  { label: 'SUBSCRIBER', role: 'Price tracking', email: 'user@aeroprice.in', password: 'aero123', color: 'var(--color-brand-primary)' },
  { label: 'PUBLIC', role: 'Free access', email: 'visitor@example.com', password: 'demo', color: 'var(--color-text-tertiary)' },
]

interface LoginPageProps {
  onLogin: () => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showTip, setShowTip] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    setTimeout(() => {
      const result = login(email, password)
      setIsLoading(false)
      if (result.success) {
        onLogin()
      } else {
        setError(result.error ?? 'Login failed.')
      }
    }, 400) // small artificial delay for UX
  }

  function quickLogin(cred: DemoCredential) {
    setEmail(cred.email)
    setPassword(cred.password)
    setError('')
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      fontFamily: 'var(--font-sans)',
      background: 'var(--color-surface-canvas)',
    }}>
      {/* Left brand panel */}
      <div style={{
        width: '40%',
        background: 'var(--gradient-hero)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-4xl)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background glow blobs */}
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(37,99,235,0.25)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '-10%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', filter: 'blur(50px)', pointerEvents: 'none' }} />

        {/* Logo wordmark */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }}>
            {/* Abstract logo: arc + data signal */}
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <path d="M4 28 Q18 4 32 18" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="32" cy="18" r="3" fill="rgba(255,255,255,0.9)"/>
              <line x1="8" y1="32" x2="8" y2="26" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="14" y1="32" x2="14" y2="22" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="20" y1="32" x2="20" y2="18" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="26" y1="32" x2="26" y2="16" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 700, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.08em', lineHeight: 1.2 }}>AEROPRICE</div>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em' }}>INDIA</div>
            </div>
          </div>

          <h1 style={{ fontSize: 'var(--text-display-size)', fontWeight: 700, color: 'rgba(255,255,255,0.95)', lineHeight: 1.15, marginBottom: 'var(--space-lg)', letterSpacing: '-0.02em' }}>
            Real-time visibility into India's airfare movement.
          </h1>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 'var(--space-3xl)' }}>
            Observe. Measure. Understand.
          </p>

          {/* Feature pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {[
              { icon: '⬡', label: 'Government Analytics', desc: 'DGCA-aligned statistical index with full provenance' },
              { icon: '◈', label: 'Live Route Intelligence', desc: 'Corridor-level fare movement across 20+ Indian routes' },
              { icon: '◎', label: 'Price Tracking', desc: 'Set alerts for threshold fares on any corridor' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start', background: 'rgba(255,255,255,0.07)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md) var(--space-lg)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', flexShrink: 0, lineHeight: 1.4 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 'var(--text-body-size)', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-3xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}>SIH26056 · MoSPI DIID · AEROPRICE INDIA v2.0</span>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4xl)',
        background: 'var(--color-surface-bg)',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ marginBottom: 'var(--space-3xl)' }}>
            <h2 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-xs)', letterSpacing: '-0.01em' }}>
              Sign in to AeroPrice
            </h2>
            <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)' }}>
              India's national airfare intelligence platform.
            </p>
          </div>

          {/* Quick demo role buttons */}
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', marginBottom: 'var(--space-sm)' }}>QUICK DEMO LOGIN</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
              {DEMO_CREDS.map(cred => (
                <button
                  key={cred.label}
                  type="button"
                  onClick={() => quickLogin(cred)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'var(--color-surface-secondary)',
                    border: '1px solid var(--color-border-primary)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    textAlign: 'left',
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = cred.color; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-secondary)' }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: cred.color, letterSpacing: '0.08em' }}>{cred.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{cred.role}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border-primary)' }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em' }}>OR ENTER CREDENTIALS</span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-border-primary)' }} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)', letterSpacing: '0.04em' }}>EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={{
                    width: '100%', padding: '10px var(--space-lg)',
                    background: 'var(--color-surface-secondary)',
                    border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border-primary)'}`,
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)',
                    color: 'var(--color-text-primary)', outline: 'none',
                    transition: 'border-color var(--transition-fast)',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = error ? 'var(--color-danger)' : 'var(--color-border-primary)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)', letterSpacing: '0.04em' }}>PASSWORD</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%', padding: '10px var(--space-lg)',
                    background: 'var(--color-surface-secondary)',
                    border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border-primary)'}`,
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)',
                    color: 'var(--color-text-primary)', outline: 'none',
                    transition: 'border-color var(--transition-fast)',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = error ? 'var(--color-danger)' : 'var(--color-border-primary)' }}
                />
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md) var(--space-lg)', background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-body-size)', color: 'var(--color-danger)' }}>
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" loading={isLoading} style={{ width: '100%', justifyContent: 'center' }}>
              SIGN IN
            </Button>
          </form>

          {/* Demo tip */}
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <button
              type="button"
              onClick={() => setShowTip(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', padding: 0 }}
            >
              {showTip ? '▲' : '▼'} Demo credentials reference
            </button>
            {showTip && (
              <div style={{ marginTop: 'var(--space-md)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', border: '1px solid var(--color-border-primary)' }}>
                <table style={{ width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Role', 'Email', 'Password'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '2px var(--space-sm)', color: 'var(--color-text-tertiary)', fontWeight: 600, letterSpacing: '0.06em', paddingBottom: 6 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_CREDS.map(c => (
                      <tr key={c.label}>
                        <td style={{ padding: '3px var(--space-sm)', color: c.color, fontWeight: 600 }}>{c.label}</td>
                        <td style={{ padding: '3px var(--space-sm)', color: 'var(--color-text-secondary)' }}>{c.email}</td>
                        <td style={{ padding: '3px var(--space-sm)', color: 'var(--color-text-secondary)' }}>{c.password}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: '3px var(--space-sm)', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>FREE</td>
                      <td style={{ padding: '3px var(--space-sm)', color: 'var(--color-text-tertiary)' }}>any valid email</td>
                      <td style={{ padding: '3px var(--space-sm)', color: 'var(--color-text-tertiary)' }}>demo</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
