import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Eye, EyeOff, BarChart2, TrendingUp, Bell, Database, Mail, Lock } from 'lucide-react'

// ── Geographic projection ─────────────────────────────────────────────────────
// ViewBox 280×310 → lng [67.5,97.5] / lat [7.5,37.5]
const VB = { W: 280, H: 310, LNG0: 67.5, LAT0: 37.5, DLNG: 30, DLAT: 30 }
function proj(lat: number, lng: number) {
  return { x: +((lng - VB.LNG0) / VB.DLNG * VB.W).toFixed(1), y: +((VB.LAT0 - lat) / VB.DLAT * VB.H).toFixed(1) }
}

// ── All 20 airports (matching reference image) ────────────────────────────────
const AIRPORTS = {
  SXR: { code:'SXR', name:'Srinagar',           lat:34.1, lng:74.8, major:false },
  IXL: { code:'IXL', name:'Leh',                lat:34.2, lng:77.6, major:false },
  DEL: { code:'DEL', name:'Delhi',              lat:28.7, lng:77.1, major:true  },
  JAI: { code:'JAI', name:'Jaipur',             lat:26.8, lng:75.8, major:false },
  LKO: { code:'LKO', name:'Lucknow',            lat:26.8, lng:80.9, major:false },
  PAT: { code:'PAT', name:'Patna',              lat:25.6, lng:85.1, major:false },
  GAU: { code:'GAU', name:'Guwahati',           lat:26.1, lng:91.6, major:false },
  AMD: { code:'AMD', name:'Ahmedabad',          lat:23.1, lng:72.6, major:false },
  BOM: { code:'BOM', name:'Mumbai',             lat:19.1, lng:72.9, major:true  },
  IXR: { code:'IXR', name:'Ranchi',             lat:23.3, lng:85.3, major:false },
  CCU: { code:'CCU', name:'Kolkata',            lat:22.6, lng:88.4, major:true  },
  NAG: { code:'NAG', name:'Nagpur',             lat:21.1, lng:79.0, major:false },
  BBI: { code:'BBI', name:'Bhubaneswar',        lat:20.2, lng:85.8, major:false },
  GOI: { code:'GOI', name:'Goa',               lat:15.4, lng:73.8, major:false },
  HYD: { code:'HYD', name:'Hyderabad',         lat:17.4, lng:78.5, major:true  },
  BLR: { code:'BLR', name:'Bengaluru',         lat:12.9, lng:77.6, major:true  },
  MAA: { code:'MAA', name:'Chennai',           lat:13.1, lng:80.3, major:true  },
  IXZ: { code:'IXZ', name:'Andaman & Nicobar', lat:11.6, lng:92.7, major:false },
  LKB: { code:'LKB', name:'Lakshadweep',       lat:10.6, lng:72.2, major:false },
  TRV: { code:'TRV', name:'Thiruvananthapuram', lat:8.5,  lng:76.9, major:false },
} as const
type AC = keyof typeof AIRPORTS

// ── Routes ────────────────────────────────────────────────────────────────────
const PRIMARY_ROUTES: [AC,AC][] = [
  ['DEL','BOM'],['DEL','BLR'],['DEL','MAA'],['DEL','CCU'],['DEL','HYD'],
  ['DEL','JAI'],['DEL','LKO'],['DEL','PAT'],['DEL','GAU'],['DEL','NAG'],
  ['DEL','SXR'],
]
const SECONDARY_ROUTES: [AC,AC][] = [
  ['BOM','AMD'],['BOM','GOI'],['BOM','HYD'],['BOM','BLR'],['BOM','MAA'],
  ['BLR','HYD'],['BLR','MAA'],['BLR','TRV'],['BLR','GOI'],
  ['MAA','HYD'],['MAA','BBI'],['CCU','BBI'],['CCU','GAU'],['HYD','NAG'],['IXR','CCU'],
]

// ── Flight animation schedule ─────────────────────────────────────────────────
const FLIGHTS = [
  { id:'F1', from:'DEL' as AC, to:'BOM' as AC, dur:7000, delay:0 },
  { id:'F2', from:'DEL' as AC, to:'BLR' as AC, dur:9000, delay:2200 },
  { id:'F3', from:'BOM' as AC, to:'MAA' as AC, dur:8000, delay:4200 },
  { id:'F4', from:'DEL' as AC, to:'CCU' as AC, dur:6500, delay:1600 },
  { id:'F5', from:'BLR' as AC, to:'HYD' as AC, dur:5000, delay:3200 },
  { id:'F6', from:'HYD' as AC, to:'MAA' as AC, dur:6000, delay:5800 },
]

// ── Bezier math ───────────────────────────────────────────────────────────────
type Pt = { x: number; y: number }
function bezierCP(a: Pt, b: Pt): Pt {
  const mx=(a.x+b.x)/2, my=(a.y+b.y)/2
  const dx=b.x-a.x, dy=b.y-a.y
  const len=Math.sqrt(dx*dx+dy*dy)
  return { x: mx - dy/len*len*0.18, y: my + dx/len*len*0.18 }
}
function qbPos(t: number, p0: Pt, p1: Pt, p2: Pt): Pt {
  const u=1-t
  return { x:u*u*p0.x+2*u*t*p1.x+t*t*p2.x, y:u*u*p0.y+2*u*t*p1.y+t*t*p2.y }
}
function qbTang(t: number, p0: Pt, p1: Pt, p2: Pt): Pt {
  const u=1-t
  return { x:2*u*(p1.x-p0.x)+2*t*(p2.x-p1.x), y:2*u*(p1.y-p0.y)+2*t*(p2.y-p1.y) }
}
function easeInOut(t: number) { return t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2 }

// ── Geographically accurate India outline ─────────────────────────────────────
const INDIA_PATH = `
M 56 4 L 73 4 L 90 11 L 106 20 L 118 29 L 124 35
Q 118 40 111 43
L 126 49 L 133 65 L 138 73
Q 130 76 122 80
L 128 87 L 154 95 L 182 103 L 191 105
L 214 107 L 229 108 L 248 114 L 259 122
L 276 108 L 278 118 L 274 130
L 266 143 L 257 150
Q 248 146 238 143
L 224 148 Q 226 151 229 153
Q 218 157 207 160 L 195 161
L 182 163 L 180 175
Q 171 181 162 186
Q 148 199 133 211
Q 128 217 118 232
Q 118 240 119 243 L 120 251
Q 116 263 112 274
Q 106 283 100 292
Q 96 298 93 302 Q 90 305 88 303
Q 86 301 84 299 Q 82 292 80 285 Q 79 280 78 274
Q 74 267 70 259 Q 67 251 64 243 Q 62 235 60 228
Q 57 222 54 216 Q 53 208 51 200 Q 50 192 49 185
Q 49 178 48 172
L 25 167
Q 20 160 23 154 Q 14 149 7 143 Q 4 136 2 130
Q 5 125 8 120 Q 10 111 13 103 Q 20 95 27 88
Q 30 83 32 78
L 56 62 Q 54 54 51 47 Q 49 38 47 31
Q 49 23 51 15 Q 53 9 56 4 Z`

// ── Airport terminal night background ─────────────────────────────────────────
const WIN1 = [0.7,0.4,0.8,0.5,0.6,0.3,0.7,0.5,0.8,0.4,0.6,0.3,0.7,0.5,0.4,0.6,0.8,0.3,0.5,0.7]
const WIN2 = [0.3,0.6,0.4,0.7,0.5,0.4,0.3,0.6,0.5,0.4,0.3,0.7,0.6,0.4,0.5,0.3,0.6,0.7,0.4,0.5]
const WIN3 = [0.2,0.4,0.3,0.5,0.2,0.4,0.3,0.2,0.5,0.3,0.2,0.4,0.3,0.5,0.4,0.2,0.3,0.5,0.2,0.4]

function AirportBackground() {
  return (
    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'42%', overflow:'hidden', pointerEvents:'none', zIndex:0 }}>
      {/* Top fade to dark */}
      <div style={{ position:'absolute', inset:0, zIndex:3,
        background:'linear-gradient(to bottom, rgba(2,11,24,1) 0%, rgba(2,11,24,0.6) 30%, rgba(2,11,24,0) 60%)' }}/>
      <svg width="100%" height="100%" viewBox="0 0 1400 320" preserveAspectRatio="xMidYMid slice"
        style={{ position:'absolute', inset:0 }}>
        <defs>
          <linearGradient id="ap-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#020b18"/><stop offset="100%" stopColor="#091829"/>
          </linearGradient>
          <linearGradient id="ap-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1a2e"/><stop offset="100%" stopColor="#040c16"/>
          </linearGradient>
        </defs>
        <rect width="1400" height="320" fill="url(#ap-sky)"/>
        <rect x="0" y="155" width="1400" height="165" fill="url(#ap-ground)"/>
        {/* Horizon amber glow */}
        <ellipse cx="550" cy="158" rx="750" ry="55" fill="rgba(140,75,12,0.28)"/>
        <ellipse cx="550" cy="162" rx="500" ry="30" fill="rgba(160,90,15,0.18)"/>
        {/* Terminal building body */}
        <rect x="20" y="65" width="460" height="195" fill="#081528"/>
        {/* Glass facade top */}
        <rect x="20" y="65" width="460" height="90" fill="#0c1e38" opacity="0.95"/>
        {/* Window rows - row 1 */}
        {Array.from({length:19}).map((_,i)=>(
          <rect key={`w1${i}`} x={32+i*23} y={77} width={16} height={24} rx={2}
            fill={`rgba(255,185,70,${WIN1[i%20]})`}/>
        ))}
        {/* Window rows - row 2 */}
        {Array.from({length:19}).map((_,i)=>(
          <rect key={`w2${i}`} x={32+i*23} y={110} width={16} height={22} rx={2}
            fill={`rgba(255,185,70,${WIN2[i%20]})`}/>
        ))}
        {/* Window rows - row 3 (dimmer) */}
        {Array.from({length:19}).map((_,i)=>(
          <rect key={`w3${i}`} x={32+i*23} y={143} width={16} height={18} rx={2}
            fill={`rgba(255,185,70,${WIN3[i%20]})`}/>
        ))}
        <rect x="20" y="155" width="460" height="105" fill="#060f1e"/>
        <rect x="20" y="155" width="460" height="3" stroke="#0c1e35" strokeWidth="1"/>
        {/* Jetway arms */}
        <rect x="80" y="170" width="90" height="14" rx={2} fill="#04101e" transform="rotate(-8,80,170)"/>
        <rect x="220" y="174" width="85" height="13" rx={2} fill="#04101e" transform="rotate(-10,220,174)"/>
        <rect x="360" y="172" width="80" height="13" rx={2} fill="#04101e" transform="rotate(-7,360,172)"/>
        {/* Terminal roof edge */}
        <rect x="15" y="59" width="470" height="9" rx={1} fill="#061020"/>
        {/* Terminal warm ground glow */}
        <ellipse cx="250" cy="260" rx="280" ry="20" fill="rgba(170,100,20,0.07)"/>

        {/* Control tower */}
        <rect x="492" y="25" width="24" height="235" fill="#06121f"/>
        <rect x="476" y="16" width="56" height="20" rx={2} fill="#0b1e35"/>
        <rect x="479" y="10" width="50" height="8" rx={1} fill="#091828"/>
        <rect x="479" y="18" width="50" height="12" rx={1} fill="rgba(255,180,60,0.2)"/>
        <circle cx="502" cy="12" r="3.5" fill="rgba(255,55,55,0.85)"/>
        <circle cx="502" cy="4" r="2" fill="rgba(255,55,55,0.5)"/>

        {/* Aircraft 1 - large, parked */}
        <g transform="translate(555,190)">
          <ellipse cx="130" cy="0" rx="140" ry="16" fill="#08182c"/>
          <path d="M70,-3 L45,-38 L20,-36 L48,-3Z" fill="#061424"/>
          <path d="M190,-3 L215,-38 L240,-36 L212,-3Z" fill="#061424"/>
          <path d="M2,2 L-22,-16 L-32,-15 L-10,2Z" fill="#061424"/>
          <path d="M2,2 L-22,20 L-32,19 L-10,2Z" fill="#061424"/>
          <path d="M0,-2 L-30,-42 L-12,-42 L0,-2Z" fill="#071526"/>
          <ellipse cx="88" cy="10" rx="26" ry="8" fill="#051018"/>
          <ellipse cx="172" cy="10" rx="26" ry="8" fill="#051018"/>
          {Array.from({length:13}).map((_,i)=>(
            <ellipse key={i} cx={60+i*18} cy={-5} rx={6} ry={4} fill="rgba(255,185,70,0.18)"/>
          ))}
          <circle cx="270" cy="-1" r="2.5" fill="rgba(200,220,255,0.55)"/>
        </g>

        {/* Aircraft 2 - medium, behind */}
        <g transform="translate(790,200) scale(0.68)">
          <ellipse cx="110" cy="0" rx="116" ry="14" fill="#061525"/>
          <path d="M55,-2 L30,-30 L12,-28 L38,-2Z" fill="#051220"/>
          <path d="M165,-2 L190,-30 L208,-28 L182,-2Z" fill="#051220"/>
          <path d="M0,0 L-26,-32 L-10,-31 L0,0Z" fill="#061525"/>
          <ellipse cx="70" cy="8" rx="20" ry="7" fill="#040e1a"/>
          <ellipse cx="150" cy="8" rx="20" ry="7" fill="#040e1a"/>
        </g>

        {/* Aircraft 3 - distant small */}
        <g transform="translate(1050,204) scale(0.44)">
          <ellipse cx="90" cy="0" rx="95" ry="13" fill="#050e1c"/>
          <path d="M40,-2 L18,-26 L5,-24 L24,-2Z" fill="#040c18"/>
          <path d="M140,-2 L162,-26 L175,-24 L156,-2Z" fill="#040c18"/>
          <path d="M0,0 L-22,-28 L-8,-27 L0,0Z" fill="#050e1c"/>
        </g>

        {/* Runway centerline dashes */}
        {Array.from({length:28}).map((_,i)=>(
          <rect key={`cl${i}`} x={40+i*48} y={230} width={32} height={3.5} fill="rgba(255,255,255,0.09)" rx={1}/>
        ))}
        {/* Edge lights - near */}
        {Array.from({length:28}).map((_,i)=>(
          <circle key={`el1${i}`} cx={58+i*48} cy={252} r={2.8} fill={`rgba(255,${155+i},35,0.62)`}/>
        ))}
        {/* Edge lights - far */}
        {Array.from({length:28}).map((_,i)=>(
          <circle key={`el2${i}`} cx={58+i*48} cy={268} r={2.2} fill={`rgba(255,${140+i},25,0.42)`}/>
        ))}
        {/* Blue apron lights */}
        {Array.from({length:10}).map((_,i)=>(
          <circle key={`bl${i}`} cx={570+i*74} cy={260} r={1.8} fill="rgba(80,140,255,0.38)"/>
        ))}
        {/* Ground reflections */}
        <ellipse cx="350" cy="285" rx="350" ry="22" fill="rgba(200,115,30,0.055)"/>
        <ellipse cx="700" cy="290" rx="250" ry="15" fill="rgba(80,140,255,0.03)"/>
      </svg>
    </div>
  )
}

// ── India flight map ──────────────────────────────────────────────────────────
function IndiaFlightMap() {
  const svgRef = useRef<SVGSVGElement>(null)
  const rafRef = useRef<number>(0)

  const allAPs = useMemo(() => Object.values(AIRPORTS).map(ap => ({ ...ap, ...proj(ap.lat, ap.lng) })), [])

  const primaryBeziers = useMemo(() => PRIMARY_ROUTES.map(([f,t]) => {
    const a = proj(AIRPORTS[f].lat, AIRPORTS[f].lng)
    const b = proj(AIRPORTS[t].lat, AIRPORTS[t].lng)
    const cp = bezierCP(a,b)
    return { path:`M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}` }
  }), [])

  const secondaryBeziers = useMemo(() => SECONDARY_ROUTES.map(([f,t]) => {
    const a = proj(AIRPORTS[f].lat, AIRPORTS[f].lng)
    const b = proj(AIRPORTS[t].lat, AIRPORTS[t].lng)
    const cp = bezierCP(a,b)
    return { path:`M ${a.x} ${a.y} Q ${cp.x} ${cp.y} ${b.x} ${b.y}` }
  }), [])

  const flightData = useMemo(() => FLIGHTS.map(f => {
    const a = proj(AIRPORTS[f.from].lat, AIRPORTS[f.from].lng)
    const b = proj(AIRPORTS[f.to].lat, AIRPORTS[f.to].lng)
    const cp = bezierCP(a,b)
    return { ...f, a, cp, b }
  }), [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ns = 'http://www.w3.org/2000/svg'

    const els: SVGGElement[] = flightData.map(() => {
      const g = document.createElementNS(ns, 'g')
      g.setAttribute('opacity', '0')
      const halo = document.createElementNS(ns, 'circle')
      halo.setAttribute('r', '5'); halo.setAttribute('fill', 'rgba(147,197,253,0.18)')
      const body = document.createElementNS(ns, 'path')
      body.setAttribute('d', 'M 0,-5.5 L 4,3.5 L 0,1.5 L -4,3.5 Z')
      body.setAttribute('fill', 'rgba(240,248,255,0.95)')
      const trail = document.createElementNS(ns, 'ellipse')
      trail.setAttribute('rx','3'); trail.setAttribute('ry','1.5')
      trail.setAttribute('fill','rgba(147,197,253,0.12)'); trail.setAttribute('cy','3')
      g.appendChild(trail); g.appendChild(halo); g.appendChild(body)
      svg.appendChild(g)
      return g
    })

    const t0 = performance.now()
    function frame(now: number) {
      const elapsed = now - t0
      flightData.forEach((fb, i) => {
        const g = els[i]
        const cycle = fb.dur + 3800
        const raw = elapsed - fb.delay
        if (raw < 0) { g.setAttribute('opacity','0'); return }
        const tmod = raw % cycle
        if (tmod >= fb.dur) { g.setAttribute('opacity','0'); return }
        const tN = tmod / fb.dur
        const t = easeInOut(tN)
        const pos = qbPos(t, fb.a, fb.cp, fb.b)
        const tang = qbTang(tN, fb.a, fb.cp, fb.b)
        const angle = Math.atan2(tang.y, tang.x) * 180 / Math.PI + 90
        const fade = tN < 0.08 ? tN/0.08 : tN > 0.92 ? (1-tN)/0.08 : 1
        g.setAttribute('opacity', String((fade*0.96).toFixed(3)))
        g.setAttribute('transform', `translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)}) rotate(${angle.toFixed(1)})`)
      })
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafRef.current)
      els.forEach(g => { try { svg.removeChild(g) } catch {} })
    }
  }, [flightData])

  return (
    <svg ref={svgRef} viewBox="0 0 280 310"
      style={{ width:'100%', height:'100%', display:'block', overflow:'visible' }} aria-hidden>
      <defs>
        <filter id="lp-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {/* Halo glow for major airport nodes */}
        <filter id="lp-hub" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="lp-node" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="lp-route" x="-10%" y="-100%" width="120%" height="300%">
          <feGaussianBlur stdDeviation="1.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="lp-fill" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgba(37,99,235,0.22)"/>
          <stop offset="100%" stopColor="rgba(10,20,60,0.06)"/>
        </radialGradient>
      </defs>

      {/* Grid */}
      {[0,1,2,3,4,5,6,7,8].map(i=>(
        <line key={`h${i}`} x1={0} y1={i*38} x2={280} y2={i*38} stroke="rgba(148,163,184,0.06)" strokeWidth={0.4}/>
      ))}
      {[0,1,2,3,4,5,6,7,8].map(i=>(
        <line key={`v${i}`} x1={i*35} y1={0} x2={i*35} y2={310} stroke="rgba(148,163,184,0.06)" strokeWidth={0.4}/>
      ))}

      {/* India silhouette — glow layer + crisp border on top */}
      <path d={INDIA_PATH} fill="none"
        stroke="rgba(96,165,250,0.45)" strokeWidth={4}
        strokeLinejoin="round" strokeLinecap="round" filter="url(#lp-glow)"/>
      <path d={INDIA_PATH} fill="url(#lp-fill)"
        stroke="rgba(186,220,255,0.7)" strokeWidth={0.8}
        strokeLinejoin="round" strokeLinecap="round"/>

      {/* Geographic labels — positioned to match reference */}
      {[
        { text:'PAKISTAN',     x:10,  y:155, fs:7,   anchor:'middle' },
        { text:'CHINA',        x:210, y:30,  fs:7,   anchor:'middle' },
        { text:'NEPAL',        x:152, y:106, fs:6,   anchor:'middle' },
        { text:'MYANMAR',      x:252, y:190, fs:6,   anchor:'middle' },
        { text:'ARABIAN',      x:-5,  y:215, fs:6.5, anchor:'middle' },
        { text:'SEA',          x:3,   y:225, fs:6.5, anchor:'middle' },
        { text:'BAY OF',       x:206, y:242, fs:6,   anchor:'middle' },
        { text:'BENGAL',       x:206, y:251, fs:6,   anchor:'middle' },
        { text:'INDIAN OCEAN', x:75,  y:288, fs:5.5, anchor:'middle' },
      ].map((l,i)=>(
        <text key={i} x={l.x} y={l.y} fontSize={l.fs} fontWeight={500}
          fill="rgba(255,255,255,0.22)" fontFamily="var(--font-sans)"
          letterSpacing="0.1em" textAnchor={l.anchor as 'middle'}>{l.text}</text>
      ))}

      {/* Secondary routes — glow layer + top line */}
      {secondaryBeziers.map((rb,i)=>(
        <g key={i}>
          <path d={rb.path} fill="none" stroke="rgba(96,165,250,0.18)" strokeWidth={2}
            strokeLinecap="round" filter="url(#lp-route)"/>
          <path d={rb.path} fill="none" stroke="rgba(147,197,253,0.22)" strokeWidth={0.7}
            strokeDasharray="3 7" strokeLinecap="round"/>
        </g>
      ))}

      {/* Primary routes — glow layer + bright dashed top */}
      {primaryBeziers.map((rb,i)=>(
        <g key={i}>
          <path d={rb.path} fill="none" stroke="rgba(96,165,250,0.3)" strokeWidth={3}
            strokeLinecap="round" filter="url(#lp-route)"/>
          <path d={rb.path} fill="none" stroke="rgba(186,220,255,0.55)" strokeWidth={0.85}
            strokeDasharray="5 5" strokeLinecap="round"/>
        </g>
      ))}

      {/* Airport nodes — layered glow matching reference */}
      {allAPs.map(ap => {
        const isMajor = ap.major
        return (
          <g key={ap.code}>
            {/* Outermost large halo — only for major hubs */}
            {isMajor && (
              <circle cx={ap.x} cy={ap.y} r={22}
                fill="rgba(37,99,235,0.08)" filter="url(#lp-hub)"/>
            )}
            {/* Glow circle */}
            <circle cx={ap.x} cy={ap.y} r={isMajor?14:9}
              fill={isMajor?"rgba(37,99,235,0.22)":"rgba(37,99,235,0.12)"}
              filter="url(#lp-node)"/>
            {/* Ring */}
            <circle cx={ap.x} cy={ap.y} r={isMajor?7:4.5} fill="none"
              stroke={isMajor?"rgba(147,197,253,0.7)":"rgba(147,197,253,0.45)"}
              strokeWidth={isMajor?1.2:0.9}/>
            {/* Inner bright ring */}
            {isMajor && (
              <circle cx={ap.x} cy={ap.y} r={4} fill="none"
                stroke="rgba(186,220,255,0.55)" strokeWidth={0.8}/>
            )}
            {/* Center bright dot */}
            <circle cx={ap.x} cy={ap.y} r={isMajor?2.5:1.8}
              fill={isMajor?"rgba(230,245,255,1)":"rgba(186,220,255,0.9)"}/>
            {/* Labels: City name + (CODE) */}
            <text x={ap.x+9} y={ap.y-1} fontSize={isMajor?7.5:6} fontWeight={700}
              fill="rgba(255,255,255,0.92)" fontFamily="var(--font-sans)"
              style={{ textShadow:'0 1px 3px rgba(0,0,0,0.8)' }}>{ap.name}</text>
            <text x={ap.x+9} y={ap.y+8} fontSize={isMajor?6.5:5.5} fontWeight={500}
              fill="rgba(147,197,253,0.8)" fontFamily="var(--font-mono)"
              letterSpacing="0.04em">({ap.code})</text>
          </g>
        )
      })}

      {/* North indicator */}
      <g transform="translate(262,296)">
        <text x={0} y={0} fontSize={9} fontWeight={700} fill="rgba(255,255,255,0.5)"
          textAnchor="middle" fontFamily="var(--font-sans)">N</text>
        <line x1={0} y1={2} x2={0} y2={12} stroke="rgba(255,255,255,0.45)" strokeWidth={1.2}/>
        <polygon points="0,-2 -3,2 0,0 3,2" fill="rgba(255,255,255,0.5)"
          transform="translate(0,2)"/>
      </g>
    </svg>
  )
}

// ── Government Ashoka emblem ──────────────────────────────────────────────────
function AshokaEmblem() {
  // Authentic-style Ashoka Lion Capital seal
  const GOLD = '#c9972a'
  const GOLD2 = '#a07820'
  const N = 24
  return (
    <svg width="58" height="72" viewBox="0 0 58 72" fill="none" aria-hidden>
      {/* Outer decorative border */}
      <circle cx="29" cy="28" r="27" stroke={GOLD} strokeWidth="1.2" opacity="0.5"/>
      <circle cx="29" cy="28" r="24" stroke={GOLD} strokeWidth="0.5" opacity="0.3"/>

      {/* === LION CAPITAL — Three lions visible === */}
      {/* Left lion body */}
      <path d="M13 32 Q11 26 13 22 Q15 18 18 17 Q20 16 21 18 Q22 20 21 24 Q20 28 19 32Z"
        fill={GOLD} opacity="0.7"/>
      {/* Left lion head */}
      <circle cx="17" cy="14" r="5.5" fill={GOLD} opacity="0.65"/>
      {/* Left lion mane */}
      <circle cx="17" cy="14" r="7.5" fill="none" stroke={GOLD} strokeWidth="1.5" opacity="0.35"/>
      {/* Left lion face detail */}
      <circle cx="15.5" cy="13" r="1" fill={GOLD2}/>
      <circle cx="18.5" cy="13" r="1" fill={GOLD2}/>
      <path d="M15.5 16 Q17 17.5 18.5 16" stroke={GOLD2} strokeWidth="0.8" fill="none"/>

      {/* Center lion body (forward-facing, larger) */}
      <path d="M22 33 Q20 26 22 21 Q24 17 29 16 Q34 17 36 21 Q38 26 36 33Z"
        fill={GOLD} opacity="0.8"/>
      {/* Center lion head */}
      <circle cx="29" cy="11" r="7" fill={GOLD} opacity="0.75"/>
      {/* Center mane ring */}
      <circle cx="29" cy="11" r="9.5" fill="none" stroke={GOLD} strokeWidth="2" opacity="0.4"/>
      {/* Center lion face */}
      <circle cx="26.5" cy="10" r="1.2" fill={GOLD2}/>
      <circle cx="31.5" cy="10" r="1.2" fill={GOLD2}/>
      <path d="M26.5 13.5 Q29 15.5 31.5 13.5" stroke={GOLD2} strokeWidth="1" fill="none"/>
      {/* Crown/top tuft */}
      <path d="M26 4 Q29 1 32 4 Q30 6 29 5.5 Q28 6 26 4Z" fill={GOLD} opacity="0.6"/>

      {/* Right lion body */}
      <path d="M37 32 Q38 28 39 24 Q38 20 36 18 Q34 16 37 17 Q40 18 42 22 Q44 26 45 32Z"
        fill={GOLD} opacity="0.7"/>
      {/* Right lion head */}
      <circle cx="41" cy="14" r="5.5" fill={GOLD} opacity="0.65"/>
      <circle cx="41" cy="14" r="7.5" fill="none" stroke={GOLD} strokeWidth="1.5" opacity="0.35"/>
      <circle cx="39.5" cy="13" r="1" fill={GOLD2}/>
      <circle cx="42.5" cy="13" r="1" fill={GOLD2}/>
      <path d="M39.5 16 Q41 17.5 42.5 16" stroke={GOLD2} strokeWidth="0.8" fill="none"/>

      {/* === ABACUS PLATFORM === */}
      <rect x="8" y="33" width="42" height="5" rx="1" fill={GOLD} opacity="0.75"/>
      {/* Dharmachakra wheel in center of abacus */}
      <circle cx="29" cy="35.5" r="4" fill="none" stroke={GOLD} strokeWidth="0.8" opacity="0.9"/>
      {Array.from({length:N}).map((_,k)=>{
        const a=k*Math.PI*2/N-Math.PI/2
        return <line key={k}
          x1={29+Math.cos(a)*1} y1={35.5+Math.sin(a)*1}
          x2={29+Math.cos(a)*3.5} y2={35.5+Math.sin(a)*3.5}
          stroke={GOLD} strokeWidth="0.45" opacity="0.7"/>
      })}
      <circle cx="29" cy="35.5" r="1" fill={GOLD} opacity="0.9"/>
      {/* Bull (left of wheel) */}
      <ellipse cx="20" cy="35.5" rx="5" ry="2.5" fill={GOLD} opacity="0.55"/>
      <circle cx="23" cy="34.5" r="2" fill={GOLD} opacity="0.5"/>
      {/* Horse (right of wheel) */}
      <ellipse cx="38" cy="35.5" rx="5" ry="2.5" fill={GOLD} opacity="0.55"/>
      <circle cx="35" cy="34.5" r="2" fill={GOLD} opacity="0.5"/>

      {/* === BASE PLINTH === */}
      <rect x="6" y="38" width="46" height="5" rx="1.5" fill={GOLD} opacity="0.65"/>
      <rect x="4" y="43" width="50" height="4" rx="1.5" fill={GOLD} opacity="0.5"/>

      {/* === MOTTO === */}
      <text x="29" y="54" textAnchor="middle" fontSize="6.5" fill={GOLD}
        fontFamily="serif" letterSpacing="0.3" opacity="0.9">सत्यमेव जयते</text>

      {/* Bottom decorative line */}
      <line x1="10" y1="57" x2="48" y2="57" stroke={GOLD} strokeWidth="0.5" opacity="0.4"/>
    </svg>
  )
}

// ── India Gate silhouette (bottom right panel) ────────────────────────────────
function IndiaGateSilhouette() {
  return (
    <svg viewBox="0 0 220 130" style={{ width:'100%', opacity:0.2 }} aria-hidden>
      {/* Main arch */}
      <rect x="82" y="38" width="20" height="80" rx={2} fill="#3b82f6"/>
      <rect x="118" y="38" width="20" height="80" rx={2} fill="#3b82f6"/>
      <path d="M 82 58 Q 110 22 138 58" fill="none" stroke="#3b82f6" strokeWidth={11} strokeLinecap="round"/>
      {/* Top cap */}
      <rect x="74" y="32" width="72" height="10" rx={2} fill="#3b82f6"/>
      <rect x="78" y="25" width="64" height="9" rx={1.5} fill="#3b82f6" opacity="0.75"/>
      {/* Inscription band */}
      <rect x="89" y="72" width="42" height="18" rx={1} fill="#2563eb" opacity="0.35"/>
      {/* Base */}
      <rect x="66" y="116" width="88" height="9" rx={1.5} fill="#3b82f6"/>
      <rect x="56" y="122" width="108" height="6" rx={1} fill="#3b82f6" opacity="0.7"/>
      {/* Side pillars */}
      <rect x="22" y="78" width="10" height="43" rx={1} fill="#3b82f6" opacity="0.3"/>
      <rect x="188" y="78" width="10" height="43" rx={1} fill="#3b82f6" opacity="0.3"/>
      <rect x="38" y="84" width="8" height="37" rx={1} fill="#3b82f6" opacity="0.22"/>
      <rect x="174" y="84" width="8" height="37" rx={1} fill="#3b82f6" opacity="0.22"/>
      {/* Decorative lamp posts */}
      <rect x="10" y="96" width="3" height="28" rx={1} fill="#3b82f6" opacity="0.2"/>
      <circle cx="11.5" cy="95" r="3" fill="#3b82f6" opacity="0.25"/>
      <rect x="206" y="96" width="3" height="28" rx={1} fill="#3b82f6" opacity="0.2"/>
      <circle cx="207.5" cy="95" r="3" fill="#3b82f6" opacity="0.25"/>
      {/* Trees */}
      {[22,34,188,200].map(x=>(
        <ellipse key={x} cx={x} cy={118} rx={9} ry={12} fill="#3b82f6" opacity="0.12"/>
      ))}
      {/* Ground */}
      <rect x="0" y="127" width="220" height="3" fill="#3b82f6" opacity="0.12"/>
    </svg>
  )
}

// ── Demo credentials ──────────────────────────────────────────────────────────
interface DemoCred { label:string; role:string; email:string; password:string; color:string }
const DEMO_CREDS: DemoCred[] = [
  { label:'ADMIN',   role:'ADMIN',      email:'admin@aeroprice.in', password:'aeroadmin', color:'#dc2626' },
  { label:'ANALYST', role:'ANALYST',    email:'dgca@gov.in',        password:'dgca2026',  color:'#0ea5e9' },
  { label:'PRO',     role:'SUBSCRIBER', email:'user@aeroprice.in',  password:'aero123',   color:'#2563eb' },
  { label:'FREE',    role:'PUBLIC',     email:'visitor@example.com',password:'demo',      color:'#64748b' },
]

// ── Main page ─────────────────────────────────────────────────────────────────
interface LoginPageProps { onLogin: () => void }

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [focus, setFocus] = useState<string|null>(null)
  const t1 = useRef<ReturnType<typeof setTimeout>|null>(null)
  const t2 = useRef<ReturnType<typeof setTimeout>|null>(null)
  const MSGS = ['VERIFYING…','CONNECTING…','LOADING…']

  useEffect(()=>()=>{ if(t1.current)clearTimeout(t1.current); if(t2.current)clearTimeout(t2.current) },[])

  async function doLogin(em:string,pw:string) {
    setError(''); setLoading(true); setLoadStep(0)
    t1.current=setTimeout(()=>setLoadStep(1),800)
    t2.current=setTimeout(()=>setLoadStep(2),1600)
    try { const r=await login(em,pw); if(r.success)onLogin(); else setError(r.error??'Invalid credentials.') }
    finally { setLoading(false); if(t1.current)clearTimeout(t1.current); if(t2.current)clearTimeout(t2.current) }
  }

  async function handleSubmit(e:React.FormEvent){ e.preventDefault(); await doLogin(email,password) }
  async function quickLogin(c:DemoCred){ setEmail(c.email); setPassword(c.password); await doLogin(c.email,c.password) }

  const inp = (focused:boolean, err:boolean): React.CSSProperties => ({
    width:'100%', padding:'12px 14px 12px 42px', boxSizing:'border-box',
    background:'white', borderRadius:8, fontSize:13, fontFamily:'var(--font-sans)',
    color:'#0f172a', outline:'none',
    border:`1.5px solid ${err?'#ef4444':focused?'#2563eb':'#e2e8f0'}`,
    boxShadow: focused?'0 0 0 3px rgba(37,99,235,0.1)':'none',
    transition:'border-color 140ms, box-shadow 140ms',
  })

  const FEATURES = [
    { Icon:BarChart2, title:'Route & Price Analysis', desc:'Explore and compare fares across Indian routes' },
    { Icon:TrendingUp, title:'Trend Insights', desc:'Understand price movements over time' },
    { Icon:Bell, title:'Price Alerts', desc:'Stay informed about significant changes' },
    { Icon:Database, title:'Historical Analysis', desc:'Make better decisions with data' },
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'var(--font-sans)', overflow:'hidden' }}>

      {/* ═══════════════════════════════════════════════════════════
          LEFT PANEL — 70% — Dark Hero / Map
      ═══════════════════════════════════════════════════════════ */}
      <div style={{
        width:'70%', flexShrink:0, position:'relative',
        background:'linear-gradient(180deg,#020b18 0%,#031020 60%,#041228 100%)',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        {/* Airport night background (bottom) */}
        <AirportBackground/>

        {/* Overall dark grid overlay */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:1,
          backgroundImage:'radial-gradient(circle, rgba(148,163,184,0.08) 1px, transparent 1px)',
          backgroundSize:'36px 36px' }}/>

        {/* Radial map glow */}
        <div style={{ position:'absolute', top:'30%', left:'55%', transform:'translate(-50%,-50%)',
          width:500, height:400, borderRadius:'50%',
          background:'radial-gradient(ellipse, rgba(37,99,235,0.11) 0%, transparent 70%)',
          pointerEvents:'none', zIndex:1 }}/>

        {/* ── Nav bar ── */}
        <div style={{
          position:'relative', zIndex:10,
          height:56, flexShrink:0,
          display:'flex', alignItems:'center',
          padding:'0 28px',
          borderBottom:'1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginRight:'auto' }}>
            {/* Paper airplane logo matching reference */}
            <svg width="42" height="38" viewBox="0 0 42 38" fill="none" aria-hidden>
              {/* Blue shield/badge background */}
              <rect x="0" y="2" width="38" height="34" rx="9" fill="rgba(37,99,235,0.15)"/>
              {/* Paper airplane — matching reference style */}
              <path d="M4 34 L34 19 L4 8 L10 19 Z" fill="#3b82f6"/>
              <path d="M10 19 L4 34 L16 25 Z" fill="#1d4ed8"/>
              <path d="M10 19 L16 25 L34 19 Z" fill="#60a5fa" opacity="0.7"/>
            </svg>
            <div>
              <div style={{ display:'flex', gap:0, lineHeight:1 }}>
                <span style={{ fontSize:16, fontWeight:800, color:'white', fontFamily:'var(--font-sans)' }}>Aero</span>
                <span style={{ fontSize:16, fontWeight:800, color:'#3b82f6', fontFamily:'var(--font-sans)' }}>Price</span>
              </div>
              <div style={{ fontSize:8, color:'rgba(255,255,255,0.32)', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', marginTop:1 }}>
                India Airfare Intelligence Platform
              </div>
            </div>
          </div>

          {/* Nav links */}
          <div style={{ display:'flex', alignItems:'center', gap:0 }}>
            {['DATA','INSIGHTS','POLICY','RESEARCH','A MORE CONNECTED INDIA'].map((item,i,arr) => (
              <span key={item} style={{
                fontSize:9, fontWeight:600, color:'rgba(255,255,255,0.4)',
                letterSpacing:'0.1em', fontFamily:'var(--font-sans)',
                padding:`0 ${i===arr.length-1?0:18}px 0 ${i===0?0:18}px`,
                borderRight: i<arr.length-1?'1px solid rgba(255,255,255,0.12)':'none',
              }}>{item}</span>
            ))}
          </div>

          {/* SIH badge */}
          <div style={{
            marginLeft:24,
            padding:'5px 12px', borderRadius:6,
            background:'rgba(255,255,255,0.05)',
            border:'1px solid rgba(255,255,255,0.08)',
            textAlign:'right',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:3 }}>
              <div style={{ width:18, height:2.5, background:'linear-gradient(90deg,#FF9933 33%,white 33% 66%,#138808 66%)', borderRadius:1 }}/>
              <div style={{ width:18, height:2.5, background:'linear-gradient(90deg,#FF9933 33%,white 33% 66%,#138808 66%)', borderRadius:1 }}/>
            </div>
            <div style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.55)', fontFamily:'var(--font-mono)', letterSpacing:'0.06em' }}>
              Smart India Hackathon 2026
            </div>
            <div style={{ fontSize:7, color:'rgba(255,255,255,0.28)', fontFamily:'var(--font-mono)' }}>Prototype</div>
          </div>
        </div>

        {/* ── Main content row ── */}
        <div style={{ flex:1, display:'flex', position:'relative', zIndex:5, overflow:'hidden', minHeight:0 }}>

          {/* Left column: headline + features */}
          <div style={{ width:'38%', flexShrink:0, padding:'28px 0 0 28px', display:'flex', flexDirection:'column' }}>
            {/* Headline */}
            <h1 style={{ fontSize:28, fontWeight:800, color:'white', lineHeight:1.2, letterSpacing:'-0.02em', fontFamily:'var(--font-sans)', marginBottom:14 }}>
              Smarter<br/>Airfare Insights<br/>for a More<br/>
              <span style={{ color:'#3b82f6' }}>Connected India</span>
            </h1>

            {/* Description */}
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.45)', lineHeight:1.75, fontFamily:'var(--font-sans)', maxWidth:280, marginBottom:22 }}>
              A unified platform to analyze domestic airfare trends, compare route-level pricing, and support research, policy making, and a more accessible air travel ecosystem.
            </p>

            {/* Feature list */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {FEATURES.map(({ Icon, title, desc }) => (
                <div key={title} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{
                    width:30, height:30, borderRadius:7, flexShrink:0,
                    background:'rgba(37,99,235,0.2)', border:'1px solid rgba(37,99,235,0.35)',
                    display:'flex', alignItems:'center', justifyContent:'center', marginTop:1,
                  }}>
                    <Icon size={14} style={{ color:'#60a5fa' }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.88)', fontFamily:'var(--font-sans)', marginBottom:2, lineHeight:1.3 }}>{title}</div>
                    <div style={{ fontSize:9.5, color:'rgba(255,255,255,0.42)', fontFamily:'var(--font-sans)', lineHeight:1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom text */}
            <div style={{ marginTop:'auto', paddingBottom:12, paddingTop:16 }}>
              <div style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.18)', letterSpacing:'0.1em', fontFamily:'var(--font-mono)', lineHeight:1.6 }}>
                CONNECTING CITIES<br/>POWERING OPPORTUNITIES
              </div>
            </div>
          </div>

          {/* Map area */}
          <div style={{ flex:1, position:'relative', minHeight:0, padding:'12px 12px 0 0' }}>

            {/* 12+ Metro Hubs card */}
            <div style={{
              position:'absolute', top:16, left:8, zIndex:10,
              display:'flex', alignItems:'center', gap:10,
              padding:'8px 14px',
              background:'rgba(5,15,40,0.85)',
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:9, backdropFilter:'blur(10px)',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2L8 8H2L7 13L5 20L12 16L19 20L17 13L22 8H16L12 2Z" fill="rgba(96,165,250,0.8)"/>
              </svg>
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'white', fontFamily:'var(--font-mono)', lineHeight:1 }}>12+</div>
                <div style={{ fontSize:8, color:'rgba(255,255,255,0.5)', fontFamily:'var(--font-sans)' }}>Major Metro Hubs</div>
              </div>
            </div>

            {/* India's Air Network legend */}
            <div style={{
              position:'absolute', top:16, right:4, zIndex:10, width:168,
              padding:'10px 12px',
              background:'rgba(5,15,40,0.85)',
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:9, backdropFilter:'blur(10px)',
            }}>
              <div style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.65)', letterSpacing:'0.12em', fontFamily:'var(--font-mono)', marginBottom:3 }}>
                INDIA'S AIR NETWORK
              </div>
              <div style={{ fontSize:8, color:'rgba(147,197,253,0.65)', fontFamily:'var(--font-sans)', lineHeight:1.5, marginBottom:8 }}>
                Stronger Connections.<br/>Greater Possibilities.
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {[
                  { big:true,  label:'Major Airport (Metro)' },
                  { big:false, label:'Key Airport' },
                ].map(l=>(
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:l.big?8:5, height:l.big?8:5, borderRadius:'50%', flexShrink:0,
                      background:l.big?'rgba(220,240,255,0.95)':'rgba(147,197,253,0.6)',
                      boxShadow:l.big?'0 0 6px rgba(96,165,250,0.8)':'none' }}/>
                    <span style={{ fontSize:7.5, color:'rgba(255,255,255,0.45)', fontFamily:'var(--font-sans)' }}>{l.label}</span>
                  </div>
                ))}
                {[
                  { dash:'4 6',  op:0.55, label:'Major Route' },
                  { dash:'2 8',  op:0.3,  label:'Other Route' },
                ].map(l=>(
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <svg width="24" height="4" aria-hidden>
                      <line x1="0" y1="2" x2="24" y2="2" stroke={`rgba(147,197,253,${l.op})`}
                        strokeWidth="1.5" strokeDasharray={l.dash} strokeLinecap="round"/>
                    </svg>
                    <span style={{ fontSize:7.5, color:'rgba(255,255,255,0.45)', fontFamily:'var(--font-sans)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lakshadweep inset (lower-left of map) */}
            <div style={{
              position:'absolute', bottom:68, left:6, zIndex:10,
              width:70, padding:'6px 8px',
              background:'rgba(5,15,40,0.8)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:7, backdropFilter:'blur(8px)',
            }}>
              <div style={{ width:18, height:32, margin:'0 auto 4px',
                background:'rgba(37,99,235,0.15)', borderRadius:3,
                border:'0.5px solid rgba(147,197,253,0.2)' }}>
                <div style={{ display:'flex', gap:2, padding:'4px 3px', flexDirection:'column' }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:4, height:4, borderRadius:'50%',
                      background:'rgba(147,197,253,0.7)', margin:'0 auto' }}/>
                  ))}
                </div>
              </div>
              <div style={{ fontSize:6.5, color:'rgba(255,255,255,0.6)', fontFamily:'var(--font-sans)', textAlign:'center', lineHeight:1.3 }}>
                Lakshadweep<br/>(LKB)
              </div>
            </div>

            {/* Andaman inset (lower-right of map) */}
            <div style={{
              position:'absolute', bottom:68, right:4, zIndex:10,
              width:80, padding:'6px 8px',
              background:'rgba(5,15,40,0.8)', border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:7, backdropFilter:'blur(8px)',
            }}>
              <div style={{ width:24, height:40, margin:'0 auto 4px',
                background:'rgba(37,99,235,0.12)', borderRadius:3,
                border:'0.5px solid rgba(147,197,253,0.2)',
                display:'flex', flexDirection:'column', gap:3, padding:'4px 3px' }}>
                {[7,5,4,3].map((w,i)=>(
                  <div key={i} style={{ height:4, width:w, borderRadius:2,
                    background:'rgba(147,197,253,0.6)', margin:'0 auto' }}/>
                ))}
              </div>
              <div style={{ fontSize:6.5, color:'rgba(255,255,255,0.6)', fontFamily:'var(--font-sans)', textAlign:'center', lineHeight:1.3 }}>
                Andaman & Nicobar<br/>(IXZ)
              </div>
            </div>

            {/* India Map SVG */}
            <div style={{ width:'100%', height:'100%', paddingTop:52 }}>
              <IndiaFlightMap/>
            </div>
          </div>
        </div>

        {/* ── Bottom stats bar ── */}
        <div style={{
          position:'relative', zIndex:6, flexShrink:0,
          borderTop:'1px solid rgba(255,255,255,0.07)',
          background:'rgba(2,8,18,0.7)', backdropFilter:'blur(8px)',
        }}>
          <div style={{ display:'flex', alignItems:'center', padding:'10px 28px', gap:0, justifyContent:'space-between' }}>
            {[
              { icon:'✈', big:'100+', small:'Domestic Airports' },
              { icon:'⟆', big:'Hundreds', small:'of Routes' },
              { icon:'⬡', big:'Data-Driven', small:'Insights' },
              { icon:'⟨⟩', big:'For a More', small:'Connected India' },
            ].map((s,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8,
                borderRight: i<3?'1px solid rgba(255,255,255,0.07)':'none',
                paddingRight: i<3?28:0, paddingLeft: i>0?28:0 }}>
                <span style={{ fontSize:18, color:'rgba(96,165,250,0.8)' }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.85)', fontFamily:'var(--font-mono)' }}>{s.big}</div>
                  <div style={{ fontSize:8.5, color:'rgba(255,255,255,0.38)', fontFamily:'var(--font-sans)' }}>{s.small}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', paddingBottom:10, fontSize:9.5, color:'rgba(255,255,255,0.22)', fontFamily:'var(--font-sans)', fontStyle:'italic' }}>
            "Better data. Better decisions. A more connected India."
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          RIGHT PANEL — 30% — Login form
      ═══════════════════════════════════════════════════════════ */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column',
        background:'white', overflowY:'auto',
      }}>
        {/* Ministry of Civil Aviation */}
        <div style={{
          padding:'16px 20px',
          display:'flex', alignItems:'center', justifyContent:'flex-end', gap:14,
          borderBottom:'1px solid #f1f5f9', flexShrink:0,
          background:'white',
        }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#0f172a', fontFamily:'var(--font-sans)', lineHeight:1.4 }}>Ministry of Civil Aviation</div>
            <div style={{ fontSize:9, color:'#475569', fontFamily:'var(--font-sans)', lineHeight:1.4 }}>Government of India</div>
            <div style={{ fontSize:7.5, color:'#94a3b8', fontFamily:'serif', lineHeight:1.4 }}>सत्यमेव जयते</div>
            {/* Tricolor */}
            <div style={{ display:'flex', height:2.5, marginTop:5, borderRadius:1, overflow:'hidden' }}>
              <div style={{ flex:1, background:'#FF9933' }}/>
              <div style={{ flex:1, background:'white', outline:'0.5px solid #e2e8f0', outlineOffset:'-0.5px' }}/>
              <div style={{ flex:1, background:'#138808' }}/>
            </div>
          </div>
          <AshokaEmblem/>
        </div>

        {/* Form container */}
        <div style={{ flex:1, padding:'28px 24px' }}>

          {/* SECURE ACCESS badge */}
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:18 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="11" width="18" height="12" rx="2" stroke="#2563eb" strokeWidth="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize:10.5, fontWeight:700, color:'#2563eb', letterSpacing:'0.12em', fontFamily:'var(--font-sans)' }}>
              SECURE ACCESS
            </span>
            {/* Watermark plane */}
            <div style={{ marginLeft:'auto', opacity:0.08 }}>
              <svg width="60" height="40" viewBox="0 0 60 40" fill="none" aria-hidden>
                <path d="M4 30Q20 4 50 20" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" fill="none"/>
                <circle cx="50" cy="20" r="4" fill="#3b82f6"/>
              </svg>
            </div>
          </div>

          <h1 style={{ fontSize:26, fontWeight:800, color:'#0f172a', letterSpacing:'-0.02em', margin:'0 0 8px', fontFamily:'var(--font-sans)' }}>
            Welcome back
          </h1>
          <p style={{ fontSize:12, color:'#64748b', margin:'0 0 24px', lineHeight:1.65, fontFamily:'var(--font-sans)' }}>
            Sign in to access your AeroPrice airfare intelligence workspace.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:'#374151', marginBottom:7, fontFamily:'var(--font-sans)' }}>Email Address</label>
              <div style={{ position:'relative' }}>
                <Mail size={14} style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',
                  color:focus==='email'?'#2563eb':'#94a3b8', pointerEvents:'none' }}/>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  onFocus={()=>setFocus('email')} onBlur={()=>setFocus(null)}
                  placeholder="your@organization.in" required disabled={loading}
                  autoComplete="email" style={inp(focus==='email', !!error)}/>
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:'#374151', marginBottom:7, fontFamily:'var(--font-sans)' }}>Password</label>
              <div style={{ position:'relative' }}>
                <Lock size={14} style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',
                  color:focus==='password'?'#2563eb':'#94a3b8', pointerEvents:'none' }}/>
                <input type={showPass?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}
                  onFocus={()=>setFocus('password')} onBlur={()=>setFocus(null)}
                  placeholder="Enter your password" required disabled={loading}
                  autoComplete="current-password"
                  style={{ ...inp(focus==='password', !!error), paddingRight:42 }}/>
                <button type="button" onClick={()=>setShowPass(v=>!v)}
                  style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
                    background:'none',border:'none',cursor:'pointer',color:'#94a3b8',padding:2,display:'flex' }}>
                  {showPass?<EyeOff size={15}/>:<Eye size={15}/>}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer' }}>
                <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}
                  style={{ width:14, height:14, accentColor:'#2563eb', cursor:'pointer' }}/>
                <span style={{ fontSize:12, color:'#374151', fontFamily:'var(--font-sans)' }}>Remember me</span>
              </label>
              <button type="button" style={{ background:'none',border:'none',cursor:'pointer',
                fontSize:12,color:'#2563eb',fontFamily:'var(--font-sans)',fontWeight:600,padding:0 }}>
                Forgot password?
              </button>
            </div>

            {error && (
              <div style={{ marginBottom:14, padding:'10px 14px', background:'#fef2f2', borderRadius:8,
                fontSize:12, color:'#dc2626', fontFamily:'var(--font-sans)',
                border:'1px solid rgba(220,38,38,0.2)', display:'flex', alignItems:'center', gap:7 }}>
                ⚠ {error}
              </div>
            )}

            {/* Sign In button */}
            <button type="submit" disabled={loading} style={{
              width:'100%', padding:'13px 20px',
              background:loading?'#94a3b8':'#2563eb',
              color:'white', border:'none', borderRadius:8,
              fontSize:14, fontWeight:700, fontFamily:'var(--font-sans)',
              cursor:loading?'not-allowed':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'all 180ms', boxShadow:loading?'none':'0 4px 14px rgba(37,99,235,0.35)',
              marginBottom:18, letterSpacing:'0.02em',
            }}>
              {loading ? (
                <>
                  <span style={{ width:13,height:13,borderRadius:'50%',
                    border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'white',
                    animation:'spin 0.8s linear infinite',display:'inline-block' }}/>
                  <span style={{ fontFamily:'var(--font-mono)',fontSize:10,letterSpacing:'0.1em' }}>
                    {MSGS[loadStep]}
                  </span>
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          {/* OR divider */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
            <div style={{ flex:1, height:1, background:'#e2e8f0' }}/>
            <span style={{ fontSize:11, color:'#94a3b8', fontFamily:'var(--font-sans)' }}>OR</span>
            <div style={{ flex:1, height:1, background:'#e2e8f0' }}/>
          </div>

          {/* Continue with Google (visual) */}
          <button type="button" style={{
            width:'100%', padding:'11px 20px', marginBottom:16,
            background:'white', border:'1.5px solid #e2e8f0', borderRadius:8,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            fontSize:13, fontFamily:'var(--font-sans)', color:'#374151',
            transition:'border-color 150ms',
          }}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor='#94a3b8'}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor='#e2e8f0'}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M17.64 9.2c0-.637-.057-1.252-.164-1.84H9v3.48h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Demo quick access (subtle) */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:8.5, color:'#cbd5e1', letterSpacing:'0.08em', fontFamily:'var(--font-sans)', textAlign:'center', marginBottom:8 }}>
              DEMO ACCESS
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
              {DEMO_CREDS.map(c=>(
                <button key={c.label} type="button" onClick={()=>quickLogin(c)} disabled={loading}
                  style={{
                    padding:'7px 4px', background:'#f8fafc',
                    border:'1px solid #e2e8f0', borderRadius:7,
                    cursor:loading?'not-allowed':'pointer',
                    fontSize:8.5, fontWeight:700, color:c.color,
                    fontFamily:'var(--font-mono)', letterSpacing:'0.08em',
                    transition:'all 140ms', opacity:loading?0.5:1,
                  }}
                  onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor=c.color;el.style.transform='translateY(-1px)'}}
                  onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='#e2e8f0';el.style.transform=''}}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trust indicators */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
            {[
              { icon:'🔒', title:'Secure & Encrypted', sub:'Authentication' },
              { icon:'👥', title:'Authorized', sub:'Access Only' },
              { icon:'🛡', title:'Your Data', sub:'Stays Protected' },
            ].map(t=>(
              <div key={t.title} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                padding:'8px 4px', background:'#f8fafc', border:'1px solid #f1f5f9', borderRadius:8 }}>
                <span style={{ fontSize:15 }}>{t.icon}</span>
                <span style={{ fontSize:8, fontWeight:600, color:'#374151', fontFamily:'var(--font-sans)', textAlign:'center', lineHeight:1.3 }}>{t.title}</span>
                <span style={{ fontSize:7.5, color:'#94a3b8', fontFamily:'var(--font-sans)', textAlign:'center' }}>{t.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* India Gate footer */}
        <div style={{ padding:'0 24px 20px', flexShrink:0, borderTop:'1px solid #f1f5f9', paddingTop:16 }}>
          <IndiaGateSilhouette/>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
            <svg width="24" height="22" viewBox="0 0 42 38" fill="none" aria-hidden>
              <path d="M4 34 L34 19 L4 8 L10 19 Z" fill="#3b82f6"/>
              <path d="M10 19 L4 34 L16 25 Z" fill="#1d4ed8"/>
              <path d="M10 19 L16 25 L34 19 Z" fill="#60a5fa" opacity="0.7"/>
            </svg>
            <div>
              <div style={{ display:'flex', gap:0 }}>
                <span style={{ fontSize:12, fontWeight:800, color:'#0f172a', fontFamily:'var(--font-sans)' }}>Aero</span>
                <span style={{ fontSize:12, fontWeight:800, color:'#2563eb', fontFamily:'var(--font-sans)' }}>Price</span>
              </div>
              <div style={{ fontSize:7.5, color:'#94a3b8', fontFamily:'var(--font-sans)', lineHeight:1.5 }}>
                India Airfare Intelligence Platform<br/>
                Smart India Hackathon 2026 Prototype
              </div>
              <div style={{ fontSize:7, color:'#cbd5e1', fontFamily:'var(--font-sans)', fontStyle:'italic', marginTop:2 }}>
                "Data for a more connected India. Through insights, for a better tomorrow."
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
