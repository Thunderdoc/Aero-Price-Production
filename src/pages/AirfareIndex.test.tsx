import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AirfareIndex from './AirfareIndex'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiIndexBasket: vi.fn(),
  apiIndexCurrent: vi.fn(),
  apiIndexHistory: vi.fn(),
}))

const api = await import('../services/api')

beforeEach(() => {
  vi.mocked(api.apiIndexHistory).mockResolvedValue({
    frequency: 'daily', count: 1,
    observations: [
      { period: '2026-09-28', value: 106.2, status: 'PUBLISHED', route_count: 12, observation_count: 3750, data_origin: 'DERIVED' },
    ],
  })
  vi.mocked(api.apiIndexBasket).mockResolvedValue({ routes: [], total: 0, dgca_weights_note: '' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('ITEM 3: the spotlight shows how stale the indexed data is, from its observation period', async () => {
  vi.mocked(api.apiIndexCurrent).mockResolvedValue({
    status: 'PUBLISHED', index_value: 106.2, base_value: 100,
    base_period: 'First verified collection day', observation_period: '2026-09-28',
    route_count: 12, observation_count: 3750, coverage_pct: 100, data_origin: 'DERIVED',
    message: 'Calculated from matched, verified fare observations.',
  })
  render(<AirfareIndex />)
  await screen.findAllByText('106.20')
  // The index describes 28 Sep 2026 fares — months old — so the badge must
  // read STALE, never LIVE: it is anchored on the observation period, not
  // on the page-load time (lastRefreshed).
  expect(screen.getByRole('status')).toBeTruthy()
  expect(screen.getByText('STALE')).toBeTruthy()
  expect(screen.getByText(/ago/)).toBeTruthy()
})

test('ITEM 3: with no published observation period the spotlight shows no freshness badge', async () => {
  vi.mocked(api.apiIndexCurrent).mockResolvedValue({
    status: 'INSUFFICIENT_DATA', index_value: null,
    message: 'The index will appear after verified fare observations are collected.',
  })
  vi.mocked(api.apiIndexHistory).mockResolvedValue({ frequency: 'daily', count: 0, observations: [] })
  render(<AirfareIndex />)
  await screen.findByText('No published index available yet')
  expect(screen.queryByRole('status')).toBeNull()
})

test('basket weights render as short percents and coverage counts routes with data', async () => {
  vi.mocked(api.apiIndexCurrent).mockResolvedValue({
    status: 'PUBLISHED', index_value: 109.77, base_value: 100,
    base_period: 'First verified collection day', observation_period: '2026-11-26',
    route_count: 12, covered_routes_count: 12, required_routes: 19,
    observation_count: 6252, data_origin: 'DERIVED',
    message: 'Calculated from matched, verified fare observations.',
  })
  vi.mocked(api.apiIndexBasket).mockResolvedValue({
    routes: [{ route: 'DEL-BOM', weight: 0.0970873786407767, region: 'West', weight_source: 'AAI_GRAVITY' }],
    total: 1, dgca_weights_note: '',
  })
  render(<AirfareIndex />)
  expect(await screen.findByText('Weight: 9.71%')).toBeTruthy()
  expect(screen.queryByText(/0\.097087/)).toBeNull()
  expect(screen.getAllByText('12 of 19 routes with data').length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('DEL-BOM')).toBeTruthy()
})
