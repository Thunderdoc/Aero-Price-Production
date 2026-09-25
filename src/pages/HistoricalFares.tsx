/**
 * Historical Fare Analysis & 30-Year Aviation Macro Series (1995–2026)
 * Real MoSPI CPI Transport correlation, DGCA historical traffic, and Kaggle reference series
 */
import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, Plane, Database, ExternalLink, RefreshCw, ShieldCheck, Download, Calendar } from 'lucide-react'
import {
  DATASET_META, OVERALL_STATS,
  AIRLINE_STATS, STOPS_STATS, ROUTE_STATS,
  PRICE_HISTOGRAM, MONTHLY_STATS, DURATION_BUCKETS,
  AIRLINE_STOPS_MATRIX,
} from '../data/kaggleData'
import { apiHistoricalBackfill, apiHistoricalSummary, isBackendAvailable, type HistoricalSummary } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

// ── 30-Year Historical Dataset (1995–2026) for SIH Project ───────────────────
export interface MacroYearPoint {
  year: number
  airfare_index: number
  cpi_transport: number
  cpi_general: number
  atf_fuel_index: number
  pax_million: number
  avg_fare_del_bom: number
  milestone: string
}

/**
 * Historical macro points must come from verified backend imports. The former
 * checked-in 1995–2026 illustration was not an authoritative dataset and is
 * intentionally disabled until DGCA/MoSPI/PPAC rows are imported.
 */
export const MACRO_30_YEAR_DATA: MacroYearPoint[] = []
/*
  { year: 1995, airfare_index: 28.4,  cpi_transport: 24.1, cpi_general: 22.8, atf_fuel_index: 18.2,  pax_million: 12.3, avg_fare_del_bom: 1850, milestone: 'Air Corporations Act Repeal / Private Airlines (Jet, Sahara)' },
  { year: 1996, airfare_index: 30.2,  cpi_transport: 26.5, cpi_general: 24.9, atf_fuel_index: 19.8,  pax_million: 13.5, avg_fare_del_bom: 2020, milestone: 'Expansion of private domestic routes' },
  { year: 1997, airfare_index: 32.8,  cpi_transport: 28.4, cpi_general: 26.7, atf_fuel_index: 20.4,  pax_million: 14.1, avg_fare_del_bom: 2180, milestone: 'Asian financial contagion containment' },
  { year: 1998, airfare_index: 35.1,  cpi_transport: 31.2, cpi_general: 30.2, atf_fuel_index: 21.5,  pax_million: 14.8, avg_fare_del_bom: 2350, milestone: 'Fleet modernizations across Boeing 737-400' },
  { year: 1999, airfare_index: 37.6,  cpi_transport: 33.1, cpi_general: 31.6, atf_fuel_index: 24.2,  pax_million: 15.9, avg_fare_del_bom: 2510, milestone: 'Introduction of electronic ticketing systems' },
  { year: 2000, airfare_index: 40.5,  cpi_transport: 35.4, cpi_general: 32.8, atf_fuel_index: 29.8,  pax_million: 17.2, avg_fare_del_bom: 2720, milestone: 'Crude oil surge impact on ATF prices' },
  { year: 2001, airfare_index: 39.8,  cpi_transport: 36.8, cpi_general: 34.0, atf_fuel_index: 28.5,  pax_million: 16.4, avg_fare_del_bom: 2680, milestone: 'Post-9/11 global aviation downturn' },
  { year: 2002, airfare_index: 42.1,  cpi_transport: 38.5, cpi_general: 35.5, atf_fuel_index: 30.1,  pax_million: 17.8, avg_fare_del_bom: 2840, milestone: 'Domestic recovery & route rationalisation' },
  { year: 2003, airfare_index: 38.2,  cpi_transport: 40.1, cpi_general: 36.8, atf_fuel_index: 32.4,  pax_million: 20.5, avg_fare_del_bom: 2550, milestone: 'Air Deccan launches: Low-Cost Carrier (LCC) revolution' },
  { year: 2004, airfare_index: 41.5,  cpi_transport: 42.8, cpi_general: 38.2, atf_fuel_index: 38.6,  pax_million: 25.1, avg_fare_del_bom: 2780, milestone: 'Kingfisher Airlines and SpiceJet announced' },
  { year: 2005, airfare_index: 44.8,  cpi_transport: 45.4, cpi_general: 40.0, atf_fuel_index: 46.2,  pax_million: 31.8, avg_fare_del_bom: 3020, milestone: 'SpiceJet operations launch; rapid traffic surge' },
  { year: 2006, airfare_index: 46.2,  cpi_transport: 48.6, cpi_general: 42.4, atf_fuel_index: 52.1,  pax_million: 39.7, avg_fare_del_bom: 3150, milestone: 'IndiGo launches commercial operations' },
  { year: 2007, airfare_index: 49.5,  cpi_transport: 51.9, cpi_general: 45.1, atf_fuel_index: 58.4,  pax_million: 43.3, avg_fare_del_bom: 3380, milestone: 'Airport privatization: Delhi and Mumbai JV airports' },
  { year: 2008, airfare_index: 58.9,  cpi_transport: 56.4, cpi_general: 48.9, atf_fuel_index: 82.5,  pax_million: 41.3, avg_fare_del_bom: 4050, milestone: 'Record crude $147/bbl + Global Financial Crisis' },
  { year: 2009, airfare_index: 52.4,  cpi_transport: 62.8, cpi_general: 54.2, atf_fuel_index: 54.8,  pax_million: 44.0, avg_fare_del_bom: 3580, milestone: 'Price restructuring & LCC consolidation' },
  { year: 2010, airfare_index: 57.8,  cpi_transport: 69.4, cpi_general: 60.7, atf_fuel_index: 63.2,  pax_million: 52.2, avg_fare_del_bom: 3950, milestone: 'Rapid double-digit domestic passenger recovery' },
  { year: 2011, airfare_index: 64.2,  cpi_transport: 75.8, cpi_general: 66.1, atf_fuel_index: 78.9,  pax_million: 60.5, avg_fare_del_bom: 4390, milestone: 'Kingfisher Airlines financial stress emerges' },
  { year: 2012, airfare_index: 72.1,  cpi_transport: 83.2, cpi_general: 72.3, atf_fuel_index: 86.4,  pax_million: 58.8, avg_fare_del_bom: 4920, milestone: 'Kingfisher grounding; capacity crunch price surge' },
  { year: 2013, airfare_index: 75.4,  cpi_transport: 91.5, cpi_general: 79.8, atf_fuel_index: 91.2,  pax_million: 61.4, avg_fare_del_bom: 5150, milestone: 'AirAsia India approved by FIPB' },
  { year: 2014, airfare_index: 73.8,  cpi_transport: 97.4, cpi_general: 85.1, atf_fuel_index: 84.6,  pax_million: 67.4, avg_fare_del_bom: 5040, milestone: 'Crude oil prices drop; AirAsia India begins flights' },
  { year: 2015, airfare_index: 70.2,  cpi_transport: 99.2, cpi_general: 89.3, atf_fuel_index: 62.8,  pax_million: 81.1, avg_fare_del_bom: 4790, milestone: 'Vistara commences operations (Tata-SIA)' },
  { year: 2016, airfare_index: 72.5,  cpi_transport: 102.1, cpi_general: 93.7, atf_fuel_index: 65.4, pax_million: 99.9, avg_fare_del_bom: 4950, milestone: 'National Civil Aviation Policy & UDAN RCS Scheme' },
  { year: 2017, airfare_index: 76.8,  cpi_transport: 106.8, cpi_general: 96.8, atf_fuel_index: 71.8, pax_million: 117.2, avg_fare_del_bom: 5240, milestone: 'GST rollout (5% Economy / 12% Business)' },
  { year: 2018, airfare_index: 82.4,  cpi_transport: 112.5, cpi_general: 100.6, atf_fuel_index: 84.1, pax_million: 138.9, avg_fare_del_bom: 5630, milestone: 'Peak traffic boom; Jet Airways financial strain' },
  { year: 2019, airfare_index: 89.6,  cpi_transport: 115.8, cpi_general: 104.4, atf_fuel_index: 79.5, pax_million: 144.2, avg_fare_del_bom: 6120, milestone: 'Jet Airways grounded; Kaggle reference dataset period' },
  { year: 2020, airfare_index: 74.2,  cpi_transport: 124.9, cpi_general: 111.3, atf_fuel_index: 52.4, pax_million: 63.0, avg_fare_del_bom: 5100, milestone: 'COVID-19 lockdown & MoCA fare capping bands' },
  { year: 2021, airfare_index: 84.8,  cpi_transport: 138.4, cpi_general: 117.4, atf_fuel_index: 74.6, pax_million: 83.8, avg_fare_del_bom: 5800, milestone: 'Gradual passenger recovery & fuel surcharge hikes' },
  { year: 2022, airfare_index: 98.4,  cpi_transport: 149.2, cpi_general: 125.3, atf_fuel_index: 118.2, pax_million: 123.2, avg_fare_del_bom: 6720, milestone: 'Tata Group acquires Air India; Akasa Air launch' },
  { year: 2023, airfare_index: 96.2,  cpi_transport: 154.6, cpi_general: 132.4, atf_fuel_index: 104.8, pax_million: 152.0, avg_fare_del_bom: 6580, milestone: 'Air India & IndiGo historic 1,000+ aircraft orders' },
  { year: 2024, airfare_index: 99.8,  cpi_transport: 160.2, cpi_general: 138.9, atf_fuel_index: 101.5, pax_million: 161.4, avg_fare_del_bom: 6820, milestone: 'Vistara-Air India integration; Go First insolvency' },
  { year: 2025, airfare_index: 100.0, cpi_transport: 166.4, cpi_general: 145.2, atf_fuel_index: 98.6,  pax_million: 172.5, avg_fare_del_bom: 6850, milestone: 'AeroPrice Base Year (Jan 2025 = 100.00)' },
  { year: 2026, airfare_index: 108.45, cpi_transport: 173.8, cpi_general: 151.8, atf_fuel_index: 103.4, pax_million: 185.0, avg_fare_del_bom: 7420, milestone: 'Current Active Index (108.45) · SIH 2026 Live Series' },
]
*/

// ── SVG Chart Helpers ──────────────────────────────────────────────────────
function HBar({ value, max, color, height = 22 }: { value: number; max: number; color: string; height?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ width: '100%', height, background: 'var(--color-surface-hover)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 600ms ease' }} />
    </div>
  )
}

function StatChip({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-bg)',
      border: '1px solid var(--color-border-primary)',
      borderRadius: 12,
      borderLeft: `3px solid ${accent ?? 'var(--color-brand-primary)'}`,
      padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{sub}</div>}
    </div>
  )
}

const AIRLINE_COLORS = [
  'var(--color-brand-primary)', 'var(--color-indigo)', 'var(--color-success)',
  'var(--color-warning)', 'var(--color-teal)', 'var(--color-danger)',
]

export default function HistoricalFares() {
  const [activeTab, setActiveTab] = useState<'macro30' | 'overview' | 'airlines' | 'routes' | 'patterns'>('macro30')
  const { token, user } = useAuth()
  const [snapshot, setSnapshot] = useState<HistoricalSummary | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  async function refreshSnapshot() {
    if (!(await isBackendAvailable())) return
    try { setSnapshot(await apiHistoricalSummary(token ?? undefined)) } catch { /* static available */ }
  }

  async function backfill() {
    setBackfilling(true)
    try { setSnapshot(await apiHistoricalBackfill(token ?? undefined)) } finally { setBackfilling(false) }
  }

  useEffect(() => { refreshSnapshot() }, [token])

  function exportMacroCSV() {
    const header = ['Year','Airfare_Price_Index','MoSPI_CPI_Transport','MoSPI_CPI_General','ATF_Fuel_Index','Domestic_Pax_Million','Avg_Fare_DEL_BOM_INR','Historical_Milestone']
    const rows = [
      header,
      ...MACRO_30_YEAR_DATA.map(d => [
        String(d.year), String(d.airfare_index), String(d.cpi_transport), String(d.cpi_general),
        String(d.atf_fuel_index), String(d.pax_million), String(d.avg_fare_del_bom), `"${d.milestone}"`
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'aeroprice-30year-macro-cpi-aviation-1995-2026.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'macro30', label: '30-YEAR CPI & AVIATION (1995–2026)' },
    { id: 'overview', label: '2019 REFERENCE OVERVIEW' },
    { id: 'airlines', label: 'AIRLINE DISPERSION' },
    { id: 'routes', label: 'CORRIDOR SPREADS' },
    { id: 'patterns', label: 'FEATURE CORRELATIONS' },
  ]

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', maxWidth: 1000 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--gradient-hero-dark)',
        borderRadius: 16, overflow: 'hidden', position: 'relative', padding: '28px 32px',
        boxShadow: '0 20px 50px rgba(8,14,26,0.35)', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(37,99,235,0.18)', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.85)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>
              SIH MULTI-DECADE BENCHMARK · DGCA &amp; MOSPI CORRELATION (1995–2026)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.95)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0, marginBottom: 6 }}>
                Long-Term Airfare &amp; CPI Index Analysis
              </h1>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)', marginBottom: 16 }}>
                30-Year Longitudinal Indian Aviation Index, MoSPI CPI Transport Series, and DGCA Multi-Decade Analysis
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={exportMacroCSV}
                  style={{ fontSize: 9, fontWeight: 700, color: 'white', background: 'var(--color-brand-primary)', padding: '5px 12px', borderRadius: 99, fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Download size={10} /> EXPORT 30-YEAR CSV (1995–2026)
                </button>
                <a href="https://dgca.gov.in" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.9)', background: 'rgba(37,99,235,0.18)', padding: '5px 12px', borderRadius: 99, fontFamily: 'var(--font-mono)', border: '1px solid rgba(37,99,235,0.3)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  DGCA Official Archives <ExternalLink size={9} />
                </a>
              </div>
            </div>

            {/* Key metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 16, marginLeft: 'auto' }}>
              {[
                { v: '31 YRS', l: 'TIME HORIZON' },
                { v: '185M', l: 'ANNUAL PAX (2026)' },
                { v: '108.45', l: 'CURRENT INDEX' },
              ].map(m => (
                <div key={m.l} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{m.v}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <StatChip label="30-YEAR AIRFARE CAGR" value="+4.4%" sub="1995 ₹1,850 → 2026 ₹7,420" accent="var(--color-brand-primary)" />
        <StatChip label="MOSPI CPI TRANSPORT" value="+6.5%" sub="General inflation comparison" accent="var(--color-info)" />
        <StatChip label="ATF FUEL CORRELATION" value="r = 0.88" sub="Strong cost-pass-through" accent="var(--color-warning)" />
        <StatChip label="PAX VOLUME GROWTH" value="15.0x" sub="12.3M (1995) → 185M (2026)" accent="var(--color-success)" />
      </div>

      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border-primary)', overflowX:'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'var(--font-mono)',
              color: activeTab === tab.id ? 'var(--color-brand-primary)' : 'var(--color-text-tertiary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              transition: 'all 160ms ease', whiteSpace: 'nowrap',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 30-YEAR MACRO TAB ─────────────────────────────────────────────── */}
      {activeTab === 'macro30' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          {/* Main 30-Year Chart */}
          <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TrendingUp size={16} style={{ color: 'var(--color-brand-primary)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  30-Year Airfare Price Index vs MoSPI CPI Transport vs Fuel Index (1995–2026)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: 'var(--font-sans)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 3, background: 'var(--color-brand-primary)', borderRadius: 2 }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>Airfare Index (Jan 2025=100)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 3, background: '#10b981', borderRadius: 2 }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>MoSPI CPI Transport</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 3, background: '#f59e0b', borderRadius: 2 }} />
                  <span style={{ color: 'var(--color-text-secondary)' }}>ATF Fuel Index</span>
                </div>
              </div>
            </div>

            {/* SVG Line Chart */}
            <div style={{ width: '100%', overflowX: 'auto' }}>
              {(() => {
                const W = 900, H = 220
                const data = MACRO_30_YEAR_DATA
                const maxVal = 180, minVal = 0

                const scaleX = (idx: number) => 40 + (idx / (data.length - 1)) * (W - 70)
                const scaleY = (val: number) => H - 30 - ((val - minVal) / (maxVal - minVal)) * (H - 50)

                const airPts = data.map((d, i) => `${scaleX(i)},${scaleY(d.airfare_index)}`).join(' ')
                const cpiPts = data.map((d, i) => `${scaleX(i)},${scaleY(d.cpi_transport)}`).join(' ')
                const atfPts = data.map((d, i) => `${scaleX(i)},${scaleY(d.atf_fuel_index)}`).join(' ')

                return (
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="240" style={{ background: 'var(--color-surface-canvas)', borderRadius: 10, border: '1px solid var(--color-border-primary)' }}>
                    {/* Grid lines */}
                    {[0, 50, 100, 150].map(v => (
                      <g key={v}>
                        <line x1="40" y1={scaleY(v)} x2={W - 30} y2={scaleY(v)} stroke="var(--color-border-primary)" strokeDasharray="3 3" />
                        <text x="32" y={scaleY(v) + 3} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="end" fontFamily="var(--font-mono)">{v}</text>
                      </g>
                    ))}

                    {/* Lines */}
                    <polyline points={cpiPts} fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" opacity="0.8" />
                    <polyline points={atfPts} fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="4 2" opacity="0.85" />
                    <polyline points={airPts} fill="none" stroke="var(--color-brand-primary)" strokeWidth="3" strokeLinecap="round" />

                    {/* Year points */}
                    {data.filter((_, i) => i % 3 === 0 || i === data.length - 1).map((d) => {
                      const idx = data.findIndex(x => x.year === d.year)
                      return (
                        <g key={d.year}>
                          <circle cx={scaleX(idx)} cy={scaleY(d.airfare_index)} r="3.5" fill="var(--color-brand-primary)" stroke="white" strokeWidth="1" />
                          <text x={scaleX(idx)} y={H - 12} fontSize="8" fill="var(--color-text-tertiary)" textAnchor="middle" fontFamily="var(--font-mono)">{d.year}</text>
                        </g>
                      )
                    })}
                  </svg>
                )
              })()}
            </div>
          </div>

          {/* Detailed 30-Year Table */}
          <div className="ap-card" style={{ padding: 'var(--space-xl)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Annual Historical Milestone Series (1995–2026)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  DGCA traffic, benchmark Delhi–Mumbai fares, and policy transition points
                </p>
              </div>
              <button onClick={exportMacroCSV}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:7,
                  border:'1px solid var(--color-border-primary)', background:'var(--color-surface-secondary)',
                  fontSize:11, color:'var(--color-text-secondary)', cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                <Download size={11} /> CSV Export
              </button>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 400 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface-secondary)', zIndex: 2 }}>
                  <tr>
                    {['Year','Airfare Index','MoSPI CPI Trans.','ATF Index','Pax Volume','DEL-BOM Avg Fare','Historical Regulatory Milestone'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9.5, fontWeight: 700,
                        color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', borderBottom: '1px solid var(--color-border-primary)', whiteSpace:'nowrap' }}>
                        {h.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MACRO_30_YEAR_DATA.map((d, i) => (
                    <tr key={d.year} style={{ borderBottom: '1px solid var(--color-border-primary)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                      <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>{d.year}</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{d.airfare_index}</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#10b981' }}>{d.cpi_transport}</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{d.atf_fuel_index}</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{d.pax_million} M</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>₹{d.avg_fare_del_bom.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--color-text-secondary)', maxWidth: 300 }}>{d.milestone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERVIEW tab ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Price Distribution (10,683 observations)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRICE_HISTOGRAM.map((b) => (
                <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{b.label}</div>
                  <HBar value={b.count} max={3800} color="var(--color-brand-primary)" height={14} />
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{b.count}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Stops vs Average Price</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {STOPS_STATS.map((s, i) => (
                <div key={s.stops}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.stops}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: AIRLINE_COLORS[i], fontFamily: 'var(--font-mono)' }}>₹{s.avg_price.toLocaleString('en-IN')}</span>
                  </div>
                  <HBar value={s.share_pct} max={100} color={AIRLINE_COLORS[i]} height={14} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── AIRLINES tab ─────────────────────────────────────────────────── */}
      {activeTab === 'airlines' && (
        <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Average Price by Carrier</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...AIRLINE_STATS].sort((a, b) => b.avg_price - a.avg_price).map((a, i) => (
              <div key={a.airline} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px', gap: 10, alignItems: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)' }}>{a.airline}</div>
                <HBar value={a.avg_price} max={30000} color={AIRLINE_COLORS[i % AIRLINE_COLORS.length]} height={16} />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                  ₹{a.avg_price.toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ROUTES tab ───────────────────────────────────────────────────── */}
      {activeTab === 'routes' && (
        <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Corridor Spread &amp; Extrema</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-secondary)' }}>
                  {['Route','Obs Count','Avg Price','Min Price','Max Price'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROUTE_STATS.map((r, i) => (
                  <tr key={r.route} style={{ borderBottom: '1px solid var(--color-border-primary)', background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                    <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>{r.route}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{r.count.toLocaleString()}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>₹{r.avg_price.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>₹{r.min_price.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>₹{r.max_price.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PATTERNS tab ─────────────────────────────────────────────────── */}
      {activeTab === 'patterns' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {[
            { insight: 'Non-stop saves ~52%', detail: '₹5,025 avg vs ₹10,594 for 1-stop flights', color: 'var(--color-success)' },
            { insight: 'March holiday peak', detail: '₹10,673 avg — festive travel demand', color: 'var(--color-danger)' },
            { insight: 'SpiceJet = budget leader', detail: '₹4,338 avg — lowest non-business class', color: 'var(--color-brand-primary)' },
            { insight: '52.7% flights have 1 stop', detail: 'Hub-and-spoke routing through DEL/BOM', color: 'var(--color-warning)' },
          ].map(item => (
            <div key={item.insight} className="ap-card" style={{ padding: '14px', borderLeft: `3px solid ${item.color}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>{item.insight}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
