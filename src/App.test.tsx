import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

// ITEM 4: guests deep-linking LiveFares/Aviation. The pages are mocked so
// the test pins App's routing/guest logic, not the pages themselves —
// whether a page mounts at all is the behaviour under test.
const authState = vi.hoisted(() => ({ user: null as { email: string } | null, token: null as string | null }))
vi.mock('./contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => authState,
  canAccess: (role: string, _plan: string, page: string) =>
    !['collection', 'admin'].includes(page) || role === 'ADMIN',
}))
vi.mock('./pages/LoginPage', () => ({
  default: ({ onGuest }: { onGuest?: () => void }) => (
    <div>
      <div>LOGIN PAGE</div>
      {onGuest && <button onClick={onGuest}>Browse as guest</button>}
    </div>
  ),
}))
// The shell mock keeps the real contract App relies on: it renders children
// and offers navigation through onNavigate (the sidebar's job).
vi.mock('./components/AppShell', () => ({
  default: ({ currentPage, onNavigate, children }: { currentPage: string; onNavigate: (page: string) => void; children: React.ReactNode }) => (
    <div data-testid="shell" data-page={currentPage}>
      <button onClick={() => onNavigate('livefares')}>Go LiveFares</button>
      <button onClick={() => onNavigate('aviationlive')}>Go AviationLive</button>
      {children}
    </div>
  ),
}))
vi.mock('./pages/Overview', () => ({ default: () => <div>OVERVIEW PAGE</div> }))
vi.mock('./pages/LiveFares', () => ({ default: () => <div>LIVEFARES PAGE</div> }))
vi.mock('./pages/AviationLive', () => ({ default: () => <div>AVIATIONLIVE PAGE</div> }))
vi.mock('./pages/RouteExplorer', () => ({ default: () => <div>ROUTEEXPLORER PAGE</div> }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

async function enterAsGuest() {
  fireEvent.click(await screen.findByText('Browse as guest'))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  authState.user = null
  authState.token = null
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('ITEM 4: a guest deep-linking LiveFares sees LiveFares — its endpoints are public-read', async () => {
  // GET /api/fares carries no auth dependency and the health probe is
  // public, so a guest on this page fires no 401 at all. Clamping them to
  // Overview (which fires auth-gated index/aviation calls) was worse.
  // Follow-up (23 Nov 2026): the deep link auto-enters guest mode — no
  // click on the login page's "Browse as guest" link is needed, and the
  // sign-in wall never appears.
  renderAt('/livefares')
  expect(await screen.findByText('LIVEFARES PAGE')).toBeTruthy()
  expect(screen.queryByText('LOGIN PAGE')).toBeNull()
  expect(screen.queryByText('OVERVIEW PAGE')).toBeNull()
  expect(screen.getByTestId('shell').getAttribute('data-page')).toBe('livefares')
})

test('ITEM 4: a guest deep-linking Aviation is clamped to the guest Overview — aviation needs auth', async () => {
  // /api/aviation/live requires a Bearer token, so AviationLive can never
  // be a guest page. The clamp must keep the guest off it entirely: the
  // page must not mount (and therefore must not fetch) at all.
  renderAt('/aviationlive')
  await enterAsGuest()
  expect(await screen.findByText('OVERVIEW PAGE')).toBeTruthy()
  expect(screen.queryByText('AVIATIONLIVE PAGE')).toBeNull()
  expect(screen.getByTestId('shell').getAttribute('data-page')).toBe('overview')
})

test('ITEM 4: a guest navigating to a non-guest page gets the honest sign-in prompt', async () => {
  renderAt('/routes')
  expect(await screen.findByText('ROUTEEXPLORER PAGE')).toBeTruthy()
  // The sidebar offers Aviation; a guest asking for it wants an account
  // feature, so App sends them back to the login page — never to a 401.
  // The login page must STAY: without the suppress flag the deep-link
  // auto-enter would bounce straight back to guest mode on /routes.
  fireEvent.click(screen.getByText('Go AviationLive'))
  expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
  expect(screen.queryByText('AVIATIONLIVE PAGE')).toBeNull()
  expect(screen.queryByText('ROUTEEXPLORER PAGE')).toBeNull()
})

test('ITEM 4: a guest deep-linking a guest page renders it directly', async () => {
  renderAt('/routes')
  expect(await screen.findByText('ROUTEEXPLORER PAGE')).toBeTruthy()
  expect(screen.queryByText('LOGIN PAGE')).toBeNull()
})

test('guest deep-link: a bare home load still shows the login page first', async () => {
  // '/' (overview) is deliberately excluded from auto-enter: the login
  // page stays the first screen for a bare visit. Only a real deep link
  // to another guest page auto-enters guest mode.
  renderAt('/')
  expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
  expect(screen.queryByText('OVERVIEW PAGE')).toBeNull()
})

test('guest deep-link: Sign in from a guest page shows the login page and it stays', async () => {
  // The guest banner's Sign in button exits guest mode. The auto-enter
  // must not bounce the visitor straight back into guest mode on the
  // same guest page — otherwise Sign in could never land on login.
  renderAt('/livefares')
  expect(await screen.findByText('LIVEFARES PAGE')).toBeTruthy()
  fireEvent.click(screen.getByText('Sign in'))
  expect(await screen.findByText('LOGIN PAGE')).toBeTruthy()
  expect(screen.queryByText('LIVEFARES PAGE')).toBeNull()
})
