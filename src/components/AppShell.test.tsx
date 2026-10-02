import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import AppShell, { type Page } from './AppShell'

const { identity } = vi.hoisted(() => ({
  identity: { role: 'ADMIN', plan: 'ADMIN' },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { ...identity, email: 'admin@example.test', name: 'Test Admin' }, token: 'test-token', logout: vi.fn() }),
  canAccess: () => true,
}))
vi.mock('../hooks/useGovData', () => ({ useGovData: () => ({ datasets: [], anyConnected: false, isLoading: false }) }))
vi.mock('../services/aviationRadar', () => ({ useAviationRadar: () => ({ aircraft: [] }) }))
vi.mock('./DataStatusBanner', () => ({ default: () => null }))
vi.mock('./UserSupportModal', () => ({
  default: ({ mode }: { mode: string }) => mode === 'feedback'
    ? <div role="dialog" aria-label="New feedback workflow" />
    : null,
}))
vi.mock('../services/api', () => ({
  apiHealth: vi.fn(async () => ({ status: 'ok', database: 'connected', real_observations: 0 })),
  apiNotifications: vi.fn(async () => ({ notifications: [], unread_count: 0, total: 0 })),
  apiRouteBasket: vi.fn(async () => ({ routes: [] })),
  apiMarkAllNotificationsRead: vi.fn(),
  apiMarkNotificationRead: vi.fn(),
}))

const api = await import('../services/api')

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')
beforeEach(() => {
  // jsdom does not implement element scrolling; browsers do.
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  localStorage.clear()
  sessionStorage.clear()
  identity.role = 'ADMIN'
  identity.plan = 'ADMIN'
})
afterEach(() => {
  cleanup()
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

test.each(['aviationlive', 'aviationflights', 'aviationairports'] as Page[])(
  '%s sidebar contains aviation modules only', async currentPage => {
    const view = render(<AppShell currentPage={currentPage} onNavigate={vi.fn()}><div>Aviation page</div></AppShell>)
    await act(async () => {})
    const sidebar = within(view.container.querySelector('.app-sidebar-nav') as HTMLElement)

    expect(sidebar.getByRole('button', { name: 'Live Flight Map' })).toBeTruthy()
    expect(sidebar.getByRole('button', { name: 'Reports & Export' })).toBeTruthy()
    expect(sidebar.queryByText('GOVERNMENT MODULES')).toBeNull()
    for (const label of ['Airfare Index', 'Market Insights', 'Data Sources']) {
      expect(sidebar.queryByRole('button', { name: label })).toBeNull()
    }
    await vi.waitFor(() => expect(view.container.textContent).toContain('Aviation page'))
  },
)

test('Government retains its airfare and market links', async () => {
  const view = render(<AppShell currentPage="overview" onNavigate={vi.fn()}><div>Government page</div></AppShell>)
  await act(async () => {})
  const sidebar = within(view.container.querySelector('.app-sidebar-nav') as HTMLElement)
  expect(sidebar.getByRole('button', { name: 'Airfare Index' })).toBeTruthy()
  expect(sidebar.getByRole('button', { name: 'Market Insights' })).toBeTruthy()
})

test('Admin retains its Data Sources link', async () => {
  const view = render(<AppShell currentPage="admin" onNavigate={vi.fn()}><div>Admin page</div></AppShell>)
  await act(async () => {})
  const sidebar = within(view.container.querySelector('.app-sidebar-nav') as HTMLElement)
  expect(sidebar.getByRole('button', { name: 'Data Sources' })).toBeTruthy()
})

test.each([
  ['PUBLIC', 'FREE'],
  ['ANALYST', 'GOVERNMENT'],
] as const)('%s can open the new feedback workflow from its portal sidebar', async (role, plan) => {
  identity.role = role
  identity.plan = plan
  const view = render(<AppShell currentPage="overview" onNavigate={vi.fn()}><div>Portal page</div></AppShell>)
  await act(async () => {})
  const sidebar = within(view.container.querySelector('.app-sidebar-nav') as HTMLElement)
  fireEvent.click(sidebar.getByRole('button', { name: 'Feedback' }))
  expect(view.getByRole('dialog', { name: 'New feedback workflow' })).toBeTruthy()
})

test('notification badge and read operation use the authoritative backend count', async () => {
  vi.mocked(api.apiNotifications).mockResolvedValue({ notifications: [{ id: 'notice-1', title: 'Premium approved', message: 'Premium access is ready.', created_at: '2026-10-02T10:00:00Z', read: false }], unread_count: 12, total: 12 })
  const view = render(<AppShell currentPage="overview" onNavigate={vi.fn()}><div>Portal page</div></AppShell>)
  await vi.waitFor(() => expect(view.getByRole('button', { name: 'Notifications' }).textContent).toContain('12'))
  fireEvent.click(view.getByRole('button', { name: 'Notifications' }))
  expect(view.getByRole('dialog', { name: 'Notifications' })).toBeTruthy()
  fireEvent.click(view.getByRole('button', { name: 'Mark all read' }))
  await vi.waitFor(() => expect(api.apiMarkAllNotificationsRead).toHaveBeenCalledWith('test-token'))
})
