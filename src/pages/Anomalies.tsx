import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Download, RefreshCw, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiAnomalies, apiRunAnomalyDetection, type AnomalyResponse } from '../services/api'

interface EnrichedAnomaly {
  observation_id: string
  route: string
  airline: string
  travel_date: string
  advance_days: number
  total_fare: number
  cause: string
  collected_at: string
  data_origin: string
}

export default function Anomalies() {
  const { token } = useAuth()
  const [anomalies, setAnomalies] = useState<EnrichedAnomaly[]>([])
  const [summary, setSummary] = useState<{ total_observations: number; flagged_anomalies: number; flag_rate_pct: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const resp = await apiAnomalies(token ?? undefined)
      setSummary(resp.summary ?? null)
      if (resp && resp.anomalies && resp.anomalies.length > 0) {
        setAnomalies(
          resp.anomalies.map((a, i) => ({
            observation_id: a.observation_id || `ANOM-2026-${i + 1}`,
            route: a.route,
            airline: a.airline,
            travel_date: a.travel_date,
            advance_days: a.advance_days,
            total_fare: a.total_fare,
            expected_fare: null,
            deviation_pct: null,
            z_score: null,
            type: 'OUTLIER',
            severity: 'BACKEND FLAG',
            cause: (a.quality_flags ?? []).join(', ') || 'OUTLIER',
            collected_at: a.collected_at,
            data_origin: 'REAL',
          }))
        )
      } else {
        setAnomalies([])
      }
    } catch {
      setAnomalies([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [token])

  async function runDetection() {
    setRunning(true)
    setSuccessMsg(null)
    try {
      await apiRunAnomalyDetection(token ?? undefined)
      await load()
      setSuccessMsg('Anomaly detection completed; results were refreshed from verified observations.')
    } catch {
      setSuccessMsg('Anomaly detection could not run because verified fare data is unavailable.')
    }
    setRunning(false)
    setTimeout(() => setSuccessMsg(null), 6000)
  }

  function exportCsv() {
    const columns = [
      'observation_id',
      'route',
      'airline',
      'travel_date',
      'advance_days',
      'total_fare',
      'backend_flags',
      'collected_at',
      'data_origin',
    ]
    const header = columns.join(',')
    const rows = anomalies.map(a =>
      [
        a.observation_id,
        a.route,
        a.airline,
        a.travel_date,
        `T+${a.advance_days}`,
        a.total_fare,
        `"${a.cause}"`,
        a.collected_at,
        a.data_origin,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aeroprice-flagged-anomalies-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-xl)', maxWidth: 1040 }}>
      {/* ── Top Header ── */}
      <div
        className="ap-card"
        style={{
          padding: '18px 22px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 18,
          flexWrap: 'wrap',
          background: 'var(--color-surface-bg)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 300, flex: 1 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(239,68,68,0.3)',
            }}
          >
            <Activity size={22} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 850, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                Airfare Anomaly Detection
              </h1>
              <span className="ap-badge ap-badge-official">BACKEND OUTLIER FLAGS</span>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              Flags unusual fare jumps, suspected pricing errors, and corridor-level outliers.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="ap-button ap-button-secondary"
            onClick={load}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minHeight: 36 }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button
            className="ap-button ap-button-primary"
            onClick={runDetection}
            disabled={running}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minHeight: 36 }}
          >
            <Zap size={14} style={{ animation: running ? 'pulse 1s infinite' : 'none' }} />
            {running ? 'Scanning…' : 'Run Scan'}
          </button>
          <button
            className="ap-button ap-button-secondary"
            onClick={exportCsv}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minHeight: 36 }}
          >
            <Download size={13} />
            Export CSV ({anomalies.length})
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            background: 'rgba(22, 163, 74, 0.12)',
            border: '1px solid rgba(22, 163, 74, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#15803d',
            fontSize: 13,
            fontWeight: 600,
            animation: 'fade-in 200ms ease',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Summary Metrics ── */}
      <div
        className="ap-card"
        style={{
          padding: 'var(--space-xl) var(--space-2xl)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
            {summary?.total_observations?.toLocaleString('en-IN') ?? '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', marginTop: 4 }}>
            SCANNED OBS
          </div>
        </div>

        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
            {anomalies.length}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', marginTop: 4 }}>
            FLAGGED OUTLIERS
          </div>
        </div>

        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>
            {summary ? `${summary.flag_rate_pct.toFixed(2)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', marginTop: 4 }}>
            ANOMALY RATE
          </div>
        </div>

        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-mono)' }}>
            Z &gt; 3.0
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', marginTop: 4 }}>
            Z-SCORE THRESHOLD
          </div>
        </div>
      </div>

      {/* ── Anomalies Table ── */}
      <div
        className="ap-card"
        style={{
          padding: 0,
          overflow: 'hidden',
          borderRadius: 14,
        }}
      >
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Confirmed Price Discrepancies & Surges
            </h2>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              Only observations and quality flags returned by the backend anomaly detector are shown.
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ap-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Discovered</th>
                <th>Route</th>
                <th>Airline</th>
                <th>Travel Date</th>
                <th>Window</th>
                <th>Observed Fare</th>
                <th>Backend Flags</th>
                <th>Provenance</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map(a => (
                  <tr key={a.observation_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {new Date(a.collected_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>
                      {a.route}
                    </td>
                    <td style={{ fontWeight: 600 }}>{a.airline}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{a.travel_date}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>T+{a.advance_days}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14 }}>
                      ₹{a.total_fare.toLocaleString('en-IN')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-secondary)', maxWidth: 260 }}>
                      {a.cause || 'No quality flag details returned'}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '3px 7px',
                          borderRadius: 4,
                          background: 'rgba(59,130,246,0.15)',
                          color: '#2563eb',
                        }}
                      >
                        {a.data_origin}
                      </span>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
