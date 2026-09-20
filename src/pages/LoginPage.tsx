import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Eye, EyeOff, ArrowRight, Shield, BarChart2, Bell } from 'lucide-react'

// ─── Projection ───────────────────────────────────────────────────────────────
function proj(lat: number, lng: number, W = 560, H = 620) {
  return {
    x: +((lng - 67.5) / 30 * W).toFixed(1),
    y: +((37.5 - lat) / 30 * H).toFixed(1),
  }
}

const APS = [
  { code:'DEL', name:'Delhi',              lat:28.7, lng:77.1, tier:1 },
  { code:'BOM', name:'Mumbai',             lat:19.1, lng:72.9, tier:1 },
  { code:'BLR', name:'Bengaluru',         lat:12.9, lng:77.6, tier:1 },
  { code:'MAA', name:'Chennai',           lat:13.1, lng:80.3, tier:1 },
  { code:'HYD', name:'Hyderabad',         lat:17.4, lng:78.5, tier:1 },
  { code:'CCU', name:'Kolkata',           lat:22.6, lng:88.4, tier:1 },
  { code:'AMD', name:'Ahmedabad',         lat:23.1, lng:72.6, tier:2 },
  { code:'GOI', name:'Goa',              lat:15.4, lng:73.8, tier:2 },
  { code:'LKO', name:'Lucknow',          lat:26.8, lng:80.9, tier:2 },
  { code:'JAI', name:'Jaipur',           lat:26.8, lng:75.8, tier:2 },
  { code:'PAT', name:'Patna',            lat:25.6, lng:85.1, tier:2 },
  { code:'GAU', name:'Guwahati',         lat:26.1, lng:91.6, tier:2 },
  { code:'SXR', name:'Srinagar',         lat:34.1, lng:74.8, tier:2 },
  { code:'TRV', name:'Trivandrum',       lat:8.5,  lng:76.9, tier:2 },
  { code:'NAG', name:'Nagpur',           lat:21.1, lng:79.0, tier:2 },
  { code:'BBI', name:'Bhubaneswar',      lat:20.2, lng:85.8, tier:2 },
].map(a => ({ ...a, ...proj(a.lat, a.lng) }))

const ROUTES: [string,string][] = [
  ['DEL','BOM'],['DEL','BLR'],['DEL','MAA'],['DEL','CCU'],['DEL','HYD'],
  ['DEL','JAI'],['DEL','LKO'],['DEL','GAU'],['DEL','SXR'],
  ['BOM','BLR'],['BOM','MAA'],['BOM','HYD'],['BOM','AMD'],['BOM','GOI'],
  ['BLR','MAA'],['BLR','HYD'],['MAA','HYD'],['CCU','GAU'],['CCU','BBI'],
  ['HYD','NAG'],
]

function bezierCtrl(ax:number,ay:number,bx:number,by:number,k=0.3) {
  const mx=(ax+bx)/2,my=(ay+by)/2
  const dx=bx-ax,dy=by-ay,d=Math.sqrt(dx*dx+dy*dy)
  return { cx:mx+(-dy/d)*d*k, cy:my+(dx/d)*d*k }
}

// Animated plane component
function Plane({ ax,ay,bx,by,delay,duration }:{ax:number;ay:number;bx:number;by:number;delay:number;duration:number}) {
  const ref = useRef<SVGGElement>(null)
  const {cx,cy} = bezierCtrl(ax,ay,bx,by)

  useEffect(()=>{
    const el = ref.current; if(!el) return
    let raf: number
    const start = performance.now() - delay * 1000
    const tick = (now: number) => {
      const t = (((now - start) % (duration * 1000)) / (duration * 1000))
      const s = 1-t
      const x = s*s*ax + 2*s*t*cx + t*t*bx
      const y = s*s*ay + 2*s*t*cy + t*t*by
      const dx2 = 2*(1-t)*(cx-ax)+2*t*(bx-cx)
      const dy2 = 2*(1-t)*(cy-ay)+2*t*(by-cy)
      const angle = Math.atan2(dy2,dx2)*180/Math.PI
      el.setAttribute('transform',`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle.toFixed(1)})`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return ()=>cancelAnimationFrame(raf)
  },[ax,ay,bx,by,cx,cy,delay,duration])

  return (
    <g ref={ref}>
      {/* Plane icon — pointed right */}
      <path d="M0,-1.8 L5,0 L0,1.8 Z" fill="#60a5fa" opacity="0.95"/>
      <path d="M-2,-1 L2,0 L-2,1 Z" fill="#93c5fd" opacity="0.7"/>
      {/* Trailing glow */}
      <circle cx="-3" cy="0" r="2" fill="#3b82f6" opacity="0.2"/>
    </g>
  )
}

// Full India map SVG
function IndiaMap() {
  const routes = ROUTES.map(([a,b],i)=>{
    const ap=APS.find(x=>x.code===a)!, bp=APS.find(x=>x.code===b)!
    const {cx,cy}=bezierCtrl(ap.x,ap.y,bp.x,bp.y)
    return { ap,bp,cx,cy,i }
  })

  const planes = routes.map(({ap,bp,i})=>({
    ax:ap.x,ay:ap.y,bx:bp.x,by:bp.y,
    delay:i*1.1,
    duration:5.5+i*0.45
  }))

  return (
    <svg
      viewBox="0 0 560 620"
      width="100%" height="100%"
      style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.9 }}
      aria-hidden
    >
      <defs>
        <filter id="glow-sm"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="glow-lg"><feGaussianBlur in="SourceGraphic" stdDeviation="8"/></filter>
        <filter id="glow-hub"><feGaussianBlur in="SourceGraphic" stdDeviation="12"/></filter>
        <radialGradient id="map-vignette" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="transparent"/>
          <stop offset="100%" stopColor="#060d1f"/>
        </radialGradient>
      </defs>

      {/* Route glow halos */}
      {routes.map(({ap,bp,cx,cy,i})=>(
        <path key={`h${i}`}
          d={`M${ap.x},${ap.y} Q${cx},${cy} ${bp.x},${bp.y}`}
          fill="none" stroke="#1d4ed8" strokeWidth="6" opacity="0.12" filter="url(#glow-lg)"
        />
      ))}

      {/* Route arcs */}
      {routes.map(({ap,bp,cx,cy,i})=>(
        <path key={`r${i}`}
          d={`M${ap.x},${ap.y} Q${cx},${cy} ${bp.x},${bp.y}`}
          fill="none"
          stroke={i%3===0?"rgba(96,165,250,0.55)":i%3===1?"rgba(147,197,253,0.4)":"rgba(59,130,246,0.45)"}
          strokeWidth="0.85"
          strokeDasharray="5 6"
          strokeLinecap="round"
        />
      ))}

      {/* Airport auras */}
      {APS.filter(a=>a.tier===1).map(ap=>(
        <circle key={`aura-${ap.code}`} cx={ap.x} cy={ap.y} r={38}
          fill="rgba(37,99,235,0.06)" filter="url(#glow-hub)"/>
      ))}

      {/* Airport rings */}
      {APS.map(ap=>{
        const m=ap.tier===1
        return (
          <g key={ap.code}>
            <circle cx={ap.x} cy={ap.y} r={m?18:11} fill="rgba(37,99,235,0.1)" filter="url(#glow-sm)"/>
            <circle cx={ap.x} cy={ap.y} r={m?8:5} fill="none"
              stroke={m?"rgba(96,165,250,0.7)":"rgba(147,197,253,0.45)"}
              strokeWidth={m?1.4:0.9}/>
            {m && <circle cx={ap.x} cy={ap.y} r={13} fill="none"
              stroke="rgba(96,165,250,0.2)" strokeWidth="0.7" strokeDasharray="3 4"/>}
            <circle cx={ap.x} cy={ap.y} r={m?3:2} fill={m?"#93c5fd":"#60a5fa"} filter="url(#glow-sm)"/>
            <text x={ap.x} y={ap.y+(m?17:12)} textAnchor="middle"
              fontSize={m?7:5.5} fill={m?"rgba(147,197,253,0.9)":"rgba(148,163,184,0.65)"}
              fontFamily="var(--font-mono)" fontWeight="700" letterSpacing="0.08em">
              {ap.code}
            </text>
          </g>
        )
      })}

      {/* Planes */}
      {planes.map((p,i)=><Plane key={i} {...p}/>)}

      {/* Edge vignette */}
      <rect x="0" y="0" width="560" height="620" fill="url(#map-vignette)" opacity="0.65"/>
    </svg>
  )
}

// ─── Scan line animation ──────────────────────────────────────────────────────
function ScanLine() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const el=ref.current; if(!el) return
    let y=0, raf:number
    const h=el.parentElement?.clientHeight??800
    const tick=()=>{ y=(y+0.4)%h; el.style.top=y+'px'; raf=requestAnimationFrame(tick) }
    raf=requestAnimationFrame(tick)
    return ()=>cancelAnimationFrame(raf)
  },[])
  return (
    <div ref={ref} style={{
      position:'absolute', left:0, right:0, height:1, pointerEvents:'none',
      background:'linear-gradient(to right,transparent,rgba(96,165,250,0.12),transparent)',
    }}/>
  )
}

// ─── Demo credentials ─────────────────────────────────────────────────────────
const DEMO = [
  { label:'ADMIN',    sub:'Full access',  email:'admin@aeroprice.in', pass:'aeroadmin', color:'#f87171' },
  { label:'ANALYST',  sub:'Gov portal',   email:'dgca@gov.in',        pass:'dgca2026',  color:'#60a5fa' },
  { label:'PRO',      sub:'Subscriber',   email:'user@aeroprice.in',  pass:'aero123',   color:'#34d399' },
  { label:'GUEST',    sub:'Demo only',    email:'visitor@example.com',pass:'demo',      color:'#94a3b8' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [pass, setPass]         = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [activeField, setActiveField] = useState<'e'|'p'|null>(null)
  const [time, setTime]         = useState(new Date())

  useEffect(()=>{ const id=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(id) },[])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    await new Promise(r=>setTimeout(r,400))
    const result = await login(email, pass)
    if (result.success) onLogin()
    else { setError('Access denied — check credentials'); setLoading(false) }
  }

  const fieldStyle = (active: boolean): React.CSSProperties => ({
    width:'100%', padding:'13px 16px',
    background: active ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.1)'}`,
    borderRadius:10, color:'#f1f5f9', fontSize:14,
    fontFamily:'var(--font-sans)', outline:'none', boxSizing:'border-box',
    boxShadow: active ? '0 0 0 3px rgba(37,99,235,0.15), inset 0 1px 0 rgba(96,165,250,0.1)' : 'none',
    transition:'all 0.15s',
  })

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column',
      background:'#060d1f', position:'relative', overflow:'hidden',
      fontFamily:'var(--font-sans)',
    }}>

      {/* ── Full-screen animated India map background ── */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
        {/* Dot grid */}
        <div style={{
          position:'absolute', inset:0,
          backgroundImage:'radial-gradient(rgba(96,165,250,0.15) 1px, transparent 1px)',
          backgroundSize:'32px 32px',
        }}/>
        {/* Radial gradient overlay */}
        <div style={{
          position:'absolute', inset:0,
          background:'radial-gradient(ellipse 80% 90% at 38% 50%, rgba(6,13,31,0) 0%, #060d1f 75%)',
        }}/>
        {/* Map */}
        <div style={{ position:'absolute', left:'2%', top:'50%', transform:'translateY(-50%)', width:'56%', height:'94%' }}>
          <IndiaMap/>
        </div>
        {/* Scan line */}
        <ScanLine/>
      </div>

      {/* ── Top bar ── */}
      <div style={{
        position:'relative', zIndex:10, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'18px 36px',
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        backdropFilter:'blur(8px)',
      }}>
        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:34, height:34, borderRadius:9,
            background:'linear-gradient(135deg, #2563eb, #1e40af)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 0 18px rgba(37,99,235,0.5)',
          }}>
            <svg width="18" height="18" viewBox="0 0 36 36" fill="none" aria-hidden>
              <path d="M4 28 Q18 4 32 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="32" cy="18" r="3" fill="white"/>
              <line x1="14" y1="30" x2="14" y2="22" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="21" y1="30" x2="21" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#f1f5f9', letterSpacing:'0.1em' }}>AEROPRICE</div>
            <div style={{ fontSize:9, color:'#60a5fa', letterSpacing:'0.18em', fontWeight:600, marginTop:-1 }}>INDIA AIRFARE INTELLIGENCE</div>
          </div>
        </div>

        {/* Live status */}
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 8px #34d399' }}/>
            <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'#64748b', letterSpacing:'0.1em' }}>
              SYS NOMINAL
            </span>
          </div>
          <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'#334155', letterSpacing:'0.05em' }}>
            {time.toLocaleTimeString('en-IN', { hour12:false })} IST
          </span>
          <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.08em' }}>
            SIH26056
          </span>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'flex-end', position:'relative', zIndex:5 }}>

        {/* Left: data readout overlay */}
        <div style={{
          position:'absolute', left:36, bottom:60,
          display:'flex', flexDirection:'column', gap:6,
        }}>
          {[
            ['CORRIDORS','12 ACTIVE'],
            ['AIRPORTS','20 INDEXED'],
            ['FLIGHTS','SCHEDULE ONLY'],
            ['INDEX','NOT PUBLISHED'],
          ].map(([k,v])=>(
            <div key={k} style={{ display:'flex', gap:10, alignItems:'baseline' }}>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.12em', width:80 }}>{k}</span>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#475569', letterSpacing:'0.08em' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* ── Login card ── */}
        <div style={{
          width:420, marginRight:72, marginLeft:'auto',
          background:'rgba(8,16,36,0.82)',
          backdropFilter:'blur(28px)',
          border:'1px solid rgba(255,255,255,0.09)',
          borderRadius:20,
          boxShadow:'0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(96,165,250,0.06), inset 0 1px 0 rgba(255,255,255,0.07)',
          overflow:'hidden',
        }}>

          {/* Card top accent bar */}
          <div style={{ height:3, background:'linear-gradient(90deg,#1d4ed8,#2563eb,#38bdf8,#2563eb,#1d4ed8)', backgroundSize:'200% 100%' }}/>

          <div style={{ padding:'36px 36px 32px' }}>

            {/* Card header */}
            <div style={{ marginBottom:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <Shield size={14} style={{ color:'#3b82f6' }}/>
                <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'#3b82f6', letterSpacing:'0.14em', fontWeight:700 }}>
                  SECURE ACCESS
                </span>
              </div>
              <h1 style={{
                margin:'0 0 6px', fontSize:24, fontWeight:800, color:'#f1f5f9',
                letterSpacing:'-0.02em', lineHeight:1.2,
              }}>
                Sign in to AeroPrice
              </h1>
              <p style={{ margin:0, fontSize:13, color:'#475569', lineHeight:1.5 }}>
                Ministry of Civil Aviation · Government Intelligence Platform
              </p>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding:'10px 14px', borderRadius:9, marginBottom:20,
                background:'rgba(220,38,38,0.1)', border:'1px solid rgba(220,38,38,0.3)',
                fontSize:12, color:'#fca5a5', fontFamily:'var(--font-mono)', letterSpacing:'0.02em',
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={submit}>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', marginBottom:7, letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>
                  EMAIL ADDRESS
                </label>
                <input
                  type="email" value={email} required autoComplete="email"
                  onChange={e=>setEmail(e.target.value)}
                  onFocus={()=>setActiveField('e')} onBlur={()=>setActiveField(null)}
                  placeholder="you@example.com"
                  style={fieldStyle(activeField==='e')}
                />
              </div>

              <div style={{ marginBottom:24 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', marginBottom:7, letterSpacing:'0.08em', fontFamily:'var(--font-mono)' }}>
                  PASSWORD
                </label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showPass?'text':'password'} value={pass} required autoComplete="current-password"
                    onChange={e=>setPass(e.target.value)}
                    onFocus={()=>setActiveField('p')} onBlur={()=>setActiveField(null)}
                    placeholder="Enter password"
                    style={{ ...fieldStyle(activeField==='p'), paddingRight:44 }}
                  />
                  <button type="button" onClick={()=>setShowPass(v=>!v)} style={{
                    position:'absolute', right:14, top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', cursor:'pointer', color:'#475569',
                    display:'flex', alignItems:'center', padding:0,
                  }}>
                    {showPass?<EyeOff size={15}/>:<Eye size={15}/>}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} style={{
                width:'100%', padding:'14px 20px', borderRadius:11, border:'none', cursor: loading?'not-allowed':'pointer',
                background: loading
                  ? 'rgba(37,99,235,0.4)'
                  : 'linear-gradient(135deg,#2563eb 0%,#1d4ed8 50%,#1e40af 100%)',
                color:'white', fontSize:14, fontWeight:700, letterSpacing:'0.04em',
                display:'flex', alignItems:'center', justifyContent:'center', gap:9,
                boxShadow: loading ? 'none' : '0 4px 20px rgba(37,99,235,0.45), 0 0 0 1px rgba(96,165,250,0.2)',
                transition:'all 0.15s', fontFamily:'var(--font-sans)',
              }}>
                {loading ? (
                  <>
                    <div style={{ width:15, height:15, border:'2px solid rgba(255,255,255,0.25)', borderTopColor:'white', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
                    Authenticating…
                  </>
                ) : (
                  <>ACCESS PLATFORM <ArrowRight size={15}/></>
                )}
              </button>
            </form>

            {/* Divider */}
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'24px 0 18px' }}>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.07)' }}/>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.12em' }}>
                DEMO ACCOUNTS
              </span>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.07)' }}/>
            </div>

            {/* Demo pills */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {DEMO.map(d=>(
                <button key={d.label}
                  onClick={()=>{ setEmail(d.email); setPass(d.pass); setError('') }}
                  style={{
                    padding:'10px 12px', borderRadius:9, textAlign:'left', cursor:'pointer',
                    background:`rgba(${d.color==='#f87171'?'248,113,113':d.color==='#60a5fa'?'96,165,250':d.color==='#34d399'?'52,211,153':'148,163,184'},0.06)`,
                    border:`1px solid rgba(${d.color==='#f87171'?'248,113,113':d.color==='#60a5fa'?'96,165,250':d.color==='#34d399'?'52,211,153':'148,163,184'},0.18)`,
                    transition:'all 0.12s', fontFamily:'var(--font-sans)',
                  }}
                  onMouseEnter={e=>{
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background=`rgba(${d.color==='#f87171'?'248,113,113':d.color==='#60a5fa'?'96,165,250':d.color==='#34d399'?'52,211,153':'148,163,184'},0.14)`
                    el.style.borderColor=`rgba(${d.color==='#f87171'?'248,113,113':d.color==='#60a5fa'?'96,165,250':d.color==='#34d399'?'52,211,153':'148,163,184'},0.4)`
                  }}
                  onMouseLeave={e=>{
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.background=`rgba(${d.color==='#f87171'?'248,113,113':d.color==='#60a5fa'?'96,165,250':d.color==='#34d399'?'52,211,153':'148,163,184'},0.06)`
                    el.style.borderColor=`rgba(${d.color==='#f87171'?'248,113,113':d.color==='#60a5fa'?'96,165,250':d.color==='#34d399'?'52,211,153':'148,163,184'},0.18)`
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:d.color, boxShadow:`0 0 5px ${d.color}` }}/>
                    <span style={{ fontSize:10, fontWeight:800, color:d.color, letterSpacing:'0.1em', fontFamily:'var(--font-mono)' }}>
                      {d.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'#475569' }}>{d.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Card footer */}
          <div style={{
            borderTop:'1px solid rgba(255,255,255,0.06)',
            padding:'14px 36px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            background:'rgba(0,0,0,0.25)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <BarChart2 size={11} style={{ color:'#1e3a5f' }}/>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.1em' }}>
                DGCA INTEGRATED
              </span>
            </div>
            <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.1em' }}>
              GOVT OF INDIA
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Bell size={11} style={{ color:'#1e3a5f' }}/>
              <span style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.1em' }}>
                MoCA · 2026
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        position:'relative', zIndex:5, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center', gap:32,
        padding:'12px 36px',
        borderTop:'1px solid rgba(255,255,255,0.04)',
      }}>
        {[
          'Smart India Hackathon · SIH26056',
          'Ministry of Civil Aviation',
          'DGCA Data Integration',
          'Jevons Price Index',
        ].map(t=>(
          <span key={t} style={{ fontSize:9, fontFamily:'var(--font-mono)', color:'#1e3a5f', letterSpacing:'0.1em' }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
