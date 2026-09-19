import { useState, useEffect } from 'react'
import {
  fetchDgcaMonthlyStats,
  fetchDgcaCirculars,
  fetchMospiCpiTransport,
  GOV_DATASETS,
} from '../services/govFetcher'
import type { GovDataset, DgcaCircular, DgcaMonthlyRecord, MospiCpiRecord } from '../types/observation'

export interface GovDataState {
  datasets: GovDataset[]
  dgcaMonthly: DgcaMonthlyRecord[]
  dgcaCirculars: DgcaCircular[]
  mospiCpi: MospiCpiRecord[]
  isLoading: boolean
  anyConnected: boolean
  lastFetch: string | null
}

const REFETCH_MS = 30 * 60 * 1000  // 30 minutes

export function useGovData(): GovDataState {
  const [datasets, setDatasets] = useState<GovDataset[]>(GOV_DATASETS)
  const [dgcaMonthly, setDgcaMonthly] = useState<DgcaMonthlyRecord[]>([])
  const [dgcaCirculars, setDgcaCirculars] = useState<DgcaCircular[]>([])
  const [mospiCpi, setMospiCpi] = useState<MospiCpiRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<string | null>(null)

  async function fetchAll() {
    setIsLoading(true)
    const now = new Date().toISOString()

    const [paxResult, circularsResult, mospiResult] = await Promise.allSettled([
      fetchDgcaMonthlyStats(),
      fetchDgcaCirculars(),
      fetchMospiCpiTransport(),
    ])

    const pax = paxResult.status === 'fulfilled' ? paxResult.value : { data: [], status: 'FAILED', lastFetch: null }
    const circs = circularsResult.status === 'fulfilled' ? circularsResult.value : { data: [], status: 'FAILED', lastFetch: null }
    const mospi = mospiResult.status === 'fulfilled' ? mospiResult.value : { data: [], status: 'FAILED', lastFetch: null }

    setDgcaMonthly(pax.data)
    setDgcaCirculars(circs.data)
    setMospiCpi(mospi.data)

    // Update dataset registry with live statuses
    setDatasets(prev => prev.map(ds => {
      if (ds.id === 'dgca-pax') return { ...ds, status: pax.status as GovDataset['status'], last_retrieved: pax.lastFetch, last_attempt: now, record_count: pax.data.length || null }
      if (ds.id === 'dgca-circulars') return { ...ds, status: circs.status as GovDataset['status'], last_retrieved: circs.lastFetch, last_attempt: now, record_count: circs.data.length || null }
      if (ds.id === 'mospi-esankhyiki') return { ...ds, status: mospi.status as GovDataset['status'], last_retrieved: mospi.lastFetch, last_attempt: now, record_count: mospi.data.length || null }
      if (ds.id === 'data-gov-in') return { ...ds, status: 'NOT_CONFIGURED', last_attempt: now }
      return ds
    }))

    setLastFetch(now)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const timer = setInterval(fetchAll, REFETCH_MS)
    return () => clearInterval(timer)
  }, [])

  const anyConnected = datasets.some(d =>
    d.status === 'CONNECTED' || d.status === 'HEALTHY' || d.status === 'STALE'
  )

  return { datasets, dgcaMonthly, dgcaCirculars, mospiCpi, isLoading, anyConnected, lastFetch }
}
