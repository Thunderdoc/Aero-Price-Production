import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Exports from './Exports'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiCreateAccessRequest: vi.fn(),
  apiDownload: vi.fn(),
  isForbiddenError: vi.fn(() => false),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

test('P4: the exports copy names PUBLIC_INTERFACE as index-eligible live data, honestly labelled', async () => {
  render(<Exports />)
  // PUBLIC_INTERFACE is the only origin with live data — the old copy
  // ("only REAL and OFFICIAL records enter live analytical exports")
  // contradicted what the site actually exports.
  expect(await screen.findByText('About These Exports')).toBeTruthy()
  expect(screen.getAllByText('PUBLIC_INTERFACE').length).toBeGreaterThan(0)
  expect(screen.getByText(/scraped Google Flights fares, honestly labelled/)).toBeTruthy()
  expect(screen.queryByText(/only REAL and OFFICIAL records enter/)).toBeNull()
})
