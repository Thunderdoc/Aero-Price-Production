// SVG-based lightweight charts (no external dependency)

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
                fill="var(--color-border-primary)" opacity={0.6} rx={1} />
            )}
            {/* bar */}
            <rect x={x} y={yVal} width={bw} height={height - 24 - yVal}
              fill="var(--color-brand-primary)" opacity={0.85} rx={2} />
            {/* label */}
            <text x={x + bw / 2} y={height - 8} textAnchor="middle"
              fontSize={10} fill="var(--color-text-tertiary)" fontFamily="inherit">
              {d.label}
            </text>
            {/* value */}
            <text x={x + bw / 2} y={yVal - 4} textAnchor="middle"
              fontSize={9} fill="var(--color-text-secondary)" fontFamily="inherit">
              ₹{(d.value / 1000).toFixed(1)}k
            </text>
          </g>
        )
      })}
      {/* y-axis hint */}
      <text x={36} y={10} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="inherit">
        ₹{(max / 1000).toFixed(0)}k
      </text>
      <text x={36} y={height - 24} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="inherit">
        ₹{(min / 1000).toFixed(0)}k
      </text>
    </svg>
  )
}

interface LineChartProps {
  // `null` points are missing days: the line breaks there instead of
  // plunging to ₹0 (audit §2.11 — a chart must never invent a fare).
  series: { name: string; data: Array<number | null>; color: string }[]
  labels: string[]
  width?: number
  height?: number
  className?: string
}

export function LineChart({ series, labels, width = 480, height = 160, className = '' }: LineChartProps) {
  const allVals = series.flatMap(s => s.data).filter((v): v is number => v != null)
  const min = (allVals.length ? Math.min(...allVals) : 0) * 0.97
  const max = (allVals.length ? Math.max(...allVals) : 1) * 1.02
  const range = max - min || 1
  const padL = 44, padR = 12, padT = 12, padB = 28
  const w = width - padL - padR
  const h = height - padT - padB

  const toX = (i: number) => padL + (i / Math.max(1, labels.length - 1)) * w
  const toY = (v: number) => padT + h - ((v - min) / range) * h

  return (
    <svg width={width} height={height} className={className} role="img" aria-label="Line chart">
      {/* grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = padT + h * t
        const val = max - (max - min) * t
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={padL + w} y2={y} stroke="var(--color-border-primary)" strokeWidth={0.5} />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--color-text-tertiary)" fontFamily="inherit">
              ₹{(val / 1000).toFixed(1)}k
            </text>
          </g>
        )
      })}
      {/* series — split into segments at null points so missing days break the line */}
      {series.map((s, si) => {
        const segments: string[][] = [[]]
        s.data.forEach((v, i) => {
          if (v == null) {
            if (segments[segments.length - 1].length) segments.push([])
            return
          }
          segments[segments.length - 1].push(`${toX(i)},${toY(v)}`)
        })
        return segments.filter(seg => seg.length >= 2).map((seg, segi) => (
          <polyline key={`${si}-${segi}`} points={seg.join(' ')} fill="none" stroke={s.color}
            strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        ))
      })}
      {/* x labels */}
      {labels.map((l, i) => (
        <text key={i} x={toX(i)} y={height - 6} textAnchor="middle"
          fontSize={9} fill="var(--color-text-tertiary)" fontFamily="inherit">
          {l}
        </text>
      ))}
    </svg>
  )
}
