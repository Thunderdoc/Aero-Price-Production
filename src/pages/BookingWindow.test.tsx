import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BookingWindow from './BookingWindow'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({ apiFareSummary: vi.fn() }))

const api = await import('../services/api')

beforeEach(() => {
  vi.mocked(api.apiFareSummary).mockResolvedValue({
    route: 'DEL-BOM',
    status: 'STORED_OBSERVATIONS',
    overall: { median: 5100, count: 5, last_collected_at: '2026-09-28T10:00:00Z', data_origin: 'PUBLIC_INTERFACE' },
    windows: {
      'T+1': { median: 6200, count: 1, data_origin: 'PUBLIC_INTERFACE' },
      'T+7': { median: 5400, count: 1, data_origin: 'PUBLIC_INTERFACE' },
      'T+15': { median: 5100, count: 1, data_origin: 'PUBLIC_INTERFACE' },
      'T+30': { median: 4900, count: 1, data_origin: 'PUBLIC_INTERFACE' },
      'T+45': { median: 4700, count: 1, data_origin: 'PUBLIC_INTERFACE' },
    },
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('P2: Booking Windows uses the small route summary, not a 1,000-row fetch', async () => {
  render(<BookingWindow />)
  await screen.findByText('5 verified observations loaded for DEL-BOM.')
  expect(api.apiFareSummary).toHaveBeenCalledWith('DEL-BOM', 'test-token')
})

test('P2: window medians are labelled with their true origin — never a hardcoded REAL', async () => {
  render(<BookingWindow />)
  await screen.findByText('5 verified observations loaded for DEL-BOM.')
  // One label per window card plus one per table row.
  expect(screen.getAllByText('PUBLIC_INTERFACE')).toHaveLength(10)
  expect(screen.queryByText('REAL')).toBeNull()
})
