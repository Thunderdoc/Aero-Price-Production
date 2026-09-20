import { useState, useEffect } from 'react'
import { ArrowRight, TrendingUp, TrendingDown, Bell, Map as MapIcon, BarChart2, AlertTriangle, Shield, Database, Plane } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import TrendIndicator from '../components/TrendIndicator'
import { useAuth } from '../contexts/AuthContext'
import { useGovData } from '../hooks/useGovData'
import UpgradeModal from '../components/UpgradeModal'
import { apiDashboard, isBackendAvailable } from '../services/api'
import {
  corridors, bookingWindowData, regionalData, recentAnomalies,
} from '../data/sampleData'
import type { Page } from '../components/AppShell'

type Props = { onNavigate: (p: Page) => void }

const card: React.CSSProperties = {
  background: 'var(--color-surface-bg)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-xl)',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--color-border-primary)',
}

const cityOptions = [
  { value: 'DEL', label: 'Delhi' }, { value: 'BOM', label: 'Mumbai' },
  { value: 'BLR', label: 'Bengaluru' }, { value: 'MAA', label: 'Chennai' },
  { value: 'CCU', label: 'Kolkata' }, { value: 'HYD', label: 'Hyderabad' },
]

function BookingSparkline() {
  const data = bookingWindowData.map(d => d.avgFare)
  const max = Math.max(...data), min = Math.min(...data)
  const w = 240, h = 48
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--color-brand-primary)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Overview({ onNavigate }: Props) {
  const { user } = useAuth()
  const govData = useGovData()
  const [fromCity, setFromCity] = useState('DEL')
  const [toCity, setToCity] = useState('BOM')
  const [searchResult, setSearchResult] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [realObs, setRealObs] = useState<number | null>(null)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)

  useEffect(() => {
    isBackendAvailable().then(up => {
      if (!up) return
      apiDashboard().then(d => {
        setRealObs(d.real_observations ?? 0)
        setIndexStatus(d.index_status ?? null)
      }).catch(() => {})
    })
  }, [])

  if (!user) return null

  const rising = corridors.filter(c => c.trend === 'up').slice(0, 4)
  const falling = corridors.filter(c => c.trend === 'down').slice(0, 4)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchResult(`${fromCity}-${toCity}`)
  }

  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border-primary)',
    background: 'var(--color-surface-bg)',
    color: 'var(--color-text-primary)',
    fontSize: 14, fontFamily: 'var(--font-sans)',
    cursor: 'pointer', outline: 'none',
    appearance: 'none',
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 960 }}>

      {/* Role-aware strip */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
        {user.role === 'ADMIN' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-warning)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>COLLECTOR STATUS</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>5 sources · 0/5 active · Gov fetch: {govData.anyConnected ? 'CONNECTED' : 'UNAVAILABLE'}</span>
            <button onClick={() => onNavigate('admin')} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>Open Admin →</button>
          </>
        )}
        {user.role === 'ANALYST' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Shield size={13} style={{ color: 'var(--color-info)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-info)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>GOVERNMENT ANALYST</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
              DGCA data: {govData.anyConnected ? 'FRESH' : 'UNAVAILABLE'} · {govData.dgcaMonthly.length} records
            </span>
            <button onClick={() => onNavigate('government')} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>Open Gov Intel →</button>
          </>
        )}
        {user.role === 'PUBLIC' && user.plan === 'SUBSCRIBER' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Bell size={13} style={{ color: 'var(--color-brand-primary)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand-primary)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>YOUR ALERTS</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>Alerts pending first observation — airfare collector not yet connected</span>
            <button onClick={() => onNavigate('alerts')} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>View Alerts →</button>
          </>
        )}
        {user.role === 'PUBLIC' && user.plan === 'FREE' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Database size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>FREE PLAN</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>Upgrade to track prices and get fare alerts for any corridor</span>
            <button onClick={() => setShowUpgrade(true)} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>See Plans →</button>
          </>
        )}
      </div>

      {/* Hero: AIRFARE MARKET PULSE ─────────────────────── */}
      <div style={{
        background: 'var(--gradient-hero-dark)',
        borderRadius: 16, overflow: 'hidden', position: 'relative',
        padding: '28px 32px', boxShadow: '0 20px 50px rgba(8,14,26,0.35)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Background layers */}
        <div style={{ position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',backgroundSize:'32px 32px',pointerEvents:'none' }}/>
        <div style={{ position:'absolute',top:-60,right:-60,width:280,height:280,borderRadius:'50%',background:'rgba(37,99,235,0.18)',filter:'blur(70px)',pointerEvents:'none' }}/>
        <div style={{ position:'absolute',bottom:-40,left:80,width:200,height:200,borderRadius:'50%',background:'rgba(99,102,241,0.14)',filter:'blur(50px)',pointerEvents:'none' }}/>

        <div style={{ position:'relative' }}>
          {/* Eyebrow */}
          <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:20 }}>
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <div style={{ width:6,height:6,borderRadius:'50%',background:'rgba(147,197,253,0.7)',animation:'pulse-dot 2s ease-in-out infinite' }}/>
              <span style={{ fontSize:9,fontWeight:700,color:'rgba(147,197,253,0.7)',letterSpacing:'0.15em',fontFamily:'var(--font-mono)' }}>AIRFARE MARKET PULSE · SIH26056</span>
            </div>
            <div style={{ flex:1,height:'1px',background:'rgba(255,255,255,0.07)' }}/>
            <span style={{ fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.25)',letterSpacing:'0.1em',fontFamily:'var(--font-mono)' }}>ALL-INDIA INDEX</span>
          </div>

          {/* Metric grid */}
          <div style={{ display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:'0 32px',alignItems:'start',marginBottom:22 }}>
            {/* Main metric */}
            <div>
              <div style={{ fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.35)',letterSpacing:'0.12em',fontFamily:'var(--font-mono)',marginBottom:8 }}>PRICE INDEX</div>
              <div style={{ fontSize:'2.8rem',fontWeight:800,color:'rgba(255,255,255,0.2)',fontFamily:'var(--font-mono)',letterSpacing:'-0.04em',lineHeight:1,marginBottom:10 }}>
                —·—
              </div>
              <div style={{ display:'flex',alignItems:'center',gap:8,padding:'6px 12px',borderRadius:8,background:'rgba(217,119,6,0.2)',border:'1px solid rgba(217,119,6,0.35)',width:'fit-content' }}>
                <div style={{ width:5,height:5,borderRadius:'50%',background:'var(--color-warning)',animation:'pulse-dot 2s ease-in-out infinite',flexShrink:0 }}/>
                <span style={{ fontSize:10,fontWeight:800,letterSpacing:'0.1em',color:'var(--color-warning)',fontFamily:'var(--font-mono)' }}>
                  {indexStatus ?? 'INDEX NOT PUBLISHED'}
                </span>
              </div>
              {realObs !== null && realObs > 0 && (
                <div style={{ marginTop:8,fontSize:10,color:'rgba(255,255,255,0.4)',fontFamily:'var(--font-mono)' }}>
                  {realObs.toLocaleString('en-IN')} observations
                </div>
              )}
            </div>

            {/* Explanation */}
            <div style={{ paddingTop:28 }}>
              <div style={{ fontSize:13,color:'rgba(255,255,255,0.6)',fontFamily:'var(--font-sans)',lineHeight:1.65,marginBottom:12 }}>
                No real airfare observations available. All airline sources show{' '}
                <strong style={{ color:'var(--color-warning)' }}>CHALLENGE DETECTED</strong>
                {' '}— configure a backend collector to activate the index.
              </div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                {['IndiGo','Air India','Akasa Air','SpiceJet','AIX'].map(a=>(
                  <span key={a} style={{ fontSize:9,fontWeight:700,color:'var(--color-warning)',background:'rgba(217,119,6,0.15)',padding:'3px 8px',borderRadius:99,fontFamily:'var(--font-mono)',letterSpacing:'0.04em',border:'1px solid rgba(217,119,6,0.25)' }}>
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* Mini stat: corridors */}
            <div style={{ paddingTop:28,textAlign:'right' }}>
              <div style={{ fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.3)',letterSpacing:'0.12em',fontFamily:'var(--font-mono)',marginBottom:6 }}>CORRIDORS</div>
              <div style={{ fontSize:28,fontWeight:800,color:'rgba(255,255,255,0.75)',fontFamily:'var(--font-mono)',lineHeight:1 }}>12</div>
            </div>

            {/* Mini stat: sources */}
            <div style={{ paddingTop:28,textAlign:'right' }}>
              <div style={{ fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.3)',letterSpacing:'0.12em',fontFamily:'var(--font-mono)',marginBottom:6 }}>SOURCES</div>
              <div style={{ fontSize:28,fontWeight:800,color:'rgba(255,255,255,0.75)',fontFamily:'var(--font-mono)',lineHeight:1 }}>9</div>
            </div>
          </div>

          {/* DGCA official ref strip */}
          {govData.dgcaMonthly.length > 0 && (
            <div style={{ padding:'12px 16px',borderRadius:9,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.09)',marginBottom:20,display:'flex',alignItems:'center',gap:20,flexWrap:'wrap' }}>
              <div style={{ fontSize:9,fontWeight:700,color:'rgba(147,197,253,0.7)',letterSpacing:'0.1em',fontFamily:'var(--font-mono)',flexShrink:0 }}>OFFICIAL · DGCA</div>
              {govData.dgcaMonthly.slice(0,3).map(m=>(
                <div key={m.month} style={{ display:'flex',alignItems:'center',gap:8 }}>
                  <span style={{ fontSize:9,color:'rgba(255,255,255,0.35)',fontFamily:'var(--font-mono)' }}>{m.month}</span>
                  <span style={{ fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.8)',fontFamily:'var(--font-sans)' }}>{(m.domestic_passengers/1_000_000).toFixed(1)}M pax</span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
            <button
              onClick={()=>onNavigate('map')}
              style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 18px',background:'rgba(37,99,235,0.9)',border:'1px solid rgba(37,99,235,0.5)',borderRadius:10,color:'white',fontSize:12,fontWeight:700,fontFamily:'var(--font-sans)',cursor:'pointer',letterSpacing:'0.05em',transition:'all 180ms ease' }}
              onMouseOver={e=>{(e.currentTarget as HTMLElement).style.background='rgba(37,99,235,1)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 16px rgba(37,99,235,0.4)'}}
              onMouseOut={e=>{(e.currentTarget as HTMLElement).style.background='rgba(37,99,235,0.9)';(e.currentTarget as HTMLElement).style.boxShadow='none'}}
            >
              <MapIcon size={14}/> EXPLORE MAP
            </button>
            <button
              onClick={()=>onNavigate('routes')}
              style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 18px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:10,color:'rgba(255,255,255,0.75)',fontSize:12,fontWeight:700,fontFamily:'var(--font-sans)',cursor:'pointer',letterSpacing:'0.05em',transition:'all 180ms ease' }}
              onMouseOver={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.1)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.2)'}}
              onMouseOut={e=>{(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.06)';(e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.12)'}}
            >
              <Plane size={14}/> CHECK ROUTE
            </button>
          </div>
        </div>
      </div>

      {/* Route search */}
      <div className="ap-card" style={{ padding: 'var(--space-2xl)', background: 'var(--color-surface-bg)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position:'absolute',top:-30,right:-30,width:120,height:120,borderRadius:'50%',background:'rgba(37,99,235,0.05)',filter:'blur(30px)',pointerEvents:'none' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-xl)' }}>
          <div style={{ width:32,height:32,borderRadius:8,background:'var(--gradient-brand)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
            <Plane size={15} color="white"/>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing:'-0.01em' }}>
              Route Intelligence
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop:1 }}>
              CHECK AIRFARE DATA · ALL CORRIDORS
            </div>
          </div>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--space-lg)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex:1, minWidth:140 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>FROM</label>
            <select value={fromCity} onChange={e => { setFromCity(e.target.value); setSearchResult(null) }} className="ap-input" style={{ ...selectStyle, padding: '10px 36px 10px 14px', fontSize: 13, fontWeight: 600 }}>
              {cityOptions.map(c => <option key={c.value} value={c.value}>{c.label} ({c.value})</option>)}
            </select>
          </div>
          <div style={{ paddingBottom:14,color:'var(--color-brand-primary)',fontSize:18,fontWeight:700,userSelect:'none' }}>⇄</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex:1, minWidth:140 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>TO</label>
            <select value={toCity} onChange={e => { setToCity(e.target.value); setSearchResult(null) }} className="ap-input" style={{ ...selectStyle, padding: '10px 36px 10px 14px', fontSize: 13, fontWeight: 600 }}>
              {cityOptions.map(c => <option key={c.value} value={c.value}>{c.label} ({c.value})</option>)}
            </select>
          </div>
          <button type="submit" style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 20px',background:'var(--gradient-brand)',border:'none',borderRadius:10,color:'white',fontSize:12,fontWeight:700,fontFamily:'var(--font-sans)',cursor:'pointer',letterSpacing:'0.06em',transition:'all 180ms ease',boxShadow:'var(--shadow-brand)',whiteSpace:'nowrap' }}
            onMouseOver={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-1px)'}}
            onMouseOut={e=>{(e.currentTarget as HTMLElement).style.transform='none'}}
          >
            <ArrowRight size={14}/> CHECK ROUTE
          </button>
        </form>

        {searchResult && (
          <div className="animate-fade-up" style={{ marginTop: 'var(--space-xl)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
              {fromCity} → {toCity}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>NO LIVE OBSERVATION AVAILABLE</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginBottom: 12 }}>
              No real airfare observations collected for this corridor. All airline sources are showing CHALLENGE DETECTED.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="subtle" onClick={() => onNavigate('sources')}>View Source Status</Button>
              <Button variant="subtle" onClick={() => onNavigate('livefares')}>Live Fares Table</Button>
            </div>
          </div>
        )}
      </div>

      {/* Rising / Falling corridors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        {[
          { title: 'RISING FARES', items: rising, accent: 'var(--color-danger)', accentBg: 'var(--color-danger-bg)', icon: TrendingUp },
          { title: 'FALLING FARES', items: falling, accent: 'var(--color-success)', accentBg: 'var(--color-success-bg)', icon: TrendingDown },
        ].map(({ title, items, accent, accentBg, icon: Icon }) => (
          <div key={title} style={{ background: 'var(--color-surface-bg)', borderRadius: 14, border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)', overflow:'hidden', position:'relative' }}>
            <div style={{ position:'absolute',top:0,left:0,right:0,height:3,background:accent,opacity:0.6,borderRadius:'14px 14px 0 0' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)', paddingTop:4 }}>
              <div style={{ width:26,height:26,borderRadius:7,background:accentBg,display:'flex',alignItems:'center',justifyContent:'center' }}>
                <Icon size={13} style={{ color: accent }}/>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{title}</span>
              <span className="ap-badge ap-badge-gen" style={{ marginLeft:'auto' }}>GENERATED</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(c => (
                <div key={c.id}
                  onClick={() => onNavigate('routes')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', cursor: 'pointer', borderRadius: 9, border: '1px solid transparent', transition: 'all 160ms ease' }}
                  onMouseOver={e=>{const el=e.currentTarget as HTMLElement; el.style.background='var(--color-surface-hover)'; el.style.borderColor='var(--color-border-primary)'}}
                  onMouseOut={e=>{const el=e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.borderColor='transparent'}}
                >
                  <div style={{ display:'flex',flexDirection:'column',gap:2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing:'-0.01em' }}>{c.from} → {c.to}</span>
                    <span style={{ fontSize: 9, color:'var(--color-text-tertiary)', fontFamily:'var(--font-mono)' }}>Economy · Direct</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', letterSpacing:'-0.02em' }}>₹{c.currentFare.toLocaleString('en-IN')}</div>
                    <TrendIndicator direction={c.trend} value={Math.abs(c.change7d)} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Booking window mini chart */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 4, fontFamily: 'var(--font-sans)' }}>BOOKING WINDOW PATTERN</div>
            <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>Advance purchase fare curve</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <Badge label="GENERATED" variant="warning" />
            <Button variant="subtle" onClick={() => onNavigate('routes')} iconEnd={<ArrowRight size={13} />}>Route Explorer</Button>
          </div>
        </div>
        <BookingSparkline />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>T+1 (tomorrow)</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>T+45 (45 days)</span>
        </div>
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-bg)', fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
          ⚠ Booking window analysis requires real observations for T+1, T+7, T+15, T+30, T+45. Currently showing generated baseline.
        </div>
      </div>

      {/* Regional cards */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-md)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 8 }}>
          REGIONAL INDEX
          <span style={{ fontSize: 9, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>GENERATED</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
          {regionalData.map(r => (
            <div key={r.region} style={{ ...card, padding: 'var(--space-lg)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 4, fontFamily: 'var(--font-sans)' }}>{r.region}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>₹{r.avgFare.toLocaleString('en-IN')}</div>
              <TrendIndicator direction={r.change7d > 0.5 ? 'up' : r.change7d < -0.5 ? 'down' : 'stable'} value={Math.abs(r.change7d)} size="sm" />
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{r.routeCount} routes</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent anomalies */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>RECENT ANOMALIES</span>
          <Badge label="GENERATED" variant="warning" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {recentAnomalies.slice(0, 4).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: a.type === 'SPIKE' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)' }}>
              <Badge label={a.type} variant={a.type === 'SPIKE' ? 'danger' : 'warning'} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{a.route}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>₹{a.fare.toLocaleString('en-IN')} vs expected ₹{a.expectedFare.toLocaleString('en-IN')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: a.resolved ? 'var(--color-success)' : 'var(--color-danger)', fontFamily: 'var(--font-sans)' }}>{a.resolved ? 'Resolved' : 'Active'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick nav cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
        {[
          { page: 'map' as Page, icon: MapIcon, label: 'India Map', sub: 'Route corridors + flight positions', color: 'var(--color-brand-primary)' },
          { page: 'routes' as Page, icon: Plane, label: 'Route Explorer', sub: 'Per-corridor fare intelligence', color: 'var(--color-teal)' },
          { page: 'insights' as Page, icon: BarChart2, label: 'Market Insights', sub: 'Carriers, price history, trends', color: 'var(--color-indigo)' },
          { page: 'livefares' as Page, icon: AlertTriangle, label: 'Live Fares', sub: 'Observation pipeline status', color: 'var(--color-warning)' },
        ].map(({ page, icon: Icon, label, sub, color }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            style={{ ...card, textAlign: 'left', cursor: 'pointer', border: `1px solid ${color}20`, transition: 'transform 150ms, box-shadow 150ms' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}20` }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
          >
            <Icon size={20} style={{ color, marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{sub}</div>
          </button>
        ))}
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} onSwitchToSubscriber={() => setShowUpgrade(false)} />}
    </div>
  )
}
