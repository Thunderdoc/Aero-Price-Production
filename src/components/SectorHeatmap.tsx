import { AlertTriangle } from 'lucide-react'

const WINDOWS = [1, 7, 15, 30, 45] as const

export interface HeatmapRow {
  route: string
  from: string
  to: string
  /** Advance-purchase window (days) -> median stored fare in INR, or null when
   *  that window has no verified observations. Never simulated. */
  windows: Record<number, number | null>
  /** Advance-purchase window (days) -> observation count behind the median. */
  counts?: Record<number, number>
}

interface Props {
  rows: HeatmapRow[]
}

function fareToColor(fare: number, min: number, max: number): string {
  const ratio = max === min ? 0.5 : (fare - min) / (max - min)
  // Low fare = green, high fare = red, mid = amber
  if (ratio < 0.4) return `rgba(22, 163, 74, ${0.3 + ratio * 0.7})`    // green
  if (ratio < 0.7) return `rgba(217, 119, 6, ${0.3 + (ratio - 0.4) * 1.5})` // amber
  return `rgba(220, 38, 38, ${0.3 + (ratio - 0.7) * 1.2})`             // red
}

function formatFare(fare: number): string {
  return Math.round(fare / 100) * 100 >= 10000
    ? `${(fare / 1000).toFixed(1)}k`
    : fare.toLocaleString('en-IN')
}

/**
 * Sector heatmap — median stored fare per route × advance-purchase window.
 * Fed by index-eligible observations (REAL/OFFICIAL/PUBLIC_INTERFACE) from
 * the backend. Cells with no verified observations render as "—", never as
 * an estimated or simulated fare. With no rows at all, shows the honest
 * empty state.
 */
export default function SectorHeatmap({ rows }: Props) {
  const displayed = rows.slice(0, 10)

  if (displayed.length === 0) {
    return (
      <div style={{ minHeight: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>NO VERIFIED FARE MATRIX</div>
        <div style={{ fontSize: 11, maxWidth: 360 }}>The backend has not returned fare summaries for the current basket routes.</div>
      </div>
    )
  }

  // Compute global min/max for color scale from real medians only.
  const allFares = displayed.flatMap(c => WINDOWS.map(w => c.windows[w]).filter((v): v is number => v != null))
  const globalMin = allFares.length ? Math.min(...allFares) : 0
  const globalMax = allFares.length ? Math.max(...allFares) : 1

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 10px 6px 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
              CORRIDOR
            </th>
            {WINDOWS.map(w => (
              <th key={w} style={{ textAlign: 'center', padding: '6px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-tertiary)' }}>
                T+{w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map(corridor => (
            <tr key={corridor.route}>
              <td style={{ padding: '4px 10px 4px 0', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', fontSize: 11 }}>
                {corridor.from} → {corridor.to}
              </td>
              {WINDOWS.map(w => {
                const fare = corridor.windows[w]
                if (fare == null) return (
                  <td key={w} style={{ padding: '4px 8px', textAlign: 'center', background: 'var(--color-surface-secondary)', color: 'var(--color-text-tertiary)' }}>
                    —
                  </td>
                )
                const bg = fareToColor(fare, globalMin, globalMax)
                const count = corridor.counts?.[w]
                return (
                  <td key={w} style={{
                    padding: '6px 8px', textAlign: 'center',
                    background: bg, borderRadius: 4,
                    color: 'var(--color-text-primary)', fontWeight: 600,
                    fontSize: 10,
                  }}>
                    ₹{formatFare(fare)}
                    {count ? <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{count} obs</div> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Color scale legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, height: 8, width: 120, borderRadius: 4, overflow: 'hidden' }}>
          {Array.from({ length: 20 }, (_, i) => i / 19).map((r, i) => (
            <div key={i} style={{ flex: 1, background: fareToColor(globalMin + r * (globalMax - globalMin), globalMin, globalMax) }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
          ₹{globalMin.toLocaleString('en-IN')} – ₹{globalMax.toLocaleString('en-IN')} — Median stored fare per advance window (REAL/OFFICIAL/PUBLIC_INTERFACE observations; blank cells have no verified observations)
        </span>
      </div>
    </div>
  )
}
