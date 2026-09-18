import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Play, Pause, RefreshCw, FileText, Clock, AlertCircle } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { collectors } from '../data/sampleData'
import type { Collector } from '../data/sampleData'

export default function Collection() {
  const [collectorState, setCollectorState] = useState(collectors)

  const toggleCollector = (id: string, action: 'pause' | 'resume') => {
    setCollectorState(prev =>
      prev.map(c => c.id === id
        ? { ...c, status: action === 'pause' ? 'PAUSED' : 'ACTIVE' }
        : c
      )
    )
  }

  return (
    <div className="flex flex-col gap-xl max-w-4xl">
      <div>
        <h1 className="text-title text-text-primary">Collection Operations</h1>
        <p className="text-label-sm text-text-secondary mt-xs">
          Automated data collection status and controls.
        </p>
      </div>

      {/* Hourly frequency info */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <div className="flex items-start gap-md">
          <Clock size={16} className="text-brand-primary mt-xs shrink-0" />
          <div>
            <h2 className="text-label font-medium text-text-primary mb-sm">Airfare Collection Schedule</h2>
            <div className="flex gap-2xl flex-wrap">
              <div className="flex flex-col gap-xs">
                <span className="text-video-title text-text-tertiary">COLLECTION TARGET</span>
                <span className="text-label-sm text-text-primary">Hourly</span>
              </div>
              <div className="flex flex-col gap-xs">
                <span className="text-video-title text-text-tertiary">NEXT COLLECTION</span>
                <span className="text-label-sm text-text-primary">14:00 IST</span>
              </div>
              <div className="flex flex-col gap-xs">
                <span className="text-video-title text-text-tertiary">LAST SUCCESSFUL</span>
                <span className="text-label-sm text-text-primary">13:02 IST</span>
              </div>
              <div className="flex flex-col gap-xs">
                <span className="text-video-title text-text-tertiary">FRESHNESS</span>
                <span className="text-label-sm text-success">58 min</span>
              </div>
            </div>
            <p className="text-label-sm text-text-secondary mt-md max-w-xl">
              Hourly polling provides high-frequency observations. Individual price changes may occur between observations.
            </p>
          </div>
        </div>
      </div>

      {/* Collector cards */}
      <div className="flex flex-col gap-lg">
        {collectorState.map(c => (
          <CollectorCard
            key={c.id}
            collector={c}
            onPause={() => toggleCollector(c.id, 'pause')}
            onResume={() => toggleCollector(c.id, 'resume')}
          />
        ))}
      </div>
    </div>
  )
}

function CollectorCard({ collector: c, onPause, onResume }: {
  collector: Collector
  onPause: () => void
  onResume: () => void
}) {
  const [showLogs, setShowLogs] = useState(false)

  return (
    <div className="bg-surface-bg rounded-corner-lg p-xl">
      <div className="flex items-start justify-between flex-wrap gap-md mb-lg">
        <div>
          <div className="flex items-center gap-sm mb-xs">
            <h3 className="text-label font-medium text-text-primary">{c.name}</h3>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-video-title text-text-tertiary">ID: {c.id}</p>
        </div>
        <div className="flex items-center gap-sm flex-wrap">
          <Button variant="subtle" onClick={() => {}}
            iconStart={<RefreshCw size={16} />}>
            Run Now
          </Button>
          {c.status === 'ACTIVE'
            ? <Button variant="neutral" onClick={onPause} iconStart={<Pause size={16} />}>Pause</Button>
            : <Button variant="primary" onClick={onResume} iconStart={<Play size={16} />}>Resume</Button>
          }
          <Button variant="subtle" onClick={() => setShowLogs(v => !v)}
            iconStart={<FileText size={16} />}>
            {showLogs ? 'Hide Logs' : 'View Logs'}
          </Button>
        </div>
      </div>

      <div className="grid gap-md flex-wrap" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {[
          { label: 'LAST RUN', value: c.lastRun },
          { label: 'NEXT RUN', value: c.nextRun },
          { label: 'SUCCESS RATE', value: `${c.successRate.toFixed(1)}%` },
          { label: 'RECORDS COLLECTED', value: c.recordsCollected.toLocaleString('en-IN') },
          { label: 'RECORDS REJECTED', value: c.recordsRejected.toLocaleString('en-IN') },
          { label: 'AVG LATENCY', value: `${c.avgLatency}ms` },
          { label: 'RATE LIMIT EVENTS', value: c.rateLimitEvents.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-xs p-md bg-bg-faint rounded-corner-md">
            <span className="text-video-title text-text-tertiary">{label}</span>
            <span className="text-label-sm font-medium text-text-primary">{value}</span>
          </div>
        ))}
      </div>

      {showLogs && (
        <div className="mt-lg p-md bg-surface-dark rounded-corner-md">
          <p className="text-video-title text-on-reverse opacity-60 mb-sm">COLLECTOR LOGS — {c.name}</p>
          {c.errors.length > 0
            ? c.errors.map((e, i) => (
              <div key={i} className="flex items-center gap-sm text-video-title text-warning mb-xs">
                <AlertCircle size={12} />
                <span>{e}</span>
              </div>
            ))
            : <p className="text-video-title text-on-reverse opacity-60">No errors in recent log window.</p>
          }
        </div>
      )}
    </div>
  )
}
