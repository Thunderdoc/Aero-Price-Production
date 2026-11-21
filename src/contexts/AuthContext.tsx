import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AUTH_EXPIRED_EVENT, AUTH_REJECTED_EVENT, apiCurrentUser, apiFirebaseLogin, apiLogin, apiRegister, clearApiAuthSession, setApiAuthTokenRefresher } from '../services/api'
import { FIREBASE_CONFIGURED, getFirebaseAuth, getFirebaseIdToken, getGoogleRedirectResult, signInFirebaseEmailUser, signInWithGooglePopup, signOutFirebaseUser } from '../services/firebase'

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
  // True when the backend (email/password) auth mode is active. The login
  // page uses it for mode-accurate messaging: backend mode sends no
  // verification or reset emails.
  isBackendAuth: boolean
  login: (email: string, password: string, remember?: boolean, workspace?: AuthWorkspace) => Promise<{ success: boolean; error?: string; user?: AuthUser }>
  loginWithGoogle: (workspace?: AuthWorkspace, passwordToLink?: string) => Promise<{ success: boolean; error?: string }>
  createAccount: (name: string, email: string, password: string, workspace?: AuthWorkspace) => Promise<{ success: boolean; error?: string }>
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
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

function disabledAccountMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (!/this account is disabled by an administrator/i.test(message)) return null
  const jsonStart = message.indexOf('{')
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(message.slice(jsonStart)) as { detail?: string }
      if (body.detail) return body.detail
    } catch { /* Keep the matching user-facing sentence below. */ }
  }
  return message.slice(message.toLowerCase().indexOf('this account is disabled')).replace(/["}]+$/, '')
}

function rejectedIdentityMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : ''
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0
  return status === 401 || status === 403 || /invalid authentication credentials|verify your email address/i.test(message) ? message || 'Sign-in verification was rejected. Please sign in again.' : null
}

function roleForFirebaseEmail(email: string): Pick<AuthUser, 'role' | 'plan'> {
  const normalized = email.trim().toLowerCase()
  if (FIREBASE_ADMIN_EMAILS.includes(normalized)) {
    return { role: 'ADMIN', plan: 'ADMIN' }
  }
  // Roles come only from the server or these server-configured email lists.
  // The old localStorage role path (aeroprice_pending_workspace) was deleted:
  // anyone could edit it in DevTools and self-grant the analyst UI.
  if (FIREBASE_ANALYST_EMAILS.includes(normalized)) {
    return { role: 'ANALYST', plan: 'GOVERNMENT' }
  }
  return { role: 'PUBLIC', plan: 'FREE' }
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
  const sessionRef = useRef({ token, email: user?.email })
  sessionRef.current = { token, email: user?.email }

  function rejectStoredIdentity(message: string) {
    // Verification guidance belongs to the password sign-in attempt that
    // produced it. Do not carry it into a fresh, blank login page or a later
    // Google sign-in. Disabled-account notices remain actionable on reload.
    const isDisabled = /account is disabled/i.test(message)
    if (isDisabled) sessionStorage.setItem('aeroprice_auth_notice', message)
    else sessionStorage.removeItem('aeroprice_auth_notice')
    clearApiAuthSession()
    clearStoredSession()
    localStorage.removeItem(FIREBASE_SESSION_KEY)
    sessionStorage.removeItem(FIREBASE_SESSION_KEY)
    setUser(null)
    setToken(null)
    if (isDisabled) window.dispatchEvent(new CustomEvent('aeroprice-auth-notice', { detail: message }))
  }

  useEffect(() => {
    const reject = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string; message: string }>).detail
      if (detail.token && detail.token === sessionRef.current.token) rejectStoredIdentity(detail.message)
    }
    window.addEventListener(AUTH_REJECTED_EVENT, reject)
    return () => window.removeEventListener(AUTH_REJECTED_EVENT, reject)
  }, [])

  // A 401 for the CURRENT session token ends the session: clear the stored
  // session and route back to login with a "session expired" notice. The
  // token match is what keeps this safe — a stale background request that
  // finishes after a re-login must not sign out the new session, and a
  // token-less (guest) 401 is not an expiry at all.
  useEffect(() => {
    const expire = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string }>).detail
      if (!detail.token || detail.token !== sessionRef.current.token) return
      const message = 'Your session expired. Please sign in again.'
      sessionStorage.setItem('aeroprice_auth_notice', message)
      clearApiAuthSession()
      clearStoredSession()
      localStorage.removeItem(FIREBASE_SESSION_KEY)
      sessionStorage.removeItem(FIREBASE_SESSION_KEY)
      setUser(null)
      setToken(null)
      window.dispatchEvent(new CustomEvent('aeroprice-auth-notice', { detail: message }))
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, expire)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire)
  }, [])

  useEffect(() => {
    // Drop the deleted localStorage role key if an older build left one.
    try { localStorage.removeItem('aeroprice_pending_workspace') } catch { /* Storage may be unavailable. */ }
  }, [])

  const refreshUser = useCallback(async () => {
    if (!token || !user?.email) return
    const snapshot = await apiCurrentUser(token)
    if (sessionRef.current.token !== token || sessionRef.current.email !== snapshot.email) return
    setUser(previous => {
      if (!previous || previous.email !== snapshot.email) return previous
      if (previous.role === snapshot.role && previous.plan === snapshot.plan && previous.name === snapshot.name) return previous
      const next = { ...previous, ...snapshot, initials: (snapshot.name || snapshot.email).slice(0, 2).toUpperCase() }
      saveStoredSession(next, token, localStorage.getItem(TOKEN_KEY) !== null)
      return next
    })
  }, [token, user?.email])

  useEffect(() => {
    if (!token || !user?.email) return
    const sync = () => { if (document.visibilityState !== 'hidden') void refreshUser().catch(() => undefined) }
    sync()
    // Server role, subscription and disabled-account changes are authoritative
    // and must move an already-open workspace promptly without trusting the
    // role embedded in an older browser token. Poll at 60 s (the old 10 s
    // poll exhausted the shared auth rate-limit bucket in ~10 minutes) plus
    // on focus / tab-visible, which is when a returning user notices staleness.
    const timer = window.setInterval(sync, 60_000)
    window.addEventListener('focus', sync)
    window.addEventListener('visibilitychange', sync)
    window.addEventListener('aeroprice-notifications-changed', sync)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', sync)
      window.removeEventListener('visibilitychange', sync)
      window.removeEventListener('aeroprice-notifications-changed', sync)
    }
  }, [token, user?.email, refreshUser])

  useEffect(() => {
    if (!token && user) setUser(null)
  }, [token, user])

  // Firebase-backed sessions can renew the short-lived API JWT silently. This
  // lets protected submissions (feedback, screenshots, Premium requests, and
  // admin actions) retry once instead of failing after an idle browser session.
  // Backend-password sessions have no refresh credential and remain explicitly
  // re-authentication-only.
  useEffect(() => {
    let active = true
    const hasFirebaseSession = localStorage.getItem(FIREBASE_SESSION_KEY) === '1' || sessionStorage.getItem(FIREBASE_SESSION_KEY) === '1'
    if (!token || !user || (!hasFirebaseSession && USE_BACKEND_AUTH)) {
      setApiAuthTokenRefresher(null)
      return () => { active = false }
    }

    const rejectedToken = token
    const sessionUser = user
    setApiAuthTokenRefresher(async (expiredToken) => {
      if (!active || expiredToken !== rejectedToken) return null
      const idToken = await getFirebaseIdToken(true)
      if (!active || !idToken) return null
      const firebaseUser = getFirebaseAuth()?.currentUser
      if (!firebaseUser?.email || firebaseUser.email.trim().toLowerCase() !== sessionUser.email.trim().toLowerCase()) return null
      let apiSession
      try { apiSession = await apiFirebaseLogin(idToken) }
      catch (failure) {
        const rejected = rejectedIdentityMessage(failure)
        if (active && rejected) rejectStoredIdentity(rejected)
        throw failure
      }
      if (!active || apiSession.user.email.trim().toLowerCase() !== sessionUser.email.trim().toLowerCase()) return null
      const displayName = apiSession.user.name || apiSession.user.email
      const refreshedUser: AuthUser = {
        name: displayName,
        email: apiSession.user.email,
        role: apiSession.user.role,
        plan: apiSession.user.plan,
        initials: displayName.slice(0, 2).toUpperCase(),
      }
      const remember = localStorage.getItem(FIREBASE_SESSION_KEY) === '1'
      saveStoredSession(refreshedUser, apiSession.access_token, remember)
      setUser(refreshedUser)
      setToken(apiSession.access_token)
      return apiSession.access_token
    })

    return () => {
      active = false
      setApiAuthTokenRefresher(null)
    }
  }, [token, user])

  // A 401 for the current session token is handled by the AUTH_EXPIRED_EVENT
  // listener above (token-matched, so a stale request cannot sign out a
  // newer session). Nothing else here discards the browser session.

  useEffect(() => {
    let active = true
    void (async () => {
      const redirectCredential = await getGoogleRedirectResult().catch(() => null)
      if (redirectCredential?.user) {
        const pendingPassword = sessionStorage.getItem('aeroprice_pending_google_password')
        if (pendingPassword) {
          const { linkPasswordToCurrentFirebaseUser } = await import('../services/firebase')
          await linkPasswordToCurrentFirebaseUser(pendingPassword).catch(() => undefined)
          sessionStorage.removeItem('aeroprice_pending_google_password')
        }
      }
      const idToken = redirectCredential?.user ? await redirectCredential.user.getIdToken() : await getFirebaseIdToken()
      const firebaseUser = redirectCredential?.user ?? getFirebaseAuth()?.currentUser
      if (!active || !idToken) return
      const remember = localStorage.getItem(FIREBASE_SESSION_KEY) === '1' || Boolean(redirectCredential?.user)
      try {
        const apiSession = await apiFirebaseLogin(idToken)
        if (!active) return
        const name = apiSession.user.name || apiSession.user.email
        const restoredUser: AuthUser = {
          name, email: apiSession.user.email, role: apiSession.user.role,
          plan: apiSession.user.plan, initials: name.slice(0, 2).toUpperCase(),
        }
        setUser(restoredUser)
        setToken(apiSession.access_token)
        ;(remember ? localStorage : sessionStorage).setItem(FIREBASE_SESSION_KEY, '1')
        saveStoredSession(restoredUser, apiSession.access_token, remember)
        // A previous password-login verification warning must not remain
        // visible after a successful verified Google session.
        sessionStorage.removeItem('aeroprice_auth_notice')
        localStorage.removeItem('aeroprice_disabled_account_notice')
      } catch (error) {
        const rejected = rejectedIdentityMessage(error)
        if (rejected) {
          if (active) rejectStoredIdentity(rejected)
          return
        }
        const disabledMessage = disabledAccountMessage(error)
        if (disabledMessage) {
          localStorage.setItem('aeroprice_disabled_account_notice', disabledMessage)
          clearStoredSession()
          localStorage.removeItem(FIREBASE_SESSION_KEY)
          sessionStorage.removeItem(FIREBASE_SESSION_KEY)
          await signOutFirebaseUser().catch(() => undefined)
          if (!active) return
          setUser(null)
          setToken(null)
          return
        }
        // Keep the Firebase identity and its token while the backend recovers.
        if (!active || !firebaseUser?.email) return
        const email = firebaseUser.email
        const name = firebaseUser.displayName || email
        const access = roleForFirebaseEmail(email)
        const restoredUser: AuthUser = { name, email, role: access.role, plan: access.plan, initials: name.slice(0, 2).toUpperCase() }
        setUser(restoredUser)
        setToken(idToken)
        ;(remember ? localStorage : sessionStorage).setItem(FIREBASE_SESSION_KEY, '1')
        saveStoredSession(restoredUser, idToken, remember)
        sessionStorage.removeItem('aeroprice_auth_notice')
        localStorage.removeItem('aeroprice_disabled_account_notice')
      }
    })().catch(() => {
      // Keep the restored session; Firebase may be unavailable temporarily.
    })
    return () => { active = false }
  }, [])

  // Single sign-in: the role is resolved post-auth from the server response.
  // The `workspace` argument is accepted for call-site compatibility but is
  // deliberately ignored — there are no role tabs anymore, and a valid login
  // must never succeed and then be undone by a tab check.
  async function login(email: string, password: string, remember = true, _workspace?: AuthWorkspace): Promise<{ success: boolean; error?: string; user?: AuthUser }> {
    const emailLower = email.trim().toLowerCase()

    function finishLogin(response: Awaited<ReturnType<typeof apiLogin>>, firebaseSession: boolean) {
      const displayName = response.user.name || response.user.email
      const authedUser: AuthUser = {
        name: displayName, email: response.user.email,
        role: response.user.role, plan: response.user.plan,
        initials: displayName.slice(0, 2).toUpperCase(),
      }
      if (firebaseSession) {
        ;(remember ? localStorage : sessionStorage).setItem(FIREBASE_SESSION_KEY, '1')
        ;(remember ? sessionStorage : localStorage).removeItem(FIREBASE_SESSION_KEY)
      } else {
        localStorage.removeItem(FIREBASE_SESSION_KEY)
        sessionStorage.removeItem(FIREBASE_SESSION_KEY)
      }
      saveStoredSession(authedUser, response.access_token, remember)
      setUser(authedUser)
      setToken(response.access_token)
      return { success: true, user: authedUser }
    }

    try {
      if (FIREBASE_CONFIGURED) {
        // Firebase remains first: a Firebase reset must use the new Firebase
        // password, never a stale backend password.
        let credential: Awaited<ReturnType<typeof signInFirebaseEmailUser>> | undefined
        try {
          credential = await signInFirebaseEmailUser(emailLower, password)
        } catch (providerError) {
          const code = typeof providerError === 'object' && providerError && 'code' in providerError
            ? String((providerError as { code?: string }).code) : ''
          const credentialRejected = /invalid-credential|user-not-found|wrong-password/.test(code)
          // Only a rejected credential may belong to a legacy backend account.
          // Network failures and throttling must not start another password
          // request. Provider discovery also adds a round trip on every typo.
          if (!USE_BACKEND_AUTH || !credentialRejected) throw providerError
        }
        if (credential) {
          const firebaseUser = credential.user
          if (!firebaseUser.emailVerified) await firebaseUser.reload()
          if (!firebaseUser.emailVerified) {
            return { success: false, error: 'Email is not verified. Please verify your email before signing in.' }
          }
          const idToken = await firebaseUser.getIdToken(true)
          // Errors here concern server verification, not the password.
          // Never retry an accepted Firebase password against another store.
          const response = await apiFirebaseLogin(idToken)
          return finishLogin(response, true)
        }
      }
      return finishLogin(await apiLogin(emailLower, password), false)
    } catch (error) {
      const disabledMessage = disabledAccountMessage(error)
      if (disabledMessage) {
        await signOutFirebaseUser().catch(() => undefined)
        return { success: false, error: disabledMessage }
      }
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code) : ''
      if (/invalid-credential|wrong-password|user-not-found/.test(code)) {
        return { success: false, error: 'Incorrect email or password. Check your credentials or use Forgot password.' }
      }
      if (code.includes('too-many-requests')) {
        return { success: false, error: 'Too many sign-in attempts were made. Wait a moment, then try again or use Forgot password.' }
      }
      if (code.includes('network-request-failed')) {
        return { success: false, error: 'Firebase could not be reached. Check your connection and try again.' }
      }
      if (code.includes('operation-not-allowed')) {
        return { success: false, error: 'Firebase Email/Password sign-in is not enabled yet.' }
      }
      if (code.includes('unauthorized-domain')) {
        return { success: false, error: 'This domain is not authorized in Firebase Authentication.' }
      }
      // Honest errors: only a real 401 means wrong credentials. A 429, a
      // 5xx, or a network failure must never be reported as a wrong password
      // — the user cannot fix those by retyping.
      const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0
      const detail = error instanceof Error ? error.message : ''
      if (status === 401) {
        return { success: false, error: 'Incorrect email or password. Check your credentials or use Forgot password.' }
      }
      if (status === 429) {
        return { success: false, error: detail || 'Too many sign-in attempts. Try again in a few minutes.' }
      }
      if (status >= 500) {
        if (detail && !/something went wrong/i.test(detail)) return { success: false, error: detail }
        return { success: false, error: 'The server is having trouble right now. Please try again in a moment.' }
      }
      if (/failed to fetch|network|load failed/i.test(detail)) {
        return { success: false, error: 'Unable to connect to the server. Check your connection and try again.' }
      }
      return { success: false, error: detail || 'Incorrect email or password.' }
    }
  }

  // Single sign-in: the role is resolved post-auth from the server response
  // (or, when the backend exchange is unavailable, from the server-configured
  // Firebase email lists). The `workspace` argument is accepted for
  // call-site compatibility but is deliberately ignored.
  async function loginWithGoogle(_workspace?: AuthWorkspace, passwordToLink?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const credential = await signInWithGooglePopup()
      const { linkPasswordToCurrentFirebaseUser } = await import('../services/firebase')
      const firebaseUser = credential.user
      // Google identities are normally verified by Firebase itself. Keep the
      // same hard gate for any provider response that does not carry that
      // verified-email claim rather than treating the provider name as proof.
      if (firebaseUser.emailVerified === false) {
        await signOutFirebaseUser().catch(() => undefined)
        return { success: false, error: 'Google did not provide a verified email address for this account.' }
      }
      const email = firebaseUser.email || ''
      const access = roleForFirebaseEmail(email)
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
        localStorage.setItem(FIREBASE_SESSION_KEY, '1')
        saveStoredSession(serverUser, apiSession.access_token, true)
      } catch (exchangeError) {
        const disabledMessage = disabledAccountMessage(exchangeError)
        if (disabledMessage) {
          await signOutFirebaseUser().catch(() => undefined)
          return { success: false, error: disabledMessage }
        }
        const rejected = rejectedIdentityMessage(exchangeError)
        if (rejected) {
          rejectStoredIdentity(rejected)
          return { success: false, error: rejected }
        }
        // Firebase identity remains valid and the backend verifies this token
        // directly when the optional exchange is unavailable.
        setUser(authedUser)
        setToken(idToken)
        localStorage.setItem(FIREBASE_SESSION_KEY, '1')
        saveStoredSession(authedUser, idToken, true)
      }
      return { success: true }
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request') || code.includes('popup-blocked')) {
        // Mobile browsers often block popups. Redirect is same-origin and
        // returns to the login page through Firebase's redirect handler.
        try {
          const { signInWithGoogleRedirect } = await import('../services/firebase')
          await signInWithGoogleRedirect()
          return { success: true }
        } catch {
          const host = typeof window !== 'undefined' ? window.location.host : 'this site'
          return { success: false, error: `Google sign-in was blocked. Allow pop-ups for ${host}, or try again to use redirect sign-in.` }
        }
      }
      if (code.includes('unauthorized-domain')) {
        return { success: false, error: 'This deployment domain is not authorized in Firebase Authentication.' }
      }
      if (code.includes('operation-not-allowed')) {
        return { success: false, error: 'Firebase Google sign-in is not enabled yet. Enable Google under Authentication → Sign-in method.' }
      }
      if (code.includes('invalid-api-key') || code.includes('app-not-authorized')) {
        return { success: false, error: 'Firebase web configuration is invalid for this app. Check the project API key and app settings.' }
      }
      if (code.includes('network-request-failed')) {
        return { success: false, error: 'Firebase could not be reached. Check the network connection and Firebase project configuration.' }
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unable to connect to Google sign-in. Please try again.' }
    }
  }

  // Self-registration creates a PUBLIC user account only. Analyst and admin
  // accounts are granted by an administrator (role change / invite) — the
  // `workspace` argument is accepted for call-site compatibility but is
  // deliberately ignored, and the backend rejects DGCA self-registration.
  async function createAccount(name: string, email: string, password: string, _workspace?: AuthWorkspace): Promise<{ success: boolean; error?: string }> {
    if (USE_BACKEND_AUTH) {
      try {
        await apiRegister(name.trim(), email.trim().toLowerCase(), password, 'USER')
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Unable to create account.' }
      }
    }
    try {
      const { createFirebaseEmailUser } = await import('../services/firebase')
      const credential = await createFirebaseEmailUser(email.trim().toLowerCase(), password, name)
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
    // Backend mode has no email sender: there is no self-service email reset.
    // Say so plainly instead of pretending an email was sent — an admin
    // resets the password (POST /api/admin/users/{email}/reset-password).
    if (USE_BACKEND_AUTH) {
      return { success: false, error: 'This account uses backend sign-in, which has no email password reset. Ask an administrator to reset your password.' }
    }
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
      if (code.includes('invalid-api-key') || code.includes('app-not-authorized')) return { success: false, error: 'Firebase web configuration is invalid for this app. Check the project API key and app settings.' }
      if (code.includes('network-request-failed')) return { success: false, error: 'Firebase could not be reached. Check the network connection and Firebase project configuration.' }
      if (code.includes('too-many-requests')) return { success: false, error: 'Too many reset attempts. Wait a while and try again.' }
      return { success: false, error: 'Unable to send reset email. Check Firebase Auth settings and try again.' }
    }
  }

  function logout() {
    clearApiAuthSession()
    void signOutFirebaseUser().catch(() => undefined)
    setUser(null)
    setToken(null)
    clearStoredSession()
    localStorage.removeItem(FIREBASE_SESSION_KEY)
    sessionStorage.removeItem(FIREBASE_SESSION_KEY)
  }

  return <AuthContext.Provider value={{ user, token, isBackendAuth: USE_BACKEND_AUTH, login, loginWithGoogle, createAccount, resetPassword, logout, refreshUser }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// Helper: can a role access a given page?
// Since the 21 Nov 2026 access decision, every read-only page is open to any
// signed-in user (the analyst gate was dropped on reads, backend + frontend).
// Only admin operations stay gated — collection/admin pages. There must be no
// visible nav item that silently does nothing: anything the sidebar shows a
// signed-in user, this matrix allows.
export function canAccess(role: UserRole, _plan: UserPlan, page: string): boolean {
  const adminOnly = ['collection', 'admin']
  if (adminOnly.includes(page)) return role === 'ADMIN'
  return true
}
