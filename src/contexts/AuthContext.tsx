import { createContext, useContext, useState, type ReactNode } from 'react'
import { apiLogin } from '../services/api'

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

const DEMO_USERS: Record<string, { password: string; user: AuthUser }> = {
  'admin@aeroprice.in': {
    password: 'aeroadmin',
    user: { name: 'Admin User', email: 'admin@aeroprice.in', role: 'ADMIN', plan: 'ADMIN', initials: 'AU' },
  },
  'dgca@gov.in': {
    password: 'dgca2026',
    user: { name: 'DGCA Analyst', email: 'dgca@gov.in', role: 'ANALYST', plan: 'GOVERNMENT', initials: 'DA' },
  },
  'user@aeroprice.in': {
    password: 'aero123',
    user: { name: 'User Account', email: 'user@aeroprice.in', role: 'PUBLIC', plan: 'FREE', initials: 'UA' },
  },
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

    // Try real backend JWT first
    try {
      const resp = await apiLogin(emailLower, password)
      const initials = (resp.user.name ?? emailLower).slice(0, 2).toUpperCase()
      const authedUser: AuthUser = {
        name: resp.user.name ?? emailLower,
        email: resp.user.email,
        role: resp.user.role,
        plan: resp.user.plan,
        initials,
      }
      setUser(authedUser)
      setToken(resp.access_token)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser))
      localStorage.setItem(TOKEN_KEY, resp.access_token)
      return { success: true }
    } catch {
      const demo = DEMO_USERS[emailLower]
      if (!demo) return { success: false, error: 'Invalid email or password.' }
      if (demo.password !== password) return { success: false, error: 'Incorrect password for this demo account.' }

      setUser(demo.user)
      setToken(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(demo.user))
      localStorage.removeItem(TOKEN_KEY)
      return { success: true }
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

  function logout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return <AuthContext.Provider value={{ user, token, login, loginWithGoogle, logout }}>{children}</AuthContext.Provider>
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

  if (adminOnly.includes(page)) return role === 'ADMIN'
  if (analystPlus.includes(page)) return role === 'ANALYST' || role === 'ADMIN'
  if (subscriberPlus.includes(page)) return plan !== 'FREE'
  return true
}
