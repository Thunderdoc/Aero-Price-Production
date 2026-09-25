import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiLogin, AUTH_EXPIRED_EVENT } from '../services/api'

export type UserRole = 'PUBLIC' | 'ANALYST' | 'ADMIN'
export type UserPlan = 'FREE' | 'SUBSCRIBER' | 'GOVERNMENT' | 'ADMIN'
export type AuthWorkspace = 'USER' | 'DGCA' | 'ADMIN'

export interface AuthUser {
  name: string
  email: string
  role: UserRole
  plan: UserPlan
  initials: string
  token?: string
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  loginWithGoogle: (workspace?: AuthWorkspace) => Promise<{ success: boolean; error?: string }>
  createAccount: (name: string, email: string, password: string, workspace?: AuthWorkspace) => Promise<{ success: boolean; error?: string }>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const STORAGE_KEY = 'aeroprice_auth'
const TOKEN_KEY = 'aeroprice_token'

function envEmailList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

const FIREBASE_ADMIN_EMAILS = envEmailList(import.meta.env.VITE_FIREBASE_ADMIN_EMAILS)
const FIREBASE_ANALYST_EMAILS = envEmailList(import.meta.env.VITE_FIREBASE_ANALYST_EMAILS)
// The deployed app must remain usable without Firebase project credentials or
// an authorized-domain configuration. Firebase is still available as an
// explicit opt-in, but the default path uses the first-party backend auth
// endpoint so a public deployment does not hang waiting for Firebase.
const USE_BACKEND_AUTH = import.meta.env.VITE_AUTH_MODE !== 'firebase'

function roleForFirebaseEmail(email: string): Pick<AuthUser, 'role' | 'plan'> {
  const normalized = email.trim().toLowerCase()
  if (FIREBASE_ADMIN_EMAILS.includes(normalized)) {
    return { role: 'ADMIN', plan: 'ADMIN' }
  }
  try {
    const pending = JSON.parse(localStorage.getItem('aeroprice_pending_workspace') || 'null') as { email?: string; workspace?: AuthWorkspace } | null
    if (pending?.email === normalized && pending.workspace === 'DGCA') {
      return { role: 'ANALYST', plan: 'GOVERNMENT' }
    }
  } catch {
    // Ignore malformed local registration metadata and use the configured lists.
  }
  if (FIREBASE_ANALYST_EMAILS.includes(normalized)) {
    return { role: 'ANALYST', plan: 'GOVERNMENT' }
  }
  return { role: 'PUBLIC', plan: 'FREE' }
}

function roleForWorkspace(email: string, workspace?: AuthWorkspace): Pick<AuthUser, 'role' | 'plan'> {
  const normalized = email.trim().toLowerCase()
  if (FIREBASE_ADMIN_EMAILS.includes(normalized)) return { role: 'ADMIN', plan: 'ADMIN' }
  if (workspace === 'DGCA') return { role: 'ANALYST', plan: 'GOVERNMENT' }
  return roleForFirebaseEmail(normalized)
}

function loadStoredUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as AuthUser
    return parsed?.email && parsed?.role ? parsed : null
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function loadStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser)
  const [token, setToken] = useState<string | null>(loadStoredToken)

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null)
      setToken(null)
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TOKEN_KEY)
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
  }, [])

  useEffect(() => {
    if (USE_BACKEND_AUTH) return
    let active = true
    import('../services/firebase').then(async ({ getFirebaseIdToken }) => {
      const idToken = await getFirebaseIdToken()
      if (!active || !idToken) return
      setToken(idToken)
      localStorage.setItem(TOKEN_KEY, idToken)
    }).catch(() => {
      // Keep the restored session; Firebase may be unavailable temporarily.
    })
    return () => { active = false }
  }, [])

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const emailLower = email.trim().toLowerCase()

    try {
      const { FIREBASE_CONFIGURED, signInFirebaseEmailUser } = await import('../services/firebase')
      if (!FIREBASE_CONFIGURED || USE_BACKEND_AUTH) {
        const response = await apiLogin(emailLower, password)
        const displayName = response.user.name || response.user.email
        const authedUser: AuthUser = {
          name: displayName,
          email: response.user.email,
          role: response.user.role,
          plan: response.user.plan,
          initials: displayName.slice(0, 2).toUpperCase(),
        }
        setUser(authedUser)
        setToken(response.access_token)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
        localStorage.setItem(TOKEN_KEY, response.access_token)
        return { success: true }
      }
      const credential = await signInFirebaseEmailUser(emailLower, password)
      const firebaseUser = credential.user
      if (!firebaseUser.emailVerified) {
        await firebaseUser.reload()
      }
      if (!firebaseUser.emailVerified) {
        setUser(null)
        setToken(null)
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(TOKEN_KEY)
        return { success: false, error: 'Email is not verified. Please verify your Firebase email before signing in.' }
      }
      const mappedAccess = roleForFirebaseEmail(firebaseUser.email || emailLower)
      const displayName = firebaseUser.displayName || firebaseUser.email || emailLower
      const authedUser: AuthUser = {
        name: displayName,
        email: firebaseUser.email || emailLower,
        role: mappedAccess.role,
        plan: mappedAccess.plan,
        initials: displayName.slice(0, 2).toUpperCase(),
      }
      setUser(authedUser)
      const idToken = await firebaseUser.getIdToken()
      setToken(idToken)
      localStorage.removeItem('aeroprice_pending_workspace')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
      localStorage.setItem(TOKEN_KEY, idToken)
      return { success: true }
    } catch (firebaseErr) {
      const code = typeof firebaseErr === 'object' && firebaseErr && 'code' in firebaseErr ? String((firebaseErr as { code?: string }).code) : ''
      // Keep the deployed prototype usable when Firebase rejects a local/demo
      // credential or the current hostname is not yet authorized. The backend
      // account is an explicit fallback; it never fabricates identity or fare
      // data and Firebase remains the primary production path.
      try {
        const response = await apiLogin(emailLower, password)
        const displayName = response.user.name || response.user.email
        const authedUser: AuthUser = {
          name: displayName,
          email: response.user.email,
          role: response.user.role,
          plan: response.user.plan,
          initials: displayName.slice(0, 2).toUpperCase(),
        }
        setUser(authedUser)
        setToken(response.access_token)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
        localStorage.setItem(TOKEN_KEY, response.access_token)
        return { success: true }
      } catch {
        // Preserve the useful Firebase-specific error below when both auth
        // paths reject the supplied credentials.
      }
      if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        return { success: false, error: 'Invalid Firebase email or password.' }
      }
      if (code.includes('operation-not-allowed')) {
        return { success: false, error: 'Firebase Email/Password sign-in is not enabled yet.' }
      }
      if (code.includes('unauthorized-domain')) {
        return { success: false, error: 'This domain is not authorized in Firebase Authentication.' }
      }
      return { success: false, error: 'Invalid email or password.' }
    }
  }

  async function loginWithGoogle(workspace?: AuthWorkspace): Promise<{ success: boolean; error?: string }> {
    try {
      const { signInWithGooglePopup } = await import('../services/firebase')
      const credential = await signInWithGooglePopup()
      const firebaseUser = credential.user
      const email = firebaseUser.email || ''
      const mappedAccess = roleForWorkspace(email, workspace)
      const displayName = firebaseUser.displayName || firebaseUser.email || 'Google User'
      const authedUser: AuthUser = {
        name: displayName,
        email,
        role: mappedAccess.role,
        plan: mappedAccess.plan,
        initials: displayName.slice(0, 2).toUpperCase(),
      }
      setUser(authedUser)
      const idToken = await firebaseUser.getIdToken()
      setToken(idToken)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
      localStorage.setItem(TOKEN_KEY, idToken)
      return { success: true }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
        return { success: false, error: 'Google sign-in was cancelled.' }
      }
      if (code.includes('unauthorized-domain')) {
        return { success: false, error: 'This deployment domain is not authorized in Firebase Authentication.' }
      }
      return { success: false, error: 'Unable to connect to Google sign-in. Please try again.' }
    }
  }

  async function createAccount(name: string, email: string, password: string, workspace?: AuthWorkspace): Promise<{ success: boolean; error?: string }> {
    try {
      const { createFirebaseEmailUser } = await import('../services/firebase')
      const credential = await createFirebaseEmailUser(email.trim().toLowerCase(), password, name)
      if (workspace === 'DGCA') {
        localStorage.setItem('aeroprice_pending_workspace', JSON.stringify({ email: email.trim().toLowerCase(), workspace }))
      }
      await credential.user.reload()
      setUser(null)
      setToken(null)
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TOKEN_KEY)
      return { success: true }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      if (code.includes('email-already-in-use')) return { success: false, error: 'This email already has an account. Use sign in or forgot password.' }
      if (code.includes('weak-password')) return { success: false, error: 'Password should be at least 6 characters.' }
      if (code.includes('operation-not-allowed')) return { success: false, error: 'Firebase Email/Password sign-up is not enabled yet.' }
      if (code.includes('unauthorized-domain')) return { success: false, error: 'This domain is not authorized in Firebase Authentication.' }
      return { success: false, error: 'Unable to create account. Check Firebase Auth settings and try again.' }
    }
  }

  async function resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { sendFirebasePasswordReset } = await import('../services/firebase')
      await sendFirebasePasswordReset(email.trim().toLowerCase())
      return { success: true }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      if (code.includes('user-not-found')) return { success: false, error: 'No Firebase account exists for this email yet. Create an account first.' }
      if (code.includes('no-password-provider')) return { success: false, error: 'This email uses Google sign-in, so there is no password to reset. Continue with Google instead.' }
      if (code.includes('operation-not-allowed')) return { success: false, error: 'Firebase Email/Password authentication is not enabled yet.' }
      if (code.includes('unauthorized-domain')) return { success: false, error: 'This domain is not authorized in Firebase Authentication.' }
      return { success: false, error: 'Unable to send reset email. Check Firebase Auth settings and try again.' }
    }
  }

  function logout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return <AuthContext.Provider value={{ user, token, login, loginWithGoogle, createAccount, resetPassword, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// Helper: can a role access a given page?
export function canAccess(role: UserRole, plan: UserPlan, page: string): boolean {
  const adminOnly = ['collection', 'admin']
  const analystPlus = ['government', 'methodology', 'exports', 'sources']
  const subscriberPlus: string[] = []
  const publicFreePages = ['overview', 'routes', 'insights', 'map', 'alerts', 'historicalfares']

  if (role === 'PUBLIC' && plan === 'FREE' && !publicFreePages.includes(page)) return false
  if (adminOnly.includes(page)) return role === 'ADMIN'
  if (analystPlus.includes(page)) return role === 'ANALYST' || role === 'ADMIN'
  if (subscriberPlus.includes(page)) return plan !== 'FREE'
  return true
}
