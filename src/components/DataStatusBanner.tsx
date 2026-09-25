import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'

interface Props {
  anyGovConnected?: boolean
  fareFeedConnected?: boolean
  fareFeedLive?: boolean
  verifiedObservations?: number | null
  showGovernmentStatus?: boolean
  isLoading?: boolean
  lastFetch?: string | null
}

export default function DataStatusBanner({ anyGovConnected = true, fareFeedConnected = false, fareFeedLive = false, verifiedObservations = null, showGovernmentStatus = true, isLoading = false, lastFetch }: Props) {
  const [showDetails, setShowDetails] = useState(false)
  const time = lastFetch
    ? new Date(lastFetch).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST'
    : 'CHECKED'
  // The public dashboard is driven by verified fare observations, not the
  // optional government registry. A registry outage must not label live fares
  // as degraded.
  const healthy = fareFeedConnected || (anyGovConnected && !isLoading)
  const headline = fareFeedLive
    ? 'LIVE VERIFIED FARE DATA AVAILABLE'
    : fareFeedConnected
      ? 'VERIFIED FARE SNAPSHOT AVAILABLE'
      : healthy ? 'DATA FEEDS CONNECTED' : isLoading ? 'CHECKING DATA FEEDS' : 'DATA FEEDS DEGRADED'

  return (
    <div className="data-status-banner" style={{ position: 'relative' }}>
      <button
        onClick={() => setShowDetails(v => !v)}
        title="Click to view real-time pipeline status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: '5px 14px',
          background: healthy ? 'rgba(22, 163, 74, 0.12)' : 'rgba(217,119,6,0.12)',
          borderRadius: 'var(--radius-full)',
          border: `1px solid ${healthy ? 'rgba(22, 163, 74, 0.35)' : 'rgba(217,119,6,0.35)'}`,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = healthy ? 'rgba(22, 163, 74, 0.2)' : 'rgba(217,119,6,0.18)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = healthy ? 'rgba(22, 163, 74, 0.12)' : 'rgba(217,119,6,0.12)'
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: healthy ? '#16a34a' : '#d97706',
            boxShadow: healthy ? '0 0 8px #22c55e' : 'none',
            animation: healthy ? 'pulse-dot 2s infinite' : 'none',
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: healthy ? '#15803d' : '#b45309',
            letterSpacing: '0.05em',
            fontFamily: 'var(--font-sans)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {headline} · {time}
        </span>
      </button>

      {/* Interactive Telemetry Dropdown / Modal */}
      {showDetails && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 340,
            background: 'var(--color-surface-bg)',
            border: '1px solid var(--color-border-primary)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-floating)',
            padding: 16,
            zIndex: 150,
            animation: 'fade-in 150ms ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={16} style={{ color: '#16a34a' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                System Health
              </span>
            </div>
            <button
              onClick={() => setShowDetails(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'var(--color-surface-secondary)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Verified Fare Feed</span>
              <span style={{ fontWeight: 700, color: fareFeedConnected ? '#16a34a' : '#d97706' }}>{fareFeedLive ? 'LIVE' : fareFeedConnected ? 'STORED SNAPSHOT' : 'UNAVAILABLE'}</span>
            </div>
            {showGovernmentStatus && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'var(--color-surface-secondary)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>DGCA & MoSPI Gov Registry</span>
              <span style={{ fontWeight: 700, color: anyGovConnected ? '#16a34a' : '#d97706' }}>{anyGovConnected ? 'CONNECTED' : 'UNAVAILABLE'}</span>
            </div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'var(--color-surface-secondary)' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Verified Fares in Database</span>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{verifiedObservations == null ? 'Unavailable' : `${verifiedObservations.toLocaleString('en-IN')} records`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
