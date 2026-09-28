import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { AUTH_EXPIRED_EVENT, apiFirebaseLogin } from '../services/api'
import { signInWithGooglePopup } from '../services/firebase'

vi.mock('../services/firebase', () => ({
  signInWithGooglePopup: vi.fn(),
  linkPasswordToCurrentFirebaseUser: vi.fn(),
}))
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api')
  return { ...actual, apiFirebaseLogin: vi.fn() }
})

let auth: ReturnType<typeof useAuth>
function Consumer() {
  auth = useAuth()
  return <div>{auth.user ? `dashboard:${auth.user.role}:${auth.token}` : 'login'}</div>
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.resetAllMocks() })
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
