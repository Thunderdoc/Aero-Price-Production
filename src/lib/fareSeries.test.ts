import { describe, expect, it } from 'vitest'
import { buildDailyMedianSeries, collectionDays } from './fareSeries'

const rows = [
  { route: 'DEL-BOM', collected_at: '2026-11-18T10:00:00Z', total_fare: 5000 },
  { route: 'DEL-BOM', collected_at: '2026-11-18T12:00:00Z', total_fare: 6000 },
  // DEL-BOM has NO observation on 2026-11-19.
  { route: 'DEL-BOM', collected_at: '2026-11-20T10:00:00Z', total_fare: 7000 },
  { route: 'DEL-BLR', collected_at: '2026-11-19T10:00:00Z', total_fare: 4200 },
]

describe('buildDailyMedianSeries — missing days are null, never ₹0 (audit §2.11)', () => {
  it('returns null for a day with no observation for that route', () => {
    const days = ['2026-11-18', '2026-11-19', '2026-11-20']
    const [delBom] = buildDailyMedianSeries(rows, ['DEL-BOM'], days)
    expect(delBom.data).toEqual([5500, null, 7000])
  })

  it('never emits a 0 fare for a missing day', () => {
    const days = ['2026-11-18', '2026-11-19', '2026-11-20']
    const series = buildDailyMedianSeries(rows, ['DEL-BOM', 'DEL-BLR'], days)
    for (const s of series) {
      expect(s.data).not.toContain(0)
    }
  })

  it('uses the shared median (average of two middle values) per day', () => {
    const days = ['2026-11-18']
    const [delBom] = buildDailyMedianSeries(rows, ['DEL-BOM'], days)
    expect(delBom.data).toEqual([5500])
  })
})

describe('collectionDays', () => {
  it('returns sorted unique collection days', () => {
    expect(collectionDays(rows)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20'])
  })
})
