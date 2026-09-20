import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — DB features disabled')
}

export const supabase = createClient(
  SUPABASE_URL  ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON ?? 'placeholder',
  { auth: { persistSession: true } }
)

export const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON)

// ── Fare observation persistence ─────────────────────────────────────────────
import type { FareResult } from './fareSearch'

export async function saveFareObservations(fares: FareResult[]) {
  if (!SUPABASE_CONFIGURED || fares.length === 0) return { error: null, count: 0 }
  const rows = fares.map(f => ({
    origin:         f.origin,
    destination:    f.destination,
    route:          `${f.origin}-${f.destination}`,
    airline:        f.airline,
    flight_number:  f.flight_number,
    departure_time: f.departure_time,
    arrival_time:   f.arrival_time,
    duration:       f.duration,
    stops:          f.stops,
    total_fare:     f.price,
    currency:       f.currency,
    cabin:          f.cabin,
    data_origin:    'REAL',
    source:         f.source,
    collected_at:   f.fetched_at,
  }))
  const { error } = await supabase.from('fare_observations').upsert(rows, { onConflict: 'route,flight_number,departure_time,collected_at' })
  return { error, count: rows.length }
}

export async function getFareObservations(route?: string) {
  if (!SUPABASE_CONFIGURED) return []
  let q = supabase
    .from('fare_observations')
    .select('*')
    .order('collected_at', { ascending: false })
    .limit(200)
  if (route) q = q.eq('route', route)
  const { data, error } = await q
  if (error) { console.error('[Supabase] getFareObservations:', error.message); return [] }
  return data ?? []
}

export async function getPriceAlerts(userEmail?: string) {
  if (!SUPABASE_CONFIGURED) return []
  let q = supabase.from('price_alerts').select('*').order('created_at', { ascending: false })
  if (userEmail) q = q.eq('user_email', userEmail)
  const { data, error } = await q
  if (error) { console.error('[Supabase] getPriceAlerts:', error.message); return [] }
  return data ?? []
}

export async function savePriceAlert(alert: {
  user_email: string; route: string; threshold_fare: number; travel_date?: string
}) {
  if (!SUPABASE_CONFIGURED) return { error: 'Supabase not configured' }
  const { error } = await supabase.from('price_alerts').insert({
    ...alert,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  })
  return { error: error?.message ?? null }
}
