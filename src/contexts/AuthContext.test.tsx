import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { AUTH_EXPIRED_EVENT, apiFirebaseLogin, apiLogin } from '../services/api'
import { getFirebaseSignInMethods, signInFirebaseEmailUser, signInWithGooglePopup } from '../services/firebase'

vi.hoisted(() => { vi.stubEnv('VITE_AUTH_MODE', 'backend') })

vi.mock('../services/firebase', () => ({
  FIREBASE_CONFIGURED: true,
  getFirebaseAuth: vi.fn().mockReturnValue(null),
  getFirebaseIdToken: vi.fn().mockResolvedValue(null),
  getGoogleRedirectResult: vi.fn().mockResolvedValue(null),
  signInFirebaseEmailUser: vi.fn(),
  getFirebaseSignInMethods: vi.fn(),
  signInWithGooglePopup: vi.fn(),
  linkPasswordToCurrentFirebaseUser: vi.fn(),
  signOutFirebaseUser: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api')
  return { ...actual, apiFirebaseLogin: vi.fn(), apiLogin: vi.fn(), apiCurrentUser: vi.fn() }
})

let auth: ReturnType<typeof useAuth>
function Consumer() {
  auth = useAuth()
  return <div>{auth.user ? `dashboard:${auth.user.role}:${auth.token}` : 'login'}</div>
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.resetAllMocks()
  vi.mocked(signInFirebaseEmailUser).mockRejectedValue({ code: 'auth/invalid-credential' })
})
afterEach(cleanup)

test('Google login uses the backend-confirmed role and keeps a valid session', async () => {
  vi.mocked(signInWithGooglePopup).mockResolvedValue({
    user: { email: 'analyst@example.test', displayName: 'Analyst', getIdToken: async () => 'firebase-token' },
  } as Awaited<ReturnType<typeof signInWithGooglePopup>>)
  vi.mocked(apiFirebaseLogin).mockResolvedValue({
    access_token: 'server-token',
    token_type: 'bearer',
    user: { email: 'analyst@example.test', name: 'Analyst', role: 'ANALYST', plan: 'GOVERNMENT' },
  })

  const view = render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.loginWithGoogle('DGCA')).success).toBe(true) })
  expect(view.container.textContent).toBe('dashboard:ANALYST:server-token')
  expect(localStorage.getItem('aeroprice_token')).toBe('server-token')

  act(() => window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { token: 'server-token' } })))
  expect(view.container.textContent).toBe('dashboard:ANALYST:server-token')
})

test('temporary backend failure retains Firebase identity instead of signing out', async () => {
  vi.mocked(signInWithGooglePopup).mockResolvedValue({
    user: { email: 'user@example.test', displayName: 'User', getIdToken: async () => 'firebase-token' },
  } as Awaited<ReturnType<typeof signInWithGooglePopup>>)
  vi.mocked(apiFirebaseLogin).mockRejectedValue(new Error('Backend unavailable'))

  const view = render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.loginWithGoogle('USER')).success).toBe(true) })
  expect(view.container.textContent).toBe('dashboard:PUBLIC:firebase-token')
})

test.each([
  ['USER', 'PUBLIC', 'FREE'],
  ['DGCA', 'ANALYST', 'GOVERNMENT'],
  ['ADMIN', 'ADMIN', 'ADMIN'],
] as const)('%s backend login survives a background 401', async (workspace, role, plan) => {
  vi.mocked(apiLogin).mockResolvedValue({
    access_token: `${workspace}-token`, token_type: 'bearer',
    user: { email: 'new@example.test', name: 'New Account', role, plan },
  })
  const view = render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('new@example.test', 'secret123', false, workspace)).success).toBe(true) })
  expect(view.container.textContent).toBe(`dashboard:${role}:${workspace}-token`)
  act(() => window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { token: `${workspace}-token` } })))
  expect(view.container.textContent).toBe(`dashboard:${role}:${workspace}-token`)
  expect(sessionStorage.getItem('aeroprice_session_token')).toBe(`${workspace}-token`)
})

test.each([401, 403])('Google exchange rejection (%s) never creates a fake signed-in session', async status => {
  vi.mocked(signInWithGooglePopup).mockResolvedValue({
    user: { email: 'user@example.test', displayName: 'User', getIdToken: async () => 'firebase-token' },
  } as Awaited<ReturnType<typeof signInWithGooglePopup>>)
  vi.mocked(apiFirebaseLogin).mockRejectedValue(Object.assign(new Error('Please verify your email address before signing in.'), { status }))
  const view = render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.loginWithGoogle('USER')).success).toBe(false) })
  expect(view.container.textContent).toBe('login')
  expect(localStorage.getItem('aeroprice_token')).toBeNull()
})

test.each(['Incorrect email or password', 'Too many login attempts. Try again later.'])('backend rejection is returned after one request: %s', async (message) => {
  vi.mocked(apiLogin).mockRejectedValue(new Error(message))
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => {
    expect(await auth.login('admin@example.test', 'test-password', false, 'ADMIN')).toEqual({ success: false, error: message })
  })
  expect(apiLogin).toHaveBeenCalledTimes(1)
  expect(auth.user).toBeNull()
})

test('Firebase password sign-in verifies the server role without extra discovery or backend password requests', async () => {
  vi.mocked(signInFirebaseEmailUser).mockResolvedValue({ user: {
    email: 'admin@example.test', displayName: 'Admin', emailVerified: true,
    getIdToken: vi.fn().mockResolvedValue('firebase-token'),
  } } as unknown as Awaited<ReturnType<typeof signInFirebaseEmailUser>>)
  vi.mocked(apiFirebaseLogin).mockResolvedValue({ access_token: 'verified-token', token_type: 'bearer',
    user: { name: 'Admin', email: 'admin@example.test', role: 'ADMIN', plan: 'ADMIN' },
  })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => {
    const result = await auth.login('admin@example.test', 'reset-password', false, 'ADMIN')
    expect({ result, providerCalls: vi.mocked(signInFirebaseEmailUser).mock.calls.length, exchangeCalls: vi.mocked(apiFirebaseLogin).mock.calls.length }).toMatchObject({ result: { success: true }, providerCalls: 1, exchangeCalls: 1 })
  })
  expect(apiFirebaseLogin).toHaveBeenCalledTimes(1)
  expect(apiLogin).not.toHaveBeenCalled()
  expect(getFirebaseSignInMethods).not.toHaveBeenCalled()
  expect(auth.user?.role).toBe('ADMIN')
})

test('Firebase credential rejection tries a legacy backend account only once, without an extra provider lookup', async () => {
  vi.mocked(signInFirebaseEmailUser).mockRejectedValue({ code: 'auth/invalid-credential' })
  vi.mocked(apiLogin).mockResolvedValue({ access_token: 'legacy-token', token_type: 'bearer',
    user: { name: 'Admin', email: 'admin@example.test', role: 'ADMIN', plan: 'ADMIN' },
  })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('admin@example.test', 'test-password', false, 'ADMIN')).success).toBe(true) })
  expect(signInFirebaseEmailUser).toHaveBeenCalledTimes(1)
  expect(apiLogin).toHaveBeenCalledTimes(1)
  expect(getFirebaseSignInMethods).not.toHaveBeenCalled()
})

test('a session exchange failure never retries an accepted Firebase password against the backend', async () => {
  vi.mocked(signInFirebaseEmailUser).mockResolvedValue({ user: {
    email: 'admin@example.test', emailVerified: true, getIdToken: async () => 'firebase-token',
  } } as Awaited<ReturnType<typeof signInFirebaseEmailUser>>)
  const message = 'Sign-in verification is temporarily unavailable. Please retry.'
  vi.mocked(apiFirebaseLogin).mockRejectedValue(new Error(message))
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect(await auth.login('admin@example.test', 'reset-password', false, 'ADMIN')).toEqual({ success: false, error: message }) })
  expect(apiFirebaseLogin).toHaveBeenCalledTimes(1)
  expect(apiLogin).not.toHaveBeenCalled()
  expect(auth.user).toBeNull()
})

test.each(['auth/too-many-requests', 'auth/network-request-failed'])('Firebase %s errors do not trigger unrelated password requests', async (code) => {
  vi.mocked(signInFirebaseEmailUser).mockRejectedValue({ code })
  render(<AuthProvider><Consumer /></AuthProvider>)
  await act(async () => { expect((await auth.login('admin@example.test', 'test-password', false, 'ADMIN')).success).toBe(false) })
  expect(apiLogin).not.toHaveBeenCalled()
  expect(getFirebaseSignInMethods).not.toHaveBeenCalled()
})
