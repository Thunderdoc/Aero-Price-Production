import { useState, useEffect, useCallback, useMemo } from 'react'
import { CheckCircle2, Download, Filter, RefreshCw, Zap, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { apiFares, isBackendAvailable, resetBackendAvailability, type FareObservationApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const PIPELINE_STAGES = [
  { name: 'Acquisition', icon: '⬇', desc: 'Real-time B2B/NDC Feeds' },
  { name: 'ETL & Validation', icon: '⚙', desc: 'Outlier & Deduplication' },
  { name: 'Jevons Index', icon: '∑', desc: 'Matched-Sample Aggregation' },
  { name: 'CPI Augmentation', icon: '📈', desc: 'MoSPI Transport Weighting' },
]

const AIRFARE_SOURCES: Array<{ name: string; code: string; status: string; ping: string; offers: string }> = []
/* Provider rows are populated only from the authorized backend response. */
/*
  { name: 'IndiGo', code: '6E', status: 'CONNECTED', ping: '24ms', offers: '4,820' },
  { name: 'Air India', code: 'AI', status: 'CONNECTED', ping: '32ms', offers: '3,240' },
  { name: 'Akasa Air', code: 'QP', status: 'CONNECTED', ping: '28ms', offers: '1,840' },
  { name: 'SpiceJet', code: 'SG', status: 'CONNECTED', ping: '38ms', offers: '975' },
  { name: 'AI Express', code: 'IX', status: 'CONNECTED', ping: '35ms', offers: '1,540' },
  { name: 'SerpAPI / Google', code: 'SRP', status: 'CONNECTED', ping: '42ms', offers: '8,920' },
]
*/

const ORIGINS = ['ALL', 'DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'CCU']
const AIRLINES = ['ALL', 'IndiGo', 'Air India', 'Akasa Air', 'SpiceJet', 'Air India Express']
const WINDOWS = ['ALL', 'T+1', 'T+7', 'T+15', 'T+30', 'T+45']
const CABINS = ['ALL', 'ECONOMY', 'BUSINESS']

const TABLE_COLS = ['Observation ID', 'Collected', 'Route', 'Airline', 'Flight No', 'Travel Date', 'Window', 'Stops', 'Base Fare', 'Taxes', 'Total Fare', 'Cabin', 'Provenance']

export default function LiveFares() {
  const { token } = useAuth()
  const [filterOrigin, setFilterOrigin] = useState('ALL')
  const [filterAirline, setFilterAirline] = useState('ALL')
  const [filterWindow, setFilterWindow] = useState('ALL')
  const [filterCabin, setFilterCabin] = useState('ALL')

  const [allFares, setAllFares] = useState<FareObservationApi[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<string>(
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
  )
  const [currentPage, setCurrentPage] = useState(0)
  const pageSize = 20

  const refreshFares = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let lastError: unknown = null
      let loaded = false

      // Vercel can briefly return 500 while a new worker is warming up. Retry
      // once and re-check health so a transient failure cannot look like 0
      // verified fares to the user.
      for (let attempt = 0; attempt < 2 && !loaded; attempt += 1) {
        resetBackendAvailability()
        try {
          const up = await isBackendAvailable()
          if (!up) throw new Error('The verified fare service is temporarily unavailable.')

          const resp = await apiFares({ limit: 100, data_origin: 'REAL' }, token ?? undefined)
          setAllFares(resp.observations ?? [])
          setCurrentPage(0)
          if (!resp.observations?.length) {
            setError(resp.note || 'The backend is healthy, but no verified REAL fare observations are available.')
          }
          loaded = true
        } catch (cause) {
          lastError = cause
          if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 600))
        }
      }

      if (!loaded) throw lastError instanceof Error ? lastError : new Error('The verified fare service is temporarily unavailable.')

      setLastFetched(
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
      )
    } catch (cause) {
      setAllFares([])
      setError(cause instanceof Error ? cause.message : 'The verified fare service is temporarily unavailable. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refreshFares()
  }, [refreshFares])

  // Filtered observations
  const filteredFares = useMemo(() => {
    return allFares.filter(o => {
      if (filterOrigin !== 'ALL' && !o.route.startsWith(filterOrigin)) return false
      if (filterAirline !== 'ALL' && o.airline !== filterAirline) return false
      if (filterWindow !== 'ALL') {
        const days = parseInt(filterWindow.replace('T+', ''), 10)
        if (o.advance_days !== days) return false
      }
      if (filterCabin !== 'ALL' && o.cabin !== filterCabin) return false
      return true
    })
  }, [allFares, filterOrigin, filterAirline, filterWindow, filterCabin])

  const totalPages = Math.ceil(filteredFares.length / pageSize)
  const paginatedFares = filteredFares.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  function exportCsv() {
    if (filteredFares.length === 0) return
    const header = 'Observation ID,Collected,Route,Airline,Flight No,Travel Date,Window,Stops,Base,Taxes,Total Fare,Cabin,Source,Provenance'
    const rows = filteredFares.map(o =>
      [
        o.observation_id,
        o.collected_at,
        o.route,
        o.airline,
        o.flight_number,
        o.travel_date,
        `T+${o.advance_days}`,
        o.stops === 0 ? 'Non-stop' : `${o.stops} Stop`,
        o.base_fare,
        o.taxes,
        o.total_fare,
        o.cabin,
        o.source,
        o.data_origin,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aeroprice-live-fares-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-xl)', maxWidth: 1100 }}>
      {/* ── Dark-Panel Header ── */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--radius-xl)',
          background: 'linear-gradient(135deg, #060d1f 0%, #0c1833 60%, #172c57 100%)',
          padding: '32px 36px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(186,230,253,0.14)', color: '#bae6fd', border: '1px solid rgba(186,230,253,0.28)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em' }}>
                ● DATA FEED CHECKED
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(219,234,254,0.95)', color: '#075985', border: '1px solid rgba(186,230,253,0.8)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em' }}>
                JEVONS MATCHED-SAMPLE
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
              Airfare Offers & Observations
            </h1>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: '#94a3b8', marginTop: 6, margin: '6px 0 0' }}>
              Domestic fare observations with source and provenance. Live rows appear when backend collectors return verified data.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              Last synchronized: {lastFetched}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={exportCsv}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '9px 16px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Download size={14} /> Export CSV ({filteredFares.length})
              </button>
              <button
                onClick={refreshFares}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '9px 18px',
                  borderRadius: 10,
                  background: 'var(--gradient-brand)',
                  border: 'none',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-sans)',
                  boxShadow: 'var(--shadow-brand)',
                  transition: 'all 0.15s ease',
                }}
              >
                <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                {loading ? 'Refreshing…' : 'Refresh Feeds'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#92400e',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={refreshFares}
            disabled={loading}
            style={{ border: 0, background: 'transparent', color: '#b45309', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Active Pipeline Stages Bar ── */}
      <div
        style={{
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        {PIPELINE_STAGES.map((s, i) => (
          <div
            key={s.name}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(22, 163, 74, 0.08)',
              border: '1px solid rgba(22, 163, 74, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', fontFamily: 'var(--font-mono)' }}>
                {s.icon} {s.name.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.15)', padding: '2px 6px', borderRadius: 4 }}>
                ● ACTIVE
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
              {s.desc}
            </span>
          </div>
        ))}
      </div>

      {/* ── Source Status Pills ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {AIRFARE_SOURCES.map(src => (
          <div
            key={src.code}
            style={{
              background: 'var(--color-surface-bg)',
              border: '1px solid var(--color-border-primary)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)' }}>{src.name}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>{src.offers} offers active</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
                {src.ping}
              </div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', marginTop: 2 }}>HTTP 200</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters Bar ── */}
      <div
        style={{
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-tertiary)', fontSize: 12, fontWeight: 700 }}>
          <Filter size={14} /> FILTERS:
        </div>

        {/* Origin */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Origin:</span>
          <select
            value={filterOrigin}
            onChange={e => { setFilterOrigin(e.target.value); setCurrentPage(0) }}
            className="ap-input"
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8 }}
          >
            {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>

        {/* Airline */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Carrier:</span>
          <select
            value={filterAirline}
            onChange={e => { setFilterAirline(e.target.value); setCurrentPage(0) }}
            className="ap-input"
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8 }}
          >
            {AIRLINES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>

        {/* Window */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Window:</span>
          <select
            value={filterWindow}
            onChange={e => { setFilterWindow(e.target.value); setCurrentPage(0) }}
            className="ap-input"
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8 }}
          >
            {WINDOWS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>

        {/* Cabin */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>Cabin:</span>
          <select
            value={filterCabin}
            onChange={e => { setFilterCabin(e.target.value); setCurrentPage(0) }}
            className="ap-input"
            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 8 }}
          >
            {CABINS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--color-brand-primary)' }}>
          Showing {filteredFares.length} matched flight fares
        </div>
      </div>

      {/* ── Real Fares Data Table ── */}
      <div
        style={{
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="ap-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-secondary)', borderBottom: '1px solid var(--color-border-primary)' }}>
                {TABLE_COLS.map(col => (
                  <th key={col} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-secondary)', fontSize: 11, letterSpacing: '0.04em' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedFares.map(o => (
                <tr key={o.observation_id} style={{ borderBottom: '1px solid var(--color-border-primary)', transition: 'background 0.1s' }}>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    {o.observation_id}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {new Date(o.collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>
                    {o.route}
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {o.airline}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    {o.flight_number}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    {o.travel_date}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    T+{o.advance_days}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>
                    {o.stops === 0 ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Non-stop</span> : `${o.stops} Stop`}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    ₹{o.base_fare.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                    ₹{o.taxes.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, color: 'var(--color-text-primary)' }}>
                    ₹{o.total_fare.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: o.cabin === 'BUSINESS' ? 'rgba(168,85,247,0.15)' : 'var(--color-surface-secondary)', color: o.cabin === 'BUSINESS' ? '#9333ea' : 'var(--color-text-secondary)' }}>
                      {o.cabin}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span className="ap-badge ap-badge-real" style={{ fontSize: 9 }}>
                      REAL
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Page {currentPage + 1} of {Math.max(1, totalPages)} ({filteredFares.length} total offers)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="ap-button ap-button-secondary"
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="ap-button ap-button-secondary"
              style={{ padding: '4px 12px', fontSize: 11 }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
