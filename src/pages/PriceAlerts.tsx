import { useState, useEffect } from 'react'
import { Bell, Trash2, Plus, AlertCircle, Lock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { useAuth } from '../contexts/AuthContext'
import UpgradeModal from '../components/UpgradeModal'
import { apiCreatePriceAlert, apiDeletePriceAlert, apiPriceAlerts, isForbiddenError, type PriceAlertEntry } from '../services/api'
import EmptyState from '../components/EmptyState'
import { formatDateIST } from '../lib/liveStatus'
import type { Page } from '../components/AppShell'

const CITY_OPTIONS = ['DEL', 'BOM', 'BLR', 'MAA', 'CCU', 'HYD', 'AMD', 'GOI']

interface TrackForm {
  from: string; to: string; threshold: number
  frequency: 'IMMEDIATE' | 'DAILY'
}
interface UserPriceAlert {
  id: string; route: string; targetFare: number; currentFare: number | null; triggered: boolean; createdAt: string
}

const INITIAL_FORM: TrackForm = {
  from: 'DEL', to: 'BOM', threshold: 5000, frequency: 'IMMEDIATE',
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
  // No client-side paywall: any signed-in user sees this page and the list
  // loads from the server. The server still enforces the PRICE_ALERTS grant —
  // a 403 becomes an inline "request access" state, not a lock screen, and
  // there is no client-side override that can fake access (audit §2.3).
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [alerts, setAlerts] = useState<UserPriceAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<TrackForm>(INITIAL_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function loadAlerts(activeToken: string) {
    setAlertsLoading(true)
    setAlertsError(null)
    setAccessDenied(false)
    apiPriceAlerts(activeToken).then(({ alerts: rows }) => {
      setAlerts(rows.map((row: PriceAlertEntry) => ({ id: row.id, route: row.route, targetFare: row.target_fare, currentFare: row.current_fare, triggered: row.triggered, createdAt: row.created_at })))
    }).catch(error => {
      if (isForbiddenError(error)) {
        setAccessDenied(true)
        setAlerts([])
      } else {
        setAlertsError(error instanceof Error ? error.message : 'Could not load server-saved alerts.')
      }
    }).finally(() => setAlertsLoading(false))
  }

  useEffect(() => {
    if (!token) return
    loadAlerts(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!token) return
    if (form.from === form.to) {
      setFormError('Origin and destination must be different cities.')
      return
    }
    if (!Number.isFinite(form.threshold) || form.threshold < 500 || form.threshold > 50000) {
      setFormError('Target fare must be between ₹500 and ₹50,000.')
      return
    }
    setFormError(null)
    setCreating(true)
    try {
      const alert = await apiCreatePriceAlert({ route: `${form.from}-${form.to}`, target_fare: form.threshold, notification_frequency: form.frequency }, token)
      setAlerts(prev => [{ id: alert.id, route: alert.route, targetFare: alert.target_fare, currentFare: alert.current_fare, triggered: alert.triggered, createdAt: alert.created_at }, ...prev])
      setShowCreate(false)
      setForm(INITIAL_FORM)
    } catch (error) {
      if (isForbiddenError(error)) {
        setAccessDenied(true)
        setShowCreate(false)
      } else {
        setFormError(error instanceof Error ? error.message : 'Could not create this server-saved alert.')
      }
    } finally {
      setCreating(false)
    }
  }

  async function deleteAlert(id: string, route: string) {
    if (!token) return
    if (!window.confirm(`Delete the price alert for ${route}?`)) return
    setDeletingId(id)
    try {
      await apiDeletePriceAlert(id, token)
      setAlerts(prev => prev.filter(a => a.id !== id))
    } catch (error) {
      setAlertsError(error instanceof Error ? error.message : 'Could not remove this alert.')
    } finally {
      setDeletingId(null)
    }
  }

  // Signed-out visitors get a sign-in prompt, not a paywall.
  if (!user) {
    return (
      <div style={{ maxWidth: 760, margin: '44px auto', padding: '0 24px', fontFamily: 'var(--font-sans)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, animation: 'fade-in 300ms ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--color-brand-muted)', border: '1px solid rgba(37,99,235,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <Lock size={28} style={{ color: 'var(--color-brand-primary)' }} />
        </div>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 850, color: 'var(--color-text-primary)', margin: '0 0 10px', letterSpacing: '-0.03em' }}>Price Alerts</h2>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: 520 }}>
            Track a route and get notified when fares drop below your target. Sign in to save alerts on your account.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="ghost" onClick={() => onNavigate?.('overview')}>Back to dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, fontFamily: 'var(--font-sans)', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div style={{ background: 'var(--color-info-bg)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertCircle size={14} style={{ color: 'var(--color-brand-primary)', flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}><strong style={{ color: 'var(--color-brand-primary)' }}>SERVER-SAVED ALERTS</strong> — Your thresholds are stored on your account. Current fares are shown only when verified fare observations are available.</span>
      </div>
      {alertsError && <div role="alert" style={{ background: 'var(--color-danger-bg)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: 'var(--color-danger)' }}>{alertsError}</div>}

      {accessDenied && (
        <div role="alert" style={{ background: 'var(--color-warning-bg)', border: '1px solid rgba(217,119,6,0.35)', borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Lock size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <strong style={{ display: 'block', color: 'var(--color-text-primary)', fontSize: 14 }}>Price Alerts access required</strong>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Your account does not have the Price Alerts grant yet. Request access once and an administrator will review it — no payment is required.</span>
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" onClick={() => setUpgradeOpen(true)}>Request Access</Button>
            </div>
          </div>
        </div>
      )}
      {upgradeOpen && (
        <UpgradeModal
          onClose={() => setUpgradeOpen(false)}
          onOpenFeature={() => {
            // The modal only offers this after the server reports APPROVED.
            // Reload the list from the server; nothing is unlocked locally.
            setAccessDenied(false)
            if (token) loadAlerts(token)
          }}
        />
      )}

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
        <Button variant="primary" onClick={() => setShowCreate(true)} iconEnd={<Plus size={14} />} disabled={accessDenied || alertsLoading}>
          Track Price
        </Button>
      </div>

      {/* Alert cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alertsLoading && (
          <div style={{ padding: '24px', textAlign: 'center', background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Loading your saved alerts…
          </div>
        )}
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
                      {formatDateIST(alert.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => void deleteAlert(alert.id, alert.route)}
                disabled={deletingId === alert.id}
                style={{ padding: 8, border: 'none', background: 'transparent', cursor: deletingId === alert.id ? 'not-allowed' : 'pointer', borderRadius: 8, color: 'var(--color-danger)', transition: 'background 150ms ease', opacity: deletingId === alert.id ? 0.5 : 1 }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-bg)' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                title="Delete alert"
                aria-label={`Delete price alert for ${alert.route}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}

        {!alertsLoading && !accessDenied && alerts.length === 0 && (
          <div style={{ background: 'var(--color-surface-bg)', border: '1px dashed var(--color-border-secondary)', borderRadius: 12 }}>
            <EmptyState
              title="NO ALERTS YET"
              detail="Click “Track Price” to set your first fare threshold. Alerts trigger when verified observations for the route fall below your target."
            />
          </div>
        )}
      </div>

      {/* Notification preferences — honest copy: there is no email delivery
          wired behind this page, so no toggle pretends to control one. */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 12, border: '1px solid var(--color-border-primary)', padding: 20, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-text-tertiary)', marginBottom: 8 }}>NOTIFICATIONS</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Triggered alerts appear on this page with a <strong style={{ color: 'var(--color-text-primary)' }}>TRIGGERED</strong> badge and in the in-app notifications bell. Email delivery is not available yet.
        </div>
      </div>

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
            {formError && (
              <div role="alert" style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--color-danger-bg)', fontSize: 12, color: 'var(--color-danger)', border: '1px solid rgba(220,38,38,0.25)' }}>
                {formError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="neutral" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary" type="submit" iconEnd={<Bell size={13} />} disabled={creating || form.from === form.to}>
                {creating ? 'Creating…' : 'Create Alert'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
