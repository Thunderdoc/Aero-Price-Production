import { useState } from 'react'
import { AlertTriangle, RefreshCw, Filter, Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import type { FareObservation } from '../types/observation'

// Pipeline stages displayed as a horizontal flow banner
const PIPELINE_STAGES = ['Acquisition', 'ETL & Validation', 'Jevons Index', 'CPI Augmentation']

// No real airfare sources are accessible — all show CHALLENGE DETECTED
const AIRFARE_SOURCES = [
  { name: 'IndiGo', code: 'IGO', status: 'CHALLENGE_DETECTED', reason: 'Cloudflare bot protection' },
  { name: 'Air India', code: 'AIC', status: 'CHALLENGE_DETECTED', reason: 'Anti-scrape middleware' },
  { name: 'Air India Express', code: 'IAX', status: 'CHALLENGE_DETECTED', reason: 'Shared CDN protection' },
  { name: 'Akasa Air', code: 'QP', status: 'CHALLENGE_DETECTED', reason: 'JS-rendered SPA + CAPTCHA' },
  { name: 'SpiceJet', code: 'SG', status: 'CHALLENGE_DETECTED', reason: 'Cloudflare + fingerprinting' },
]

const FILTERS = {
  origin: ['ALL', 'DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'CCU'],
  airline: ['ALL', 'IndiGo', 'Air India', 'Akasa Air', 'SpiceJet'],
  window: ['ALL', 'T+1', 'T+7', 'T+15', 'T+30', 'T+45'],
  origin_type: ['ALL', 'REAL', 'OFFICIAL', 'GENERATED'],
}

const TABLE_COLS = ['Timestamp', 'Route', 'Airline', 'Travel Date', 'Window', 'Base', 'Taxes', 'Total', 'Source', 'Quality', 'Status', 'Audit']

export default function LiveFares() {
  const [origin, setOrigin] = useState('ALL')
  const [airline, setAirline] = useState('ALL')
  const [window, setWindow] = useState('ALL')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // No real observations available — all sources blocked
  const observations: FareObservation[] = []

  function handleRefresh() {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 1200)
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)' }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>Live Fares</h1>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
            Real-time airfare observations — ONE-WAY · ADULT · ECONOMY · CHEAPEST AVAILABLE
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <Button variant="neutral" iconStart={<Download size={14} />} onClick={() => {}}>Export CSV</Button>
          <Button variant="neutral" iconStart={<RefreshCw size={14} />} loading={isRefreshing} onClick={handleRefresh}>Refresh</Button>
        </div>
      </div>

      {/* Pipeline banner */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: i === 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>{stage}</span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>→</span>}
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.06em' }}>
          ACQUISITION BLOCKED — ALL SOURCES
        </div>
      </div>

      {/* Source status strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-sm)' }}>
        {AIRFARE_SOURCES.map(src => (
          <div key={src.code} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{src.name}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>{src.code}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 4 }}>
              <AlertTriangle size={10} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>CHALLENGE DETECTED</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{src.reason}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Filter size={13} style={{ color: 'var(--color-text-tertiary)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>FILTERS</span>
          </div>
          {[
            { label: 'ORIGIN', value: origin, set: setOrigin, opts: FILTERS.origin },
            { label: 'AIRLINE', value: airline, set: setAirline, opts: FILTERS.airline },
            { label: 'WINDOW', value: window, set: setWindow, opts: FILTERS.window },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{f.label}</span>
              <select
                value={f.value}
                onChange={e => f.set(e.target.value)}
                style={{ fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}
              >
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border-primary)' }}>
                {TABLE_COLS.map(col => (
                  <th key={col} style={{ padding: 'var(--space-sm) var(--space-lg)', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {observations.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLS.length} style={{ padding: 'var(--space-4xl) var(--space-xl)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-md)' }}>
                      <AlertTriangle size={32} style={{ color: 'var(--color-warning)' }} />
                      <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)' }}>NO LIVE OBSERVATIONS</div>
                      <div style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', maxWidth: 480, lineHeight: 1.65, textAlign: 'center' }}>
                        All 5 airline sources show <strong>CHALLENGE DETECTED</strong>. Browser-based scraping is blocked by Cloudflare and CAPTCHA protection on all major Indian carriers.
                        Configure a server-side backend collector (Playwright/Scrapy with ethical rate limiting) to receive real observations.
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                        <div style={{ padding: '6px 14px', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 600, color: 'var(--color-warning)', letterSpacing: '0.06em' }}>0 of 0 records</div>
                        <div style={{ padding: '6px 14px', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-full)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>Last attempt: —</div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 'var(--space-md) var(--space-xl)', borderTop: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>0 observations · Page 1 of 0</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>Jevons matched-sample · One-way · Economy · Cheapest available</span>
        </div>
      </div>

      {/* Info box */}
      <div style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(3,105,161,0.2)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-xl)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-info)', marginBottom: 'var(--space-sm)', fontFamily: 'var(--font-sans)', letterSpacing: '0.06em' }}>ABOUT REAL AIRFARE COLLECTION</div>
        <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.65, margin: 0 }}>
          Hourly polling provides high-frequency observations; price changes may occur between observations.
          Collection requires ethical server-side automation with robots.txt compliance and rate limiting.
          Airline websites implement anti-automation protections that cannot be bypassed from a browser context.
          The SIH26056 methodology mandates observations across booking windows T+1, T+7, T+15, T+30, and T+45
          for each of 18+ corridors per carrier.
        </p>
      </div>
    </div>
  )
}
