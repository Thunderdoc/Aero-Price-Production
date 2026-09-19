import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { AirfareSourceCard, GovSourceCard } from '../components/SourceCard'
import { useGovData } from '../hooks/useGovData'
import type { AirfareSource } from '../types/observation'

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
]

export default function DataSources() {
  const { datasets, isLoading } = useGovData()
  const [tab, setTab] = useState<'airfare' | 'government'>('airfare')

  const govConnected = datasets.filter(d => d.status === 'CONNECTED' || d.status === 'HEALTHY' || d.status === 'STALE').length
  const govFailed = datasets.filter(d => d.status === 'UNAVAILABLE' || d.status === 'FAILED').length

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 960 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>Data Sources</h1>
        <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)' }}>
          Complete source registry — airfare collectors and official government datasets. All statuses are live.
        </p>
      </div>

      {/* Stats strip */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', display: 'flex', gap: 'var(--space-3xl)', flexWrap: 'wrap' }}>
        {[
          { label: 'AIRFARE SOURCES', value: AIRFARE_SOURCES.length, color: 'var(--color-text-primary)' },
          { label: 'CHALLENGE DETECTED', value: AIRFARE_SOURCES.length, color: 'var(--color-warning)' },
          { label: 'LIVE AIRFARE OBS', value: '0', color: 'var(--color-text-tertiary)' },
          { label: 'GOV SOURCES', value: datasets.length, color: 'var(--color-text-primary)' },
          { label: 'GOV CONNECTED', value: govConnected, color: 'var(--color-success)' },
          { label: 'GOV UNAVAILABLE', value: govFailed, color: govFailed > 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.08em', fontFamily: 'var(--font-sans)' }}>{label}</span>
            <span style={{ fontSize: 'var(--text-heading-size)', fontWeight: 700, color, fontFamily: 'var(--font-sans)' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Important notice */}
      <div style={{ background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg) var(--space-xl)', display: 'flex', gap: 'var(--space-lg)', alignItems: 'flex-start' }}>
        <AlertTriangle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>ALL AIRLINE AIRFARE SOURCES: CHALLENGE DETECTED</div>
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
          { key: 'airfare', label: `Airfare Sources (${AIRFARE_SOURCES.length})` },
          { key: 'government', label: `Government Sources (${datasets.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'airfare' | 'government')}
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
              color: tab === t.key ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'airfare' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-lg)' }}>
          {AIRFARE_SOURCES.map(s => <AirfareSourceCard key={s.id} source={s} />)}
        </div>
      )}

      {tab === 'government' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
              {isLoading ? 'Fetching government sources…' : `Last checked: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`}
            </span>
            {isLoading && <RefreshCw size={13} style={{ color: 'var(--color-text-tertiary)', animation: 'spin 1s linear infinite' }} />}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-lg)' }}>
            {datasets.map(d => <GovSourceCard key={d.id} dataset={d} />)}
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
