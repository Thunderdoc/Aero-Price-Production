import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Info, BarChart2 } from 'lucide-react'
import { corridors } from '../data/sampleData'
import type { Corridor } from '../data/sampleData'

// Generate deterministic forecast from corridor data
function makeForecast(c: Corridor) {
  const base = c.currentFare
  const trendFactor = c.trend === 'up' ? 1 : c.trend === 'down' ? -1 : 0
  return {
    week1: Math.round(base * (1 + trendFactor * 0.03)),
    week2: Math.round(base * (1 + trendFactor * 0.055)),
    week4: Math.round(base * (1 + trendFactor * 0.09)),
    ciLow1: Math.round(base * 0.88),
    ciHigh1: Math.round(base * 1.13),
    ciLow4: Math.round(base * 0.79),
    ciHigh4: Math.round(base * 1.22),
    confidence: Math.round(72 - c.anomalyScore * 40),
  }
}

function MetricCard({ label, value, ci, borderColor, icon: Icon }: {
  label: string
  value: number
  ci: [number, number]
  borderColor: string
  icon: typeof TrendingUp
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="ap-card"
      style={{
        padding: 'var(--space-xl)',
        borderLeft: `3px solid ${borderColor}`,
        flex: 1,
        minWidth: 130,
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 180ms ease, transform 180ms ease',
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-sm)' }}>
        <Icon size={11} style={{ color: borderColor, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.09em', fontFamily: 'var(--font-sans)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1, marginBottom: 4 }}>
        ₹{value.toLocaleString('en-IN')}
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>
        CI: ₹{ci[0].toLocaleString('en-IN')} – ₹{ci[1].toLocaleString('en-IN')}
      </div>
    </div>
  )
}

function CorridorForecastCard({ corridor }: { corridor: Corridor }) {
  const fc = makeForecast(corridor)
  const [hovered, setHovered] = useState(false)

  const trendColor =
    corridor.trend === 'up' ? 'var(--color-danger)' :
    corridor.trend === 'down' ? 'var(--color-success)' :
    'var(--color-text-tertiary)'

  const TrendIcon =
    corridor.trend === 'up' ? TrendingUp :
    corridor.trend === 'down' ? TrendingDown :
    Minus

  return (
    <div
      className="ap-card"
      style={{
        padding: 'var(--space-xl)',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 180ms ease, transform 180ms ease',
      }}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>
          {corridor.from} → {corridor.to}
        </span>
        <span className="ap-badge ap-badge-gen">GENERATED</span>
        <span
          className="ap-badge"
          style={{
            background: corridor.trend === 'up' ? 'var(--color-danger-bg)' : corridor.trend === 'down' ? 'var(--color-success-bg)' : 'var(--color-surface-secondary)',
            color: trendColor,
          }}
        >
          <TrendIcon size={9} />
          {corridor.trend === 'up' ? 'RISING' : corridor.trend === 'down' ? 'FALLING' : 'STABLE'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          CONF: {fc.confidence}%
        </span>
      </div>

      {/* Forecast metric cards */}
      <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <MetricCard
          label="CURRENT"
          value={corridor.currentFare}
          ci={[corridor.minFare, corridor.maxFare]}
          borderColor="var(--color-brand-primary)"
          icon={BarChart2}
        />
        <MetricCard
          label="+7 DAYS"
          value={fc.week1}
          ci={[fc.ciLow1, fc.ciHigh1]}
          borderColor={trendColor}
          icon={TrendIcon}
        />
        <MetricCard
          label="+14 DAYS"
          value={fc.week2}
          ci={[Math.round(fc.ciLow1 - (fc.week2 - fc.ciLow1) * 0.5), Math.round(fc.ciHigh1 + (fc.ciHigh1 - fc.week2) * 0.5)]}

          borderColor={trendColor}
          icon={TrendIcon}
        />
        <MetricCard
          label="+30 DAYS"
          value={fc.week4}
          ci={[fc.ciLow4, fc.ciHigh4]}
          borderColor="var(--color-text-tertiary)"
          icon={Minus}
        />
      </div>

      {/* Optimal booking window */}
      <div style={{ marginTop: 'var(--space-lg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.07em' }}>OPTIMAL BOOKING WINDOW</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)' }}>
          {corridor.bookingWindowOptimal} days in advance
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
          {corridor.carriers.join(' · ')}
        </span>
      </div>
    </div>
  )
}

export default function Forecast() {
  const [selectedTrend, setSelectedTrend] = useState<'ALL' | 'up' | 'down' | 'stable'>('ALL')

  const filtered = corridors.filter(c =>
    selectedTrend === 'ALL' ? true : c.trend === selectedTrend
  ).slice(0, 8)

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2xl)', maxWidth: 960 }}>

      {/* Premium header */}
      <div style={{
        background: 'var(--gradient-hero-dark)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        position: 'relative',
        padding: '28px 32px',
        boxShadow: '0 20px 50px rgba(8,14,26,0.35)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />
        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: -60, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'rgba(37,99,235,0.18)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, left: 60, width: 180, height: 180, borderRadius: '50%', background: 'rgba(99,102,241,0.14)', filter: 'blur(50px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          {/* Eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(147,197,253,0.7)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.7)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>
              PRICE FORECAST ENGINE
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
              INDIA CORRIDORS
            </span>
          </div>

          {/* Main header content */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0 40px', alignItems: 'start' }}>
            {/* Icon badge */}
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(37,99,235,0.7) 0%, rgba(99,102,241,0.7) 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
            }}>
              <TrendingUp size={24} style={{ color: 'rgba(255,255,255,0.9)' }} />
            </div>

            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.9)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.02em', marginBottom: 8 }}>
                Airfare Forecast
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)', lineHeight: 1.65 }}>
                7, 14, and 30-day fare projections across major India corridors. Confidence intervals reflect historical variance in route pricing.
              </div>
            </div>

            <div style={{ paddingTop: 4, textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>CORRIDORS</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{corridors.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section header with info note */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <div style={{ width: 3, height: 16, background: 'var(--color-brand-primary)', borderRadius: 'var(--radius-full)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              FORECAST MODEL
            </span>
          </div>
          {(['ALL', 'up', 'down', 'stable'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSelectedTrend(t)}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.07em',
                border: '1px solid',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                background: selectedTrend === t ? 'var(--color-brand-primary)' : 'var(--color-surface-bg)',
                color: selectedTrend === t ? 'var(--color-text-on-brand)' : 'var(--color-text-secondary)',
                borderColor: selectedTrend === t ? 'var(--color-brand-primary)' : 'var(--color-border-primary)',
              }}
            >
              {t === 'ALL' ? 'ALL' : t === 'up' ? 'RISING' : t === 'down' ? 'FALLING' : 'STABLE'}
            </button>
          ))}
        </div>

        {/* Info note */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-warning-bg)',
          border: '1px solid rgba(217,119,6,0.25)',
          fontSize: 11,
          color: 'var(--color-warning)',
          fontFamily: 'var(--font-sans)',
        }}>
          <Info size={12} style={{ flexShrink: 0 }} />
          <span>
            <strong>Based on historical GENERATED data — not real observations.</strong>{' '}
            Confidence intervals widen with forecast horizon. Connect a live airfare collector for real predictions.
          </span>
        </div>
      </div>

      {/* Forecast corridor cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {filtered.map(c => (
          <CorridorForecastCard key={c.id} corridor={c} />
        ))}
      </div>

    </div>
  )
}
