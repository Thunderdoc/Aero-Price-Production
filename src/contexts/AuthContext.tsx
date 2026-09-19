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
  logout: () => void
}

// Demo fallback — used when backend is unreachable
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
    user: { name: 'Subscriber User', email: 'user@aeroprice.in', role: 'PUBLIC', plan: 'SUBSCRIBER', initials: 'SU' },
  },
}

const STORAGE_KEY = 'aeroprice_auth'
const TOKEN_KEY = 'aeroprice_token'

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
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
      // Backend unreachable or returned 401 — fall through to demo fallback
    }

    // Demo fallback: known demo accounts
    const known = DEMO_USERS[emailLower]
    if (known) {
      if (known.password !== password) {
        return { success: false, error: 'Incorrect password for this demo account.' }
      }
      setUser(known.user)
      setToken(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(known.user))
      localStorage.removeItem(TOKEN_KEY)
      return { success: true }
    }

    // Any valid-looking email with password "demo" gets FREE public access
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (emailPattern.test(emailLower) && password === 'demo') {
      const name = emailLower.split('@')[0]
      const initials = name.slice(0, 2).toUpperCase()
      const freeUser: AuthUser = { name, email: emailLower, role: 'PUBLIC', plan: 'FREE', initials }
      setUser(freeUser)
      setToken(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(freeUser))
      localStorage.removeItem(TOKEN_KEY)
      return { success: true }
    }

    return { success: false, error: 'Invalid credentials. Use a demo account or any email with password "demo".' }
  }

  function logout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
  }

  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>
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
  const subscriberPlus = ['alerts']

  if (adminOnly.includes(page)) return role === 'ADMIN'
  if (analystPlus.includes(page)) return role === 'ANALYST' || role === 'ADMIN'
  if (subscriberPlus.includes(page)) return plan !== 'FREE'
  return true
}
