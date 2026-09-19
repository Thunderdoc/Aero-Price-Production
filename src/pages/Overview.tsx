import { useState, useEffect } from 'react'
import { ArrowRight, TrendingUp, TrendingDown, Minus, Bell, Map as MapIcon, BarChart2, Zap, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import TrendIndicator from '../components/TrendIndicator'
import DataFreshness from '../components/DataFreshness'
import {
  indexValue, indexChange7d, indexChange30d, totalObservations,
  activeSources, corridors, bookingWindowData, regionalData, recentAnomalies, carriers, pricePressureEvents
} from '../data/sampleData'
import type { Page } from '../components/AppShell'

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
  { value: 'AMD', label: 'Ahmedabad' }, { value: 'GOI', label: 'Goa' },
]

// Animated live counter
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const step = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * ease))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value, duration])
  return <>{display.toFixed(2)}</>
}

// Mini booking window sparkline (inline SVG)
function BookingSparkline() {
  const data = bookingWindowData.map(d => d.avgFare)
  const max = Math.max(...data)
  const min = Math.min(...data)
  const w = 260, h = 52
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-brand-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill="var(--color-brand-muted)"
        opacity="0.35"
        strokeWidth="0"
      />
    </svg>
  )
}

export default function Overview({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [from, setFrom] = useState('DEL')
  const [to, setTo] = useState('BOM')
  const [liveIndex, setLiveIndex] = useState(indexValue)
  const [tickerOffset, setTickerOffset] = useState(0)

  // Simulate live index fluctuation
  useEffect(() => {
    const id = setInterval(() => {
      setLiveIndex(prev => +(prev + (Math.random() - 0.5) * 0.04).toFixed(2))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Animate price ticker
  useEffect(() => {
    const id = setInterval(() => {
      setTickerOffset(prev => (prev - 1) % 800)
    }, 30)
    return () => clearInterval(id)
  }, [])

  const risingRoutes = corridors.filter(c => c.trend === 'up').slice(0, 5)
  const fallingRoutes = corridors.filter(c => c.trend === 'down').slice(0, 5)
  const optimalRoute = bookingWindowData.find(d => d.window === 21)

  return (
    <div className="flex flex-col animate-fade-up" style={{ gap: 'var(--space-xl)', maxWidth: 1000 }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <div
        style={{
          borderRadius: 'var(--radius-xl)',
          background: 'var(--gradient-hero)',
          padding: 'var(--space-3xl)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow blobs */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 300, height: 300,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -40, left: 100, width: 200, height: 200,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <span
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)', color: 'rgba(255,255,255,0.5)',
              }}
            >
              National Airfare Intelligence
            </span>
            <span
              style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)', color: 'var(--color-brand-light)',
                background: 'rgba(96,165,250,0.15)', padding: '2px 8px',
                borderRadius: 'var(--radius-full)', border: '1px solid rgba(96,165,250,0.3)',
              }}
            >
              SAMPLE DATA
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 800, color: 'white',
              fontFamily: 'var(--font-sans)', lineHeight: 1.15, marginBottom: 'var(--space-md)',
            }}
          >
            AEROPRICE INDIA
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-label-size)', maxWidth: 480, lineHeight: 1.6, marginBottom: 'var(--space-2xl)' }}>
            Real-time domestic airfare price intelligence for India — from raw observations to a transparent, reproducible national index.
          </p>

          <div className="flex flex-wrap" style={{ gap: 'var(--space-md)' }}>
            <Button variant="primary" size="lg" onClick={() => onNavigate('map')} iconEnd={<MapIcon size={16} />}>
              View India Map
            </Button>
            <button
              onClick={() => onNavigate('routes')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)',
                padding: 'var(--space-md) var(--space-2xl)', borderRadius: 'var(--radius-full)',
                background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-label-size)',
                fontWeight: 500, transition: 'all 200ms',
              }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.18)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)' }}
            >
              Explore Routes <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Live price ticker ─────────────────────────────── */}
      <div
        style={{
          ...card,
          padding: 'var(--space-md) var(--space-xl)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-lg)',
        }}
      >
        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)', color: 'var(--color-brand-primary)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          LIVE FARES
        </span>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div
            style={{
              display: 'flex', gap: 'var(--space-3xl)', whiteSpace: 'nowrap',
              transform: `translateX(${tickerOffset}px)`,
              transition: 'none',
            }}
          >
            {[...corridors, ...corridors].map((c, i) => (
              <button
                key={`${c.id}-${i}`}
                onClick={() => onNavigate('routes')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-sm)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {c.from}–{c.to}
                </span>
                <span style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)' }}>
                  ₹{c.currentFare.toLocaleString('en-IN')}
                </span>
                {c.trend === 'up'
                  ? <TrendingUp size={11} style={{ color: 'var(--color-danger)' }} />
                  : c.trend === 'down'
                  ? <TrendingDown size={11} style={{ color: 'var(--color-success)' }} />
                  : <Minus size={11} style={{ color: 'var(--color-warning)' }} />
                }
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main KPI card ─────────────────────────────────── */}
      <div style={card}>
        <div className="flex items-start flex-wrap" style={{ gap: 'var(--space-2xl)' }}>
          {/* Big index number */}
          <div style={{ flex: '1 1 260px' }}>
            <p
              style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)',
                marginBottom: 'var(--space-sm)',
              }}
            >
              All-India Airfare Price Index
            </p>
            <div className="flex items-end" style={{ gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
              <span
                style={{
                  fontSize: '4rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-sans)',
                  color: 'var(--color-text-primary)', letterSpacing: '-0.02em',
                }}
              >
                <AnimatedNumber value={liveIndex} />
              </span>
              <div style={{ paddingBottom: 8 }}>
                <span
                  style={{
                    fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Base: 100 · Jan 2020
                </span>
              </div>
            </div>
            <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>
              {[
                { label: '7-DAY', dir: 'up' as const, val: indexChange7d },
                { label: '30-DAY', dir: 'up' as const, val: indexChange30d },
              ].map(({ label, dir, val }) => (
                <div key={label} className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
                  <span
                    style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {label}
                  </span>
                  <TrendIndicator direction={dir} value={val} />
                </div>
              ))}
            </div>
          </div>

          {/* Stats column */}
          <div className="flex flex-col" style={{ gap: 'var(--space-lg)', flex: '1 1 200px' }}>
            {[
              { label: 'CORRIDORS MONITORED', value: corridors.length },
              { label: 'VALIDATED OBSERVATIONS', value: totalObservations.toLocaleString('en-IN') },
              { label: 'ACTIVE SOURCES', value: activeSources },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between" style={{ gap: 'var(--space-md)' }}>
                <span
                  style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase',
                    fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)',
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-label-size)', fontWeight: 600,
                    fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)',
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
            <DataFreshness minutesAgo={18} />
          </div>
        </div>
      </div>

      {/* ── Market movement + Quick search ────────────────── */}
      <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>

        {/* Rising */}
        <div style={{ ...card, flex: '1 1 200px', minWidth: 200 }}>
          <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: 'var(--radius-md)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-danger-bg)',
              }}
            >
              <TrendingUp size={14} style={{ color: 'var(--color-danger)' }} />
            </div>
            <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>Rising</span>
          </div>
          <div className="flex flex-col" style={{ gap: 4 }}>
            {risingRoutes.map(c => (
              <button
                key={c.id}
                onClick={() => onNavigate('routes')}
                className="flex items-center justify-between"
                style={{
                  padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)',
                  transition: '150ms', background: 'transparent', border: 'none', cursor: 'pointer', width: '100%',
                }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {c.from} → {c.to}
                </span>
                <div className="flex items-center" style={{ gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
                    ₹{c.currentFare.toLocaleString('en-IN')}
                  </span>
                  <TrendIndicator direction="up" value={c.change7d} size="sm" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Falling */}
        <div style={{ ...card, flex: '1 1 200px', minWidth: 200 }}>
          <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <div
              style={{
                width: 28, height: 28, borderRadius: 'var(--radius-md)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-success-bg)',
              }}
            >
              <TrendingDown size={14} style={{ color: 'var(--color-success)' }} />
            </div>
            <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>Falling</span>
          </div>
          <div className="flex flex-col" style={{ gap: 4 }}>
            {fallingRoutes.map(c => (
              <button
                key={c.id}
                onClick={() => onNavigate('routes')}
                className="flex items-center justify-between"
                style={{
                  padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)',
                  transition: '150ms', background: 'transparent', border: 'none', cursor: 'pointer', width: '100%',
                }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {c.from} → {c.to}
                </span>
                <div className="flex items-center" style={{ gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)' }}>
                    ₹{c.currentFare.toLocaleString('en-IN')}
                  </span>
                  <TrendIndicator direction="down" value={Math.abs(c.change7d)} size="sm" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick route check */}
        <div style={{ ...card, flex: '2 1 320px' }}>
          <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-brand-muted)' }}>
              <Zap size={14} style={{ color: 'var(--color-brand-primary)' }} />
            </div>
            <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>Quick Fare Check</span>
          </div>
          <div className="flex flex-wrap items-end" style={{ gap: 'var(--space-md)' }}>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>From</label>
              <select
                value={from}
                onChange={e => setFrom(e.target.value)}
                style={{
                  width: '100%', padding: 'var(--space-sm) var(--space-md)',
                  border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-secondary)', color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-size)', cursor: 'pointer',
                }}
              >
                {cityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <label style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 4 }}>To</label>
              <select
                value={to}
                onChange={e => setTo(e.target.value)}
                style={{
                  width: '100%', padding: 'var(--space-sm) var(--space-md)',
                  border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface-secondary)', color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-body-size)', cursor: 'pointer',
                }}
              >
                {cityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <Button variant="primary" onClick={() => onNavigate('routes')} iconEnd={<ArrowRight size={14} />}>
              Check
            </Button>
          </div>
          {/* Show fare for selected route */}
          {(() => {
            const sel = corridors.find(c => (c.from === from && c.to === to) || (c.from === to && c.to === from))
            if (!sel) return (
              <p style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-md)' }}>
                Select a monitored route pair to see current fare intelligence.
              </p>
            )
            return (
              <div
                className="flex items-center flex-wrap"
                style={{ gap: 'var(--space-lg)', marginTop: 'var(--space-lg)', padding: 'var(--space-md) var(--space-lg)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}
              >
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Current Fare</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                    ₹{sel.currentFare.toLocaleString('en-IN')}
                  </span>
                </div>
                <TrendIndicator direction={sel.trend} value={Math.abs(sel.change7d)} />
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Book At</span>
                  <span style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>T+{sel.bookingWindowOptimal}</span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Booking window + Carrier row ─────────────────── */}
      <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>

        {/* Booking window */}
        <div style={{ ...card, flex: '2 1 300px' }}>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-xs)' }}>
              Booking Window Effect
            </h2>
            <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>
              Earlier booking = lower fares. Optimal window: T+{optimalRoute?.window ?? 21} days
            </p>
          </div>
          <BookingSparkline />
          <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
            {bookingWindowData.filter((_, i) => i % 3 === 0).map(d => (
              <div key={d.window} className="flex flex-col" style={{ gap: 2 }}>
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                  ₹{d.avgFare.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Carrier summary */}
        <div style={{ ...card, flex: '1 1 220px' }}>
          <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-lg)' }}>
            Carrier Share
          </h2>
          <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
            {carriers.map(car => (
              <div key={car.code} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center" style={{ gap: 'var(--space-sm)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: car.color, display: 'block', flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', fontWeight: 500 }}>{car.name}</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>{car.marketShare}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-secondary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${car.marketShare}%`, background: car.color, borderRadius: 'var(--radius-full)', transition: 'width 1s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Regional index ────────────────────────────────── */}
      <div>
        <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-xl)' }}>
          Regional Airfare Index
        </h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
          {regionalData.map(r => {
            const dir = r.change7d > 0.5 ? 'up' : r.change7d < -0.5 ? 'down' : 'stable'
            return (
              <div
                key={r.region}
                style={{
                  ...card,
                  cursor: 'pointer',
                  transition: 'all 200ms',
                  padding: 'var(--space-lg)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseOver={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.transform = 'translateY(-2px)'
                  el.style.boxShadow = 'var(--shadow-md)'
                }}
                onMouseOut={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.transform = 'translateY(0)'
                  el.style.boxShadow = 'var(--shadow-sm)'
                }}
                onClick={() => onNavigate('government')}
              >
                <div
                  style={{
                    position: 'absolute', top: 0, right: 0, width: 60, height: 60,
                    borderRadius: '0 0 0 60px',
                    background: dir === 'up' ? 'var(--color-danger-bg)' : dir === 'down' ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                  }}
                />
                <span
                  style={{
                    fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em',
                    fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', fontWeight: 600,
                    display: 'block', marginBottom: 'var(--space-sm)',
                  }}
                >
                  {r.region}
                </span>
                <div
                  style={{
                    fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-sans)',
                    color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 'var(--space-sm)',
                  }}
                >
                  ₹{r.avgFare.toLocaleString('en-IN')}
                </div>
                <TrendIndicator direction={dir} value={Math.abs(r.change7d)} size="sm" />
                <div
                  style={{
                    fontSize: 9, fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)',
                    marginTop: 'var(--space-xs)',
                  }}
                >
                  {r.routeCount} routes · {r.observations.toLocaleString('en-IN')} obs
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Recent anomalies + Events row ─────────────────── */}
      <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>

        {/* Anomalies */}
        <div style={{ ...card, flex: '3 1 320px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="flex items-center" style={{ gap: 'var(--space-sm)' }}>
              <AlertTriangle size={15} style={{ color: 'var(--color-warning)' }} />
              <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                Recent Anomalies
              </h2>
            </div>
            <Badge label={`${recentAnomalies.filter(a => !a.resolved).length} active`} variant="warning" />
          </div>
          <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
            {recentAnomalies.slice(0, 4).map(a => (
              <div
                key={a.id}
                className="flex items-start justify-between"
                style={{
                  padding: 'var(--space-md) var(--space-lg)',
                  background: a.resolved ? 'var(--color-surface-secondary)' : 'var(--color-warning-bg)',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: `3px solid ${a.resolved ? 'var(--color-border-secondary)' : a.type === 'SPIKE' ? 'var(--color-danger)' : a.type === 'DIP' ? 'var(--color-success)' : 'var(--color-warning)'}`,
                }}
              >
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-body-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                    {a.route} — {a.type}
                  </span>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>
                    ₹{a.fare.toLocaleString('en-IN')} vs expected ₹{a.expectedFare.toLocaleString('en-IN')} · {a.detectedAt}
                  </span>
                </div>
                <Badge label={a.resolved ? 'Resolved' : 'Active'} variant={a.resolved ? 'default' : 'warning'} />
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming price pressure */}
        <div style={{ ...card, flex: '2 1 220px' }}>
          <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
            <Bell size={15} style={{ color: 'var(--color-brand-primary)' }} />
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
              Upcoming Pressure
            </h2>
          </div>
          <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
            {pricePressureEvents.slice(0, 5).map(ev => (
              <div key={ev.name} className="flex items-center justify-between" style={{ gap: 'var(--space-md)' }}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>{ev.name}</span>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)' }}>{ev.date}</span>
                </div>
                <Badge
                  label={ev.impact}
                  variant={ev.impact === 'HIGH' ? 'danger' : ev.impact === 'MEDIUM' ? 'warning' : 'default'}
                />
              </div>
            ))}
          </div>
          <Button variant="subtle" size="sm" onClick={() => onNavigate('alerts')} iconEnd={<ArrowRight size={13} />} style={{ marginTop: 'var(--space-lg)' }}>
            Set fare alerts
          </Button>
        </div>
      </div>

    </div>
  )
}
