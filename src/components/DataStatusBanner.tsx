// Honest data-origin status banner — replaces SampleDataBanner
interface Props {
  anyGovConnected: boolean
  isLoading: boolean
  lastFetch: string | null
}

export default function DataStatusBanner({ anyGovConnected, isLoading, lastFetch }: Props) {
  const time = lastFetch
    ? new Date(lastFetch).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
    : null

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '4px var(--space-lg)', background: 'var(--color-info-bg)', borderRadius: 'var(--radius-full)', border: '1px solid rgba(3,105,161,0.2)' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-info)', animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-info)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>FETCHING OFFICIAL DATA</span>
      </div>
    )
  }

  if (anyGovConnected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '4px var(--space-lg)', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-full)', border: '1px solid rgba(22,163,74,0.2)' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>
          OFFICIAL DATA{time ? ` · ${time}` : ''}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '4px var(--space-lg)', background: 'var(--color-warning-bg)', borderRadius: 'var(--radius-full)', border: '1px solid rgba(217,119,6,0.2)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-warning)' }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-warning)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>HISTORICAL · Kaggle 2019 — AIRFARE SOURCES UNAVAILABLE</span>
    </div>
  )
}
