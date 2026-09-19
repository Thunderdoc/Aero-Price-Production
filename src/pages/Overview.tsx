import { useState, useEffect } from 'react'
import { ArrowRight, TrendingUp, TrendingDown, Bell, Map as MapIcon, BarChart2, AlertTriangle, Shield, Database, Plane } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import TrendIndicator from '../components/TrendIndicator'
import { useAuth } from '../contexts/AuthContext'
import { useGovData } from '../hooks/useGovData'
import UpgradeModal from '../components/UpgradeModal'
import { apiDashboard, isBackendAvailable } from '../services/api'
import {
  corridors, bookingWindowData, regionalData, recentAnomalies,
} from '../data/sampleData'
import type { Page } from '../components/AppShell'

type Props = { onNavigate: (p: Page) => void }

const card: React.CSSProperties = {
  background: 'var(--color-surface-bg)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-xl)',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--color-border-primary)',
}

const cityOptions = [
  { value: 'DEL', label: 'Delhi' }, { value: 'BOM', label: 'Mumbai' },
  { value: 'BLR', label: 'Bengaluru' }, { value: 'MAA', label: 'Chennai' },
  { value: 'CCU', label: 'Kolkata' }, { value: 'HYD', label: 'Hyderabad' },
]

function BookingSparkline() {
  const data = bookingWindowData.map(d => d.avgFare)
  const max = Math.max(...data), min = Math.min(...data)
  const w = 240, h = 48
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--color-brand-primary)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Overview({ onNavigate }: Props) {
  const { user } = useAuth()
  const govData = useGovData()
  const [fromCity, setFromCity] = useState('DEL')
  const [toCity, setToCity] = useState('BOM')
  const [searchResult, setSearchResult] = useState<string | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [realObs, setRealObs] = useState<number | null>(null)
  const [indexStatus, setIndexStatus] = useState<string | null>(null)

  useEffect(() => {
    isBackendAvailable().then(up => {
      if (!up) return
      apiDashboard().then(d => {
        setRealObs(d.real_observations ?? 0)
        setIndexStatus(d.index_status ?? null)
      }).catch(() => {})
    })
  }, [])

  if (!user) return null

  const rising = corridors.filter(c => c.trend === 'up').slice(0, 4)
  const falling = corridors.filter(c => c.trend === 'down').slice(0, 4)

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchResult(`${fromCity}-${toCity}`)
  }

  const selectStyle: React.CSSProperties = {
    padding: '9px 32px 9px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border-primary)',
    background: 'var(--color-surface-bg)',
    color: 'var(--color-text-primary)',
    fontSize: 14, fontFamily: 'var(--font-sans)',
    cursor: 'pointer', outline: 'none',
    appearance: 'none',
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 960 }}>

      {/* Role-aware strip */}
      <div style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
        {user.role === 'ADMIN' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-warning)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-warning)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>COLLECTOR STATUS</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>5 sources · 0/5 active · Gov fetch: {govData.anyConnected ? 'CONNECTED' : 'UNAVAILABLE'}</span>
            <button onClick={() => onNavigate('admin')} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>Open Admin →</button>
          </>
        )}
        {user.role === 'ANALYST' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Shield size={13} style={{ color: 'var(--color-info)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-info)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>GOVERNMENT ANALYST</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
              DGCA data: {govData.anyConnected ? 'FRESH' : 'UNAVAILABLE'} · {govData.dgcaMonthly.length} records
            </span>
            <button onClick={() => onNavigate('government')} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>Open Gov Intel →</button>
          </>
        )}
        {user.role === 'PUBLIC' && user.plan === 'SUBSCRIBER' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Bell size={13} style={{ color: 'var(--color-brand-primary)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand-primary)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>YOUR ALERTS</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>Alerts pending first observation — airfare collector not yet connected</span>
            <button onClick={() => onNavigate('alerts')} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>View Alerts →</button>
          </>
        )}
        {user.role === 'PUBLIC' && user.plan === 'FREE' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Database size={13} style={{ color: 'var(--color-text-tertiary)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>FREE PLAN</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>Upgrade to track prices and get fare alerts for any corridor</span>
            <button onClick={() => setShowUpgrade(true)} style={{ fontSize: 11, color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, marginLeft: 'auto' }}>See Plans →</button>
          </>
        )}
      </div>

      {/* Hero: Index status */}
      <div style={{ ...card, background: 'var(--gradient-hero)', border: 'none', overflow: 'hidden', position: 'relative', padding: 'var(--space-2xl)' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(37,99,235,0.2)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, left: 100, width: 150, height: 150, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', filter: 'blur(30px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#60a5fa', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>ALL-INDIA AIRFARE INDEX · SIH26056</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.03em', marginBottom: 4 }}>
                  — —
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-warning)', background: 'rgba(217,119,6,0.2)', padding: '4px 10px', borderRadius: 4, display: 'inline-block', fontFamily: 'var(--font-sans)' }}>
                  {indexStatus ?? 'INDEX NOT PUBLISHED'}
                </div>
                {realObs !== null && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-sans)' }}>
                    {realObs} real observations in database
                  </div>
                )}
              </div>
              <div style={{ flex: 1, maxWidth: 400 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-sans)', lineHeight: 1.6, marginBottom: 12 }}>
                  No real airfare observations available. All airline sources are showing <strong style={{ color: '#fcd34d' }}>CHALLENGE DETECTED</strong> — configure a backend collector to activate the index.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['IndiGo', 'Air India', 'Akasa', 'SpiceJet', 'AIX'].map(a => (
                    <span key={a} style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-warning)', background: 'rgba(217,119,6,0.2)', padding: '2px 7px', borderRadius: 3, fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>
                      {a} · BLOCKED
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {govData.dgcaMonthly.length > 0 && (
              <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#60a5fa', marginBottom: 8, fontFamily: 'var(--font-sans)' }}>
                  OFFICIAL REFERENCE DATA — DGCA
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {govData.dgcaMonthly.slice(0, 3).map(m => (
                    <div key={m.month}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono)' }}>{m.month}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-sans)' }}>
                        {(m.domestic_passengers / 1_000_000).toFixed(1)}M pax
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => onNavigate('map')} iconEnd={<MapIcon size={14} />}>Explore Airfare Map</Button>
            <Button variant="ghost" onClick={() => onNavigate('routes')} iconEnd={<ArrowRight size={14} />} style={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)' }}>Check a Route</Button>
          </div>
        </div>
      </div>

      {/* Route search */}
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-md)', fontFamily: 'var(--font-sans)' }}>
          CHECK AIRFARE INTELLIGENCE
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)' }}>FROM</label>
            <select value={fromCity} onChange={e => { setFromCity(e.target.value); setSearchResult(null) }} style={selectStyle}>
              {cityOptions.map(c => <option key={c.value} value={c.value}>{c.label} ({c.value})</option>)}
            </select>
          </div>
          <div style={{ paddingBottom: 10, color: 'var(--color-text-tertiary)', fontSize: 18 }}>→</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)' }}>TO</label>
            <select value={toCity} onChange={e => { setToCity(e.target.value); setSearchResult(null) }} style={selectStyle}>
              {cityOptions.map(c => <option key={c.value} value={c.value}>{c.label} ({c.value})</option>)}
            </select>
          </div>
          <Button type="submit" variant="primary" iconEnd={<ArrowRight size={14} />}>CHECK ROUTE</Button>
        </form>

        {searchResult && (
          <div className="animate-fade-up" style={{ marginTop: 'var(--space-xl)', padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
              {fromCity} → {toCity}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>NO LIVE OBSERVATION AVAILABLE</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginBottom: 12 }}>
              No real airfare observations collected for this corridor. All airline sources are showing CHALLENGE DETECTED.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="subtle" onClick={() => onNavigate('sources')}>View Source Status</Button>
              <Button variant="subtle" onClick={() => onNavigate('livefares')}>Live Fares Table</Button>
            </div>
          </div>
        )}
      </div>

      {/* Rising / Falling corridors */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        {[
          { title: 'RISING FARES', items: rising, color: 'var(--color-danger)', icon: TrendingUp },
          { title: 'FALLING FARES', items: falling, color: 'var(--color-success)', icon: TrendingDown },
        ].map(({ title, items, color, icon: Icon }) => (
          <div key={title} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
              <Icon size={14} style={{ color }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{title}</span>
              <span style={{ fontSize: 9, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>GENERATED</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {items.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)', cursor: 'pointer' }}
                  onClick={() => onNavigate('routes')}
                >
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{c.from} → {c.to}</span>
                    <span className="ml-sm" style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>GENERATED</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>₹{c.currentFare.toLocaleString('en-IN')}</div>
                    <TrendIndicator direction={c.trend} value={Math.abs(c.change7d)} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Booking window mini chart */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 4, fontFamily: 'var(--font-sans)' }}>BOOKING WINDOW PATTERN</div>
            <div style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>Advance purchase fare curve</div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <Badge label="GENERATED" variant="warning" />
            <Button variant="subtle" onClick={() => onNavigate('routes')} iconEnd={<ArrowRight size={13} />}>Route Explorer</Button>
          </div>
        </div>
        <BookingSparkline />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>T+1 (tomorrow)</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>T+45 (45 days)</span>
        </div>
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-warning-bg)', fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
          ⚠ Booking window analysis requires real observations for T+1, T+7, T+15, T+30, T+45. Currently showing generated baseline.
        </div>
      </div>

      {/* Regional cards */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-md)', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 8 }}>
          REGIONAL INDEX
          <span style={{ fontSize: 9, color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>GENERATED</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
          {regionalData.map(r => (
            <div key={r.region} style={{ ...card, padding: 'var(--space-lg)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', marginBottom: 4, fontFamily: 'var(--font-sans)' }}>{r.region}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>₹{r.avgFare.toLocaleString('en-IN')}</div>
              <TrendIndicator direction={r.change7d > 0.5 ? 'up' : r.change7d < -0.5 ? 'down' : 'stable'} value={Math.abs(r.change7d)} size="sm" />
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{r.routeCount} routes</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent anomalies */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
          <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>RECENT ANOMALIES</span>
          <Badge label="GENERATED" variant="warning" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {recentAnomalies.slice(0, 4).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: a.type === 'SPIKE' ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)' }}>
              <Badge label={a.type} variant={a.type === 'SPIKE' ? 'danger' : 'warning'} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{a.route}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>₹{a.fare.toLocaleString('en-IN')} vs expected ₹{a.expectedFare.toLocaleString('en-IN')}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: a.resolved ? 'var(--color-success)' : 'var(--color-danger)', fontFamily: 'var(--font-sans)' }}>{a.resolved ? 'Resolved' : 'Active'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick nav cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
        {[
          { page: 'map' as Page, icon: MapIcon, label: 'India Map', sub: 'Route corridors + flight positions', color: 'var(--color-brand-primary)' },
          { page: 'routes' as Page, icon: Plane, label: 'Route Explorer', sub: 'Per-corridor fare intelligence', color: 'var(--color-teal)' },
          { page: 'insights' as Page, icon: BarChart2, label: 'Market Insights', sub: 'Carriers, price history, trends', color: 'var(--color-indigo)' },
          { page: 'livefares' as Page, icon: AlertTriangle, label: 'Live Fares', sub: 'Observation pipeline status', color: 'var(--color-warning)' },
        ].map(({ page, icon: Icon, label, sub, color }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            style={{ ...card, textAlign: 'left', cursor: 'pointer', border: `1px solid ${color}20`, transition: 'transform 150ms, box-shadow 150ms' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}20` }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
          >
            <Icon size={20} style={{ color, marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{sub}</div>
          </button>
        ))}
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} onSwitchToSubscriber={() => setShowUpgrade(false)} />}
    </div>
  )
}
