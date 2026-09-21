export type DataOrigin = 'REAL' | 'OFFICIAL' | 'DERIVED' | 'GENERATED'

export type FareFamilyType = 'SAVER' | 'FLEX' | 'BUSINESS' | 'PREMIUM'
export type CabinType = 'ECONOMY' | 'BUSINESS' | 'FIRST'
export type BookingWindow = 1 | 7 | 15 | 30 | 45

export interface FareObservation {
  observation_id: string
  collected_at: string        // ISO datetime
  travel_date: string         // ISO date
  origin: string
  destination: string
  route: string               // e.g. "DEL-BOM"
  carrier: string
  flight_number: string
  source: string
  source_url: string
  fare_family: FareFamilyType
  cabin: CabinType
  stops: number
  departure_time: string
  arrival_time: string
  base_fare: number
  taxes: number
  fees: number
  total_fare: number
  currency: 'INR'
  availability_status: 'AVAILABLE' | 'SOLD_OUT' | 'UNKNOWN'
  advance_days: number
  query_timestamp: string
  collector_version: string
  raw_hash: string
  data_origin: DataOrigin
  quality_flags: string[]
}

export type GovSourceStatus =
  | 'CONNECTED'
  | 'HEALTHY'
  | 'UNAVAILABLE'
  | 'STALE'
  | 'FAILED'
  | 'NOT_CONFIGURED'
  | 'AUTH_REQUIRED'

export type AirfareSourceStatus =
  | 'CHALLENGE_DETECTED'
  | 'SOURCE_BLOCKED'
  | 'AUTH_REQUIRED'
  | 'NOT_CONFIGURED'
  | 'CONNECTED'
  | 'FAILED'

export interface GovDataset {
  id: string
  source: string
  organization: string
  access_type: 'PUBLIC' | 'AUTHENTICATED'
  api_key_required: boolean
  format: 'JSON' | 'CSV' | 'XLSX' | 'PDF' | 'HTML'
  last_retrieved: string | null
  last_attempt: string | null
  status: GovSourceStatus
  record_count: number | null
  checksum: string | null
  reference_period: string | null
  source_url: string
  update_frequency: string
  data_origin: DataOrigin
}

export interface AirfareSource {
  id: string
  name: string
  organization: string
  source_url: string
  status: AirfareSourceStatus
  status_reason: string
  robots_txt: 'DISALLOWED' | 'ALLOWED' | 'UNKNOWN'
  captcha_detected: boolean
  api_available: boolean
  last_attempt: string | null
  records_received: number
}

export interface DgcaCircular {
  id: string
  title: string
  date: string
  category: string
  url: string
  data_origin: DataOrigin
}

export interface DgcaMonthlyRecord {
  month: string              // "2026-08"
  year: number
  domestic_passengers: number
  international_passengers: number
  top_airline: string
  data_origin: DataOrigin
}

export interface MospiCpiRecord {
  period: string
  cpi_transport: number
  cpi_general: number
  base_year?: number
  definition?: string
  series?: string
  source_url?: string
  data_origin: DataOrigin
}
