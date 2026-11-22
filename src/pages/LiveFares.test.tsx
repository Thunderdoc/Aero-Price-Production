import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LiveFares from './LiveFares'
import type { FareObservationApi } from '../services/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiFares: vi.fn(),
  isBackendAvailable: vi.fn(),
  resetBackendAvailability: vi.fn(),
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
  vi.mocked(api.isBackendAvailable).mockResolvedValue(true)
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
