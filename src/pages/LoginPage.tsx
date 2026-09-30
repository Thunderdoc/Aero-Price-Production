import { useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle, Eye, EyeOff, Lock, Mail, Plane, ShieldCheck, User, Users } from 'lucide-react'
import { useAuth, type AuthWorkspace, type UserRole } from '../contexts/AuthContext'
import type { Page } from '../components/AppShell'

type AuthRole = 'USER' | 'DGCA' | 'ADMIN'
const airportBg = '/airport-login-bg.jpg'

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
  DGCA: {
    label: 'DGCA',
    expectedRoles: ['ANALYST'],
    emailLabel: 'DGCA ID / Email',
    emailPlaceholder: 'dgca@organization.in',
    buttonLabel: 'DGCA Sign In',
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
  const { login, loginWithGoogle, createAccount, resetPassword, logout } = useAuth()
  const [activeRole, setActiveRole] = useState<AuthRole>('USER')
  const [authMode, setAuthMode] = useState<'login' | 'create'>('login')
  const [fullName, setFullName] = useState('')
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
  const workspace = activeRole as AuthWorkspace

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

    if (authMode === 'create') {
      if (!fullName.trim()) {
        setError('Full name is required.')
        return
      }
      if (pass.length < 6) {
        setError('Password should be at least 6 characters.')
        return
      }
      setLoading(true)
      const result = await createAccount(fullName.trim(), trimmedEmail, pass, workspace)
      setLoading(false)
      if (!result.success) {
        setError(result.error || 'Unable to create account.')
        return
      }
      setAuthMode('login')
      setPass('')
      setNotice(`Account created for ${trimmedEmail}. You can sign in now.`)
      return
    }

    setLoading(true)
    const result = await login(trimmedEmail, pass, rememberMe, workspace)
    setLoading(false)

    if (!result.success) {
      setError(result.error?.includes('verified') || result.error?.includes('Firebase') ? result.error : safeAuthError(result.error))
      return
    }

    const authedRole = result.user?.role ?? null
    if (!authedRole || !role.expectedRoles.includes(authedRole)) {
      logout()
      setError(`This account is not authorized for the ${role.label} workspace. Use the correct approved account.`)
      return
    }

    onLogin(role.destination)
  }

  async function handleGoogleAuth() {
    resetFeedback()
    setGoogleLoading(true)
    const result = await loginWithGoogle(workspace, pass)
    setGoogleLoading(false)
    if (result.success) {
      const stored = localStorage.getItem('aeroprice_auth')
      const authedRole = stored ? JSON.parse(stored).role as UserRole : null
      // Redirect-based Google auth navigates away before the Firebase result
      // can be stored. The AuthProvider restores it when the app returns.
      if (!stored) return
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
    const result = await resetPassword(email)
    setResetLoading(false)
    if (!result.success) {
      setError(result.error || 'Unable to send reset email.')
      return
    }
    setNotice(`Account found for ${email.trim()}. A secure password reset email has been sent to that inbox.`)
  }

  return (
    <main
      className="ap-login"
      aria-label="AeroPrice secure login"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(2,8,23,.72), rgba(2,8,23,.38)), url(${airportBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center bottom',
      }}
    >
      <img className="ap-bg-media" src={airportBg} alt="" aria-hidden="true" />
      <style>{`
        .ap-login {
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(360px, 480px);
          color: #fff;
          font-family: var(--font-sans, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
          background-color: #061225;
          background-image: linear-gradient(90deg, rgba(2,8,23,.72), rgba(2,8,23,.38)), url(${airportBg});
          background-size: cover;
          background-position: center bottom;
        }
        .ap-bg-media {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center bottom;
          filter: brightness(.92) saturate(1.18) contrast(1.08);
          transform: scale(1.015);
          animation: bg-kenburns 18s ease-in-out infinite alternate;
          pointer-events: none;
        }
        .ap-login::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(2,8,23,.72) 0%, rgba(2,8,23,.38) 48%, rgba(239,246,255,.16) 100%),
            radial-gradient(circle at 26% 30%, rgba(37,99,235,.16), transparent 34%);
        }
        .ap-login::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: linear-gradient(90deg, rgba(0,0,0,.65), transparent 68%);
        }
        .ap-left {
          position: relative;
          z-index: 1;
          padding: clamp(22px, 3.2vw, 54px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 0;
          height: 100vh;
          animation: login-rise .7s ease both;
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
          animation: float-badge 4.8s ease-in-out infinite;
        }
        .ap-brand-name {
          font-size: clamp(26px, 2vw, 30px);
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
          margin-bottom: clamp(12px, 2vh, 20px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 16px 40px rgba(2,8,23,.22);
        }
        .ap-hero h1 {
          margin: 0;
          font-size: clamp(36px, 4.2vw, 66px);
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
          margin: 14px 0 0;
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
        .ap-team-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 18px;
          border: 1px solid rgba(147,197,253,.55);
          border-radius: 12px;
          color: #fff;
          background: linear-gradient(135deg, rgba(8,124,251,.92), rgba(37,99,235,.78));
          font-weight: 800;
          text-decoration: none;
          font-size: 14px;
          letter-spacing: .01em;
          box-shadow: 0 10px 24px rgba(2,8,23,.28), inset 0 1px 0 rgba(255,255,255,.2);
          transition: background .2s ease, transform .2s ease, box-shadow .2s ease;
        }
        .ap-team-link:hover {
          color: #fff;
          background: linear-gradient(135deg, rgba(14,165,233,.98), rgba(37,99,235,.95));
          transform: translateY(-2px);
          box-shadow: 0 14px 28px rgba(2,8,23,.34), inset 0 1px 0 rgba(255,255,255,.24);
        }
        .ap-panel {
          position: relative;
          z-index: 1;
          min-height: 0;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(14px, 2.4vw, 34px);
          animation: panel-slide .65s ease both;
        }
        .ap-card {
          width: 100%;
          border-radius: 26px;
          background: rgba(255,255,255,.94);
          color: #0f172a;
          border: 1px solid rgba(255,255,255,.65);
          box-shadow: 0 34px 90px rgba(2,8,23,.28);
          backdrop-filter: blur(22px);
          padding: clamp(16px, 1.8vw, 22px);
          max-height: calc(100vh - 28px);
          overflow: hidden;
          position: relative;
        }
        .ap-card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          background:
            radial-gradient(circle at 18% 0%, rgba(59,130,246,.11), transparent 28%),
            radial-gradient(circle at 100% 8%, rgba(14,165,233,.09), transparent 24%);
        }
        .ap-card > * { position: relative; z-index: 1; }
        .ap-ministry {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 10px;
        }
        .ap-ministry-logo {
          width: clamp(96px, 8vw, 122px);
          height: 98px;
          display: block;
          border-radius: 12px;
          object-fit: cover;
          object-position: center 28%;
          background: rgba(255,255,255,.72);
          border: 1px solid rgba(226,232,240,.8);
        }
        .ap-card.is-create {
          padding: 14px 18px;
        }
        .ap-card.is-create .ap-ministry {
          align-items: center;
          margin-bottom: 10px;
        }
        .ap-card.is-create .ap-ministry-logo {
          width: 88px;
          height: 74px;
        }
        .ap-card.is-create .ap-card-sub {
          margin-bottom: 10px;
          font-size: 14px;
        }
        .ap-card.is-create .ap-tabs,
        .ap-card.is-create .ap-mode-toggle {
          margin-bottom: 9px;
        }
        .ap-card.is-create .ap-field {
          margin-bottom: 8px;
        }
        .ap-card.is-create .ap-input {
          height: 43px;
        }
        .ap-card.is-create .ap-security {
          display: none;
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
          font-size: clamp(24px, 3.2vh, 30px);
          line-height: 1.05;
          letter-spacing: -.045em;
          font-weight: 950;
        }
        .ap-card-sub {
          margin: 4px 0 10px;
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
          margin-bottom: 10px;
          box-shadow: inset 0 1px 2px rgba(15,23,42,.04);
        }
        .ap-mode-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 5px;
          border-radius: 14px;
          background: #eef6ff;
          border: 1px solid #bfdbfe;
          margin-bottom: 10px;
          box-shadow: inset 0 1px 2px rgba(37,99,235,.07);
        }
        .ap-mode-toggle button {
          height: 34px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #475569;
          font-weight: 850;
          cursor: pointer;
        }
        .ap-mode-toggle button.active {
          background: #fff;
          color: #075be8;
          box-shadow: 0 8px 18px rgba(15,23,42,.08);
        }
        .ap-tab {
          height: clamp(34px, 4.6vh, 40px);
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
          margin-bottom: clamp(8px, 1.3vh, 12px);
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
          margin-bottom: 8px;
        }
        .ap-field label {
          display: block;
          margin-bottom: 6px;
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
          height: 43px;
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
          margin: 2px 0 10px;
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
          min-height: 45px;
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
          position: relative;
          overflow: hidden;
        }
        .ap-submit::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(110deg, transparent 15%, rgba(255,255,255,.22), transparent 52%);
          transform: translateX(-120%);
          transition: transform .55s ease;
        }
        .ap-submit:hover::after {
          transform: translateX(120%);
        }
        .ap-google {
          border: 1px solid #b9c5e6;
          background: #fff;
          color: #091052;
          margin-top: 10px;
          box-shadow: 0 10px 26px rgba(15,23,42,.08);
        }
        .ap-submit:disabled, .ap-google:disabled {
          opacity: .65;
          cursor: not-allowed;
        }
        .ap-security {
          display: none;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: clamp(8px, 1.5vh, 14px);
          padding-top: clamp(8px, 1.4vh, 12px);
          border-top: 1px solid #e2e8f0;
          color: #526079;
          font-size: 11px;
          line-height: 1.25;
        }
        .ap-security div {
          display: flex;
          gap: 7px;
          align-items: center;
          justify-content: center;
          text-align: left;
          min-width: 0;
        }
        .ap-security span {
          white-space: normal;
        }
        .ap-security svg {
          color: #087cfb;
          flex: 0 0 auto;
        }
        html.dark .ap-login::after {
          background:
            linear-gradient(90deg, rgba(2,8,23,.84) 0%, rgba(2,8,23,.62) 48%, rgba(5,13,28,.60) 100%),
            radial-gradient(circle at 26% 30%, rgba(37,99,235,.22), transparent 34%);
        }
        html.dark .ap-card {
          background: rgba(22,32,50,.96);
          color: var(--color-text-primary);
          border-color: rgba(148,163,184,.26);
          box-shadow: 0 34px 90px rgba(0,0,0,.45);
        }
        html.dark .ap-card::before {
          background: radial-gradient(circle at 18% 0%, rgba(59,130,246,.16), transparent 28%), radial-gradient(circle at 100% 8%, rgba(14,165,233,.10), transparent 24%);
        }
        html.dark .ap-ministry-logo { background: rgba(30,41,59,.80); border-color: rgba(148,163,184,.22); }
        html.dark .ap-prototype { color: #cbd5e1; background: #263347; border-color: rgba(148,163,184,.22); }
        html.dark .ap-card h2,
        html.dark .ap-field label { color: #f8fbff; }
        html.dark .ap-card-sub,
        html.dark .ap-meta { color: #b8c7db; }
        html.dark .ap-tabs { background: #111c2e; border-color: rgba(148,163,184,.22); }
        html.dark .ap-mode-toggle { background: #102a4d; border-color: rgba(96,165,250,.30); }
        html.dark .ap-tab,
        html.dark .ap-mode-toggle button { color: #bfcee3; }
        html.dark .ap-tab.active,
        html.dark .ap-mode-toggle button.active { background: #263347; color: #78b7ff; box-shadow: 0 8px 18px rgba(0,0,0,.22); }
        html.dark .ap-input { background: #111c2e; border-color: rgba(148,163,184,.30); color: #f8fbff; }
        html.dark .ap-input::placeholder { color: #8293aa; }
        html.dark .ap-input-wrap > svg:first-child,
        html.dark .ap-eye { color: #a7b8ce; }
        html.dark .ap-google { background: #263347; border-color: rgba(148,163,184,.34); color: #f8fbff; box-shadow: 0 10px 26px rgba(0,0,0,.20); }
        html.dark .ap-security { border-top-color: rgba(148,163,184,.22); color: #b8c7db; }
        button:focus-visible, a:focus-visible, input:focus-visible {
          outline: 3px solid rgba(8,124,251,.35);
          outline-offset: 2px;
        }
        .ap-submit:hover, .ap-google:hover, .ap-tab:hover {
          transform: translateY(-1px);
        }
        @keyframes bg-kenburns {
          from { transform: scale(1.015) translate3d(0,0,0); }
          to { transform: scale(1.055) translate3d(-10px,-6px,0); }
        }
        @keyframes login-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes panel-slide {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes float-badge {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-5px) rotate(-2deg); }
        }
        @keyframes sweep-light {
          0%, 45% { transform: translateX(-100%); }
          70%, 100% { transform: translateX(100%); }
        }
        @media (max-height: 760px) and (min-width: 861px) {
          .ap-foot { padding-top: 10px; font-size: 12px; gap: 12px; }
          .ap-pill { margin-bottom: 10px; padding: 7px 10px; }
          .ap-hero h1 { font-size: clamp(34px, 3.7vw, 56px); }
          .ap-hero p { font-size: 15px; max-width: 560px; }
          .ap-card { padding: 18px; }
          .ap-security { grid-template-columns: repeat(3, 1fr); gap: 5px; }
          .ap-security div { justify-content: center; font-size: 10px; }
          .ap-security span br { display: none; }
        }
        @media (max-height: 660px) and (min-width: 861px) {
          .ap-ministry-logo { width: 120px; }
          .ap-card-sub { display: none; }
          .ap-security { display: none; }
          .ap-brand-sub, .ap-foot { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ap-bg-media, .ap-left, .ap-panel, .ap-brand-icon {
            animation: none !important;
          }
          .ap-submit:hover, .ap-google:hover, .ap-tab:hover {
            transform: none;
          }
        }
        @media (max-width: 860px) {
          .ap-login {
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            height: auto;
            min-height: 100vh;
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
          .ap-team-link {
            width: 100%;
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
            SIH 2026 · Aviation Intelligence
          </div>
          <h1>
            Smarter airfare<br />
            access for a<br />
            <span>connected India</span>
          </h1>
          <p>
            Secure airfare intelligence for users, DGCA analysts, and administrators.
          </p>
        </div>

        <footer className="ap-foot">
          <span>✈ Route intelligence</span>
          <span>◈ Secure access</span>
          <span>◎ DGCA workspace</span>
          <a className="ap-team-link" href="https://99240040193.github.io/aero-price-production_our_team_details/" target="_blank" rel="noreferrer">Meet the team ↗</a>
        </footer>
      </section>

      <section className="ap-panel" aria-label="Authentication panel">
        <div className={`ap-card${authMode === 'create' ? ' is-create' : ''}`}>
          <div className="ap-ministry">
            <img className="ap-ministry-logo" src="/moca-badge.png" alt="Ministry of Civil Aviation, Government of India" />
            <span className="ap-prototype">SIH Prototype</span>
          </div>

          <h2>Welcome back</h2>
          <p className="ap-card-sub">{authMode === 'login' ? 'Sign in to access AeroPrice.' : 'Create your verified AeroPrice account.'}</p>

          <div className="ap-tabs" role="tablist" aria-label="Choose workspace role">
            {(Object.keys(ROLE_CONFIG) as AuthRole[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeRole === key}
                className={`ap-tab${activeRole === key ? ' active' : ''}`}
                onClick={() => { setActiveRole(key); if (key === 'ADMIN') setAuthMode('login'); resetFeedback() }}
              >
                {ROLE_CONFIG[key].label}
              </button>
            ))}
          </div>

          <div className="ap-mode-toggle" aria-label="Choose auth mode">
            <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); resetFeedback() }}>Sign in</button>
            {activeRole !== 'ADMIN' && (
              <button type="button" className={authMode === 'create' ? 'active' : ''} onClick={() => { setAuthMode('create'); resetFeedback() }}>Create account</button>
            )}
            {activeRole === 'ADMIN' && (
              <button type="button" disabled style={{ opacity: 0.45, cursor: 'not-allowed' }}>Admin by invite</button>
            )}
          </div>

          {error && (
            <div className="ap-message error" role="alert">
              <AlertCircle size={17} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="ap-message notice" role="status">
              <CheckCircle size={17} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {authMode === 'create' && (
              <div className="ap-field">
                <label htmlFor="ap-name">Full Name</label>
                <div className="ap-input-wrap">
                  <User size={18} aria-hidden="true" />
                  <input
                    id="ap-name"
                    className="ap-input"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              </div>
            )}
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
                  autoComplete={authMode === 'create' ? 'new-password' : 'current-password'}
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
              {authMode === 'login' ? <a href="#forgot-password" onClick={handleForgotPassword}>
                {resetLoading ? 'Checking...' : 'Forgot password?'}
              </a> : <button type="button" onClick={() => { setAuthMode('login'); resetFeedback() }} style={{ border: 0, background: 'transparent', color: '#075be8', fontWeight: 750, cursor: 'pointer', padding: 0 }}>Have an account?</button>}
            </div>

            <button className="ap-submit" type="submit" disabled={loading}>
              {authMode === 'create' ? (loading ? 'Creating account...' : 'Create Account') : submitLabel}
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
            <div><ShieldCheck size={22} /><span>Secure access</span></div>
            <div><Users size={22} /><span>Role-based workspaces</span></div>
            <div><User size={22} /><span>Public user registration</span></div>
          </div>
        </div>
      </section>
    </main>
  )
}
