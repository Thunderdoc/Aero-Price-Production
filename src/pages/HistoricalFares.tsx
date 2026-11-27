import { useCallback, useEffect, useState } from 'react'
import { Calendar, Database, Download, History, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiHistoricalBackfill, apiHistoricalSummary, isForbiddenError, type HistoricalSummary } from '../services/api'
import { formatDateIST } from '../lib/liveStatus'

function formatDate(value?: string) {
  if (!value) return '—'
  return formatDateIST(value)
}

function formatMoney(value?: number) {
  return value == null ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function HistoricalFares() {
  const { token, user } = useAuth()
  const [summary, setSummary] = useState<HistoricalSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      try {
        setSummary(await apiHistoricalSummary(token ?? undefined))
      } catch (error) {
        if (isForbiddenError(error)) throw error
        await new Promise(resolve => setTimeout(resolve, 1000))
        setSummary(await apiHistoricalSummary(token ?? undefined))
      }
    } catch (cause) {
      setSummary(null)
      setError(cause instanceof Error ? cause.message : 'Historical data is unavailable.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void refresh() }, [refresh])

  async function backfill() {
    setBackfilling(true)
    setError(null)
    try {
      setSummary(await apiHistoricalBackfill(token ?? undefined))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Historical import failed.')
    } finally {
      setBackfilling(false)
    }
  }

  function exportSummary() {
    if (!summary || summary.status !== 'READY') return
    const rows = [
      ['Field', 'Value'],
      ['Records', String(summary.records)],
      ['Source', summary.source],
      ['Data origin', summary.data_origin],
      ['Period start', summary.period_start ?? ''],
      ['Period end', summary.period_end ?? ''],
      ['Average fare', String(summary.average_fare ?? '')],
      ['Minimum fare', String(summary.min_fare ?? '')],
      ['Maximum fare', String(summary.max_fare ?? '')],
    ]
    const csv = rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'aeroprice-historical-summary.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const ready = summary?.status === 'READY'
  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', maxWidth: 1100 }}>
      <section style={{ borderRadius: 16, padding: '28px 32px', background: 'linear-gradient(135deg, #07142c 0%, #123a75 70%, #1769e8 100%)', color: '#fff', boxShadow: '0 18px 42px rgba(12,49,105,.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#9bd7ff', fontSize: 10, fontWeight: 800, letterSpacing: '.14em' }}><History size={15} /> BACKEND HISTORICAL REFERENCE</div>
        <h1 style={{ margin: '12px 0 7px', fontSize: 28, letterSpacing: '-.03em' }}>Historical Fare Reference</h1>
        <p style={{ margin: 0, maxWidth: 730, color: '#d6e7ff', fontSize: 13, lineHeight: 1.55 }}>Historical figures are shown only after the backend confirms their provenance. This page never fills missing data with a static or demo series.</p>
      </section>

      {error && <div role="alert" style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--color-danger-bg)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--color-danger)', fontSize: 12 }}>{error}</div>}

      <section style={{ background: '#fff', border: '1px solid var(--color-border-primary)', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-primary)', fontSize: 17, fontWeight: 800 }}><Database size={18} color="var(--color-brand-primary)" /> Historical snapshot status</div>
            <p style={{ margin: '6px 0 0', color: 'var(--color-text-secondary)', fontSize: 12 }}>Read from the authenticated <code>/api/historical/summary</code> endpoint.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void refresh()} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--color-border-primary)', borderRadius: 8, padding: '8px 11px', background: '#fff', color: 'var(--color-brand-primary)', fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}><RefreshCw size={14} /> Refresh</button>
            {ready && <button type="button" onClick={exportSummary} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 8, padding: '8px 11px', background: 'var(--color-brand-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}><Download size={14} /> Export summary</button>}
          </div>
        </div>

        {loading ? <div style={{ padding: '34px 0', color: 'var(--color-text-secondary)', fontSize: 13 }}>Loading backend historical status…</div> : !summary || !ready ? (
          <div style={{ marginTop: 18, padding: 22, borderRadius: 11, border: '1px dashed var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}>
            <div style={{ fontWeight: 800, color: 'var(--color-text-primary)' }}>{summary?.status === 'NOT_IMPORTED' ? 'No historical snapshot is imported' : 'Historical data is unavailable'}</div>
            <div style={{ marginTop: 6, color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.5 }}>{summary?.note ?? 'The backend did not return a verified historical dataset.'}</div>
            {user?.role === 'ADMIN' && summary?.status === 'NOT_IMPORTED' && <button type="button" onClick={() => void backfill()} disabled={backfilling} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7, border: 0, borderRadius: 8, padding: '9px 12px', background: '#1769e8', color: '#fff', fontWeight: 800, cursor: backfilling ? 'wait' : 'pointer' }}><ShieldCheck size={14} /> {backfilling ? 'Importing verified snapshot…' : 'Import historical snapshot'}</button>}
          </div>
        ) : (
          <>
            <div className="kpi-grid-4" style={{ marginTop: 18 }}>
              {[
                ['Records', summary.records.toLocaleString('en-IN')],
                ['Period', `${formatDate(summary.period_start)} – ${formatDate(summary.period_end)}`],
                ['Average fare', formatMoney(summary.average_fare)],
                ['Fare range', `${formatMoney(summary.min_fare)} – ${formatMoney(summary.max_fare)}`],
              ].map(([label, value]) => <div key={label} style={{ padding: 14, borderRadius: 10, background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}><div style={{ color: 'var(--color-text-tertiary)', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 7, color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 800 }}>{value}</div></div>)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16, color: 'var(--color-text-secondary)', fontSize: 11 }}><Calendar size={14} /> Source: {summary.source} · origin: {summary.data_origin} · excluded from live fare/index calculations.</div>
            {summary.routes && summary.routes.length > 0 && (
              <div style={{ marginTop: 18, overflowX: 'auto' }}>
                <div style={{ color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Route breakdown</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--color-text-tertiary)' }}>
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>Route</th>
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>Records</th>
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>Average fare</th>
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>Fare range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.routes.map(route => (
                      <tr key={route.route} style={{ color: 'var(--color-text-primary)' }}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{route.route}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>{route.records.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)' }}>{formatMoney(route.average_fare ?? undefined)}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-primary)', whiteSpace: 'nowrap' }}>{formatMoney(route.min_fare ?? undefined)} – {formatMoney(route.max_fare ?? undefined)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
