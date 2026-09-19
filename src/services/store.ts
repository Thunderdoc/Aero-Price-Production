// localStorage cache with TTL for government data fetches

const PREFIX = 'aeroprice_gov_'

interface CacheEntry<T> {
  data: T
  fetchedAt: string   // ISO
  ttlMs: number
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const age = Date.now() - new Date(entry.fetchedAt).getTime()
    if (age > entry.ttlMs) return null   // expired
    return entry.data
  } catch {
    return null
  }
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  try {
    const entry: CacheEntry<T> = { data, fetchedAt: new Date().toISOString(), ttlMs }
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // ignore quota errors
  }
}

export function cacheGetStale<T>(key: string): { data: T; stale: boolean } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    const age = Date.now() - new Date(entry.fetchedAt).getTime()
    return { data: entry.data, stale: age > entry.ttlMs }
  } catch {
    return null
  }
}

export function cacheClear(key: string): void {
  localStorage.removeItem(PREFIX + key)
}
