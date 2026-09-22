import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from './ui/Button'

interface Props {
  onClose: () => void
}

const PLANS = [
  {
    name: 'Standard User',
    price: '₹0',
    period: '',
    color: 'var(--color-text-tertiary)',
    features: [
      'National Airfare Index (when available)',
      'India Map — route corridors',
      'Route Explorer (read-only)',
      'Market Insights overview',
    ],
    locked: ['Price Alerts', 'Track Price', 'Historical export', 'Government Intelligence'],
  },
  {
    name: 'Paid Access',
    price: '₹299',
    period: '/month',
    color: 'var(--color-brand-primary)',
    badge: 'POPULAR',
    features: [
      'Everything in Standard User',
      'Price Alerts — unlimited',
      'Track Price on any corridor',
      'Historical fare export (CSV/JSON)',
      'Email & notification delivery',
      'Booking window optimizer',
    ],
    locked: [],
  },
  {
    name: 'Government',
    price: 'Contact',
    period: '',
    color: 'var(--color-indigo)',
    features: [
      'Everything in Paid Access',
      'Full Government Intelligence portal',
      'Bulk data API access',
      'Statistical citation export',
      'Priority data freshness SLA',
      'DGCA-aligned methodology reports',
    ],
    locked: [],
  },
]

export default function UpgradeModal({ onClose }: Props) {
  const [mode, setMode] = useState<'plans' | 'code' | 'request'>('plans')
  const [accessCode, setAccessCode] = useState('')
  const [requestEmail, setRequestEmail] = useState('')
  const [message, setMessage] = useState('')

  function submitCode() {
    const normalized = accessCode.trim().toUpperCase()
    if (!normalized) {
      setMessage('Enter the access code shared by the AeroPrice admin.')
      return
    }
    if (!normalized.startsWith('AERO-')) {
      setMessage('Invalid code format. Access codes should look like AERO-XXXX.')
      return
    }
    setMessage('Access code submitted. Admin approval is required before unlock.')
  }

  function requestSubscription() {
    setMode('request')
    setMessage('')
  }

  function submitSubscriptionRequest() {
    const email = requestEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setMessage('Enter your registered email so admin can approve your access.')
      return
    }
    const request = {
      id: `REQ-${Date.now().toString(36).toUpperCase()}`,
      email,
      plan: 'SUBSCRIBER',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }
    const existing = JSON.parse(localStorage.getItem('aeroprice_access_requests') || '[]')
    localStorage.setItem('aeroprice_access_requests', JSON.stringify([request, ...existing]))
    setMessage(`Request sent to admin for ${email}. Admin can approve it and issue an AERO access code from User Directory.`)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 'var(--space-xl)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 680, boxShadow: 'var(--shadow-floating)', overflow: 'hidden', animation: 'fade-up 0.2s ease-out' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-xl) var(--space-2xl)', borderBottom: '1px solid var(--color-border-primary)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', margin: 0 }}>Unlock paid access</h2>
            <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', margin: '4px 0 0' }}>Track fares and get notified when prices drop below your target after subscription or access-code approval.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--space-xs)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {mode === 'plans' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-lg)', padding: 'var(--space-2xl)' }}>
            {PLANS.map(plan => (
              <div
                key={plan.name}
                style={{
                  background: plan.name === 'Paid Access' ? 'linear-gradient(145deg, #eff6ff, #f0f9ff)' : 'var(--color-surface-secondary)',
                  border: `1.5px solid ${plan.name === 'Paid Access' ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`,
                  borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)',
                  position: 'relative',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {plan.badge && (
                  <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-brand-primary)', color: 'white', fontSize: 9, fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-full)', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                    {plan.badge}
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 'var(--text-label-size)', color: plan.color, fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-xs)' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 'var(--space-lg)' }}>
                  <span style={{ fontSize: 'var(--text-heading-size)', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{plan.price}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{plan.period}</span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  {plan.features.slice(0, 4).map(f => (
                    <div key={f} style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
                      <Check size={12} style={{ color: plan.color, marginTop: 3, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {mode === 'code' && (
          <div style={{ padding: 'var(--space-2xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Access code</label>
            <input
              value={accessCode}
              onChange={e => setAccessCode(e.target.value)}
              placeholder="AERO-XXXX"
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border-primary)', fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Codes are generated by the admin team after payment/subscription approval. This prototype records the request flow; final entitlement requires backend approval.
            </p>
          </div>
        )}

        {mode === 'request' && (
          <div style={{ padding: 'var(--space-2xl)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: '1px solid rgba(37,99,235,0.22)', background: 'var(--color-brand-muted)', borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--color-text-primary)' }}>Request subscription</h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
                Enter your registered email. Admin will review the request, approve payment/access, and issue an AERO access code for this account.
              </p>
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Registered email</label>
            <input
              value={requestEmail}
              onChange={e => setRequestEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--color-border-primary)', fontFamily: 'var(--font-sans)', fontSize: 13 }}
            />
          </div>
        )}

        {message && (
          <div style={{ margin: '0 var(--space-2xl)', padding: '10px 12px', borderRadius: 10, background: 'var(--color-info-bg)', color: 'var(--color-info)', border: '1px solid rgba(3,105,161,0.2)', fontSize: 12 }}>
            {message}
          </div>
        )}

        {/* Footer CTA */}
        <div style={{ padding: 'var(--space-lg) var(--space-2xl) var(--space-2xl)', display: 'flex', gap: 'var(--space-md)', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={mode === 'plans' ? onClose : () => { setMode('plans'); setMessage('') }}>{mode === 'plans' ? 'Continue free' : 'Back'}</Button>
          {mode === 'code' ? (
            <Button variant="primary" onClick={submitCode}>Submit code</Button>
          ) : mode === 'request' ? (
            <Button variant="primary" onClick={submitSubscriptionRequest}>Send request</Button>
          ) : (
            <Button variant="subtle" onClick={() => { setMode('code'); setMessage('') }}>Enter access code</Button>
          )}
          {mode !== 'request' && <Button variant="primary" onClick={requestSubscription}>Request subscription</Button>}
        </div>
      </div>
    </div>
  )
}
