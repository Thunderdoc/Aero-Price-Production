/**
 * AeroPrice India — typed API client.
 *
 * Reads VITE_API_URL at build time. The live application uses the local/API
 * backend and returns an honest unavailable state when it cannot be reached.
 */

// Local development uses the bundled FastAPI server. Production builds use a
// configured API origin when supplied, otherwise same-origin /api routes. The
// old unconditional localhost fallback made deployed browsers call the user's
// own computer and left every provider card stuck in CONNECTING.
// Accept both the backend origin and an accidentally supplied `/api` suffix
// so production never constructs `/api/api/...` request URLs.
export const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)
  ?.replace(/\/$/, '')
  .replace(/\/api$/, '')
  || (import.meta.env.DEV ? 'http://localhost:8000' : '')

// ── Auth ───────────────────────────────────────────────────────────────────

export interface ApiUser {
  email: string
  name: string
  role: 'PUBLIC' | 'ANALYST' | 'ADMIN'
  plan: 'FREE' | 'SUBSCRIBER' | 'GOVERNMENT' | 'ADMIN'
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: ApiUser
}

export async function apiLogin(email: string, password: string): Promise<TokenResponse> {
  const form = new URLSearchParams({ username: email, password })
  const resp = await fetch(`${BASE_URL}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!resp.ok) throw new Error('Invalid credentials')
  return resp.json()
}

// ── Helpers ────────────────────────────────────────────────────────────────

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...(init?.headers ?? {}) },
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`API ${path}: ${resp.status} ${text}`)
  }
  return resp.json()
}

// ── Health ─────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string
  database: 'connected' | 'error'
  real_observations: number
  live_sources: number
  total_sources: number
  last_collection: string | null
  data_status: 'LIVE' | 'NO_LIVE_DATA'
  timestamp: string
}

export async function apiHealth(): Promise<HealthResponse> {
  return apiFetch('/api/health')
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export interface DashboardResponse {
  real_observations: number
  sources_live: number
  sources_challenge_detected: number
  gov_datasets_connected: number
  collection_runs_today: number
  last_collection: string | null
  index_status: string
  index_value: number | null
  current_fare_rate?: number | null
  routes_tracked?: number | null
  price_drops?: number | null
  cpi_transport?: number | null
  cpi_period?: string | null
  cpi_base_year?: number | null
  note: string
  timestamp: string
}

export async function apiDashboard(token?: string): Promise<DashboardResponse> {
  return apiFetch('/api/dashboard', token)
}

export type FareMovementStatus =
  | 'SIGNIFICANT_INCREASE'
  | 'MODERATE_INCREASE'
  | 'STABLE'
  | 'MODERATE_DECREASE'
  | 'SIGNIFICANT_DECREASE'

export interface FareMovementResponse {
  available: boolean
  current_period?: string
  previous_period?: string
  price_drops: number | null
  routes_with_change?: number
  routes: Array<{
    route: string
    previous_fare: number
    current_fare: number
    change_pct: number
    status: FareMovementStatus
  }>
  states: Record<string, { change_pct: number; status: FareMovementStatus; routes: number }>
  modeled_states?: Record<string, { change_pct: number; status: FareMovementStatus; routes: number; provenance: 'MODELED'; basis: string; period: string }>
  message?: string | null
}

export async function apiFareMovement(token?: string): Promise<FareMovementResponse> {
  return apiFetch('/api/dashboard/fare-movement', token)
}

export interface IndexHistoryResponse {
  observations: Array<{ period: string; value: number | null; status: string; route_count: number; observation_count: number; data_origin: string }>
}

// ── Fares ──────────────────────────────────────────────────────────────────

export interface FareObservationApi {
  observation_id: string
  route: string
  airline: string
  flight_number?: string | null
  departure_time?: string | null
  arrival_time?: string | null
  stops?: number | null
  travel_date: string
  advance_days: number
  fare_family: string
  cabin: string
  base_fare: number
  taxes: number
  total_fare: number
  currency: string
  source: string
  data_origin: string
  collected_at: string
  quality_flags: string[]
}

export interface FaresResponse {
  observations: FareObservationApi[]
  total: number
  page: number
  page_size: number
  note: string
}

export async function apiFares(
  params: { route?: string; origin?: string; destination?: string; airline?: string; travel_date?: string; cabin?: string; advance_days?: number; data_origin?: string; limit?: number; offset?: number },
  token?: string,
): Promise<FaresResponse> {
  const qs = new URLSearchParams()
  if (params.route) qs.set('route', params.route)
  if (params.origin) qs.set('origin', params.origin)
  if (params.destination) qs.set('destination', params.destination)
  if (params.airline) qs.set('airline', params.airline)
  if (params.travel_date) qs.set('travel_date', params.travel_date)
  if (params.cabin) qs.set('cabin', params.cabin)
  if (params.advance_days != null) qs.set('advance_days', String(params.advance_days))
  if (params.data_origin) qs.set('data_origin', params.data_origin)
  if (params.limit != null) qs.set('limit', String(params.limit))
  if (params.offset != null) qs.set('offset', String(params.offset))
  return apiFetch(`/api/fares?${qs}`, token)
}

export async function apiLiveFares(route: string, travelDate: string, token?: string): Promise<{
  status: string
  provider_status: string
  route: string
  travel_date: string
  source: string
  data_origin: string
  observations: FareObservationApi[]
  rejected_count: number
  error?: string | null
}> {
  return apiFetch(`/api/fares/live?route=${encodeURIComponent(route)}&travel_date=${encodeURIComponent(travelDate)}`, token)
}

export async function apiFareSummary(route: string, token?: string) {
  return apiFetch(`/api/fares/summary/${route}`, token)
}

export interface ForecastResponse {
  status: 'FORECAST' | 'INSUFFICIENT_DATA' | 'NO_DATA'
  route: string
  advance_days: number
  cabin: string
  n_obs?: number
  required?: number
  message?: string
  forecasts: Array<{ horizon_days: number; forecast_fare: number; lower_bound: number; upper_bound: number; currency: string }>
  metrics: null | { n_obs: number; holdout_n: number; mae: number; rmse: number; mape_pct: number; model_version: string; trained_at: string }
  data_origin?: string
  disclaimer?: string
}

export async function apiForecast(route: string, advanceDays: number, token?: string): Promise<ForecastResponse> {
  return apiFetch(`/api/forecast/${encodeURIComponent(route)}?advance_days=${advanceDays}&cabin=ECONOMY`, token)
}

export interface AnomalyResponse {
  anomalies: Array<{ observation_id: string; route: string; advance_days: number; cabin: string; total_fare: number; airline: string; travel_date: string; data_origin: string; quality_flags: string[]; collected_at: string }>
  total_shown: number
  summary: { total_observations: number; flagged_anomalies: number; flag_rate_pct: number }
  method: string
  threshold: number
  min_sample: number
  status: string
}

export async function apiAnomalies(token?: string): Promise<AnomalyResponse> {
  return apiFetch('/api/anomalies', token)
}

export async function apiRunAnomalyDetection(token?: string): Promise<{ status: string; buckets_analyzed: number; anomalies_flagged: number }> {
  return apiFetch('/api/anomalies/run-detection', token, { method: 'POST' })
}

// ── Index ──────────────────────────────────────────────────────────────────

export interface IndexResponse {
  status: 'PUBLISHED' | 'CALCULATED' | 'INSUFFICIENT_DATA' | 'NO_DATA'
  index_value: number | null
  base_value?: number
  base_period?: string
  n?: number
  required?: number
  covered_routes?: string[]
  missing_routes?: string[]
  observation_period?: string
  method?: string
  version?: string
  data_origin?: string
  route_count?: number
  coverage_pct?: number
  message?: string
}

export async function apiIndexCurrent(token?: string): Promise<IndexResponse> {
  return apiFetch('/api/index/current', token)
}

export async function apiIndexHistory(token?: string) {
  return apiFetch('/api/index/history', token)
}

// ── Sources ────────────────────────────────────────────────────────────────

export interface SourceApi {
  id: string
  name: string
  type: string
  status: string
  challenge_reason?: string
  robots_txt?: string
  captcha_detected?: boolean
  records_total?: number
  last_success?: string
  last_attempt?: string
  latency_ms_avg?: number
}

export async function apiSources(token?: string): Promise<{ airfare: SourceApi[]; government: SourceApi[] }> {
  return apiFetch('/api/sources', token)
}

// ── Government ─────────────────────────────────────────────────────────────

export interface GovDatasetApi {
  dataset_id: string
  source_name: string
  organization: string
  access_type: string
  api_key_required: string
  format: string
  source_url: string
  status: string
  last_retrieved: string | null
  last_attempt: string | null
  record_count: number | null
  failure_reason: string | null
  reference_period: string | null
}

export async function apiGovDatasets(token?: string): Promise<{ datasets: GovDatasetApi[] }> {
  return apiFetch('/api/government/datasets', token)
}

export async function apiDgcaMonthly(token?: string) {
  return apiFetch('/api/government/dgca/monthly', token)
}

export async function apiMospiCpi(token?: string) {
  return apiFetch('/api/government/mospi/cpi', token)
}

export async function apiDgcaCirculars(token?: string) {
  return apiFetch('/api/government/dgca/circulars', token)
}

export async function apiPpacAtf(token?: string) {
  return apiFetch<{ count: number; data_origin: string; measure: string; unit: string; note: string; records: Array<{ effective_date: string; atf_export_duty_per_litre: number }> }>('/api/government/ppac/atf', token)
}

export async function apiDataGovAviation(token?: string) {
  return apiFetch<{ count: number; data_origin: string; records: Array<{ resource_id: string; record: Record<string, unknown> }> }>('/api/government/data-gov/aviation', token)
}

export async function apiGovRefresh(token?: string) {
  return apiFetch('/api/government/refresh', token, { method: 'POST' })
}

// ── Historical snapshots ───────────────────────────────────────────────────

export interface HistoricalSummary {
  status: 'READY' | 'NOT_IMPORTED' | 'IMPORTED' | 'ALREADY_IMPORTED'
  records: number
  source: string
  data_origin: string
  period_start?: string
  period_end?: string
  average_fare?: number
  min_fare?: number
  max_fare?: number
  note?: string
}

export async function apiHistoricalSummary(token?: string): Promise<HistoricalSummary> {
  return apiFetch('/api/historical/summary', token)
}

export async function apiHistoricalBackfill(token?: string): Promise<HistoricalSummary> {
  return apiFetch('/api/historical/backfill', token, { method: 'POST' })
}

// ── Collections ─────────────────────────────────────────────────────────────

export async function apiCollections(token?: string) {
  return apiFetch('/api/collections', token)
}

export async function apiTriggerCollection(token?: string) {
  return apiFetch('/api/collections/trigger', token, { method: 'POST' })
}

export async function apiSourceHealth(token?: string) {
  return apiFetch('/api/source-health', token)
}

// ── Admin ──────────────────────────────────────────────────────────────────

export async function apiAdminUsers(token?: string): Promise<{ users: Array<Record<string, any>> }> {
  return apiFetch('/api/admin/users', token)
}

export async function apiSubmitFeedback(message: string, token?: string) {
  return apiFetch('/api/admin/feedback', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
}

export async function apiAdminFeedback(token?: string): Promise<{ feedback: Array<Record<string, any>> }> {
  return apiFetch('/api/admin/feedback', token)
}

export async function apiUpdateFeedback(id: string, status: 'NEW' | 'REVIEWED', token?: string) {
  return apiFetch(`/api/admin/feedback/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
}

export async function apiCreateAccessRequest(featureKey: string, featureName: string, token?: string) {
  return apiFetch('/api/access-requests', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature_key: featureKey, feature_name: featureName }),
  })
}

export async function apiMyAccessRequests(token?: string): Promise<{ requests: Array<Record<string, any>> }> {
  return apiFetch('/api/access-requests', token)
}

export async function apiAdminAccessRequests(token?: string): Promise<{ requests: Array<Record<string, any>> }> {
  return apiFetch('/api/admin/access-requests', token)
}

export async function apiApproveAccessRequest(id: string, token?: string) {
  return apiFetch(`/api/admin/access-requests/${encodeURIComponent(id)}/approve`, token, { method: 'POST' })
}

export async function apiRejectAccessRequest(id: string, reason?: string, token?: string) {
  return apiFetch(`/api/admin/access-requests/${encodeURIComponent(id)}/reject`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejection_reason: reason || null }),
  })
}

export async function apiNotifications(token?: string) {
  return apiFetch('/api/notifications', token)
}

export async function apiAuditLog(token: string, limit = 50) {
  return apiFetch(`/api/admin/audit-log?limit=${limit}`, token)
}

export async function apiSystemMetrics(token: string): Promise<{ hasAnyConfiguredApi?: boolean; [key: string]: any }> {
  return apiFetch('/api/admin/system-metrics', token)
}

// ── Backend availability check ─────────────────────────────────────────────

let _backendAvailable: boolean | null = null

export async function isBackendAvailable(): Promise<boolean> {
  if (_backendAvailable !== null) return _backendAvailable
  try {
    const resp = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) })
    _backendAvailable = resp.ok
  } catch {
    _backendAvailable = false
  }
  return _backendAvailable
}

export function resetBackendAvailability() {
  _backendAvailable = null
}
