import { useEffect, useRef, useState } from 'react'
import { Check, Clock3, LockKeyhole } from 'lucide-react'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { useAuth } from '../contexts/AuthContext'
import { apiCreateAccessRequest, apiMyAccessRequests } from '../services/api'

interface Props { onClose: () => void; onOpenFeature?: () => void; feature?: string; featureKey?: string }

export default function UpgradeModal({ onClose, onOpenFeature, feature = 'Price Alerts', featureKey = 'PRICE_ALERTS' }: Props) {
  const { user, token, logout, refreshUser } = useAuth()
  const draftKey = `aeroprice:premium-draft:${user?.email ?? ''}:${featureKey}`
  const [message, setMessage] = useState('')
  const [requestMessage, setRequestMessage] = useState(() => sessionStorage.getItem(draftKey) || '')
  const [status, setStatus] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const submitting = useRef(false)
  const needsSignIn = !token || /session has expired|sign in/i.test(message)

  useEffect(() => {
    try {
      if (requestMessage.trim()) sessionStorage.setItem(draftKey, requestMessage)
      else sessionStorage.removeItem(draftKey)
    } catch { /* Keep the live draft when browser storage is unavailable. */ }
  }, [draftKey, requestMessage])

  useEffect(() => {
    let active = true
    setChecking(true)
    if (!user?.email || !token) { setChecking(false); return }
    apiMyAccessRequests(token).then(result => {
      if (!active) return
      const request = (result?.requests ?? []).find((entry: any) => entry.feature_key === featureKey)
      setMessage('')
      if (!request) return
      setStatus(request.status)
      setRejectionReason(request.rejection_reason ?? '')
      if (request.status === 'PENDING') setRequestMessage(request.request_message ?? '')
      if (request.status === 'APPROVED') void refreshUser().catch(() => undefined)
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to check access status. Please retry.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [featureKey, token, user?.email, refreshUser])

  async function requestAccess() {
    if (submitting.current || checking) return
    if (!user?.email) { setMessage('Please sign in before requesting access.'); return }
    if (!token) { setMessage('Your session is not ready. Please sign in again.'); return }
    if (status === 'PENDING') { setMessage('Your request is already under review.'); return }
    submitting.current = true; setBusy(true); setMessage('')
    try {
      const result = await apiCreateAccessRequest(featureKey, feature, token, requestMessage) as { status?: string }
      const nextStatus = result.status ?? 'PENDING'
      setStatus(nextStatus)
      sessionStorage.removeItem(draftKey)
      if (nextStatus === 'APPROVED') await refreshUser().catch(() => undefined)
      window.dispatchEvent(new Event('aeroprice-notifications-changed'))
      setMessage(nextStatus === 'APPROVED' ? 'Access is already approved.' : 'Request submitted. The administrator will review it and notify you after a decision.')
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes('session has expired')
        ? 'Your session has expired. Nothing was submitted. Sign in again, reopen this form, and your message draft will be restored.'
        : error instanceof Error ? error.message : 'The access request could not be saved. Please retry.')
    } finally {
      submitting.current = false; setBusy(false)
    }
  }

  async function openFeature() {
    await refreshUser().catch(() => undefined)
    window.dispatchEvent(new Event('aeroprice-notifications-changed'))
    onOpenFeature?.()
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Request Premium access" icon={<LockKeyhole size={21} />} description="The administrator reviews Standard → Premium upgrades." footer={<div className="premium-request-footer"><Button variant="neutral" onClick={onClose}>Close</Button>{needsSignIn ? <Button variant="primary" onClick={logout}>Sign in again</Button> : status === 'APPROVED' ? <Button variant="primary" onClick={() => void openFeature()}>Open feature</Button> : <Button variant="primary" onClick={() => void requestAccess()} loading={busy} disabled={status === 'PENDING' || checking}>{checking ? 'Checking access…' : status === 'PENDING' ? 'Pending review' : status === 'REJECTED' || status === 'REVOKED' ? 'Request again' : 'Request Premium'}</Button>}</div>}>
        <div className="premium-request-content">
          <div style={{ padding: 16, borderRadius: 14, background: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-primary)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--color-text-tertiary)' }}>FEATURE</div>
            <div style={{ marginTop: 5, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>{feature}</div>
            <div style={{ display: 'grid', gap: 7, marginTop: 14, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <div className="premium-request-benefit"><Check size={16} /><span>Monitor supported routes</span></div>
              <div className="premium-request-benefit"><Check size={16} /><span>Receive price-change notifications</span></div>
              <div className="premium-request-benefit"><Check size={16} /><span>View supported fare history</span></div>
            </div>
          </div>
          <label className="premium-upgrade-request-message">
            <span>{status === 'PENDING' ? 'Your request message' : 'Why do you need Premium?'} <small>Optional</small></span>
            <textarea
              value={requestMessage}
              onChange={event => setRequestMessage(event.target.value.slice(0, 2000))}
              placeholder="Tell the administrator how Premium will help you."
              maxLength={2000}
              rows={3}
              readOnly={status === 'PENDING'}
              disabled={busy}
            />
            <small>{requestMessage.length}/2000 characters</small>
          </label>
          {status === 'PENDING' && !message && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Clock3 size={15} />Request pending review.</div>}
          {status === 'APPROVED' && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Check size={15} />Access approved. You can now use {feature}.</div>}
          {status === 'REJECTED' && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontSize: 12 }}>Request not approved. {rejectionReason || 'You may request access again later.'}</div>}
          {status === 'REVOKED' && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: 12 }}>Your Premium access was revoked by an administrator. Your account is on the Standard plan. You may submit a new request if needed.</div>}
          {message && <div role={needsSignIn ? 'alert' : 'status'} style={{ marginTop: 14, padding: 12, borderRadius: 10, background: needsSignIn ? 'var(--color-danger-bg)' : 'var(--color-info-bg)', color: needsSignIn ? 'var(--color-danger)' : 'var(--color-info)', fontSize: 12, textAlign: 'left', lineHeight: 1.6 }}>{message}</div>}
        </div>
    </Modal>
  )
}
