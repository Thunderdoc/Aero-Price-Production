import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, BarChart3, Check, Clock3, CloudSun, Download, Expand, Info, Plane, PlaneLanding, Radio, RefreshCw, Search, TowerControl, X } from 'lucide-react'
import AviationRadarMap, { type RadarLayer } from '../components/AviationRadarMap'
import { aircraftId, aircraftLabel, contactFreshness, exportRadar, flightPhase, operatorName, radarAirports, refreshRadar, telemetry, useAviationRadar, type Aircraft } from '../services/aviationRadar'
import type { Page } from '../components/AppShell'
import '../styles/aviation.css'

export type AviationPanel = 'Airlines' | 'ATC Activity' | 'Corridor Analysis' | 'Weather & Alerts' | 'Historical Replay' | 'Fuel & Emissions' | 'Reports & Export'
const clock = (date: string | null, seconds = false) => date ? new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' as const } : {}), hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase() + ' IST' : 'Awaiting first update'
type AirportWeather = { code: string; temp: number; wind: number; weatherCode: number; time: string }

function distanceKm(a: Aircraft, lat: number, lng: number) {
  const r = Math.PI / 180
  const h = Math.sin((lat - a.latitude) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(a.latitude * r) * Math.sin((lng - a.longitude) * r / 2) ** 2
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function weatherLabel(code: number) {
  if ([0, 1].includes(code)) return 'Clear'
  if ([2, 3].includes(code)) return 'Cloudy'
  if ([45, 48].includes(code)) return 'Fog'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  if (code >= 95) return 'Storm'
  return 'Live'
}

export default function AviationLive({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  const state = useAviationRadar()
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState(() => sessionStorage.getItem('aviation-search') || '')
  const [layer, setLayer] = useState<RadarLayer>('Live')
  const [fullscreen, setFullscreen] = useState(false)
  const [panel, setPanel] = useState<AviationPanel | null>(() => { const value = sessionStorage.getItem('aviation-panel'); sessionStorage.removeItem('aviation-panel'); return value as AviationPanel | null })
  const [replay, setReplay] = useState<string | null>(null)
  const [weather, setWeather] = useState<{ rows: AirportWeather[]; updatedAt: string | null; status: 'loading' | 'connected' | 'unavailable' }>({ rows: [], updatedAt: null, status: 'loading' })
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const onSearch = (e: Event) => setQuery((e as CustomEvent<string>).detail)
    const onPanel = (e: Event) => {
      const next = (e as CustomEvent<AviationPanel>).detail
      sessionStorage.removeItem('aviation-panel')
      setPanel(next)
      if (next === 'Weather & Alerts') setLayer('Weather')
      if (next === 'ATC Activity' || next === 'Corridor Analysis') setLayer('ATC Zones')
      if (next === 'Historical Replay') setLayer('Routes')
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setFullscreen(false); setReplay(null) } }
    window.addEventListener('aviation-search', onSearch); window.addEventListener('aviation-panel', onPanel); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('aviation-search', onSearch); window.removeEventListener('aviation-panel', onPanel); window.removeEventListener('keydown', escape) }
  }, [])
  useEffect(() => {
    const value = sessionStorage.getItem('aviation-panel')
    if (!value) return
    sessionStorage.removeItem('aviation-panel')
    setPanel(value as AviationPanel)
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const loadWeather = async () => {
      try {
        setWeather(prev => ({ ...prev, status: prev.rows.length ? 'connected' : 'loading' }))
        const latitudes = radarAirports.map(a => a.lat).join(',')
        const longitudes = radarAirports.map(a => a.lng).join(',')
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FKolkata`, { signal: controller.signal })
        if (!response.ok) throw new Error('Weather unavailable')
        const body = await response.json()
        const blocks = Array.isArray(body) ? body : [body]
        const rows = blocks.map((item: any, index: number) => ({
          code: radarAirports[index]?.code ?? `WX${index + 1}`,
          temp: Number(item?.current?.temperature_2m),
          wind: Number(item?.current?.wind_speed_10m),
          weatherCode: Number(item?.current?.weather_code),
          time: String(item?.current?.time ?? new Date().toISOString()),
        })).filter((row: AirportWeather) => Number.isFinite(row.temp) && Number.isFinite(row.wind))
        if (!rows.length) throw new Error('No weather rows')
        if (active) setWeather({ rows, updatedAt: new Date().toISOString(), status: 'connected' })
      } catch (error) {
        if (active && (error as Error).name !== 'AbortError') setWeather(prev => ({ ...prev, status: 'unavailable' }))
      }
    }
    void loadWeather()
    const timer = setInterval(() => void loadWeather(), 300000)
    return () => { active = false; controller.abort(); clearInterval(timer) }
  }, [])
  useEffect(() => { if (panel) dialogRef.current?.showModal(); else dialogRef.current?.close() }, [panel])
  const frame = replay ? state.history.find(h => h.time === replay) : null
  const shownState = frame ? { ...state, aircraft: frame.aircraft, retrievedAt: frame.time } : state
  const connected = state.status === 'connected'
  const airborne = state.aircraft.filter(a => !a.on_ground)
  const onGround = state.aircraft.filter(a => a.on_ground)
  const aircraft = shownState.aircraft.filter(a => `${aircraftLabel(a)} ${operatorName(a)} ${a.registration} ${a.aircraft_type}`.toLowerCase().includes(query.trim().toLowerCase()))
  const vicinity = useMemo(() => radarAirports.map(ap => ({ ...ap, count: state.aircraft.filter(a => distanceKm(a, ap.lat, ap.lng) < 100).length })).sort((a, b) => b.count - a.count), [state.aircraft])
  const operators = useMemo(() => Object.entries(state.aircraft.reduce<Record<string, number>>((result, a) => { const name = operatorName(a); result[name] = (result[name] || 0) + 1; return result }, {})).sort((a, b) => b[1] - a[1]), [state.aircraft])
  const chosen = shownState.aircraft.find(a => aircraftId(a) === selected)
  const weatherAverage = weather.rows.length ? Math.round(weather.rows.reduce((sum, row) => sum + row.temp, 0) / weather.rows.length) : null
  const liveCorridors = vicinity.filter(a => a.count > 0).length
  const staleAircraft = state.aircraft.filter(a => (a.seen_seconds ?? 0) > 60).length
  const feedAgeSeconds = state.retrievedAt ? Math.max(0, Math.round((Date.now() - Date.parse(state.retrievedAt)) / 1000)) : null
  const feedQuality = !connected ? 'unavailable' : staleAircraft > Math.max(12, state.aircraft.length * .2) ? 'degraded' : feedAgeSeconds != null && feedAgeSeconds > 120 ? 'stale' : 'nominal'
  const feedQualityLabel = state.status === 'cached' ? 'CACHED' : feedQuality === 'nominal' ? 'NOMINAL' : feedQuality === 'degraded' ? 'DEGRADED' : feedQuality === 'stale' ? 'STALE' : 'CONNECTING'
  const kpis = [
    { label: 'Active Flights', value: connected ? airborne.length : '—', detail: 'Currently in Indian airspace', icon: Plane, tone: 'green' },
    { label: 'Provider Rows', value: state.status === 'connected' || state.status === 'cached' ? state.aircraft.length : '—', detail: `${state.source || 'Live ADS-B'} aircraft positions`, icon: Clock3, tone: 'orange' },
    { label: 'On Ground', value: connected ? onGround.length : '—', detail: 'Reported by aircraft telemetry', icon: PlaneLanding, tone: 'cyan' },
    { label: 'Major Airports', value: String(radarAirports.length).padStart(2, '0'), detail: 'Mapped airport locations', icon: TowerControl, tone: 'purple' },
    { label: 'Airspace Status', value: connected ? 'Tracking' : state.status === 'cached' ? 'Cached' : state.status === 'loading' ? 'Connecting' : 'Retrying', detail: connected ? 'Live positions available' : state.status === 'cached' ? 'Last valid positions retained' : 'Refreshing aircraft feed', icon: Radio, tone: 'mint' },
    { label: 'Weather (India)', value: weatherAverage == null ? '—' : `${weatherAverage}°C`, detail: weather.status === 'connected' ? 'Live airport weather average' : 'Connecting weather feed', icon: CloudSun, tone: 'yellow' },
  ]
  return <div className="av-dashboard">
    <section className="av-hero">
      <div className="av-hero-copy"><div className="av-eyebrow"><span className={`av-live-tag ${connected ? '' : 'pending'}`}><i/>{connected ? 'LIVE' : state.status === 'loading' ? 'SYNC' : 'OFFLINE'}</span><span className={`av-feed-quality ${feedQuality}`}>{feedQualityLabel}</span><span>INDIAN AIRSPACE MONITORING</span></div><h1>Live Flight Map</h1><p>Real-time aircraft tracking with source status, stale-contact checks and honest provider coverage.</p></div>
      <div className="av-last-updated"><div><span>Last Updated</span><strong>{clock(state.retrievedAt, true)}</strong><small>{state.retrievedAt ? new Date(state.retrievedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'Auto refresh · 30 seconds'}</small></div><button title="Refresh aircraft feed" aria-label="Refresh aircraft feed" disabled={state.refreshing} onClick={() => void refreshRadar()}><RefreshCw size={21} className={state.refreshing ? 'av-spin' : ''}/></button></div>
    </section>
    <div className="av-stat-grid">{kpis.map(({ label, value, detail, icon: Icon, tone }) => <section className="av-stat" key={label}><div className={`av-stat-icon ${tone}`}><Icon size={25} strokeWidth={1.7}/></div><div><h2>{label}</h2><strong className={typeof value === 'string' && value.length > 5 ? 'av-stat-word' : ''}>{value}</strong><p>{detail}</p></div></section>)}</div>
    <div className="av-workspace">
      <section className={`av-panel av-map-panel ${fullscreen ? 'av-fullscreen' : ''}`}>
        <header className="av-map-header"><h2>India Live Flight Map</h2><span className="av-position-caption"><i className={connected ? 'connected' : ''}/> {frame ? 'Session replay' : 'Real-time aircraft positions (ADS-B)'}</span><div className="av-map-tabs" role="tablist" aria-label="Map layers">{(['Live', 'Routes', 'Corridors', 'Weather', 'ATC Zones'] as RadarLayer[]).map(item => <button key={item} role="tab" aria-selected={layer === item} className={layer === item ? 'active' : ''} onClick={() => setLayer(item)}>{item === 'Live' && <Radio size={10}/>} {item}</button>)}</div><button className="av-icon-button" aria-label={fullscreen ? 'Exit expanded map' : 'Expand map'} title="Expand map" onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <X size={15}/> : <Expand size={15}/>}</button></header>
        {frame && <div className="av-replay-banner">Recorded {clock(frame.time, true)} <button onClick={() => setReplay(null)}>Return to live</button></div>}
        <AviationRadarMap state={shownState} selected={selected} onSelect={a => setSelected(aircraftId(a))} layer={layer} fullscreen={fullscreen} weatherConnected={weather.status === 'connected'}/>
      </section>
      <section className="av-panel av-feed"><header className="av-panel-header"><div><h2>Aircraft Feed</h2><p>{state.status === 'loading' ? 'Connecting to live aircraft…' : `${shownState.aircraft.length} aircraft in this update`}</p></div><button className="av-text-button" onClick={() => onNavigate?.('aviationflights')}>View All <ArrowRight size={12}/></button></header><label className="av-search"><Search size={14}/><input aria-label="Search aircraft feed" placeholder="Search aircraft, callsign, registration…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button title="Clear aircraft search" onClick={() => setQuery('')}><X size={12}/></button>}</label>
        <div className="av-feed-list">{aircraft.length ? aircraft.map((a, index) => { const freshness = state.status === 'cached' ? { label: 'CACHED', tone: 'old' } : contactFreshness(a); return <button className={`av-flight-row ${aircraftId(a) === selected ? 'selected' : ''}`} key={aircraftId(a)} onClick={() => { setSelected(aircraftId(a)); setLayer('Live') }}><Plane size={23} fill="currentColor" strokeWidth={1} style={{ color: ['#f23a39', '#861648', '#0658ff', '#f59e0b', '#65879c'][index % 5] }}/><div className="av-flight-id"><strong>{aircraftLabel(a)}</strong><span>{operatorName(a)}</span></div><div className="av-flight-details"><span>{a.registration || a.aircraft_type || 'ADS-B position'}</span><small>{telemetry(a.altitude_ft, 'ft')} · {telemetry(a.ground_speed_kts, 'kts')} · {a.track_deg == null ? 'track —' : `${Math.round(a.track_deg)}°`}</small></div><em className={`${a.on_ground ? 'ground' : ''} ${freshness.tone}`}>{freshness.label}</em></button> }) : <div className="av-empty"><Radio size={26}/><strong>{query ? 'No matching aircraft' : state.status === 'loading' ? 'Connecting to live traffic' : 'No live flight data available'}</strong><p>{query ? 'Try a callsign, airline or registration.' : 'The radar will update when fresh positions arrive.'}</p>{!query && <button className="av-text-button" disabled={state.refreshing} onClick={() => void refreshRadar()}>Retry connection <RefreshCw size={12}/></button>}</div>}</div>
        <footer className="av-feed-footer"><i className={connected ? 'connected' : ''}/>{connected ? `${state.source} · refreshes every 30s` : 'Waiting for live provider'}</footer>
      </section>
      <aside className="av-analytics">
        <section className="av-panel av-corridors"><header className="av-panel-header"><h2>ATC Corridor Activity</h2><button className="av-text-button" onClick={() => setPanel('Corridor Analysis')}>View All <ArrowRight size={12}/></button></header><p className="av-card-caption">Aircraft within 100 km of major airports</p><div className="av-activity-bars">{vicinity.slice(0, 5).map(a => <div className="av-activity-row" key={a.code}><span>Near {a.code}</span><div><i style={{ width: connected ? `${a.count / Math.max(1, ...vicinity.map(v => v.count)) * 100}%` : '0%' }}/></div><b>{connected ? a.count : '—'}</b></div>)}</div><span className="av-fine-print">Position counts · flight routes unavailable</span></section>
        <section className="av-panel av-alerts"><header className="av-panel-header"><h2>Recent ATC / Operational Alerts</h2><button className="av-text-button" onClick={() => setPanel('Weather & Alerts')}>View All <ArrowRight size={12}/></button></header><div className="av-alert-row"><span className="av-alert-icon green"><Check size={11}/></span><div><strong>{connected ? 'Aircraft feed received' : 'Aircraft feed pending'}</strong><p>{connected ? `${state.aircraft.length} positions · ${state.source}` : 'Reconnecting every 30 seconds'}</p></div><time>{state.retrievedAt ? clock(state.retrievedAt).replace(' IST', '') : '—'}</time></div><div className="av-alert-row"><span className={`av-alert-icon ${feedQuality === 'nominal' ? 'green' : 'amber'}`}><Info size={11}/></span><div><strong>Feed quality {feedQualityLabel.toLowerCase()}</strong><p>{connected ? `${staleAircraft} stale contacts · ${feedAgeSeconds ?? '—'}s feed age` : 'No provider response yet.'}</p></div></div><div className="av-alert-row"><span className="av-alert-icon blue"><Activity size={11}/></span><div><strong>Telemetry coverage</strong><p>Altitude, speed, track and freshness where reported.</p></div></div></section>
        <section className="av-panel av-overview"><h2>Indian Airspace Overview</h2><div>{[{ icon: Plane, value: connected ? airborne.length : '—', label: 'Airborne' }, { icon: TowerControl, value: radarAirports.length, label: 'Airports' }, { icon: BarChart3, value: connected ? liveCorridors : '—', label: 'Corridors' }, { icon: CloudSun, value: weatherAverage == null ? '—' : `${weatherAverage}°`, label: 'Weather' }].map(({ icon: Icon, value, label }) => <section key={label}><div><Icon size={18}/><b>{value}</b></div><span>{label}</span></section>)}</div></section>
      </aside>
    </div>
    <dialog ref={dialogRef} className="av-detail-dialog" onCancel={() => setPanel(null)} onClick={e => { if (e.target === e.currentTarget) setPanel(null) }}><header><div><span>AVIATION INTELLIGENCE</span><h2>{panel}</h2></div><button className="av-icon-button" aria-label="Close aviation details" onClick={() => setPanel(null)}><X size={20}/></button></header><div className="av-dialog-body">
      {panel === 'Airlines' && <><div className="av-panel-summary"><section><b>{operators.length}</b><span>operators</span></section><section><b>{connected ? state.aircraft.length : '—'}</b><span>live rows</span></section><section><b>{staleAircraft}</b><span>stale &gt;60s</span></section></div>{chosen && <div className="av-selected-contact"><strong>{aircraftLabel(chosen)}</strong><span>{operatorName(chosen)} · {telemetry(chosen.altitude_ft, 'ft')} · {contactFreshness(chosen).label}</span></div>}<p>Operators are derived from live aircraft callsigns and registrations in the current provider response.</p>{operators.length ? operators.map(([name, count]) => <div className="av-detail-row" key={name}><span>{name}</span><b>{count} aircraft</b></div>) : <p>Operator counts will appear when the aircraft feed is available.</p>}</>}
      {(panel === 'ATC Activity' || panel === 'Corridor Analysis') && <><div className="av-panel-summary"><section><b>{liveCorridors}</b><span>active airport zones</span></section><section><b>{connected ? airborne.length : '—'}</b><span>airborne</span></section><section><b>{clock(state.retrievedAt).replace(' IST', '')}</b><span>latest ADS-B</span></section></div><p>Aircraft are counted within 100 km of each airport. These are live position observations, not ATC clearances or filed routes.</p>{vicinity.map(a => <div className="av-detail-row" key={a.code}><span>{a.name} · {a.code}</span><b>{connected ? a.count : '—'} aircraft</b></div>)}</>}
      {panel === 'Weather & Alerts' && <><div className="av-panel-summary"><section><b>{weatherAverage == null ? '—' : `${weatherAverage}°C`}</b><span>India avg</span></section><section><b>{weather.rows.length}</b><span>airport weather rows</span></section><section><b>{weather.status === 'connected' ? 'Live' : '—'}</b><span>Open-Meteo</span></section></div><p>Weather is pulled live for mapped Indian airport locations. Operational ATC advisories are still not connected, so the app does not invent runway, turbulence or clearance alerts.</p>{weather.rows.length ? weather.rows.map(row => <div className="av-detail-row" key={row.code}><span>{row.code} · {weatherLabel(row.weatherCode)}</span><b>{Math.round(row.temp)}°C · {Math.round(row.wind)} km/h wind</b></div>) : <p>Weather rows are loading from the provider.</p>}<button className="av-primary-button" onClick={() => { setPanel(null); setLayer('Weather') }}>View weather layer</button></>}
      {panel === 'Historical Replay' && <><div className="av-panel-summary"><section><b>{state.history.length}</b><span>saved frames</span></section><section><b>{connected ? state.aircraft.length : '—'}</b><span>latest rows</span></section><section><b>30s</b><span>refresh cycle</span></section></div><p>Replay a captured update from this session. Up to 30 updates are retained while the app is open.</p>{state.history.length ? [...state.history].reverse().map(h => <button className="av-detail-row" key={h.time} onClick={() => { setReplay(h.time); setPanel(null) }}><span>{clock(h.time, true)}</span><b>{h.aircraft.length} aircraft <ArrowRight size={12}/></b></button>) : <p>No aircraft updates have been recorded yet.</p>}</>}
      {panel === 'Fuel & Emissions' && <><div className="av-panel-summary"><section><b>{connected ? state.aircraft.filter(a => a.aircraft_type).length : '—'}</b><span>type rows</span></section><section><b>{connected ? state.aircraft.filter(a => a.altitude_ft != null).length : '—'}</b><span>altitude rows</span></section><section><b>No</b><span>fuel feed</span></section></div><h3>Aircraft performance data required</h3><p>Fuel burn and emissions require aircraft performance, engine and flight-duration data. These values are not supplied by the current tracking feed, so this panel stays honest until a real emissions source is connected.</p>{chosen && <div className="av-detail-row"><span>Selected aircraft</span><b>{aircraftLabel(chosen)} · {chosen.aircraft_type || 'Type unavailable'}</b></div>}</>}
      {panel === 'Reports & Export' && <><div className="av-panel-summary"><section><b>{feedQualityLabel}</b><span>feed state</span></section><section><b>{staleAircraft}</b><span>stale contacts</span></section><section><b>{state.source || '—'}</b><span>source</span></section></div><h3>Export the current aircraft update</h3><p>Download callsign, registration, position, altitude, speed, heading, vertical rate and freshness. Missing values stay blank; no route or ATC values are invented.</p><button className="av-primary-button" disabled={!state.aircraft.length} onClick={() => exportRadar(state.aircraft)}><Download size={16}/> Download {state.aircraft.length} aircraft</button><small>Source: {state.source || 'Awaiting provider'} · {clock(state.retrievedAt)}</small></>}
    </div></dialog>
  </div>
}
