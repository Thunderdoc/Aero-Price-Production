import { useState } from 'react'
import AppShell from './components/AppShell'
import type { Page } from './components/AppShell'
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

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('overview')

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
      case 'methodology': return <Methodology />
      case 'exports':     return <Exports />
      case 'admin':       return <AdminDashboard />
    }
  }

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </AppShell>
  )
}
