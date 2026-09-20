import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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

function AppContent() {
  const { user } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('overview')

  useEffect(() => {
    const titles: Record<Page, string> = {
      overview: 'Overview', map: 'India Map', routes: 'Route Explorer',
      government: 'Gov Intelligence', insights: 'Market Insights',
      alerts: 'Price Alerts', sources: 'Data Sources', collection: 'Collection',
      methodology: 'Methodology', exports: 'Exports', admin: 'Admin Console',
      livefares: 'Live Fares', anomalies: 'Anomalies', forecast: 'Forecast',
      historicalfares: 'Historical Fares',
    }
    document.title = `AeroPrice · ${titles[currentPage] ?? 'India'}`
  }, [currentPage])

  if (!user) {
    return <LoginPage onLogin={() => setCurrentPage('overview')} />
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
      case 'historicalfares': return <HistoricalFares />
    }
  }

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
