import { useState } from 'react'
import { BellRing, Check, ChevronDown, Mail, MessageSquareText, Moon, Send, ShieldCheck, SlidersHorizontal, Sun, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiSubmitFeedback } from '../services/api'

type SupportMode = 'settings' | 'help' | 'feedback'

export default function UserSupportModal({ mode, onClose, onChangeMode }: { mode: SupportMode; onClose: () => void; onChangeMode?: (mode: SupportMode) => void }) {
  const [emailAlerts, setEmailAlerts] = useState(() => localStorage.getItem('aeroprice_email_alerts') !== 'false')
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('aeroprice_compact_mode') === 'true')
  const [inAppAlerts, setInAppAlerts] = useState(() => localStorage.getItem('aeroprice_in_app_alerts') !== 'false')
  const [weeklySummary, setWeeklySummary] = useState(() => localStorage.getItem('aeroprice_weekly_summary') !== 'false')
  const [routeUpdates, setRouteUpdates] = useState(() => localStorage.getItem('aeroprice_route_updates') !== 'false')
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('aeroprice_data_saver') === 'true')
  const [alertFrequency, setAlertFrequency] = useState(() => localStorage.getItem('aeroprice_alert_frequency') || 'Instant')
  const [locale, setLocale] = useState(() => localStorage.getItem('aeroprice_locale') || 'India (English)')
  const [feedback, setFeedback] = useState('')
  const [feedbackCategory, setFeedbackCategory] = useState('Product feedback')
  const [submitted, setSubmitted] = useState(false)
  const [openFaq, setOpenFaq] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'))
  const { user, token } = useAuth()

  const title = mode === 'settings' ? 'User Settings' : mode === 'help' ? 'Help & FAQ' : 'Feedback'

  function savePreference(key: string, value: boolean, setter: (value: boolean) => void) {
    setter(value)
    localStorage.setItem(key, String(value))
    window.dispatchEvent(new Event('aeroprice-preferences-changed'))
  }

  function saveSelection(key: string, value: string, setter: (value: string) => void) {
    setter(value)
    localStorage.setItem(key, value)
    window.dispatchEvent(new Event('aeroprice-preferences-changed'))
  }

  function toggleTheme() {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem('aeroprice_theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
    window.dispatchEvent(new Event('aeroprice-preferences-changed'))
  }

  function submitFeedback() {
    if (!feedback.trim()) return
    const record = {
      id: `FB-${Date.now().toString(36).toUpperCase()}`,
      message: `[${feedbackCategory}] ${feedback.trim()}`,
      email: user?.email ?? 'unknown-user',
      name: user?.name ?? 'User',
      createdAt: new Date().toISOString(),
      status: 'NEW',
    }
    let existing: typeof record[] = []
    try {
      const parsed = JSON.parse(localStorage.getItem('aeroprice_feedback') || '[]')
      if (Array.isArray(parsed)) existing = parsed
    } catch { /* start a clean feedback queue */ }
    localStorage.setItem('aeroprice_feedback', JSON.stringify([record, ...existing]))
    localStorage.setItem('aeroprice_last_feedback', feedback.trim())
    void apiSubmitFeedback(record.message, token ?? undefined).catch(() => {
      // The local queue remains available when the backend is temporarily offline.
    })
    setSubmitted(true)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(3px)' }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 18, boxShadow: '0 22px 60px rgba(16,43,99,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid var(--color-border-primary)' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Check size={20} color="#1769e8" /><h2 style={{ margin: 0, fontSize: 19, color: 'var(--color-text-primary)' }}>{title}</h2></div><button onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}><X size={18} /></button></div>
        <div style={{ padding: 20 }}>
          {mode === 'settings' && <div style={{ display: 'grid', gap: 12 }}><p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--color-text-secondary)' }}>Preferences are saved on this device and apply across the user dashboard. Appearance is controlled from the top-bar theme button.</p><div style={{ padding: 13, borderRadius: 11, background: 'var(--color-surface-secondary)', fontSize: 12, color: 'var(--color-text-secondary)' }}><b style={{ color: 'var(--color-text-primary)' }}>Signed in as:</b> {user?.email ?? 'User'}</div><SettingsGroup icon={<BellRing size={16} />} title="Alerts & summaries"><PreferenceToggle label="Email fare alerts" detail="Receive changes for routes you track." checked={emailAlerts} onChange={value => savePreference('aeroprice_email_alerts', value, setEmailAlerts)} /><PreferenceToggle label="In-app notifications" detail="Show access and fare updates in the notification bell." checked={inAppAlerts} onChange={value => savePreference('aeroprice_in_app_alerts', value, setInAppAlerts)} /><PreferenceToggle label="Weekly fare summary" detail="Keep a weekly summary preference for your saved routes." checked={weeklySummary} onChange={value => savePreference('aeroprice_weekly_summary', value, setWeeklySummary)} /><PreferenceToggle label="Route movement updates" detail="Include verified collection-to-collection changes." checked={routeUpdates} onChange={value => savePreference('aeroprice_route_updates', value, setRouteUpdates)} /><PreferenceSelect label="Alert delivery" value={alertFrequency} values={['Instant', 'Daily digest', 'Weekly digest']} onChange={value => saveSelection('aeroprice_alert_frequency', value, setAlertFrequency)} /></SettingsGroup><SettingsGroup icon={<SlidersHorizontal size={16} />} title="Dashboard"><PreferenceToggle label="Compact dashboard cards" detail="Save vertical space on smaller screens." checked={compactMode} onChange={value => savePreference('aeroprice_compact_mode', value, setCompactMode)} /><PreferenceToggle label="Data-saver mode" detail="Prefer lighter map and graph rendering on limited connections." checked={dataSaver} onChange={value => savePreference('aeroprice_data_saver', value, setDataSaver)} /><PreferenceSelect label="Language & region" value={locale} values={['India (English)', 'India (Hindi)', 'India (Tamil)']} onChange={value => saveSelection('aeroprice_locale', value, setLocale)} /></SettingsGroup><div style={{ display: 'flex', gap: 9, padding: 12, borderRadius: 11, background: 'var(--color-info-bg)', color: 'var(--color-text-secondary)', fontSize: 11, lineHeight: 1.45 }}><ShieldCheck size={16} color="#1769e8" style={{ flexShrink: 0 }} />Settings stay with this browser. Account access and price data are managed securely by AeroPrice.</div></div>}
          {mode === 'help' && <div style={{ display: 'grid', gap: 9 }}>{[['How do I compare a route?', 'Open Route Explorer, select a verified route, and press Search Verified Fares. The page never invents a fare when no record is available.'], ['What do the map colors mean?', 'The India Fare Movement map compares the latest two verified collection dates. Red indicates a rise, green a decrease, blue a stable movement, and grey means the system has no verified route coverage for that state.'], ['Why is a state grey?', 'Grey is an honest no-data status. It becomes coloured only when a verified route has an airport in that state and there are two collection dates to compare.'], ['How do access requests work?', 'Choose Request Access on a restricted feature. An administrator reviews the request, grants or rejects the permission, and you receive an in-app notification.'], ['How do I create a price alert?', 'Open Price Alerts, select a supported route, set a target fare, then save the alert. It appears in your dashboard and notification preferences apply.'], ['Where does flight data come from?', 'The aviation screen uses the connected aircraft provider only when it is available. Air traffic data is kept separate from airfare pricing data.'], ['How can I report an issue?', 'Use Feedback to send a message. It is stored for the administrator in the Feedback section of the admin panel.']].map(([questionText, answer]) => <div key={questionText} style={{ border: '1px solid var(--color-border-primary)', borderRadius: 11, overflow: 'hidden' }}><button onClick={() => setOpenFaq(openFaq === questionText ? null : questionText)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: 13, border: 0, background: 'var(--color-surface-secondary)', color: 'var(--color-text-primary)', fontWeight: 750, textAlign: 'left', cursor: 'pointer' }}>{questionText}<ChevronDown size={16} style={{ transform: openFaq === questionText ? 'rotate(180deg)' : undefined }} /></button>{openFaq === questionText && <div style={{ padding: '0 13px 13px', color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.55 }}>{answer}</div>}</div>)}</div>}
          {mode === 'feedback' && <div style={{ padding: 4 }}><div style={{ padding: 16, border: '1px solid var(--color-border-primary)', borderRadius: 14, background: 'linear-gradient(145deg, var(--color-surface-secondary), var(--color-surface-bg))' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}><span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--color-brand-muted)', color: '#1769e8' }}><MessageSquareText size={17} /></span><div><b style={{ display: 'block', color: 'var(--color-text-primary)', fontSize: 14 }}>Help shape AeroPrice</b><span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Your message goes directly to the admin feedback queue.</span></div></div><label style={{ display: 'grid', gap: 6, marginTop: 14, color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700 }}>CATEGORY<select value={feedbackCategory} onChange={event => setFeedbackCategory(event.target.value)} style={{ padding: '10px 11px', borderRadius: 9, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}><option>Product feedback</option><option>Data issue</option><option>Route or alert issue</option><option>Design suggestion</option><option>Support request</option></select></label><label style={{ display: 'grid', gap: 6, marginTop: 12, color: 'var(--color-text-secondary)', fontSize: 11, fontWeight: 700 }}>YOUR MESSAGE<textarea value={feedback} onChange={event => { setFeedback(event.target.value); setSubmitted(false) }} rows={5} maxLength={1200} placeholder="Tell us what happened, which route or page you were using, and how we can improve it." style={{ width: '100%', boxSizing: 'border-box', padding: 12, border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)', background: 'var(--color-surface-bg)', borderRadius: 10, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} /></label><div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-tertiary)', fontSize: 10, marginTop: 5 }}><span>Do not include passwords or payment details.</span><span>{feedback.length}/1200</span></div>{submitted && <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 12, padding: 10, borderRadius: 9, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: 12, fontWeight: 700 }}><Check size={15} />Feedback queued for the administrator. Thank you.</div>}<button disabled={!feedback.trim()} onClick={submitFeedback} style={{ width: '100%', marginTop: 14, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 7, padding: '11px 15px', border: 0, borderRadius: 10, background: feedback.trim() ? '#1769e8' : 'var(--color-border-secondary)', color: '#fff', fontWeight: 800, cursor: feedback.trim() ? 'pointer' : 'not-allowed' }}><Send size={14} />Send feedback to admin</button></div><div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '11px 4px 0', color: 'var(--color-text-secondary)', fontSize: 11 }}><Mail size={14} color="#1769e8" />We attach your signed-in account email so the team can follow up.</div></div>}
          {mode === 'settings' && <div style={{ display: 'grid', gap: 8, marginTop: 12 }}><button type="button" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 13, border: '1px solid var(--color-border-primary)', borderRadius: 11, background: 'var(--color-surface-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{darkMode ? <Moon size={16} /> : <Sun size={16} />} {darkMode ? 'Dark theme enabled' : 'Light theme enabled'}</span><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Toggle theme</span></button>{onChangeMode && <button type="button" onClick={() => onChangeMode('feedback')} style={{ width: '100%', padding: 11, border: 0, borderRadius: 10, background: 'var(--color-brand-primary)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800 }}>Send feedback</button>}</div>}
        </div>
      </div>
    </div>
  )
}

function SettingsGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <section style={{ border: '1px solid var(--color-border-primary)', borderRadius: 12, overflow: 'hidden' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: 'var(--color-surface-secondary)', color: 'var(--color-text-primary)', fontWeight: 800, fontSize: 12 }}>{icon}{title}</div><div style={{ display: 'grid' }}>{children}</div></section>
}

function PreferenceToggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, borderTop: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} style={{ width: 17, height: 17, accentColor: '#1769e8', flexShrink: 0 }} /><span><b style={{ display: 'block', fontSize: 12 }}>{label}</b><span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-secondary)', fontSize: 10.5, lineHeight: 1.35 }}>{detail}</span></span></label>
}

function PreferenceSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderTop: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)', fontWeight: 700, fontSize: 12 }}>{label}<select value={value} onChange={event => onChange(event.target.value)} style={{ maxWidth: 150, padding: '7px 8px', borderRadius: 8, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', color: 'var(--color-text-primary)', fontSize: 11, fontFamily: 'inherit' }}>{values.map(option => <option key={option}>{option}</option>)}</select></label>
}
