import { useState } from 'react'
import { AlertTriangle, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { recentAnomalies } from '../data/sampleData'
import type { Anomaly } from '../data/sampleData'

type Severity = 'HIGH' | 'MEDIUM' | 'LOW'

function getSeverity(anomaly: Anomaly): Severity {
  if (Math.abs(anomaly.deviation) >= 60) return 'HIGH'
  if (Math.abs(anomaly.deviation) >= 30) return 'MEDIUM'
  return 'LOW'
}

function severityBorderColor(severity: Severity): string {
  if (severity === 'HIGH') return 'var(--color-danger)'
  if (severity === 'MEDIUM') return 'var(--color-warning)'
  return 'var(--color-border-secondary)'
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const severity = getSeverity(anomaly)
  const [elevated, setElevated] = useState(false)

  const detectedDate = new Date(anomaly.detectedAt)
  const dateStr = detectedDate.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  const borderColor = severityBorderColor(severity)
  const isPositive = anomaly.deviation > 0

  return (
    <div
      className="ap-card"
      style={{
        padding: 'var(--space-xl)',
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: elevated
          ? `var(--shadow-md), 0 0 0 1px ${borderColor}30`
          : 'var(--shadow-sm)',
        transform: elevated ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease',
        cursor: 'default',
      }}
      onMouseOver={() => setElevated(true)}
      onMouseOut={() => setElevated(false)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        {/* Severity badge */}
        <span
          className={`ap-badge ${severity === 'HIGH' ? 'ap-badge-live' : severity === 'MEDIUM' ? 'ap-badge-gen' : 'ap-badge-sandbox'}`}
          style={severity === 'HIGH' ? { background: 'var(--color-danger-bg)', color: 'var(--color-danger)' } : undefined}
        >
          {severity === 'HIGH' && (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-danger)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
          )}
          {severity}
        </span>

        {/* Type badge */}
        <span
          className="ap-badge"
          style={{
            background: anomaly.type === 'SPIKE' ? 'var(--color-danger-bg)' : anomaly.type === 'DIP' ? 'var(--color-info-bg)' : 'var(--color-warning-bg)',
            color: anomaly.type === 'SPIKE' ? 'var(--color-danger)' : anomaly.type === 'DIP' ? 'var(--color-info)' : 'var(--color-warning)',
          }}
        >
          {anomaly.type === 'SPIKE' ? <TrendingUp size={9} /> : anomaly.type === 'DIP' ? <TrendingDown size={9} /> : <Minus size={9} />}
          {anomaly.type}
        </span>

        {/* Route label */}
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '0.04em',
        }}>
          {anomaly.route}
        </span>

        {/* Status */}
        <span
          className="ap-badge"
          style={{
            marginLeft: 'auto',
            background: anomaly.resolved ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            color: anomaly.resolved ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {anomaly.resolved ? 'RESOLVED' : 'ACTIVE'}
        </span>
      </div>

      {/* Fare data row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-xl)', marginBottom: 'var(--space-sm)' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>OBSERVED</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
            ₹{anomaly.fare.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 18, lineHeight: 1 }}>vs</div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>EXPECTED</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            ₹{anomaly.expectedFare.toLocaleString('en-IN')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>DEVIATION</div>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: isPositive ? 'var(--color-danger)' : 'var(--color-success)',
          }}>
            {isPositive ? '+' : ''}{anomaly.deviation.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Timestamp */}
      <div style={{
        fontSize: 10,
        color: 'var(--color-text-tertiary)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
      }}>
        DETECTED · {dateStr}
      </div>
    </div>
  )
}

export default function Anomalies() {
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL')

  const filtered = recentAnomalies.filter(a => {
    if (filter === 'ACTIVE') return !a.resolved
    if (filter === 'RESOLVED') return a.resolved
    return true
  })

  const highCount = recentAnomalies.filter(a => getSeverity(a) === 'HIGH').length
  const activeCount = recentAnomalies.filter(a => !a.resolved).length

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2xl)', maxWidth: 960 }}>

      {/* Dramatic header strip */}
      <div style={{
        background: 'var(--gradient-hero-dark)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        position: 'relative',
        padding: '28px 32px',
        boxShadow: '0 20px 50px rgba(8,14,26,0.35)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />
        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: -60, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'rgba(220,38,38,0.18)', filter: 'blur(70px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, left: 60, width: 180, height: 180, borderRadius: '50%', background: 'rgba(217,119,6,0.14)', filter: 'blur(50px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          {/* Eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(252,165,165,0.8)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(252,165,165,0.8)', letterSpacing: '0.15em', fontFamily: 'var(--font-mono)' }}>
              ANOMALY DETECTION ENGINE
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)' }}>
              INDIA AIRFARE MONITOR
            </span>
          </div>

          {/* Title + stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: '0 32px', alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>SYSTEM STATUS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.35)', width: 'fit-content' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-danger)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
                  {activeCount} ACTIVE ALERTS
                </span>
              </div>
            </div>

            <div style={{ paddingTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)', lineHeight: 1.65 }}>
              Statistical outlier detection across all monitored India corridors. Deviations &gt; 30% trigger alerts. High-severity events are flagged for immediate review.
            </div>

            {[
              { label: 'TOTAL', value: recentAnomalies.length },
              { label: 'HIGH SEV', value: highCount },
              { label: 'ACTIVE', value: activeCount },
            ].map(stat => (
              <div key={stat.label} style={{ paddingTop: 24, textAlign: 'right' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar + section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-danger)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            ANOMALY ALERTS
          </span>
        </div>
        {(['ALL', 'ACTIVE', 'RESOLVED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.07em',
              border: '1px solid',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              background: filter === f ? 'var(--color-brand-primary)' : 'var(--color-surface-bg)',
              color: filter === f ? 'var(--color-text-on-brand)' : 'var(--color-text-secondary)',
              borderColor: filter === f ? 'var(--color-brand-primary)' : 'var(--color-border-primary)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Anomaly cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
        {filtered.length === 0 ? (
          <div className="ap-card" style={{ padding: 'var(--space-3xl)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>
              {filter === 'ALL' ? 'No anomalies detected' : `No ${filter.toLowerCase()} anomalies`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
              {filter !== 'ALL' ? 'Try changing the filter to see all anomalies.' : 'All corridors are within normal range.'}
            </div>
          </div>
        ) : (
          filtered.map(a => <AnomalyCard key={a.id} anomaly={a} />)
        )}
      </div>

      {/* Data note */}
      <div style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-warning-bg)',
        border: '1px solid rgba(217,119,6,0.25)',
        fontSize: 11,
        color: 'var(--color-warning)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
      }}>
        <Activity size={12} />
        Anomaly detection trained on Kaggle 2019 historical baseline. Real detection requires live airfare collector feeds.
      </div>
    </div>
  )
}
