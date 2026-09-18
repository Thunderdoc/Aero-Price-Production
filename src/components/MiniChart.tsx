// SVG-based lightweight charts (no external dependency)

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  trend?: 'up' | 'down' | 'stable'
  className?: string
}

export function Sparkline({ data, width = 80, height = 32, trend = 'stable', className = '' }: SparklineProps) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  })
  const color = trend === 'up' ? 'var(--danger)' : trend === 'down' ? 'var(--success)' : 'var(--warning)'
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface BarChartProps {
  data: { label: string; value: number; low?: number; high?: number }[]
  width?: number
  height?: number
  className?: string
}

export function BarChart({ data, width = 400, height = 140, className = '' }: BarChartProps) {
  const values = data.map(d => d.value)
  const allVals = data.flatMap(d => [d.low ?? d.value, d.value, d.high ?? d.value])
  const min = Math.min(...allVals) * 0.95
  const max = Math.max(...allVals) * 1.02
  const range = max - min
  const barW = (width - 40) / data.length
  const pad = 4

  return (
    <svg width={width} height={height} className={className} aria-label="Bar chart">
      {data.map((d, i) => {
        const x = 40 + i * barW + pad
        const bw = barW - pad * 2
        const yVal = height - 24 - ((d.value - min) / range) * (height - 34)
        const yHigh = d.high ? height - 24 - ((d.high - min) / range) * (height - 34) : yVal
        const yLow = d.low ? height - 24 - ((d.low - min) / range) * (height - 34) : yVal
        return (
          <g key={i}>
            {/* range band */}
            {d.low && d.high && (
              <rect x={x + bw / 2 - 1} y={yHigh} width={2} height={yLow - yHigh}
                fill="var(--border-primary)" opacity={0.6} rx={1} />
            )}
            {/* bar */}
            <rect x={x} y={yVal} width={bw} height={height - 24 - yVal}
              fill="var(--brand-primary)" opacity={0.85} rx={2} />
            {/* label */}
            <text x={x + bw / 2} y={height - 8} textAnchor="middle"
              fontSize={10} fill="var(--text-tertiary)" fontFamily="inherit">
              {d.label}
            </text>
            {/* value */}
            <text x={x + bw / 2} y={yVal - 4} textAnchor="middle"
              fontSize={9} fill="var(--text-secondary)" fontFamily="inherit">
              ₹{(d.value / 1000).toFixed(1)}k
            </text>
          </g>
        )
      })}
      {/* y-axis hint */}
      <text x={36} y={10} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="inherit">
        ₹{(max / 1000).toFixed(0)}k
      </text>
      <text x={36} y={height - 24} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="inherit">
        ₹{(min / 1000).toFixed(0)}k
      </text>
    </svg>
  )
}

interface LineChartProps {
  series: { name: string; data: number[]; color: string }[]
  labels: string[]
  width?: number
  height?: number
  className?: string
}

export function LineChart({ series, labels, width = 480, height = 160, className = '' }: LineChartProps) {
  const allVals = series.flatMap(s => s.data)
  const min = Math.min(...allVals) * 0.97
  const max = Math.max(...allVals) * 1.02
  const range = max - min
  const padL = 44, padR = 12, padT = 12, padB = 28
  const w = width - padL - padR
  const h = height - padT - padB

  const toX = (i: number) => padL + (i / (labels.length - 1)) * w
  const toY = (v: number) => padT + h - ((v - min) / range) * h

  return (
    <svg width={width} height={height} className={className} aria-label="Line chart">
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = padT + h * t
        const val = max - (max - min) * t
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={padL + w} y2={y} stroke="var(--border-primary)" strokeWidth={0.5} />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-tertiary)" fontFamily="inherit">
              ₹{(val / 1000).toFixed(1)}k
            </text>
          </g>
        )
      })}
      {/* series */}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
        return (
          <polyline key={si} points={pts} fill="none" stroke={s.color}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        )
      })}
      {/* x labels */}
      {labels.map((l, i) => (
        <text key={i} x={toX(i)} y={height - 6} textAnchor="middle"
          fontSize={9} fill="var(--text-tertiary)" fontFamily="inherit">
          {l}
        </text>
      ))}
    </svg>
  )
}
