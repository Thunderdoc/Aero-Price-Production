import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Download, FileText, Table, Code } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'

const exports = [
  {
    id: 'csv',
    label: 'CSV Data Export',
    description: 'All validated fare observations with full provenance metadata.',
    format: 'CSV',
    icon: Table,
    publicationId: 'AP-2026-09-18-001',
    timestamp: '18 Sep 2026 · 21:48 IST',
    dataVersion: 'v2.1.0',
    methodVersion: 'v1.4.2',
    qualityStatus: 'SAMPLE DATA',
    size: '2.4 MB',
  },
  {
    id: 'json',
    label: 'JSON Index Export',
    description: 'Structured index values, regional breakdowns, and corridor-level data.',
    format: 'JSON',
    icon: Code,
    publicationId: 'AP-2026-09-18-001',
    timestamp: '18 Sep 2026 · 21:48 IST',
    dataVersion: 'v2.1.0',
    methodVersion: 'v1.4.2',
    qualityStatus: 'SAMPLE DATA',
    size: '180 KB',
  },
  {
    id: 'pdf',
    label: 'PDF Bulletin',
    description: 'Formatted index bulletin suitable for official distribution and reference.',
    format: 'PDF',
    icon: FileText,
    publicationId: 'AP-2026-09-18-001',
    timestamp: '18 Sep 2026 · 21:48 IST',
    dataVersion: 'v2.1.0',
    methodVersion: 'v1.4.2',
    qualityStatus: 'SAMPLE DATA',
    size: '840 KB',
  },
]

export default function Exports() {
  return (
    <div className="flex flex-col gap-xl max-w-3xl">
      <div>
        <h1 className="text-title text-text-primary">Export Center</h1>
        <p className="text-label-sm text-text-secondary mt-xs">
          Download index data and bulletins. All exports carry full versioning and provenance metadata.
        </p>
      </div>

      <div className="flex flex-col gap-lg">
        {exports.map(exp => {
          const Icon = exp.icon
          return (
            <div key={exp.id} className="bg-surface-bg rounded-corner-lg p-xl">
              <div className="flex items-start justify-between gap-xl flex-wrap">
                <div className="flex items-start gap-lg">
                  <div className="w-10 h-10 rounded-corner-md bg-brand-secondary flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-brand-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-sm mb-xs">
                      <h3 className="text-label font-medium text-text-primary">{exp.label}</h3>
                      <Badge label={exp.format} variant="secondary" />
                    </div>
                    <p className="text-label-sm text-text-secondary mb-md">{exp.description}</p>
                    <div className="grid gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                      {[
                        { label: 'PUBLICATION ID', value: exp.publicationId },
                        { label: 'TIMESTAMP', value: exp.timestamp },
                        { label: 'DATA VERSION', value: exp.dataVersion },
                        { label: 'METHOD VERSION', value: exp.methodVersion },
                        { label: 'FILE SIZE', value: exp.size },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex flex-col gap-xs">
                          <span className="text-video-title text-text-tertiary">{label}</span>
                          <span className="text-video-title text-text-primary font-medium">{value}</span>
                        </div>
                      ))}
                      <div className="flex flex-col gap-xs">
                        <span className="text-video-title text-text-tertiary">QUALITY STATUS</span>
                        <StatusBadge status="sample" />
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  variant="primary"
                  iconStart={<Download size={16} />}
                  onClick={() => alert('SAMPLE DATA — no real export available.')}
                >
                  Download
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <h2 className="text-label font-medium text-text-primary mb-md">About These Exports</h2>
        <div className="flex flex-col gap-sm text-label-sm text-text-secondary">
          <p>All exports are marked <strong className="text-text-primary">SAMPLE DATA</strong> — no live API is connected in this demonstration.</p>
          <p>In a live deployment, exports would carry a cryptographic hash (SHA-256) linking the publication to its source observations.</p>
          <p>Publication IDs follow the format <code className="text-text-primary bg-bg-faint px-xs py-xs rounded text-video-title">AP-YYYY-MM-DD-NNN</code> where NNN is a daily sequence number.</p>
        </div>
      </div>
    </div>
  )
}
