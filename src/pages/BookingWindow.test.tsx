import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BookingWindow from './BookingWindow'
import type { FareObservationApi } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({ apiFares: vi.fn() }))

const api = await import('../services/api')

function fareRow(id: string, advanceDays: number, totalFare: number): FareObservationApi {
  return {
    observation_id: id, route: 'DEL-BOM', airline: 'IndiGo', flight_number: '6E123',
    departure_time: null, arrival_time: null, stops: 0, travel_date: '2026-12-01',
    advance_days: advanceDays, fare_family: 'ECONOMY', cabin: 'ECONOMY', base_fare: totalFare - 500,
    taxes: 500, total_fare: totalFare, currency: 'INR', source: 'Google Flights',
    data_origin: 'PUBLIC_INTERFACE', collected_at: '2026-09-28T10:00:00Z', quality_flags: [],
  }
}

beforeEach(() => {
  vi.mocked(api.apiFares).mockResolvedValue({
    observations: [
      fareRow('OBS-1', 1, 6200), fareRow('OBS-7', 7, 5400), fareRow('OBS-15', 15, 5100),
      fareRow('OBS-30', 30, 4900), fareRow('OBS-45', 45, 4700),
    ],
    total: 5, page: 1, page_size: 1000, note: '',
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('P2: Booking Windows asks for all index-eligible origins, not REAL only', async () => {
  render(<BookingWindow />)
  await screen.findByText('5 verified observations loaded for DEL-BOM.')
  expect(api.apiFares).toHaveBeenCalledWith({ route: 'DEL-BOM', limit: 1000 }, 'test-token')
})

test('P2: window medians are labelled with their true origin — never a hardcoded REAL', async () => {
  render(<BookingWindow />)
  await screen.findByText('5 verified observations loaded for DEL-BOM.')
  // One label per window card plus one per table row.
  expect(screen.getAllByText('PUBLIC_INTERFACE')).toHaveLength(10)
  expect(screen.queryByText('REAL')).toBeNull()
})
