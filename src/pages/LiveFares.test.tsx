import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LiveFares from './LiveFares'
import type { FareObservationApi } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiFares: vi.fn(),
}))

const api = await import('../services/api')

function fareRow(id: string, route: string, totalFare: number): FareObservationApi {
  return {
    observation_id: id, route, airline: 'IndiGo', flight_number: '6E123',
    departure_time: null, arrival_time: null, stops: 0, travel_date: '2026-12-01',
    advance_days: 7, fare_family: 'ECONOMY', cabin: 'ECONOMY', base_fare: totalFare - 500,
    taxes: 500, total_fare: totalFare, currency: 'INR', source: 'Google Flights',
    data_origin: 'PUBLIC_INTERFACE', collected_at: '2026-09-28T10:00:00Z', quality_flags: [],
  }
}

beforeEach(() => {
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [fareRow('OBS-1', 'DEL-BOM', 5200), fareRow('OBS-2', 'DEL-BLR', 4800)],
    total: 2, page: 1, page_size: 100, note: '',
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('P1: Live Fares asks for all index-eligible origins, not REAL only', async () => {
  render(<LiveFares />)
  await screen.findByText('OBS-1')
  expect(api.apiFares).toHaveBeenCalledWith({ limit: 100 }, 'test-token')
  expect(screen.getByText('Showing 2 matched flight fares')).toBeTruthy()
})

test('P1: the Provenance column shows each row true origin — never a hardcoded REAL', async () => {
  render(<LiveFares />)
  await screen.findByText('OBS-1')
  expect(screen.getAllByText('PUBLIC_INTERFACE')).toHaveLength(2)
  expect(screen.queryByText('REAL')).toBeNull()
})

// S6 (updated 26 Nov 2026): a cold start retries the fares fetch exactly
// once after 600 ms. The old health-probe gate was removed — its 3 s
// timeout false-negatived on slow wakes and blocked the real call. These
// tests pin the retry count so a future change cannot silently turn the
// single retry into a hot loop or drop it entirely.
test('S6: a cold-start failure retries once after 600ms and then loads', async () => {
  vi.mocked(api.apiFares)
    .mockRejectedValueOnce(new Error('The verified fare service is temporarily unavailable.'))
    .mockResolvedValue({
      observations: [fareRow('OBS-1', 'DEL-BOM', 5200)],
      total: 1, page: 1, page_size: 100, note: '',
    })
  render(<LiveFares />)
  await screen.findByText('OBS-1', {}, { timeout: 3000 })
  expect(api.apiFares).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Showing 1 matched flight fares')).toBeTruthy()
})

test('S6: two consecutive failures produce an honest error and no third attempt', async () => {
  vi.mocked(api.apiFares).mockRejectedValue(new Error('The verified fare service is temporarily unavailable.'))
  render(<LiveFares />)
  await screen.findByText('The verified fare service is temporarily unavailable.', {}, { timeout: 3000 })
  expect(api.apiFares).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('alert')).toBeTruthy()
})

// ── Loading states (follow-up, 23 Nov 2026 — Ankit's order: no
// "Data unavailable" / "0 matched" text while a fetch is still in flight) ──

test('loading: while fares load, the count and pagination lines show a loading state, not "0 matched"', async () => {
  let resolveFares!: (value: Awaited<ReturnType<typeof api.apiFares>>) => void
  const faresPromise = new Promise<Awaited<ReturnType<typeof api.apiFares>>>(res => { resolveFares = res })
  vi.mocked(api.apiFares).mockReturnValue(faresPromise)
  render(<LiveFares />)
  // Count line + pagination line both read as loading while in flight…
  expect(await screen.findAllByText('Loading verified fares…')).toHaveLength(2)
  expect(screen.getByText('Loading verified fare observations…')).toBeTruthy()
  // …and no zero-count or empty-state text appears before the fetch settles.
  expect(screen.queryByText('Showing 0 matched flight fares')).toBeNull()
  expect(screen.queryByText('NO VERIFIED FARES AVAILABLE')).toBeNull()
  await resolveFares({
    observations: [fareRow('OBS-1', 'DEL-BOM', 5200), fareRow('OBS-2', 'DEL-BLR', 4800)],
    total: 2, page: 1, page_size: 100, note: '',
  })
  await screen.findByText('OBS-1')
  expect(screen.getByText('Showing 2 matched flight fares')).toBeTruthy()
  expect(screen.queryByText('Loading verified fares…')).toBeNull()
  expect(screen.queryByText('Loading verified fare observations…')).toBeNull()
})

test('loading: after the retries genuinely fail, the count line honestly shows 0', async () => {
  vi.mocked(api.apiFares).mockRejectedValue(new Error('The verified fare service is temporarily unavailable.'))
  render(<LiveFares />)
  await screen.findByText('The verified fare service is temporarily unavailable.', {}, { timeout: 3000 })
  expect(screen.getByText('Showing 0 matched flight fares')).toBeTruthy()
  expect(screen.queryByText('Loading verified fares…')).toBeNull()
})
