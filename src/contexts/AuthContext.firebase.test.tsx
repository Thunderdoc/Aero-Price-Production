import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { apiCurrentUser, apiFirebaseLogin, apiLogin, clearApiAuthSession, setApiAuthTokenRefresher } from '../services/api'
import { getFirebaseAuth, getFirebaseIdToken, signInFirebaseEmailUser } from '../services/firebase'

vi.hoisted(() => { vi.stubEnv('VITE_AUTH_MODE', 'firebase') })
vi.mock('../services/firebase', () => ({
  FIREBASE_CONFIGURED: true,
  signInFirebaseEmailUser: vi.fn(), signInWithGooglePopup: vi.fn(),
  getGoogleRedirectResult: vi.fn().mockResolvedValue(null),
  getFirebaseAuth: vi.fn().mockReturnValue(null),
  getFirebaseIdToken: vi.fn().mockResolvedValue(null),
  signOutFirebaseUser: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/api', () => ({ AUTH_REJECTED_EVENT: 'aeroprice:auth-rejected', apiCurrentUser: vi.fn(), apiFirebaseLogin: vi.fn(), apiLogin: vi.fn(), apiRegister: vi.fn(), clearApiAuthSession: vi.fn(), setApiAuthTokenRefresher: vi.fn() }))

let auth: ReturnType<typeof useAuth>
function Consumer() { auth = useAuth(); return null }

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks()
  vi.mocked(getFirebaseAuth).mockReturnValue(null)
  vi.mocked(getFirebaseIdToken).mockResolvedValue(null)
  vi.mocked(apiCurrentUser).mockRejectedValue(new Error('No session snapshot in this test'))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('External network requests are forbidden in auth tests')))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test.each([
  ['USER', 'PUBLIC', 'FREE'], ['DGCA', 'ANALYST', 'GOVERNMENT'], ['ADMIN', 'ADMIN', 'ADMIN'],
] as const)('%s Firebase login only waits for identity verification and the server role', async (workspace, role, plan) => {
  vi.mocked(signInFirebaseEmailUser).mockResolvedValue({ user: {
    email: 'account@example.test', emailVerified: true, getIdToken: async () => 'test-id-token',
  } } as unknown as Awaited<ReturnType<typeof signInFirebaseEmailUser>>)
  vi.mocked(apiFirebaseLogin).mockResolvedValue({ access_token: 'verified-server-token', token_type: 'bearer',
    user: { name: 'Account', email: 'account@example.test', role, plan },
  })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('account@example.test', 'test-password', false, workspace)).success).toBe(true) })
  expect(auth.user?.role).toBe(role)
  expect(apiFirebaseLogin).toHaveBeenCalledTimes(1)
  expect(apiLogin).not.toHaveBeenCalled()
})

test('Firebase-only mode rejects invalid credentials without trying a second password store', async () => {
  vi.mocked(signInFirebaseEmailUser).mockRejectedValue({ code: 'auth/invalid-credential' })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('account@example.test', 'incorrect-password', false, 'ADMIN')).success).toBe(false) })
  expect(apiLogin).not.toHaveBeenCalled()
  expect(auth.user).toBeNull()
})

test('unverified Firebase email still cannot sign in', async () => {
  const reload = vi.fn().mockResolvedValue(undefined)
  vi.mocked(signInFirebaseEmailUser).mockResolvedValue({ user: {
    email: 'account@example.test', emailVerified: false, reload,
  } } as unknown as Awaited<ReturnType<typeof signInFirebaseEmailUser>>)
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('account@example.test', 'test-password', false, 'ADMIN')).error).toContain('not verified') })
  expect(reload).toHaveBeenCalledTimes(1)
  expect(apiFirebaseLogin).not.toHaveBeenCalled()
  expect(auth.user).toBeNull()
})

test('a normal user cannot enter Admin by choosing the Admin tab', async () => {
  vi.mocked(signInFirebaseEmailUser).mockResolvedValue({ user: {
    email: 'account@example.test', emailVerified: true, getIdToken: async () => 'test-id-token',
  } } as unknown as Awaited<ReturnType<typeof signInFirebaseEmailUser>>)
  vi.mocked(apiFirebaseLogin).mockResolvedValue({ access_token: 'verified-server-token', token_type: 'bearer',
    user: { name: 'Account', email: 'account@example.test', role: 'PUBLIC', plan: 'FREE' },
  })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('account@example.test', 'test-password', false, 'ADMIN')).error).toContain('not authorized') })
  expect(auth.user).toBeNull()
  expect(auth.token).toBeNull()
})

test('401 recovery waits for Firebase persistence before checking the signed-in identity', async () => {
  const user = { name: 'Account', email: 'account@example.test', role: 'PUBLIC', plan: 'FREE' } as const
  localStorage.setItem('aeroprice_auth', JSON.stringify(user))
  localStorage.setItem('aeroprice_token', 'stale-token')
  localStorage.setItem('aeroprice_firebase_session', '1')
  let restore!: (token: string | null) => void
  vi.mocked(getFirebaseIdToken).mockImplementation(force => force
    ? new Promise(resolve => { restore = resolve }) : Promise.resolve(null))
  vi.mocked(apiFirebaseLogin).mockResolvedValue({ access_token: 'new-token', token_type: 'bearer', user })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => {})
  const refresh = vi.mocked(setApiAuthTokenRefresher).mock.calls.at(-1)![0]!
  const result = refresh('stale-token')
  expect(apiFirebaseLogin).not.toHaveBeenCalled()
  vi.mocked(getFirebaseAuth).mockReturnValue({ currentUser: { email: user.email } } as ReturnType<typeof getFirebaseAuth>)
  await act(async () => { restore('fresh-firebase-token'); expect(await result).toBe('new-token') })
  expect(apiFirebaseLogin).toHaveBeenCalledWith('fresh-firebase-token')
  expect(auth.token).toBe('new-token')
})

test('server snapshot updates Premium entitlement without another sign-in', async () => {
  const user = { name: 'Account', email: 'account@example.test', role: 'PUBLIC', plan: 'FREE' } as const
  sessionStorage.setItem('aeroprice_session_auth', JSON.stringify(user))
  sessionStorage.setItem('aeroprice_session_token', 'valid-token')
  vi.mocked(apiCurrentUser).mockResolvedValue({ ...user, plan: 'SUBSCRIBER' })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => {})
  expect(auth.user?.plan).toBe('SUBSCRIBER')
  expect(auth.user?.role).toBe('PUBLIC')
  expect(JSON.parse(sessionStorage.getItem('aeroprice_session_auth')!).plan).toBe('SUBSCRIBER')
  act(() => auth.logout())
  expect(clearApiAuthSession).toHaveBeenCalled()
})

test('startup verification rejection discards the stale shell without a stale login banner', async () => {
  localStorage.setItem('aeroprice_auth', JSON.stringify({ name: 'Account', email: 'account@example.test', role: 'PUBLIC', plan: 'FREE' }))
  localStorage.setItem('aeroprice_token', 'unverified-firebase-token')
  localStorage.setItem('aeroprice_firebase_session', '1')
  vi.mocked(getFirebaseIdToken).mockResolvedValue('unverified-firebase-token')
  vi.mocked(getFirebaseAuth).mockReturnValue({ currentUser: { email: 'account@example.test' } } as ReturnType<typeof getFirebaseAuth>)
  vi.mocked(apiFirebaseLogin).mockRejectedValue(Object.assign(new Error('Please verify your email address before signing in.'), { status: 403 }))
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => {})
  expect(auth.user).toBeNull()
  expect(auth.token).toBeNull()
  expect(sessionStorage.getItem('aeroprice_auth_notice')).toBeNull()
})
