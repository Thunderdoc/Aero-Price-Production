import { useEffect, useState, useMemo, useRef } from 'react'
import { TrendingUp, RefreshCw, Download, CheckCircle2, Sliders, Calendar, Activity } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiForecast, type ForecastResponse } from '../services/api'

const routes = [
  'DEL-BOM', 'DEL-BLR', 'BOM-BLR', 'DEL-CCU', 'DEL-HYD', 'DEL-MAA',
  'BOM-CCU', 'BOM-HYD', 'BLR-CCU', 'BLR-HYD', 'MAA-DEL', 'MAA-BOM',
]
const windows = [1, 7, 15, 30, 45]

interface HorizonForecast {
  horizon_days: number
  target_date: string
  forecast_fare: number
  lower_bound: number
  upper_bound: number
}

export default function Forecast() {
  const { token } = useAuth()
  const [route, setRoute] = useState('DEL-BOM')
  const [windowDays, setWindowDays] = useState(7)
  const [forecasts, setForecasts] = useState<HorizonForecast[]>([])
  const [metrics, setMetrics] = useState<ForecastResponse['metrics']>(null)
  const [message, setMessage] = useState<string | null>(null)
  // The first request starts on mount; avoid rendering an unavailable state
  // during the serverless/authentication cold start.
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const requestSeq = useRef(0)

  async function load() {
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    setLoading(true)
    setMessage(null)
    setMetrics(null)
    try {
      const resp = await apiForecast(route, windowDays, token ?? undefined)
      if (requestSeq.current !== requestId) return
      if (resp && resp.status === 'FORECAST' && resp.forecasts?.length) {
        const baseDate = resp.metrics?.trained_at ? new Date(resp.metrics.trained_at) : new Date()
        setForecasts(
          resp.forecasts.map(f => ({
            horizon_days: f.horizon_days,
            target_date: new Date(baseDate.getTime() + f.horizon_days * 86400000).toISOString().slice(0, 10),
            forecast_fare: f.forecast_fare,
            lower_bound: f.lower_bound,
            upper_bound: f.upper_bound,
          }))
        )
        setMetrics(resp.metrics)
      } else {
        setForecasts([])
        setMessage(resp?.message ?? 'Forecast requires sufficient verified fare observations for this route and booking window.')
      }
    } catch {
      if (requestSeq.current !== requestId) return
      setForecasts([])
      setMessage('Forecast data is unavailable because the backend did not return a verified model result.')
    } finally {
      if (requestSeq.current !== requestId) return
      setLoading(false)
      setLastUpdated(
        new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
      )
    }
  }

  useEffect(() => {
    void load()
  }, [route, windowDays, token])

  function exportCsv() {
    if (!forecasts.length) return
    const header = 'Route,Booking Window,Horizon Days,Horizon Date,Point Forecast Fare,Approx Lower Bound,Approx Upper Bound,Currency'
    const rows = forecasts.map(f =>
      [route, `T+${windowDays}`, f.horizon_days, f.target_date, f.forecast_fare, f.lower_bound, f.upper_bound, 'INR'].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aeroprice-forecast-${route}-T${windowDays}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Visual SVG sparkline coordinates
  const svgData = useMemo(() => {
    if (!forecasts.length) return null
    const min = Math.min(...forecasts.map(f => f.lower_bound)) - 200
    const max = Math.max(...forecasts.map(f => f.upper_bound)) + 200
    const w = 500, h = 180

    const pts = forecasts.map((f, i) => {
      const x = (i / Math.max(1, forecasts.length - 1)) * (w - 60) + 30
      const y = h - ((f.forecast_fare - min) / (max - min)) * (h - 40) - 20
      const yLow = h - ((f.lower_bound - min) / (max - min)) * (h - 40) - 20
      const yHigh = h - ((f.upper_bound - min) / (max - min)) * (h - 40) - 20
      return { x, y, yLow, yHigh, ...f }
    })

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    const upperPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yHigh}`).join(' ')
    const lowerReversed = [...pts].reverse().map(p => `L ${p.x} ${p.yLow}`).join(' ')
    const confidenceArea = `${upperPath} ${lowerReversed} Z`

    return { pts, linePath, confidenceArea, min, max, w, h }
  }, [forecasts])

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
          gap: 16,
          flexWrap: 'wrap',
          background: 'var(--color-surface-bg)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
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
            <TrendingUp size={24} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                Airfare Predictive Forecast
              </h1>
              <span className="ap-badge ap-badge-official">BACKEND STATISTICAL MODEL</span>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              Forecasts are shown only when the backend has enough verified fare history for the selected route and booking window.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={exportCsv}
            disabled={!forecasts.length}
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
              cursor: forecasts.length ? 'pointer' : 'not-allowed',
              color: 'var(--color-text-secondary)',
              opacity: forecasts.length ? 1 : 0.55,
            }}
          >
            <Download size={13} /> Export Projections CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="ap-button ap-button-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 12 }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Refreshing…' : 'Refresh Forecast'}
          </button>
        </div>
      </div>

      {/* ── Controls Bar ── */}
      <div
        className="ap-card"
        style={{
          padding: 'var(--space-lg) var(--space-2xl)',
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>CORRIDOR:</span>
          <select
            className="ap-input"
            value={route}
            onChange={e => setRoute(e.target.value)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8 }}
          >
            {routes.map(r => (
              <option key={r} value={r}>
                {r} ({r === 'DEL-BOM' ? 'Delhi → Mumbai' : r === 'DEL-BLR' ? 'Delhi → Bengaluru' : r})
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>BOOKING WINDOW:</span>
          <select
            className="ap-input"
            value={windowDays}
            onChange={e => setWindowDays(Number(e.target.value))}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8 }}
          >
            {windows.map(w => (
              <option key={w} value={w}>
                T+{w} days ({w === 1 ? 'Emergency / Last Minute' : w === 7 ? '1 Week Out' : w === 15 ? 'Optimal Advance' : `${w} Days Advance`})
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          Model: {metrics?.model_version ?? '—'} · Checked {lastUpdated ?? '—'}
        </div>
      </div>

      {/* ── Model Accuracy & Forecast Chart ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 20,
        }}
      >
        {/* SVG Chart Panel */}
        <div
          className="ap-card"
          style={{
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {route} · T+{windowDays} Projected Price Trajectory
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Blue line: point forecast. Shaded region: backend-provided approximate uncertainty bounds.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 3, background: 'var(--color-brand-primary)', borderRadius: 2 }} /> Point forecast
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 10, background: 'rgba(37,99,235,0.18)', borderRadius: 2 }} /> Approx bounds
              </span>
            </div>
          </div>

          {!loading && message && (
            <div style={{ padding: '28px 16px 24px', color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center' }}>
              <div style={{ width: 42, height: 42, margin: '0 auto 12px', display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--color-info-bg)', color: 'var(--color-brand-primary)' }}><Activity size={20} /></div>
              <strong style={{ display: 'block', color: 'var(--color-text-primary)', fontSize: 14, marginBottom: 7 }}>Forecast is building verified history</strong>
              <span>{message}</span>
              {(() => {
                const match = message.match(/Requires [≥>]?(\d+).*?Have (\d+)/i)
                if (!match) return null
                const required = Number(match[1]); const have = Number(match[2]); const progress = Math.min(100, Math.round((have / required) * 100))
                return <div style={{ maxWidth: 390, margin: '18px auto 0', textAlign: 'left' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 6 }}><span>Verified history coverage</span><span>{have}/{required} days</span></div><div style={{ height: 8, borderRadius: 99, background: 'var(--color-border-secondary)', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', borderRadius: 99, background: 'var(--color-brand-primary)' }} /></div><div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>The model will unlock automatically when enough daily observations are available.</div></div>
              })()}
            </div>
          )}

          {svgData && (
            <div style={{ position: 'relative', width: '100%', height: 200 }}>
              <svg viewBox={`0 0 ${svgData.w} ${svgData.h}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <linearGradient id="fore-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(37,99,235,0.28)" />
                    <stop offset="100%" stopColor="rgba(37,99,235,0.04)" />
                  </linearGradient>
                </defs>

                {/* Approximate bounds area */}
                <path d={svgData.confidenceArea} fill="url(#fore-grad)" />

                {/* Trajectory Line */}
                <path d={svgData.linePath} fill="none" stroke="var(--color-brand-primary)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />

                {/* Point Dots & Labels */}
                {svgData.pts.map(p => (
                  <g key={p.horizon_days}>
                    <circle cx={p.x} cy={p.y} r={4.5} fill="white" stroke="var(--color-brand-primary)" strokeWidth={2} />
                    <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--color-text-primary)" fontFamily="var(--font-mono)">
                      ₹{p.forecast_fare}
                    </text>
                    <text x={p.x} y={svgData.h - 2} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-text-tertiary)" fontFamily="var(--font-mono)">
                      +{p.horizon_days}d
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Model Accuracy & Metrics Card */}
        <div
          className="ap-card"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 12 }}>
              PROJECTION METRICS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-secondary)' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700 }}>MEAN ABSOLUTE PCT ERROR</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {metrics ? `${metrics.mape_pct.toFixed(2)}%` : '—'}
                </div>
              </div>

              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-secondary)' }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700 }}>MODEL VERSION</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {metrics?.model_version ?? '—'}
                </div>
              </div>

              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--color-surface-secondary)' }}>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 700 }}>TRAINING OBSERVATIONS</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {metrics ? metrics.n_obs.toLocaleString('en-IN') : '—'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 14 }}>
            Validation metrics and training counts are read from the backend response. No forecast is displayed when verified history is insufficient.
          </div>
        </div>
      </div>

      {/* ── Horizon Breakdown Table ── */}
      <div className="ap-card" style={{ padding: 'var(--space-2xl)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Detailed Multi-Horizon Predictions
        </h2>

        <table className="ap-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Prediction Horizon</th>
              <th>Horizon Date</th>
              <th>Point Forecast Fare</th>
              <th>Approx Lower Bound</th>
              <th>Approx Upper Bound</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map(f => (
              <tr key={f.horizon_days}>
                <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>+{f.horizon_days} Days Out</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{f.target_date}</td>
                <td style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>
                  ₹{f.forecast_fare.toLocaleString('en-IN')}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#16a34a' }}>
                  ₹{f.lower_bound.toLocaleString('en-IN')}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
                  ₹{f.upper_bound.toLocaleString('en-IN')}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>INR</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
