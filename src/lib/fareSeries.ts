import { median } from './liveStatus'

export interface FareRowLike {
  route: string
  collected_at: string
  total_fare: number
}

/**
 * Build one median-per-day series per route over a shared day axis.
 *
 * Missing days are `null` — NEVER 0. A route with no observation on a day
 * must break the chart line there, not plunge to a ₹0 fare (audit §2.11 —
 * the only place in the app where the chart itself invented data).
 */
export function buildDailyMedianSeries(
  rows: FareRowLike[],
  routes: string[],
  days: string[],
): Array<{ route: string; data: Array<number | null> }> {
  return routes.map(route => {
    const routeRows = rows.filter(row => row.route === route)
    return {
      route,
      data: days.map(day =>
        median(
          routeRows
            .filter(row => row.collected_at.startsWith(day))
            .map(row => Number(row.total_fare))
            .filter(Number.isFinite),
        ),
      ),
    }
  })
}

/** Sorted unique collection days (YYYY-MM-DD) across the given rows. */
export function collectionDays(rows: FareRowLike[]): string[] {
  return [...new Set(rows.map(row => row.collected_at.slice(0, 10)))].sort()
}
