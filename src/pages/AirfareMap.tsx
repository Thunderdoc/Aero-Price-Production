import { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import DataFreshness from '../components/DataFreshness'
import TrendIndicator from '../components/TrendIndicator'
import { corridors } from '../data/sampleData'
import type { Corridor } from '../data/sampleData'
import type { Page } from '../components/AppShell'

const card = { background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)' } as const

const INDIA_PATH = 'M 200 40 L 220 42 L 235 50 L 248 65 L 258 80 L 268 95 L 275 110 L 280 125 L 278 140 L 268 155 L 258 168 L 252 180 L 248 195 L 255 210 L 262 225 L 268 240 L 265 255 L 255 268 L 245 280 L 238 292 L 230 305 L 220 316 L 210 322 L 200 318 L 190 310 L 182 298 L 175 285 L 168 272 L 162 258 L 158 244 L 155 230 L 148 218 L 140 208 L 130 200 L 122 190 L 115 178 L 110 165 L 108 152 L 110 138 L 115 124 L 120 110 L 126 96 L 132 83 L 140 70 L 150 58 L 162 48 L 175 42 L 188 40 Z'

const airports: Record<string, { x: number; y: number }> = {
  DEL: { x: 155, y: 120 }, BOM: { x: 122, y: 218 }, BLR: { x: 168, y: 278 },
  MAA: { x: 195, y: 290 }, CCU: { x: 245, y: 172 }, HYD: { x: 178, y: 245 },
}

function trendColor(t: Corridor['trend']) {
  return t === 'up' ? 'var(--color-danger)' : t === 'down' ? 'var(--color-success)' : 'var(--color-warning)'
}

function arc(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.25
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`
}

export default function AirfareMap({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [zoom, setZoom]               = useState(1)
  const [hovered, setHovered]         = useState<Corridor | null>(null)
  const [tooltipPos, setTooltipPos]   = useState({ x: 0, y: 0 })
  const [filter, setFilter]           = useState<'all' | 'up' | 'down' | 'stable'>('all')

  const filtered = corridors.filter(c => filter === 'all' || c.trend === filter)

  return (
    <div className="flex flex-col animate-fade-up" style={{ gap: 'var(--space-xl)', maxWidth: 900 }}>
      <div>
        <h1 className="text-title text-primary">India Airfare Movement Map</h1>
        <p className="text-body" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)' }}>
          Monitored domestic corridors colour-coded by 7-day price movement.
        </p>
      </div>

      <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)', alignItems: 'flex-start' }}>
        {/* Map */}
        <div className="flex-1" style={{ ...card, minWidth: 340 }}>
          {/* Controls */}
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div className="flex" style={{ gap: 'var(--space-xs)' }}>
              {(['all','up','down','stable'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="text-caption focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
                  style={{
                    padding: 'var(--space-xs) var(--space-md)',
                    borderRadius: 'var(--radius-md)',
                    background: filter === f ? 'var(--color-brand-primary)' : 'transparent',
                    color: filter === f ? 'white' : 'var(--color-text-secondary)',
                    transition: 'var(--transition-base)',
                    border: 'none',
                    cursor: 'pointer',
                  }}>
                  {f === 'all' ? 'All' : f === 'up' ? '↑ Rising' : f === 'down' ? '↓ Falling' : '→ Stable'}
                </button>
              ))}
            </div>
            <div className="flex" style={{ gap: 'var(--space-xs)' }}>
              {[
                { label: 'Zoom in', icon: <ZoomIn size={14} />, fn: () => setZoom(z => Math.min(z + 0.25, 2)) },
                { label: 'Zoom out', icon: <ZoomOut size={14} />, fn: () => setZoom(z => Math.max(z - 0.25, 0.75)) },
                { label: 'Reset', icon: <RotateCcw size={14} />, fn: () => setZoom(1) },
              ].map(b => (
                <button key={b.label} onClick={b.fn} title={b.label}
                  className="focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
                  style={{ padding: 'var(--space-xs)', borderRadius: 'var(--radius-md)', border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', transition: 'var(--transition-fast)' }}>
                  {b.icon}
                </button>
              ))}
            </div>
          </div>

          {/* SVG */}
          <div className="relative overflow-hidden" style={{ height: 360, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-secondary)' }}>
            <svg width="100%" height="100%" viewBox="80 25 230 315"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.3s ease' }}
              aria-label="India airfare movement map">
              <path d={INDIA_PATH} fill="var(--color-surface-hover)" stroke="var(--color-border-primary)" strokeWidth={1} />
              {filtered.map((c, i) => {
                const a1 = airports[c.from], a2 = airports[c.to]
                if (!a1 || !a2) return null
                const isHov = hovered?.id === c.id
                return (
                  <path key={c.id} d={arc(a1.x, a1.y, a2.x, a2.y)} fill="none"
                    stroke={trendColor(c.trend)} strokeWidth={isHov ? 2.5 : 1.5}
                    strokeLinecap="round" opacity={isHov ? 1 : 0.7}
                    className="animate-draw-arc cursor-pointer"
                    style={{ animationDelay: `${i * 100}ms`, transition: 'stroke-width 0.15s, opacity 0.15s' }}
                    onMouseEnter={e => {
                      setHovered(c)
                      const rect = (e.currentTarget.closest('svg')?.parentElement as HTMLElement)?.getBoundingClientRect()
                      if (rect) setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                    }}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onNavigate('routes')}
                    aria-label={`${c.from} to ${c.to}`}
                  />
                )
              })}
              {Object.entries(airports).map(([code, pos]) => (
                <g key={code}>
                  <circle cx={pos.x} cy={pos.y} r={3.5} fill="var(--color-surface-bg)" stroke="var(--color-text-secondary)" strokeWidth={1.5} />
                  <text x={pos.x + 5} y={pos.y + 4} fontSize={7} fill="var(--color-text-secondary)" fontFamily="var(--font-sans)">{code}</text>
                </g>
              ))}
            </svg>

            {hovered && (
              <div className="pointer-events-none" style={{
                position: 'absolute', left: tooltipPos.x + 12, top: tooltipPos.y - 10, zIndex: 10,
                background: 'var(--color-surface-dark)', color: 'var(--color-text-on-dark)',
                borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', boxShadow: 'var(--shadow-lg)',
                minWidth: 140,
              }}>
                <div className="text-label" style={{ fontWeight: 500, marginBottom: 'var(--space-xs)' }}>{hovered.from} → {hovered.to}</div>
                <div className="text-caption" style={{ opacity: 0.8 }}>₹{hovered.currentFare.toLocaleString('en-IN')}</div>
                <div className="text-caption" style={{ opacity: 0.8 }}>
                  7D: {hovered.change7d > 0 ? '+' : ''}{hovered.change7d.toFixed(1)}%
                </div>
                <div className="text-caption" style={{ opacity: 0.55 }}>{hovered.freshness} min ago</div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)', marginTop: 'var(--space-lg)' }}>
            {[
              { color: 'var(--color-success)', label: 'Falling' },
              { color: 'var(--color-danger)',  label: 'Rising' },
              { color: 'var(--color-warning)', label: 'Stable / Uncertain' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center" style={{ gap: 'var(--space-xs)' }}>
                <div style={{ width: 20, height: 2, background: color, borderRadius: 2 }} />
                <span className="text-caption text-secondary">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Corridor list */}
        <div style={{ ...card, width: 240, flexShrink: 0 }}>
          <h3 className="text-label text-primary" style={{ fontWeight: 500, marginBottom: 'var(--space-md)' }}>Corridors</h3>
          <div className="flex flex-col" style={{ gap: 'var(--space-xs)', maxHeight: 340, overflowY: 'auto' }}>
            {filtered.map(c => (
              <button key={c.id} onClick={() => onNavigate('routes')}
                onMouseEnter={() => setHovered(c)} onMouseLeave={() => setHovered(null)}
                className="flex items-center justify-between text-left focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
                style={{
                  padding: 'var(--space-md) var(--space-sm)',
                  borderRadius: 'var(--radius-md)',
                  background: hovered?.id === c.id ? 'var(--color-surface-hover)' : 'transparent',
                  transition: 'var(--transition-fast)',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}>
                <div>
                  <div className="text-body text-primary">{c.from} → {c.to}</div>
                  <DataFreshness minutesAgo={c.freshness} />
                </div>
                <TrendIndicator direction={c.trend} value={Math.abs(c.change7d)} size="sm" />
              </button>
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <Button variant="neutral" onClick={() => onNavigate('routes')} className="w-full">
              Open Route Explorer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
