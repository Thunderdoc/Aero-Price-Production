import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { ExternalLink } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import { dataSources } from '../data/sampleData'
import type { DataSource } from '../data/sampleData'

const typeLabels: Record<string, string> = {
  AIRLINE: 'Airline',
  OTA: 'OTA',
  PUBLIC_API: 'Public API',
  PUBLIC_DATASET: 'Public Dataset',
  OFFICIAL_REFERENCE: 'Official Reference',
}

export default function DataSources() {
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null)
  const [filterType, setFilterType] = useState<string>('all')

  const typeFilters = ['all', 'AIRLINE', 'OTA', 'OFFICIAL_REFERENCE', 'PUBLIC_DATASET']
  const filtered = filterType === 'all' ? dataSources : dataSources.filter(s => s.type === filterType)

  return (
    <div className="flex flex-col gap-xl max-w-4xl">
      <div>
        <h1 className="text-title text-text-primary">Data Sources</h1>
        <p className="text-label-sm text-text-secondary mt-xs">
          Registry of all airfare and reference data sources. Status reflects the most recent collection attempt.
        </p>
      </div>

      {/* Stats strip */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <div className="flex gap-2xl flex-wrap">
          {[
            { label: 'TOTAL SOURCES', value: dataSources.length },
            { label: 'LIVE / HEALTHY', value: dataSources.filter(s => ['LIVE', 'HEALTHY'].includes(s.status)).length },
            { label: 'AGING', value: dataSources.filter(s => s.status === 'AGING').length },
            { label: 'STALE / FAILED', value: dataSources.filter(s => ['STALE', 'FAILED'].includes(s.status)).length },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-xs">
              <span className="text-video-title text-text-tertiary">{label}</span>
              <span className="text-heading font-semibold text-text-primary">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-sm flex-wrap">
        {typeFilters.map(f => (
          <button
            key={f}
            onClick={() => setFilterType(f)}
            className={`text-label-sm px-md py-xs rounded-corner-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-brand-primary focus-visible:outline-offset-2 ${
              filterType === f
                ? 'bg-brand-primary text-on-brand'
                : 'bg-surface-bg text-text-secondary border border-border-primary hover:bg-surface-hover'
            }`}
          >
            {f === 'all' ? 'All' : typeLabels[f] ?? f}
          </button>
        ))}
      </div>

      {/* Source table */}
      <div className="bg-surface-bg rounded-corner-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-label-sm" role="table">
            <thead>
              <tr className="border-b border-border-primary bg-bg-faint">
                {['Source', 'Type', 'Status', 'Last Success', 'Next Run', 'Frequency', 'Records', 'Latency', ''].map(h => (
                  <th key={h} className="text-left px-lg py-md text-video-title text-text-tertiary font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr
                  key={s.id}
                  className="border-b border-border-primary hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => setSelectedSource(s)}
                >
                  <td className="px-lg py-md">
                    <div className="text-text-primary font-medium">{s.name}</div>
                    <div className="text-video-title text-text-tertiary">{s.organization}</div>
                  </td>
                  <td className="px-lg py-md text-text-secondary whitespace-nowrap">{typeLabels[s.type]}</td>
                  <td className="px-lg py-md"><StatusBadge status={s.status} /></td>
                  <td className="px-lg py-md text-text-secondary whitespace-nowrap">{s.lastSuccess}</td>
                  <td className="px-lg py-md text-text-secondary whitespace-nowrap">{s.nextRun}</td>
                  <td className="px-lg py-md text-text-secondary">{s.frequency}</td>
                  <td className="px-lg py-md text-text-secondary text-right">{s.records.toLocaleString('en-IN')}</td>
                  <td className="px-lg py-md text-text-secondary text-right whitespace-nowrap">
                    {s.latency > 0 ? `${s.latency}ms` : '—'}
                  </td>
                  <td className="px-lg py-md">
                    <button className="text-brand-primary hover:opacity-70 transition-opacity focus-visible:outline-2 focus-visible:outline-brand-primary focus-visible:outline-offset-2 rounded">
                      <ExternalLink size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Source detail modal */}
      {selectedSource && (
        <Modal
          isOpen={!!selectedSource}
          onClose={() => setSelectedSource(null)}
          title={`Source: ${selectedSource.name}`}
          size="medium"
          footer={
            <Button variant="neutral" onClick={() => setSelectedSource(null)}>Close</Button>
          }
        >
          <div className="flex flex-col gap-lg">
            <div className="grid gap-md" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {[
                { label: 'ORGANISATION', value: selectedSource.organization },
                { label: 'TYPE', value: typeLabels[selectedSource.type] },
                { label: 'ACCESS METHOD', value: selectedSource.accessMethod },
                { label: 'FORMAT', value: selectedSource.format },
                { label: 'COLLECTION METHOD', value: selectedSource.collectionMethod },
                { label: 'UPDATE FREQUENCY', value: selectedSource.frequency },
                { label: 'LAST RETRIEVAL', value: selectedSource.lastSuccess },
                { label: 'RECORDS', value: selectedSource.records.toLocaleString('en-IN') },
                { label: 'AVG LATENCY', value: selectedSource.latency > 0 ? `${selectedSource.latency}ms` : 'N/A' },
                {
                  label: 'API KEY',
                  value: selectedSource.apiKeyRequired ? 'REQUIRED' : 'Not required'
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-xs">
                  <span className="text-video-title text-text-tertiary">{label}</span>
                  <span className="text-label-sm text-text-primary">{value}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-xs">
              <span className="text-video-title text-text-tertiary">SOURCE URL</span>
              <span className="text-label-sm text-brand-primary">{selectedSource.url}</span>
            </div>

            <div className="flex items-center gap-sm">
              <span className="text-video-title text-text-tertiary">STATUS</span>
              <StatusBadge status={selectedSource.status} />
            </div>

            <StatusBadge status="sample" />
          </div>
        </Modal>
      )}
    </div>
  )
}
