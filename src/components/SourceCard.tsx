import { ExternalLink, AlertTriangle, CheckCircle, XCircle, Clock, Shield } from 'lucide-react'
import type { AirfareSource, GovDataset } from '../types/observation'

// ── Airfare source card ────────────────────────────────────────────────────────

interface AirfareSourceCardProps {
  source: AirfareSource
}

const AIRFARE_STATUS_CONFIG = {
  CHALLENGE_DETECTED: { label: 'CHALLENGE DETECTED', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: AlertTriangle },
  SOURCE_BLOCKED: { label: 'SOURCE BLOCKED', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle },
  AUTH_REQUIRED: { label: 'AUTH REQUIRED', color: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: Shield },
  NOT_CONFIGURED: { label: 'NOT CONFIGURED', color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)', icon: Clock },
  CONNECTED: { label: 'CONNECTED', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle },
  FAILED: { label: 'FAILED', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle },
}

export function AirfareSourceCard({ source }: AirfareSourceCardProps) {
  const cfg = AIRFARE_STATUS_CONFIG[source.status]
  const Icon = cfg.icon

  return (
    <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{source.name}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{source.organization}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', background: cfg.bg, padding: '4px 10px', borderRadius: 'var(--radius-full)' }}>
          <Icon size={11} style={{ color: cfg.color }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{cfg.label}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {[
          { label: 'robots.txt', value: source.robots_txt },
          { label: 'CAPTCHA', value: source.captcha_detected ? 'DETECTED' : 'NONE' },
          { label: 'Public API', value: source.api_available ? 'YES' : 'NO' },
          { label: 'Last Attempt', value: source.last_attempt ? 'Just now' : '—' },
        ].map(r => (
          <div key={r.label}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{r.label}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{r.value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', background: 'var(--color-surface-secondary)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)', fontStyle: 'italic' }}>
        {source.status_reason}
      </div>

      <a
        href={source.source_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', textDecoration: 'none' }}
      >
        <ExternalLink size={11} />
        {source.source_url.replace('https://', '')}
      </a>
    </div>
  )
}

// ── Government dataset card ───────────────────────────────────────────────────

interface GovSourceCardProps {
  dataset: GovDataset
}

const GOV_STATUS_CONFIG = {
  CONNECTED: { label: 'CONNECTED', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle },
  HEALTHY: { label: 'HEALTHY', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle },
  UNAVAILABLE: { label: 'UNAVAILABLE', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle },
  STALE: { label: 'STALE', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: Clock },
  FAILED: { label: 'FAILED', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle },
  NOT_CONFIGURED: { label: 'NOT CONFIGURED', color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)', icon: Clock },
  AUTH_REQUIRED: { label: 'AUTH REQUIRED', color: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: Shield },
}

export function GovSourceCard({ dataset }: GovSourceCardProps) {
  const cfg = GOV_STATUS_CONFIG[dataset.status]
  const Icon = cfg.icon
  const lastRetrieved = dataset.last_retrieved
    ? new Date(dataset.last_retrieved).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
    : '—'

  return (
    <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{dataset.source}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{dataset.organization}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', background: cfg.bg, padding: '4px 10px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>
          <Icon size={11} style={{ color: cfg.color }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{cfg.label}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {[
          { label: 'ACCESS', value: dataset.access_type },
          { label: 'FORMAT', value: dataset.format },
          { label: 'API KEY', value: dataset.api_key_required ? 'REQUIRED' : 'NOT REQUIRED' },
          { label: 'UPDATE FREQ', value: dataset.update_frequency },
          { label: 'LAST RETRIEVED', value: lastRetrieved },
          { label: 'RECORDS', value: dataset.record_count != null ? dataset.record_count.toString() : '—' },
        ].map(r => (
          <div key={r.label}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)' }}>{r.label}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{r.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-bg)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>OFFICIAL</span>
        <a
          href={dataset.source_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', textDecoration: 'none' }}
        >
          <ExternalLink size={11} />
          View source
        </a>
      </div>
    </div>
  )
}
