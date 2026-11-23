import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BarChart3, Bell, CalendarDays, CheckCircle2, GitBranch, Map as MapIcon, Plane, Tag, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiDashboard, apiFareMovement, apiFares, apiIndexHistory, apiPriceAlerts } from '../services/api'
import { useAviationRadar } from '../services/aviationRadar'
import { useIndiaGeoJson } from '../services/indiaGeoJson'
import DataFreshness from '../components/DataFreshness'
import { median } from '../lib/liveStatus'

// Version the public hero asset so Vercel/browser caches cannot keep an older
// dashboard image after a deployment.
const DASHBOARD_HERO = '/aviation-hero.png?v=2'
import type { FareMovementResponse, FareMovementStatus, IndexHistoryResponse } from '../services/api'
import type { Page } from '../components/AppShell'
import indiaMap from '../assets/india_map_clean.png'

type Props = { onNavigate: (p: Page) => void }
type RouteCard = { key: string; code: string; name: string; fare: number | null; minFare: number | null; maxFare: number | null; sampleCount: number; latestCollectedAt: string | null }
type GeoFeature = { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }
type GeoCollection = { features?: GeoFeature[] }

const routeSpecs = [
  { key: 'DEL-BOM', code: 'DEL → BOM', name: 'Delhi to Mumbai' },
  { key: 'DEL-BLR', code: 'DEL → BLR', name: 'Delhi to Bengaluru' },
  { key: 'DEL-MAA', code: 'DEL → MAA', name: 'Delhi to Chennai' },
]
const ROUTE_CACHE_KEY = 'aeroprice:verified-route-cards:v1'
const DASHBOARD_CACHE_KEY = 'aeroprice:verified-dashboard:v1'
// Delay before a failed route-card fetch retries once. A Vercel cold start
// can exceed the 12 s apiFetch abort on the first attempt; by the time the
// retry runs the backend is warm, so a short delay is enough.
const ROUTE_CARD_RETRY_MS = 1000

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
    if (!Array.isArray(value) || value.length !== routeSpecs.length) return null
    // Snapshots cached before latestCollectedAt existed carry no freshness
    // timestamp — normalise to null so those cards render without a badge
    // instead of crashing on an undefined field.
    return value.map(card => ({ ...card, latestCollectedAt: typeof card.latestCollectedAt === 'string' ? card.latestCollectedAt : null }))
  } catch { return null }
}

function readDashboardCache(): { routes_tracked?: number; real_observations?: number; price_drops?: number; index_value?: number | null } | null {
  try {
    const value = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch { return null }
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
  // M7: state boundaries load through the shared cached loader — one
  // request for all three maps instead of one each. A load that returns no
  // features still counts as failed here (as before), so the fallback image
  // keeps its "could not load locally" notice.
  const { data: geoData, failed: geoFailed } = useIndiaGeoJson()
  const features = (geoData as GeoCollection | null)?.features ?? []
  const mapFailed = geoFailed || (geoData != null && features.length === 0)
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

function ChangeLabel({ change }: { change?: number }) {
  if (change == null) return <span style={{ color: '#8194ad', fontSize: 11 }}>Comparison pending</span>
  const isDrop = change < 0
  const isStable = change === 0
  const color = isStable ? '#4d8ec4' : isDrop ? '#07875d' : '#d9343e'
  return <span style={{ color, fontWeight: 800, fontSize: 11 }}>{isStable ? '• Stable' : `${isDrop ? '↓' : '↑'} ${Math.abs(change).toFixed(2)}%`} <span style={{ color: '#7185a2', fontWeight: 500 }}>vs prior collection</span></span>
}

// One bar per route median from the latest verified collection. This is NOT
// a time series — the old "Airfare Trend" title and 7D/30D/90D/1Y buttons
// implied a history the data does not have (audit §2.11).
function LatestRouteMedians({ routes }: { routes: RouteCard[] }) {
  const available = routes.filter(route => route.fare != null).slice(0, 6)
  if (!available.length) return <div style={{ minHeight: 128, display: 'grid', placeItems: 'center', color: '#7388a6', fontSize: 12, textAlign: 'center' }}>Waiting for verified fare observations.</div>

  const maxFare = Math.max(...available.map(route => route.fare as number), 1)
  return <div style={{ minHeight: 128, padding: '22px 4px 0' }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, height: 92, borderBottom: '1px solid #dbe7f2' }}>
      {available.map(route => {
        const height = Math.max(12, ((route.fare as number) / maxFare) * 76)
        return <div key={route.key} title={`${route.code}: ${formatFare(route.fare)}`} style={{ flex: 1, minWidth: 28, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#526987', whiteSpace: 'nowrap' }}>{formatFare(route.fare)}</span>
          <div style={{ width: 'min(28px, 70%)', height, borderRadius: '6px 6px 0 0', background: 'linear-gradient(180deg, #4b8df8, #1769e8)' }} />
          <span style={{ position: 'relative', top: 20, fontSize: 9, color: '#7185a2', fontWeight: 700 }}>{route.code}</span>
        </div>
      })}
    </div>
    <div style={{ marginTop: 28, color: '#7388a6', fontSize: 11, textAlign: 'center' }}>Latest verified fare collection · one bar per route median.</div>
  </div>
}

export default function Overview({ onNavigate }: Props) {
  const dashboardCache = readDashboardCache()
  const { user, token } = useAuth()
  const [routesTracked, setRoutesTracked] = useState<number | null>(dashboardCache?.routes_tracked ?? null)
  const [verifiedObservations, setVerifiedObservations] = useState<number | null>(dashboardCache?.real_observations ?? null)
  const [priceDrops, setPriceDrops] = useState<number | null>(dashboardCache?.price_drops ?? null)
  const [latestIndex, setLatestIndex] = useState<number | null>(dashboardCache?.index_value ?? null)
  // The index's OWN % change vs the prior published day, from /index/history
  // (newest-first). Never the mean of route-level fare changes — that said
  // ↑42.3% on 23 Nov 2026 while the index itself fell 106.20 → 100.56.
  const [indexChangePct, setIndexChangePct] = useState<number | null>(null)
  const [activeAlerts, setActiveAlerts] = useState<number | null>(null)
  const [fareMovement, setFareMovement] = useState<FareMovementResponse | null>(null)
  const [routeCards, setRouteCards] = useState<RouteCard[]>(() => readRouteCache() ?? routeSpecs.map(route => ({ ...route, fare: null, minFare: null, maxFare: null, sampleCount: 0, latestCollectedAt: null })))
  // D4: the "Aircraft tracked" KPI reads the shared radar store instead of
  // this page's own 60 s poller — one authed 30 s poll serves the Overview,
  // the fare map and the radar map. Enabled only with a token: a guest must
  // never trigger an unauthenticated poll (401 every 30 s), and without a
  // token the KPI stays "—" even if the store still holds positions from an
  // earlier signed-in session. 'connected'/'cached'/'empty' all carry a real
  // count (empty = the provider returned zero); 'loading'/'unavailable' do
  // not, so they stay blank exactly as the old poller's failure path did.
  const radar = useAviationRadar(!!token)
  const liveAircraft = token && (radar.status === 'connected' || radar.status === 'cached' || radar.status === 'empty')
    ? radar.aircraft.length
    : null
  const [compactDashboard, setCompactDashboard] = useState(() => localStorage.getItem('aeroprice_compact_mode') === 'true')
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('aeroprice_data_saver') === 'true')

  useEffect(() => {
    const refreshPreferences = () => {
      setCompactDashboard(localStorage.getItem('aeroprice_compact_mode') === 'true')
      setDataSaver(localStorage.getItem('aeroprice_data_saver') === 'true')
    }
    window.addEventListener('aeroprice-preferences-changed', refreshPreferences)
    return () => window.removeEventListener('aeroprice-preferences-changed', refreshPreferences)
  }, [])

  // "Active alerts" comes from the backend price-alerts list — the old
  // localStorage key was never written anywhere, so the KPI was stuck at 0.
  // On 403 (no grant) or any error the KPI stays "Data unavailable".
  useEffect(() => {
    if (!user?.email) { setActiveAlerts(null); return }
    let active = true
    apiPriceAlerts(token ?? undefined)
      .then(data => { if (active) setActiveAlerts(Array.isArray(data.alerts) ? data.alerts.length : 0) })
      .catch(() => { if (active) setActiveAlerts(null) })
    return () => { active = false }
  }, [user?.email, token])

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
    // Index change from the index's own published history (newest-first):
    // the two latest daily values give the % change vs the prior published
    // day. Fewer than two published days (or any failure) leaves the KPI
    // on "Verified index pending" — no change figure is invented.
    // ITEM 4: /index/history requires auth — a guest (no token) must not
    // fire it at all, or every guest Overview visit logs a pointless 401.
    // The effect re-runs when a token appears, so a sign-in still loads it.
    if (token) {
      ;(apiIndexHistory(token) as Promise<IndexHistoryResponse>).then(data => {
        if (!active) return
        const values = (data.observations ?? [])
          .map(observation => observation.value)
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        if (values.length < 2 || values[1] <= 0) { setIndexChangePct(null); return }
        setIndexChangePct(((values[0] - values[1]) / values[1]) * 100)
      }).catch(() => { if (active) setIndexChangePct(null) })
    } else {
      setIndexChangePct(null)
    }
    return () => { active = false }
  }, [token])

  useEffect(() => {
    let active = true
    const loadRoute = async (spec: (typeof routeSpecs)[number], attempt = 0): Promise<RouteCard> => {
      try {
        const response = await apiFares({ route: spec.key, limit: 200 }, token ?? undefined)
        const eligible = response.observations.filter(observation => observation.data_origin === 'REAL' || observation.data_origin === 'OFFICIAL' || observation.data_origin === 'PUBLIC_INTERFACE')
        const fares = eligible.map(observation => Number(observation.total_fare)).filter(Number.isFinite)
        // ITEM 3: keep the newest collection timestamp so the route card
        // can show a DataFreshness badge (same pattern as LiveFares).
        const latestCollectedAt = eligible.map(observation => observation.collected_at).filter(Boolean).sort().at(-1) ?? null
        return { ...spec, fare: median(fares), minFare: fares.length ? Math.min(...fares) : null, maxFare: fares.length ? Math.max(...fares) : null, sampleCount: fares.length, latestCollectedAt }
      } catch {
        // One retry: a cold-start failure must not pin the route as
        // unavailable — the retry usually lands on a warm backend.
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, ROUTE_CARD_RETRY_MS))
          if (active) return loadRoute(spec, 1)
        }
        return { ...spec, fare: null, minFare: null, maxFare: null, sampleCount: 0, latestCollectedAt: null }
      }
    }
    Promise.all(routeSpecs.map(spec => loadRoute(spec))).then(next => {
      if (!active) return
      // Merge: a route that failed this round keeps its previously loaded
      // fare (from the cached snapshot or an earlier load) instead of
      // dropping to "Data unavailable" on a transient failure.
      setRouteCards(prev => next.map(card => card.fare != null ? card : (prev.find(item => item.key === card.key) ?? card)))
      // Cache only a COMPLETE snapshot. Caching a partial one pinned the
      // failed routes as unavailable for the rest of the session (22 Nov
      // 2026: DEL-BOM/DEL-BLR stuck "No verified observation" while
      // DEL-MAA loaded, after a cold-start partial failure).
      if (next.every(route => route.fare != null)) {
        try { sessionStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(next)) } catch { /* storage is optional */ }
      }
    })
    return () => { active = false }
  }, [token])

  const availableRoutes = useMemo(() => routeCards.filter(route => route.fare != null), [routeCards])
  const movementForRoute = (route: string) => fareMovement?.routes.find(item => item.route === route)
  const priceDropEvents = (fareMovement?.routes ?? []).filter(item => item.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct)
  return <div className={`user-dashboard${compactDashboard ? ' is-compact' : ''}${dataSaver ? ' is-data-saver' : ''}`} style={{ maxWidth: 1380, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12, color: '#102b63' }}>
    <section className="user-dashboard-hero" style={{ minHeight: 202, borderRadius: 16, padding: '25px 34px', position: 'relative', overflow: 'hidden', background: `linear-gradient(90deg, rgba(2,31,75,.92) 0%, rgba(4,56,116,.67) 48%, rgba(4,32,74,.28) 100%), url(${DASHBOARD_HERO}) center/cover`, border: '1px solid #2d73bb', boxShadow: 'inset 0 0 70px rgba(25,157,255,.16), 0 10px 28px rgba(10,42,91,.20)', color: '#fff' }}>
      <div className="user-dashboard-hero-copy" style={{ position: 'relative', zIndex: 1, maxWidth: 720 }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.17em', color: '#69d5ff', marginBottom: 9 }}>◉ GOVERNMENT INTELLIGENCE PORTAL</div><h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.05, letterSpacing: '-.04em', fontWeight: 850, color: '#fff' }}>Explore Airfares <span style={{ color: '#2aa8ff' }}>Smarter</span></h1><p style={{ margin: '10px 0 17px', fontSize: 16, color: '#edf6ff' }}>Compare verified routes, understand fare changes and get actionable insights for policy, planning and CPI-related analysis.</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button onClick={() => onNavigate('routes')} style={{ border: 0, borderRadius: 10, padding: '11px 18px', background: '#1268ee', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><Plane size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Explore Routes <ArrowRight size={15} style={{ verticalAlign: 'middle', marginLeft: 7 }} /></button><button onClick={() => onNavigate('map')} style={{ border: 0, borderRadius: 10, padding: '11px 18px', background: '#fff', color: '#102e70', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}><MapIcon size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />View India Map</button></div></div>
      <div className="user-dashboard-hero-stats" style={{ position: 'absolute', right: 28, top: 30, width: 190, color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1.45, background: 'rgba(10,18,36,0.55)', padding: '12px 14px', borderRadius: 12 }}>Better insights.<br />Brighter journeys.<br />A more connected India.<div style={{ width: 30, borderTop: '3px solid #2aa8ff', marginTop: 11 }} /><div style={{ display: 'flex', gap: 22, marginTop: 17 }}><span><b style={{ fontSize: 23 }}>{liveAircraft ?? '—'}</b><small style={{ display: 'block', color: '#c5dbf5' }}>Aircraft tracked</small></span><span><b style={{ fontSize: 23 }}>{verifiedObservations ?? '—'}</b><small style={{ display: 'block', color: '#c5dbf5' }}>Fare observations</small></span></div></div>
    </section>

    <section className="user-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>{[
      { icon: Plane, label: 'Verified routes', value: routesTracked == null ? 'Data unavailable' : routesTracked.toLocaleString('en-IN'), tone: '#1989e8', helper: 'Current monitored corridors' },
      { icon: CheckCircle2, label: 'Verified observations', value: verifiedObservations == null ? 'Data unavailable' : verifiedObservations.toLocaleString('en-IN'), tone: '#159669', helper: 'REAL / OFFICIAL / PUBLIC_INTERFACE rows' },
      { icon: Tag, label: 'Price drops', value: priceDrops == null ? 'Data unavailable' : priceDrops.toLocaleString('en-IN'), tone: '#7c55e8', helper: priceDrops == null ? 'A comparison period is required' : 'Routes cheaper than the prior collection' },
      { icon: Bell, label: 'Active alerts', value: activeAlerts == null ? 'Data unavailable' : activeAlerts.toLocaleString('en-IN'), tone: '#f0a22b', helper: activeAlerts == null ? 'Sign in to view account alerts' : 'Saved alerts for this account' },
      { icon: TrendingUp, label: 'Airfare index (latest)', value: latestIndex == null ? 'Data unavailable' : latestIndex.toFixed(2), tone: '#159ed1', helper: indexChangePct == null ? 'Verified index pending' : `${indexChangePct >= 0 ? '↑' : '↓'} ${Math.abs(indexChangePct).toFixed(1)}% vs prior collection` },
    ].map(({ icon: Icon, label, value, tone, helper }) => <div key={label} style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: '15px 17px', minHeight: 83, boxShadow: '0 5px 15px rgba(25,71,130,.05)', display: 'flex', gap: 12, alignItems: 'center' }}><div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${tone}16`, color: tone, flexShrink: 0 }}><Icon size={19} /></div><div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: '#19366f' }}>{label}</div><div style={{ marginTop: 5, fontSize: value === 'Data unavailable' ? 13 : 23, fontWeight: 850, color: '#0c2c6e', whiteSpace: 'nowrap' }}>{value}</div><div style={{ marginTop: 3, fontSize: 10, color: '#8194ad' }}>{helper}</div></div></div>)}</section>

    <section className="user-routes-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(360px, 1fr)', gap: 12, alignItems: 'stretch' }}>
      <div style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)', border: '1px solid #dbe7f2', borderRadius: 14, padding: 14, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><div><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Popular Routes</h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Verified fare medians, range and latest movement</p></div><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ background: '#1769e8', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>Domestic</span><button onClick={() => onNavigate('routes')} style={{ border: 0, background: 'none', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>View All →</button></div></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>{routeCards.map(route => {
        const routeMovement = movementForRoute(route.key)
        const lineColor = routeMovement?.change_pct == null ? '#9ec8f6' : routeMovement.change_pct < 0 ? '#39a978' : routeMovement.change_pct > 0 ? '#ef7661' : '#4d8ec4'
        return <div key={route.code} style={{ border: '1px solid #e0eaf4', borderRadius: 12, padding: 13, background: '#fbfdff', minWidth: 0, minHeight: 206, display: 'flex', flexDirection: 'column' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}><div><div style={{ fontSize: 17, fontWeight: 850 }}>{route.code}</div><div style={{ fontSize: 11, color: '#7083a0', marginTop: 3 }}>{route.name}</div></div><span style={{ width: 30, height: 30, borderRadius: 50, display: 'grid', placeItems: 'center', background: '#edf5ff', color: '#1769e8' }}><Plane size={15} /></span></div><div style={{ marginTop: 14, fontSize: 22, fontWeight: 850, color: '#0d3076' }}>{formatFare(route.fare)}</div>{route.fare != null ? <><div style={{ marginTop: 4 }}><ChangeLabel change={routeMovement?.change_pct} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 10, alignItems: 'end', marginTop: 'auto' }}><div style={{ display: 'grid', gap: 4, fontSize: 10, color: '#647a98' }}><span>Range <b style={{ color: '#173b78' }}>{formatFare(route.minFare)} - {formatFare(route.maxFare)}</b></span><span>{route.sampleCount} verified observations</span>{route.latestCollectedAt && <DataFreshness minutesAgo={Math.max(0, Math.floor((Date.now() - new Date(route.latestCollectedAt).getTime()) / 60000))} />}</div><span style={{ width: 96, textAlign: 'right', fontSize: 10, color: '#8194ad' }}>{routeMovement?.change_pct == null ? 'Comparison pending' : 'Backend movement'}</span></div></> : <div style={{ marginTop: 6, color: '#7b8da5', fontSize: 11, lineHeight: 1.45 }}>No verified observation for this route yet.</div>}<button onClick={() => onNavigate('routes')} style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 8, padding: 8, background: '#eff6ff', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>View Route →</button></div>
      })}</div></div>
      <div style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>India Fare Movement <span title="Colors are calculated from verified collection medians" style={{ fontSize: 12, color: '#7d91ad' }}>ⓘ</span></h2><span style={{ fontSize: 11, background: '#1769e8', color: '#fff', borderRadius: 8, padding: '6px 10px', fontWeight: 800 }}>Domestic</span></div><FareMovementMap movement={fareMovement} /></div>
    </section>

    <section className="user-analytics-layout overview-analytics" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(300px, 1fr) minmax(300px, 1fr)', gap: 12 }}>
      <div className="overview-analytics-card trend-card" style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Latest route medians</h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Verified medians from the latest fare collection</p></div></div><LatestRouteMedians routes={routeCards} />{latestIndex != null && <div className="trend-kpis" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: -2, color: '#173b78' }}><span style={{ fontSize: 11 }}>Current Index<br/><b style={{ fontSize: 22 }}>{latestIndex.toFixed(2)}</b></span><span style={{ fontSize: 11 }}>Movement<br/><b style={{ fontSize: 16, color: (indexChangePct ?? 0) >= 0 ? '#d9343e' : '#07875d' }}>{indexChangePct == null ? '—' : `${indexChangePct > 0 ? '+' : ''}${indexChangePct.toFixed(2)}%`}</b></span></div>}</div>
      <div className="overview-analytics-card route-contribution-card" style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 13 }}><div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#eaf3ff', color: '#1769e8', fontSize: 20 }}>⌁</div><div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Route Contribution to Index <span title="How each verified route moves the index" style={{ color: '#7d91ad', fontSize: 12 }}>ⓘ</span></h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Latest verified route movement · select a route to explore</p></div><button type="button" onClick={() => onNavigate('routes')} style={{ border: '1px solid #dbe7f2', borderRadius: 8, padding: '8px 10px', background: '#eff6ff', color: '#1265db', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>View All →</button></div><div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 72px 18px', gap: 8, padding: '0 8px 7px', color: '#6882a4', fontSize: 10, fontWeight: 800 }}><span>Route</span><span>Contribution</span><span style={{ textAlign: 'right' }}>Change</span><span /></div>{routeCards.map(route => { const change = movementForRoute(route.key)?.change_pct ?? null; const positive = change != null && change >= 0; const cityByCode: Record<string, string> = { DEL: 'Delhi', BLR: 'Bengaluru', MAA: 'Chennai', BOM: 'Mumbai', HYD: 'Hyderabad', CCU: 'Kolkata' }; const city = cityByCode[route.code.split(' ')[0]] ?? 'India'; return <button type="button" key={route.code} onClick={() => onNavigate('routes')} title={`Open ${route.code} route details`} style={{ width: '100%', display: 'grid', gridTemplateColumns: '70px 1fr 72px 18px', gap: 8, alignItems: 'center', padding: '10px 8px', border: '1px solid #edf2f7', borderRadius: 10, marginBottom: 6, background: '#fbfdff', fontSize: 11, cursor: 'pointer', textAlign: 'left' }}><span><b style={{ display: 'block', color: '#173b78', fontSize: 13 }}>{route.code.split(' ')[0]}</b><small style={{ color: '#8aa0bb' }}>{city}</small></span><span style={{ height: 10, background: '#e6eef7', borderRadius: 99, overflow: 'hidden' }}><i style={{ display: 'block', width: `${change == null ? 0 : Math.min(100, Math.max(9, Math.abs(change) * 12))}%`, height: '100%', background: positive ? '#ef7661' : '#39a978', borderRadius: 99 }} /></span><span style={{ textAlign: 'right' }}><b style={{ display: 'block', color: change == null ? '#7890ae' : positive ? '#ef3f44' : '#07875d', fontSize: 13 }}>{change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(2)}`}</b><small style={{ color: change == null ? '#7890ae' : positive ? '#ef3f44' : '#07875d' }}>{change == null ? 'unavailable' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}</small></span><span style={{ color: '#7890ae', fontSize: 20 }}>›</span></button> })}</div>
      <div className="overview-analytics-card recent-alerts-card" style={{ background: '#fff', border: '1px solid #dbe7f2', borderRadius: 14, padding: 16, boxShadow: '0 5px 15px rgba(25,71,130,.05)' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><h2 style={{ margin: 0, fontSize: 18, color: '#102e70' }}>Recent Price Alerts</h2><p style={{ margin: '4px 0 0', fontSize: 11, color: '#7890ae' }}>Verified changes from the latest collection</p></div><button onClick={() => onNavigate('alerts')} style={{ border: 0, background: 'none', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>View All →</button></div>{priceDropEvents.length > 0 ? <div className="recent-alert-list" style={{ display: 'grid', gap: 9, marginTop: 13 }}>{priceDropEvents.slice(0, 3).map(event => <div className="recent-alert-row" key={event.route} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #edf2f7' }}><TrendingDown size={18} color="#07875d" /><div><b style={{ display: 'block', fontSize: 11, color: '#173b78' }}>{event.route} fare dropped by {Math.abs(event.change_pct).toFixed(2)}%</b><span style={{ fontSize: 10, color: '#7185a2' }}>{formatFare(event.current_fare)} · verified collection</span></div><span style={{ fontSize: 10, color: '#7185a2' }}>{fareMovement?.current_period ?? ''}</span></div>)}</div> : <div style={{ marginTop: 18, padding: '18px 12px', borderRadius: 10, background: '#fbfdff', border: '1px dashed #dbe7f2', textAlign: 'center' }}><TrendingDown size={20} color="#91a4bd" /><div style={{ marginTop: 8, color: '#526987', fontSize: 12, fontWeight: 700 }}>{fareMovement?.available ? 'No price drops in the latest collection' : 'Movement data is not available yet'}</div><div style={{ marginTop: 4, color: '#8194ad', fontSize: 11, lineHeight: 1.45 }}>{fareMovement?.message ?? 'A second verified collection is required before a price movement can be shown.'}</div></div>}<button onClick={() => onNavigate('alerts')} style={{ width: '100%', marginTop: 10, padding: 10, border: 0, borderRadius: 9, background: '#eaf3ff', color: '#1265db', fontWeight: 800, cursor: 'pointer' }}>+ Set New Price Alert</button></div>
    </section>
  </div>
}
