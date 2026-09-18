import { FlaskConical } from 'lucide-react'

export default function SampleDataBanner() {
  return (
    <div
      className="flex items-center gap-[var(--space-sm)] px-[var(--space-xl)] py-[var(--space-sm)]"
      style={{ background: 'var(--color-info-bg)', borderBottom: '1px solid var(--color-border-primary)' }}
      role="status"
    >
      <FlaskConical size={13} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
      <span className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="font-[var(--text-caption-weight)]" style={{ color: 'var(--color-text-primary)' }}>SAMPLE DATA</span>
        {' '}— Deterministic demonstration dataset. No live API is connected.
      </span>
    </div>
  )
}
