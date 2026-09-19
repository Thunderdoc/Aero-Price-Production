import type { Corridor } from '../data/sampleData'

const WINDOWS = [1, 7, 15, 30, 45] as const

interface Props {
  corridors: Corridor[]
}

function getWindowFare(corridor: Corridor, window: number): number | null {
  // Simulate booking-window pricing from real corridor data
  // In a real system this would be real observations per window
  const multiplier: Record<number, number> = { 1: 1.45, 7: 1.18, 15: 1.0, 30: 0.88, 45: 0.82 }
  return Math.round(corridor.currentFare * (multiplier[window] ?? 1))
}

function fareToColor(fare: number, min: number, max: number): string {
  const ratio = max === min ? 0.5 : (fare - min) / (max - min)
  // Low fare = green, high fare = red, mid = amber
  if (ratio < 0.4) return `rgba(22, 163, 74, ${0.3 + ratio * 0.7})`    // green
  if (ratio < 0.7) return `rgba(217, 119, 6, ${0.3 + (ratio - 0.4) * 1.5})` // amber
  return `rgba(220, 38, 38, ${0.3 + (ratio - 0.7) * 1.2})`             // red
}

export default function SectorHeatmap({ corridors }: Props) {
  const displayed = corridors.slice(0, 10)

  // Compute global min/max for color scale
  const allFares = displayed.flatMap(c => WINDOWS.map(w => getWindowFare(c, w) ?? 0))
  const globalMin = Math.min(...allFares)
  const globalMax = Math.max(...allFares)

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
            <tr key={corridor.id}>
              <td style={{ padding: '4px 10px 4px 0', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', fontSize: 11 }}>
                {corridor.from} → {corridor.to}
              </td>
              {WINDOWS.map(w => {
                const fare = getWindowFare(corridor, w)
                if (fare == null) return (
                  <td key={w} style={{ padding: '4px 8px', textAlign: 'center', background: 'var(--color-surface-secondary)', color: 'var(--color-text-tertiary)' }}>
                    N/A
                  </td>
                )
                const bg = fareToColor(fare, globalMin, globalMax)
                return (
                  <td key={w} style={{
                    padding: '6px 8px', textAlign: 'center',
                    background: bg, borderRadius: 4,
                    color: 'var(--color-text-primary)', fontWeight: 600,
                    fontSize: 10,
                  }}>
                    ₹{Math.round(fare / 100) * 100 >= 10000
                      ? `${(fare / 1000).toFixed(1)}k`
                      : fare.toLocaleString('en-IN')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Color scale legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 0, height: 8, width: 120, borderRadius: 4, overflow: 'hidden' }}>
          {Array.from({ length: 20 }, (_, i) => i / 19).map((r, i) => (
            <div key={i} style={{ flex: 1, background: fareToColor(globalMin + r * (globalMax - globalMin), globalMin, globalMax) }} />
          ))}
        </div>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
          ₹{globalMin.toLocaleString('en-IN')} – ₹{globalMax.toLocaleString('en-IN')} — Advance-purchase fare range (GENERATED data)
        </span>
      </div>
    </div>
  )
}
