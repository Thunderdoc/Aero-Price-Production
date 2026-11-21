import { useState } from 'react'
import { Check, ChevronDown, MessageSquareText, Moon, ShieldCheck, SlidersHorizontal, Sun, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import FeedbackWorkspace from './FeedbackWorkspace'

type SupportMode = 'settings' | 'help' | 'feedback'

export default function UserSupportModal({ mode, onClose, onChangeMode }: { mode: SupportMode; onClose: () => void; onChangeMode?: (mode: SupportMode) => void }) {
  // Only preferences with a real reader stay here. The old "Alerts &
  // summaries" toggles (email alerts, in-app alerts, weekly summary, route
  // updates, alert frequency) and the locale select had ZERO readers — they
  // saved a localStorage key nothing ever read, i.e. fake "Saved" settings
  // (audit §2.11). They were removed, not wired to nothing.
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('aeroprice_compact_mode') === 'true')
  const [dataSaver, setDataSaver] = useState(() => localStorage.getItem('aeroprice_data_saver') === 'true')
  const [openFaq, setOpenFaq] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'))
  const { user } = useAuth()

  const title = mode === 'settings' ? 'User Settings' : mode === 'help' ? 'Help & FAQ' : 'Feedback'

  function savePreference(key: string, value: boolean, setter: (value: boolean) => void) {
    setter(value)
    localStorage.setItem(key, String(value))
    window.dispatchEvent(new Event('aeroprice-preferences-changed'))
  }

  function toggleTheme() {
    const next = !darkMode
    setDarkMode(next)
    localStorage.setItem('aeroprice_theme', next ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', next)
    window.dispatchEvent(new Event('aeroprice-preferences-changed'))
  }

  // Route the real support entry point through the full feedback workflow.
  // The former inline form only saved plain text and had no attachment/history.
  if (mode === 'feedback') {
    return (
      <div className="user-support-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(15,23,42,.48)', backdropFilter: 'blur(4px)' }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
        <section className="user-support-modal user-support-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="user-feedback-title" style={{ width: '100%', maxWidth: 760, maxHeight: '90dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 18, boxShadow: '0 22px 60px rgba(16,43,99,.2)' }}>
          <header className="user-support-feedback-header">
            <div><span className="user-support-feedback-icon"><MessageSquareText size={18} /></span><div><h2 id="user-feedback-title">Feedback</h2><p>Send a bug report, design suggestion, product feedback, or praise directly to the admin team.</p></div></div>
            <button type="button" onClick={onClose} aria-label="Close feedback" className="user-support-close"><X size={18} /></button>
          </header>
          <div className="user-support-modal-body user-support-feedback-body">
            <FeedbackWorkspace sourceModule={user?.role === 'ANALYST' ? 'DGCA Portal' : 'User Portal'} />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="user-support-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: 20, background: 'rgba(15,23,42,.42)', backdropFilter: 'blur(3px)' }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="user-support-modal" style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 18, boxShadow: '0 22px 60px rgba(16,43,99,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid var(--color-border-primary)' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Check size={20} color="#1769e8" /><h2 style={{ margin: 0, fontSize: 19, color: 'var(--color-text-primary)' }}>{title}</h2></div><button onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}><X size={18} /></button></div>
        <div className="user-support-modal-body" style={{ padding: 20, minHeight: 0, overflowY: 'auto' }}>
          {mode === 'settings' && <div style={{ display: 'grid', gap: 12 }}><p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--color-text-secondary)' }}>Preferences are saved on this device and apply across the user dashboard. Appearance is controlled from the top-bar theme button.</p><div style={{ padding: 13, borderRadius: 11, background: 'var(--color-surface-secondary)', fontSize: 12, color: 'var(--color-text-secondary)' }}><b style={{ color: 'var(--color-text-primary)' }}>Signed in as:</b> {user?.email ?? 'User'}</div><SettingsGroup icon={<SlidersHorizontal size={16} />} title="Dashboard"><PreferenceToggle label="Compact dashboard cards" detail="Save vertical space on smaller screens." checked={compactMode} onChange={value => savePreference('aeroprice_compact_mode', value, setCompactMode)} /><PreferenceToggle label="Data-saver mode" detail="Reduce shadows and animations on the dashboard." checked={dataSaver} onChange={value => savePreference('aeroprice_data_saver', value, setDataSaver)} /></SettingsGroup><div style={{ display: 'flex', gap: 9, padding: 12, borderRadius: 11, background: 'var(--color-info-bg)', color: 'var(--color-text-secondary)', fontSize: 11, lineHeight: 1.45 }}><ShieldCheck size={16} color="#1769e8" style={{ flexShrink: 0 }} />Settings stay with this browser. Account access and price data are managed securely by AeroPrice.</div></div>}
          {mode === 'help' && <div style={{ display: 'grid', gap: 9 }}>{[['How do I compare a route?', 'Open Route Explorer, select a verified route, and press Search Verified Fares. The page never invents a fare when no record is available.'], ['What do the map colors mean?', 'The India Fare Movement map compares the latest two verified collection dates. Red indicates a rise, green a decrease, blue a stable movement, and grey means the system has no verified route coverage for that state.'], ['Why is a state grey?', 'Grey is an honest no-data status. It becomes coloured only when a verified route has an airport in that state and there are two collection dates to compare.'], ['How do access requests work?', 'Choose Request Access on a restricted feature. An administrator reviews the request, grants or rejects the permission, and you receive an in-app notification.'], ['How do I create a price alert?', 'Open Price Alerts, select a supported route, set a target fare, then save the alert. It appears on the Price Alerts page and in the notifications bell when triggered.'], ['Where does flight data come from?', 'The aviation screen uses the connected aircraft provider only when it is available. Air traffic data is kept separate from airfare pricing data.'], ['How can I report an issue?', 'Use Feedback to send a message. It is stored for the administrator in the Feedback section of the admin panel.']].map(([questionText, answer]) => <div key={questionText} style={{ border: '1px solid var(--color-border-primary)', borderRadius: 11, overflow: 'hidden' }}><button onClick={() => setOpenFaq(openFaq === questionText ? null : questionText)} aria-expanded={openFaq === questionText} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', padding: 13, border: 0, background: 'var(--color-surface-secondary)', color: 'var(--color-text-primary)', fontWeight: 750, textAlign: 'left', cursor: 'pointer' }}>{questionText}<ChevronDown size={16} style={{ transform: openFaq === questionText ? 'rotate(180deg)' : undefined }} /></button>{openFaq === questionText && <div style={{ padding: '0 13px 13px', color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.55 }}>{answer}</div>}</div>)}</div>}
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

