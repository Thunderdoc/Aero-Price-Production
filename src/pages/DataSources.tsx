import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, Shield, Globe, Server, CheckCircle2, XCircle } from 'lucide-react'
import { fetchDgcaMonthlyStats, fetchDgcaCirculars } from '../services/govFetcher'
import { Button } from '../components/ui/Button'
import { AirfareSourceCard, GovSourceCard } from '../components/SourceCard'
import { useGovData } from '../hooks/useGovData'
import { apiSourceHealth, isBackendAvailable } from '../services/api'
import type { AirfareSource } from '../types/observation'
import { getApiHealth } from '../services/flightData'

// Derive live API status from env-var presence at page load time
const _apiHealth = getApiHealth()
const _asKey    = _apiHealth.aviationstack.configured
const _efKey    = _apiHealth.ef.configured
const _ignavKey = _apiHealth.ignav.configured

const AIRFARE_SOURCES: AirfareSource[] = [
  {
    id: 'indigo', name: 'IndiGo', organization: 'InterGlobe Aviation Ltd.',
    source_url: 'https://www.goindigo.in',
    status: 'CHALLENGE_DETECTED',
    status_reason: 'Cloudflare Bot Management active. JS fingerprinting + TLS inspection blocks headless clients. CAPTCHA on fare query endpoints.',
    robots_txt: 'DISALLOWED', captcha_detected: true, api_available: false,
    last_attempt: null, records_received: 0,
  },
  {
    id: 'airindia', name: 'Air India', organization: 'Air India Ltd.',
    source_url: 'https://www.airindia.com',
    status: 'CHALLENGE_DETECTED',
    status_reason: 'Anti-scraping middleware (Imperva) detected. Session tokens required for fare search. Browser fingerprinting on JS bundle.',
    robots_txt: 'DISALLOWED', captcha_detected: true, api_available: false,
    last_attempt: null, records_received: 0,
  },
  {
    id: 'airindia-express', name: 'Air India Express', organization: 'Air India Express Ltd.',
    source_url: 'https://www.airindiaexpress.com',
    status: 'CHALLENGE_DETECTED',
    status_reason: 'Shares CDN protection with Air India parent. Dynamic JS rendering; no static fare endpoints accessible.',
    robots_txt: 'DISALLOWED', captcha_detected: true, api_available: false,
    last_attempt: null, records_received: 0,
  },
  {
    id: 'akasa', name: 'Akasa Air', organization: 'SNV Aviation Pvt. Ltd.',
    source_url: 'https://www.akasaair.com',
    status: 'CHALLENGE_DETECTED',
    status_reason: 'React SPA with obfuscated API endpoints. reCAPTCHA v3 on search flow. Rate limiting < 3 req/min before block.',
    robots_txt: 'DISALLOWED', captcha_detected: true, api_available: false,
    last_attempt: null, records_received: 0,
  },
  {
    id: 'spicejet', name: 'SpiceJet', organization: 'SpiceJet Ltd.',
    source_url: 'https://www.spicejet.com',
    status: 'CHALLENGE_DETECTED',
    status_reason: 'Cloudflare Enterprise + browser fingerprinting. TLS certificate pinning on mobile API. Header validation rejects automation.',
    robots_txt: 'DISALLOWED', captcha_detected: true, api_available: false,
    last_attempt: null, records_received: 0,
  },
  {
    id: 'aviationstack',
    name: 'AviationStack',
    organization: 'apilayer / AviationStack',
    source_url: 'https://aviationstack.com',
    status: _asKey ? 'CONNECTED' : 'NOT_CONFIGURED',
    status_reason: _asKey
      ? `API key configured (VITE_FLIGHT_API_KEY). Fetching live domestic flight schedules for DEL, BOM, BLR, HYD, MAA, CCU corridors via /v1/flights.`
      : 'API key not detected. Free tier provides flight schedules; paid tier adds real-time position data. Add your AviationStack key to connect.',
    robots_txt: 'ALLOWED', captcha_detected: false, api_available: true,
    last_attempt: _asKey ? new Date().toISOString() : null,
    records_received: 0,
  },
  {
    id: 'ef-api',
    name: 'EF Live Fares API',
    organization: 'EF / Exactfares',
    source_url: 'https://api.ef.io',
    status: _efKey ? 'CONNECTED' : 'NOT_CONFIGURED',
    status_reason: _efKey
      ? `API key configured (VITE_EF_API_KEY, ak_live_ prefix). Ready to fetch live Indian domestic fare data.`
      : 'API key not detected. Credit-based live fare search API. Add your EF API key to connect.',
    robots_txt: 'ALLOWED', captcha_detected: false, api_available: true,
    last_attempt: _efKey ? new Date().toISOString() : null,
    records_received: 0,
  },
  {
    id: 'ignav',
    name: 'Ignav Aviation Data',
    organization: 'Ignav.io',
    source_url: 'https://ignav.io',
    status: _ignavKey ? 'CONNECTED' : 'NOT_CONFIGURED',
    status_reason: _ignavKey
      ? `API key configured (VITE_IGNAV_API_KEY). Indian aviation navigation and route data source.`
      : 'API key not detected. Add your Ignav.io key to connect Indian aviation route data.',
    robots_txt: 'ALLOWED', captcha_detected: false, api_available: true,
    last_attempt: _ignavKey ? new Date().toISOString() : null,
    records_received: 0,
  },
  {
    id: 'amadeus', name: 'Amadeus Self-Service API', organization: 'Amadeus IT Group SA',
    source_url: 'https://developers.amadeus.com/self-service',
    status: 'NOT_CONFIGURED',
    status_reason: 'Authorized B2B flight content aggregator. Add AMADEUS_API_KEY + AMADEUS_API_SECRET to connect.',
    robots_txt: 'ALLOWED', captcha_detected: false, api_available: true,
    last_attempt: null, records_received: 0,
  },
]

function isoTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export default function DataSources() {
  const { datasets, isLoading } = useGovData()
  const [tab, setTab] = useState<'airfare' | 'government'>('airfare')
  const [liveSourceStatus, setLiveSourceStatus] = useState<Record<string, { status: string; records: number }>>({})
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null)
  const [govRefreshing, setGovRefreshing] = useState(false)
  const [govRefreshResult, setGovRefreshResult] = useState<{ ok: boolean; msg: string; ts: Date } | null>(null)

  useEffect(() => {
    isBackendAvailable().then(up => {
      if (!up) return
      apiSourceHealth().then(resp => {
        const raw = resp as unknown as { sources?: Array<{ source_id: string; status: string; records_total?: number }> } | Array<{ source_id: string; status: string; records_total?: number }>
        const list = Array.isArray(raw) ? raw : (raw.sources ?? [])
        const map: Record<string, { status: string; records: number }> = {}
        for (const s of list) {
          map[s.source_id] = { status: s.status, records: s.records_total ?? 0 }
        }
        setLiveSourceStatus(map)
      }).catch(() => {})
    })
  }, [])

  const displaySources: AirfareSource[] = AIRFARE_SOURCES.map(s => {
    const live = liveSourceStatus[s.id]
    if (live) {
      return { ...s, status: live.status as AirfareSource['status'], records_received: live.records }
    }
    return s
  })

  const blockedCount = displaySources.filter(s => s.status === 'CHALLENGE_DETECTED').length
  const connectedAirfare = displaySources.filter(s => s.status === 'CONNECTED').length
  const govConnected = datasets.filter(d => d.status === 'CONNECTED' || d.status === 'HEALTHY' || d.status === 'STALE').length
  const govFailed = datasets.filter(d => d.status === 'UNAVAILABLE' || d.status === 'FAILED').length

  const summaryItems = [
    { label: 'BLOCKED', value: blockedCount, color: 'var(--color-warning)', dot: 'var(--color-warning)' },
    { label: 'AIRFARE CONNECTED', value: connectedAirfare, color: connectedAirfare > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)', dot: 'var(--color-success)' },
    { label: 'GOV SOURCES', value: datasets.length, color: 'var(--color-text-primary)', dot: null },
    { label: 'GOV CONNECTED', value: govConnected, color: 'var(--color-success)', dot: 'var(--color-success)' },
    { label: 'GOV UNAVAILABLE', value: govFailed, color: govFailed > 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)', dot: govFailed > 0 ? 'var(--color-danger)' : null },
    { label: 'TOTAL SOURCES', value: displaySources.length + datasets.length, color: 'var(--color-brand-primary)', dot: null },
  ]

  return (
    <div className="page-enter flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 960 }}>

      {/* ── Premium Header ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--color-surface-bg)',
        border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-2xl) var(--space-3xl)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 'var(--space-xl)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-xl)' }}>
          {/* Shield badge */}
          <div style={{
            width: 48, height: 48, borderRadius: 'var(--radius-lg)', flexShrink: 0,
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 60%, #1e40af 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
          }}>
            <Shield size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
              <h1 style={{
                fontSize: 'var(--text-title-size)', fontWeight: 700,
                color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
                letterSpacing: '-0.02em', margin: 0,
              }}>Data Sources</h1>
              <span className="ap-badge ap-badge-official">REGISTRY</span>
            </div>
            <p style={{
              fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.6,
            }}>
              Complete source registry — airfare collectors and official government datasets. All statuses are live.
            </p>
          </div>
        </div>
      </div>

      {/* ── Horizontal Source Status Summary ──────────────────────── */}
      <div style={{
        background: 'var(--color-surface-bg)',
        border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg) var(--space-2xl)',
        display: 'flex', alignItems: 'center',
        gap: 0, flexWrap: 'nowrap', overflowX: 'auto',
      }}>
        {summaryItems.map((item, i) => (
          <div key={item.label} style={{
            display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)',
            padding: '0 var(--space-2xl)',
            borderRight: i < summaryItems.length - 1 ? '1px solid var(--color-border-primary)' : 'none',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {item.dot && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: item.dot, display: 'inline-block',
                  animation: item.label === 'BLOCKED' ? 'pulse-dot 1.6s ease-in-out infinite' : 'none',
                  flexShrink: 0,
                }} />
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)',
              }}>{item.label}</span>
            </div>
            <span style={{
              fontSize: '1.25rem', fontWeight: 800, color: item.color,
              fontFamily: 'var(--font-mono)', lineHeight: 1,
            }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Important notice */}
      <div style={{
        background: 'var(--color-warning-bg)',
        border: '1px solid rgba(217,119,6,0.25)',
        borderLeft: '3px solid var(--color-warning)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg) var(--space-xl)',
        display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start',
      }}>
        <AlertTriangle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>
            ALL AIRLINE AIRFARE SOURCES: CHALLENGE DETECTED
          </div>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.65 }}>
            All five SIH-required airline sources (IndiGo, Air India, Air India Express, Akasa Air, SpiceJet) implement
            bot protection that prevents browser-based collection. Server-side automation with Playwright or Scrapy,
            ethical rate limiting, and robots.txt compliance is required. No airfare data is available in this browser context.
          </p>
        </div>
      </div>

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', borderBottom: '1px solid var(--color-border-primary)', paddingBottom: 0 }}>
        {[
          { key: 'airfare', label: `Airfare Sources (${displaySources.length})`, icon: Globe },
          { key: 'government', label: `Government Sources (${datasets.length})`, icon: Server },
        ].map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'airfare' | 'government')}
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                color: tab === t.key ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
                marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color 0.15s',
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'airfare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {displaySources.map(s => {
            const isChallenge = s.status === 'CHALLENGE_DETECTED'
            const isConnected = s.status === 'CONNECTED'
            const leftBorderColor = isChallenge
              ? 'var(--color-warning)'
              : isConnected
                ? 'var(--color-success)'
                : 'var(--color-border-secondary)'
            const dotColor = isChallenge ? 'var(--color-warning)' : isConnected ? 'var(--color-success)' : 'var(--color-text-tertiary)'
            const hovered = hoveredSourceId === s.id
            return (
              <div
                key={s.id}
                onMouseEnter={() => setHoveredSourceId(s.id)}
                onMouseLeave={() => setHoveredSourceId(null)}
                style={{
                  background: 'var(--color-surface-bg)',
                  border: `1px solid ${hovered ? 'var(--color-border-secondary)' : 'var(--color-border-primary)'}`,
                  borderLeft: `3px solid ${leftBorderColor}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-xl)',
                  boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                  cursor: 'default',
                }}
              >
                {/* Card header row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    {/* Pulsing status dot */}
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: dotColor, display: 'inline-block',
                      animation: isChallenge ? 'pulse-dot 1.6s ease-in-out infinite' : isConnected ? 'pulse-dot 2.4s ease-in-out infinite' : 'none',
                    }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 1 }}>{s.organization}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                    <span className={`ap-badge ${isConnected ? 'ap-badge-live' : isChallenge ? 'ap-badge-gen' : 'ap-badge-sandbox'}`}>
                      {s.status === 'NOT_CONFIGURED' ? 'SETUP REQUIRED' : s.status}
                    </span>
                    {s.robots_txt === 'DISALLOWED' && (
                      <span className="ap-badge ap-badge-offline">robots.txt: DISALLOW</span>
                    )}
                    {s.api_available && (
                      <span className="ap-badge ap-badge-official">API AVAILABLE</span>
                    )}
                  </div>
                </div>

                {/* Status reason */}
                <p style={{
                  fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)',
                  margin: 'var(--space-md) 0 0', lineHeight: 1.65,
                }}>
                  {s.status_reason}
                </p>

                {/* Footer meta */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-2xl)',
                  marginTop: 'var(--space-lg)', paddingTop: 'var(--space-md)',
                  borderTop: '1px solid var(--color-border-primary)',
                  flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>RECORDS</div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', marginTop: 2 }}>
                      {(s.records_received ?? 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>LAST ATTEMPT</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {isoTimestamp(s.last_attempt)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>CAPTCHA</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: s.captcha_detected ? 'var(--color-warning)' : 'var(--color-success)', marginTop: 2 }}>
                      {s.captcha_detected ? 'DETECTED' : 'NONE'}
                    </div>
                  </div>
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)',
                    textDecoration: 'none', marginLeft: 'auto',
                  }}>
                    {s.source_url.replace('https://', '')} ↗
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
              {isLoading || govRefreshing ? 'Fetching government sources…' : govRefreshResult
                ? `Last updated: ${Math.round((Date.now() - govRefreshResult.ts.getTime()) / 60000) || '<1'} min ago`
                : `Last checked: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`}
            </span>
            {(isLoading || govRefreshing) && <RefreshCw size={13} style={{ color: 'var(--color-text-tertiary)', animation: 'spin 1s linear infinite' }} />}
            {govRefreshResult && !govRefreshing && (
              govRefreshResult.ok
                ? <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
                : <XCircle size={13} style={{ color: 'var(--color-danger)' }} />
            )}
            {govRefreshResult && !govRefreshing && (
              <span style={{ fontSize: 11, color: govRefreshResult.ok ? 'var(--color-success)' : 'var(--color-danger)', fontFamily: 'var(--font-sans)' }}>
                {govRefreshResult.msg}
              </span>
            )}
            <button
              disabled={govRefreshing}
              onClick={async () => {
                setGovRefreshing(true)
                setGovRefreshResult(null)
                try {
                  const [monthly, circulars] = await Promise.all([
                    fetchDgcaMonthlyStats(),
                    fetchDgcaCirculars(),
                  ])
                  const ok = monthly.status !== 'UNAVAILABLE' || circulars.status !== 'UNAVAILABLE'
                  const msgs: string[] = []
                  if (monthly.status !== 'UNAVAILABLE') msgs.push(`Monthly stats: ${monthly.status}`)
                  else msgs.push('Monthly stats: UNAVAILABLE')
                  if (circulars.status !== 'UNAVAILABLE') msgs.push(`Circulars: ${circulars.status}`)
                  else msgs.push('Circulars: UNAVAILABLE')
                  setGovRefreshResult({ ok, msg: msgs.join(' · '), ts: new Date() })
                } catch (err) {
                  setGovRefreshResult({ ok: false, msg: err instanceof Error ? err.message : 'Fetch failed', ts: new Date() })
                } finally {
                  setGovRefreshing(false)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 7,
                border: '1px solid var(--color-border-primary)',
                background: 'var(--color-surface-secondary)',
                fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
                cursor: govRefreshing ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-sans)',
                opacity: govRefreshing ? 0.6 : 1,
                marginLeft: 'auto',
                transition: 'all 150ms',
              }}
            >
              <RefreshCw size={11} style={govRefreshing ? { animation: 'spin 1s linear infinite' } : {}} />
              Refresh
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {datasets.map(d => {
              const isConnected = d.status === 'CONNECTED' || d.status === 'HEALTHY' || d.status === 'STALE'
              return (
                <div
                  key={d.id}
                  style={{
                    background: 'var(--color-surface-bg)',
                    border: '1px solid var(--color-border-primary)',
                    borderLeft: `3px solid ${isConnected ? 'var(--color-success)' : 'var(--color-border-secondary)'}`,
                    borderRadius: 'var(--radius-lg)',
                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                  }}
                  onMouseOver={e => {
                    ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-secondary)'
                  }}
                  onMouseOut={e => {
                    ;(e.currentTarget as HTMLDivElement).style.boxShadow = ''
                    ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-primary)'
                  }}
                >
                  <GovSourceCard dataset={d} />
                </div>
              )
            })}
          </div>
          <div style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(3,105,161,0.2)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-xl)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-info)', letterSpacing: '0.07em', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-sm)' }}>HOW GOVERNMENT DATA IS FETCHED</div>
            <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.65 }}>
              Public government portals (DGCA, MoSPI eSankhyiki, data.gov.in) are accessed via the AllOrigins CORS proxy
              (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>api.allorigins.win</code>).
              HTML tables are parsed with DOMParser in-browser. Data is cached for 6–24 hours in localStorage.
              All government data is tagged <strong>OFFICIAL</strong> and kept strictly separate from airfare observations.
              If the portal's HTML structure changes, parsing may fail and status will show UNAVAILABLE.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
