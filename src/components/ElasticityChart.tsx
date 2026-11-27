import { AlertTriangle } from 'lucide-react'

export interface ElasticityPoint {
  /** Advance-purchase window in days (1, 7, 15, 30, 45). */
  advance_days: number
  /** Median stored fare in INR for this window. */
  median: number
  /** Observation count behind the median. */
  count?: number
}

interface Props {
  route: string
  from: string
  to: string
  /** One point per advance window that has verified observations. Windows
   *  with no data are omitted, never interpolated or simulated. */
  points: ElasticityPoint[]
  width?: number
  height?: number
}

const WINDOWS = [1, 7, 15, 30, 45]

/**
 * Lead-time elasticity curve — median stored fare by advance-purchase
 * window for one corridor. Fed by index-eligible observations
 * (REAL/OFFICIAL/PUBLIC_INTERFACE) from the backend. Needs medians in at
 * least two windows to draw a curve; otherwise shows the honest empty state.
 */
export default function ElasticityChart({ route, from, to, points, width = 320, height = 160 }: Props) {
  const ordered = WINDOWS
    .map(w => points.find(p => p.advance_days === w))
    .filter((p): p is ElasticityPoint => p != null)

  if (ordered.length < 2) {
    return (
      <div style={{ minHeight: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>NO ELASTICITY CURVE YET</div>
        <div style={{ fontSize: 11, maxWidth: 360 }}>
          {route} needs verified median fares in at least two advance-purchase windows before a curve can be drawn.
        </div>
      </div>
    )
  }

  const fares = ordered.map(p => p.median)
  const minFare = Math.min(...fares)
  const maxFare = Math.max(...fares)
  const pad = { top: 20, right: 16, bottom: 36, left: 56 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const xScale = (i: number) => (i / (ordered.length - 1)) * innerW
  const yScale = (v: number) => innerH - ((v - minFare) / (maxFare - minFare || 1)) * innerH

  const pathD = ordered.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(fares[i]).toFixed(1)}`).join(' ')

  return (
    <div>
      <svg width={width} height={height} role="img" aria-label={`Elasticity chart for ${from}-${to}`}>
        <g transform={`translate(${pad.left},${pad.top})`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(r => {
            const y = r * innerH
            const fare = maxFare - r * (maxFare - minFare)
            return (
              <g key={r}>
                <line x1={0} y1={y} x2={innerW} y2={y} stroke="var(--color-border-primary)" strokeWidth={0.5} />
                <text x={-8} y={y + 4} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                  ₹{Math.round(fare / 100) * 100 >= 10000 ? `${(fare / 1000).toFixed(1)}k` : Math.round(fare).toLocaleString('en-IN')}
                </text>
              </g>
            )
          })}

          {/* Area fill */}
          <defs>
            <linearGradient id={`elas-grad-${route}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${pathD} L ${innerW} ${innerH} L 0 ${innerH} Z`}
            fill={`url(#elas-grad-${route})`}
          />

          {/* Line */}
          <path d={pathD} fill="none" stroke="var(--color-brand-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Points + labels */}
          {ordered.map((p, i) => (
            <g key={p.advance_days}>
              <circle cx={xScale(i)} cy={yScale(fares[i])} r={4} fill="var(--color-brand-primary)" stroke="var(--color-surface-bg)" strokeWidth={1.5} />
              <text
                x={xScale(i)}
                y={innerH + 20}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-text-tertiary)"
                fontFamily="var(--font-mono)"
              >
                T+{p.advance_days}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
        {from} → {to} · Median stored fare by advance-purchase window (REAL/OFFICIAL/PUBLIC_INTERFACE observations; windows with no verified observations are omitted)
      </div>
    </div>
  )
}
