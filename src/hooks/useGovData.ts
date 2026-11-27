import { useEffect, useState } from 'react'
import { apiDataGovAviation, apiDgcaCirculars, apiDgcaMonthly, apiGovDatasets, apiGovRefresh, apiMospiCpi, apiPpacAtf, isForbiddenError } from '../services/api'
import type { GovDataset, DgcaCircular, DgcaMonthlyRecord, MospiCpiRecord } from '../types/observation'
import { useAuth } from '../contexts/AuthContext'

export interface GovDataState {
  datasets: GovDataset[]
  dgcaMonthly: DgcaMonthlyRecord[]
  dgcaCirculars: DgcaCircular[]
  mospiCpi: MospiCpiRecord[]
  ppacAtf: Array<{ effective_date: string; atf_export_duty_per_litre: number }>
  dataGovAviationCount: number
  isLoading: boolean
  anyConnected: boolean
  // Per-source load failures from the last fetch: a rejected call must
  // render as "could not load", never as NOT IMPORTED / 0 records.
  failedSources: {
    datasets: boolean
    dgcaMonthly: boolean
    dgcaCirculars: boolean
    mospiCpi: boolean
    ppacAtf: boolean
    dataGovAviation: boolean
  }
  lastFetch: string | null
  refresh: () => Promise<void>
  // True when the last government refresh was refused with a 403: the
  // refresh action is analyst-gated even though the reads are open. The
  // page renders an access-required banner from this instead of silently
  // showing stale data.
  refreshForbidden: boolean
}

const REFETCH_MS = 30 * 60 * 1000

export function useGovData(): GovDataState {
  const { token } = useAuth()
  // Start empty: bundled records are development fixtures and must never be
  // presented as current government data in production.
  const [datasets, setDatasets] = useState<GovDataset[]>([])
  const [dgcaMonthly, setDgcaMonthly] = useState<DgcaMonthlyRecord[]>([])
  const [dgcaCirculars, setDgcaCirculars] = useState<DgcaCircular[]>([])
  const [mospiCpi, setMospiCpi] = useState<MospiCpiRecord[]>([])
  const [ppacAtf, setPpacAtf] = useState<Array<{ effective_date: string; atf_export_duty_per_litre: number }>>([])
  const [dataGovAviationCount, setDataGovAviationCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<string | null>(null)
  const [hasLiveResponse, setHasLiveResponse] = useState(false)
  const [failedSources, setFailedSources] = useState<GovDataState['failedSources']>({
    datasets: false, dgcaMonthly: false, dgcaCirculars: false, mospiCpi: false, ppacAtf: false, dataGovAviation: false,
  })
  const [refreshForbidden, setRefreshForbidden] = useState(false)

  async function fetchAll() {
    setIsLoading(true)
    try {
      // S5: the race aborts the underlying fetch on timeout instead of
      // abandoning it. Each call gets its own AbortController, threaded
      // through the gov helpers' signal param (api.ts combines it with
      // the 12 s apiFetch timeout — neither replaces the other). The race
      // timer is cleared as soon as the call settles, so a fast source
      // leaves no orphaned timer behind, and the late AbortError from an
      // aborted call is swallowed by the .then handlers below (the race
      // has already rejected with 'Request timed out').
      const withTimeout = <T,>(fn: (signal: AbortSignal) => Promise<T>, ms = 8000) =>
        new Promise<T>((resolve, reject) => {
          const controller = new AbortController()
          const timer = setTimeout(() => {
            controller.abort()
            reject(new Error('Request timed out'))
          }, ms)
          fn(controller.signal).then(
            value => { clearTimeout(timer); resolve(value) },
            error => { clearTimeout(timer); reject(error) },
          )
        })
      const withRetry = async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
        try {
          return await withTimeout(fn)
        } catch (error) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          return withTimeout(fn)
        }
      }
      const results = await Promise.allSettled([
        withRetry(signal => apiGovDatasets(token ?? undefined, signal)),
        withRetry(signal => apiDgcaMonthly(token ?? undefined, signal)),
        withRetry(signal => apiDgcaCirculars(token ?? undefined, signal)),
        withRetry(signal => apiMospiCpi(token ?? undefined, signal)),
        withRetry(signal => apiPpacAtf(token ?? undefined, signal)),
        withRetry(signal => apiDataGovAviation(token ?? undefined, signal)),
      ])
      setFailedSources({
        datasets: results[0].status === 'rejected',
        dgcaMonthly: results[1].status === 'rejected',
        dgcaCirculars: results[2].status === 'rejected',
        mospiCpi: results[3].status === 'rejected',
        ppacAtf: results[4].status === 'rejected',
        dataGovAviation: results[5].status === 'rejected',
      })
      const value = <T,>(index: number): T | null => results[index].status === 'fulfilled' ? results[index].value as T : null
      const registry = value<any>(0)
      const pax = value<any>(1)
      const circulars = value<any>(2)
      const cpi = value<any>(3)
      const ppac = value<any>(4)
      const dataGov = value<any>(5)
      if (registry && (registry as any).datasets?.length) {
        setDatasets(
          (registry as any).datasets.map((d: any) => ({
            id: d.id ?? d.dataset_id,
            source: d.source ?? d.source_name,
            organization: d.organization,
            access_type: d.access_type,
            api_key_required: d.api_key_required === 'YES',
            format: d.format,
            status: d.status || 'UNAVAILABLE',
            last_retrieved: d.last_retrieved || null,
            last_attempt: d.last_attempt || null,
            record_count: Number.isFinite(Number(d.record_count)) ? Number(d.record_count) : 0,
            checksum: null,
            reference_period: d.reference_period,
            source_url: d.source_url,
            update_frequency: 'MONTHLY',
            data_origin: 'OFFICIAL' as const,
          }))
        )
      } else setDatasets([])

      const paxRecords = (pax as any)?.records
      if (Array.isArray(paxRecords)) {
        setDgcaMonthly(
          paxRecords.map((record: any) => ({
            ...record,
            month: typeof record.month === 'number' && record.year
              ? `${record.year}-${String(record.month).padStart(2, '0')}`
              : String(record.month ?? record.period ?? ''),
          }))
        )
      }

      const circRecords = (circulars as any)?.circulars
      if (Array.isArray(circRecords)) {
        setDgcaCirculars(circRecords)
      }

      const cpiRecords = (cpi as any)?.records
      if (Array.isArray(cpiRecords)) {
        setMospiCpi(cpiRecords)
      }

      // PPAC/data.gov responses are kept separate from CPI/DGCA so their
      // measure and provenance cannot be confused with fare observations.
      if (Array.isArray((ppac as any)?.records)) setPpacAtf((ppac as any).records)
      setDataGovAviationCount(Number((dataGov as any)?.count || 0))

      const succeeded = results.some(result => result.status === 'fulfilled')
      setLastFetch(new Date().toISOString())
      setHasLiveResponse(succeeded)
    } catch {
      // Keep the last successful response. Never replace a failed fetch with
      // bundled fixtures or mark an unverified source as connected.
      setLastFetch(new Date().toISOString())
      setHasLiveResponse(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchAll()
    const timer = setInterval(() => { void fetchAll() }, REFETCH_MS)
    return () => clearInterval(timer)
  }, [token])

  async function refresh() {
    setIsLoading(true)
    setRefreshForbidden(false)
    try {
      await apiGovRefresh(token ?? undefined)
    } catch (error) {
      // A 403 is an access refusal, not a transient failure: surface it
      // instead of silently re-fetching the same stale data.
      if (isForbiddenError(error)) setRefreshForbidden(true)
    }
    await fetchAll()
  }

  return {
    datasets,
    dgcaMonthly,
    dgcaCirculars,
    mospiCpi,
    ppacAtf,
    dataGovAviationCount,
    isLoading,
    failedSources,
    lastFetch,
    refresh,
    refreshForbidden,
    anyConnected: hasLiveResponse && datasets.some(dataset => ['CONNECTED', 'HEALTHY'].includes(dataset.status)),
  }
}
