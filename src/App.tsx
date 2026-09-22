import { useState, useEffect } from 'react'
import { AuthProvider, useAuth, canAccess } from './contexts/AuthContext'
import AppShell from './components/AppShell'
import type { Page } from './components/AppShell'
import LoginPage from './pages/LoginPage'
import Overview from './pages/Overview'
import AirfareMap from './pages/AirfareMap'
import RouteExplorer from './pages/RouteExplorer'
import GovernmentIntelligence from './pages/GovernmentIntelligence'
import MarketInsights from './pages/MarketInsights'
import PriceAlerts from './pages/PriceAlerts'
import DataSources from './pages/DataSources'
import Collection from './pages/Collection'
import Methodology from './pages/Methodology'
import Exports from './pages/Exports'
import AdminDashboard from './pages/AdminDashboard'
import LiveFares from './pages/LiveFares'
import Anomalies from './pages/Anomalies'
import Forecast from './pages/Forecast'
import HistoricalFares from './pages/HistoricalFares'
import AirfareIndex from './pages/AirfareIndex'
import AirlineExplorer from './pages/AirlineExplorer'
import BookingWindow from './pages/BookingWindow'
import AviationLive from './pages/AviationLive'
import AviationFlights from './pages/AviationFlights'
import AviationAirports from './pages/AviationAirports'

function AppContent() {
  const { user } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('overview')

  useEffect(() => {
    if (!user) {
      document.title = 'AeroPrice · Secure Access'
      return
    }
    const titles: Record<Page, string> = {
      overview: 'Overview', map: 'India Map', routes: 'Route Explorer',
      government: 'Gov Intelligence', insights: 'Market Insights',
      alerts: 'Price Alerts', sources: 'Data Sources', collection: 'Collection',
      methodology: 'Methodology', exports: 'Exports', admin: 'Admin Console',
      livefares: 'Live Fares', anomalies: 'Anomalies', forecast: 'Forecast',
      historicalfares: 'Historical Fares', airfareindex: 'Airfare Index',
      airlineexplorer: 'Airline Explorer', bookingwindow: 'Booking Windows',
      aviationlive: 'Live Flight Map', aviationflights: 'Flights', aviationairports: 'Airports',
    }
    document.title = `AeroPrice · ${titles[currentPage] ?? 'India'}`
  }, [currentPage, user])

  useEffect(() => {
    if (user && !canAccess(user.role, user.plan, currentPage)) {
      setCurrentPage('overview')
    }
  }, [currentPage, user])

  if (!user) {
    return <LoginPage onLogin={(page = 'overview') => setCurrentPage(page)} />
  }

  if (!canAccess(user.role, user.plan, currentPage)) {
    return (
      <AppShell currentPage="overview" onNavigate={setCurrentPage}>
        <Overview onNavigate={setCurrentPage} />
      </AppShell>
    )
  }

  function renderPage() {
    switch (currentPage) {
      case 'overview':    return <Overview onNavigate={setCurrentPage} />
      case 'map':         return <AirfareMap />
      case 'routes':      return <RouteExplorer />
      case 'government':  return <GovernmentIntelligence />
      case 'insights':    return <MarketInsights />
      case 'alerts':      return <PriceAlerts />
      case 'sources':     return <DataSources />
      case 'collection':  return <Collection />
      case 'methodology': return <Methodology onNavigate={setCurrentPage} />
      case 'exports':     return <Exports />
      case 'admin':       return <AdminDashboard />
      case 'livefares':   return <LiveFares />
      case 'anomalies':   return <Anomalies />
      case 'forecast':        return <Forecast />
      case 'historicalfares':   return <HistoricalFares />
      case 'airfareindex':      return <AirfareIndex />
      case 'airlineexplorer':   return <AirlineExplorer />
      case 'bookingwindow':     return <BookingWindow />
      case 'aviationlive':      return <AviationLive />
      case 'aviationflights':   return <AviationFlights />
      case 'aviationairports':  return <AviationAirports />
    }
  }

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </AppShell>
  )
}

export default function App() {
  useEffect(() => {
    void import('./services/firebase').then(({ initFirebaseAnalytics }) => initFirebaseAnalytics())
  }, [])

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
