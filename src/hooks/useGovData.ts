import { useEffect, useState } from 'react'
import { apiDataGovAviation, apiDgcaCirculars, apiDgcaMonthly, apiGovDatasets, apiGovRefresh, apiMospiCpi, apiPpacAtf } from '../services/api'
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
  lastFetch: string | null
  refresh: () => Promise<void>
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

  async function fetchAll() {
    setIsLoading(true)
    try {
      const withTimeout = <T,>(promise: Promise<T>, ms = 8000) =>
        Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))])
      const results = await Promise.allSettled([
        withTimeout(apiGovDatasets(token ?? undefined)),
        withTimeout(apiDgcaMonthly(token ?? undefined)),
        withTimeout(apiDgcaCirculars(token ?? undefined)),
        withTimeout(apiMospiCpi(token ?? undefined)),
        withTimeout(apiPpacAtf(token ?? undefined)),
        withTimeout(apiDataGovAviation(token ?? undefined)),
      ])
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
    try {
      await apiGovRefresh(token ?? undefined)
    } catch {
      // Soft fallback
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
    lastFetch,
    refresh,
    anyConnected: hasLiveResponse && datasets.some(dataset => ['CONNECTED', 'HEALTHY'].includes(dataset.status)),
  }
}
