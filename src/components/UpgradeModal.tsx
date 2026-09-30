import { useEffect, useState } from 'react'
import { Check, Clock3, LockKeyhole, X } from 'lucide-react'
import { Button } from './ui/Button'
import { useAuth } from '../contexts/AuthContext'
import { apiCreateAccessRequest, apiMyAccessRequests } from '../services/api'

interface Props { onClose: () => void; feature?: string; featureKey?: string }

export default function UpgradeModal({ onClose, feature = 'Price Alerts', featureKey = 'PRICE_ALERTS' }: Props) {
  const { user, token } = useAuth()
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    if (!user?.email || !token) return
    apiMyAccessRequests(token).then(result => {
      const request = (result?.requests ?? []).find((entry: any) => entry.feature_key === featureKey)
      if (!request) return
      setStatus(request.status)
      setRejectionReason(request.rejection_reason ?? '')
    }).catch(() => setMessage('Unable to check access status. Please retry when the service is available.'))
  }, [feature, featureKey, token, user?.email, user?.name])

  async function requestAccess() {
    if (!user?.email) { setMessage('Please sign in before requesting access.'); return }
    if (!token) { setMessage('Your session is not ready. Please sign in again.'); return }
    if (status === 'PENDING') { setMessage('Your request is already under review.'); return }
    try {
      const result = await apiCreateAccessRequest(featureKey, feature, token) as { status?: string }
      const nextStatus = result.status ?? 'PENDING'
      setStatus(nextStatus)
      setMessage(nextStatus === 'APPROVED' ? 'Access is already approved.' : 'Request submitted. The administrator will review it and notify you after a decision.')
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes('session has expired')
        ? 'Your session has expired. Please sign in again, then request access again.'
        : 'The access request could not be saved. Please retry.')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'var(--color-surface-bg)', borderRadius: 20, boxShadow: 'var(--shadow-floating)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '22px 24px', borderBottom: '1px solid var(--color-border-primary)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--color-brand-muted)', color: 'var(--color-brand-primary)' }}><LockKeyhole size={18} /></div>
            <div><h2 style={{ margin: 0, fontSize: 20, color: 'var(--color-text-primary)' }}>Access Required</h2><p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>This feature requires administrator approval.</p></div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 0, background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ padding: 16, borderRadius: 14, background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--color-text-tertiary)' }}>FEATURE</div>
            <div style={{ marginTop: 5, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>{feature}</div>
            <div style={{ display: 'grid', gap: 7, marginTop: 14, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <span><Check size={13} style={{ color: 'var(--color-success)', verticalAlign: 'middle', marginRight: 6 }} />Monitor supported routes</span>
              <span><Check size={13} style={{ color: 'var(--color-success)', verticalAlign: 'middle', marginRight: 6 }} />Receive price-change notifications</span>
              <span><Check size={13} style={{ color: 'var(--color-success)', verticalAlign: 'middle', marginRight: 6 }} />View supported fare history</span>
            </div>
          </div>
          {status === 'PENDING' && !message && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Clock3 size={15} />Request pending review.</div>}
          {status === 'APPROVED' && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Check size={15} />Access approved. You can now use {feature}.</div>}
          {status === 'REJECTED' && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 12 }}>Request not approved. {rejectionReason || 'You may request access again later.'}</div>}
          {message && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: message.toLowerCase().includes('sign in') ? 'var(--color-danger-bg)' : 'var(--color-info-bg)', color: message.toLowerCase().includes('sign in') ? 'var(--color-danger)' : 'var(--color-info)', fontSize: 12 }}>{message}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 24px 24px' }}><Button variant="ghost" onClick={onClose}>Close</Button>{status === 'APPROVED' ? <Button variant="primary" onClick={onClose}>Open Feature</Button> : <Button variant="primary" onClick={requestAccess} disabled={status === 'PENDING' || !token}>{!token ? 'Sign in to request' : status === 'PENDING' ? 'Request Pending' : status === 'REJECTED' ? 'Request Again' : 'Request Access'}</Button>}</div>
      </div>
    </div>
  )
}
