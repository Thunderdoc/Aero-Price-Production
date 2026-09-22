import { createContext, useContext, useState, type ReactNode } from 'react'

export type UserRole = 'PUBLIC' | 'ANALYST' | 'ADMIN'
export type UserPlan = 'FREE' | 'SUBSCRIBER' | 'GOVERNMENT' | 'ADMIN'

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
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>
  createAccount: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>
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

function roleForFirebaseEmail(email: string): Pick<AuthUser, 'role' | 'plan'> {
  const normalized = email.trim().toLowerCase()
  if (FIREBASE_ADMIN_EMAILS.includes(normalized)) {
    return { role: 'ADMIN', plan: 'ADMIN' }
  }
  if (FIREBASE_ANALYST_EMAILS.includes(normalized)) {
    return { role: 'ANALYST', plan: 'GOVERNMENT' }
  }
  return { role: 'PUBLIC', plan: 'FREE' }
}

function loadStoredUser(): AuthUser | null {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(TOKEN_KEY)
  return null
}

function loadStoredToken(): string | null {
  return null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser)
  const [token, setToken] = useState<string | null>(loadStoredToken)

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const emailLower = email.trim().toLowerCase()

    try {
      const { signInFirebaseEmailUser } = await import('../services/firebase')
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
      setToken(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
      localStorage.removeItem(TOKEN_KEY)
      return { success: true }
    } catch (firebaseErr) {
      const code = typeof firebaseErr === 'object' && firebaseErr && 'code' in firebaseErr ? String((firebaseErr as { code?: string }).code) : ''
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

  async function loginWithGoogle(): Promise<{ success: boolean; error?: string }> {
    try {
      const { signInWithGooglePopup } = await import('../services/firebase')
      const credential = await signInWithGooglePopup()
      const firebaseUser = credential.user
      const email = firebaseUser.email || ''
      const mappedAccess = roleForFirebaseEmail(email)
      const displayName = firebaseUser.displayName || firebaseUser.email || 'Google User'
      const authedUser: AuthUser = {
        name: displayName,
        email,
        role: mappedAccess.role,
        plan: mappedAccess.plan,
        initials: displayName.slice(0, 2).toUpperCase(),
      }
      setUser(authedUser)
      setToken(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
      localStorage.removeItem(TOKEN_KEY)
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

  async function createAccount(name: string, email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { createFirebaseEmailUser } = await import('../services/firebase')
      const credential = await createFirebaseEmailUser(email.trim().toLowerCase(), password, name)
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
  const publicFreePages = ['overview', 'routes', 'insights', 'map', 'alerts']

  if (role === 'PUBLIC' && plan === 'FREE' && !publicFreePages.includes(page)) return false
  if (adminOnly.includes(page)) return role === 'ADMIN'
  if (analystPlus.includes(page)) return role === 'ANALYST' || role === 'ADMIN'
  if (subscriberPlus.includes(page)) return plan !== 'FREE'
  return true
}
