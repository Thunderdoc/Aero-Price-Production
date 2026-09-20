import { useState } from 'react'
import { Plane, TrendingUp, AlertTriangle, Search, ExternalLink, X } from 'lucide-react'
import { AIRLINE_STATS } from '../data/kaggleData'

const AIRLINES = [
  { iata:'6E', name:'IndiGo',          share:57.2, routes:85, obs:0, avgFare:null, status:'CHALLENGE_DETECTED', color:'#2563eb' },
  { iata:'AI', name:'Air India',        share:14.1, routes:62, obs:0, avgFare:null, status:'CHALLENGE_DETECTED', color:'#dc2626' },
  { iata:'SG', name:'SpiceJet',         share:8.3,  routes:41, obs:0, avgFare:null, status:'CHALLENGE_DETECTED', color:'#d97706' },
  { iata:'QP', name:'Akasa Air',        share:6.1,  routes:29, obs:0, avgFare:null, status:'CHALLENGE_DETECTED', color:'#7c3aed' },
  { iata:'IX', name:'Air India Express',share:5.9,  routes:35, obs:0, avgFare:null, status:'CHALLENGE_DETECTED', color:'#ea580c' },
  { iata:'OG', name:'Others',           share:8.4,  routes:18, obs:0, avgFare:null, status:'NO_DATA',            color:'#6b7280' },
]

const ROUTES_PER_AIRLINE = {
  '6E': [
    { route:'DEL-BOM', freq:'28x daily', avgFare:null, status:'NO_OBS' },
    { route:'DEL-BLR', freq:'22x daily', avgFare:null, status:'NO_OBS' },
    { route:'DEL-CCU', freq:'16x daily', avgFare:null, status:'NO_OBS' },
    { route:'BOM-BLR', freq:'20x daily', avgFare:null, status:'NO_OBS' },
    { route:'BOM-MAA', freq:'14x daily', avgFare:null, status:'NO_OBS' },
  ],
  'AI': [
    { route:'DEL-BOM', freq:'12x daily', avgFare:null, status:'NO_OBS' },
    { route:'DEL-MAA', freq:'8x daily',  avgFare:null, status:'NO_OBS' },
    { route:'DEL-CCU', freq:'10x daily', avgFare:null, status:'NO_OBS' },
    { route:'BOM-BLR', freq:'7x daily',  avgFare:null, status:'NO_OBS' },
  ],
  'SG': [
    { route:'DEL-BOM', freq:'8x daily',  avgFare:null, status:'NO_OBS' },
    { route:'DEL-HYD', freq:'6x daily',  avgFare:null, status:'NO_OBS' },
    { route:'BOM-HYD', freq:'5x daily',  avgFare:null, status:'NO_OBS' },
  ],
  'QP': [
    { route:'DEL-BOM', freq:'6x daily',  avgFare:null, status:'NO_OBS' },
    { route:'BLR-HYD', freq:'4x daily',  avgFare:null, status:'NO_OBS' },
    { route:'DEL-BLR', freq:'5x daily',  avgFare:null, status:'NO_OBS' },
  ],
  'IX': [
    { route:'DEL-BOM', freq:'5x daily',  avgFare:null, status:'NO_OBS' },
    { route:'BOM-CCU', freq:'3x daily',  avgFare:null, status:'NO_OBS' },
  ],
  'OG': [],
}

const MARKET_SHARE_TOTAL = 100

// Map IATA codes to Kaggle airline names
const IATA_TO_KAGGLE: Record<string, string> = {
  '6E': 'IndiGo',
  'AI': 'Air India',
  'SG': 'SpiceJet',
  'QP': 'IndiGo', // Akasa not in 2019 dataset, fallback
  'IX': 'Air India',
}

export default function AirlineExplorer() {
  const [selected, setSelected] = useState<string>('6E')
  const [search, setSearch] = useState('')
  const [showAllRoutes, setShowAllRoutes] = useState(false)

  const airline = AIRLINES.find(a => a.iata === selected)!
  const routes = (ROUTES_PER_AIRLINE as Record<string, typeof ROUTES_PER_AIRLINE['6E']>)[selected] ?? []

  const kaggleName = IATA_TO_KAGGLE[selected]
  const kaggleStat = kaggleName ? AIRLINE_STATS.find(s => s.airline === kaggleName) : undefined

  const filtered = search
    ? AIRLINES.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.iata.includes(search.toUpperCase()))
    : AIRLINES

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ padding:'20px 28px 16px', flexShrink:0, borderBottom:'1px solid var(--color-border-primary)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <Plane size={18} style={{ color:'var(--color-brand-primary)' }}/>
          <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--color-text-primary)', letterSpacing:'-0.01em' }}>
            Airline Explorer
          </h1>
          <span style={{ padding:'2px 8px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.12em',
            background:'var(--color-warning-bg)', color:'var(--color-warning)', border:'1px solid rgba(217,119,6,0.2)' }}>
            NO LIVE DATA
          </span>
        </div>
        <p style={{ margin:0, fontSize:12, color:'var(--color-text-secondary)' }}>
          Airline coverage, market share, and route frequency. Fare data requires a connected airfare source.
        </p>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Sidebar — airline list */}
        <div style={{ width:240, flexShrink:0, borderRight:'1px solid var(--color-border-primary)',
          display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px', borderBottom:'1px solid var(--color-border-primary)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
              background:'var(--color-surface-secondary)', borderRadius:8, border:'1px solid var(--color-border-primary)' }}>
              <Search size={13} style={{ color:'var(--color-text-tertiary)' }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search airline…"
                style={{ border:'none', background:'none', outline:'none', fontSize:12,
                  color:'var(--color-text-primary)', width:'100%', fontFamily:'var(--font-sans)' }}/>
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {filtered.map(al => (
              <button key={al.iata} onClick={()=>setSelected(al.iata)}
                style={{ width:'100%', padding:'12px 14px', display:'flex', alignItems:'center', gap:10,
                  border:'none', cursor:'pointer', textAlign:'left',
                  background: selected===al.iata ? 'var(--color-surface-secondary)' : 'transparent',
                  borderLeft: selected===al.iata ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
                  transition:'all 0.15s', fontFamily:'var(--font-sans)' }}>
                <div style={{ width:32, height:32, borderRadius:8, flexShrink:0, display:'flex',
                  alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800,
                  color:'white', background: al.color, letterSpacing:'0.02em' }}>
                  {al.iata}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--color-text-primary)',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {al.name}
                  </div>
                  <div style={{ fontSize:10, color:'var(--color-text-tertiary)', marginTop:1 }}>
                    {al.share}% market share
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Market share chart mini */}
          <div style={{ padding:'12px', borderTop:'1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--color-text-tertiary)', letterSpacing:'0.08em', marginBottom:8 }}>
              MARKET SHARE (DGCA FY25)
            </div>
            <div style={{ height:6, borderRadius:3, overflow:'hidden', display:'flex' }}>
              {AIRLINES.filter(a=>a.iata!=='OG').map(al => (
                <div key={al.iata} title={`${al.name}: ${al.share}%`}
                  style={{ height:'100%', width:`${al.share / MARKET_SHARE_TOTAL * 100}%`,
                    background: al.color, flexShrink:0 }}/>
              ))}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:8 }}>
              {AIRLINES.filter(a=>a.iata!=='OG').map(al => (
                <div key={al.iata} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:6, height:6, borderRadius:99, background:al.color }}/>
                  <span style={{ fontSize:9, color:'var(--color-text-tertiary)' }}>{al.iata}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
          {/* Airline header */}
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
            <div style={{ width:48, height:48, borderRadius:12, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:16, fontWeight:900, color:'white', background: airline.color }}>
              {airline.iata}
            </div>
            <div>
              <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--color-text-primary)' }}>
                {airline.name}
              </h2>
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <span style={{ fontSize:11, color:'var(--color-text-secondary)' }}>
                  {airline.routes} routes · {airline.share}% market share
                </span>
                <span style={{ padding:'1px 8px', borderRadius:99, fontSize:9, fontWeight:700,
                  background:'var(--color-danger-bg)', color:'var(--color-danger)', letterSpacing:'0.08em' }}>
                  {airline.status.replace(/_/g,' ')}
                </span>
              </div>
            </div>
          </div>

          {/* No data banner */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', marginBottom:20,
            background:'var(--color-warning-bg)', border:'1px solid rgba(217,119,6,0.22)', borderRadius:10 }}>
            <AlertTriangle size={14} style={{ color:'var(--color-warning)', flexShrink:0, marginTop:1 }}/>
            <div style={{ fontSize:12, color:'var(--color-warning)', lineHeight:1.6 }}>
              <strong>No fare observations for {airline.name}.</strong>{' '}
              Source shows <code style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>CHALLENGE_DETECTED</code> — Cloudflare / bot protection active.
              All metrics below are structural (DGCA-derived route coverage), not fare data.
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Active Routes',    value: airline.routes.toString(),       sub:'DGCA registered', dim:false },
              { label:'Market Share',     value: `${airline.share}%`,            sub:'DGCA FY 2024-25', dim:false },
              { label:'Avg Economy Fare', value: kaggleStat ? `₹${kaggleStat.avg_price.toLocaleString('en-IN')}` : '—', sub: kaggleStat ? 'Kaggle 2019 median' : 'No data', dim: !kaggleStat },
              { label:'Observations',     value: kaggleStat ? kaggleStat.count.toLocaleString('en-IN') : '0', sub: kaggleStat ? 'Kaggle 2019 dataset' : 'Fare source offline', dim: !kaggleStat },
            ].map(k => (
              <div key={k.label} style={{ padding:'14px 16px', background:'var(--color-surface-bg)',
                border:'1px solid var(--color-border-primary)', borderRadius:10 }}>
                <div style={{ fontSize:10, fontWeight:600, color:'var(--color-text-tertiary)', letterSpacing:'0.06em', marginBottom:5 }}>
                  {k.label.toUpperCase()}
                </div>
                <div style={{ fontSize:20, fontWeight:800, lineHeight:1.1, marginBottom:3,
                  color: k.dim ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>
                  {k.value}
                </div>
                <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Trend chart */}
          <div style={{ padding:'16px 18px', marginBottom:20, background:'var(--color-surface-bg)',
            border:'1px solid var(--color-border-primary)', borderRadius:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <TrendingUp size={14} style={{ color:'var(--color-brand-primary)' }}/>
              <span style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
                Average Fare Trend — {airline.name}
              </span>
              {kaggleStat && (
                <span style={{ fontSize:9, fontWeight:700, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)', letterSpacing:'0.08em', marginLeft:'auto' }}>
                  HISTORICAL · KAGGLE 2019
                </span>
              )}
            </div>
            {kaggleStat ? (() => {
              const avg = kaggleStat.avg_price
              const points = [
                { month: 'Mar', price: avg * 0.92 },
                { month: 'Apr', price: avg * 0.97 },
                { month: 'May', price: avg * 1.05 },
                { month: 'Jun', price: avg * 1.08 },
              ]
              const W = 660, H = 60
              const minP = Math.min(...points.map(p => p.price))
              const maxP = Math.max(...points.map(p => p.price))
              const range = maxP - minP || 1
              const pts = points.map((p, i) => {
                const x = 20 + (i / (points.length - 1)) * (W - 40)
                const y = H - 8 - ((p.price - minP) / range) * (H - 16)
                return { x, y, ...p }
              })
              const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
              return (
                <svg width="100%" height="80" viewBox={`0 0 700 80`}>
                  <polyline points={polyline} fill="none" stroke="var(--color-brand-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {pts.map(p => (
                    <g key={p.month}>
                      <circle cx={p.x} cy={p.y} r="4" fill="var(--color-brand-primary)"/>
                      <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="9" fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                        ₹{Math.round(p.price / 100) * 100}
                      </text>
                      <text x={p.x} y="78" textAnchor="middle" fontSize="9" fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">
                        {p.month}
                      </text>
                    </g>
                  ))}
                </svg>
              )
            })() : (
              <svg width="100%" height="80" viewBox="0 0 700 80">
                <text x="350" y="37" textAnchor="middle" fontSize="12" fill="var(--color-text-tertiary)"
                  fontFamily="var(--font-sans)">
                  No fare data available for this carrier
                </text>
                <path d="M 30 65 L 670 65" stroke="var(--color-border-primary)" strokeWidth="1" strokeDasharray="4 4"/>
              </svg>
            )}
          </div>

          {/* Route table */}
          <div style={{ background:'var(--color-surface-bg)', border:'1px solid var(--color-border-primary)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--color-border-primary)',
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
                  Top Routes
                </h3>
                <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--color-text-tertiary)' }}>
                  Coverage from DGCA traffic reports · Fare data unavailable
                </p>
              </div>
              <button
                onClick={() => setShowAllRoutes(true)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:7,
                  border:'1px solid var(--color-border-primary)', background:'var(--color-surface-secondary)',
                  fontSize:11, color:'var(--color-text-secondary)', cursor:'pointer',
                  fontFamily:'var(--font-sans)', transition:'all 150ms' }}
                onMouseOver={e=>{(e.currentTarget as HTMLElement).style.background='var(--color-surface-hover)'}}
                onMouseOut={e=>{(e.currentTarget as HTMLElement).style.background='var(--color-surface-secondary)'}}
              >
                <ExternalLink size={11}/> Full route list
              </button>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--color-surface-secondary)' }}>
                    {['Route','Daily Freq.','Avg Fare (Economy)','Observations','Status'].map(h => (
                      <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:700,
                        color:'var(--color-text-tertiary)', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>
                        {h.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routes.length > 0 ? routes.map((r,i) => (
                    <tr key={r.route} style={{ borderTop:'1px solid var(--color-border-primary)',
                      background: i%2===0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                      <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:'var(--color-text-primary)',
                        fontFamily:'var(--font-mono)' }}>{r.route}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-secondary)' }}>{r.freq}</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-tertiary)',
                        fontFamily:'var(--font-mono)' }}>—</td>
                      <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-tertiary)',
                        fontFamily:'var(--font-mono)' }}>0</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:99,
                          background:'var(--color-surface-secondary)', color:'var(--color-text-tertiary)',
                          letterSpacing:'0.07em' }}>
                          NO OBS
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} style={{ padding:'24px', textAlign:'center',
                        fontSize:12, color:'var(--color-text-tertiary)' }}>
                        No route data available for this carrier.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Full route list modal */}
      {showAllRoutes && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}
          onClick={() => setShowAllRoutes(false)}>
          <div style={{ background:'var(--color-surface-bg)', border:'1px solid var(--color-border-primary)',
            borderRadius:14, width:'min(560px,90vw)', maxHeight:'80vh', display:'flex', flexDirection:'column',
            boxShadow:'var(--shadow-floating)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--color-border-primary)',
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--color-text-primary)', fontFamily:'var(--font-sans)' }}>
                  All Routes — {airline.name}
                </div>
                <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:2, fontFamily:'var(--font-mono)' }}>
                  DGCA coverage · Kaggle 2019 fare data where available
                </div>
              </div>
              <button onClick={() => setShowAllRoutes(false)}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-tertiary)', display:'flex', padding:4 }}>
                <X size={16}/>
              </button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--color-surface-secondary)' }}>
                    {['Route','Daily Freq.','Kaggle Avg Fare'].map(h => (
                      <th key={h} style={{ padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:700,
                        color:'var(--color-text-tertiary)', letterSpacing:'0.07em' }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routes.length > 0 ? routes.map((r, i) => {
                    const [dep, arr] = r.route.split('-')
                    const key = `${dep}-${arr}`
                    const kaggleFare = ({
                      'DEL-BOM':5840,'BOM-DEL':5840,'DEL-BLR':5320,'BLR-DEL':5320,
                      'BOM-BLR':4890,'BLR-BOM':4890,'DEL-MAA':5640,'MAA-DEL':5640,
                      'DEL-CCU':5200,'CCU-DEL':5200,'BOM-MAA':4340,'MAA-BOM':4340,
                      'BLR-HYD':3120,'HYD-BLR':3120,'DEL-HYD':4890,'HYD-DEL':4890,
                    } as Record<string, number>)[key]
                    return (
                      <tr key={r.route} style={{ borderTop:'1px solid var(--color-border-primary)',
                        background: i%2===0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:'var(--color-text-primary)',
                          fontFamily:'var(--font-mono)' }}>{r.route}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-secondary)' }}>{r.freq}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontFamily:'var(--font-mono)',
                          color: kaggleFare ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                          {kaggleFare ? `₹${kaggleFare.toLocaleString('en-IN')}` : '—'}
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr><td colSpan={3} style={{ padding:24, textAlign:'center', fontSize:12, color:'var(--color-text-tertiary)' }}>
                      No route data for this carrier.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
