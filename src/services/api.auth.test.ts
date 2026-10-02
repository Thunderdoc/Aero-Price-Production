import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { apiFirebaseLogin, apiLogin, apiSubmitFeedback, clearApiAuthSession, setApiAuthTokenRefresher } from './api'

const fetchMock = vi.fn<typeof fetch>()
const authCalls = [
  ['password', () => apiLogin('account@example.test', 'test-password')],
  ['Firebase exchange', () => apiFirebaseLogin('test-id-token')],
] as const

beforeEach(() => { clearApiAuthSession(); vi.useFakeTimers(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { setApiAuthTokenRefresher(null); vi.useRealTimers(); vi.unstubAllGlobals() })

test('feedback retries once with a refreshed session and reaches the feedback endpoint', async () => {
  const refresh = vi.fn().mockResolvedValue('fresh-server-token')
  setApiAuthTokenRefresher(refresh)
  fetchMock.mockResolvedValueOnce(new Response('{"detail":"expired"}', { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'feedback-1', status: 'NEW', created_at: '2026-10-02T00:00:00Z' })))

  await expect(apiSubmitFeedback({ title: 'Route filter', message: 'It does not work', category: 'BUG' }, 'expired-token'))
    .resolves.toMatchObject({ id: 'feedback-1', status: 'NEW' })

  expect(refresh).toHaveBeenCalledOnce()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[0][0]).toContain('/api/admin/feedback')
  expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer fresh-server-token')
  // A second component may still hold the old token after React has replaced
  // the refresher. It must reuse the completed renewal, not fail spuriously.
  setApiAuthTokenRefresher(null)
  fetchMock.mockResolvedValueOnce(new Response('{"detail":"expired"}', { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'feedback-2', status: 'NEW' })))
  await expect(apiSubmitFeedback({ title: 'Late request', message: 'Details', category: 'BUG' }, 'expired-token')).resolves.toMatchObject({ id: 'feedback-2' })
  expect(refresh).toHaveBeenCalledOnce()
})

test.each(authCalls)('%s finishes as soon as a verified response arrives, without a delay timer', async (_label, signIn) => {
  const session = { access_token: 'test-server-token', token_type: 'bearer',
    user: { email: 'account@example.test', name: 'Account', role: 'PUBLIC', plan: 'FREE' },
  }
  fetchMock.mockResolvedValue(new Response(JSON.stringify(session)))
  expect(await signIn()).toEqual(session)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test.each(authCalls)('%s cancels an unresponsive request after 15 seconds instead of spinning indefinitely', async (_label, signIn) => {
  fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const result = signIn().catch((error: Error) => error.message)
  await vi.advanceTimersByTimeAsync(14_999)
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(await result).toBe('Sign-in verification timed out. Check your connection and try again.')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test.each(authCalls)('%s preserves a real server error and does not automatically retry it', async (_label, signIn) => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Too many login attempts. Try again later.' }), { status: 429 }))
  await expect(signIn()).rejects.toThrow('Too many login attempts. Try again later.')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

test.each(authCalls)('%s preserves a network error and clears the pending timer', async (_label, signIn) => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(signIn()).rejects.toThrow('Failed to fetch')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
