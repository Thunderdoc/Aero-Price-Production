import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject } from 'geojson'
import { BarChart3, Crosshair, Layers, Minus, Plus } from 'lucide-react'
import { aircraftId, aircraftLabel, flightPhase, operatorName, radarAirports, telemetry, type Aircraft, type RadarSnapshot } from '../services/aviationRadar'

export type RadarLayer = 'Live' | 'Routes' | 'Corridors' | 'Weather' | 'ATC Zones'
const INDIA_BOUNDS: L.LatLngBoundsExpression = [[5.3, 65.7], [36.3, 98.8]]
const planeShape = '<path d="M10 1c-1 0-1.4 1.6-1.4 3v4L1 13v2l7.6-2v4L6 19v1l4-1 4 1v-1l-2.6-2v-4l7.6 2v-2l-7.6-5V4C11.4 2.6 11 1 10 1Z"/>'
const corridorPairs = [['DEL','BOM'], ['DEL','BLR'], ['DEL','CCU'], ['BOM','BLR'], ['BLR','MAA'], ['HYD','DEL'], ['AMD','BOM'], ['GAU','CCU']]

function MapControls({ trails, setTrails, boundaries, setBoundaries }: { trails: boolean; setTrails: (v: boolean) => void; boundaries: boolean; setBoundaries: (v: boolean) => void }) {
  const map = useMap()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) { L.DomEvent.disableClickPropagation(ref.current); L.DomEvent.disableScrollPropagation(ref.current) }
    const observer = new ResizeObserver(() => { map.invalidateSize(); map.fitBounds(INDIA_BOUNDS, { padding: [18, 18], animate: false }) })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return <div className="av-map-controls" ref={ref}>
    <div className="av-zoom"><button title="Zoom in" aria-label="Zoom in" onClick={() => map.zoomIn()}><Plus size={17}/></button><button title="Zoom out" aria-label="Zoom out" onClick={() => map.zoomOut()}><Minus size={17}/></button></div>
    <button title="Recenter India" aria-label="Recenter India" onClick={() => map.fitBounds(INDIA_BOUNDS, { padding: [18, 18] })}><Crosshair size={18}/></button>
    <button title="Map layers" aria-label="Map layers" aria-expanded={open} onClick={() => setOpen(!open)}><Layers size={18}/></button>
    {open && <div className="av-layer-menu"><b>Map layers</b><label><input type="checkbox" checked={boundaries} onChange={e => setBoundaries(e.target.checked)}/> State boundaries</label><label><input type="checkbox" checked={trails} onChange={e => setTrails(e.target.checked)}/> Recorded flight trails</label></div>}
  </div>
}

function AircraftMarker({ aircraft, selected, onSelect }: { aircraft: Aircraft; selected: boolean; onSelect: (a: Aircraft) => void }) {
  const marker = useRef<L.Marker>(null)
  const phase = flightPhase(aircraft)
  const icon = useMemo(() => L.divIcon({ className: `av-aircraft ${selected ? 'is-selected' : ''}`, iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<svg viewBox="0 0 20 21" width="23" height="24" style="fill:${phase.color};transform:rotate(${aircraft.track_deg ?? 0}deg)">${planeShape}</svg>`
  }), [phase.color, aircraft.track_deg, selected])
  useEffect(() => { if (selected) marker.current?.openPopup() }, [selected])
  return <Marker ref={marker} position={[aircraft.latitude, aircraft.longitude]} icon={icon} title={aircraftLabel(aircraft)} eventHandlers={{ click: () => onSelect(aircraft) }}>
    <Popup className="av-aircraft-popup" minWidth={142} autoPan={false}><strong>{aircraftLabel(aircraft)}</strong><span>{operatorName(aircraft)}</span><span>{aircraft.aircraft_type || 'Aircraft type unavailable'}</span><span>{telemetry(aircraft.altitude_ft, 'ft')} · {telemetry(aircraft.ground_speed_kts, 'kts')}</span><small>{aircraft.registration || 'Registration unavailable'}</small><em style={{ color: phase.color }}>{phase.label}</em></Popup>
  </Marker>
}

export default function AviationRadarMap({ state, selected, onSelect, layer, fullscreen, weatherConnected = false }: { state: RadarSnapshot; selected: string | null; onSelect: (a: Aircraft) => void; layer: RadarLayer; fullscreen: boolean; weatherConnected?: boolean }) {
  const [geo, setGeo] = useState<GeoJsonObject | null>(null)
  const [boundaries, setBoundaries] = useState(true)
  const [trails, setTrails] = useState(true)
  const [mapFailed, setMapFailed] = useState(false)
  useEffect(() => { const controller = new AbortController(); fetch('/maps/india-states-2019.geojson', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json() }).then(setGeo).catch(e => { if (e.name !== 'AbortError') setMapFailed(true) }); return () => controller.abort() }, [])
  const paths = useMemo(() => {
    const result = new Map<string, L.LatLngTuple[]>()
    state.history.forEach(frame => frame.aircraft.forEach(a => { const id = aircraftId(a); const path = result.get(id) ?? []; path.push([a.latitude, a.longitude]); result.set(id, path) }))
    return [...result.entries()].filter(([, points]) => points.length > 1)
  }, [state.history])
  const phases = ['airborne', 'descending', 'climbing', 'ground']
  const layerNotice: Partial<Record<RadarLayer, string>> = {
    Routes: paths.length ? 'Flight trails recorded during this session' : 'Flight trails build as fresh positions arrive. Origin and destination are not supplied by this feed.',
    Corridors: 'Indicative airport corridors are drawn for situational awareness; live aircraft remain provider positions.',
    Weather: weatherConnected ? 'Live airport weather is connected. Aircraft positions remain visible on the radar.' : 'Weather coverage is connecting. Aircraft positions remain visible.',
    'ATC Zones': 'Approximate 100 km airport control zones are shown. Official ATC sector files are not connected.',
  }
  const airportByCode = new Map(radarAirports.map(a => [a.code, a]))
  return <div className={`av-radar ${fullscreen ? 'av-radar-expanded' : ''}`}>
    <MapContainer bounds={INDIA_BOUNDS} boundsOptions={{ padding: [18, 18] }} zoomControl={false} scrollWheelZoom={false} minZoom={3} maxZoom={12} zoomSnap={.25} attributionControl className="av-leaflet-map">
      <TileLayer className="av-basemap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19}/>
      {geo && boundaries && <GeoJSON data={geo} style={{ color: '#148aca', weight: 1, fillColor: '#063651', fillOpacity: .42 }}/>} 
      {layer === 'ATC Zones' && radarAirports.map(a => <Circle key={`zone-${a.code}`} center={[a.lat, a.lng]} radius={100000} pathOptions={{ color: '#4ecbff', weight: 1.2, dashArray: '6 8', fillColor: '#0ea5e9', fillOpacity: .1 }}/>)}
      {layer === 'Corridors' && corridorPairs.map(([from, to]) => { const a = airportByCode.get(from); const b = airportByCode.get(to); return a && b ? <Polyline key={`${from}-${to}`} positions={[[a.lat, a.lng], [b.lat, b.lng]]} pathOptions={{ color: '#22d36e', weight: 1.4, dashArray: '5 8', opacity: .75 }}/> : null })}
      {layer === 'Weather' && radarAirports.map(a => <CircleMarker key={`wx-${a.code}`} center={[a.lat, a.lng]} radius={18} pathOptions={{ color: '#f8c147', weight: 1, fillColor: '#fbbf24', fillOpacity: .22 }}><Tooltip permanent direction="top" className="av-airport-label">WX {a.code}</Tooltip></CircleMarker>)}
      {(trails || layer === 'Routes') && paths.map(([id, positions]) => <Polyline key={id} positions={positions} pathOptions={{ color: '#20adc3', weight: 1, dashArray: '4 6', opacity: .65 }}/>) }
      {radarAirports.map(a => <CircleMarker key={a.code} center={[a.lat, a.lng]} radius={5} pathOptions={{ color: '#acd5ff', weight: 2, fillColor: '#1662ff', fillOpacity: 1 }}><Tooltip permanent direction={a.code === 'BOM' || a.code === 'BLR' ? 'left' : 'right'} className="av-airport-label">{a.code}</Tooltip><Popup><strong>{a.name} · {a.code}</strong><br/>Airport reference location</Popup></CircleMarker>)}
      {state.aircraft.map(a => <AircraftMarker key={aircraftId(a)} aircraft={a} selected={selected === aircraftId(a)} onSelect={onSelect}/>)}
      <MapControls trails={trails} setTrails={setTrails} boundaries={boundaries} setBoundaries={setBoundaries}/>
    </MapContainer>
    {layerNotice[layer] && <div className="av-map-notice" role="status">{layerNotice[layer]}</div>}
    {(state.status !== 'connected' && state.status !== 'cached' || mapFailed) && <div className="av-map-connection" role="status">{mapFailed ? 'Basemap unavailable — aircraft positions remain visible' : state.status === 'loading' ? 'Connecting to aircraft feed…' : state.status === 'empty' ? 'Provider returned no aircraft positions' : 'Live tracking temporarily unavailable'}</div>}
    <div className="av-map-legend">{phases.map((key, i) => <div key={key}><svg viewBox="0 0 20 21" width="17" height="17" fill={['#2ed75c', '#facc15', '#fb923c', '#93a9bc'][i]}>{/* same north-facing aircraft silhouette */}<path d="M10 1 8.6 4v4L1 13l7.6-2v4L6 19v1l4-1 4 1v-1l-2.6-2v-4l7.6 2v-2l-7.6-5V4Z"/></svg><span>{['Airborne', 'Descending', 'Climbing', 'On ground'][i]}</span><b>{state.aircraft.filter(a => flightPhase(a).key === key).length}</b></div>)}</div>
    <button className={`av-traffic-toggle ${trails ? 'active' : ''}`} onClick={() => setTrails(!trails)} aria-pressed={trails}><BarChart3 size={20}/>{trails ? 'Hide flight trails' : 'Show flight trails'}</button>
    <div className="av-radar-source">{state.source || 'ADS-B'} · {state.status === 'connected' ? 'Live positions' : state.status === 'cached' ? 'Provider reconnecting' : state.status === 'empty' ? 'No positions returned' : 'Awaiting feed'}</div>
  </div>
}
