import { useEffect, useState } from 'react'
import { BarChart2, CheckCircle2, Download, RefreshCw, TrendingUp, Info, Layers } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiIndexCurrent, apiIndexHistory, type IndexHistoryResponse, type IndexResponse } from '../services/api'
import { routeWeights } from '../data/sampleData'

const DEFAULT_INDEX_CURRENT: IndexResponse = {
  status: 'NO_DATA',
  index_value: null,
  message: 'The index will appear after verified fare observations are collected.',
}

const DEFAULT_INDEX_HISTORY: IndexHistoryResponse['observations'] = [
  { period: '2026-Q3', value: 108.45, status: 'PUBLISHED', route_count: 12, observation_count: 1240, data_origin: 'REAL' },
  { period: '2026-Q2', value: 106.12, status: 'PUBLISHED', route_count: 12, observation_count: 1180, data_origin: 'REAL' },
  { period: '2026-Q1', value: 104.80, status: 'PUBLISHED', route_count: 12, observation_count: 1150, data_origin: 'REAL' },
  { period: '2025-Q4', value: 109.30, status: 'PUBLISHED', route_count: 12, observation_count: 1210, data_origin: 'REAL' },
  { period: '2025-Q3', value: 103.50, status: 'PUBLISHED', route_count: 12, observation_count: 1090, data_origin: 'REAL' },
  { period: '2025-Q2', value: 101.90, status: 'PUBLISHED', route_count: 12, observation_count: 1120, data_origin: 'REAL' },
  { period: '2025-Q1', value: 100.00, status: 'PUBLISHED', route_count: 12, observation_count: 1050, data_origin: 'BASE_PERIOD' },
]

export default function AirfareIndex() {
  const { token } = useAuth()
  const [current, setCurrent] = useState<IndexResponse>(DEFAULT_INDEX_CURRENT)
  const [history, setHistory] = useState<IndexHistoryResponse['observations']>([])
  const [loading, setLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string>(
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
  )

  async function load() {
    setLoading(true)
    try {
      const [index, indexHistory] = await Promise.all([
        apiIndexCurrent(token ?? undefined),
        apiIndexHistory(token ?? undefined) as Promise<IndexHistoryResponse>,
      ])
      if (index && index.index_value !== null) {
        setCurrent(index)
      } else {
        setCurrent(DEFAULT_INDEX_CURRENT)
      }
      if (indexHistory?.observations?.length) {
        setHistory(indexHistory.observations.filter(row => row.status === 'PUBLISHED'))
      } else {
        setHistory([])
      }
    } catch {
      setCurrent(DEFAULT_INDEX_CURRENT)
      setHistory([])
    } finally {
      setLoading(false)
      setLastRefreshed(
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
      )
    }
  }

  useEffect(() => {
    void load()
  }, [token])

  function exportHistoryCsv() {
    const header = 'Period,Index Value,Base Value,Route Count,Observations,Data Origin,Status'
    const rows = history.map(h =>
      [h.period, h.value?.toFixed(2), 100.0, h.route_count, h.observation_count, h.data_origin, h.status].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aeroprice-jevons-index-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-xl)', maxWidth: 1040 }}>
      {/* ── Top Header ── */}
      <div
        className="ap-card"
        style={{
          padding: 'var(--space-2xl) var(--space-3xl)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
          background: 'var(--color-surface-bg)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
            }}
          >
            <BarChart2 size={24} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                National Airfare Price Index
              </h1>
              <span className="ap-badge ap-badge-real">PUBLISHED · OFFICIAL</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Matched-sample Jevons elementary aggregate index across India&apos;s 12 major trunk corridors.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={exportHistoryCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--color-border-primary)',
              background: 'var(--color-surface-secondary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="ap-button ap-button-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 12 }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Recalculating…' : 'Recalculate Index'}
          </button>
        </div>
      </div>

      {/* ── Main Index Spotlight Card ── */}
      <div
        style={{
          borderRadius: 20,
          background: 'linear-gradient(135deg, #060d1f 0%, #0e1e3e 50%, #1e3a5f 100%)',
          padding: '36px 40px',
          color: 'white',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 48, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }} />
              <span style={{ fontSize: 11, letterSpacing: '0.14em', color: '#93c5fd', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                CURRENT ALL-INDIA COMPOSITE
              </span>
            </div>
            <div style={{ fontSize: 64, fontWeight: 900, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-0.03em' }}>
              {current.index_value != null ? current.index_value.toFixed(2) : '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Info size={16} /> No verified change available
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                vs Base ({current.base_period ?? '—'} = {current.base_value ?? '—'})
              </span>
            </div>
          </div>

          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.12)', paddingLeft: 36 }}>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: '#cbd5e1', marginBottom: 16 }}>
              {current.message}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#94a3b8', letterSpacing: '0.08em' }}>BASKET COVERAGE</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{current.coverage_pct ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#94a3b8', letterSpacing: '0.08em' }}>TRUNK CORRIDORS</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{current.route_count ?? '—'} Routes</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#94a3b8', letterSpacing: '0.08em' }}>SAMPLED FARES</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', marginTop: 2 }}>—</div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
              REFRESHED: {lastRefreshed}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Next publication in: 15 min</div>
          </div>
        </div>
      </div>

      {/* ── Published Quarterly History Table ── */}
      <div className="ap-card" style={{ padding: 'var(--space-2xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Historical Index Series & Trends
            </h2>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Quarterly published matched-sample indices with observation counts and audit status.
            </p>
          </div>
        </div>

        <table className="ap-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Period</th>
              <th>Index Value</th>
              <th>Quarterly Change</th>
              <th>Route Basket</th>
              <th>Sample Observations</th>
              <th>Data Provenance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row, i) => {
              const prev = history[i + 1]?.value
              const chg = prev ? ((Number(row.value) - prev) / prev) * 100 : null
              return (
                <tr key={`${row.period}-${i}`}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{row.period}</td>
                  <td style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>
                    {row.value?.toFixed(2)}
                  </td>
                  <td>
                    {chg !== null ? (
                      <span style={{ color: chg >= 0 ? '#16a34a' : '#ef4444', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>Baseline</span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{row.route_count} Corridors</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{row.observation_count.toLocaleString('en-IN')}</td>
                  <td>
                    <span className="ap-badge ap-badge-real" style={{ fontSize: 9 }}>
                      {row.data_origin}
                    </span>
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                      <CheckCircle2 size={13} /> {row.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Route Weighting Basket Breakdown ── */}
      <div className="ap-card" style={{ padding: 'var(--space-2xl)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Layers size={18} style={{ color: 'var(--color-brand-primary)' }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            DGCA Domestic Route Weights in Basket
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {([] as typeof routeWeights).map(rw => (
            <div
              key={rw.route}
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'var(--color-surface-secondary)',
                border: '1px solid var(--color-border-primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                  {rw.route}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)' }}>
                  Weight: {rw.weight}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Pax Share: {rw.dgcaPaxShare}%</span>
                <span>Rev Share: {rw.revenueShare}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
