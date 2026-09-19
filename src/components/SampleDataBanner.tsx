import { FlaskConical } from 'lucide-react'

export default function SampleDataBanner() {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 'var(--space-sm)',
        padding: '4px var(--space-md)',
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-info-bg)',
        border: '1px solid rgba(3, 105, 161, 0.15)',
      }}
      role="status"
    >
      <FlaskConical size={11} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
      <span
        style={{
          fontSize: 11, fontWeight: 500, fontFamily: 'var(--font-sans)',
          color: 'var(--color-info)', whiteSpace: 'nowrap',
        }}
      >
        SAMPLE DATA — demonstration only
      </span>
    </div>
  )
}
