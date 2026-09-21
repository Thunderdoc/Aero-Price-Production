import { useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, Plane, ShieldCheck, User, Users } from 'lucide-react'
import { useAuth, type UserRole } from '../contexts/AuthContext'
import type { Page } from '../components/AppShell'
import airportBg from '../assets/airport_login_bg.jpg'
import mocaLogo from '../assets/moca_logo.png'

type AuthRole = 'USER' | 'TGC' | 'ADMIN'

const ROLE_CONFIG: Record<AuthRole, {
  label: string
  expectedRoles: UserRole[]
  emailLabel: string
  emailPlaceholder: string
  buttonLabel: string
  loadingLabel: string
  destination: Page
}> = {
  USER: {
    label: 'User',
    expectedRoles: ['PUBLIC'],
    emailLabel: 'Email Address',
    emailPlaceholder: 'your@email.com',
    buttonLabel: 'Sign In',
    loadingLabel: 'Signing in...',
    destination: 'overview',
  },
  TGC: {
    label: 'TGC',
    expectedRoles: ['ANALYST'],
    emailLabel: 'TGC ID / Email',
    emailPlaceholder: 'tgc@organization.in',
    buttonLabel: 'TGC Sign In',
    loadingLabel: 'Authenticating...',
    destination: 'government',
  },
  ADMIN: {
    label: 'Admin',
    expectedRoles: ['ADMIN'],
    emailLabel: 'Admin Email / ID',
    emailPlaceholder: 'admin@aeroprice.in',
    buttonLabel: 'Admin Sign In',
    loadingLabel: 'Verifying access...',
    destination: 'admin',
  },
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function safeAuthError(message?: string) {
  if (!message) return 'Incorrect email or password.'
  if (/network|fetch|connect/i.test(message)) return 'Unable to connect. Please try again.'
  return 'Incorrect email or password.'
}

export default function LoginPage({ onLogin }: { onLogin: (page?: Page) => void }) {
  const { login, loginWithGoogle, logout } = useAuth()
  const [activeRole, setActiveRole] = useState<AuthRole>('USER')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const role = ROLE_CONFIG[activeRole]

  const submitLabel = useMemo(
    () => (loading ? role.loadingLabel : role.buttonLabel),
    [loading, role.buttonLabel, role.loadingLabel],
  )

  function resetFeedback() {
    setError('')
    setNotice('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    resetFeedback()

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Email address is required.')
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Invalid email address.')
      return
    }
    if (!pass) {
      setError('Password is required.')
      return
    }

    setLoading(true)
    const result = await login(trimmedEmail, pass)
    setLoading(false)

    if (!result.success) {
      setError(safeAuthError(result.error))
      return
    }

    const stored = localStorage.getItem('aeroprice_auth')
    const authedRole = stored ? JSON.parse(stored).role as UserRole : null
    if (!authedRole || !role.expectedRoles.includes(authedRole)) {
      logout()
      setError(`This account is not authorized for the ${role.label} workspace. Use the correct approved account.`)
      return
    }

    if (!rememberMe) {
      localStorage.removeItem('aeroprice_auth')
      localStorage.removeItem('aeroprice_token')
    }

    onLogin(role.destination)
  }

  async function handleGoogleAuth() {
    resetFeedback()
    setGoogleLoading(true)
    const result = await loginWithGoogle()
    setGoogleLoading(false)
    if (result.success) {
      const stored = localStorage.getItem('aeroprice_auth')
      const authedRole = stored ? JSON.parse(stored).role as UserRole : null
      if (!authedRole || !role.expectedRoles.includes(authedRole)) {
        logout()
        setError(`This Google account is not authorized for the ${role.label} workspace.`)
        return
      }
      onLogin(role.destination)
      return
    }
    setError(result.error || 'Unable to connect to Google sign-in. Please try again.')
  }

  async function handleForgotPassword(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    resetFeedback()
    if (!email.trim()) {
      setError('Enter your email address before requesting a reset.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Invalid email address.')
      return
    }
    setResetLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 350))
    setResetLoading(false)
    setNotice('Password reset is not connected yet. Ask the project admin to reset this account.')
  }

  return (
    <main className="ap-login" aria-label="AeroPrice secure login">
      <style>{`
        .ap-login {
          min-height: 100vh;
          width: 100vw;
          overflow: hidden;
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(380px, 500px);
          color: #fff;
          font-family: var(--font-sans, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
          background: #061225;
        }
        .ap-login::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url(${airportBg});
          background-size: cover;
          background-position: center bottom;
          filter: brightness(.72) saturate(1.12) contrast(1.06);
          transform: scale(1.015);
        }
        .ap-login::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(2,8,23,.86) 0%, rgba(2,8,23,.55) 48%, rgba(239,246,255,.22) 100%),
            radial-gradient(circle at 26% 30%, rgba(37,99,235,.22), transparent 34%);
        }
        .ap-left {
          position: relative;
          z-index: 1;
          padding: clamp(28px, 4vw, 64px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 100vh;
        }
        .ap-brand {
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .ap-brand-icon {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: linear-gradient(135deg, #087cfb, #16b9ff);
          box-shadow: 0 16px 40px rgba(8,124,251,.35);
        }
        .ap-brand-name {
          font-size: 30px;
          font-weight: 950;
          letter-spacing: -.045em;
          line-height: .95;
        }
        .ap-brand-sub {
          margin-top: 5px;
          color: rgba(239,246,255,.88);
          font-size: 14px;
          font-weight: 600;
        }
        .ap-hero {
          max-width: 720px;
          margin: auto 0;
        }
        .ap-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(15,23,42,.52);
          border: 1px solid rgba(147,197,253,.26);
          color: #bfdbfe;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          backdrop-filter: blur(12px);
          margin-bottom: 20px;
        }
        .ap-hero h1 {
          margin: 0;
          font-size: clamp(42px, 5vw, 78px);
          line-height: 1.02;
          letter-spacing: -.06em;
          font-weight: 950;
          text-shadow: 0 22px 70px rgba(0,0,0,.45);
        }
        .ap-hero h1 span {
          color: #37a5ff;
        }
        .ap-hero p {
          max-width: 620px;
          margin: 18px 0 0;
          color: rgba(226,232,240,.9);
          font-size: clamp(16px, 1.2vw, 20px);
          line-height: 1.5;
        }
        .ap-foot {
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          color: rgba(219,234,254,.84);
          font-size: 13px;
          border-top: 1px solid rgba(226,232,240,.16);
          padding-top: 18px;
        }
        .ap-panel {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(18px, 3vw, 40px);
        }
        .ap-card {
          width: 100%;
          border-radius: 24px;
          background: rgba(255,255,255,.94);
          color: #0f172a;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 34px 90px rgba(2,8,23,.28);
          backdrop-filter: blur(22px);
          padding: 28px;
        }
        .ap-ministry {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 26px;
        }
        .ap-ministry img {
          height: 48px;
          object-fit: contain;
        }
        .ap-prototype {
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: .08em;
          text-transform: uppercase;
          padding: 5px 8px;
          border-radius: 999px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          white-space: nowrap;
        }
        .ap-card h2 {
          margin: 0;
          color: #050816;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: -.045em;
          font-weight: 950;
        }
        .ap-card-sub {
          margin: 8px 0 22px;
          color: #526079;
          font-size: 15px;
          line-height: 1.42;
        }
        .ap-tabs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          padding: 5px;
          border-radius: 14px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          margin-bottom: 20px;
        }
        .ap-tab {
          height: 42px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #475569;
          font-weight: 850;
          cursor: pointer;
        }
        .ap-tab.active {
          background: #fff;
          color: #075be8;
          box-shadow: 0 8px 20px rgba(15,23,42,.08);
        }
        .ap-message {
          display: flex;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.4;
          margin-bottom: 14px;
        }
        .ap-message.error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
        }
        .ap-message.notice {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
        }
        .ap-field {
          margin-bottom: 15px;
        }
        .ap-field label {
          display: block;
          margin-bottom: 8px;
          color: #0f1b46;
          font-size: 13px;
          font-weight: 850;
        }
        .ap-input-wrap {
          position: relative;
        }
        .ap-input-wrap > svg:first-child {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #7783a5;
        }
        .ap-input {
          width: 100%;
          height: 50px;
          border-radius: 13px;
          border: 1px solid #cbd5e1;
          background: #fff;
          padding: 0 46px;
          box-sizing: border-box;
          font-size: 15px;
          color: #0f172a;
          outline: none;
        }
        .ap-input:focus {
          border-color: #087cfb;
          box-shadow: 0 0 0 4px rgba(8,124,251,.12);
        }
        .ap-eye {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          border: 0;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
        }
        .ap-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin: 2px 0 18px;
          color: #526079;
          font-size: 13px;
        }
        .ap-meta label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .ap-meta input {
          width: 18px;
          height: 18px;
          accent-color: #087cfb;
        }
        .ap-meta a {
          color: #075be8;
          font-weight: 750;
        }
        .ap-submit, .ap-google {
          width: 100%;
          min-height: 52px;
          border-radius: 13px;
          font-weight: 850;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .ap-submit {
          border: 0;
          color: #fff;
          background: linear-gradient(135deg, #0b91ff, #075be8);
          box-shadow: 0 15px 30px rgba(8,124,251,.25);
        }
        .ap-google {
          border: 1px solid #b9c5e6;
          background: #fff;
          color: #091052;
          margin-top: 14px;
        }
        .ap-submit:disabled, .ap-google:disabled {
          opacity: .65;
          cursor: not-allowed;
        }
        .ap-security {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid #e2e8f0;
          color: #526079;
          font-size: 11px;
          line-height: 1.25;
        }
        .ap-security div {
          display: flex;
          gap: 7px;
          align-items: center;
        }
        .ap-security svg {
          color: #087cfb;
          flex: 0 0 auto;
        }
        button:focus-visible, a:focus-visible, input:focus-visible {
          outline: 3px solid rgba(8,124,251,.35);
          outline-offset: 2px;
        }
        @media (max-width: 860px) {
          .ap-login {
            display: flex;
            flex-direction: column;
            overflow-y: auto;
          }
          .ap-panel {
            order: 1;
            min-height: auto;
            padding: 18px;
          }
          .ap-left {
            order: 2;
            min-height: 420px;
            padding: 28px 20px;
          }
          .ap-hero h1 {
            font-size: clamp(34px, 11vw, 48px);
          }
          .ap-card {
            padding: 22px;
          }
          .ap-security {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className="ap-left" aria-label="AeroPrice platform overview">
        <header className="ap-brand">
          <div className="ap-brand-icon" aria-hidden="true">
            <Plane size={27} style={{ transform: 'rotate(-28deg)' }} />
          </div>
          <div>
            <div className="ap-brand-name">
              Aero<span style={{ color: '#2da2ff' }}>Price</span>
            </div>
            <div className="ap-brand-sub">India Airfare Intelligence Platform</div>
          </div>
        </header>

        <div className="ap-hero">
          <div className="ap-pill">
            <Plane size={15} aria-hidden="true" />
            SIH 2026 Prototype · Aviation Intelligence
          </div>
          <h1>
            Smarter airfare<br />
            access for a<br />
            <span>connected India</span>
          </h1>
          <p>
            Route-level fare intelligence, aviation data views, and policy-ready analytics for India&apos;s domestic air travel ecosystem.
          </p>
        </div>

        <footer className="ap-foot">
          <span>✈ Route intelligence</span>
          <span>◈ Secure role access</span>
          <span>◎ User, TGC and Admin workspaces</span>
        </footer>
      </section>

      <section className="ap-panel" aria-label="Authentication panel">
        <div className="ap-card">
          <div className="ap-ministry">
            <img src={mocaLogo} alt="Ministry of Civil Aviation, Government of India" />
            <span className="ap-prototype">SIH Prototype</span>
          </div>

          <h2>Welcome back</h2>
          <p className="ap-card-sub">Sign in to access your AeroPrice workspace.</p>

          <div className="ap-tabs" role="tablist" aria-label="Choose workspace role">
            {(Object.keys(ROLE_CONFIG) as AuthRole[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeRole === key}
                className={`ap-tab${activeRole === key ? ' active' : ''}`}
                onClick={() => { setActiveRole(key); resetFeedback() }}
              >
                {ROLE_CONFIG[key].label}
              </button>
            ))}
          </div>

          {error && (
            <div className="ap-message error" role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="ap-message notice" role="status">
              <AlertCircle size={17} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="ap-field">
              <label htmlFor="ap-email">{role.emailLabel}</label>
              <div className="ap-input-wrap">
                <Mail size={18} aria-hidden="true" />
                <input
                  id="ap-email"
                  className="ap-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={role.emailPlaceholder}
                />
              </div>
            </div>

            <div className="ap-field">
              <label htmlFor="ap-password">Password</label>
              <div className="ap-input-wrap">
                <Lock size={18} aria-hidden="true" />
                <input
                  id="ap-password"
                  className="ap-input"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  className="ap-eye"
                  type="button"
                  onClick={() => setShowPass((value) => !value)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="ap-meta">
              <label>
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                Remember me
              </label>
              <a href="#forgot-password" onClick={handleForgotPassword}>
                {resetLoading ? 'Checking...' : 'Forgot password?'}
              </a>
            </div>

            <button className="ap-submit" type="submit" disabled={loading}>
              {submitLabel}
              {!loading && <ArrowRight size={19} aria-hidden="true" />}
            </button>
          </form>

          <button className="ap-google" type="button" onClick={handleGoogleAuth} disabled={googleLoading}>
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>

          <div className="ap-security" aria-label="Security notes">
            <div><ShieldCheck size={22} /><span>Secure<br />access</span></div>
            <div><Users size={22} /><span>Role-based<br />workspaces</span></div>
            <div><User size={22} /><span>Public user<br />registration</span></div>
          </div>
        </div>
      </section>
    </main>
  )
}
