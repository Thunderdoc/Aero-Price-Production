/**
 * Historical Fare Analysis — Kaggle Flight Price Prediction Dataset
 * 10,683 Indian domestic fare observations, March–June 2019
 * data_origin: GENERATED_TEST — reference dataset, not real-time prices
 */
import { useState } from 'react'
import { BarChart2, TrendingUp, Plane, Database, AlertTriangle, ExternalLink } from 'lucide-react'
import {
  DATASET_META, OVERALL_STATS,
  AIRLINE_STATS, STOPS_STATS, ROUTE_STATS,
  PRICE_HISTOGRAM, MONTHLY_STATS, DURATION_BUCKETS,
  AIRLINE_STOPS_MATRIX,
  type AirlineStat,
} from '../data/kaggleData'

// ── SVG chart helpers ──────────────────────────────────────────────────────

function HBar({ value, max, color, height = 22 }: { value: number; max: number; color: string; height?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ width: '100%', height, background: 'var(--color-surface-hover)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 600ms ease' }} />
    </div>
  )
}

function VBarChart({ data, valueKey, labelKey, colorFn, height = 160 }: {
  data: Record<string, any>[]
  valueKey: string
  labelKey: string
  colorFn: (i: number, row: any) => string
  height?: number
}) {
  const max = Math.max(...data.map(d => d[valueKey]))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, paddingBottom: 28, position: 'relative' }}>
      {data.map((d, i) => {
        const pct = (d[valueKey] / max) * 100
        const barH = Math.max(4, (pct / 100) * (height - 28))
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {d[valueKey].toLocaleString('en-IN')}
            </div>
            <div style={{ width: '100%', height: barH, background: colorFn(i, d), borderRadius: '3px 3px 0 0', transition: 'height 600ms ease' }} />
            <div style={{ fontSize: 7.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', textAlign: 'center', lineHeight: 1.2, position: 'absolute', bottom: 0, width: `${100 / data.length}%`, left: `${(i / data.length) * 100}%` }}>
              {d[labelKey]}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────
function StatChip({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-bg)',
      border: '1px solid var(--color-border-primary)',
      borderRadius: 12,
      borderLeft: `3px solid ${accent ?? 'var(--color-brand-primary)'}`,
      padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ?? 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{sub}</div>}
    </div>
  )
}

// ── Airline price bar list ────────────────────────────────────────────────
const AIRLINE_COLORS = [
  'var(--color-brand-primary)',
  'var(--color-indigo)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-teal)',
  'var(--color-danger)',
  'var(--color-purple)',
  'var(--color-brand-light)',
  'var(--color-rose, #e11d48)',
]

function AirlinePriceChart() {
  const sorted = [...AIRLINE_STATS].sort((a, b) => b.avg_price - a.avg_price)
  const max = sorted[0].avg_price

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((a, i) => (
        <div key={a.airline} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 80px', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.airline}</div>
          <HBar value={a.avg_price} max={max} color={AIRLINE_COLORS[i % AIRLINE_COLORS.length]} height={20} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
            ₹{a.avg_price.toLocaleString('en-IN')}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Price histogram ───────────────────────────────────────────────────────
function PriceHistogram() {
  const max = Math.max(...PRICE_HISTOGRAM.map(b => b.count))
  const total = PRICE_HISTOGRAM.reduce((s, b) => s + b.count, 0)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, paddingBottom: 30, position: 'relative' }}>
      {PRICE_HISTOGRAM.map((b, i) => {
        const pct = (b.count / max) * 110
        const sharePct = ((b.count / total) * 100).toFixed(1)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 2 }}>
            <div style={{ fontSize: 7.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{sharePct}%</div>
            <div style={{
              width: '100%', height: pct,
              background: i <= 2
                ? 'var(--color-success)'
                : i <= 5
                  ? 'var(--color-brand-primary)'
                  : 'var(--color-warning)',
              borderRadius: '3px 3px 0 0',
              opacity: 0.85,
              transition: 'height 600ms ease',
              minHeight: 2,
            }} />
            <div style={{
              fontSize: 7, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)',
              textAlign: 'center', lineHeight: 1.2, position: 'absolute', bottom: 0,
              width: `${100 / PRICE_HISTOGRAM.length}%`,
              left: `${(i / PRICE_HISTOGRAM.length) * 100}%`,
            }}>
              {b.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Stops donut-ish pills ─────────────────────────────────────────────────
function StopsChart() {
  const colors = ['var(--color-success)', 'var(--color-brand-primary)', 'var(--color-warning)', 'var(--color-danger)']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {STOPS_STATS.map((s, i) => (
        <div key={s.stops}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{s.stops}</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{s.count.toLocaleString('en-IN')} obs</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors[i], fontFamily: 'var(--font-mono)' }}>₹{s.avg_price.toLocaleString('en-IN')} avg</span>
            </div>
          </div>
          <HBar value={s.share_pct} max={100} color={colors[i]} height={18} />
          <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>{s.share_pct}% of flights</div>
        </div>
      ))}
    </div>
  )
}

// ── Airline × Stops matrix ────────────────────────────────────────────────
function StopsMatrix() {
  const maxVal = 15000

  function Cell({ val }: { val: number | null }) {
    if (val === null) return (
      <div style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--color-surface-secondary)', fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>—</div>
    )
    const pct = Math.min(100, (val / maxVal) * 100)
    const bg = pct < 35 ? 'rgba(22,163,74,0.15)' : pct < 65 ? 'rgba(37,99,235,0.12)' : 'rgba(217,119,6,0.15)'
    const fg = pct < 35 ? 'var(--color-success)' : pct < 65 ? 'var(--color-brand-primary)' : 'var(--color-warning)'
    return (
      <div style={{ padding: '6px 10px', borderRadius: 6, background: bg, fontSize: 11, fontWeight: 700, color: fg, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
        ₹{val.toLocaleString('en-IN')}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
        <thead>
          <tr>
            <th style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textAlign: 'left', padding: '4px 10px' }}>AIRLINE</th>
            {['NON-STOP', '1 STOP', '2 STOPS'].map(h => (
              <th key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textAlign: 'center', padding: '4px 10px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AIRLINE_STOPS_MATRIX.map(row => (
            <tr key={row.airline}>
              <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', padding: '3px 10px', whiteSpace: 'nowrap' }}>{row.airline}</td>
              <td style={{ padding: 3 }}><Cell val={row.non_stop} /></td>
              <td style={{ padding: 3 }}><Cell val={row.one_stop} /></td>
              <td style={{ padding: 3 }}><Cell val={row.two_stops} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[['Budget', 'rgba(22,163,74,0.15)', 'var(--color-success)', '<₹5K avg'], ['Mid', 'rgba(37,99,235,0.12)', 'var(--color-brand-primary)', '₹5-10K avg'], ['Premium', 'rgba(217,119,6,0.15)', 'var(--color-warning)', '>₹10K avg']].map(([label, bg, fg, desc]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${fg}` }} />
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{label} ({desc})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Route comparison table ────────────────────────────────────────────────
function RouteTable() {
  const sorted = [...ROUTE_STATS].sort((a, b) => b.avg_price - a.avg_price)
  const maxAvg = sorted[0].avg_price

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 90px 90px', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--color-border-primary)' }}>
        {['ROUTE', 'N', 'AVG', 'MIN', 'MAX'].map(h => (
          <div key={h} style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{h}</div>
        ))}
      </div>
      {sorted.map((r, i) => (
        <div key={r.route}
          style={{
            display: 'grid', gridTemplateColumns: '1fr 70px 90px 90px 90px', gap: 8,
            padding: '10px 12px', borderBottom: '1px solid var(--color-border-primary)',
            background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-secondary)',
            borderRadius: 6,
          }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 3 }}>{r.route}</div>
            <div style={{ width: '80%' }}>
              <HBar value={r.avg_price} max={maxAvg} color='var(--color-brand-primary)' height={4} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>{r.count.toLocaleString()}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>₹{r.avg_price.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: 'var(--color-success)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>₹{r.min_price.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 11, color: 'var(--color-danger)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>₹{r.max_price.toLocaleString('en-IN')}</div>
        </div>
      ))}
    </div>
  )
}

// ── Duration chart ─────────────────────────────────────────────────────────
function DurationChart() {
  const max = Math.max(...DURATION_BUCKETS.map(d => d.avg_price))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {DURATION_BUCKETS.map((d, i) => (
        <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{d.label}</div>
          <HBar value={d.avg_price} max={max} color={`hsl(${220 - i * 20},70%,${55 - i * 3}%)`} height={18} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>₹{d.avg_price.toLocaleString('en-IN')}</div>
        </div>
      ))}
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>
        Strong correlation: each hour of flight adds ~₹600 to average fare.
      </div>
    </div>
  )
}

// ── Monthly trend ─────────────────────────────────────────────────────────
function MonthlyChart() {
  const maxPrice = Math.max(...MONTHLY_STATS.map(m => m.avg_price))
  const maxCount = Math.max(...MONTHLY_STATS.map(m => m.count))

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 140, paddingBottom: 30, position: 'relative' }}>
      {MONTHLY_STATS.map((m, i) => {
        const priceH = Math.max(4, (m.avg_price / maxPrice) * 100)
        const countH = Math.max(4, (m.count / maxCount) * 90)
        return (
          <div key={m.month} style={{ display: 'flex', gap: 2, alignItems: 'flex-end', flex: 1 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: 7.5, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)' }}>
                ₹{(m.avg_price / 1000).toFixed(1)}K
              </div>
              <div style={{ width: '100%', height: priceH, background: 'var(--color-brand-primary)', opacity: 0.8, borderRadius: '3px 3px 0 0' }} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: 7.5, color: 'var(--color-teal)', fontFamily: 'var(--font-mono)' }}>
                {(m.count / 1000).toFixed(1)}K
              </div>
              <div style={{ width: '100%', height: countH, background: 'var(--color-teal)', opacity: 0.7, borderRadius: '3px 3px 0 0' }} />
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)',
              position: 'absolute', bottom: 6,
              left: `${(i / MONTHLY_STATS.length) * 100}%`,
              width: `${100 / MONTHLY_STATS.length}%`,
              textAlign: 'center',
            }}>{m.month_short}</div>
          </div>
        )
      })}
      <div style={{ position: 'absolute', bottom: -22, left: 0, right: 0, display: 'flex', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-brand-primary)' }} />
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>Avg Price</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-teal)' }} />
          <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>Observations</span>
        </div>
      </div>
    </div>
  )
}

// ── Section card wrapper ──────────────────────────────────────────────────
function SectionCard({ title, subtitle, children, icon: Icon }: {
  title: string
  subtitle?: string
  children: React.ReactNode
  icon: React.ElementType
}) {
  return (
    <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--gradient-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--color-border-primary)', paddingTop: 14 }}>
        {children}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function HistoricalFares() {
  const [activeTab, setActiveTab] = useState<'overview' | 'airlines' | 'routes' | 'patterns'>('overview')

  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'airlines', label: 'AIRLINES' },
    { id: 'routes', label: 'ROUTES' },
    { id: 'patterns', label: 'PATTERNS' },
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
        <div style={{ position: 'absolute', bottom: -30, left: 80, width: 160, height: 160, borderRadius: '50%', background: 'rgba(99,102,241,0.14)', filter: 'blur(45px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          {/* Eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(147,197,253,0.7)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.7)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>
              REFERENCE DATASET · GENERATED_TEST · NOT REAL-TIME
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0, marginBottom: 6 }}>
                Historical Fare Analysis
              </h1>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)', marginBottom: 16 }}>
                Kaggle Flight Price Prediction · Indian domestic · March–June 2019
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(217,119,6,1)', background: 'rgba(217,119,6,0.18)', padding: '3px 10px', borderRadius: 99, fontFamily: 'var(--font-mono)', border: '1px solid rgba(217,119,6,0.3)' }}>
                  ⚠ GENERATED_TEST — Historical data, not live prices
                </span>
                <a href={DATASET_META.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.9)', background: 'rgba(37,99,235,0.18)', padding: '3px 10px', borderRadius: 99, fontFamily: 'var(--font-mono)', border: '1px solid rgba(37,99,235,0.3)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Kaggle Dataset <ExternalLink size={9} />
                </a>
              </div>
            </div>

            {/* Key metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 16, marginLeft: 'auto' }}>
              {[
                { v: '10,683', l: 'TRAIN OBS' },
                { v: '6', l: 'ROUTES' },
                { v: '12', l: 'AIRLINES' },
              ].map(m => (
                <div key={m.l} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{m.v}</div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' }}>{m.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Provenance notice ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px', borderRadius: 10,
        background: 'var(--color-warning-bg)',
        border: '1px solid rgba(217,119,6,0.25)',
        borderLeft: '3px solid var(--color-warning)',
      }}>
        <AlertTriangle size={15} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
          <strong>Reference dataset only.</strong> All figures are from a Kaggle public dataset covering March–June 2019 Indian domestic flights.
          This is <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>data_origin=GENERATED_TEST</code> — not real-time market prices.
          For live fares, configure the Duffel or Amadeus adapter under Data Sources.
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <StatChip label="OVERALL AVG FARE" value={`₹${OVERALL_STATS.overall_avg.toLocaleString('en-IN')}`} sub="across all routes & airlines" accent="var(--color-brand-primary)" />
        <StatChip label="CHEAPEST OBSERVED" value={`₹${OVERALL_STATS.overall_min.toLocaleString('en-IN')}`} sub={`${OVERALL_STATS.cheapest_airline}`} accent="var(--color-success)" />
        <StatChip label="HIGHEST OBSERVED" value={`₹${OVERALL_STATS.overall_max.toLocaleString('en-IN')}`} sub="Jet Airways Business" accent="var(--color-danger)" />
        <StatChip label="MOST COMMON" value="1 Stop" sub="52.7% of all flights" accent="var(--color-warning)" />
      </div>

      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border-primary)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'var(--font-mono)',
              color: activeTab === tab.id ? 'var(--color-brand-primary)' : 'var(--color-text-tertiary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              transition: 'all 160ms ease',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW tab ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          <SectionCard title="Price Distribution" subtitle="ALL 10,683 OBSERVATIONS" icon={BarChart2}>
            <PriceHistogram />
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {[['Budget (<₹6K)', 'var(--color-success)'], ['Standard (₹6-15K)', 'var(--color-brand-primary)'], ['Premium (>₹15K)', 'var(--color-warning)']].map(([l, c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                  <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{l}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Stops vs Avg Price" subtitle="NON-STOP SAVES ~52%" icon={Plane}>
            <StopsChart />
          </SectionCard>

          <SectionCard title="Monthly Trend" subtitle="MARCH–JUNE 2019" icon={TrendingUp}>
            <MonthlyChart />
            <div style={{ marginTop: 32, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
              March peaks at ₹10,673 avg (holiday season). April drops to ₹5,771 (post-holiday dip). May-June recovers to ₹8-9K summer range.
            </div>
          </SectionCard>

          <SectionCard title="Duration vs Price" subtitle="STRONG POSITIVE CORRELATION" icon={BarChart2}>
            <DurationChart />
          </SectionCard>
        </div>
      )}

      {/* ── AIRLINES tab ─────────────────────────────────────────────────── */}
      {activeTab === 'airlines' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <SectionCard title="Average Price by Airline" subtitle={`${AIRLINE_STATS.length} CARRIERS · ALL ROUTES COMBINED`} icon={Plane}>
            <AirlinePriceChart />
          </SectionCard>

          <SectionCard title="Airline × Stops Price Matrix" subtitle="AVG FARE (INR) · COLOUR = PRICE TIER" icon={BarChart2}>
            <StopsMatrix />
          </SectionCard>

          {/* Airline detail cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
            {AIRLINE_STATS.slice(0, 8).map((a, i) => (
              <div key={a.airline} className="ap-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>{a.airline}</div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{a.count.toLocaleString('en-IN')} obs · {a.share_pct}% share</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: AIRLINE_COLORS[i % AIRLINE_COLORS.length], fontFamily: 'var(--font-mono)' }}>
                    ₹{a.avg_price.toLocaleString('en-IN')}
                  </div>
                </div>
                <HBar value={a.avg_price} max={AIRLINE_STATS[0].avg_price + 5000} color={AIRLINE_COLORS[i % AIRLINE_COLORS.length]} height={6} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>min ₹{a.min_price.toLocaleString('en-IN')}</span>
                  <span style={{ fontSize: 9, color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>max ₹{a.max_price.toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ROUTES tab ───────────────────────────────────────────────────── */}
      {activeTab === 'routes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <SectionCard title="Route Comparison" subtitle="AVG · MIN · MAX FARES BY CORRIDOR" icon={Plane}>
            <RouteTable />
          </SectionCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
            {ROUTE_STATS.map(r => {
              const spread = ((r.max_price - r.min_price) / r.avg_price * 100).toFixed(0)
              return (
                <div key={r.route} className="ap-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{r.route}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>OBSERVATIONS</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)' }}>{r.count.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>AVG FARE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>₹{r.avg_price.toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border-primary)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>CHEAPEST</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>₹{r.min_price.toLocaleString('en-IN')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>HIGHEST</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>₹{r.max_price.toLocaleString('en-IN')}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>SPREAD</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>{spread}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PATTERNS tab ─────────────────────────────────────────────────── */}
      {activeTab === 'patterns' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
          <SectionCard title="Duration vs Avg Fare" subtitle="LONGER FLIGHTS COST MORE (GENERALLY)" icon={TrendingUp}>
            <DurationChart />
          </SectionCard>

          <SectionCard title="Additional Info Breakdown" subtitle="SERVICE INCLUSIONS" icon={Database}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'No info (standard)', count: 8345, pct: 78.1 },
                { label: 'No in-flight meal', count: 1982, pct: 18.6 },
                { label: 'No check-in baggage', count: 320, pct: 3.0 },
                { label: 'Long/short layover', count: 20, pct: 0.2 },
                { label: 'Change airports', count: 7, pct: 0.1 },
              ].map((item, i) => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{item.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{item.count.toLocaleString()} · {item.pct}%</span>
                  </div>
                  <HBar value={item.pct} max={100} color="var(--color-brand-primary)" height={14} />
                </div>
              ))}
            </div>
          </SectionCard>

          <div style={{ gridColumn: '1 / -1' }}>
            <SectionCard title="Key Insights" subtitle="DATA SCIENCE FINDINGS FROM KAGGLE DATASET" icon={TrendingUp}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {[
                  { insight: 'Non-stop saves ~52%', detail: '₹5,025 avg vs ₹10,594 for 1-stop flights', color: 'var(--color-success)' },
                  { insight: 'March is most expensive', detail: '₹10,673 avg — holiday peak demand', color: 'var(--color-danger)' },
                  { insight: 'April is cheapest', detail: '₹5,771 avg — post-holiday demand drop', color: 'var(--color-success)' },
                  { insight: 'SpiceJet = budget leader', detail: '₹4,338 avg — lowest non-business class', color: 'var(--color-brand-primary)' },
                  { insight: '52.7% flights have 1 stop', detail: 'Direct/non-stop is minority (32.7%)', color: 'var(--color-warning)' },
                  { insight: 'Delhi→Cochin most studied', detail: '4,537 obs — 42.5% of training data', color: 'var(--color-indigo)' },
                ].map(item => (
                  <div key={item.insight} style={{ padding: '12px 14px', borderRadius: 9, background: 'var(--color-surface-secondary)', borderLeft: `3px solid ${item.color}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>{item.insight}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  )
}
