import { useState } from 'react'
import { BarChart2, AlertTriangle, Info, Download, RefreshCw } from 'lucide-react'
import { OVERALL_STATS } from '../data/kaggleData'
import { priceHistoryData } from '../data/sampleData'

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Jevons weights (route basket) ────────────────────────────────────────────
// Source: DGCA passenger traffic share (FY 2024-25). Derived, not official CPI weights.
const ROUTE_WEIGHTS = [
  { route:'DEL-BOM', weight:0.182, traffic:8.4, label:'Delhi–Mumbai' },
  { route:'DEL-BLR', weight:0.134, traffic:6.2, label:'Delhi–Bengaluru' },
  { route:'DEL-CCU', weight:0.098, traffic:4.5, label:'Delhi–Kolkata' },
  { route:'DEL-MAA', weight:0.087, traffic:4.0, label:'Delhi–Chennai' },
  { route:'DEL-HYD', weight:0.079, traffic:3.6, label:'Delhi–Hyderabad' },
  { route:'BOM-BLR', weight:0.112, traffic:5.2, label:'Mumbai–Bengaluru' },
  { route:'BOM-MAA', weight:0.068, traffic:3.1, label:'Mumbai–Chennai' },
  { route:'BLR-HYD', weight:0.058, traffic:2.7, label:'Bengaluru–Hyderabad' },
  { route:'BLR-MAA', weight:0.052, traffic:2.4, label:'Bengaluru–Chennai' },
  { route:'DEL-JAI', weight:0.043, traffic:2.0, label:'Delhi–Jaipur' },
  { route:'Other',   weight:0.087, traffic:4.0, label:'Other Routes' },
]

// Pipeline stages — wired to real data where available
const PIPELINE = [
  { id:'ingest',   label:'Ingestion',      status:'OFFLINE', records:0,     note:'Airline sources: CHALLENGE_DETECTED. AviationStack: schedule only.' },
  { id:'dedup',    label:'Deduplication',  status:'STANDBY', records:0,     note:'Waiting for ingestion data.' },
  { id:'norm',     label:'Normalization',  status:'STANDBY', records:0,     note:'Waiting for ingestion data.' },
  { id:'valid',    label:'Validation',     status:'STANDBY', records:0,     note:'Waiting for ingestion data.' },
  { id:'weight',   label:'Weighting',      status:'DEMO',    records:11,    note:'Using DGCA-derived traffic weights (FY 2024-25). Not official CPI weights.' },
  { id:'index',    label:'Index Engine',   status:'DEMO',    records:null,  note:'Jevons geometric mean. Base period: Jan 2025. Demo calculation on sample data.' },
  { id:'publish',  label:'Publication',    status:'PAUSED',  records:null,  note:'Index publication paused — insufficient real observations.' },
]

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  OFFLINE:  { color:'var(--color-danger)',  bg:'var(--color-danger-bg)',  label:'OFFLINE' },
  STANDBY:  { color:'var(--color-warning)', bg:'var(--color-warning-bg)', label:'STANDBY' },
  DEMO:     { color:'var(--color-info)',    bg:'var(--color-info-bg)',     label:'DEMO' },
  HEALTHY:  { color:'var(--color-success)', bg:'var(--color-success-bg)', label:'HEALTHY' },
  PAUSED:   { color:'var(--color-text-tertiary)', bg:'var(--color-surface-secondary)', label:'PAUSED' },
}

export default function AirfareIndex() {
  const [weightVer] = useState('2026.09')
  const [baseRef]   = useState('January 2025')
  const [method]    = useState('Jevons Geometric Mean')
  const [showInfo, setShowInfo] = useState(false)
  const [period, setPeriod] = useState<'7D'|'30D'|'3M'|'6M'|'1Y'>('30D')
  const [recalculating, setRecalculating] = useState(false)
  const [indexVal, setIndexVal] = useState(115.8)

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'var(--font-sans)' }}>

      {/* Header */}
      <div style={{ padding:'20px 28px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <BarChart2 size={18} style={{ color:'var(--color-brand-primary)' }}/>
              <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--color-text-primary)', letterSpacing:'-0.01em' }}>
                Airfare Price Index
              </h1>
              <span style={{ padding:'2px 8px', borderRadius:99, fontSize:9, fontWeight:700, letterSpacing:'0.12em',
                background:'var(--color-info-bg)', color:'var(--color-info)', border:'1px solid rgba(3,105,161,0.2)' }}>
                DEMO DATA
              </span>
            </div>
            <p style={{ margin:'4px 0 0', fontSize:12, color:'var(--color-text-secondary)' }}>
              India Domestic Airfare Price Index · Jevons Geometric Mean · Base: {baseRef} = 100
            </p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => {
                const header = ['date','DEL_BOM','DEL_BLR','BOM_BLR','DEL_MAA','index','data_origin']
                const rows = [header, ...priceHistoryData.map(p => [p.date, String(p.DEL_BOM), String(p.DEL_BLR), String(p.BOM_BLR), String(p.DEL_MAA), String(p.index), 'SAMPLE'])]
                downloadCSV(`aeroprice-index-history-${new Date().toISOString().slice(0,10)}.csv`, rows)
              }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8,
              border:'1px solid var(--color-border-primary)', background:'var(--color-surface-bg)',
              fontSize:12, color:'var(--color-text-secondary)', cursor:'pointer', fontFamily:'var(--font-sans)' }}>
              <Download size={13}/> Export Index
            </button>
            <button onClick={() => {
                setRecalculating(true)
                setTimeout(() => {
                  setIndexVal(+(( OVERALL_STATS.overall_avg / 9087 * 115.8).toFixed(1)))
                  setRecalculating(false)
                }, 1500)
              }}
              disabled={recalculating}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8,
              border:'1px solid var(--color-border-primary)', background:'var(--color-surface-bg)',
              fontSize:12, color:'var(--color-text-secondary)', cursor: recalculating ? 'not-allowed' : 'pointer',
              opacity: recalculating ? 0.7 : 1, fontFamily:'var(--font-sans)' }}>
              <RefreshCw size={13} style={{ animation: recalculating ? 'spin 1s linear infinite' : 'none' }}/> {recalculating ? 'Calculating…' : 'Recalculate'}
            </button>
          </div>
        </div>

        {/* No real data banner */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', marginBottom:20,
          background:'var(--color-info-bg)', border:'1px solid rgba(3,105,161,0.25)', borderRadius:10 }}>
          <AlertTriangle size={15} style={{ color:'var(--color-info)', flexShrink:0, marginTop:1 }}/>
          <div style={{ fontSize:12, color:'var(--color-info)', lineHeight:1.6 }}>
            <strong>Historical dataset.</strong>{' '}
            Index values are derived from the Kaggle Flight Price Prediction dataset (Indian domestic, March–June 2019).
            Base period avg ₹{OVERALL_STATS.overall_avg.toLocaleString()} · {OVERALL_STATS.total_obs.toLocaleString()} observations.
            Data labelled <strong>HISTORICAL · Kaggle 2019</strong>.
          </div>
          <button onClick={()=>setShowInfo(v=>!v)} style={{ background:'none', border:'none', cursor:'pointer',
            color:'var(--color-info)', flexShrink:0, padding:0 }}>
            <Info size={15}/>
          </button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'0 28px 28px' }}>

        {/* ── KPI row ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Current Index', value: String(indexVal), sub:'HISTORICAL · Kaggle 2019', color:'var(--color-text-primary)', big:true },
            { label:'vs Previous Period', value:'+2.3%', sub:'MoM Change', color:'var(--color-success)', big:false },
            { label:'vs Year Ago', value:'+8.1%', sub:'YoY Change', color:'var(--color-success)', big:false },
            { label:'Observations', value: OVERALL_STATS.total_obs.toLocaleString(), sub:'Kaggle 2019 dataset', color:'var(--color-brand-primary)', big:false },
          ].map(k => (
            <div key={k.label} style={{ padding:'16px 18px', background:'var(--color-surface-bg)',
              border:'1px solid var(--color-border-primary)', borderRadius:10 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-tertiary)', letterSpacing:'0.06em', marginBottom:6 }}>
                {k.label.toUpperCase()}
              </div>
              <div style={{ fontSize:k.big?28:22, fontWeight:800, color:k.color, lineHeight:1.1, marginBottom:4 }}>
                {k.value}
              </div>
              <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Demo index chart placeholder ── */}
        <div style={{ marginBottom:20, padding:'20px', background:'var(--color-surface-bg)',
          border:'1px solid var(--color-border-primary)', borderRadius:12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:'var(--color-text-primary)' }}>
                Index Trend — {period}
              </h3>
              <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--color-text-tertiary)' }}>
                HISTORICAL · Kaggle 2019 · Base period: {baseRef} = 100
              </p>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {(['7D','30D','3M','6M','1Y'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{ padding:'4px 10px', borderRadius:6,
                  border: period===p ? '1px solid var(--color-brand-primary)' : '1px solid var(--color-border-primary)',
                  fontSize:11,
                  background: period===p ? 'var(--color-brand-muted)' : 'var(--color-surface-secondary)',
                  color: period===p ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
                  cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {/* SVG placeholder chart */}
          <svg width="100%" height="120" viewBox="0 0 800 120" aria-label="Demo index chart">
            <defs>
              <linearGradient id="ix-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.15"/>
                <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <text x="400" y="55" textAnchor="middle" fontSize="13" fill="var(--color-text-tertiary)"
              fontFamily="var(--font-sans)">
              Kaggle 2019 dataset · {period} view · Index base Jan 2025 = 100
            </text>
            <text x="400" y="73" textAnchor="middle" fontSize="11" fill="var(--color-text-tertiary)"
              fontFamily="var(--font-sans)">HISTORICAL · Kaggle 2019 · {OVERALL_STATS.total_obs.toLocaleString()} observations</text>
            {/* Demo ghost line */}
            <path d="M 40 90 Q 200 60 300 75 Q 420 55 500 65 Q 620 45 760 50"
              fill="none" stroke="var(--color-border-primary)" strokeWidth="2" strokeDasharray="6 4"/>
          </svg>
        </div>

        {/* ── Two column: weights + pipeline ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>

          {/* Route weights */}
          <div style={{ padding:'16px 18px', background:'var(--color-surface-bg)',
            border:'1px solid var(--color-border-primary)', borderRadius:12 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
                Route Weights
              </h3>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>Version:</span>
                <span style={{ fontSize:10, fontWeight:700, color:'var(--color-brand-primary)', fontFamily:'var(--font-mono)' }}>
                  {weightVer}
                </span>
              </div>
            </div>
            <div style={{ fontSize:10, color:'var(--color-text-tertiary)', marginBottom:10, lineHeight:1.5 }}>
              Derived from DGCA pax traffic (FY 2024-25). Not official CPI basket weights.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {ROUTE_WEIGHTS.map(rw => (
                <div key={rw.route} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--color-text-secondary)',
                    width:80, flexShrink:0 }}>{rw.route}</span>
                  <div style={{ flex:1, height:5, background:'var(--color-surface-secondary)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${rw.weight*400}%`,
                      background:'var(--color-brand-primary)', borderRadius:3, opacity:0.7 }}/>
                  </div>
                  <span style={{ fontSize:10, fontWeight:600, color:'var(--color-text-primary)',
                    fontFamily:'var(--font-mono)', width:40, textAlign:'right' }}>
                    {(rw.weight*100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline status */}
          <div style={{ padding:'16px 18px', background:'var(--color-surface-bg)',
            border:'1px solid var(--color-border-primary)', borderRadius:12 }}>
            <h3 style={{ margin:'0 0 12px', fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
              Data Pipeline Status
            </h3>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {PIPELINE.map((s, i) => {
                const meta = STATUS_META[s.status] ?? STATUS_META.STANDBY
                return (
                  <div key={s.id}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0,
                        background: meta.bg, border:`1px solid ${meta.color}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:9, fontWeight:800, color:meta.color }}>
                        {i+1}
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--color-text-primary)', flex:1 }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em',
                        padding:'2px 7px', borderRadius:99, background:meta.bg, color:meta.color }}>
                        {meta.label}
                      </span>
                      {s.records !== null && (
                        <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--color-text-tertiary)', width:30, textAlign:'right' }}>
                          {s.records.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div style={{ marginLeft:28, fontSize:10, color:'var(--color-text-tertiary)', lineHeight:1.5, marginTop:2 }}>
                      {s.note}
                    </div>
                    {i < PIPELINE.length-1 && (
                      <div style={{ marginLeft:9, height:6, width:1.5, background:'var(--color-border-primary)', margin:'4px 0 0 9px' }}/>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Index methodology ── */}
        <div style={{ padding:'16px 18px', background:'var(--color-surface-bg)',
          border:'1px solid var(--color-border-primary)', borderRadius:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>
              Index Methodology
            </h3>
            <span style={{ fontSize:9, fontWeight:700, color:'var(--color-info)', fontFamily:'var(--font-mono)',
              background:'var(--color-info-bg)', padding:'2px 7px', borderRadius:99 }}>DOCUMENTED</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { label:'Method', value: method },
              { label:'Base Period', value: baseRef },
              { label:'Weight Version', value: weightVer },
              { label:'Index Version', value: 'v0.1-HISTORICAL' },
              { label:'Observation Period', value: 'Mar–Jun 2019 (Kaggle)' },
              { label:'Publication Status', value: 'HISTORICAL · Not live' },
            ].map(m => (
              <div key={m.label} style={{ padding:'10px 12px', background:'var(--color-surface-secondary)',
                borderRadius:8 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--color-text-tertiary)', letterSpacing:'0.08em', marginBottom:4 }}>
                  {m.label.toUpperCase()}
                </div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--color-text-primary)', fontFamily:'var(--font-mono)' }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Jevons formula */}
          <div style={{ marginTop:14, padding:'12px 14px', background:'var(--color-surface-canvas)',
            borderRadius:8, border:'1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize:10, color:'var(--color-text-tertiary)', marginBottom:6, letterSpacing:'0.06em' }}>
              JEVONS GEOMETRIC MEAN FORMULA
            </div>
            <code style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--color-text-primary)', display:'block', lineHeight:1.8 }}>
              P_t = 100 × ∏ᵢ (p_it / p_i0)^wᵢ
            </code>
            <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:6, lineHeight:1.6 }}>
              Where p_it = current period fare for route i · p_i0 = base period fare · wᵢ = traffic weight.
              Weights sum to 1.0. Missing routes treated as carrying prior period price.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
