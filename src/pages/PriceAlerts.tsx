import { useState } from 'react'
import { Bell, Trash2, Edit, Plus, Calendar, Lock, Mail, MessageSquare } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { sampleAlerts, bookingWindowData, corridors } from '../data/sampleData'
import { useAuth } from '../contexts/AuthContext'
import UpgradeModal from '../components/UpgradeModal'

const CITY_OPTIONS = ['DEL', 'BOM', 'BLR', 'MAA', 'CCU', 'HYD', 'AMD', 'GOI']

interface TrackForm {
  from: string; to: string; date: string; threshold: number
  notifyEmail: boolean; notifyWhatsApp: boolean; frequency: 'IMMEDIATE' | 'DAILY'
}

const INITIAL_FORM: TrackForm = {
  from: 'DEL', to: 'BOM', date: '', threshold: 5000,
  notifyEmail: true, notifyWhatsApp: false, frequency: 'IMMEDIATE',
}

export default function PriceAlerts() {
  const { user, login } = useAuth()
  const isFree = !user || (user.plan === 'FREE' && user.role === 'PUBLIC')
  const [upgradeOpen, setUpgradeOpen] = useState(isFree)
  const [alerts, setAlerts] = useState(sampleAlerts)
  const [showCreate, setShowCreate] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [form, setForm] = useState<TrackForm>(INITIAL_FORM)

  const isGated = user?.plan === 'FREE'

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setAlerts(prev => [...prev, {
      id: `alert-${Date.now()}`,
      route: `${form.from}-${form.to}`,
      targetFare: form.threshold,
      currentFare: 0,
      triggered: false,
      createdAt: new Date().toISOString(),
    }])
    setShowCreate(false)
    setForm(INITIAL_FORM)
  }

  function deleteAlert(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  // FREE users see a locked gate with upgrade prompt
  if (isFree) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-4xl) var(--space-2xl)', fontFamily: 'var(--font-sans)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2xl)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-secondary)', border: '2px dashed var(--color-border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Lock size={28} style={{ color: 'var(--color-text-tertiary)' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 var(--space-sm)' }}>Price Alerts — Subscriber Feature</h2>
          <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.65, maxWidth: 480 }}>
            Set fare targets on any corridor and get notified the moment prices drop. Available on Subscriber (₹299/mo) and Government plans.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)', width: '100%', maxWidth: 520 }}>
          {['Email alerts when fare drops', 'Booking window optimizer', 'Historical fare export'].map(f => (
            <div key={f} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-lg)', fontSize: 12, color: 'var(--color-text-secondary)' }}>{f}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <Button variant="ghost" onClick={() => {}}>Continue free</Button>
          <Button variant="primary" onClick={() => {
            login('user@aeroprice.in', 'aero123')
            setUpgradeOpen(false)
          }}>Use demo subscriber account</Button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>Demo: use <code style={{ fontFamily: 'var(--font-mono)' }}>user@aeroprice.in / aero123</code> for subscriber access</p>
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} onSwitchToSubscriber={() => { login('user@aeroprice.in', 'aero123') }} />}
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border-primary)',
    background: 'var(--color-surface-secondary)',
    color: 'var(--color-text-primary)',
    fontSize: 13, fontFamily: 'var(--font-sans)',
    outline: 'none', boxSizing: 'border-box',
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-2xl)', fontFamily: 'var(--font-sans)' }}>

      {/* Data source notice */}
      <div style={{ background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-md) var(--space-xl)', marginBottom: 'var(--space-xl)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <Bell size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
          <strong style={{ color: 'var(--color-warning)' }}>ALERTS PENDING</strong> — All fare alerts will fire once a live airfare collector is configured. No real observations available in browser context. Alert cards below use GENERATED reference fares.
        </span>
      </div>

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
          {!isGated && (
            <Button variant="primary" onClick={() => setShowCreate(true)} iconEnd={<Plus size={14} />}>
              Track Price
            </Button>
          )}
        </div>

        {/* Gate for FREE users */}
        {isGated ? (
          <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '2px dashed var(--color-border-secondary)', padding: 'var(--space-3xl)', textAlign: 'center' }}>
            <Bell size={40} style={{ color: 'var(--color-text-tertiary)', marginBottom: 16 }} />
            <div style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 8 }}>
              Price Alerts require Subscriber plan
            </div>
            <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', maxWidth: 360, margin: '0 auto 24px' }}>
              Set fare thresholds and receive real-time notifications when prices drop. Upgrade to unlock unlimited alerts.
            </p>
            <Button variant="primary" onClick={() => setShowUpgrade(true)}>Upgrade — ₹299/month</Button>
          </div>
        ) : (
          <>
            {/* No real data notice */}
            <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)40', fontSize: 12, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
              ⚠ All airfare sources show CHALLENGE DETECTED. Alerts are stored and configured but will only trigger when real fare observations are collected by a backend collector.
            </div>

            {/* Alert cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {alerts.map(alert => {
                const isTriggered = alert.triggered
                return (
                  <div key={alert.id} style={{
                    background: 'var(--color-surface-bg)',
                    borderRadius: 'var(--radius-xl)',
                    border: `1px solid ${isTriggered ? 'var(--color-success)' : 'var(--color-border-primary)'}`,
                    padding: 'var(--space-xl)',
                    display: 'flex', alignItems: 'center', gap: 'var(--space-xl)',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xs)', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                          {alert.route.replace('-', ' → ')}
                        </span>
                        <Badge
                          label={isTriggered ? 'TRIGGERED' : 'PENDING — AWAITING REAL OBS.'}
                          variant={isTriggered ? 'success' : 'warning'}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-xl)', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>TARGET FARE</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>₹{alert.targetFare.toLocaleString('en-IN')}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>CURRENT OBS.</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}>
                            NO DATA
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>CREATED</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                            {new Date(alert.createdAt).toLocaleDateString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteAlert(alert.id)}
                      style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8, color: 'var(--color-danger)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}

              {alerts.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                  No alerts yet — click "Track Price" to add one.
                </div>
              )}
            </div>

            {/* Notification preferences */}
            <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-lg)' }}>NOTIFICATION PREFERENCES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {[
                  { icon: Mail, label: 'Email Notifications', sub: 'Get fare alerts in your inbox', enabled: true },
                  { icon: MessageSquare, label: 'WhatsApp Notifications', sub: 'Get alerts via WhatsApp', enabled: false },
                ].map(({ icon: Icon, label, sub, enabled }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-secondary)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Icon size={16} style={{ color: 'var(--color-text-secondary)' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{label}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{sub}</div>
                      </div>
                    </div>
                    <div style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? 'var(--color-brand-primary)' : 'var(--color-border-secondary)', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ position: 'absolute', top: 2, left: enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 150ms' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Upgrade modal */}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} onSwitchToSubscriber={() => { login('user@aeroprice.in', 'aero123'); setShowUpgrade(false) }} />}

      {/* Create alert modal */}
      {showCreate && (
        <Modal title="Track Price" isOpen={showCreate} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>FROM</label>
                <select value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} style={selectStyle}>
                  {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>TO</label>
                <select value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={selectStyle}>
                  {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>TARGET FARE (₹)</label>
              <input type="number" value={form.threshold} min={500} max={50000} onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)', marginBottom: 6 }}>FREQUENCY</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as 'IMMEDIATE' | 'DAILY' }))} style={selectStyle}>
                <option value="IMMEDIATE">Immediate — notify as soon as triggered</option>
                <option value="DAILY">Daily Digest — once per day summary</option>
              </select>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', fontSize: 12, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>
              Alert will be stored but will only trigger when real fare observations are available for this corridor.
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end' }}>
              <Button variant="neutral" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary" type="submit" iconEnd={<Bell size={13} />}>Create Alert</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
