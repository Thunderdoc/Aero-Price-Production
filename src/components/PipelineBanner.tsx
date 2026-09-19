type StageStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING' | 'CONNECTED'

interface Stage {
  label: string
  status: StageStatus
}

const STAGES: Stage[] = [
  { label: 'ACQUISITION',   status: 'BLOCKED' },
  { label: 'ETL & VALIDATE', status: 'PENDING' },
  { label: 'JEVONS INDEX',  status: 'PENDING' },
  { label: 'CPI AUG.',      status: 'PENDING' },
]

const STATUS_COLORS: Record<StageStatus, { bg: string; color: string; dot: string }> = {
  ACTIVE:    { bg: 'var(--color-success-bg)',  color: 'var(--color-success)',        dot: 'var(--color-success)' },
  CONNECTED: { bg: 'var(--color-info-bg)',     color: 'var(--color-info)',           dot: 'var(--color-info)' },
  BLOCKED:   { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)',        dot: 'var(--color-warning)' },
  PENDING:   { bg: 'var(--color-surface-secondary)', color: 'var(--color-text-tertiary)', dot: 'var(--color-text-tertiary)' },
}

export default function PipelineBanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      padding: '8px 16px',
      background: 'var(--color-surface-secondary)',
      borderBottom: '1px solid var(--color-border-primary)',
      overflowX: 'auto',
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-text-tertiary)', marginRight: 14, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
        DATA PIPELINE
      </span>
      {STAGES.map((stage, i) => {
        const { bg, color, dot } = STATUS_COLORS[stage.status]
        return (
          <div key={stage.label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 4,
              background: bg,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}>
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <svg width="20" height="10" viewBox="0 0 20 10" style={{ flexShrink: 0 }}>
                <path d="M0 5 L14 5 M10 2 L14 5 L10 8" stroke="var(--color-border-secondary)" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: 'var(--color-warning)', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>⚠ Airfare acquisition blocked — configure backend collector</span>
      </div>
    </div>
  )
}
