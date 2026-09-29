import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BarChart3, Bell, CalendarDays, CheckCircle2, GitBranch, Map as MapIcon, Plane, Tag, TrendingDown, TrendingUp } from 'lucide-react'
import UpgradeModal from '../components/UpgradeModal'
import { useAuth } from '../contexts/AuthContext'
import { apiDashboard, apiFareMovement, apiFares, BASE_URL } from '../services/api'

// Version the public hero asset so Vercel/browser caches cannot keep an older
// dashboard image after a deployment.
const DASHBOARD_HERO = '/aviation-hero.png?v=2'
import type { FareMovementResponse, FareMovementStatus } from '../services/api'
import type { Page } from '../components/AppShell'
import indiaMap from '../assets/india_map_clean.png'

type Props = { onNavigate: (p: Page) => void }
type RouteCard = { key: string; code: string; name: string; fare: number | null; minFare: number | null; maxFare: number | null; sampleCount: number }
type GeoFeature = { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }
type GeoCollection = { features?: GeoFeature[] }

const routeSpecs = [
  { key: 'DEL-BOM', code: 'DEL → BOM', name: 'Delhi to Mumbai' },
  { key: 'DEL-BLR', code: 'BLR → DEL', name: 'Bengaluru to Delhi' },
  { key: 'DEL-MAA', code: 'MAA → DEL', name: 'Chennai to Delhi' },
]
const GEOJSON_URL = '/maps/india-states-2019.geojson'
const ROUTE_CACHE_KEY = 'aeroprice:verified-route-cards:v1'
const DASHBOARD_CACHE_KEY = 'aeroprice:verified-dashboard:v1'

const movementColors: Record<FareMovementStatus | 'NO_DATA', string> = {
  SIGNIFICANT_INCREASE: '#d9343e', MODERATE_INCREASE: '#ef7661', STABLE: '#4d8ec4',
  MODERATE_DECREASE: '#39a978', SIGNIFICANT_DECREASE: '#087f68', NO_DATA: '#c8d6e5',
}
const movementLabels: Record<FareMovementStatus | 'NO_DATA', string> = {
  SIGNIFICANT_INCREASE: 'Significant increase', MODERATE_INCREASE: 'Moderate increase', STABLE: 'Stable',
  MODERATE_DECREASE: 'Moderate decrease', SIGNIFICANT_DECREASE: 'Significant decrease', NO_DATA: 'No verified data',
}

function formatFare(fare: number | null) {
  return fare == null ? 'Data unavailable' : `₹${fare.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function readRouteCache(): RouteCard[] | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(ROUTE_CACHE_KEY) || 'null')
    return Array.isArray(value) && value.length === routeSpecs.length ? value : null
  } catch { return null }
}

function readDashboardCache(): { routes_tracked?: number; real_observations?: number; price_drops?: number; index_value?: number | null } | null {
  try {
    const value = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch { return null }
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function nestedPoints(value: unknown, output: Array<[number, number]>) {
  if (!Array.isArray(value)) return
  if (typeof value[0] === 'number' && typeof value[1] === 'number') { output.push([value[0], value[1]]); return }
  value.forEach(item => nestedPoints(item, output))
}

function stateName(feature: GeoFeature) {
  const properties = feature.properties ?? {}
  const name = properties.ST_NM ?? properties.NAME_1 ?? properties.name ?? properties.NAME
  return typeof name === 'string' ? name : ''
}

function fareStateName(mapStateName: string) {
  return mapStateName === 'NCT of Delhi' ? 'Delhi' : mapStateName
}

function featurePath(feature: GeoFeature, project: (point: [number, number]) => string) {
  const geometry = feature.geometry
  if (!geometry?.coordinates) return ''
  const ring = (points: unknown) => {
    const values: string[] = []
    if (Array.isArray(points)) points.forEach(point => {
      if (Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number') values.push(project([point[0], point[1]]))
    })
    return values.length ? `M${values.join('L')}Z` : ''
  }
  if (geometry.type === 'Polygon') return (geometry.coordinates as unknown[]).map(ring).join(' ')
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as unknown[]).flatMap(polygon => (polygon as unknown[]).map(ring)).join(' ')
  return ''
}

function FareMovementMap({ movement }: { movement: FareMovementResponse | null }) {
  const [geoData, setGeoData] = useState<GeoCollection | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(GEOJSON_URL, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('state map unavailable'); return response.json() as Promise<GeoCollection> })
      .then(data => { if (!data.features?.length) throw new Error('state map has no features'); setGeoData(data) })
      .catch(error => { if (error.name !== 'AbortError') setMapFailed(true) })
    return () => controller.abort()
  }, [])

  const features = geoData?.features ?? []
  const points: Array<[number, number]> = []
  features.forEach(feature => nestedPoints(feature.geometry?.coordinates, points))
  const bounds = points.length
    ? { minX: Math.min(...points.map(point => point[0])), maxX: Math.max(...points.map(point => point[0])), minY: Math.min(...points.map(point => point[1])), maxY: Math.max(...points.map(point => point[1])) }
    : { minX: 67, maxX: 98, minY: 5, maxY: 38 }
  const mapWidth = 420
  const mapHeight = 320
  const inset = 16
  const scale = Math.min(
    (mapWidth - inset * 2) / Math.max(1, bounds.maxX - bounds.minX),
    (mapHeight - inset * 2) / Math.max(1, bounds.maxY - bounds.minY),
  )
  const offsetX = (mapWidth - (bounds.maxX - bounds.minX) * scale) / 2
  const offsetY = (mapHeight - (bounds.maxY - bounds.minY) * scale) / 2
  const project = (point: [number, number]) => {
    const x = offsetX + (point[0] - bounds.minX) * scale
    const y = mapHeight - offsetY - (point[1] - bounds.minY) * scale
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }

  return <div>
    <div style={{ marginTop: 12, minHeight: 215, display: 'grid', placeItems: 'center', background: '#f5faff', borderRadius: 12, overflow: 'hidden', padding: 8 }}>
      {features.length > 0 ? <svg viewBox="0 0 420 320" role="img" aria-label="India fare movement by state" style={{ width: '100%', height: 220, display: 'block' }}>
        {features.map((feature, index) => {
          const name = stateName(feature)
          const fareState = fareStateName(name)
          const verifiedState = movement?.states[fareState]
          const modeledState = movement?.modeled_states?.[fareState]
          const stateData = verifiedState ?? modeledState
          const status = stateData?.status ?? 'NO_DATA'
          const label = verifiedState ? `${name}: ${stateData!.change_pct > 0 ? '+' : ''}${stateData!.change_pct}% verified movement` : modeledState ? `${name}: ${stateData!.change_pct > 0 ? '+' : ''}${stateData!.change_pct}% modeled price pressure (${modeledState.basis})` : `${name}: ${movementLabels[status]}`
          return <path key={`${name}-${index}`} d={featurePath(feature, project)} fill={status === 'NO_DATA' ? 'var(--map-no-data)' : movementColors[status]} fillOpacity={status === 'NO_DATA' ? 0.62 : verifiedState ? 0.96 : 0.68} stroke="var(--map-state-stroke)" strokeDasharray={modeledState ? '2 1' : undefined} strokeWidth={0.8} vectorEffect="non-scaling-stroke"><title>{label}</title></path>
        })}
      </svg> : <div style={{ width: '100%', textAlign: 'center' }}><img src={indiaMap} alt="India map" style={{ width: '82%', height: 185, objectFit: 'contain', display: 'block', margin: '0 auto' }} />{mapFailed && <div style={{ color: '#6c83a1', fontSize: 11 }}>The state map could not load locally.</div>}</div>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 7, marginTop: 12, fontSize: 10.5, color: '#526987' }}>
      {(['SIGNIFICANT_INCREASE', 'MODERATE_INCREASE', 'STABLE', 'MODERATE_DECREASE', 'SIGNIFICANT_DECREASE', 'NO_DATA'] as const).map(status => <span key={status}><i style={{ background: movementColors[status], display: 'inline-block', width: 9, height: 9, borderRadius: 3, marginRight: 7 }} />{movementLabels[status]}</span>)}
    </div>
    <div style={{ marginTop: 10, padding: '7px 10px', background: 'var(--color-surface-secondary)', borderRadius: 8, color: 'var(--color-text-secondary)', fontSize: 10, textAlign: 'center' }}>
      {movement?.available && movement.previous_period && movement.current_period ? `State colors compare verified route medians from ${movement.previous_period} to ${movement.current_period}.` : 'State colors appear after two verified fare collections; uncovered states remain neutral.'}
    </div>
    {movement?.modeled_states && Object.keys(movement.modeled_states).length > 0 && <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--color-info-bg)', color: 'var(--color-text-secondary)', fontSize: 10, lineHeight: 1.45 }}><b style={{ color: 'var(--color-text-primary)' }}>Dashed state boundaries = modelled price pressure.</b> These states have real current fare observations but need one more collection before a verified price-change movement can be calculated.</div>}
  </div>
}

function FareRangeGraph({ routes }: { routes: RouteCard[] }) {
  const available = routes.filter(route => route.fare != null && route.minFare != null && route.maxFare != null)
  if (!available.length) return <div style={{ minHeight: 165, display: 'grid', placeItems: 'center', color: '#7388a6', fontSize: 12, background: '#fbfdff', borderRadius: 10 }}>No verified fare observations are available for comparison.</div>
  const min = Math.min(...available.map(route => route.minFare as number))
  const max = Math.max(...available.map(route => route.maxFare as number))
  const range = Math.max(1, max - min)
  return <div style={{ display: 'grid', gap: 15, marginTop: 14 }}>{available.map(route => {
    const left = (((route.minFare as number) - min) / range) * 100
    const right = (((route.maxFare as number) - min) / range) * 100
    const marker = (((route.fare as number) - min) / range) * 100
    return <div key={route.key}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}><b style={{ fontSize: 12, color: '#183c78' }}>{route.code}</b><span style={{ fontSize: 11, color: '#6f84a2' }}>median {formatFare(route.fare)} · {route.sampleCount} observations</span></div><div style={{ position: 'relative', height: 12, borderRadius: 99, background: '#edf3fa' }}><div style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(3, right - left)}%`, height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #9ec8f6, #1769e8)' }} /><span title={`Median ${formatFare(route.fare)}`} style={{ position: 'absolute', left: `calc(${marker}% - 5px)`, top: -3, width: 18, height: 18, borderRadius: '50%', background: '#fff', border: '3px solid #1769e8', boxSizing: 'border-box' }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: '#8a9cb3' }}><span>{formatFare(route.minFare)}</span><span>{formatFare(route.maxFare)}</span></div></div>
  })}</div>
}

function ChangeLabel({ change }: { change?: number }) {
  if (change == null) return <span style={{ color: '#8194ad', fontSize: 11 }}>Comparison pending</span>
  const isDrop = change < 0
  const isStable = change === 0
  const color = isStable ? '#4d8ec4' : isDrop ? '#07875d' : '#d9343e'
  return <span style={{ color, fontWeight: 800, fontSize: 11 }}>{isStable ? '• Stable' : `${isDrop ? '↓' : '↑'} ${Math.abs(change).toFixed(2)}%`} <span style={{ color: '#7185a2', fontWeight: 500 }}>vs prior collection</span></span>
}

function IndexTrend({ routes, range }: { routes: RouteCard[]; range: string }) {
  const values = routes.map(route => route.fare).filter((value): value is number => value != null)
  return <div style={{ minHeight: 128, display: 'grid', placeItems: 'center', color: '#7388a6', fontSize: 12, textAlign: 'center' }}>
    {values.length ? `Verified ${range} history is not available yet. The current index and latest collection movement are shown above.` : 'Waiting for verified fare observations.'}
  </div>
}

export default function Overview({ onNavigate }: Props) {
  const dashboardCache = readDashboardCache()
  const { user, token } = useAuth()
  const [routesTracked, setRoutesTracked] = useState<number | null>(dashboardCache?.routes_tracked ?? null)
  const [verifiedObservations, setVerifiedObservations] = useState<number | null>(dashboardCache?.real_observations ?? null)
  const [priceDrops, setPriceDrops] = useState<number | null>(dashboardCache?.price_drops ?? null)
  const [latestIndex, setLatestIndex] = useState<number | null>(dashboardCache?.index_value ?? null)
  const [activeAlerts, setActiveAlerts] = useState<number | null>(null)
  const [fareMovement, setFareMovement] = useState<FareMovementResponse | null>(null)
  const [routeCards, setRouteCards] = useState<RouteCard[]>(() => readRouteCache() ?? routeSpecs.map(route => ({ ...route, fare: null, minFare: null, maxFare: null, sampleCount: 0 })))
  const [showAccess, setShowAccess] = useState(false)
  const [liveAircraft, setLiveAircraft] = useState<number | null>(null)
  const [compactDashboard, setCompactDashboard] = useState(() => localStorage.getItem('aeroprice_compact_mode') === 'true')
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('aeroprice_data_saver') === 'true')
  const [trendRange, setTrendRange] = useState('7D')

  useEffect(() => {
    const refreshPreferences = () => {
      setCompactDashboard(localStorage.getItem('aeroprice_compact_mode') === 'true')
      setDataSaver(localStorage.getItem('aeroprice_data_saver') === 'true')
    }
    window.addEventListener('aeroprice-preferences-changed', refreshPreferences)
    return () => window.removeEventListener('aeroprice-preferences-changed', refreshPreferences)
  }, [])

  useEffect(() => {
    if (!user?.email) { setActiveAlerts(null); return }
    try {
      const stored = JSON.parse(localStorage.getItem(`aeroprice_price_alerts:${user.email}`) || '[]')
      setActiveAlerts(Array.isArray(stored) ? stored.length : 0)
    } catch { setActiveAlerts(0) }
  }, [user?.email])

  useEffect(() => {
    let active = true
    // Do not gate these requests behind a short health probe. Vercel cold
    // starts can exceed the probe timeout while the actual API request still
    // succeeds, which previously left every dashboard KPI stuck at null.
    apiDashboard(token ?? undefined).then(data => {
      if (!active) return
      setRoutesTracked(data.routes_tracked ?? null)
      setVerifiedObservations(data.real_observations ?? null)
      setPriceDrops(data.price_drops ?? null)
      setLatestIndex(data.index_value ?? null)
      try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data)) } catch { /* storage is optional */ }
    }).catch(() => {})
    apiFareMovement(token ?? undefined).then(data => {
      if (!active) return
      setFareMovement(data)
      setPriceDrops(data.price_drops ?? null)
    }).catch(() => {})
    return () => { active = false }
  }, [token])

  useEffect(() => {
    let active = true
    Promise.all(routeSpecs.map(async spec => {
      try {
        const response = await apiFares({ route: spec.key, limit: 200 }, token ?? undefined)
        const fares = response.observations.filter(observation => observation.data_origin === 'REAL' || observation.data_origin === 'OFFICIAL').map(observation => Number(observation.total_fare)).filter(Number.isFinite)
        return { ...spec, fare: median(fares), minFare: fares.length ? Math.min(...fares) : null, maxFare: fares.length ? Math.max(...fares) : null, sampleCount: fares.length }
      } catch { return { ...spec, fare: null, minFare: null, maxFare: null, sampleCount: 0 } }
    })).then(next => {
      if (!active) return
      // Cache only a successful response containing verified rows. A failed
      // refresh must never overwrite the last real snapshot with nulls.
      if (next.some(route => route.fare != null)) {
        setRouteCards(next)
        try { sessionStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(next)) } catch { /* storage is optional */ }
      }
    })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    let active = true
    const loadLiveAircraft = async () => {
      try {
        const response = await fetch(`${BASE_URL}/api/aviation/live?limit=150`, { signal: AbortSignal.timeout(8000) })
        if (!response.ok) throw new Error('live feed unavailable')
        const payload = await response.json() as { aircraft?: unknown[] }
        if (active) setLiveAircraft(Array.isArray(payload.aircraft) ? payload.aircraft.length : 0)
      } catch { if (active) setLiveAircraft(null) }
    }
    void loadLiveAircraft()
    const timer = window.setInterval(loadLiveAircraft, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const isFree = user?.role === 'PUBLIC' && user.plan === 'FREE'
  const availableRoutes = useMemo(() => routeCards.filter(route => route.fare != null), [routeCards])
  const movementForRoute = (route: string) => fareMovement?.routes.find(item => item.route === route)
  const priceDropEvents = (fareMovement?.routes ?? []).filter(item => item.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct)
  const indexDelta = fareMovement?.routes.length ? (fareMovement.routes.reduce((sum, route) => sum + route.change_pct, 0) / fareMovement.routes.length) : null
  return <div className={`user-dashboard${compactDashboard ? ' is-compact' : ''}${dataSaver ? ' is-data-saver' : ''}`} style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, color: '#102b63' }}>
    <section style={{ minHeight: 202, borderRadius: 16, padding: '25px 34px', position: 'relative', overflow: 'hidden', background: `linear-gradient(90deg, rgba(2,31,75,.92) 0%, rgba(4,56,116,.67) 48%, rgba(4,32,74,.28) 100%), url(${DASHBOARD_HERO}) center/cover`, border: '1px solid #2d73bb', boxShadow: 'inset 0 0 70px rgba(25,157,255,.16), 0 10px 28px rgba(10,42,91,.20)', color: '#fff' }}>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720 }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.17em', color: '#69d5ff', marginBottom: 9 }}>◉ GOVERNMENT INTELLIGENCE PORTAL</div><h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.05, letterSpacing: '-.04em', fontWeight: 850, color: '#fff' }}>Explore Airfares <span style={{ color: '#2aa8ff' }}>Smarter</span></h1><p style={{ margin: '10px 0 17px', fontSize: 16, color: '#edf6ff' }}>Compare verified routes, understand fare changes and get actionable insights for policy, planning and CPI-related analysis.</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button onClick={() => onNavigate('routes')} style={{ border: 0, borderRadius: 10, padding: '11px 18px', background: '#1268ee', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><Plane size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Explore Routes <ArrowRight size={15} style={{ verticalAlign: 'middle', marginLeft: 7 }} /></button><button onClick={() => onNavigate('map')} style={{ border: 0, borderRadius: 10, padding: '11px 18px', background: '#fff', color: '#102e70', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><MapIcon size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />View India Map</button></div></div>
      <div style={{ position: 'absolute', right: 28, top: 30, width: 190, color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1.45 }}>Better insights.<br />Brighter journeys.<br />A more connected India.<div style={{ width: 30, borderTop: '3px solid #2aa8ff', marginTop: 11 }} /><div style={{ display: 'flex', gap: 22, marginTop: 17 }}><span><b style={{ fontSize: 23 }}>{liveAircraft ?? '—'}</b><small style={{ display: 'block', color: '#c5dbf5' }}>Aircraft tracked</small></span><span><b style={{ fontSize: 23 }}>{verifiedObservations ?? '—'}</b><small style={{ display: 'block', color: '#c5dbf5' }}>Fare observations</small></span></div></div>
    </section>

    <section className="user-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>{[
      { icon: Plane, label: 'Verified routes', value: routesTracked == null ? 'Data unavailable' : routesTracked.toLocaleString('en-IN'), tone: '#1989e8', helper: 'Current monitored corridors' },
      { icon: CheckCircle2, label: 'Verified observations', value: verifiedObservations == null ? 'Data unavailable' : verifiedObservations.toLocaleString('en-IN'), tone: '#159669', helper: 'REAL / OFFICIAL fare rows' },
      { icon: Tag, label: 'Price drops', value: priceDrops == null ? 'Data unavailable' : priceDrops.toLocaleString('en-IN'), tone: '#7c55e8', helper: priceDrops == null ? 'A comparison period is required' : 'Routes cheaper than the prior collection' },
      { icon: Bell, label: 'Active alerts', value: activeAlerts == null ? 'Data unavailable' : activeAlerts.toLocaleString('en-IN'), tone: '#f0a22b', helper: activeAlerts == null ? 'Sign in to view account alerts' : 'Saved alerts for this account' },
      { icon: TrendingUp, label: 'Airfare index (latest)', value: latestIndex == null ? 'Data unavailable' : latestIndex.toFixed(2), tone: '#159ed1', helper: indexDelta == null ? 'Verified index pending' : `${indexDelta >= 0 ? '↑' : '↓'} ${Math.abs(indexDelta).toFixed(1)}% vs prior collection` },
    ].map(({ icon: Icon, label, value, tone, helper }) => <div key={label} style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: '15px 17px', minHeight: 83, boxShadow: '0 5px 15px rgba(25,71,130,.05)', display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${tone}16`, color: tone, flexShrink: 0 }}><Icon size={19} /></div><div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#19366f' }}>{label}</div><div style={{ marginTop: 5, fontSize: value === 'Data unavailable' ? 13 : 23, fontWeight: 850, color: '#0c2c6e', whiteSpace: 'nowrap' }}>{value}</div><div style={{ marginTop: 3, fontSize: 10, color: '#8194ad' }}>{helper}</div></div></div>)}</section>

    <section className="user-routes-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(360px, 1fr)', gap: 12, alignItems: 'stretch' }}>
      <div style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)', border: '1px solid #dbe7f2', borderRadius: 14, padding: 14, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><div><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Popular Routes</h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Verified fare medians, range and latest movement</p></div><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ background: '#1769e8', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>Domestic</span><button onClick={() => onNavigate('routes')} style={{ border: 0, background: 'none', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>View All →</button></div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>{routeCards.map(route => {
        const routeMovement = movementForRoute(route.key)
        const lineColor = routeMovement?.change_pct == null ? '#9ec8f6' : routeMovement.change_pct < 0 ? '#39a978' : routeMovement.change_pct > 0 ? '#ef7661' : '#4d8ec4'
        return <div key={route.code} style={{ border: '1px solid #e0eaf4', borderRadius: 12, padding: 13, background: '#fbfdff', minWidth: 0, minHeight: 206, display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 17, fontWeight: 850 }}>{route.code}</div><div style={{ fontSize: 11, color: '#7083a0', marginTop: 3 }}>{route.name}</div></div><span style={{ width: 30, height: 30, borderRadius: 50, display: 'grid', placeItems: 'center', background: '#edf5ff', color: '#1769e8' }}><Plane size={15} /></span></div><div style={{ marginTop: 14, fontSize: 22, fontWeight: 850, color: '#0d3076' }}>{formatFare(route.fare)}</div>{route.fare != null ? <><div style={{ marginTop: 4 }}><ChangeLabel change={routeMovement?.change_pct} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 10, alignItems: 'end', marginTop: 'auto' }}><div style={{ display: 'grid', gap: 4, fontSize: 10, color: '#647a98' }}><span>Range <b style={{ color: '#173b78' }}>{formatFare(route.minFare)} - {formatFare(route.maxFare)}</b></span><span>{route.sampleCount} verified observations</span></div><span style={{ width: 96, textAlign: 'right', fontSize: 10, color: '#8194ad' }}>{routeMovement?.change_pct == null ? 'Comparison pending' : 'Backend movement'}</span></div></> : <div style={{ marginTop: 6, color: '#7b8da5', fontSize: 11, lineHeight: 1.45 }}>No verified observation for this route yet.</div>}<button onClick={() => onNavigate('routes')} style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 8, padding: 8, background: '#eff6ff', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>View Route →</button></div>
      })}</div></div>
      <div style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>India Fare Movement <span title="Colors are calculated from verified collection medians" style={{ fontSize: 12, color: '#7d91ad' }}>ⓘ</span></h2><span style={{ fontSize: 11, background: '#1769e8', color: '#fff', borderRadius: 8, padding: '6px 10px', fontWeight: 800 }}>Domestic</span></div><FareMovementMap movement={fareMovement} /></div>
    </section>

    <section className="user-analytics-layout overview-analytics" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1fr) minmax(300px, 1fr)', gap: 12 }}>
      <div className="overview-analytics-card trend-card" style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Airfare Trend <span style={{ fontSize: 12, color: '#7890ae' }}>(All India Index)</span></h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Verified movement from the latest fare collections</p></div><div style={{ display: 'flex', gap: 5 }}>{['7D','30D','90D','1Y'].map(t => <button type="button" key={t} onClick={() => setTrendRange(t)} aria-pressed={trendRange === t} style={{ padding: '6px 9px', border: '1px solid #dbe7f2', borderRadius: 7, background: trendRange === t ? '#1769e8' : '#f1f6fc', color: trendRange === t ? '#fff' : '#1769e8', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{t}</button>)}</div></div><IndexTrend routes={routeCards} range={trendRange} />{latestIndex != null && <div className="trend-kpis" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: -2, color: '#173b78' }}><span style={{ fontSize: 11 }}>Current Index<br/><b style={{ fontSize: 22 }}>{latestIndex.toFixed(2)}</b></span><span style={{ fontSize: 11 }}>Movement<br/><b style={{ fontSize: 16, color: (indexDelta ?? 0) >= 0 ? '#d9343e' : '#07875d' }}>{indexDelta == null ? '—' : `${indexDelta > 0 ? '+' : ''}${indexDelta.toFixed(2)}%`}</b></span></div>}</div>
      <div className="overview-analytics-card route-contribution-card" style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 13 }}><div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#eaf3ff', color: '#1769e8', fontSize: 20 }}>⌁</div><div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Route Contribution to Index <span title="How each verified route moves the index" style={{ color: '#7d91ad', fontSize: 12 }}>ⓘ</span></h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Latest verified route movement · select a route to explore</p></div><button type="button" onClick={() => onNavigate('routes')} style={{ border: '1px solid #dbe7f2', borderRadius: 8, padding: '8px 10px', background: '#eff6ff', color: '#1265db', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>View All →</button></div><div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 72px 18px', gap: 8, padding: '0 8px 7px', color: '#6882a4', fontSize: 10, fontWeight: 800 }}><span>Route</span><span>Contribution</span><span style={{ textAlign: 'right' }}>Change</span><span /></div>{routeCards.map(route => { const change = movementForRoute(route.key)?.change_pct ?? null; const positive = change != null && change >= 0; const cityByCode: Record<string, string> = { DEL: 'Delhi', BLR: 'Bengaluru', MAA: 'Chennai', BOM: 'Mumbai', HYD: 'Hyderabad', CCU: 'Kolkata' }; const city = cityByCode[route.code.split(' ')[0]] ?? 'India'; return <button type="button" key={route.code} onClick={() => onNavigate('routes')} title={`Open ${route.code} route details`} style={{ width: '100%', display: 'grid', gridTemplateColumns: '70px 1fr 72px 18px', gap: 8, alignItems: 'center', padding: '10px 8px', border: '1px solid #edf2f7', borderRadius: 10, marginBottom: 6, background: '#fbfdff', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}><span><b style={{ display: 'block', color: '#173b78', fontSize: 13 }}>{route.code.split(' ')[0]}</b><small style={{ color: '#8aa0bb' }}>{city}</small></span><span style={{ height: 10, background: '#e6eef7', borderRadius: 99, overflow: 'hidden' }}><i style={{ display: 'block', width: `${change == null ? 0 : Math.min(100, Math.max(9, Math.abs(change) * 12))}%`, height: '100%', background: positive ? '#ef7661' : '#39a978', borderRadius: 99 }} /></span><span style={{ textAlign: 'right' }}><b style={{ display: 'block', color: change == null ? '#7890ae' : positive ? '#ef3f44' : '#07875d', fontSize: 13 }}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}`}</b><small style={{ color: change == null ? '#7890ae' : positive ? '#ef3f44' : '#07875d' }}>{change == null ? 'unavailable' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</small></span><span style={{ color: '#7890ae', fontSize: 20 }}>›</span></button> })}</div>
      <div className="overview-analytics-card recent-alerts-card" style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Recent Price Alerts</h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Verified changes from the latest collection</p></div><button onClick={() => onNavigate('alerts')} style={{ border: 0, background: 'none', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>View All →</button></div>{priceDropEvents.length > 0 ? <div className="recent-alert-list" style={{ display: 'grid', gap: 9, marginTop: 13 }}>{priceDropEvents.slice(0, 3).map(event => <div className="recent-alert-row" key={event.route} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #edf2f7' }}><TrendingDown size={18} color="#07875d" /><div><b style={{ display: 'block', fontSize: 11, color: '#173b78' }}>{event.route} fare dropped by {Math.abs(event.change_pct).toFixed(2)}%</b><span style={{ fontSize: 10, color: '#7185a2' }}>{formatFare(event.current_fare)} · verified collection</span></div><span style={{ fontSize: 10, color: '#7185a2' }}>{fareMovement?.current_period ?? ''}</span></div>)}</div> : <div style={{ marginTop: 18, padding: '18px 12px', borderRadius: 10, background: '#fbfdff', border: '1px dashed #dbe7f2', textAlign: 'center' }}><TrendingDown size={20} color="#91a4bd" /><div style={{ marginTop: 8, color: '#526987', fontSize: 12, fontWeight: 700 }}>{fareMovement?.available ? 'No price drops in the latest collection' : 'Movement data is not available yet'}</div><div style={{ marginTop: 4, color: '#8194ad', fontSize: 11, lineHeight: 1.45 }}>{fareMovement?.message ?? 'A second verified collection is required before a price movement can be shown.'}</div></div>}<button onClick={() => setShowAccess(true)} style={{ width: '100%', marginTop: 10, padding: 10, border: 0, borderRadius: 9, background: '#eaf3ff', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>+ Set New Price Alert</button></div>
    </section>
    {isFree && showAccess && <UpgradeModal feature="Price Alerts" featureKey="PRICE_ALERTS" onClose={() => setShowAccess(false)} />}
  </div>
}
