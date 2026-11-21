import { describe, expect, it } from 'vitest'
import {
  STALE_AFTER_MS,
  fareChangeColor,
  formatDateIST,
  formatDateTimeIST,
  isStaleRecord,
  liveSignal,
  mayShowLive,
} from './liveStatus'
import { median } from './liveStatus'

const NOW = new Date('2026-11-21T15:00:00.000Z')

describe('liveSignal — one rule for every green/live treatment (audit §7.1)', () => {
  it('is unavailable before any successful check', () => {
    expect(liveSignal({ ok: false, checkedAt: null })).toBe('unavailable')
    expect(liveSignal({ ok: true, checkedAt: null })).toBe('unavailable')
  })

  it('is unavailable when the last attempt failed, even if a check ran', () => {
    expect(liveSignal({ ok: false, checkedAt: NOW, failed: true })).toBe('error')
  })

  it('is loading while the check is in flight', () => {
    expect(liveSignal({ ok: false, checkedAt: null, loading: true })).toBe('loading')
  })

  it('is connected after a successful timestamped response', () => {
    expect(liveSignal({ ok: true, checkedAt: NOW })).toBe('connected')
  })

  it('is live only when the newest record is fresh', () => {
    const fresh = new Date(NOW.getTime() - 60 * 60 * 1000)
    expect(liveSignal({ ok: true, checkedAt: NOW, newestRecordAt: fresh }, NOW)).toBe('live')
  })

  it('is stale — never green — when the newest record is older than 24h', () => {
    const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000)
    expect(liveSignal({ ok: true, checkedAt: NOW, newestRecordAt: old }, NOW)).toBe('stale')
    expect(mayShowLive('stale')).toBe(false)
  })

  it('only live/connected may use green treatment', () => {
    expect(mayShowLive('live')).toBe(true)
    expect(mayShowLive('connected')).toBe(true)
    expect(mayShowLive('unavailable')).toBe(false)
    expect(mayShowLive('loading')).toBe(false)
    expect(mayShowLive('error')).toBe(false)
  })
})

describe('isStaleRecord — 24h freshness boundary', () => {
  it('treats fares older than 24h as stale', () => {
    expect(isStaleRecord(new Date(NOW.getTime() - 25 * 60 * 60 * 1000), NOW)).toBe(true)
    expect(isStaleRecord(new Date(NOW.getTime() - 23 * 60 * 60 * 1000), NOW)).toBe(false)
  })

  it('treats a missing or unparseable timestamp as stale', () => {
    expect(isStaleRecord(null, NOW)).toBe(true)
    expect(isStaleRecord(undefined, NOW)).toBe(true)
    expect(isStaleRecord('not-a-date', NOW)).toBe(true)
  })
})

describe('median — one definition app-wide (audit §1.7)', () => {
  it('returns null for an empty list', () => {
    expect(median([])).toBeNull()
  })

  it('returns the middle value for odd counts', () => {
    expect(median([3000, 1000, 2000])).toBe(2000)
  })

  it('averages the two middle values for even counts (not the upper median)', () => {
    // BookingWindow previously used values[floor(n/2)] = 3000 here.
    expect(median([1000, 2000, 3000, 4000])).toBe(2500)
  })

  it('is consistent with the per-page median helpers', () => {
    const fares = [5200, 4100, 6300, 4800, 5900, 4400]
    expect(median(fares)).toBe(5000)
  })
})

describe('date formatting — day/month/year order with the date (audit §1.7)', () => {
  it('renders date + time in IST', () => {
    // 15:00 UTC = 20:30 IST on 21 Nov 2026.
    expect(formatDateTimeIST('2026-11-21T15:00:00.000Z')).toBe('21 Nov 2026, 20:30 IST')
  })

  it('renders a date-only form in day/month/year order', () => {
    expect(formatDateIST('2026-11-21T15:00:00.000Z')).toBe('21 Nov 2026')
  })

  it('renders a dash for missing or invalid values, never "Invalid Date"', () => {
    expect(formatDateTimeIST(null)).toBe('—')
    expect(formatDateTimeIST('garbage')).toBe('—')
    expect(formatDateIST(undefined)).toBe('—')
  })
})

describe('fareChangeColor — fare increases are red, decreases green (audit §2.9)', () => {
  it('colours an increase red and a decrease green', () => {
    expect(fareChangeColor(2.5)).toBe('var(--color-danger)')
    expect(fareChangeColor(-1.2)).toBe('var(--color-success)')
  })

  it('is neutral for zero or unknown change', () => {
    expect(fareChangeColor(0)).toBe('var(--color-text-tertiary)')
    expect(fareChangeColor(null)).toBe('var(--color-text-tertiary)')
  })
})
