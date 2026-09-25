import { useState, useEffect, useRef, type ReactNode } from 'react'
import {
  Home, Map, Plane, Building2, Database,
  Settings, Shield, Bell, BarChart2, BookOpen,
  Download, Activity, LogOut, ChevronDown, Table2, Search, X, TrendingUp, History,
  LineChart, CalendarDays, AlertCircle, Landmark, Users, Globe, Bookmark, MessageSquare, Moon, Sun,
  TowerControl, Route, CloudSun, Fuel, Radio
} from 'lucide-react'
import DataStatusBanner from './DataStatusBanner'
import { useAuth, canAccess, type UserRole, type UserPlan } from '../contexts/AuthContext'
import { useGovData } from '../hooks/useGovData'
import { corridors } from '../data/sampleData'
import UserSupportModal from './UserSupportModal'
import { apiHealth, apiNotifications } from '../services/api'
import { useAviationRadar } from '../services/aviationRadar'
import type { AviationPanel } from '../pages/AviationLive'

export type Page =
  | 'overview' | 'map' | 'routes' | 'government' | 'insights'
  | 'alerts' | 'sources' | 'collection' | 'methodology' | 'exports'
  | 'admin' | 'livefares' | 'anomalies' | 'forecast' | 'historicalfares'
  | 'airfareindex' | 'airlineexplorer' | 'bookingwindow'
  | 'aviationlive' | 'aviationflights' | 'aviationairports'

// ── Portal definitions ─────────────────────────────────────────────────────
export type Portal = 'gov' | 'admin' | 'aviation'

export type AdminTab = 'pipeline' | 'users' | 'access' | 'feedback' | 'audit' | 'config'
interface NavItem { page: Page; icon: typeof Home; label: string; badge?: string; minRole?: 'ANALYST' | 'ADMIN' | 'SUBSCRIBER'; supportAction?: 'settings' | 'help' | 'feedback'; section?: string; aviationAction?: AviationPanel; adminTab?: AdminTab }
interface LocalNotification { id: string; email?: string; title: string; message: string; createdAt: string; read?: boolean }

// Government Portal
const govNav: NavItem[] = [
  { page: 'overview',        icon: Home,         label: 'Dashboard' },
  { page: 'airfareindex',    icon: BarChart2,    label: 'Airfare Index',    minRole: 'ANALYST' },
  { page: 'livefares',       icon: Table2,       label: 'Live Fares' },
  { page: 'routes',          icon: Plane,        label: 'Route Explorer' },
  { page: 'airlineexplorer', icon: Globe,        label: 'Airline Explorer', minRole: 'ANALYST' },
  { page: 'insights',        icon: TrendingUp,   label: 'Market Insights' },
  { page: 'map',             icon: Map,          label: 'GIS / India Map' },
  { page: 'bookingwindow',   icon: CalendarDays, label: 'Booking Windows',  minRole: 'ANALYST' },
  { page: 'forecast',        icon: LineChart,    label: 'Forecast' },
  { page: 'anomalies',       icon: AlertCircle,  label: 'Anomalies' },
  { page: 'historicalfares', icon: History,      label: 'Historical Fares' },
  { page: 'government',      icon: Landmark,     label: 'Gov Intelligence', minRole: 'ANALYST' },
  { page: 'alerts',          icon: Bell,         label: 'Price Alerts' },
  { page: 'exports',         icon: Download,     label: 'Reports & Exports', minRole: 'ANALYST' },
  { page: 'methodology',     icon: BookOpen,     label: 'Methodology',       minRole: 'ANALYST' },
]

// Admin Control Center
const adminNav: NavItem[] = [
  { page: 'admin',      icon: Shield,    label: 'Overview',          minRole: 'ADMIN', adminTab: 'pipeline' },
  { page: 'sources',    icon: Database,  label: 'Data Sources',      minRole: 'ADMIN' },
  { page: 'collection', icon: Activity,  label: 'Collection Jobs',   minRole: 'ADMIN' },
  { page: 'collection', icon: Route,     label: 'Data Pipelines',    minRole: 'ADMIN' },
  { page: 'admin',      icon: Users,     label: 'User Management',   minRole: 'ADMIN', adminTab: 'users' },
  { page: 'admin',      icon: Shield,    label: 'Access Requests',   minRole: 'ADMIN', adminTab: 'access' },
  { page: 'admin',      icon: BookOpen,  label: 'Audit Trail',       minRole: 'ADMIN', adminTab: 'audit' },
  { page: 'admin',      icon: Settings,  label: 'System Parameters', minRole: 'ADMIN', adminTab: 'config' },
  { page: 'exports',    icon: Download,  label: 'Reports & Exports', minRole: 'ADMIN' },
  { page: 'admin',      icon: Activity,  label: 'System Health',     minRole: 'ADMIN', adminTab: 'pipeline' },
]

// Aviation Intelligence
const aviationNav: NavItem[] = [
  { page: 'aviationlive',     icon: Map,       label: 'Live Flight Map' },
  { page: 'aviationflights',  icon: Plane,     label: 'Flights' },
  { page: 'aviationairports', icon: Building2, label: 'Airports' },
  { page: 'aviationlive', icon: Plane, label: 'Airlines', aviationAction: 'Airlines' },
  { page: 'aviationlive', icon: TowerControl, label: 'ATC Activity', aviationAction: 'ATC Activity' },
  { page: 'aviationlive', icon: Route, label: 'Corridor Analysis', aviationAction: 'Corridor Analysis' },
  { page: 'aviationlive', icon: CloudSun, label: 'Weather & Alerts', aviationAction: 'Weather & Alerts' },
  { page: 'aviationlive', icon: History, label: 'Historical Replay', aviationAction: 'Historical Replay' },
  { page: 'aviationlive', icon: Fuel, label: 'Fuel & Emissions', aviationAction: 'Fuel & Emissions' },
  { page: 'aviationlive', icon: Download, label: 'Reports & Export', aviationAction: 'Reports & Export' },
  { page: 'airfareindex', icon: LineChart, label: 'Airfare Index', section: 'GOVERNMENT MODULES', minRole: 'ANALYST' },
  { page: 'insights', icon: BarChart2, label: 'Market Insights' },
  { page: 'sources', icon: Database, label: 'Data Sources', minRole: 'ANALYST' },
]

const userNav: NavItem[] = [
  { page: 'overview', icon: Home, label: 'Dashboard', section: 'USER DASHBOARD' },
  { page: 'routes', icon: Plane, label: 'Route Explorer' },
  { page: 'insights', icon: TrendingUp, label: 'Market Insights' },
  { page: 'map', icon: Map, label: 'GIS / India Map' },
  { page: 'alerts', icon: Bell, label: 'Price Alerts' },
  { page: 'routes', icon: Bookmark, label: 'Saved Routes' },
  { page: 'historicalfares', icon: History, label: 'Travel History' },
  // Settings is intentionally available from the global header gear only.
  { page: 'sources', icon: BookOpen, label: 'Help & FAQ', supportAction: 'help' },
  { page: 'sources', icon: MessageSquare, label: 'Feedback', supportAction: 'feedback' },
]


const ROLE_BADGE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  ADMIN:      { label: 'ADMIN',    bg: 'var(--color-danger-bg)',        color: 'var(--color-danger)',       border: 'rgba(220,38,38,0.3)' },
  ANALYST:    { label: 'ANALYST',  bg: 'var(--color-info-bg)',          color: 'var(--color-info)',         border: 'rgba(3,105,161,0.3)' },
  SUBSCRIBER: { label: 'SUBSCRIBED', bg: 'var(--color-brand-muted)',    color: 'var(--color-brand-primary)', border: 'rgba(37,99,235,0.3)' },
  FREE:       { label: 'USER',     bg: 'var(--color-surface-secondary)',color: 'var(--color-text-tertiary)', border: 'var(--color-border-primary)' },
}

function roleFromPlan(role: UserRole, plan: UserPlan): string {
  if (role === 'ADMIN') return 'ADMIN'
  if (role === 'ANALYST') return 'ANALYST'
  if (plan === 'SUBSCRIBER') return 'SUBSCRIBER'
  return 'FREE'
}

interface NavButtonProps {
  icon: ReactNode; label: string; active: boolean; badge?: string; onClick: () => void
}

function NavButton({ icon, label, active, badge, onClick }: NavButtonProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '7px 12px 7px 10px',
        background: active
          ? 'linear-gradient(90deg, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.04) 100%)'
          : hovered ? 'var(--color-surface-hover)' : 'transparent',
        border: 'none',
        borderLeft: active ? '3px solid var(--color-brand-primary)' : '3px solid transparent',
        borderRadius: '0 8px 8px 0',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        fontFamily: 'var(--font-sans)',
        marginBottom: 1,
      }}
    >
      <span style={{ color: active ? 'var(--color-brand-primary)' : hovered ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', display: 'flex', flexShrink: 0, transition: 'color 150ms ease' }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--color-brand-primary)' : hovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', flex: 1, textAlign: 'left', transition: 'color 150ms ease', letterSpacing: active ? '0.01em' : '0' }}>
        {label}
      </span>
      {badge && (
        <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '1px 5px', borderRadius: 99, letterSpacing: '0.06em' }}>
          {badge}
        </span>
      )}
    </button>
  )
}

interface AppShellProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  children: ReactNode
}

const PAGE_TITLES: Record<Page, string> = {
  overview: 'Dashboard', map: 'GIS / India Map', routes: 'Route Explorer',
  government: 'Gov Intelligence', insights: 'Market Insights',
  alerts: 'Price Alerts', sources: 'Data Sources', collection: 'Collection Jobs',
  methodology: 'Methodology', exports: 'Reports & Exports', admin: 'Admin Control Center',
  livefares: 'Live Fares', anomalies: 'Anomaly Detection', forecast: 'Forecast',
  historicalfares: 'Historical Fares', airfareindex: 'Airfare Index',
  airlineexplorer: 'Airline Explorer', bookingwindow: 'Booking Window Analysis',
  aviationlive: 'Live Flight Map', aviationflights: 'Flights', aviationairports: 'Airports',
}

// Which portal a page belongs to (for auto-switching portal tab)
const PAGE_PORTAL: Partial<Record<Page, Portal>> = {
  overview:'gov', airfareindex:'gov', livefares:'gov', routes:'gov',
  airlineexplorer:'gov', insights:'gov', map:'gov', bookingwindow:'gov',
  forecast:'gov', anomalies:'gov', historicalfares:'gov', government:'gov',
  alerts:'gov', exports:'gov', methodology:'gov',
  admin:'admin', collection:'admin',
  aviationlive:'aviation', aviationflights:'aviation', aviationairports:'aviation',
}

const PUBLIC_USER_PAGES: Page[] = ['overview', 'routes', 'insights', 'map', 'alerts', 'historicalfares', 'sources']

export default function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const { user, token, logout } = useAuth()
  const isAviation = currentPage.startsWith('aviation')
  const radar = useAviationRadar(isAviation)
  const govData = useGovData()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [portal, setPortal] = useState<Portal>(() => {
    if (currentPage === 'exports') {
      const savedExportsPortal = sessionStorage.getItem('exports-portal') as Portal | null
      if (savedExportsPortal === 'admin' || savedExportsPortal === 'gov') return savedExportsPortal
    }
    return PAGE_PORTAL[currentPage] ?? 'gov'
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [supportMode, setSupportMode] = useState<'settings' | 'help' | 'feedback' | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<LocalNotification[]>([])
  const [fareFeed, setFareFeed] = useState<{ connected: boolean; observations: number | null }>({ connected: false, observations: null })
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('aeroprice_theme') === 'dark')
  const [adminNavKey, setAdminNavKey] = useState(() => sessionStorage.getItem('admin-nav-key') || 'Overview')
  const searchRef = useRef<HTMLDivElement>(null)
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLElement>(null)

  // Route changes must never preserve an old horizontal scroll position on the
  // compact navigation strip. Preserving it is what caused clipped labels on
  // every page after navigating from a partially scrolled menu.
  useEffect(() => {
    mobileNavRef.current?.scrollTo({ left: 0, behavior: 'auto' })
    contentRef.current?.scrollTo({ left: 0, top: 0, behavior: 'auto' })
  }, [currentPage])

  useEffect(() => {
    const onAdminNav = (event: Event) => {
      const key = (event as CustomEvent<string>).detail
      if (key) setAdminNavKey(key)
    }
    window.addEventListener('admin-nav', onAdminNav)
    return () => window.removeEventListener('admin-nav', onAdminNav)
  }, [])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('aeroprice_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const syncPreferences = () => setDarkMode(localStorage.getItem('aeroprice_theme') === 'dark')
    window.addEventListener('aeroprice-preferences-changed', syncPreferences)
    return () => window.removeEventListener('aeroprice-preferences-changed', syncPreferences)
  }, [])

  useEffect(() => {
    const loadNotifications = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('aeroprice_notifications') || '[]') as LocalNotification[]
        setNotifications(stored.filter(item => !item.email || item.email === user?.email).slice(0, 8))
      } catch {
        setNotifications([])
      }
    }
    loadNotifications()
    if (token) {
      apiNotifications(token).then((result: any) => {
        if (!Array.isArray(result?.notifications)) return
        const serverNotifications = result.notifications.map((item: any) => ({ id: item.id, title: item.title, message: item.message, createdAt: item.created_at, read: Boolean(item.read) }))
        setNotifications(prev => [...serverNotifications, ...prev.filter(item => !serverNotifications.some((server: LocalNotification) => server.id === item.id))].slice(0, 8))
      }).catch(() => {})
    }
    window.addEventListener('aeroprice-notifications-changed', loadNotifications)
    return () => window.removeEventListener('aeroprice-notifications-changed', loadNotifications)
  }, [token, user?.email])

  useEffect(() => {
    let active = true
    apiHealth()
      .then(health => {
        if (active) setFareFeed({
          connected: health.status === 'ok' && health.database === 'connected' && health.real_observations > 0,
          observations: health.real_observations,
        })
      })
      .catch(() => { if (active) setFareFeed({ connected: false, observations: null }) })
    return () => { active = false }
  }, [])

  function markNotificationsRead() {
    try {
      const stored = JSON.parse(localStorage.getItem('aeroprice_notifications') || '[]') as LocalNotification[]
      localStorage.setItem('aeroprice_notifications', JSON.stringify(stored.map(item => item.email === user?.email ? { ...item, read: true } : item)))
      setNotifications(prev => prev.map(item => ({ ...item, read: true })))
    } catch { /* keep the notification panel usable if storage is unavailable */ }
  }

  // Sync portal when page changes externally
  // Exports is shared by Government and Admin. Preserve the portal that opened
  // it so the Admin Reports & Exports action cannot silently switch portals.
  const derivedPortal = currentPage === 'exports' ? portal : PAGE_PORTAL[currentPage] ?? portal

  const role = user?.role ?? 'PUBLIC'
  const plan = user?.plan ?? 'FREE'
  const planKey = roleFromPlan(role, plan)
  const roleBadge = ROLE_BADGE[planKey]

  // Nav items based on active portal
  const activeNav = role === 'PUBLIC' && plan === 'FREE' ? userNav
    : derivedPortal === 'admin' ? adminNav
    : derivedPortal === 'aviation' ? aviationNav
    : govNav

  const searchMatches = searchQuery.trim().length >= 2
    ? [
        ...activeNav.filter(isVisible).filter(item => !item.supportAction).map(item => ({ key: `page-${item.label}`, title: item.label, sub: derivedPortal.toUpperCase(), page: item.page })),
        ...corridors.map(c => ({ key: `route-${c.id}`, title: `${c.from} → ${c.to}`, sub: 'Route Explorer', page: 'routes' as Page })),
        ...radar.aircraft.map(a => ({ key: `air-${a.icao24 || a.callsign}`, title: a.callsign || a.registration || a.icao24.toUpperCase(), sub: `${a.registration || 'Aircraft'} · Live Flight Map`, page: 'aviationlive' as Page })),
        ...['DEL','BOM','BLR','MAA','CCU','HYD','AMD','GAU'].map(code => ({ key: `apt-${code}`, title: code, sub: 'Airport reference', page: 'aviationlive' as Page })),
      ].filter(item => `${item.title} ${item.sub}`.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 7)
    : []

  function switchPortal(p: Portal) {
    setPortal(p)
    if (currentPage === 'exports' && (p === 'admin' || p === 'gov')) sessionStorage.setItem('exports-portal', p)
    const first = (p === 'admin' ? adminNav : p === 'aviation' ? aviationNav : govNav)
      .find(item => isVisible(item))
    if (first) navClick(first.page)
  }

  function isVisible(item: NavItem): boolean {
    if (role === 'PUBLIC' && plan === 'FREE' && !PUBLIC_USER_PAGES.includes(item.page)) return false
    if (!item.minRole) return true
    if (item.minRole === 'ADMIN') return role === 'ADMIN'
    if (item.minRole === 'ANALYST') return role === 'ANALYST' || role === 'ADMIN'
    if (item.minRole === 'SUBSCRIBER') return plan !== 'FREE' || role === 'ANALYST' || role === 'ADMIN'
    return true
  }

  function navClick(page: Page) {
    // Navigation always clears transient surfaces. A profile or notification
    // popover must never stay pinned above the destination page.
    setAvatarOpen(false)
    setNotificationsOpen(false)
    setSupportMode(null)
    if (!canAccess(role, plan, page)) return
    onNavigate(page)
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  return (
    <div className={`app-shell ${isAviation ? 'aviation-shell' : ''}`} style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-sans)', background: 'var(--color-surface-canvas)' }}>

      {/* ── Sidebar ────────────────────────────────────── */}
      <div className="app-sidebar" style={{
        width: 'var(--sidebar-width)', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-surface-bg)',
        borderRight: '1px solid var(--color-border-primary)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Subtle top gradient accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--gradient-brand)', opacity: 0.8 }} />

        {/* Logo */}
        <div className="app-sidebar-brand" role="button" tabIndex={0} onClick={() => navClick('overview')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navClick('overview') } }} title="Go to dashboard" style={{ padding: '20px 16px 14px', borderBottom: '1px solid var(--color-border-primary)', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, background: 'var(--gradient-hero)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 36 36" fill="none" aria-hidden>
                <path d="M4 28 Q18 4 32 18" stroke="rgba(255,255,255,0.9)" strokeWidth="3" strokeLinecap="round" fill="none"/>
                <circle cx="32" cy="18" r="3.5" fill="rgba(255,255,255,0.9)"/>
                <line x1="14" y1="32" x2="14" y2="22" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round"/>
                <line x1="21" y1="32" x2="21" y2="17" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '0.08em', lineHeight: 1.1 }}>AEROPRICE</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em' }}>INDIA</div>
              {isAviation && <div className="av-brand-caption">Real-Time Airfare Intelligence</div>}
            </div>
          </div>
          {/* Role badge */}
          <div role={role === 'ADMIN' ? 'button' : undefined} tabIndex={role === 'ADMIN' ? 0 : undefined} onClick={event => { if (role === 'ADMIN') { event.stopPropagation(); setAdminNavKey('Overview'); sessionStorage.setItem('admin-nav-key', 'Overview'); sessionStorage.setItem('admin-tab', 'pipeline'); navClick('admin'); window.dispatchEvent(new CustomEvent('admin-nav', { detail: 'Overview' })); window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'pipeline' })) } }} onKeyDown={event => { if (role === 'ADMIN' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); setAdminNavKey('Overview'); sessionStorage.setItem('admin-nav-key', 'Overview'); sessionStorage.setItem('admin-tab', 'pipeline'); navClick('admin'); window.dispatchEvent(new CustomEvent('admin-nav', { detail: 'Overview' })); window.dispatchEvent(new CustomEvent('admin-tab', { detail: 'pipeline' })) } }} title={role === 'ADMIN' ? 'Open Admin Control Center' : undefined} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px',
            background: roleBadge.bg,
            border: `1px solid ${roleBadge.border}`,
            borderRadius: 99,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: roleBadge.color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: roleBadge.color, letterSpacing: '0.1em' }}>{roleBadge.label}</span>
          </div>
        </div>

        {/* ── Portal tabs ── */}
        {!(role === 'PUBLIC' && plan === 'FREE') && <div className="app-sidebar-portal" style={{ borderBottom: '1px solid var(--color-border-primary)', padding: '6px 8px' }}>
          {[
            { id:'gov',      label: role === 'PUBLIC' && plan === 'FREE' ? 'USER' : 'GOV',      title: role === 'PUBLIC' && plan === 'FREE' ? 'User Dashboard' : 'Government Portal' },
            { id:'admin',    label:'ADMIN',     title:'Admin Control Center', minRole:'ADMIN' as const },
            { id:'aviation', label:'AVIATION',  title:'Aviation Intelligence' },
          ].filter(p => {
            if (p.minRole && role !== 'ADMIN') return false
            if (p.id === 'aviation' && role === 'PUBLIC' && plan === 'FREE') return false
            return true
          }).map(p => (
            <button key={p.id} title={p.title}
              onClick={() => switchPortal(p.id as Portal)}
              style={{
                padding:'4px 8px', marginRight:4, borderRadius:6, border:'none',
                fontSize:9, fontWeight:700, letterSpacing:'0.1em', cursor:'pointer',
                background: derivedPortal===p.id ? 'var(--color-brand-primary)' : 'var(--color-surface-secondary)',
                color: derivedPortal===p.id ? 'white' : 'var(--color-text-tertiary)',
                transition:'all 150ms',
              }}>
              {p.label}
            </button>
          ))}
        </div>}

        {/* Nav */}
        <div ref={mobileNavRef} className="app-sidebar-nav" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {!(role === 'PUBLIC' && plan === 'FREE') && (
            <div style={{ padding: '4px 14px 4px', marginTop: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em' }}>
                {derivedPortal === 'gov' ? 'GOVERNMENT PORTAL'
                  : derivedPortal === 'admin' ? 'ADMIN CONTROL CENTER'
                  : 'AVIATION INTELLIGENCE'}
              </span>
            </div>
          )}
          {activeNav.filter(isVisible).map(({ page, icon: Icon, label, badge, supportAction, section, aviationAction, adminTab }) => (
            <div key={page + label}>
              {section && <div style={{ padding: '14px 14px 5px', fontSize: 9, fontWeight: 700, letterSpacing: '.12em', color: 'var(--color-text-tertiary)' }}>{section}</div>}
              <NavButton icon={<Icon size={15} />} label={label} badge={badge}
              active={adminTab ? currentPage === 'admin' && adminNavKey === label : supportAction || aviationAction ? false : currentPage === page} onClick={() => {
                  setAvatarOpen(false)
                  setNotificationsOpen(false)
                  if (aviationAction) {
                    sessionStorage.setItem('aviation-panel', aviationAction)
                    navClick('aviationlive')
                    window.dispatchEvent(new CustomEvent('aviation-panel', { detail: aviationAction }))
                  }
                  else if (supportAction) setSupportMode(supportAction)
                  else if (adminTab && page === 'admin') { setAdminNavKey(label); sessionStorage.setItem('admin-nav-key', label); sessionStorage.setItem('admin-tab', adminTab); navClick('admin'); window.dispatchEvent(new CustomEvent('admin-nav', { detail: label })); window.dispatchEvent(new CustomEvent('admin-tab', { detail: adminTab })) }
                  else {
                    if (page === 'exports' && (derivedPortal === 'admin' || derivedPortal === 'gov')) {
                      setPortal(derivedPortal)
                      sessionStorage.setItem('exports-portal', derivedPortal)
                    }
                    navClick(page)
                  }
                }} />
            </div>
          ))}
        </div>

        {/* Footer avatar */}
        <div className="app-sidebar-footer" style={{ borderTop: '1px solid var(--color-border-primary)', padding: '10px 12px' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAvatarOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                background: avatarOpen ? 'var(--color-surface-hover)' : 'none',
                border: 'none', cursor: 'pointer',
                padding: '7px 8px', borderRadius: 8, textAlign: 'left',
                transition: 'background 150ms ease',
              }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
              onMouseOut={e => { if (!avatarOpen) (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--gradient-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: '0 2px 6px rgba(37,99,235,0.3)',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{initials}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name ?? 'User'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>
                  {user?.plan === 'FREE' ? 'USER' : user?.plan ?? 'USER'}
                </div>
              </div>
              <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, transform: avatarOpen ? 'rotate(180deg)' : '', transition: 'transform 150ms ease' }} />
            </button>

            {avatarOpen && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0,
                background: 'var(--color-surface-bg)',
                border: '1px solid var(--color-border-primary)',
                borderRadius: 10, boxShadow: 'var(--shadow-floating)',
                overflow: 'hidden', marginBottom: 4,
                animation: 'fade-in 150ms ease',
              }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-primary)', background: 'var(--color-surface-secondary)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{user?.email}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                    Role: {user?.role === 'PUBLIC' ? 'USER' : user?.role} · Access: {user?.plan === 'FREE' ? 'STANDARD' : user?.plan}
                  </div>
                </div>
                <button
                  onClick={() => { setAvatarOpen(false); logout() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', fontSize: 13, color: 'var(--color-danger)',
                    transition: 'background 150ms ease',
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-bg)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {supportMode && <UserSupportModal mode={supportMode} onClose={() => setSupportMode(null)} onChangeMode={setSupportMode} />}

      {/* ── Main area ─────────────────────────────────────── */}
      <div className="app-main" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

        {/* Top bar */}
        <div className="app-topbar" style={{
          height: 50, display: 'flex', alignItems: 'center',
          padding: '0 24px', gap: 16,
          background: 'var(--color-surface-bg)',
          borderBottom: '1px solid var(--color-border-primary)',
          flexShrink: 0, zIndex: 10,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>AeroPrice India</span>
            <span style={{ fontSize: 11, color: 'var(--color-border-secondary)' }}>/</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '0.01em' }}>{PAGE_TITLES[currentPage]}</span>
          </div>

          {/* Global search */}
          <div ref={searchRef} className="global-search-stack" style={{ flex: 1, maxWidth: 300, position: 'relative', zIndex: 1000, isolation: 'isolate' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none', zIndex: 1 }} />
            <input
              type="text" value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); if (isAviation) { sessionStorage.setItem('aviation-search', e.target.value); window.dispatchEvent(new CustomEvent('aviation-search', { detail: e.target.value })) } }}
              onFocus={() => { setSearchFocused(true); setSearchOpen(true) }}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') }
                if (e.key === 'Enter' && searchMatches.length > 0) {
                  const target = searchMatches[0]
                  setSearchOpen(false)
                  if (target.page === 'aviationlive') { sessionStorage.setItem('aviation-search', searchQuery); window.dispatchEvent(new CustomEvent('aviation-search', { detail: searchQuery })) }
                  else setSearchQuery('')
                  navClick(target.page)
                }
              }}
              placeholder={isAviation ? 'Search flights, routes, airports, aircraft…' : 'Search routes, airports, airlines, or insights…'}
              style={{
                width: '100%', paddingLeft: 30, paddingRight: searchQuery ? 30 : 12,
                paddingTop: 6, paddingBottom: 6,
                background: searchFocused ? 'var(--color-surface-bg)' : 'var(--color-surface-secondary)',
                border: `1px solid ${searchFocused ? 'var(--color-border-focus)' : 'var(--color-border-primary)'}`,
                borderRadius: 99,
                fontSize: 12, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)',
                outline: 'none', boxSizing: 'border-box',
                boxShadow: searchFocused ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none',
                transition: 'all 150ms ease',
              }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchOpen(false); if (isAviation) { sessionStorage.removeItem('aviation-search'); window.dispatchEvent(new CustomEvent('aviation-search', { detail: '' })) } }}
                style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', padding: 0, zIndex: 1 }}>
                <X size={11} />
              </button>
            )}
            {searchOpen && searchMatches.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: 'var(--color-surface-bg)',
                border: '1px solid var(--color-border-primary)',
                borderRadius: 10, boxShadow: 'var(--shadow-floating)',
                overflow: 'hidden', zIndex: 2000,
              }}>
                {searchMatches.map(item => (
                  <button key={item.key}
                    onMouseDown={e => { e.preventDefault(); setSearchOpen(false); if (item.page === 'aviationlive') { sessionStorage.setItem('aviation-search', searchQuery); window.dispatchEvent(new CustomEvent('aviation-search', { detail: searchQuery })) } else setSearchQuery(''); navClick(item.page) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-primary)', fontFamily: 'var(--font-sans)',
                      transition: 'background 100ms',
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-secondary)' }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{item.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
            {isAviation ? <div className={`av-feed-status ${radar.status === 'connected' ? '' : 'pending'}`} aria-live="polite"><span><i/>{radar.status === 'connected' ? 'LIVE DATA FEEDS' : radar.status === 'cached' ? 'CACHED DATA' : radar.status === 'loading' ? 'CONNECTING' : 'RETRYING FEED'}{radar.retrievedAt ? ` · ${new Date(radar.retrievedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase()} IST` : ''}</span><span><Radio size={10}/>{radar.status === 'connected' ? 'PROVIDER CONNECTED' : radar.status === 'cached' ? 'LAST VALID RESPONSE' : 'REFRESHING'}</span></div> : <DataStatusBanner
              anyGovConnected={govData.anyConnected}
              fareFeedConnected={fareFeed.connected}
              verifiedObservations={fareFeed.observations}
              showGovernmentStatus={role !== 'PUBLIC'}
              isLoading={govData.isLoading}
              lastFetch={govData.lastFetch}
            />}
            <button onClick={() => setDarkMode(value => !value)} aria-label={darkMode ? 'Use light mode' : 'Use dark mode'} title={darkMode ? 'Use light mode' : 'Use dark mode'} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid var(--color-border-primary)', borderRadius: 9, background: darkMode ? 'var(--color-brand-muted)' : 'var(--color-surface-bg)', color: darkMode ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)', cursor: 'pointer', transition: 'all 150ms ease' }}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setNotificationsOpen(v => !v); markNotificationsRead() }} aria-label="Notifications" title="Notifications" style={{ position: 'relative', width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)', color: 'var(--color-text-secondary)', borderRadius: 9, cursor: 'pointer' }}><Bell size={16} />{notifications.some(item => !item.read) && <span style={{ position: 'absolute', right: -3, top: -5, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 99, background: '#e33c3c', color: '#fff', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{notifications.filter(item => !item.read).length}</span>}</button>
              {notificationsOpen && <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 290, padding: 14, background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 12, boxShadow: 'var(--shadow-floating)', zIndex: 160 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>Notifications</b><button onClick={() => setNotificationsOpen(false)} style={{ border: 0, background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}><X size={14} /></button></div>{notifications.length === 0 ? <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>No new notifications.</p> : <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>{notifications.map(item => <div key={item.id} style={{ padding: 9, borderRadius: 9, background: item.read ? 'var(--color-surface-secondary)' : 'var(--color-brand-muted)' }}><div style={{ fontSize: 11, fontWeight: 800, color: 'var(--color-text-primary)' }}>{item.title}</div><div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>{item.message}</div></div>)}</div>}</div>}
            </div>
            <button
              onClick={() => { setNotificationsOpen(false); setAvatarOpen(false); setSupportMode('settings') }}
              aria-label="Open settings"
              title="Settings"
              style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: '1px solid var(--color-border-primary)', borderRadius: 9, background: 'var(--color-surface-bg)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              <Settings size={16} />
            </button>
            <button onClick={() => setAvatarOpen(v => !v)} aria-label="Open profile menu" title={user?.name ?? 'Profile'} style={{ width: 32, height: 32, border: 0, borderRadius: '50%', background: 'var(--gradient-brand)', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,.25)' }}>{initials}</button>
          </div>
        </div>

        {/* Page content */}
        <main
          style={{
            flex: 1, minWidth: 0, width: '100%', overflowX: 'hidden', overflowY: 'auto', padding: '24px', position: 'relative',
            backgroundImage: 'radial-gradient(circle, var(--color-border-primary) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          ref={contentRef}
          className="app-content page-enter"
          key={currentPage}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
