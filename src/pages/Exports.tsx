import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Download, FileText, Table, Code, RefreshCw, ShieldAlert } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiCreateAccessRequest, apiDownload, isForbiddenError } from '../services/api'
import LiveBadge from '../components/LiveBadge'
import type { LiveCheck } from '../lib/liveStatus'

type ExportStatus = 'idle' | 'downloading' | 'done' | 'error'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

interface ExportEntry {
  id: string
  label: string
  description: string
  format: string
  icon: typeof Table
  endpoint: string | null
  method: string
}

const EXPORT_DEFS: ExportEntry[] = [
  {
    id: 'csv',
    label: 'CSV Fare Observations',
    description: 'All validated fare observations with full provenance metadata. Includes route, airline, travel date, advance window, base fare, taxes, total fare, data_origin.',
    format: 'CSV',
    icon: Table,
    endpoint: '/api/exports/fares',
    method: 'GET',
  },
  {
    id: 'json',
    label: 'JSON Index History',
    description: 'Structured index publication history with route coverage, methodology version, observation counts, and base-period reference values.',
    format: 'JSON',
    icon: Code,
    endpoint: '/api/exports/index-history',
    method: 'GET',
  },
  {
    id: 'dgca',
    label: 'DGCA Monthly Statistics',
    description: 'Government DGCA monthly passenger traffic statistics (OFFICIAL provenance). Exported as CSV for offline analysis and benchmark reference.',
    format: 'CSV',
    icon: FileText,
    endpoint: '/api/exports/dgca-monthly',
    method: 'GET',
  },
]

export default function Exports() {
  const { token } = useAuth()
  const [statuses, setStatuses] = useState<Record<string, ExportStatus>>({})
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  // A 403 is an access problem, not a broken export: say so and offer the
  // access-request flow instead of telling the user to "check backend logs".
  const [forbidden, setForbidden] = useState<Record<string, boolean>>({})
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const anyForbidden = Object.values(forbidden).some(Boolean)
  // The header badge is green ONLY after a successful download in this
  // session — nothing has verified the export endpoints before that.
  const [exportSucceededAt, setExportSucceededAt] = useState<Date | null>(null)
  const [exportFailed, setExportFailed] = useState(false)
  const anyDownloading = Object.values(statuses).some(s => s === 'downloading')
  const exportCheck: LiveCheck = {
    ok: exportSucceededAt != null,
    checkedAt: exportSucceededAt,
    loading: anyDownloading,
    failed: exportFailed && exportSucceededAt == null,
  }

  async function requestAccess() {
    if (!token || requestState === 'sending' || requestState === 'sent') return
    setRequestState('sending')
    try {
      await apiCreateAccessRequest('EXPORTS', 'Data Export', token, 'Export access was denied for this account.')
      setRequestState('sent')
    } catch {
      setRequestState('error')
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 2000)
  }

  async function handleDownload(entry: ExportEntry) {
    setStatuses(s => ({ ...s, [entry.id]: 'downloading' }))
    setForbidden(s => ({ ...s, [entry.id]: false }))
    try {
      const path = entry.id === 'csv'
        ? '/api/exports/fares?fmt=csv'
        : entry.id === 'json'
          ? '/api/exports/index-history?fmt=json'
          : '/api/exports/dgca-monthly?fmt=csv'
      const blob = await apiDownload(path, token ?? undefined)
      const extension = entry.id === 'json' ? 'json' : 'csv'
      downloadBlob(`aeroprice-${entry.id}-export.${extension}`, blob)
      setExportSucceededAt(new Date())
      setExportFailed(false)
      setStatuses(s => ({ ...s, [entry.id]: 'done' }))
      setTimeout(() => setStatuses(s => ({ ...s, [entry.id]: 'idle' })), 3000)
      showSuccess(`${entry.label} downloaded successfully.`)
    } catch (err) {
      console.error('Export failed:', err)
      setExportFailed(true)
      setForbidden(s => ({ ...s, [entry.id]: isForbiddenError(err) }))
      setStatuses(s => ({ ...s, [entry.id]: 'error' }))
      // Error states stay visible at least 5s (audit §2.11).
      setTimeout(() => setStatuses(s => ({ ...s, [entry.id]: 'idle' })), 5000)
    }
  }

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-xl)', maxWidth: 860 }}>

      {/* Dark hero header */}
      <div style={{
        background: 'var(--gradient-hero-dark)', borderRadius: 'var(--radius-xl)',
        overflow: 'hidden', position: 'relative', padding: '24px 28px',
        boxShadow: '0 16px 40px rgba(8,14,26,0.3)', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -40, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(37,99,235,0.15)', filter: 'blur(50px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={13} color="white" />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.7)', letterSpacing: '0.14em', fontFamily: 'var(--font-mono)' }}>EXPORT CENTER · ANALYST+ ACCESS</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.025em', margin: 0, marginBottom: 4 }}>
              Data Export
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-sans)', margin: 0 }}>
              Fare observations, index history &amp; government statistics with full provenance metadata
            </p>
          </div>
          <LiveBadge check={exportCheck} label="BACKEND EXPORTS" />
        </div>
      </div>

      {successMsg && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-success-bg)', border: '1px solid rgba(22,163,74,0.25)', fontSize: 12, color: 'var(--color-success)', fontFamily: 'var(--font-sans)' }}>
          {successMsg}
        </div>
      )}

      {anyForbidden && (
        <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--color-warning)', background: 'var(--color-warning-bg)', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <ShieldAlert size={20} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <strong style={{ display: 'block', color: 'var(--color-text-primary)', fontSize: 14 }}>Analyst access required</strong>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Your account does not have access to exports. Request access and an administrator will review it.</span>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Button onClick={requestAccess} disabled={!token || requestState === 'sending' || requestState === 'sent'}>
                {requestState === 'sent' ? 'Request sent' : requestState === 'sending' ? 'Sending…' : 'Request access'}
              </Button>
              {requestState === 'error' && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>The request could not be sent. Please try again.</span>}
              {!token && <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Sign in to request access.</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {EXPORT_DEFS.map(entry => {
          const Icon = entry.icon
          const st = statuses[entry.id] ?? 'idle'
          return (
            <div key={entry.id} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: 'var(--shadow-sm)', transition: 'box-shadow 200ms ease, border-color 200ms ease' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-secondary)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-primary)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-lg)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-brand-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={20} style={{ color: 'var(--color-brand-primary)' }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                      <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{entry.label}</span>
                      <Badge label={entry.format} variant="default" />
                    </div>
                    <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.6 }}>{entry.description}</p>
                    {st === 'error' && (
                      <p style={{ fontSize: 12, color: 'var(--color-danger)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
                        {forbidden[entry.id]
                          ? 'Analyst access required — request access below.'
                          : 'Export failed — please try again.'}
                      </p>
                    )}
                    {st === 'done' && (
                      <p style={{ fontSize: 12, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
                        Download started.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="primary"
                  iconStart={st === 'downloading' ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />}
                  onClick={() => handleDownload(entry)}
                  disabled={st === 'downloading'}
                >
                  {st === 'downloading' ? 'Downloading…' : 'Download'}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)' }}>
        <h2 style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-md)' }}>
          About These Exports
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.65 }}>
          <p style={{ margin: 0 }}>Fare observation exports include <strong style={{ color: 'var(--color-text-primary)' }}>data_origin</strong> on every row — only <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>REAL</code> and <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>OFFICIAL</code> records enter live analytical exports.</p>
          <p style={{ margin: 0 }}>Publication IDs follow the format <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>AP-YYYY-MM-DD-NNN</code> where NNN is a daily sequence number.</p>
          <p style={{ margin: 0 }}>If no eligible records exist for an export, the backend returns an empty file instead of generated rows.</p>
        </div>
      </div>
    </div>
  )
}
