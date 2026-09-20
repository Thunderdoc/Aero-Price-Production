import { useState, useEffect, useRef } from 'react'
import { Radio, RefreshCw, AlertTriangle, Plane, Clock } from 'lucide-react'
import { fetchAllCorridorFlights, type LiveFlight } from '../services/flightData'

// ── India map projection ──────────────────────────────────────────────────────
const proj = (lat: number, lng: number) => ({
  x: (lng - 67.5) / 30 * 280,
  y: (37.5 - lat) / 30 * 310,
})

const AIRPORTS: Record<string, { name: string; lat: number; lng: number; major: boolean }> = {
  DEL:{ name:'Delhi',                lat:28.7, lng:77.1, major:true  },
  BOM:{ name:'Mumbai',               lat:19.1, lng:72.9, major:true  },
  BLR:{ name:'Bengaluru',            lat:12.9, lng:77.6, major:true  },
  MAA:{ name:'Chennai',              lat:13.1, lng:80.3, major:true  },
  HYD:{ name:'Hyderabad',            lat:17.4, lng:78.5, major:true  },
  CCU:{ name:'Kolkata',              lat:22.6, lng:88.4, major:true  },
  AMD:{ name:'Ahmedabad',            lat:23.1, lng:72.6, major:false },
  GOI:{ name:'Goa',                  lat:15.4, lng:73.8, major:false },
  LKO:{ name:'Lucknow',             lat:26.8, lng:80.9, major:false },
  JAI:{ name:'Jaipur',              lat:26.8, lng:75.8, major:false },
  PAT:{ name:'Patna',               lat:25.6, lng:85.1, major:false },
  GAU:{ name:'Guwahati',            lat:26.1, lng:91.6, major:false },
}

const APS = Object.entries(AIRPORTS).reduce((acc, [code, ap]) => {
  const { x, y } = proj(ap.lat, ap.lng)
  acc[code] = { ...ap, code, x, y }
  return acc
}, {} as Record<string, { name: string; lat: number; lng: number; major: boolean; code: string; x: number; y: number }>)

const CORRIDORS = [
  { dep:'DEL', arr:'BOM' }, { dep:'DEL', arr:'BLR' }, { dep:'DEL', arr:'CCU' },
  { dep:'BOM', arr:'MAA' }, { dep:'BLR', arr:'HYD' }, { dep:'DEL', arr:'HYD' },
]

function statusColor(s: string) {
  if (s === 'active')    return 'var(--color-success)'
  if (s === 'landed')    return 'var(--color-info)'
  if (s === 'cancelled') return 'var(--color-danger)'
  if (s === 'scheduled') return 'var(--color-warning)'
  return 'var(--color-text-tertiary)'
}

export default function AviationLive() {
  const [flights, setFlights] = useState<LiveFlight[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date|null>(null)
  const [error, setError] = useState<string|null>(null)
  const [apiDataCount, setApiDataCount] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>|null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const results = await fetchAllCorridorFlights()
      const all: LiveFlight[] = results.flatMap(r => r.flights)
      setFlights(all)
      setApiDataCount(all.length)
      if (results.every(r => r.source === 'UNAVAILABLE')) {
        setError(results[0]?.error ?? 'AviationStack unavailable')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
    setLastFetch(new Date())
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const activeFlights   = flights.filter(f => f.status === 'active')
  const scheduledFlights = flights.filter(f => f.status === 'scheduled')
  const landedFlights   = flights.filter(f => f.status === 'landed')

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ padding:'16px 24px', flexShrink:0, display:'flex', alignItems:'center',
        justifyContent:'space-between', borderBottom:'1px solid var(--color-border-primary)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Radio size={17} style={{ color:'var(--color-brand-primary)' }}/>
          <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--color-text-primary)', letterSpacing:'-0.01em' }}>
            Live Flight Map
          </h1>
          <div style={{ width:7, height:7, borderRadius:'50%', background: error ? 'var(--color-warning)' : 'var(--color-success)',
            boxShadow: `0 0 6px ${error ? 'var(--color-warning)' : 'var(--color-success)'}` }}/>
          <span style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>
            {loading ? 'Refreshing…' : lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : 'Not loaded'}
          </span>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>
            {apiDataCount > 0 ? `${apiDataCount} flights via AviationStack` : 'AviationStack — schedule only'}
          </span>
          <button onClick={load} disabled={loading}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8,
              border:'1px solid var(--color-border-primary)', background:'var(--color-surface-secondary)',
              fontSize:11, color:'var(--color-text-secondary)', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, fontFamily:'var(--font-sans)' }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
            Refresh
          </button>
        </div>
      </div>

      {/* AviationStack limitation notice */}
      {error && (
        <div style={{ padding:'10px 24px', flexShrink:0, display:'flex', alignItems:'center', gap:8,
          background:'var(--color-warning-bg)', borderBottom:'1px solid rgba(217,119,6,0.2)' }}>
          <AlertTriangle size={13} style={{ color:'var(--color-warning)', flexShrink:0 }}/>
          <span style={{ fontSize:11, color:'var(--color-warning)' }}>
            AviationStack: {error}. Free tier provides schedule data, not real-time positions. Map shows corridor routes.
          </span>
        </div>
      )}

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Map panel */}
        <div style={{ flex:1, position:'relative', background:'var(--color-surface-canvas)',
          borderRight:'1px solid var(--color-border-primary)' }}>
          <svg viewBox="-10 0 300 320" width="100%" height="100%"
            style={{ position:'absolute', inset:0 }}>
            <defs>
              <filter id="al-hub"><feGaussianBlur in="SourceGraphic" stdDeviation="4"/></filter>
              <filter id="al-node"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5"/></filter>
            </defs>

            {/* Corridor arcs */}
            {CORRIDORS.map((c, i) => {
              const a = APS[c.dep], b = APS[c.arr]
              if (!a || !b) return null
              const mx = (a.x+b.x)/2, my = (a.y+b.y)/2 - 30
              return (
                <g key={i}>
                  <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                    fill="none" stroke="rgba(96,165,250,0.15)" strokeWidth="3" strokeLinecap="round"
                    filter="url(#al-node)"/>
                  <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                    fill="none" stroke="rgba(147,197,253,0.4)" strokeWidth="0.75"
                    strokeDasharray="4 4" strokeLinecap="round"/>
                </g>
              )
            })}

            {/* Airport nodes */}
            {Object.values(APS).map(ap => {
              const isMajor = ap.major
              return (
                <g key={ap.code}>
                  {isMajor && <circle cx={ap.x} cy={ap.y} r={18} fill="rgba(37,99,235,0.07)" filter="url(#al-hub)"/>}
                  <circle cx={ap.x} cy={ap.y} r={isMajor?11:7}
                    fill={isMajor?"rgba(37,99,235,0.2)":"rgba(37,99,235,0.1)"} filter="url(#al-node)"/>
                  <circle cx={ap.x} cy={ap.y} r={isMajor?5.5:3.5}
                    fill="none" stroke={isMajor?"rgba(147,197,253,0.7)":"rgba(147,197,253,0.45)"}
                    strokeWidth={isMajor?1.1:0.8}/>
                  <circle cx={ap.x} cy={ap.y} r={isMajor?2:1.4}
                    fill={isMajor?"rgba(230,245,255,1)":"rgba(186,220,255,0.9)"}/>
                  <text x={ap.x} y={ap.y + (isMajor?16:12)} textAnchor="middle"
                    fontSize={isMajor?"6.5":"5.5"} fill="rgba(186,220,255,0.8)"
                    fontFamily="var(--font-sans)" fontWeight="600">
                    {ap.code}
                  </text>
                </g>
              )
            })}

            {/* No-position notice */}
            <text x="140" y="310" textAnchor="middle" fontSize="7" fill="rgba(147,197,253,0.5)"
              fontFamily="var(--font-sans)">
              AviationStack free tier: schedule data only · real-time positions unavailable
            </text>
          </svg>

          {/* KPI overlays */}
          <div style={{ position:'absolute', top:12, left:12, display:'flex', flexDirection:'column', gap:6 }}>
            {[
              { label:'ACTIVE',    value: activeFlights.length,   color:'var(--color-success)' },
              { label:'SCHEDULED', value: scheduledFlights.length, color:'var(--color-warning)' },
              { label:'LANDED',    value: landedFlights.length,   color:'var(--color-info)' },
            ].map(k => (
              <div key={k.label} style={{ padding:'6px 10px', borderRadius:8,
                background:'rgba(8,14,26,0.75)', border:`1px solid ${k.color}33`, backdropFilter:'blur(8px)',
                display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:k.color,
                  boxShadow:`0 0 4px ${k.color}` }}/>
                <span style={{ fontSize:10, fontWeight:700, color:k.color, letterSpacing:'0.08em' }}>
                  {k.label}
                </span>
                <span style={{ fontSize:13, fontWeight:800, color:'white', fontFamily:'var(--font-mono)' }}>
                  {k.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar — flights list */}
        <div style={{ width:300, flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--color-border-primary)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--color-text-primary)' }}>
              Flight Schedule
            </span>
            <span style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>
              {flights.length} total
            </span>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {flights.length === 0 ? (
              <div style={{ padding:24, textAlign:'center' }}>
                <Plane size={24} style={{ color:'var(--color-text-tertiary)', marginBottom:10 }}/>
                <p style={{ margin:0, fontSize:12, color:'var(--color-text-tertiary)', lineHeight:1.6 }}>
                  {loading ? 'Fetching from AviationStack…' : 'No flights returned. AviationStack free tier may require active flights.'}
                </p>
              </div>
            ) : flights.map((f, i) => (
              <div key={`${f.flight_iata}-${i}`} style={{ padding:'10px 14px',
                borderBottom:'1px solid var(--color-border-primary)',
                background: i%2===0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)',
                    fontFamily:'var(--font-mono)' }}>
                    {f.flight_iata || '—'}
                  </span>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:99,
                    color: statusColor(f.status),
                    background: `${statusColor(f.status)}22`,
                    letterSpacing:'0.08em', border:`1px solid ${statusColor(f.status)}44` }}>
                    {f.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize:11, color:'var(--color-text-secondary)', marginBottom:3 }}>
                  {f.airline_name || f.airline_iata}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--color-text-primary)',
                    fontWeight:600 }}>{f.dep_iata}</span>
                  <span style={{ fontSize:9, color:'var(--color-text-tertiary)' }}>→</span>
                  <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--color-text-primary)',
                    fontWeight:600 }}>{f.arr_iata}</span>
                  {f.dep_scheduled && (
                    <span style={{ fontSize:10, color:'var(--color-text-tertiary)', marginLeft:'auto',
                      display:'flex', alignItems:'center', gap:3 }}>
                      <Clock size={10}/>
                      {new Date(f.dep_scheduled).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
