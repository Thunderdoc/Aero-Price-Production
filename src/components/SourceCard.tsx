import { ExternalLink, AlertTriangle, CheckCircle, XCircle, Clock, Shield } from 'lucide-react'
import type { AirfareSource, GovDataset } from '../types/observation'

// ── Airfare source card ────────────────────────────────────────────────────────

interface AirfareSourceCardProps {
  source: AirfareSource
}

const AIRFARE_STATUS_CONFIG = {
  LIVE: { label: 'LIVE', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle, borderColor: 'var(--color-success)', badgeCls: 'ap-badge ap-badge-live' },
  CONFIGURED: { label: 'CONFIGURED', color: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: Clock, borderColor: 'var(--color-info)', badgeCls: 'ap-badge ap-badge-official' },
  STALE_DATA: { label: 'STALE DATA', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: Clock, borderColor: 'var(--color-warning)', badgeCls: 'ap-badge ap-badge-gen' },
  DEGRADED: { label: 'DEGRADED', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: AlertTriangle, borderColor: 'var(--color-warning)', badgeCls: 'ap-badge ap-badge-gen' },
  NO_DATA: { label: 'NO DATA', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: Clock, borderColor: 'var(--color-warning)', badgeCls: 'ap-badge ap-badge-gen' },
  CHALLENGE_DETECTED: { label: 'CHALLENGE DETECTED', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: AlertTriangle, borderColor: 'var(--color-warning)', badgeCls: 'ap-badge ap-badge-gen' },
  SOURCE_BLOCKED: { label: 'SOURCE BLOCKED', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle, borderColor: 'var(--color-danger)', badgeCls: 'ap-badge ap-badge-offline' },
  AUTH_REQUIRED: { label: 'AUTH REQUIRED', color: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: Shield, borderColor: 'var(--color-info)', badgeCls: 'ap-badge ap-badge-official' },
  NOT_CONFIGURED: { label: 'NOT CONFIGURED', color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)', icon: Clock, borderColor: 'var(--color-border-primary)', badgeCls: 'ap-badge ap-badge-sandbox' },
  CONNECTED: { label: 'CONNECTED', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle, borderColor: 'var(--color-success)', badgeCls: 'ap-badge ap-badge-live' },
  HEALTHY: { label: 'HEALTHY', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle, borderColor: 'var(--color-success)', badgeCls: 'ap-badge ap-badge-live' },
  FAILED: { label: 'FAILED', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle, borderColor: 'var(--color-danger)', badgeCls: 'ap-badge ap-badge-offline' },
}

export function AirfareSourceCard({ source }: AirfareSourceCardProps) {
  const cfg = AIRFARE_STATUS_CONFIG[source.status]
  const Icon = cfg.icon
  const isActive = source.status === 'LIVE' || source.status === 'CONNECTED' || source.status === 'HEALTHY'

  return (
    <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', borderLeft: `3px solid ${cfg.borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isActive && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', animation: 'pulse-dot 1.4s ease-in-out infinite', flexShrink: 0 }} />}
            <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{source.name}</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{source.organization}</div>
        </div>
        <span className={cfg.badgeCls}>
          <Icon size={11} />
          {cfg.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {[
          { label: 'robots.txt', value: source.robots_txt },
          { label: 'CAPTCHA', value: source.captcha_detected ? 'DETECTED' : 'NONE' },
          { label: 'Public API', value: source.api_available ? 'YES' : 'NO' },
          { label: 'Last Attempt', value: source.last_attempt ? new Date(source.last_attempt).toLocaleString('en-IN') : 'Never' },
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

      {source.source_url && <a
        href={source.source_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', textDecoration: 'none' }}
      >
        <ExternalLink size={11} />
        {source.source_url.replace('https://', '')}
      </a>}
    </div>
  )
}

// ── Government dataset card ───────────────────────────────────────────────────

interface GovSourceCardProps {
  dataset: GovDataset
}

const GOV_STATUS_CONFIG = {
  CONNECTED: { label: 'CONNECTED', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle, borderColor: 'var(--color-success)', badgeCls: 'ap-badge ap-badge-live' },
  HEALTHY: { label: 'HEALTHY', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: CheckCircle, borderColor: 'var(--color-success)', badgeCls: 'ap-badge ap-badge-live' },
  UNAVAILABLE: { label: 'UNAVAILABLE', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle, borderColor: 'var(--color-danger)', badgeCls: 'ap-badge ap-badge-offline' },
  STALE: { label: 'STALE', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: Clock, borderColor: 'var(--color-warning)', badgeCls: 'ap-badge ap-badge-gen' },
  FAILED: { label: 'FAILED', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', icon: XCircle, borderColor: 'var(--color-danger)', badgeCls: 'ap-badge ap-badge-offline' },
  NOT_CONFIGURED: { label: 'NOT CONFIGURED', color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)', icon: Clock, borderColor: 'var(--color-border-primary)', badgeCls: 'ap-badge ap-badge-sandbox' },
  AUTH_REQUIRED: { label: 'AUTH REQUIRED', color: 'var(--color-info)', bg: 'var(--color-info-bg)', icon: Shield, borderColor: 'var(--color-info)', badgeCls: 'ap-badge ap-badge-official' },
}

export function GovSourceCard({ dataset }: GovSourceCardProps) {
  const cfg = GOV_STATUS_CONFIG[dataset.status]
  const Icon = cfg.icon
  const isActive = dataset.status === 'CONNECTED' || dataset.status === 'HEALTHY'
  const lastRetrieved = dataset.last_retrieved
    ? new Date(dataset.last_retrieved).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
    : '—'

  return (
    <div className="ap-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', borderLeft: `3px solid ${cfg.borderColor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isActive && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', display: 'inline-block', animation: 'pulse-dot 1.4s ease-in-out infinite', flexShrink: 0 }} />}
            <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{dataset.source}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>{dataset.organization}</div>
        </div>
        <span className={cfg.badgeCls} style={{ flexShrink: 0 }}>
          <Icon size={11} />
          {cfg.label}
        </span>
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
        <span className="ap-badge ap-badge-official">OFFICIAL</span>
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
