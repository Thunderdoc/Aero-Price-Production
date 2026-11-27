import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useGovData } from './useGovData'

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }))
vi.mock('../services/api', () => ({
  apiDataGovAviation: vi.fn(),
  apiDgcaCirculars: vi.fn(),
  apiDgcaMonthly: vi.fn(),
  apiGovDatasets: vi.fn(),
  apiGovRefresh: vi.fn(),
  apiMospiCpi: vi.fn(),
  apiPpacAtf: vi.fn(),
  isForbiddenError: vi.fn(() => false),
}))

const api = await import('../services/api')

// Drain the real microtask queue inside act() — the mocked API promises and
// Promise.allSettled resolve over several turns, and fake timers must not
// advance the clock while we wait for them.
async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

function mockAllFast() {
  vi.mocked(api.apiGovDatasets).mockResolvedValue({
    datasets: [{
      dataset_id: 'D1', source_name: 'DGCA', organization: 'DGCA', access_type: 'API',
      api_key_required: 'NO', format: 'CSV', status: 'CONNECTED',
      last_retrieved: null, last_attempt: null, record_count: 10,
      failure_reason: null, reference_period: '2026-09', source_url: 'https://example.test',
    }],
  })
  vi.mocked(api.apiDgcaMonthly).mockResolvedValue({ records: [{ month: 9, year: 2026, passengers: 100 }] })
  vi.mocked(api.apiDgcaCirculars).mockResolvedValue({ circulars: [{ id: 'C1', title: 'Circular' }] })
  vi.mocked(api.apiMospiCpi).mockResolvedValue({ records: [{ month: '2026-09', index: 123.4 }] })
  vi.mocked(api.apiPpacAtf).mockResolvedValue({ count: 1, data_origin: 'OFFICIAL', measure: 'ATF', unit: 'INR/L', note: '', records: [{ effective_date: '2026-09-01', atf_export_duty_per_litre: 1.5 }] })
  vi.mocked(api.apiDataGovAviation).mockResolvedValue({ count: 3, data_origin: 'OFFICIAL', records: [] })
}

beforeEach(() => {
  mockAllFast()
})
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

test('S5: a hung government source gives up at 8s and the other sources still land', async () => {
  vi.useFakeTimers()
  // DGCA monthly never resolves — the 8 s race must abandon it instead of
  // holding the whole Government Intelligence page in "loading".
  vi.mocked(api.apiDgcaMonthly).mockImplementation(() => new Promise(() => {}))

  const { result, unmount } = renderHook(() => useGovData())
  await flushMicrotasks()
  expect(result.current.isLoading).toBe(true)

  // 8 s race, 1 s retry delay, second 8 s race. The async advance
  // interleaves microtasks so the retry's timers get scheduled.
  await act(async () => { await vi.advanceTimersByTimeAsync(18000) })
  await flushMicrotasks()

  expect(result.current.isLoading).toBe(false)
  expect(result.current.dgcaMonthly).toHaveLength(0)
  expect(result.current.failedSources.dgcaMonthly).toBe(true)
  expect(result.current.mospiCpi).toHaveLength(1)
  expect(result.current.datasets).toHaveLength(1)
  expect(result.current.anyConnected).toBe(true)
  unmount()
})

test('S5: a settled government call clears its race timer instead of leaving it pending', async () => {
  vi.useFakeTimers()
  const { result, unmount } = renderHook(() => useGovData())
  await flushMicrotasks()
  expect(result.current.isLoading).toBe(false)
  // Only the 30-minute refetch interval may remain. Before the fix the six
  // race timers stayed pending for the full 8 s after their calls settled.
  expect(vi.getTimerCount()).toBe(1)
  unmount()
})

test('S5: a timed-out government call aborts the underlying fetch', async () => {
  vi.useFakeTimers()
  // DGCA monthly never resolves — the 8 s race must abort its fetch, not
  // abandon it. The mocked helper captures the signal it was passed.
  let capturedSignal: AbortSignal | undefined
  vi.mocked(api.apiDgcaMonthly).mockImplementation((_token, signal) => {
    capturedSignal = signal
    return new Promise(() => {})
  })

  const { result, unmount } = renderHook(() => useGovData())
  await flushMicrotasks()
  expect(capturedSignal).toBeDefined()
  expect(capturedSignal!.aborted).toBe(false)

  // 8 s race, 1 s retry delay, second 8 s race. The async advance
  // interleaves microtasks so the retry's timers get scheduled.
  await act(async () => { await vi.advanceTimersByTimeAsync(18000) })
  await flushMicrotasks()

  expect(capturedSignal!.aborted).toBe(true)
  expect(result.current.isLoading).toBe(false)
  expect(result.current.mospiCpi).toHaveLength(1)
  unmount()
})

test('useGovData loads every government source on the happy path', async () => {
  const { result, unmount } = renderHook(() => useGovData())
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  expect(result.current.datasets).toHaveLength(1)
  expect(result.current.datasets[0].status).toBe('CONNECTED')
  expect(result.current.dgcaMonthly).toHaveLength(1)
  expect(result.current.dgcaMonthly[0].month).toBe('2026-09')
  expect(result.current.dgcaCirculars).toHaveLength(1)
  expect(result.current.mospiCpi).toHaveLength(1)
  expect(result.current.ppacAtf).toHaveLength(1)
  expect(result.current.dataGovAviationCount).toBe(3)
  expect(result.current.anyConnected).toBe(true)
  unmount()
})
