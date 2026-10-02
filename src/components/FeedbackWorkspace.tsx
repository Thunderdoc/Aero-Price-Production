import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle, History, ImagePlus, MessageSquare, RefreshCw, Send, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiFeedbackScreenshot, apiMyFeedback, apiSubmitFeedback, type FeedbackEntry, type FeedbackInput } from '../services/api'
import { Modal } from './ui/Modal'

const categories = { BUG: 'Bug report', PRODUCT: 'Product feedback', DATA: 'Data or route issue', DESIGN: 'UI/UX suggestion', SUPPORT: 'Support request', PRAISE: 'Praise / positive feedback' }
const statusLabel = { NEW: 'Submitted', IN_PROGRESS: 'In progress', REVIEWED: 'Reviewed', RESOLVED: 'Resolved' }
const FEEDBACK_DRAFT_KEY = 'aeroprice:feedback-draft'
type FeedbackDraft = { email: string; category: FeedbackInput['category']; priority: FeedbackInput['priority']; title: string; message: string; hadScreenshot: boolean }

function readFeedbackDraft(email?: string): FeedbackDraft | null {
  if (!email) return null
  try {
    const draft = JSON.parse(sessionStorage.getItem(FEEDBACK_DRAFT_KEY) || 'null') as FeedbackDraft | null
    return draft?.email?.toLowerCase() === email.toLowerCase() ? draft : null
  } catch { return null }
}

export default function FeedbackWorkspace({ sourceModule }: { sourceModule?: string }) {
  const { user, token, logout } = useAuth()
  const [initialDraft] = useState(() => readFeedbackDraft(user?.email))
  const [tab, setTab] = useState<'submit' | 'history'>('submit')
  const [category, setCategory] = useState<NonNullable<FeedbackInput['category']>>(initialDraft?.category || 'BUG')
  const [priority, setPriority] = useState<NonNullable<FeedbackInput['priority']>>(initialDraft?.priority || 'MEDIUM')
  const [title, setTitle] = useState(initialDraft?.title || ''), [message, setMessage] = useState(initialDraft?.message || '')
  const [screenshot, setScreenshot] = useState<FeedbackInput['screenshot']>()
  const [needsScreenshotRestore, setNeedsScreenshotRestore] = useState(Boolean(initialDraft?.hadScreenshot))
  const [busy, setBusy] = useState(false), [readingImage, setReadingImage] = useState(false)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState('')
  const [history, setHistory] = useState<FeedbackEntry[]>([]), [total, setTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false), [historyError, setHistoryError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0), [imageUrl, setImageUrl] = useState(''), [imageLoadingId, setImageLoadingId] = useState('')
  const [draftNotice, setDraftNotice] = useState(initialDraft ? `Your saved draft was restored.${initialDraft.hadScreenshot ? ' Reattach its screenshot before sending.' : ''}` : '')
  const sending = useRef(false), imageVersion = useRef(0)

  useEffect(() => {
    if (tab !== 'history' || !token) return
    let active = true
    setHistoryLoading(true); setHistoryError(''); setHistory([])
    apiMyFeedback(token).then(result => { if (active) { setHistory(result.feedback); setTotal(result.total) } })
      .catch(failure => { if (active) setHistoryError(failure instanceof Error ? failure.message : 'Your submissions could not be loaded. Please retry.') })
      .finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [tab, token, user?.email, refreshKey])
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }, [imageUrl])
  useEffect(() => {
    if (!user?.email || (!title.trim() && !message.trim())) {
      sessionStorage.removeItem(FEEDBACK_DRAFT_KEY)
      return
    }
    try {
      sessionStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify({
        email: user.email,
        category,
        priority,
        title,
        message,
        hadScreenshot: Boolean(screenshot) || needsScreenshotRestore,
      } satisfies FeedbackDraft))
    } catch { /* Keep the live draft even when browser storage is unavailable. */ }
  }, [user?.email, category, priority, title, message, screenshot, needsScreenshotRestore])

  async function attachImage(file?: File) {
    const version = ++imageVersion.current
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('Choose a PNG or JPG screenshot no larger than 3 MB.'); return
    }
    setReadingImage(true); setError('')
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(new Error('Unreadable screenshot'))
        reader.readAsDataURL(file)
      })
      if (version === imageVersion.current) {
        setScreenshot({ name: file.name.slice(0, 100), content_type: file.type as 'image/png' | 'image/jpeg', data_base64: data })
        setNeedsScreenshotRestore(false)
      }
    } catch { setError('The screenshot could not be read. Please choose it again.') }
    finally { if (version === imageVersion.current) setReadingImage(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current || readingImage || !title.trim() || !message.trim()) return
    if (!token) { setError('Please sign in before sending feedback.'); return }
    sending.current = true; setBusy(true); setError(''); setReceipt('')
    try {
      const result = await apiSubmitFeedback({ title: title.trim(), message: message.trim(), category, priority, source_module: sourceModule, screenshot }, token)
      setReceipt(`Feedback saved. Reference ${result.id.slice(0, 8)}.`)
      setTitle(''); setMessage(''); setScreenshot(undefined)
      setNeedsScreenshotRestore(false)
      setDraftNotice('')
      sessionStorage.removeItem(FEEDBACK_DRAFT_KEY)
      window.dispatchEvent(new Event('aeroprice-notifications-changed'))
    } catch (failure) {
      const expired = failure instanceof Error && failure.message.toLowerCase().includes('session has expired')
      setError(expired
        ? 'Your session expired before this feedback was saved. Nothing was sent. Sign in again, reopen Feedback, and your text draft will be restored; reattach any screenshot before resubmitting.'
        : failure instanceof Error ? failure.message : 'Feedback could not be saved. Your draft is unchanged; please retry.')
    }
    finally { sending.current = false; setBusy(false) }
  }
  async function viewScreenshot(id: string) {
    if (!token || imageLoadingId) return
    setImageLoadingId(id); setHistoryError('')
    try { setImageUrl(URL.createObjectURL(await apiFeedbackScreenshot(id, token))) }
    catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'Screenshot unavailable.') }
    finally { setImageLoadingId('') }
  }

  return <div className="feedback-workspace">
    <div className="feedback-intro"><span><MessageSquare size={21} /></span><div><h3>Help shape AeroPrice</h3><p>Report an issue or share an idea. Follow the team’s response in your submission history.</p></div></div>
    <div className="feedback-tabs" role="tablist" aria-label="Feedback views">
      <button role="tab" aria-selected={tab === 'submit'} onClick={() => setTab('submit')}><Send size={15} />Submit feedback</button>
      <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}><History size={15} />My submissions</button>
    </div>
    {receipt && <div className="feedback-success" role="status"><CheckCircle size={17} /><span>{receipt}</span><button onClick={() => { setTab('history'); setRefreshKey(value => value + 1) }}>View history</button></div>}
    {tab === 'submit' ? <form onSubmit={submit} className="feedback-form" aria-label="Submit feedback">
      <div className="feedback-form-row">
      <label>Feedback category<select value={category} onChange={event => setCategory(event.target.value as typeof category)} disabled={busy}>{Object.entries(categories).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <fieldset><legend>Priority</legend><div className="feedback-priority">{(['LOW', 'MEDIUM', 'HIGH'] as const).map(value => <label key={value} className={priority === value ? 'selected' : ''}><input type="radio" name="priority" value={value} checked={priority === value} onChange={() => setPriority(value)} disabled={busy} />{value[0] + value.slice(1).toLowerCase()}</label>)}</div></fieldset>
      </div>
      <label>Title / summary <span aria-hidden="true">*</span><input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Route filter does not update results" disabled={busy} /></label>
      <label>Detailed description <span aria-hidden="true">*</span><textarea required maxLength={5000} rows={5} value={message} onChange={event => setMessage(event.target.value)} placeholder="What happened? Include the page, route, and steps to reproduce, or tell us your suggestion." disabled={busy} /></label>
      <div className="feedback-hint"><span>Do not include passwords, payment details, or private account information.</span><span>{message.length}/5000</span></div>
      <label className="feedback-attachment"><ImagePlus size={19} /><span>{readingImage ? 'Reading screenshot…' : screenshot ? screenshot.name : 'Optional screenshot · PNG or JPG, up to 3 MB'}</span><input type="file" accept="image/png,image/jpeg" aria-label="Attach screenshot" onChange={event => void attachImage(event.target.files?.[0])} disabled={busy || readingImage} /></label>
      {screenshot && <button type="button" className="feedback-link" onClick={() => setScreenshot(undefined)} disabled={busy}><X size={13} />Remove attachment</button>}
      {draftNotice && <div role="status" className="feedback-draft-notice">{draftNotice}</div>}
      {error && <div role="alert" className="feedback-error"><span>{error}</span>{error.toLowerCase().includes('session expired') && <button type="button" onClick={logout}>Sign in again</button>}</div>}
      <div className="feedback-form-footer"><small>Submitted securely as {user?.email}</small><button className="feedback-submit" type="submit" disabled={busy || readingImage || !title.trim() || !message.trim()}><Send size={16} />{busy ? 'Saving feedback…' : 'Submit feedback'}</button></div>
    </form> : <section className="feedback-history" aria-label="My submissions">
      <div className="feedback-history-heading"><span>Only your submissions are shown.</span><button onClick={() => setRefreshKey(value => value + 1)} disabled={historyLoading}><RefreshCw size={14} />Refresh</button></div>
      {historyError && <div className="feedback-error" role="alert"><span>{historyError}</span>{historyError.toLowerCase().includes('session has expired') && <button type="button" onClick={logout}>Sign in again</button>}</div>}
      {historyLoading ? <p role="status">Loading your submissions…</p> : !history.length && !historyError ? <div className="feedback-empty"><MessageSquare size={26} /><h3>No submissions yet</h3><p>Your saved feedback and the team’s responses will appear here.</p></div> : history.map(item => <article key={item.id} className="feedback-history-card">
        <div className="feedback-history-card-head"><h3>{item.title || 'Feedback'}</h3><span className={`feedback-status status-${item.status}`}>{statusLabel[item.status] || item.status}</span></div>
        <div className="feedback-history-meta"><span>{categories[item.category as keyof typeof categories] || 'Product feedback'}</span><span>{item.priority.toLowerCase()} priority</span><time>{new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>
        <p>{item.message}</p>{item.reply && <div className="feedback-reply"><strong>Admin response</strong><p>{item.reply}</p></div>}
        {item.has_screenshot && <button className="feedback-link" onClick={() => void viewScreenshot(item.id)} disabled={Boolean(imageLoadingId)}><ImagePlus size={14} />{imageLoadingId === item.id ? 'Loading screenshot…' : 'View screenshot'}</button>}
        <small>Reference {item.id.slice(0, 8)}</small>
      </article>)}
      {total > history.length && !historyLoading && <p className="feedback-hint">Showing your latest {history.length} of {total} submissions.</p>}
    </section>}
    <Modal isOpen={Boolean(imageUrl)} title="Feedback screenshot" onClose={() => setImageUrl('')} size="lg"><img src={imageUrl || undefined} alt="Screenshot attached to feedback" style={{ width: '100%', objectFit: 'contain', maxHeight: '65dvh' }} /></Modal>
  </div>
}
