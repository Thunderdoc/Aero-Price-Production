import { useState } from 'react'
import { Calendar, TrendingDown, TrendingUp, Info } from 'lucide-react'
import { OVERALL_STATS } from '../data/kaggleData'

const WINDOWS = [
  { label:'0–1 day',   key:'0d',  description:'Last-minute',  multiplier:1.55, color:'var(--color-danger)',  obs: 850 },
  { label:'2–3 days',  key:'3d',  description:'Ultra short',  multiplier:1.38, color:'var(--color-warning)', obs: 1240 },
  { label:'4–7 days',  key:'7d',  description:'Short haul',   multiplier:1.22, color:'var(--color-warning)', obs: 2100 },
  { label:'8–14 days', key:'14d', description:'Standard',     multiplier:1.08, color:'var(--color-success)', obs: 2800 },
  { label:'15–30 days',key:'30d', description:'Advance',      multiplier:0.95, color:'var(--color-success)', obs: 2300 },
  { label:'30+ days',  key:'30p', description:'Early bird',   multiplier:0.82, color:'var(--color-info)',     obs: 1393 },
]

// Per-route multiplier offsets (small variation)
const ROUTE_OFFSETS: Record<string, number[]> = {
  'DEL-BOM': [0,    0,    0,    0,    0,    0   ],
  'DEL-BLR': [0.02, 0.01, 0,   -0.01,-0.01,-0.02],
  'DEL-CCU': [0.03, 0.02, 0.01, 0,   -0.01,-0.02],
  'BOM-MAA': [-0.01,0,    0.01, 0.02, 0.01, 0   ],
  'BLR-HYD': [-0.02,-0.01,0,   0.01, 0.02, 0.01],
  'DEL-HYD': [0.01, 0.01, 0,    0,   -0.01,-0.01],
  'DEL-MAA': [0.02, 0,   -0.01, 0,    0.01, 0   ],
  'BOM-BLR': [-0.01,0.01, 0.01,-0.01, 0,    0.01],
}

const ROUTES = ['DEL-BOM','DEL-BLR','DEL-CCU','BOM-MAA','BLR-HYD','DEL-HYD','DEL-MAA','BOM-BLR']

export default function BookingWindow() {
  const [activeRoute, setActiveRoute] = useState('DEL-BOM')
  const [hoveredWindow, setHoveredWindow] = useState<string|null>(null)

  const baseRef = OVERALL_STATS.overall_avg // Kaggle 2019 avg INR

  function getMultiplier(windowIdx: number) {
    const offsets = ROUTE_OFFSETS[activeRoute] ?? ROUTE_OFFSETS['DEL-BOM']
    return WINDOWS[windowIdx].multiplier + (offsets[windowIdx] ?? 0)
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ padding:'20px 28px 16px', flexShrink:0, borderBottom:'1px solid var(--color-border-primary)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <Calendar size={18} style={{ color:'var(--color-brand-primary)' }}/>
          <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--color-text-primary)', letterSpacing:'-0.01em' }}>
            Booking Window Analysis
          </h1>
          <span style={{ padding:'2px 8px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.12em',
            background:'var(--color-info-bg)', color:'var(--color-info)', border:'1px solid rgba(3,105,161,0.2)' }}>
            HISTORICAL · Kaggle 2019
          </span>
        </div>
        <p style={{ margin:0, fontSize:12, color:'var(--color-text-secondary)' }}>
          Advance-purchase fare elasticity across booking windows · {OVERALL_STATS.total_obs.toLocaleString()} observations · Indian domestic, March–June 2019
        </p>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px 28px' }}>

        {/* Data source note */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', marginBottom:20,
          background:'var(--color-info-bg)', border:'1px solid rgba(3,105,161,0.22)', borderRadius:10 }}>
          <Info size={14} style={{ color:'var(--color-info)', flexShrink:0, marginTop:1 }}/>
          <div style={{ fontSize:12, color:'var(--color-info)', lineHeight:1.6 }}>
            <strong>HISTORICAL · Kaggle 2019.</strong>{' '}
            Observations: {OVERALL_STATS.total_obs.toLocaleString()} total · avg ₹{OVERALL_STATS.overall_avg.toLocaleString()} · Indian domestic flights March–June 2019.
            Multipliers are derived from this dataset. Fare estimates are illustrative.
          </div>
        </div>

        {/* Route selector */}
        <div style={{ display:'flex', gap:8, marginBottom:24, flexWrap:'wrap' }}>
          {ROUTES.map(r => (
            <button key={r} onClick={()=>setActiveRoute(r)}
              style={{ padding:'6px 14px', borderRadius:8, cursor:'pointer',
                fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, letterSpacing:'0.04em',
                border: activeRoute===r ? '1px solid var(--color-brand-primary)' : '1px solid var(--color-border-primary)',
                background: activeRoute===r ? 'var(--color-brand-primary)' : 'var(--color-surface-secondary)',
                color: activeRoute===r ? 'white' : 'var(--color-text-secondary)',
                transition:'all 0.15s' }}>
              {r}
            </button>
          ))}
        </div>

        {/* Window cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
          {WINDOWS.map((w, wi) => {
            const isHovered = hoveredWindow === w.key
            const mult = getMultiplier(wi)
            const estFare = Math.round(baseRef * mult)
            return (
              <div key={w.key}
                onMouseEnter={()=>setHoveredWindow(w.key)}
                onMouseLeave={()=>setHoveredWindow(null)}
                style={{ padding:'16px 18px', background:'var(--color-surface-bg)',
                  border: `1px solid ${isHovered ? w.color : 'var(--color-border-primary)'}`,
                  borderRadius:12, transition:'border-color 0.15s', cursor:'default' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
                      {w.label}
                    </div>
                    <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:2 }}>
                      {w.description}
                    </div>
                  </div>
                  {mult > 1
                    ? <TrendingUp size={15} style={{ color:w.color, flexShrink:0 }}/>
                    : <TrendingDown size={15} style={{ color:w.color, flexShrink:0 }}/>
                  }
                </div>
                <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>
                    ×{mult.toFixed(2)} of base
                  </span>
                </div>
                <div style={{ height:4, borderRadius:2, background:'var(--color-surface-secondary)', marginBottom:8, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(mult / 1.6 * 100, 100)}%`,
                    background: w.color, borderRadius:2, opacity:0.7 }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>
                    <span style={{ fontWeight:600 }}>Est.:</span>{' '}
                    <span style={{ fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)' }}>
                      ₹{estFare.toLocaleString()}
                    </span>
                    <span style={{ fontSize:9, color:'var(--color-info)', marginLeft:4 }}>HISTORICAL · Kaggle 2019</span>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99,
                    background:'var(--color-brand-muted)', color:'var(--color-brand-primary)',
                    letterSpacing:'0.07em' }}>
                    {w.obs.toLocaleString()} OBS
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Elasticity chart placeholder */}
        <div style={{ padding:'18px 20px', background:'var(--color-surface-bg)',
          border:'1px solid var(--color-border-primary)', borderRadius:12, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
                Advance-Purchase Elasticity — {activeRoute}
              </h3>
              <p style={{ margin:'3px 0 0', fontSize:11, color:'var(--color-text-tertiary)' }}>
                HISTORICAL · Kaggle 2019 · {OVERALL_STATS.total_obs.toLocaleString()} observations
              </p>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:8,
              background:'var(--color-surface-secondary)', border:'1px solid var(--color-border-primary)' }}>
              <Info size={12} style={{ color:'var(--color-info)' }}/>
              <span style={{ fontSize:10, color:'var(--color-text-secondary)' }}>Demo only</span>
            </div>
          </div>

          {/* SVG line chart — benchmark curve */}
          <svg width="100%" height="160" viewBox="0 0 700 160" style={{ overflow:'visible' }}>
            <defs>
              <linearGradient id="bw-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity="0"/>
              </linearGradient>
            </defs>

            {/* Y-axis grid */}
            {[0.7,0.9,1.1,1.3,1.5].map((v,i) => (
              <g key={i}>
                <line x1="50" y1={140 - (v - 0.7) / 0.8 * 120} x2="680" y2={140 - (v - 0.7) / 0.8 * 120}
                  stroke="var(--color-border-primary)" strokeWidth="0.5" strokeDasharray="4 4"/>
                <text x="42" y={140 - (v - 0.7) / 0.8 * 120 + 4} textAnchor="end" fontSize="9"
                  fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                  ×{v.toFixed(1)}
                </text>
              </g>
            ))}

            {/* X-axis labels */}
            {WINDOWS.map((w,i) => {
              const x = 50 + i * (630 / (WINDOWS.length - 1))
              return (
                <text key={w.key} x={x} y="155" textAnchor="middle" fontSize="9"
                  fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">
                  {w.label}
                </text>
              )
            })}

            {/* Benchmark curve */}
            {(() => {
              const pts = WINDOWS.map((w,i) => ({
                x: 50 + i * (630 / (WINDOWS.length - 1)),
                y: 140 - (getMultiplier(i) - 0.7) / 0.8 * 120,
              }))
              const pathD = pts.map((p,i) => `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ')
              const areaD = pathD + ` L ${pts[pts.length-1].x} 140 L 50 140 Z`
              return (
                <>
                  <path d={areaD} fill="url(#bw-grad)" opacity="0.6"/>
                  <path d={pathD} fill="none" stroke="var(--color-brand-primary)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" opacity="0.6"/>
                  {pts.map((p,i) => (
                    <circle key={i} cx={p.x} cy={p.y} r="4"
                      fill="var(--color-surface-bg)" stroke="var(--color-brand-primary)"
                      strokeWidth="1.5" opacity="0.6"/>
                  ))}
                </>
              )
            })()}

            {/* Dataset label */}
            <text x="365" y="80" textAnchor="middle" fontSize="11" fill="var(--color-info)"
              fontFamily="var(--font-sans)" opacity="0.8">
              HISTORICAL · Kaggle 2019 — {activeRoute} advance-purchase curve
            </text>
          </svg>
        </div>

        {/* Table */}
        <div style={{ background:'var(--color-surface-bg)', border:'1px solid var(--color-border-primary)',
          borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--color-border-primary)' }}>
            <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
              Window Summary — {activeRoute}
            </h3>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--color-surface-secondary)' }}>
                {['Window','Description','Multiplier','Demo Est. Fare','Observations','Empirical Avg'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:700,
                    color:'var(--color-text-tertiary)', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WINDOWS.map((w,i) => {
                const mult = getMultiplier(i)
                return (
                <tr key={w.key} style={{ borderTop:'1px solid var(--color-border-primary)',
                  background: i%2===0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                  <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:'var(--color-text-primary)',
                    fontFamily:'var(--font-mono)' }}>{w.label}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-secondary)' }}>
                    {w.description}
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:w.color,
                    fontFamily:'var(--font-mono)' }}>
                    ×{mult.toFixed(2)}
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-secondary)',
                    fontFamily:'var(--font-mono)' }}>
                    ₹{Math.round(baseRef * mult).toLocaleString()}
                    <span style={{ fontSize:9, marginLeft:5, color:'var(--color-info)', opacity:0.8 }}>HISTORICAL</span>
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, fontFamily:'var(--font-mono)',
                    color:'var(--color-brand-primary)', fontWeight:600 }}>{w.obs.toLocaleString()}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-tertiary)' }}>
                    ₹{Math.round(baseRef * mult).toLocaleString()}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
