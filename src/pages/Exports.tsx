import { useState, useEffect } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Download, FileText, Table, Code, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isBackendAvailable } from '../services/api'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

type ExportStatus = 'idle' | 'downloading' | 'done' | 'error'

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
  const [backendUp, setBackendUp] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, ExportStatus>>({})

  useEffect(() => {
    isBackendAvailable().then(setBackendUp)
  }, [])

  async function handleDownload(entry: ExportEntry) {
    if (!entry.endpoint) {
      alert('Export not available for this format.')
      return
    }
    setStatuses(s => ({ ...s, [entry.id]: 'downloading' }))
    try {
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const resp = await fetch(`${BASE_URL}${entry.endpoint}`, { headers })
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = entry.format.toLowerCase()
      a.download = `aeroprice-${entry.id}-${new Date().toISOString().slice(0, 10)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      setStatuses(s => ({ ...s, [entry.id]: 'done' }))
      setTimeout(() => setStatuses(s => ({ ...s, [entry.id]: 'idle' })), 3000)
    } catch (err) {
      console.error('Export failed:', err)
      setStatuses(s => ({ ...s, [entry.id]: 'error' }))
      setTimeout(() => setStatuses(s => ({ ...s, [entry.id]: 'idle' })), 4000)
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 860 }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
          Export Center
        </h1>
        <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
          Download fare observations, index history, and government statistics. All exports carry provenance metadata.
        </p>
      </div>

      {!backendUp && (
        <div style={{ background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-lg)', fontSize: 13, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
          Backend not reachable — exports unavailable. Start the FastAPI backend and configure VITE_API_URL.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {EXPORT_DEFS.map(entry => {
          const Icon = entry.icon
          const st = statuses[entry.id] ?? 'idle'
          return (
            <div key={entry.id} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-lg)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--color-brand-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={20} style={{ color: 'var(--color-brand-primary)' }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                      <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{entry.label}</span>
                      <Badge label={entry.format} variant="default" />
                      {!backendUp && <Badge label="OFFLINE" variant="warning" />}
                    </div>
                    <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.6 }}>{entry.description}</p>
                    {st === 'error' && (
                      <p style={{ fontSize: 12, color: 'var(--color-danger)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
                        Export failed — check backend logs.
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
                  disabled={!backendUp || st === 'downloading'}
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
          <p style={{ margin: 0 }}>If no real airfare observations exist yet (all airline sources show CHALLENGE_DETECTED), the fares export will be empty — this is correct and honest behaviour.</p>
        </div>
      </div>
    </div>
  )
}
