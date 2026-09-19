import { useState } from 'react'
import { Bell, Trash2, Edit, Plus, Calendar } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { sampleAlerts, bookingWindowData, corridors } from '../data/sampleData'

// ── Types ──────────────────────────────────────────────────

type AlertMethod = 'email' | 'whatsapp' | 'inapp'
type BookingWindow = 'anytime' | 't7' | 't15'

interface NewAlert {
  from: string
  to: string
  targetFare: string
  methods: AlertMethod[]
  bookingWindow: BookingWindow
}

// ── Static data ────────────────────────────────────────────

const AIRPORTS = [
  { code: 'DEL', name: 'Delhi (Indira Gandhi)' },
  { code: 'BOM', name: 'Mumbai (Chhatrapati Shivaji)' },
  { code: 'BLR', name: 'Bengaluru (Kempegowda)' },
  { code: 'MAA', name: 'Chennai (Chennai Intl)' },
  { code: 'CCU', name: 'Kolkata (Netaji Subhas)' },
  { code: 'HYD', name: 'Hyderabad (Rajiv Gandhi)' },
  { code: 'GOI', name: 'Goa (Manohar)' },
  { code: 'COK', name: 'Kochi (Cochin Intl)' },
  { code: 'AMD', name: 'Ahmedabad (Sardar Vallabhbhai)' },
  { code: 'JAI', name: 'Jaipur (Jaipur Intl)' },
]

// ── Calendar heatmap data ──────────────────────────────────

type DayPrice = 'cheap' | 'normal' | 'expensive' | null

interface CalMonth {
  year: number
  month: number   // 0-indexed
  label: string
  prices: Record<number, DayPrice>
}

const calMonths: CalMonth[] = [
  {
    year: 2026, month: 8, label: 'Sep 2026',
    prices: {
      22: 'cheap', 23: 'cheap', 24: 'cheap', 25: 'cheap', 26: 'cheap',
      27: 'cheap', 28: 'cheap', 29: 'cheap', 30: 'cheap',
      1: 'normal', 2: 'normal', 3: 'normal', 4: 'normal',
      8: 'normal', 9: 'normal', 10: 'normal', 11: 'normal',
    },
  },
  {
    year: 2026, month: 9, label: 'Oct 2026',
    prices: {
      1: 'normal', 2: 'normal', 5: 'normal', 6: 'normal', 7: 'normal',
      8: 'normal', 9: 'normal', 12: 'normal',
      19: 'expensive', 20: 'expensive', 21: 'expensive', 22: 'expensive',
      23: 'expensive', 26: 'expensive', 27: 'expensive', 28: 'expensive',
      29: 'expensive', 30: 'expensive', 31: 'expensive',
    },
  },
  {
    year: 2026, month: 10, label: 'Nov 2026',
    prices: {
      2: 'expensive', 3: 'expensive',
      9: 'normal', 10: 'normal', 11: 'normal', 12: 'normal', 13: 'normal',
      16: 'normal', 17: 'normal', 18: 'normal', 19: 'normal', 20: 'normal',
      23: 'cheap', 24: 'cheap', 25: 'cheap', 26: 'cheap', 27: 'cheap', 30: 'cheap',
    },
  },
]

function buildCalendar(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weeks: (number | null)[][] = []
  let day = 1
  let week: (number | null)[] = Array(firstDay).fill(null)
  while (day <= daysInMonth) {
    week.push(day)
    if (week.length === 7) { weeks.push(week); week = [] }
    day++
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week) }
  return weeks
}

// ── Sub-components ─────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)',
    }}>
      <div className="text-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-xs)' }}>{label}</div>
      <div className="text-title" style={{ color: 'var(--color-text-primary)', marginBottom: sub ? 2 : 0 }}>{value}</div>
      {sub && <div className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ current, target, max }: { current: number; target: number; max: number }) {
  const pct = Math.min(100, Math.round((1 - (current - target) / (max - target)) * 100))
  const clampedPct = Math.max(0, pct)
  const isClose = clampedPct >= 85
  return (
    <div style={{ marginTop: 'var(--space-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>Progress to target</span>
        <span className="text-caption" style={{ color: isClose ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>{clampedPct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--color-surface-secondary)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${clampedPct}%`,
          borderRadius: 99,
          background: isClose ? 'var(--color-success)' : 'var(--color-brand-primary)',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

function AlertCard({
  alert,
  onEdit,
  onDelete,
}: {
  alert: typeof sampleAlerts[number]
  onEdit: () => void
  onDelete: () => void
}) {
  const [from, to] = alert.route.split('-')
  const maxFare = corridors.find(c => c.id === alert.route)?.maxFare ?? alert.currentFare * 1.5
  const createdDate = new Date(alert.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const isTriggered = alert.triggered || alert.currentFare <= alert.targetFare

  return (
    <div style={{
      background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)',
      display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)',
    }}>
      {/* Route banner */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--gradient-brand)', borderRadius: 'var(--radius-md)',
        padding: 'var(--space-md) var(--space-xl)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <span style={{ fontWeight: 700, color: '#fff', fontSize: 18 }}>{from}</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>→</span>
          <span style={{ fontWeight: 700, color: '#fff', fontSize: 18 }}>{to}</span>
        </div>
        <Badge label={isTriggered ? 'TRIGGERED' : 'WATCHING'} variant={isTriggered ? 'success' : 'info'} />
      </div>

      {/* Fare info */}
      <div style={{ display: 'flex', gap: 'var(--space-2xl)' }}>
        <div>
          <div className="text-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Current Fare</div>
          <div className="text-heading" style={{ color: 'var(--color-text-primary)' }}>₹{alert.currentFare.toLocaleString('en-IN')}</div>
        </div>
        <div>
          <div className="text-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Target Fare</div>
          <div className="text-heading" style={{ color: 'var(--color-success)' }}>₹{alert.targetFare.toLocaleString('en-IN')}</div>
        </div>
        <div>
          <div className="text-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>Gap</div>
          <div className="text-heading" style={{ color: alert.currentFare <= alert.targetFare ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {alert.currentFare <= alert.targetFare ? '✓ Hit!' : `₹${(alert.currentFare - alert.targetFare).toLocaleString('en-IN')} away`}
          </div>
        </div>
      </div>

      <ProgressBar current={alert.currentFare} target={alert.targetFare} max={maxFare} />

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-xs)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={12} color="var(--color-text-tertiary)" />
          <span className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>Created {createdDate}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant="neutral" size="sm" iconStart={<Edit size={12} />} onClick={onEdit}>Edit</Button>
          <Button variant="danger" size="sm" iconStart={<Trash2 size={12} />} onClick={onDelete}>Delete</Button>
        </div>
      </div>
    </div>
  )
}

// ── Calendar Heatmap ───────────────────────────────────────

const dayColor: Record<NonNullable<DayPrice> | 'null', { bg: string; fg: string }> = {
  cheap:     { bg: 'var(--color-success-bg)',  fg: 'var(--color-success)' },
  normal:    { bg: 'var(--color-surface-secondary)', fg: 'var(--color-text-secondary)' },
  expensive: { bg: 'var(--color-danger-bg)',   fg: 'var(--color-danger)' },
  null:      { bg: 'transparent', fg: 'var(--color-text-tertiary)' },
}

function CalendarMonth({ month }: { month: CalMonth }) {
  const weeks = buildCalendar(month.year, month.month)
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div>
      <div className="text-label" style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-md)' }}>{month.label}</div>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
        <thead>
          <tr>
            {dayNames.map(d => (
              <th key={d} style={{ width: 32, height: 24, textAlign: 'center', fontSize: 10, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                const priceKey = (day ? month.prices[day] ?? null : null) as DayPrice
                const colors = dayColor[priceKey ?? 'null']
                return (
                  <td key={di} style={{ padding: 0 }}>
                    {day !== null ? (
                      <div style={{
                        width: 32, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500,
                        background: colors.bg, color: colors.fg,
                        cursor: 'default',
                      }}>
                        {day}
                      </div>
                    ) : <div style={{ width: 32, height: 28 }} />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Booking Window Chart (SVG) ─────────────────────────────

function BookingWindowChart() {
  const maxFare = Math.max(...bookingWindowData.map(d => d.avgFare))
  const chartH = 120
  const barW = 28
  const gap = 8

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={bookingWindowData.length * (barW + gap)}
        height={chartH + 48}
        style={{ display: 'block' }}
      >
        {bookingWindowData.map((d, i) => {
          const x = i * (barW + gap)
          const barH = Math.round((d.avgFare / maxFare) * chartH)
          const y = chartH - barH
          const isOptimal = d.window >= 25 && d.window <= 40
          const fill = isOptimal ? 'var(--color-success)' : 'var(--color-brand-primary)'
          const fillOpacity = isOptimal ? 1 : 0.5
          return (
            <g key={d.window}>
              <rect
                x={x} y={y} width={barW} height={barH}
                fill={fill} fillOpacity={fillOpacity}
                rx={3}
              />
              {isOptimal && (
                <rect x={x} y={y - 3} width={barW} height={3} fill="var(--color-success)" rx={2} />
              )}
              <text x={x + barW / 2} y={chartH + 16} textAnchor="middle" fontSize={9} fill="var(--color-text-tertiary)">{d.label}</text>
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={8} fill={isOptimal ? 'var(--color-success)' : 'var(--color-text-tertiary)'}>
                ₹{(d.avgFare / 1000).toFixed(1)}k
              </text>
            </g>
          )
        })}
        {/* Optimal band label */}
        <text x={(7 * (barW + gap)) + barW / 2} y={chartH + 34} textAnchor="middle" fontSize={9} fill="var(--color-success)" fontWeight="600">
          ← Optimal window (T+25–T+40)
        </text>
      </svg>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export default function PriceAlerts() {
  const [alerts, setAlerts] = useState(sampleAlerts)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedRoute, setSelectedRoute] = useState(corridors[0].id)

  const [newAlert, setNewAlert] = useState<NewAlert>({
    from: 'DEL', to: 'BOM', targetFare: '',
    methods: ['email'], bookingWindow: 'anytime',
  })

  const activeCount = alerts.filter(a => !a.triggered).length
  const triggeredCount = alerts.filter(a => a.triggered).length

  function toggleMethod(m: AlertMethod) {
    setNewAlert(prev => ({
      ...prev,
      methods: prev.methods.includes(m) ? prev.methods.filter(x => x !== m) : [...prev.methods, m],
    }))
  }

  function handleSetAlert() {
    if (!newAlert.targetFare) return
    const corridorMatch = corridors.find(c => c.from === newAlert.from && c.to === newAlert.to)
    const currentFare = corridorMatch?.currentFare ?? 5000
    const newEntry = {
      id: `alert-${Date.now()}`,
      route: `${newAlert.from}-${newAlert.to}`,
      targetFare: parseInt(newAlert.targetFare),
      currentFare,
      triggered: currentFare <= parseInt(newAlert.targetFare),
      createdAt: new Date().toISOString(),
    }
    setAlerts(prev => [newEntry, ...prev])
    setModalOpen(false)
    setNewAlert({ from: 'DEL', to: 'BOM', targetFare: '', methods: ['email'], bookingWindow: 'anytime' })
  }

  function handleDelete(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const methodBtn = (m: AlertMethod, label: string) => (
    <button
      onClick={() => toggleMethod(m)}
      style={{
        padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 500,
        border: `1px solid ${newAlert.methods.includes(m) ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`,
        background: newAlert.methods.includes(m) ? 'var(--color-brand-muted)' : 'transparent',
        color: newAlert.methods.includes(m) ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >{label}</button>
  )

  const winBtn = (w: BookingWindow, label: string) => (
    <button
      onClick={() => setNewAlert(prev => ({ ...prev, bookingWindow: w }))}
      style={{
        padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 500,
        border: `1px solid ${newAlert.bookingWindow === w ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`,
        background: newAlert.bookingWindow === w ? 'var(--color-brand-muted)' : 'transparent',
        color: newAlert.bookingWindow === w ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >{label}</button>
  )

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    border: '1px solid var(--color-border-primary)',
    borderRadius: 'var(--radius-md)', fontSize: 14,
    color: 'var(--color-text-primary)', background: 'var(--color-surface-bg)',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-2xl)', fontFamily: 'var(--font-sans)' }}>

      {/* 1. Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 'var(--space-3xl)', flexWrap: 'wrap', gap: 'var(--space-xl)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xs)' }}>
            <Bell size={22} color="var(--color-brand-primary)" />
            <h1 className="text-title" style={{ margin: 0, color: 'var(--color-text-primary)' }}>Price Alerts</h1>
          </div>
          <p className="text-body" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Get notified when fares hit your target price.
          </p>
        </div>
        <Button
          variant="primary"
          iconStart={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          Create Alert
        </Button>
      </div>

      {/* 2. Stats strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--space-xl)', marginBottom: 'var(--space-3xl)',
      }}>
        <StatCard label="Active Alerts" value={String(activeCount)} />
        <StatCard label="Triggered This Week" value={String(triggeredCount)} />
        <StatCard label="Avg Savings When Triggered" value="₹1,240" sub="vs. peak fare" />
        <StatCard label="Routes Monitored" value={String(alerts.length)} />
      </div>

      {/* 3. Alert Cards Grid */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <div className="text-label" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
          Your Alerts ({alerts.length})
        </div>
        {alerts.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 'var(--space-4xl)',
            background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-lg)',
          }}>
            <Bell size={32} color="var(--color-text-tertiary)" style={{ margin: '0 auto var(--space-lg)' }} />
            <p className="text-body" style={{ color: 'var(--color-text-tertiary)' }}>No alerts yet. Create one to get started.</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 'var(--space-xl)',
          }}>
            {alerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onEdit={() => setEditingId(alert.id)}
                onDelete={() => handleDelete(alert.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 4. Create Alert Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Price Alert"
        size="md"
        footer={
          <>
            <Button variant="neutral" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSetAlert}>Set Alert</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
            <div>
              <label className="text-label" style={{ display: 'block', marginBottom: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>From</label>
              <select
                value={newAlert.from}
                onChange={e => setNewAlert(p => ({ ...p, from: e.target.value }))}
                style={inputStyle}
              >
                {AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label" style={{ display: 'block', marginBottom: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>To</label>
              <select
                value={newAlert.to}
                onChange={e => setNewAlert(p => ({ ...p, to: e.target.value }))}
                style={inputStyle}
              >
                {AIRPORTS.filter(a => a.code !== newAlert.from).map(a => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-label" style={{ display: 'block', marginBottom: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>Target Fare (₹)</label>
            <input
              type="number"
              placeholder="e.g. 4500"
              value={newAlert.targetFare}
              onChange={e => setNewAlert(p => ({ ...p, targetFare: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div>
            <div className="text-label" style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>Alert Method</div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {methodBtn('email', '✉️ Email')}
              {methodBtn('whatsapp', '💬 WhatsApp')}
              {methodBtn('inapp', '🔔 In-app')}
            </div>
          </div>

          <div>
            <div className="text-label" style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>Booking Window Preference</div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {winBtn('anytime', 'Anytime')}
              {winBtn('t7', 'T+7 or earlier')}
              {winBtn('t15', 'T+15 or earlier')}
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit modal (placeholder) */}
      <Modal
        isOpen={editingId !== null}
        onClose={() => setEditingId(null)}
        title="Edit Alert"
        size="sm"
        footer={<Button variant="primary" onClick={() => setEditingId(null)}>Save Changes</Button>}
      >
        <p className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
          Editing alert for route <strong>{editingId && alerts.find(a => a.id === editingId)?.route}</strong>. Adjust your target fare or notification preferences.
        </p>
        <div>
          <label className="text-label" style={{ display: 'block', marginBottom: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>Target Fare (₹)</label>
          <input type="number" placeholder="New target fare" style={inputStyle} />
        </div>
      </Modal>

      {/* 5. Price Calendar Heatmap */}
      <div style={{
        background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-2xl)',
        marginBottom: 'var(--space-3xl)',
      }}>
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 className="text-heading" style={{ margin: '0 0 var(--space-xs)', color: 'var(--color-text-primary)' }}>Price Calendar</h2>
          <p className="text-body" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            Colour-coded fare outlook — Sep through Nov 2026. Diwali week (Oct 19–31) is expensive.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3xl)', flexWrap: 'wrap', marginBottom: 'var(--space-xl)' }}>
          {calMonths.map(m => <CalendarMonth key={m.label} month={m} />)}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
          {[
            { label: 'Cheap', bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
            { label: 'Normal', bg: 'var(--color-surface-secondary)', fg: 'var(--color-text-secondary)' },
            { label: 'Expensive', bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: item.bg }} />
              <span className="text-caption" style={{ color: item.fg }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Booking Window Optimizer */}
      <div style={{
        background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-2xl)',
        marginBottom: 'var(--space-3xl)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
          <div>
            <h2 className="text-heading" style={{ margin: '0 0 var(--space-xs)', color: 'var(--color-text-primary)' }}>Booking Window Optimizer</h2>
            <p className="text-body" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
              Best time to book — fare by days before departure (T+1 to T+45).
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span className="text-body" style={{ color: 'var(--color-text-secondary)' }}>Route:</span>
            <select
              value={selectedRoute}
              onChange={e => setSelectedRoute(e.target.value)}
              style={{ ...inputStyle, width: 'auto', fontSize: 13 }}
            >
              {corridors.slice(0, 8).map(c => (
                <option key={c.id} value={c.id}>{c.id}</option>
              ))}
            </select>
          </div>
        </div>

        <BookingWindowChart />

        <div style={{ display: 'flex', gap: 'var(--space-2xl)', marginTop: 'var(--space-xl)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 10, borderRadius: 3, background: 'var(--color-success)', opacity: 1 }} />
            <span className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>Optimal booking window (T+25–T+40)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 10, borderRadius: 3, background: 'var(--color-brand-primary)', opacity: 0.5 }} />
            <span className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>Higher fares</span>
          </div>
        </div>
      </div>

    </div>
  )
}
