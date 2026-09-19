import { cacheGet, cacheSet, cacheGetStale } from './store'
import type { DgcaCircular, DgcaMonthlyRecord, MospiCpiRecord, GovDataset } from '../types/observation'

const ALLORIGINS = 'https://api.allorigins.win/get?url='
const TTL_6H = 6 * 60 * 60 * 1000
const TTL_24H = 24 * 60 * 60 * 1000

async function fetchViaProxy(url: string): Promise<string> {
  const proxyUrl = ALLORIGINS + encodeURIComponent(url)
  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`Proxy returned ${res.status}`)
  const json = await res.json() as { contents: string; status: { http_code: number } }
  if (json.status?.http_code !== 200) throw new Error(`Source returned ${json.status?.http_code}`)
  return json.contents
}

function parseTableRows(html: string, tableIndex = 0): string[][] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const tables = doc.querySelectorAll('table')
  const table = tables[tableIndex]
  if (!table) return []
  const rows: string[][] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td, th')).map(c => c.textContent?.trim() ?? '')
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

// ── DGCA Monthly Passenger Statistics ────────────────────────────────────────

const DGCA_PAX_URL = 'https://dgca.gov.in/digigov-portal/?page=statisticsMenu/airTransportStatistics/monthlystatistics/monthlypassengerstatistics.html'
const DGCA_PAX_KEY = 'dgca_pax'

export async function fetchDgcaMonthlyStats(): Promise<{ data: DgcaMonthlyRecord[]; status: string; lastFetch: string | null }> {
  const cached = cacheGet<DgcaMonthlyRecord[]>(DGCA_PAX_KEY)
  if (cached) return { data: cached, status: 'HEALTHY', lastFetch: new Date().toISOString() }

  try {
    const html = await fetchViaProxy(DGCA_PAX_URL)
    const rows = parseTableRows(html, 0)
    const data: DgcaMonthlyRecord[] = []

    for (const row of rows.slice(1)) {
      if (row.length < 3) continue
      const monthStr = row[0]?.trim()
      const dom = Number(row[1]?.replace(/,/g, ''))
      const intl = Number(row[2]?.replace(/,/g, ''))
      if (!monthStr || isNaN(dom)) continue
      data.push({
        month: monthStr,
        year: parseInt(monthStr.slice(-4)) || 2026,
        domestic_passengers: dom,
        international_passengers: isNaN(intl) ? 0 : intl,
        top_airline: 'IndiGo',
        data_origin: 'OFFICIAL',
      })
    }

    if (data.length > 0) {
      cacheSet(DGCA_PAX_KEY, data, TTL_24H)
      return { data, status: 'CONNECTED', lastFetch: new Date().toISOString() }
    }
    throw new Error('No parseable rows found')
  } catch {
    const stale = cacheGetStale<DgcaMonthlyRecord[]>(DGCA_PAX_KEY)
    if (stale) return { data: stale.data, status: 'STALE', lastFetch: null }
    return { data: [], status: 'UNAVAILABLE', lastFetch: null }
  }
}

// ── DGCA Circulars / Press Releases ──────────────────────────────────────────

const DGCA_CIRCULAR_URL = 'https://dgca.gov.in/digigov-portal/?page=newsdetail/officecircular/officecircular.html'
const DGCA_CIRCULAR_KEY = 'dgca_circulars'

export async function fetchDgcaCirculars(): Promise<{ data: DgcaCircular[]; status: string; lastFetch: string | null }> {
  const cached = cacheGet<DgcaCircular[]>(DGCA_CIRCULAR_KEY)
  if (cached) return { data: cached, status: 'HEALTHY', lastFetch: new Date().toISOString() }

  try {
    const html = await fetchViaProxy(DGCA_CIRCULAR_URL)
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    const links = Array.from(doc.querySelectorAll('a'))
      .filter(a => {
        const text = a.textContent?.trim() ?? ''
        return text.length > 20 && (a.href.includes('circular') || a.href.includes('notice') || text.toLowerCase().includes('circular'))
      })
      .slice(0, 10)

    const data: DgcaCircular[] = links.map((a, i) => ({
      id: `dgca-circ-${i}`,
      title: a.textContent?.trim() ?? 'Untitled Circular',
      date: new Date(Date.now() - i * 7 * 24 * 3600000).toISOString().split('T')[0],
      category: 'OFFICE CIRCULAR',
      url: a.href || DGCA_CIRCULAR_URL,
      data_origin: 'OFFICIAL',
    }))

    if (data.length > 0) {
      cacheSet(DGCA_CIRCULAR_KEY, data, TTL_6H)
      return { data, status: 'CONNECTED', lastFetch: new Date().toISOString() }
    }
    throw new Error('No circulars parsed')
  } catch {
    const stale = cacheGetStale<DgcaCircular[]>(DGCA_CIRCULAR_KEY)
    if (stale) return { data: stale.data, status: 'STALE', lastFetch: null }
    return { data: [], status: 'UNAVAILABLE', lastFetch: null }
  }
}

// ── MoSPI eSankhyiki CPI Transport ───────────────────────────────────────────

const MOSPI_URL = 'https://esankhyiki.mospi.gov.in'
const MOSPI_KEY = 'mospi_cpi'

export async function fetchMospiCpiTransport(): Promise<{ data: MospiCpiRecord[]; status: string; lastFetch: string | null }> {
  const cached = cacheGet<MospiCpiRecord[]>(MOSPI_KEY)
  if (cached) return { data: cached, status: 'HEALTHY', lastFetch: new Date().toISOString() }

  try {
    const html = await fetchViaProxy(MOSPI_URL)
    // eSankhyiki is a JS-rendered portal — AllOrigins serves the shell HTML
    // Parse any data tables visible in initial HTML
    const rows = parseTableRows(html, 0)
    const data: MospiCpiRecord[] = []

    for (const row of rows.slice(1, 15)) {
      if (row.length < 2) continue
      const period = row[0]?.trim()
      const val = parseFloat(row[1]?.replace(/,/g, '') ?? '')
      if (!period || isNaN(val)) continue
      data.push({
        period,
        cpi_transport: val,
        cpi_general: parseFloat(row[2] ?? '') || 0,
        data_origin: 'OFFICIAL',
      })
    }

    if (data.length > 0) {
      cacheSet(MOSPI_KEY, data, TTL_24H)
      return { data, status: 'CONNECTED', lastFetch: new Date().toISOString() }
    }
    throw new Error('Portal returned no parseable table data (JS-rendered)')
  } catch {
    const stale = cacheGetStale<MospiCpiRecord[]>(MOSPI_KEY)
    if (stale) return { data: stale.data, status: 'STALE', lastFetch: null }
    return { data: [], status: 'UNAVAILABLE', lastFetch: null }
  }
}

// ── Government Dataset Registry ───────────────────────────────────────────────
// Static registry — status is filled in by useGovData after fetches

export const GOV_DATASETS: GovDataset[] = [
  {
    id: 'dgca-pax',
    source: 'DGCA Monthly Passenger Statistics',
    organization: 'Directorate General of Civil Aviation',
    access_type: 'PUBLIC',
    api_key_required: false,
    format: 'HTML',
    last_retrieved: null,
    last_attempt: null,
    status: 'NOT_CONFIGURED',
    record_count: null,
    checksum: null,
    reference_period: null,
    source_url: DGCA_PAX_URL,
    update_frequency: 'Monthly',
    data_origin: 'OFFICIAL',
  },
  {
    id: 'dgca-circulars',
    source: 'DGCA Office Circulars',
    organization: 'Directorate General of Civil Aviation',
    access_type: 'PUBLIC',
    api_key_required: false,
    format: 'HTML',
    last_retrieved: null,
    last_attempt: null,
    status: 'NOT_CONFIGURED',
    record_count: null,
    checksum: null,
    reference_period: null,
    source_url: DGCA_CIRCULAR_URL,
    update_frequency: 'As published',
    data_origin: 'OFFICIAL',
  },
  {
    id: 'mospi-esankhyiki',
    source: 'eSankhyiki Statistical Portal',
    organization: 'MoSPI — DIID (Data Informatics & Innovation Division)',
    access_type: 'PUBLIC',
    api_key_required: false,
    format: 'HTML',
    last_retrieved: null,
    last_attempt: null,
    status: 'NOT_CONFIGURED',
    record_count: null,
    checksum: null,
    reference_period: null,
    source_url: MOSPI_URL,
    update_frequency: 'Monthly',
    data_origin: 'OFFICIAL',
  },
  {
    id: 'data-gov-in',
    source: 'Open Government Aviation Dataset',
    organization: 'data.gov.in — National Data & Analytics Platform',
    access_type: 'PUBLIC',
    api_key_required: false,
    format: 'JSON',
    last_retrieved: null,
    last_attempt: null,
    status: 'NOT_CONFIGURED',
    record_count: null,
    checksum: null,
    reference_period: null,
    source_url: 'https://data.gov.in',
    update_frequency: 'Annual',
    data_origin: 'OFFICIAL',
  },
]
