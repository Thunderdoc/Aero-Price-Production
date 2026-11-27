import { useState, useEffect } from 'react'
import { CheckCircle2, Globe, RefreshCw, Server, Zap, ShieldCheck } from 'lucide-react'
import { GovSourceCard } from '../components/SourceCard'
import { useGovData } from '../hooks/useGovData'
import { apiSources } from '../services/api'
import type { AirfareSource } from '../types/observation'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import { formatDateTimeIST } from '../lib/liveStatus'

function isoTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  return formatDateTimeIST(iso)
}

export default function DataSources() {
  const { token } = useAuth()
  const { datasets, isLoading, failedSources, refresh } = useGovData()
  const [tab, setTab] = useState<'airfare' | 'government'>('airfare')
  const [displaySources, setDisplaySources] = useState<AirfareSource[]>([])
  const [airfareLoading, setAirfareLoading] = useState(true)
  const [airfareError, setAirfareError] = useState(false)
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  async function loadAirfareSources() {
    setAirfareLoading(true)
    setAirfareError(false)
    try {
      let response
      try {
        response = await apiSources(token ?? undefined)
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000))
        response = await apiSources(token ?? undefined)
      }
      const sources = response.airfare_sources ?? response.airfare ?? []
      setDisplaySources(
        sources.map(source => ({
          id: source.id,
          name: source.name,
          organization: source.type,
          source_url: source.registration_url ?? '',
          status: source.status as AirfareSource['status'],
          status_reason:
            source.challenge_reason ?? source.note ??
            (source.status === 'LIVE' ? 'Backend reported a live source.' : 'No verified live response has been recorded.'),
          robots_txt: (source.robots_txt ?? 'UNKNOWN') as AirfareSource['robots_txt'],
          captcha_detected: Boolean(source.captcha_detected),
          api_available: Boolean(source.api_available),
          last_attempt: source.last_attempt ?? null,
          records_received: source.records_total ?? 0,
        })),
      )
    } catch {
      setDisplaySources([])
      setAirfareError(true)
    } finally {
      setAirfareLoading(false)
    }
  }

  useEffect(() => {
    void loadAirfareSources()
  }, [token])

  const connectedAirfare = displaySources.filter(s => ['LIVE', 'CONNECTED', 'HEALTHY'].includes(s.status as string)).length
  const govConnected = datasets.filter(d => ['CONNECTED', 'HEALTHY', 'STALE'].includes(d.status)).length
  const totalRecords = displaySources.reduce((acc, s) => acc + (s.records_received ?? 0), 0)
  // Summary dots are green ONLY when at least one source is connected after a
  // completed load — 0/N or still-loading is grey (audit §7.1).
  const airfareDot = !airfareLoading && connectedAirfare > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)'
  const govDot = !isLoading && govConnected > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)'
  const checksDone = !airfareLoading && !isLoading

  const summaryItems = [
    { label: 'AIRFARE FEEDS', value: airfareLoading || airfareError ? '—' : `${connectedAirfare}/${displaySources.length}`, color: airfareDot, dot: airfareDot },
    { label: 'GOV REGISTRIES', value: isLoading || failedSources.datasets ? '—' : `${govConnected}/${datasets.length}`, color: govDot, dot: govDot },
    { label: 'SYSTEM LATENCY', value: '—', color: 'var(--color-text-tertiary)', dot: null },
    { label: 'SOURCE-REPORTED RECORDS', value: totalRecords.toLocaleString('en-IN'), color: 'var(--color-text-primary)', dot: null },
    { label: 'PIPELINE UPTIME', value: '—', color: 'var(--color-text-tertiary)', dot: null },
  ]

  async function handleRefreshAll() {
    setRefreshing(true)
    setRefreshMsg(null)
    await Promise.all([refresh(), loadAirfareSources()])
    setRefreshing(false)
    setRefreshMsg('Sources refreshed. Only configured providers with verified responses are marked connected.')
    setTimeout(() => setRefreshMsg(null), 5000)
  }

  return (
    <div className="page-enter flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 1040 }}>
      {/* ── Premium Header ─────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-2xl) var(--space-3xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-xl)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-lg)',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 60%, #1e40af 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(37,99,235,0.4)',
            }}
          >
            <ShieldCheck size={26} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
              <h1
                style={{
                  fontSize: 'var(--text-title-size)',
                  fontWeight: 800,
                  color: 'var(--color-text-primary)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                Data Pipeline Registry
              </h1>
              <span className={checksDone ? 'ap-badge ap-badge-official' : 'ap-badge ap-badge-gen'}>{checksDone ? 'SYSTEM CHECKED · VERIFY SOURCES' : 'CHECKING SOURCES…'}</span>
            </div>
            <p
              style={{
                fontSize: 'var(--text-body-size)',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Unified registry of active airfare ingestion pipelines, GDS aggregators, and official government data streams.
            </p>
          </div>
        </div>

        {/* Global Manual Re-Test Button */}
        <button
          onClick={handleRefreshAll}
          disabled={refreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 10,
            background: 'var(--gradient-brand)',
            border: 'none',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            boxShadow: 'var(--shadow-brand)',
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.04em',
            transition: 'all 0.15s ease',
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Pinging All Pipelines…' : 'Re-verify All Feeds'}
        </button>
      </div>

      {/* Success Notification */}
      {refreshMsg && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 10,
            background: 'rgba(22, 163, 74, 0.12)',
            border: '1px solid rgba(22, 163, 74, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#15803d',
            fontSize: 13,
            fontWeight: 600,
            animation: 'fade-in 200ms ease',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{refreshMsg}</span>
        </div>
      )}

      {/* ── Status Metrics Bar ──────────────────────── */}
      <div
        style={{
          background: 'var(--color-surface-bg)',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg) var(--space-2xl)',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          flexWrap: 'nowrap',
          overflowX: 'auto',
        }}
      >
        {summaryItems.map((item, i) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
              padding: '0 var(--space-2xl)',
              borderRight: i < summaryItems.length - 1 ? '1px solid var(--color-border-primary)' : 'none',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.dot && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: item.dot,
                    display: 'inline-block',
                    boxShadow: `0 0 8px ${item.dot}`,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {item.label}
              </span>
            </div>
            <span
              style={{
                fontSize: '1.35rem',
                fontWeight: 800,
                color: item.color,
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Source reliability panel (SIH extra, 26 Nov 2026): one
          evaluator-facing summary of feed health from the same backend
          source-health rows the cards below render. */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-2xl)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>Source reliability</div>
        {airfareLoading ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Loading source health…</div>
        ) : airfareError ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Source health could not be loaded. Use Refresh to retry.</div>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-2xl)', flexWrap: 'wrap', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <span>Live now: <strong style={{ color: 'var(--color-text-primary)' }}>{displaySources.filter(s => s.status === 'LIVE').length}</strong></span>
            <span>Stale / degraded: <strong style={{ color: 'var(--color-text-primary)' }}>{displaySources.filter(s => ['STALE', 'STALE_DATA', 'DEGRADED'].includes(s.status as string)).length}</strong></span>
            <span>Challenged: <strong style={{ color: 'var(--color-text-primary)' }}>{displaySources.filter(s => s.status === 'CHALLENGE_DETECTED').length}</strong></span>
            <span>Not configured: <strong style={{ color: 'var(--color-text-primary)' }}>{displaySources.filter(s => s.status === 'NOT_CONFIGURED').length}</strong></span>
            <span>Records reported: <strong style={{ color: 'var(--color-text-primary)' }}>{totalRecords.toLocaleString('en-IN')}</strong></span>
            <span>Latest attempt: <strong style={{ color: 'var(--color-text-primary)' }}>{isoTimestamp(displaySources.map(s => s.last_attempt).filter(Boolean).sort().at(-1))}</strong></span>
          </div>
        )}
      </div>

      {/* Source policy notice — neutral info styling: this is an explainer,
          not a live status, so it must not render green (audit §7.1). */}
      <div
        style={{
          background: 'var(--color-info-bg)',
          border: '1px solid rgba(3, 105, 161, 0.25)',
          borderLeft: '4px solid var(--color-info)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg) var(--space-xl)',
          display: 'flex',
          gap: 'var(--space-lg)',
          alignItems: 'center',
        }}
      >
        <Zap size={20} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: 'var(--color-info)',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-sans)',
              marginBottom: 3,
            }}
          >
            VERIFIED SOURCES & REGULATORY FEEDS
          </div>
          <p
            style={{
              fontSize: 'var(--text-body-size)',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Only authorized providers that return a verified response are shown as connected. Unconfigured or unavailable sources remain clearly identified and do not contribute fabricated records.
          </p>
        </div>
      </div>

      {/* Tab Selector */}
      <div role="tablist" aria-label="Source registry tabs" style={{ display: 'flex', gap: 'var(--space-sm)', borderBottom: '1px solid var(--color-border-primary)', paddingBottom: 0 }}>
        {[
          { key: 'airfare', label: `Airfare & Airline Pipelines (${displaySources.length})`, icon: Globe },
          { key: 'government', label: `Government Portals & Registries (${datasets.length})`, icon: Server },
        ].map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key as 'airfare' | 'government')}
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                color: tab === t.key ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'color 0.15s',
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'airfare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {airfareLoading ? (
            <div className="ap-card" style={{ padding: 24, color: 'var(--color-text-secondary)' }}>
              Loading source status from the backend…
            </div>
          ) : displaySources.length === 0 ? (
            <div className="ap-card" style={{ padding: 8 }}>
              {airfareError
                ? <EmptyState title="AIRFARE SOURCES COULD NOT LOAD" detail="The source registry did not return a result. Refresh to retry." />
                : <EmptyState title="NO AIRFARE SOURCE REGISTRY" detail="The backend returned no airfare source registry records for this session." />}
            </div>
          ) : displaySources.map(s => {
            const hovered = hoveredSourceId === s.id
            const isConnected = ['LIVE', 'CONNECTED', 'HEALTHY'].includes(s.status as string)
            // The status dot is green ONLY for a connected status from the
            // backend — never hardcoded green for every row (audit §7.1).
            const dotColor = isConnected ? '#16a34a' : 'var(--color-text-tertiary)'
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredSourceId(s.id)}
                onMouseLeave={() => setHoveredSourceId(null)}
                style={{
                  background: 'var(--color-surface-bg)',
                  border: `1px solid ${hovered ? 'var(--color-border-secondary)' : 'var(--color-border-primary)'}`,
                  borderLeft: `4px solid ${isConnected ? '#16a34a' : '#94a3b8'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-xl)',
                  boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: dotColor,
                        display: 'inline-block',
                        boxShadow: isConnected ? '0 0 8px #22c55e' : 'none',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                          {s.name}
                        </span>
                        <span className={`ap-badge ${isConnected ? 'ap-badge-real' : 'ap-badge-sandbox'}`}>{s.status}</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                        {s.organization}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ padding: '4px 10px', borderRadius: 6, background: s.last_attempt ? 'rgba(22,163,74,0.1)' : 'var(--color-surface-secondary)', color: s.last_attempt ? '#15803d' : 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {s.last_attempt ? `LAST: ${isoTimestamp(s.last_attempt)}` : 'NOT CHECKED'}
                    </div>
                    <div style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {s.api_available ? 'API SUPPORTED' : 'NO OFFICIAL API'}
                    </div>
                  </div>
                </div>

                {/* Reason / Details */}
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-sans)',
                    margin: 'var(--space-md) 0 0',
                    lineHeight: 1.65,
                  }}
                >
                  {s.status_reason}
                </p>

                {/* Meta Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2xl)',
                    marginTop: 'var(--space-lg)',
                    paddingTop: 'var(--space-md)',
                    borderTop: '1px solid var(--color-border-primary)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                      SOURCE-REPORTED RECORDS
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', marginTop: 2 }}>
                      {(s.records_received ?? 0).toLocaleString('en-IN')} offers
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                      LAST ATTEMPT
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {isoTimestamp(s.last_attempt)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                      API CAPABILITY
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: s.api_available ? '#16a34a' : 'var(--color-text-tertiary)', marginTop: 2, fontWeight: 700 }}>
                      {s.api_available ? 'SUPPORTED' : 'NOT LISTED'}
                    </div>
                  </div>

                  <a
                    href={s.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: 'var(--color-brand-primary)',
                      fontFamily: 'var(--font-sans)',
                      textDecoration: 'none',
                      marginLeft: 'auto',
                      fontWeight: 600,
                    }}
                  >
                    {s.source_url ? `${s.source_url.replace('https://', '')} ↗` : 'No provider URL returned'}
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'government' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
              Government source status is taken directly from the latest backend refresh.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {datasets.length === 0 && !isLoading && (
              <div className="ap-card" style={{ padding: 8 }}>
                <EmptyState title="NO GOVERNMENT REGISTRIES RETURNED" detail="The backend returned no government source records for this session." />
              </div>
            )}
            {datasets.map(d => (
              <div
                key={d.id}
                style={{
                  background: 'var(--color-surface-bg)',
                  border: '1px solid var(--color-border-primary)',
                  borderLeft: `4px solid ${d.status === 'CONNECTED' || d.status === 'HEALTHY' ? '#16a34a' : '#94a3b8'}`,
                  borderRadius: 'var(--radius-lg)',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                }}
              >
                <GovSourceCard dataset={d} />
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--color-info-bg)',
              border: '1px solid rgba(3,105,161,0.2)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-lg) var(--space-xl)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-info)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-sm)' }}>
              OFFICIAL GOVERNMENT AVIATION DATA INTEGRATION
            </div>
            <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.65 }}>
              Official records are displayed only after a successful source response. Missing credentials, unavailable portals, and unparseable publications remain visible as source-status information rather than being presented as data.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
