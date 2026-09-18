import { useState } from 'react'
import { ArrowRight, Activity, TrendingUp, TrendingDown, Radio } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { SelectField, InputField } from '../components/ui/Field'
import StatusBadge from '../components/StatusBadge'
import TrendIndicator from '../components/TrendIndicator'
import DataFreshness from '../components/DataFreshness'
import { BarChart } from '../components/MiniChart'
import {
  indexValue, indexChange7d, indexChange30d, totalObservations,
  activeSources, corridors, risingCorridors, fallingCorridors,
  bookingWindowData, regionalData, lastUpdated
} from '../data/sampleData'
import type { Page } from '../components/AppShell'

const card = {
  background: 'var(--color-surface-bg)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-xl)',
  boxShadow: 'var(--shadow-sm)',
} as const

const cityOptions = [
  { value: 'DEL', label: 'Delhi (DEL)' },
  { value: 'BOM', label: 'Mumbai (BOM)' },
  { value: 'BLR', label: 'Bengaluru (BLR)' },
  { value: 'MAA', label: 'Chennai (MAA)' },
  { value: 'CCU', label: 'Kolkata (CCU)' },
  { value: 'HYD', label: 'Hyderabad (HYD)' },
]

export default function Overview({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')
  const [date, setDate] = useState('')

  const bookingChartData = bookingWindowData.map(d => ({ label: d.window, value: d.median, low: d.low, high: d.high }))

  return (
    <div className="flex flex-col animate-fade-up" style={{ gap: 'var(--space-xl)', maxWidth: 900 }}>

      {/* Hero */}
      <div>
        <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <Badge label="AEROPRICE INDIA" variant="brand" />
          <StatusBadge status="sample" />
        </div>
        <h1 className="text-title text-primary">Airfare Price Index — India</h1>
        <p className="text-body" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', maxWidth: 540 }}>
          Real-time observations of domestic airfare movement, transformed into transparent statistical intelligence.
        </p>
        <div className="flex" style={{ gap: 'var(--space-md)', marginTop: 'var(--space-xl)' }}>
          <Button variant="primary" onClick={() => onNavigate('map')} iconEnd={<ArrowRight size={15} />}>
            View India Map
          </Button>
          <Button variant="neutral" onClick={() => onNavigate('routes')}>
            Explore a Route
          </Button>
        </div>
      </div>

      {/* Index KPI */}
      <div style={card}>
        <div className="flex items-start justify-between flex-wrap" style={{ gap: 'var(--space-xl)' }}>
          <div>
            <p className="text-caption text-tertiary" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-sm)' }}>
              All-India Airfare Price Index
            </p>
            <div className="flex items-baseline" style={{ gap: 'var(--space-md)' }}>
              <span className="text-primary" style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-sans)' }}>
                {indexValue.toFixed(2)}
              </span>
              <span className="text-caption text-tertiary">Base: 100</span>
            </div>
            <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
              <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
                <span className="text-caption text-tertiary">7-DAY</span>
                <TrendIndicator direction="up" value={indexChange7d} />
              </div>
              <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
                <span className="text-caption text-tertiary">30-DAY</span>
                <TrendIndicator direction="up" value={indexChange30d} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end" style={{ gap: 'var(--space-md)' }}>
            <DataFreshness minutesAgo={18} />
            <span className="text-caption text-tertiary">Last updated: {lastUpdated}</span>
          </div>
        </div>
      </div>

      {/* Live status bar */}
      <div style={card}>
        <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <Radio size={13} className="animate-pulse-dot" style={{ color: 'var(--color-success)' }} />
          <span className="text-label text-primary" style={{ fontWeight: 600 }}>COLLECTION ACTIVE</span>
        </div>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-3xl)' }}>
          {[
            { label: 'CORRIDORS',       value: corridors.length },
            { label: 'OBSERVATIONS',    value: totalObservations.toLocaleString('en-IN') },
            { label: 'ACTIVE SOURCES',  value: activeSources },
            { label: 'LAST COLLECTION', value: '13:02 IST' },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
              <span className="text-caption text-tertiary">{label}</span>
              <span className="text-label text-primary" style={{ fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Market movement */}
      <div>
        <h2 className="text-heading text-primary" style={{ marginBottom: 'var(--space-lg)' }}>Where airfare is moving</h2>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>
          {/* Rising */}
          <div className="flex-1" style={{ ...card, minWidth: 240 }}>
            <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
              <TrendingUp size={15} style={{ color: 'var(--color-danger)' }} />
              <span className="text-label text-primary" style={{ fontWeight: 500 }}>Airfares Rising</span>
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
              {risingCorridors.map(c => (
                <button key={c.id} onClick={() => onNavigate('routes')}
                  className="flex items-center justify-between focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
                  style={{ padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', transition: 'var(--transition-base)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-body text-primary">{c.from} → {c.to}</span>
                  <TrendIndicator direction="up" value={c.change7d} size="sm" />
                </button>
              ))}
            </div>
          </div>

          {/* Falling */}
          <div className="flex-1" style={{ ...card, minWidth: 240 }}>
            <div className="flex items-center" style={{ gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
              <TrendingDown size={15} style={{ color: 'var(--color-success)' }} />
              <span className="text-label text-primary" style={{ fontWeight: 500 }}>Airfares Falling</span>
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
              {fallingCorridors.map(c => (
                <button key={c.id} onClick={() => onNavigate('routes')}
                  className="flex items-center justify-between focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
                  style={{ padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', transition: 'var(--transition-base)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-body text-primary">{c.from} → {c.to}</span>
                  <TrendIndicator direction="down" value={Math.abs(c.change7d)} size="sm" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Booking window chart */}
      <div style={card}>
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 className="text-heading text-primary">How advance booking changes airfare</h2>
          <p className="text-body" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', maxWidth: 560 }}>
            Earlier booking generally changes the observed fare profile. Bars show median; range indicates observed min–max.
          </p>
        </div>
        <div className="overflow-x-auto">
          <BarChart data={bookingChartData} width={520} height={160} />
        </div>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)', marginTop: 'var(--space-lg)' }}>
          {bookingWindowData.map(d => (
            <div key={d.window} className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
              <span className="text-caption text-tertiary">{d.window}</span>
              <span className="text-label text-primary" style={{ fontWeight: 500 }}>₹{d.median.toLocaleString('en-IN')}</span>
              <span className="text-caption text-tertiary">{d.observations} obs</span>
            </div>
          ))}
        </div>
      </div>

      {/* Regional index */}
      <div>
        <h2 className="text-heading text-primary" style={{ marginBottom: 'var(--space-xl)' }}>Regional Airfare Index</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-xl)' }}>
          {regionalData.map(r => (
            <div key={r.region} style={{ ...card, cursor: 'pointer' }}
              onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)')}
              onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-surface-bg)')}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-md)' }}>
                <span className="text-caption text-tertiary" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.region}</span>
                <span className="text-caption text-tertiary">{r.coverage}% coverage</span>
              </div>
              <div className="text-heading text-primary" style={{ fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
                {r.index.toFixed(1)}
              </div>
              <div className="flex" style={{ gap: 'var(--space-lg)' }}>
                <div>
                  <span className="text-caption text-tertiary">7D </span>
                  <TrendIndicator direction={r.change7d > 0.5 ? 'up' : r.change7d < -0.5 ? 'down' : 'stable'} value={Math.abs(r.change7d)} size="sm" />
                </div>
                <div>
                  <span className="text-caption text-tertiary">30D </span>
                  <TrendIndicator direction={r.change30d > 0.5 ? 'up' : r.change30d < -0.5 ? 'down' : 'stable'} value={Math.abs(r.change30d)} size="sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Public search */}
      <div style={card}>
        <h2 className="text-heading text-primary">Check how airfare is moving</h2>
        <p className="text-body" style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', marginBottom: 'var(--space-xl)' }}>
          Select a route and travel date to see observed fare intelligence.
        </p>
        <div className="flex flex-wrap items-end" style={{ gap: 'var(--space-xl)' }}>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <SelectField label="From" placeholder="Departure" options={cityOptions} value={from} onChange={setFrom} />
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <SelectField label="To" placeholder="Destination" options={cityOptions} value={to} onChange={setTo} />
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <InputField label="Travel Date" placeholder="DD / MM / YYYY" value={date} onChange={setDate} />
          </div>
          <Button variant="primary" onClick={() => onNavigate('routes')} iconEnd={<Activity size={15} />}>
            Check Airfare Intelligence
          </Button>
        </div>
      </div>

    </div>
  )
}
