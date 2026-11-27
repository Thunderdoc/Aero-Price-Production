import { useEffect, useMemo, useState } from 'react'
import { Calendar, TrendingDown, TrendingUp, Info } from 'lucide-react'
import { apiFareSummary } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import LiveBadge from '../components/LiveBadge'
import DataFreshness from '../components/DataFreshness'
import { type LiveCheck } from '../lib/liveStatus'

interface FareSummaryResponse {
  route: string
  status: string
  overall?: { median?: number | null; count?: number; last_collected_at?: string | null; data_origin?: string }
  windows?: Record<string, { median?: number | null; count?: number; data_origin?: string }>
}

const WINDOWS = [
  { label:'T+1 day',  key:'1d',  advanceDays: 1,  description:'Last-minute', color:'var(--color-danger)' },
  { label:'T+7 days', key:'7d',  advanceDays: 7,  description:'Short booking window', color:'var(--color-warning)' },
  { label:'T+15 days',key:'15d', advanceDays: 15, description:'Standard advance', color:'var(--color-success)' },
  { label:'T+30 days',key:'30d', advanceDays: 30, description:'Advance booking', color:'var(--color-success)' },
  { label:'T+45 days',key:'45d', advanceDays: 45, description:'Early booking', color:'var(--color-info)' },
]

const ROUTES = ['DEL-BOM','DEL-BLR','DEL-CCU','BOM-MAA','BLR-HYD','DEL-HYD','DEL-MAA','BOM-BLR']

export default function BookingWindow() {
  const { token } = useAuth()
  const [activeRoute, setActiveRoute] = useState('DEL-BOM')
  const [hoveredWindow, setHoveredWindow] = useState<string|null>(null)
  const [summary, setSummary] = useState<FareSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchOk, setFetchOk] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setFetchFailed(false)
    // One small summary response instead of up to 1,000 fare rows. The
    // backend summary already restricts to the index-eligible set
    // (REAL / OFFICIAL / PUBLIC_INTERFACE) and labels each window's origin.
    const loadSummary = async (attempt = 0): Promise<void> => {
      try {
        const result = await apiFareSummary(activeRoute, token ?? undefined) as FareSummaryResponse
        if (!active) return
        setSummary(result)
        setFetchOk(true)
        setCheckedAt(new Date())
      } catch {
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          if (active) return loadSummary(1)
          return
        }
        if (active) { setSummary(null); setFetchOk(false); setFetchFailed(true); setError('Verified fare data is unavailable for this route.') }
      } finally {
        if (active && attempt === 1) setLoading(false)
        if (active && attempt === 0) setLoading(false)
      }
    }
    void loadSummary()
    return () => { active = false }
  }, [activeRoute, token])

  const windowData = useMemo(() => WINDOWS.map(window => {
    const bucket = summary?.windows?.[`T+${window.advanceDays}`]
    const origin = bucket?.data_origin
    return {
      ...window,
      median: bucket?.median ?? null,
      count: bucket?.count ?? 0,
      origins: origin && origin !== 'NO_DATA' ? [origin] : [],
    }
  }), [summary])
  const totalObservations = windowData.reduce((sum, window) => sum + window.count, 0)
  const newestCollectedAt = summary?.overall?.last_collected_at ?? null

  // "VERIFIED" is true only when the fetch succeeded AND observations exist.
  const feedCheck: LiveCheck = { ok: fetchOk && totalObservations > 0, checkedAt, loading, failed: fetchFailed }
  const baseRef = windowData[0]?.median ?? null
  function getMultiplier(windowIdx: number) {
    const value = windowData[windowIdx]?.median
    return value != null && baseRef != null && baseRef > 0 ? value / baseRef : null
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
          <LiveBadge check={feedCheck} label={feedCheck.ok ? 'VERIFIED ROUTE OBSERVATIONS' : undefined} />
        </div>
        <p style={{ margin:0, fontSize:12, color:'var(--color-text-secondary)' }}>
          Advance-purchase fare comparison from stored verified observations for the selected route.
        </p>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'20px 28px 28px' }}>

        {/* Data source note — colour follows the fetch state, not a hardcoded green */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', marginBottom:20,
          background: error ? 'var(--color-warning-bg)' : feedCheck.ok ? 'var(--color-success-bg)' : 'var(--color-surface-secondary)',
          border: `1px solid ${error ? 'rgba(217,119,6,0.35)' : feedCheck.ok ? 'rgba(22,163,74,0.22)' : 'var(--color-border-primary)'}`, borderRadius:10 }}>
          <Info size={14} style={{ color: error ? 'var(--color-warning)' : feedCheck.ok ? 'var(--color-success)' : 'var(--color-text-tertiary)', flexShrink:0, marginTop:1 }}/>
          <div style={{ fontSize:12, color:'var(--color-text-primary)', lineHeight:1.6 }}>
            <strong style={{ color: 'var(--color-brand-primary)' }}>BACKEND-REPORTED FARE DATA.</strong>{' '}
            {error ?? `Values below are calculated only from verified observations returned for ${activeRoute}. Missing booking windows remain unavailable; no estimates are inserted.`}
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
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 9, background: loading ? 'var(--color-info-bg)' : error ? 'var(--color-warning-bg)' : 'var(--color-surface-secondary)', color: error ? 'var(--color-warning)' : 'var(--color-text-secondary)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{loading ? 'Loading verified route observations…' : error ?? `${totalObservations.toLocaleString('en-IN')} verified observations loaded for ${activeRoute}.`}</span>
          {newestCollectedAt && <DataFreshness minutesAgo={Math.max(0, Math.floor((Date.now() - new Date(newestCollectedAt).getTime()) / 60000))} />}
        </div>

        {/* Window cards — gated while loading so they never read 0 OBS */}
        {loading && !summary ? (
          <div style={{ padding: '18px 20px', background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 12, marginBottom: 24, color: 'var(--color-text-secondary)', fontSize: 12 }}>
            Loading booking-window medians…
          </div>
        ) : (
        <div className="cards-grid-3" style={{ marginBottom: 24 }}>
          {WINDOWS.map((w, wi) => {
            const isHovered = hoveredWindow === w.key
            const mult = getMultiplier(wi)
            const medianFare = windowData[wi]?.median
            const count = windowData[wi]?.count ?? 0
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
                  {mult != null && mult > 1
                    ? <TrendingUp size={15} style={{ color:w.color, flexShrink:0 }}/>
                    : mult != null ? <TrendingDown size={15} style={{ color:w.color, flexShrink:0 }}/> : null
                  }
                </div>
                <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>
                    {mult == null ? 'No verified observation' : `×${mult.toFixed(2)} of first window`}
                  </span>
                </div>
                <div style={{ height:4, borderRadius:2, background:'var(--color-surface-secondary)', marginBottom:8, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${mult == null ? 0 : Math.min(mult / 1.6 * 100, 100)}%`,
                    background: w.color, borderRadius:2, opacity:0.7 }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>
                    <span style={{ fontWeight:600 }}>Median:</span>{' '}
                    <span style={{ fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)' }}>
                      {medianFare == null ? '—' : `₹${Math.round(medianFare).toLocaleString('en-IN')}`}
                    </span>
                    {(windowData[wi]?.origins ?? []).length > 0 && <span style={{ fontSize:9, color:'var(--color-text-tertiary)', marginLeft:4 }}>{windowData[wi].origins.join(' · ')}</span>}
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99,
                    background:'var(--color-brand-muted)', color:'var(--color-brand-primary)',
                    letterSpacing:'0.07em' }}>
                    {count.toLocaleString('en-IN')} OBS
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Elasticity chart placeholder */}
        <div style={{ padding:'18px 20px', background:'var(--color-surface-bg)',
          border:'1px solid var(--color-border-primary)', borderRadius:12, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
                Advance-Purchase Elasticity — {activeRoute}
              </h3>
              <p style={{ margin:'3px 0 0', fontSize:11, color:'var(--color-text-tertiary)' }}>
                Verified fare observations grouped by the backend booking windows.
              </p>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:8,
              background:'var(--color-surface-secondary)', border:'1px solid var(--color-border-primary)' }}>
              <Info size={12} style={{ color:'var(--color-brand-primary)' }}/>
              <span style={{ fontSize:10, color:'var(--color-text-secondary)' }}>Backend summary</span>
            </div>
          </div>

          {/* SVG line chart — benchmark curve */}
          <svg width="100%" height="160" viewBox="0 0 700 160" style={{ overflow:'visible' }} role="img" aria-label={`Advance-purchase elasticity curve for ${activeRoute}`}>
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

            {/* Verified route curve. It is intentionally omitted until every backend window has data. */}
            {windowData.every(window => window.median != null) ? (() => {
              const pts = WINDOWS.map((w,i) => ({
                x: 50 + i * (630 / (WINDOWS.length - 1)),
                y: 140 - ((getMultiplier(i) ?? 1) - 0.7) / 0.8 * 120,
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
            })() : <text x="365" y="80" textAnchor="middle" fontSize="11" fill="var(--color-text-tertiary)" fontFamily="var(--font-sans)">A complete verified booking-window series is not available yet.</text>}
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
                {['Window','Description','Multiplier','Verified Median Fare','Observations','Source'].map(h => (
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
                const medianFare = windowData[i]?.median
                const count = windowData[i]?.count ?? 0
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
                    {mult == null ? '—' : `×${mult.toFixed(2)}`}
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-secondary)',
                    fontFamily:'var(--font-mono)' }}>
                    {medianFare == null ? '—' : `₹${Math.round(medianFare).toLocaleString('en-IN')}`}
                    {(windowData[i]?.origins ?? []).length > 0 && <span style={{ fontSize:9, marginLeft:5, color:'var(--color-info)', opacity:0.8 }}>{windowData[i].origins.join(' · ')}</span>}
                  </td>
                  <td style={{ padding:'10px 14px', fontSize:12, fontFamily:'var(--font-mono)',
                    color:'var(--color-brand-primary)', fontWeight:600 }}>{loading && !summary ? '—' : count.toLocaleString('en-IN')}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'var(--color-text-tertiary)' }}>
                    {medianFare == null ? '—' : 'Backend observation'}
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
