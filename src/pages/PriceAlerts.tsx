import { useState, useEffect } from 'react'
import { Bell, Trash2, Plus, Lock, Mail, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useAuth } from '../contexts/AuthContext'
import UpgradeModal from '../components/UpgradeModal'
import { apiCreatePriceAlert, apiDeletePriceAlert, apiPriceAlerts, type PriceAlertEntry } from '../services/api'
import type { Page } from '../components/AppShell'

const CITY_OPTIONS = ['DEL', 'BOM', 'BLR', 'MAA', 'CCU', 'HYD', 'AMD', 'GOI']

interface TrackForm {
  from: string; to: string; date: string; threshold: number
  notifyEmail: boolean; frequency: 'IMMEDIATE' | 'DAILY'
}
interface UserPriceAlert {
  id: string; route: string; targetFare: number; currentFare: number | null; triggered: boolean; createdAt: string
}

const INITIAL_FORM: TrackForm = {
  from: 'DEL', to: 'BOM', date: '', threshold: 5000,
  notifyEmail: true, frequency: 'IMMEDIATE',
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

export default function PriceAlerts({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const { user, token } = useAuth()
  // The server verifies the live, revocable PRICE_ALERTS grant on every API call.
  const isFree = !user || user.plan === 'FREE'
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [alerts, setAlerts] = useState<UserPriceAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [form, setForm] = useState<TrackForm>(INITIAL_FORM)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  function flashSaved(key: string) {
    setSavedKey(key)
    setTimeout(() => setSavedKey(null), 1800)
  }

  useEffect(() => {
    if (isFree || !token) return
    let active = true
    setAlertsLoading(true)
    setAlertsError(null)
    apiPriceAlerts(token).then(({ alerts: rows }) => {
      if (!active) return
      setAlerts(rows.map((row: PriceAlertEntry) => ({ id: row.id, route: row.route, targetFare: row.target_fare, currentFare: row.current_fare, triggered: row.triggered, createdAt: row.created_at })))
    }).catch(error => {
      if (active) setAlertsError(error instanceof Error ? error.message : 'Could not load server-saved alerts.')
    }).finally(() => { if (active) setAlertsLoading(false) })
    return () => { active = false }
  }, [isFree, token])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    try {
      const alert = await apiCreatePriceAlert({ route: `${form.from}-${form.to}`, target_fare: form.threshold, notification_frequency: form.frequency }, token)
      setAlerts(prev => [{ id: alert.id, route: alert.route, targetFare: alert.target_fare, currentFare: alert.current_fare, triggered: alert.triggered, createdAt: alert.created_at }, ...prev])
      setShowCreate(false)
      setForm(INITIAL_FORM)
    } catch (error) {
      setAlertsError(error instanceof Error ? error.message : 'Could not create this server-saved alert.')
    }
  }

  async function deleteAlert(id: string) {
    if (!token) return
    try {
      await apiDeletePriceAlert(id, token)
      setAlerts(prev => prev.filter(a => a.id !== id))
    } catch (error) {
      setAlertsError(error instanceof Error ? error.message : 'Could not remove this alert.')
    }
  }

  // FREE users — full-screen gate
  if (isFree) {
    return (
      <div style={{ maxWidth: 760, margin: '44px auto', padding: '0 24px', fontFamily: 'var(--font-sans)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, animation: 'fade-in 300ms ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--color-brand-muted)', border: '1px solid rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <Lock size={28} style={{ color: 'var(--color-brand-primary)' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 850, color: 'var(--color-text-primary)', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Price Alerts</h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: 520 }}>
            Track a route and get notified when fares drop below your target. Request access once and an administrator will review it — no payment is required.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, width: '100%', maxWidth: 560 }}>
          {[
            { icon: Bell, label: 'Server-saved fare thresholds' },
            { icon: Mail, label: 'In-app alert notifications' },
            { icon: Lock, label: 'Administrator-approved Premium access' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} style={{ background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 14, padding: '16px 12px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--color-brand-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <Icon size={15} style={{ color: 'var(--color-brand-primary)' }} />
              </div>
              {label}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="ghost" onClick={() => onNavigate?.('overview')}>Back to dashboard</Button>
          <Button variant="primary" onClick={() => setUpgradeOpen(true)}>
            Request Access
          </Button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Current access: standard user. Access is enabled after administrator approval.
        </p>
        {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} />}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={14} style={{ color: 'var(--color-brand-primary)', flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}><strong style={{ color: 'var(--color-brand-primary)' }}>SERVER-SAVED ALERTS</strong> — Your thresholds are tied to your approved Premium entitlement. Current fares are shown only when verified fare observations are available.</span>
      </div>
      {alertsError && <div role="alert" style={{ background: 'var(--color-danger-bg)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--color-danger)' }}>{alertsError}</div>}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Bell size={16} style={{ color: 'var(--color-brand-primary)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em' }}>PRICE ALERTS</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            Fare Tracking
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4, margin: 0 }}>
            {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)} iconEnd={<Plus size={14} />}>
          Track Price
        </Button>
      </div>

      {/* Alert cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map(alert => {
          const isTriggered = alert.triggered
          return (
            <div key={alert.id} style={{
              background: 'var(--color-surface-bg)',
              borderRadius: 12,
              border: `1px solid ${isTriggered ? 'rgba(22,163,74,0.4)' : 'var(--color-border-primary)'}`,
              padding: '18px 20px',
              display: 'flex', alignItems: 'center', gap: 20,
              flexWrap: 'wrap',
              boxShadow: 'var(--shadow-sm)',
              transition: 'box-shadow 150ms ease',
              borderLeft: `4px solid ${isTriggered ? 'var(--color-success)' : 'var(--color-warning)'}`,
            }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)' }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.02em' }}>
                    {alert.route.replace('-', ' → ')}
                  </span>
                  <Badge
                    label={isTriggered ? 'TRIGGERED' : 'MONITORING VERIFIED DATA'}
                    variant={isTriggered ? 'success' : 'warning'}
                  />
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', marginBottom: 4 }}>TARGET FARE</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>₹{alert.targetFare.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', marginBottom: 4 }}>CURRENT OBS.</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{alert.currentFare == null ? 'No verified fare yet' : `₹${alert.currentFare.toLocaleString('en-IN')}`}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', marginBottom: 4 }}>CREATED</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(alert.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => void deleteAlert(alert.id)}
                style={{ padding: 8, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 8, color: 'var(--color-danger)', transition: 'background 150ms ease' }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-bg)' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                title="Delete alert"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}

        {!alertsLoading && alerts.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--color-surface-bg)', border: '1px dashed var(--color-border-secondary)', borderRadius: 12 }}>
            <Bell size={32} style={{ color: 'var(--color-text-tertiary)', marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>No alerts yet</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>Click "Track Price" to set your first fare threshold</div>
          </div>
        )}
      </div>

      {/* Notification preferences */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 12, border: '1px solid var(--color-border-primary)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>NOTIFICATION PREFERENCES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            { icon: Mail, label: 'Email Notifications', sub: 'Get fare alerts in your inbox', key: 'email', enabled: emailEnabled, toggle: () => { setEmailEnabled(v => !v); flashSaved('email') } },
          ] as const).map(({ icon: Icon, label, sub, key, enabled, toggle }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: 'var(--color-surface-secondary)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Icon size={15} style={{ color: 'var(--color-text-secondary)' }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{sub}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {savedKey === key && <span style={{ fontSize: 10, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>Saved</span>}
                <button onClick={toggle} aria-pressed={enabled} style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? 'var(--color-brand-primary)' : 'var(--color-border-secondary)', position: 'relative', cursor: 'pointer', border: 'none', padding: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 200ms ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {showCreate && (
        <Modal title="Track Price" isOpen={showCreate} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', marginBottom: 6 }}>FROM</label>
                <select value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} style={selectStyle}>
                  {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', marginBottom: 6 }}>TO</label>
                <select value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} style={selectStyle}>
                  {CITY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', marginBottom: 6 }}>TARGET FARE (₹)</label>
              <input type="number" value={form.threshold} min={500} max={50000} onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.07em', marginBottom: 6 }}>FREQUENCY</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as 'IMMEDIATE' | 'DAILY' }))} style={selectStyle}>
                <option value="IMMEDIATE">Immediate — notify as soon as triggered</option>
                <option value="DAILY">Daily Digest — once per day summary</option>
              </select>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-warning-bg)', fontSize: 12, color: 'var(--color-warning)', border: '1px solid rgba(217,119,6,0.2)' }}>
              ⚠ Alert will be stored but will only trigger when real fare observations are available for this corridor.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="neutral" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary" type="submit" iconEnd={<Bell size={13} />}>Create Alert</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
