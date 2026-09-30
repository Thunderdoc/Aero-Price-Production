import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiFirebaseLogin, apiLogin, apiRegister, AUTH_EXPIRED_EVENT } from '../services/api'

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
  login: (email: string, password: string, remember?: boolean) => Promise<{ success: boolean; error?: string; user?: AuthUser }>
  loginWithGoogle: (workspace?: AuthWorkspace, passwordToLink?: string) => Promise<{ success: boolean; error?: string }>
  createAccount: (name: string, email: string, password: string, workspace?: AuthWorkspace) => Promise<{ success: boolean; error?: string }>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const STORAGE_KEY = 'aeroprice_auth'
const TOKEN_KEY = 'aeroprice_token'
const SESSION_STORAGE_KEY = 'aeroprice_session_auth'
const SESSION_TOKEN_KEY = 'aeroprice_session_token'
const FIREBASE_SESSION_KEY = 'aeroprice_firebase_session'

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
    const stored = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as AuthUser
    return parsed?.email && parsed?.role ? parsed : null
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

function loadStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(SESSION_TOKEN_KEY)
}

function saveStoredSession(user: AuthUser, token: string, remember: boolean) {
  const persistentStore = remember ? localStorage : sessionStorage
  const transientStore = remember ? sessionStorage : localStorage
  persistentStore.setItem(remember ? STORAGE_KEY : SESSION_STORAGE_KEY, JSON.stringify(user))
  persistentStore.setItem(remember ? TOKEN_KEY : SESSION_TOKEN_KEY, token)
  transientStore.removeItem(remember ? SESSION_STORAGE_KEY : STORAGE_KEY)
  transientStore.removeItem(remember ? SESSION_TOKEN_KEY : TOKEN_KEY)
}

function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(loadStoredToken)
  // Never restore a signed-in shell without the matching API credential. The
  // old behavior left a cached user visible after a 401, which made protected
  // dialogs show “Request Access” even though no request could be authorized.
  const [user, setUser] = useState<AuthUser | null>(() => {
    const storedToken = loadStoredToken()
    return storedToken ? loadStoredUser() : null
  })

  useEffect(() => {
    if (!token && user) setUser(null)
  }, [token, user])

  useEffect(() => {
    // A backend 401 means the stored API token cannot be used by this
    // deployment (commonly after a secret rotation or an old cross-deployment
    // token). Remove only the backend session so the user can sign in again.
    const handleAuthExpired = () => {
      clearStoredSession()
      setToken(null)
      setUser(null)
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
  }, [])

  useEffect(() => {
    const hasFirebaseSession = localStorage.getItem(FIREBASE_SESSION_KEY) === '1' || sessionStorage.getItem(FIREBASE_SESSION_KEY) === '1'
    if (USE_BACKEND_AUTH && !hasFirebaseSession) return
    let active = true
    import('../services/firebase').then(async ({ getFirebaseIdToken, getGoogleRedirectResult }) => {
      const redirectCredential = await getGoogleRedirectResult().catch(() => null)
      if (redirectCredential?.user) {
        const firebaseUser = redirectCredential.user
        const email = firebaseUser.email || ''
        const access = roleForFirebaseEmail(email)
        const name = firebaseUser.displayName || email
        const restoredUser: AuthUser = { name, email, role: access.role, plan: access.plan, initials: name.slice(0, 2).toUpperCase() }
        const firebaseToken = await firebaseUser.getIdToken()
        const pendingPassword = sessionStorage.getItem('aeroprice_pending_google_password')
        if (pendingPassword) {
          const { linkPasswordToCurrentFirebaseUser } = await import('../services/firebase')
          await linkPasswordToCurrentFirebaseUser(pendingPassword).catch(() => undefined)
          sessionStorage.removeItem('aeroprice_pending_google_password')
        }
        setUser(restoredUser)
        localStorage.setItem(FIREBASE_SESSION_KEY, '1')
        try {
          const apiSession = await apiFirebaseLogin(firebaseToken)
          setToken(apiSession.access_token)
          saveStoredSession(restoredUser, apiSession.access_token, true)
        } catch {
          // The backend also accepts a verified Firebase ID token as a safe
          // fallback when the session exchange is temporarily unavailable.
          setToken(firebaseToken)
          saveStoredSession(restoredUser, firebaseToken, true)
        }
        return
      }
      const idToken = await getFirebaseIdToken()
      if (!active || !idToken) return
      try {
        const apiSession = await apiFirebaseLogin(idToken)
        if (!active) return
        setToken(apiSession.access_token)
        const store = localStorage.getItem(FIREBASE_SESSION_KEY) === '1' ? localStorage : sessionStorage
        store.setItem(store === localStorage ? TOKEN_KEY : SESSION_TOKEN_KEY, apiSession.access_token)
      } catch {
        // Keep the verified Firebase token usable while the API session
        // exchange is retried on the next refresh.
        if (!active) return
        setToken(idToken)
        const store = localStorage.getItem(FIREBASE_SESSION_KEY) === '1' ? localStorage : sessionStorage
        store.setItem(store === localStorage ? TOKEN_KEY : SESSION_TOKEN_KEY, idToken)
      }
    }).catch(() => {
      // Keep the restored session; Firebase may be unavailable temporarily.
    })
    return () => { active = false }
  }, [])

  async function login(email: string, password: string, remember = true): Promise<{ success: boolean; error?: string; user?: AuthUser }> {
    const emailLower = email.trim().toLowerCase()

    try {
      const { FIREBASE_CONFIGURED, signInFirebaseEmailUser } = await import('../services/firebase')
      // A Firebase password-reset email must be followed by a Firebase sign-in.
      // The previous implementation forced backend auth whenever VITE_AUTH_MODE
      // was "backend", so a password changed through Firebase could never work.
      // Try the configured identity provider first; backend accounts remain a
      // supported fallback for users that do not exist in Firebase.
      if (FIREBASE_CONFIGURED) {
        try {
          const credential = await signInFirebaseEmailUser(emailLower, password)
          const firebaseUser = credential.user
          if (!firebaseUser.emailVerified) {
            await firebaseUser.reload()
          }
          if (!firebaseUser.emailVerified) {
            return { success: false, error: 'Email is not verified. Please verify your email before signing in.' }
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
          const idToken = await firebaseUser.getIdToken()
          const apiSession = await apiFirebaseLogin(idToken)
          setUser(authedUser)
          setToken(apiSession.access_token)
          ;(remember ? localStorage : sessionStorage).setItem(FIREBASE_SESSION_KEY, '1')
          localStorage.removeItem('aeroprice_pending_workspace')
          saveStoredSession(authedUser, apiSession.access_token, remember)
          return { success: true, user: authedUser }
        } catch (firebaseError) {
          // Google-only accounts do not have a password credential. Do not
          // incorrectly fall through to backend auth and report "incorrect
          // password" for a valid Google account.
          const code = typeof firebaseError === 'object' && firebaseError && 'code' in firebaseError
            ? String((firebaseError as { code?: string }).code)
            : ''
          if (code.includes('invalid-credential') || code.includes('user-not-found') || code.includes('wrong-password')) {
            const { getFirebaseSignInMethods } = await import('../services/firebase')
            const methods = await getFirebaseSignInMethods(emailLower).catch((): string[] => [])
            if (methods.includes('google.com')) {
              return { success: false, error: 'This account uses Google sign-in. Click “Continue with Google”; it does not have a separate password.' }
            }
          }
          // If Firebase does not know this account, continue with backend auth.
        }
      }

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
        saveStoredSession(authedUser, response.access_token, remember)
        return { success: true, user: authedUser }
      }
      return { success: false, error: 'Invalid email or password.' }
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
        saveStoredSession(authedUser, response.access_token, remember)
        return { success: true, user: authedUser }
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

  async function loginWithGoogle(workspace?: AuthWorkspace, passwordToLink?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { signInWithGooglePopup, linkPasswordToCurrentFirebaseUser } = await import('../services/firebase')
      const credential = await signInWithGooglePopup()
      const firebaseUser = credential.user
      const email = firebaseUser.email || ''
      const access = roleForWorkspace(email, workspace)
      const name = firebaseUser.displayName || email
      const authedUser: AuthUser = {
        name,
        email,
        role: access.role,
        plan: access.plan,
        initials: name.slice(0, 2).toUpperCase(),
      }

      if (passwordToLink && passwordToLink.length >= 6) {
        try {
          await linkPasswordToCurrentFirebaseUser(passwordToLink)
        } catch (linkError) {
          const linkCode = typeof linkError === 'object' && linkError && 'code' in linkError
            ? String((linkError as { code?: string }).code)
            : ''
          // A Google account that already has an email/password provider is
          // fully usable. Do not turn this harmless duplicate-link condition
          // into a failed Google/admin login.
          if (!linkCode.includes('provider-already-linked') && !linkCode.includes('credential-already-in-use')) {
            return { success: false, error: 'Google sign-in succeeded, but the password could not be linked. Use the existing password or reset it.' }
          }
        }
      }

      const idToken = await firebaseUser.getIdToken()
      localStorage.setItem(FIREBASE_SESSION_KEY, '1')
      try {
        const apiSession = await apiFirebaseLogin(idToken)
        const serverUser: AuthUser = {
          name: apiSession.user.name || authedUser.name,
          email: apiSession.user.email || authedUser.email,
          role: apiSession.user.role,
          plan: apiSession.user.plan,
          initials: (apiSession.user.name || authedUser.name).slice(0, 2).toUpperCase(),
        }
        setUser(serverUser)
        setToken(apiSession.access_token)
        saveStoredSession(serverUser, apiSession.access_token, true)
      } catch {
        // Firebase identity remains valid and the backend verifies this token
        // directly when the optional exchange is unavailable.
        setUser(authedUser)
        setToken(idToken)
        saveStoredSession(authedUser, idToken, true)
      }
      return { success: true }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request') || code.includes('popup-blocked')) {
        return { success: false, error: 'Google sign-in popup was blocked or closed. Allow pop-ups for localhost:8443, then try again.' }
      }
      if (code.includes('unauthorized-domain')) {
        return { success: false, error: 'This deployment domain is not authorized in Firebase Authentication.' }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unable to connect to Google sign-in. Please try again.' }
    }
  }

  async function createAccount(name: string, email: string, password: string, workspace?: AuthWorkspace): Promise<{ success: boolean; error?: string }> {
    if (USE_BACKEND_AUTH) {
      if (workspace && workspace !== 'USER') {
        return { success: false, error: 'DGCA and Admin accounts require approved credentials. Only User accounts can self-register.' }
      }
      try {
        await apiRegister(name.trim(), email.trim().toLowerCase(), password)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unable to create account.' }
      }
    }
    try {
      const { createFirebaseEmailUser } = await import('../services/firebase')
      const credential = await createFirebaseEmailUser(email.trim().toLowerCase(), password, name)
      if (workspace === 'DGCA') {
        localStorage.setItem('aeroprice_pending_workspace', JSON.stringify({ email: email.trim().toLowerCase(), workspace }))
      }
      await credential.user.reload()
      setUser(null)
      setToken(null)
      clearStoredSession()
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
      // Firebase can establish a password credential for an account that was
      // originally created with Google. Do not block the reset request merely
      // because Google was the first provider used.
      if (code.includes('operation-not-allowed')) return { success: false, error: 'Firebase Email/Password authentication is not enabled yet.' }
      if (code.includes('unauthorized-domain')) return { success: false, error: 'This domain is not authorized in Firebase Authentication.' }
      return { success: false, error: 'Unable to send reset email. Check Firebase Auth settings and try again.' }
    }
  }

  function logout() {
    setUser(null)
    setToken(null)
    clearStoredSession()
    localStorage.removeItem(FIREBASE_SESSION_KEY)
    sessionStorage.removeItem(FIREBASE_SESSION_KEY)
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
