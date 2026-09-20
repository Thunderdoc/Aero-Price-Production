import type { Corridor } from '../data/sampleData'

interface Props {
  corridor: Corridor
  width?: number
  height?: number
}

const WINDOWS = [1, 7, 15, 30, 45]
const MULTIPLIERS: Record<number, number> = { 1: 1.45, 7: 1.18, 15: 1.0, 30: 0.88, 45: 0.82 }

export default function ElasticityChart({ corridor, width = 320, height = 160 }: Props) {
  const fares = WINDOWS.map(w => Math.round(corridor.currentFare * MULTIPLIERS[w]))
  const minFare = Math.min(...fares)
  const maxFare = Math.max(...fares)
  const pad = { top: 20, right: 16, bottom: 36, left: 56 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const xScale = (i: number) => (i / (WINDOWS.length - 1)) * innerW
  const yScale = (v: number) => innerH - ((v - minFare) / (maxFare - minFare || 1)) * innerH

  const pathD = WINDOWS.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(fares[i]).toFixed(1)}`).join(' ')

  return (
    <div>
      <svg width={width} height={height} aria-label={`Elasticity chart for ${corridor.from}-${corridor.to}`}>
        <g transform={`translate(${pad.left},${pad.top})`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(r => {
            const y = r * innerH
            const fare = maxFare - r * (maxFare - minFare)
            return (
              <g key={r}>
                <line x1={0} y1={y} x2={innerW} y2={y} stroke="var(--color-border-primary)" strokeWidth={0.5} />
                <text x={-8} y={y + 4} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                  ₹{Math.round(fare / 100) * 100 >= 10000 ? `${(fare / 1000).toFixed(1)}k` : fare.toLocaleString('en-IN')}
                </text>
              </g>
            )
          })}

          {/* Area fill */}
          <defs>
            <linearGradient id={`elas-grad-${corridor.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-brand-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${pathD} L ${innerW} ${innerH} L 0 ${innerH} Z`}
            fill={`url(#elas-grad-${corridor.id})`}
          />

          {/* Line */}
          <path d={pathD} fill="none" stroke="var(--color-brand-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Points + labels */}
          {WINDOWS.map((w, i) => (
            <g key={w}>
              <circle cx={xScale(i)} cy={yScale(fares[i])} r={4} fill="var(--color-brand-primary)" stroke="var(--color-surface-bg)" strokeWidth={1.5} />
              <text
                x={xScale(i)}
                y={innerH + 20}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-text-tertiary)"
                fontFamily="var(--font-mono)"
              >
                T+{w}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
        {corridor.from} → {corridor.to} · Advance-purchase fare curve · Kaggle 2019 baseline
      </div>
    </div>
  )
}
