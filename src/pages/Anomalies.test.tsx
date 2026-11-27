import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Anomalies from './Anomalies'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiAnomalies: vi.fn(),
  apiRunAnomalyDetection: vi.fn(),
  isForbiddenError: (error: unknown) => Boolean(error && typeof error === 'object' && (error as { status?: number }).status === 403),
}))

const api = await import('../services/api')

beforeEach(() => {
  vi.mocked(api.apiAnomalies).mockResolvedValue({
    anomalies: [
      {
        observation_id: 'OBS-1', route: 'DEL-BOM', advance_days: 7, cabin: 'ECONOMY',
        total_fare: 24000, airline: 'IndiGo', travel_date: '2026-12-01',
        data_origin: 'PUBLIC_INTERFACE', quality_flags: ['OUTLIER'], collected_at: '2026-09-28T10:00:00Z',
      },
      {
        observation_id: 'OBS-2', route: 'DEL-BLR', advance_days: 1, cabin: 'ECONOMY',
        total_fare: 19000, airline: 'Air India', travel_date: '2026-12-01',
        data_origin: 'PUBLIC_INTERFACE', quality_flags: ['OUTLIER'], collected_at: '2026-09-28T10:00:00Z',
      },
    ],
    total_shown: 2,
    summary: { total_observations: 3750, flagged_anomalies: 2, flag_rate_pct: 0.05 },
    method: 'z-score', threshold: 3, min_sample: 10, status: 'ok',
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

test('P3: anomaly rows carry the API true data_origin — never a hardcoded REAL', async () => {
  render(<Anomalies />)
  await screen.findByText('DEL-BOM')
  expect(screen.getAllByText('PUBLIC_INTERFACE')).toHaveLength(2)
  expect(screen.queryByText('REAL')).toBeNull()
  expect(screen.getByText('2')).toBeTruthy() // FLAGGED OUTLIERS count
})

test('a successful scan with no flagged rows shows the honest empty state', async () => {
  vi.mocked(api.apiAnomalies).mockResolvedValue({
    anomalies: [], total_shown: 0,
    summary: { total_observations: 6252, flagged_anomalies: 0, flag_rate_pct: 0 },
    method: 'z-score', threshold: 3, min_sample: 10, status: 'ACTIVE',
  })
  render(<Anomalies />)
  expect(await screen.findByText('NO OUTLIERS DETECTED')).toBeTruthy()
})

test('while the detector call is in flight the table says it is loading, not empty', async () => {
  vi.mocked(api.apiAnomalies).mockImplementation(() => new Promise(() => {}))
  render(<Anomalies />)
  expect(await screen.findByText('LOADING ANOMALY DATA')).toBeTruthy()
  expect(screen.queryByText('NO OUTLIERS DETECTED')).toBeNull()
})
