import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth, canAccess } from './contexts/AuthContext'
import AppShell from './components/AppShell'
import type { Page } from './components/AppShell'
import LoginPage from './pages/LoginPage'

// Code splitting (Phase 4): every authenticated page is a lazy chunk behind
// Suspense, so the first paint ships only the shell + login. Heavy vendor
// libs (leaflet, jspdf, firebase) ride in their own chunks via manualChunks
// in vite.config.ts. LoginPage stays static — it is the first screen for
// signed-out visitors.
const Overview = lazy(() => import('./pages/Overview'))
const AirfareMap = lazy(() => import('./pages/AirfareMap'))
const RouteExplorer = lazy(() => import('./pages/RouteExplorer'))
const GovernmentIntelligence = lazy(() => import('./pages/GovernmentIntelligence'))
const MarketInsights = lazy(() => import('./pages/MarketInsights'))
const PriceAlerts = lazy(() => import('./pages/PriceAlerts'))
const DataSources = lazy(() => import('./pages/DataSources'))
const Collection = lazy(() => import('./pages/Collection'))
const Methodology = lazy(() => import('./pages/Methodology'))
const Exports = lazy(() => import('./pages/Exports'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const LiveFares = lazy(() => import('./pages/LiveFares'))
const Anomalies = lazy(() => import('./pages/Anomalies'))
const Forecast = lazy(() => import('./pages/Forecast'))
const HistoricalFares = lazy(() => import('./pages/HistoricalFares'))
const TravelHistory = lazy(() => import('./pages/TravelHistory'))
const AirfareIndex = lazy(() => import('./pages/AirfareIndex'))
const AirlineExplorer = lazy(() => import('./pages/AirlineExplorer'))
const BookingWindow = lazy(() => import('./pages/BookingWindow'))
const AviationLive = lazy(() => import('./pages/AviationLive'))
const AviationFlights = lazy(() => import('./pages/AviationFlights'))
const AviationAirports = lazy(() => import('./pages/AviationAirports'))

// Router (Phase 4): HashRouter (see main.tsx) — hash routing works on any
// static host with no server rewrites. The URL is the source of truth for
// the current page, so deep links and back/forward work; the stored page
// is only a restore hint for a bare '/' load.
const PAGE_PATHS: Record<Page, string> = {
  overview: '/',
  map: '/map',
  routes: '/routes',
  government: '/government',
  insights: '/insights',
  alerts: '/alerts',
  sources: '/sources',
  collection: '/collection',
  methodology: '/methodology',
  exports: '/exports',
  admin: '/admin',
  livefares: '/livefares',
  anomalies: '/anomalies',
  forecast: '/forecast',
  historicalfares: '/historicalfares',
  recentsearches: '/recentsearches',
  airfareindex: '/airfareindex',
  airlineexplorer: '/airlineexplorer',
  bookingwindow: '/bookingwindow',
  aviationlive: '/aviationlive',
  aviationflights: '/aviationflights',
  aviationairports: '/aviationairports',
}

const PATH_PAGES: Record<string, Page> = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page as Page]),
)

function pathToPage(pathname: string): Page {
  return PATH_PAGES[pathname] ?? 'overview'
}

// Guest view (Phase 3): pages a visitor may browse without an account. Every
// page here reads only endpoints the backend already serves without auth
// (dashboard, fares, routes, fare movement) and renders honestly with no
// token. Anything else routes the guest back to the login page.
// ITEM 4: livefares is in the set — GET /api/fares carries no auth
// dependency and the health probe is public, so a guest on Live Fares fires
// no 401 at all. Aviation stays OUT: /api/aviation/live requires a Bearer
// token, so a guest deep-linking an aviation URL is clamped to Overview by
// the effect below (and sidebar navigation bounces them to the sign-in
// prompt via navigate()). Government stays out: its page calls the
// auth-gated index endpoint and its refresh is analyst-gated. Methodology
// was not evaluated for guest access in this change.
const GUEST_PAGES: Page[] = ['overview', 'routes', 'insights', 'map', 'livefares']

function GuestBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'var(--color-info-bg)', border: '1px solid rgba(3,105,161,0.25)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <span style={{ flex: 1, minWidth: 220 }}>You are browsing as a guest — public data only. Sign in for forecasts, exports, price alerts and analyst tools.</span>
      <button type="button" onClick={onSignIn} style={{ border: 0, borderRadius: 8, padding: '7px 14px', background: 'var(--color-brand-primary)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Sign in</button>
    </div>
  )
}

function PageLoading() {
  return (
    <div role="status" style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
      Loading page…
    </div>
  )
}

function AppContent() {
  const { user } = useAuth()
  const [guest, setGuest] = useState(false)
  const location = useLocation()
  const routerNavigate = useNavigate()
  const currentPage = pathToPage(location.pathname)
  const restoredRef = useRef(false)
  // Set when the visitor deliberately chooses Sign in (the guest banner's
  // button, or a guest asking for an account-only page). It stops the
  // deep-link auto-enter below from bouncing them straight back into guest
  // mode on the same guest page — without it, Sign in could never land on
  // the login page. It stays set for the session: after a deliberate
  // sign-in choice (or a sign-out), the login page is the right screen.
  const suppressAutoGuestRef = useRef(false)

  // Bare '/' load: restore the last-visited page from storage (the pre-router
  // behaviour). A real deep link always wins over the stored page.
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (location.pathname !== '/' && location.pathname !== '') return
    const saved = (sessionStorage.getItem('aeroprice-current-page') || localStorage.getItem('aeroprice-current-page')) as Page | null
    if (saved && saved !== 'overview' && PAGE_PATHS[saved]) {
      routerNavigate(PAGE_PATHS[saved], { replace: true })
    }
    // Mount-only by design (restoredRef guard); the location is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function navigate(page: Page) {
    // A guest asking for a page outside the public set wants an account
    // feature — take them to the login page instead of a dead end. The
    // suppress flag keeps the deep-link auto-enter below from immediately
    // re-entering guest mode on the guest page they came from.
    if (!user && guest && !GUEST_PAGES.includes(page)) {
      suppressAutoGuestRef.current = true
      setGuest(false)
      return
    }
    sessionStorage.setItem('aeroprice-current-page', page)
    localStorage.setItem('aeroprice-current-page', page)
    routerNavigate(PAGE_PATHS[page])
  }

  useEffect(() => {
    sessionStorage.setItem('aeroprice-current-page', currentPage)
    localStorage.setItem('aeroprice-current-page', currentPage)
  }, [currentPage])

  // A guest who deep-links (or refreshes) on a non-guest URL is clamped to
  // the dashboard instead of briefly rendering an account page.
  useEffect(() => {
    if (!user && guest && !GUEST_PAGES.includes(currentPage)) {
      routerNavigate('/', { replace: true })
    }
  }, [currentPage, user, guest, routerNavigate])

  // A signed-out visitor who deep-links to a public page lands in guest
  // mode instead of the sign-in wall — the page they linked to reads only
  // public endpoints, so there is no reason to bounce them through login
  // first. The home page ('/') is deliberately excluded: the login page
  // stays the first screen for a bare visit. This also covers the restore
  // above: a bare load that restores a stored guest page enters guest mode
  // once the URL changes. The suppress flag is what lets a deliberate
  // Sign in choice stick (see suppressAutoGuestRef).
  useEffect(() => {
    if (!user && !guest && !suppressAutoGuestRef.current && currentPage !== 'overview' && GUEST_PAGES.includes(currentPage)) {
      setGuest(true)
    }
  }, [currentPage, user, guest])

  // Leaving guest mode for the login page (banner Sign in / shell sign-in):
  // the suppress flag stops the auto-enter above from bouncing straight
  // back into guest mode on the same guest page.
  function exitGuestToSignIn() {
    suppressAutoGuestRef.current = true
    setGuest(false)
  }

  useEffect(() => {
    if (!user && !guest) {
      document.title = 'AeroPrice · Secure Access'
      return
    }
    const titles: Record<Page, string> = {
      overview: 'Overview', map: 'India Map', routes: 'Route Explorer',
      government: 'Gov Intelligence', insights: 'Market Insights',
      alerts: 'Price Alerts', sources: 'Data Sources', collection: 'Collection',
      methodology: 'Methodology', exports: 'Exports', admin: 'Admin Console',
      livefares: 'Live Fares', anomalies: 'Anomalies', forecast: 'Forecast',
      historicalfares: 'Historical Fares', recentsearches: 'Recent searches', airfareindex: 'Airfare Index',
      airlineexplorer: 'Airline Explorer', bookingwindow: 'Booking Windows',
      aviationlive: 'Live Flight Map', aviationflights: 'Flights', aviationairports: 'Airports',
    }
    document.title = `AeroPrice · ${titles[currentPage] ?? 'India'}`
  }, [currentPage, user, guest])

  useEffect(() => {
    if (user && !canAccess(user.role, user.plan, currentPage)) {
      navigate('overview')
    }
  }, [currentPage, user])

  // One page map shared by the signed-in <Routes> and the guest branch, so
  // the two can never drift apart.
  function pageElement(page: Page) {
    switch (page) {
      case 'overview':    return <Overview onNavigate={navigate} />
      case 'map':         return <AirfareMap />
      case 'routes':      return <RouteExplorer />
      case 'government':  return <GovernmentIntelligence />
      case 'insights':    return <MarketInsights />
      case 'alerts':      return <PriceAlerts onNavigate={navigate} />
      case 'sources':     return <DataSources />
      case 'collection':  return <Collection />
      case 'methodology': return <Methodology onNavigate={navigate} />
      case 'exports':     return <Exports />
      case 'admin':       return <AdminDashboard />
      case 'livefares':   return <LiveFares />
      case 'anomalies':   return <Anomalies />
      case 'forecast':        return <Forecast />
      case 'historicalfares':   return <HistoricalFares />
      case 'recentsearches':    return <TravelHistory onNavigate={navigate} />
      case 'airfareindex':      return <AirfareIndex />
      case 'airlineexplorer':   return <AirlineExplorer />
      case 'bookingwindow':     return <BookingWindow />
      case 'aviationlive':      return <AviationLive onNavigate={navigate} />
      case 'aviationflights':   return <AviationFlights />
      case 'aviationairports':  return <AviationAirports />
    }
  }

  if (!user) {
    if (guest) {
      const guestPage = GUEST_PAGES.includes(currentPage) ? currentPage : 'overview'
      return (
        <AppShell currentPage={guestPage} onNavigate={navigate} guest onSignIn={exitGuestToSignIn}>
          <GuestBanner onSignIn={exitGuestToSignIn} />
          <div key={guestPage} style={{ minWidth: 0 }}>
            <Suspense fallback={<PageLoading />}>{pageElement(guestPage)}</Suspense>
          </div>
        </AppShell>
      )
    }
    return <LoginPage onLogin={(page = 'overview') => { setGuest(false); navigate(page) }} onGuest={() => setGuest(true)} />
  }

  if (!canAccess(user.role, user.plan, currentPage)) {
    return (
    <AppShell currentPage="overview" onNavigate={navigate}>
        <Suspense fallback={<PageLoading />}><Overview onNavigate={navigate} /></Suspense>
      </AppShell>
    )
  }

  return (
    <AppShell currentPage={currentPage} onNavigate={navigate}>
      <div key={currentPage} style={{ minWidth: 0 }}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            {(Object.keys(PAGE_PATHS) as Page[]).map(page => (
              <Route key={page} path={PAGE_PATHS[page]} element={pageElement(page)} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </AppShell>
  )
}

export default function App() {
  useEffect(() => {
    // Firebase is opt-in for authentication. Do not initialize Analytics on
    // backend-auth deployments, where incomplete Firebase measurement config
    // only creates console errors and can confuse production diagnosis.
    // Analytics is not needed for local auth QA and its Firebase Installations
    // call can fail on localhost even when Authentication is configured.
    if (import.meta.env.VITE_AUTH_MODE !== 'firebase' || import.meta.env.DEV) return
    void import('./services/firebase').then(({ initFirebaseAnalytics }) => initFirebaseAnalytics())
  }, [])

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
