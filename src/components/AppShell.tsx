import { useState, type ReactNode } from 'react'
import {
  Home, Map, Plane, Building2, Database,
  Settings, Shield, Bell, BarChart2, BookOpen,
  Download, Activity, LogOut, ChevronDown, Table2, Search, X, TrendingUp, History
} from 'lucide-react'
import DataStatusBanner from './DataStatusBanner'
import { useAuth, canAccess, type UserRole, type UserPlan } from '../contexts/AuthContext'
import { useGovData } from '../hooks/useGovData'

export type Page =
  | 'overview' | 'map' | 'routes' | 'government' | 'insights'
  | 'alerts' | 'sources' | 'collection' | 'methodology' | 'exports'
  | 'admin' | 'livefares' | 'anomalies' | 'forecast' | 'historicalfares'

interface NavItem { page: Page; icon: typeof Home; label: string; badge?: string; minRole?: 'ANALYST' | 'ADMIN' | 'SUBSCRIBER' }

const publicNav: NavItem[] = [
  { page: 'overview',   icon: Home,      label: 'Overview' },
  { page: 'map',        icon: Map,       label: 'India Map' },
  { page: 'routes',     icon: Plane,     label: 'Route Explorer' },
  { page: 'insights',   icon: BarChart2, label: 'Market Insights' },
  { page: 'livefares',  icon: Table2,    label: 'Live Fares' },
  { page: 'alerts',     icon: Bell,      label: 'Price Alerts' },
  { page: 'anomalies',  icon: Activity,  label: 'Anomalies' },
  { page: 'forecast',   icon: TrendingUp, label: 'Forecast' },
  { page: 'historicalfares', icon: History, label: 'Historical Fares' },
]

const analyticsNav: NavItem[] = [
  { page: 'government',  icon: Building2, label: 'Gov Intelligence', minRole: 'ANALYST' },
  { page: 'methodology', icon: BookOpen,  label: 'Methodology',      minRole: 'ANALYST' },
  { page: 'exports',     icon: Download,  label: 'Exports',          minRole: 'ANALYST' },
]

const systemNav: NavItem[] = [
  { page: 'sources',    icon: Database,  label: 'Data Sources', minRole: 'ANALYST' },
  { page: 'collection', icon: Activity,  label: 'Collection',   minRole: 'ADMIN' },
  { page: 'admin',      icon: Shield,    label: 'Admin Console',minRole: 'ADMIN' },
]

const ROLE_BADGE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  ADMIN:      { label: 'ADMIN',    bg: 'var(--color-danger-bg)',        color: 'var(--color-danger)',       border: 'rgba(220,38,38,0.3)' },
  ANALYST:    { label: 'ANALYST',  bg: 'var(--color-info-bg)',          color: 'var(--color-info)',         border: 'rgba(3,105,161,0.3)' },
  SUBSCRIBER: { label: 'PRO',      bg: 'var(--color-brand-muted)',      color: 'var(--color-brand-primary)', border: 'rgba(37,99,235,0.3)' },
  FREE:       { label: 'FREE',     bg: 'var(--color-surface-secondary)',color: 'var(--color-text-tertiary)', border: 'var(--color-border-primary)' },
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
  overview: 'Overview', map: 'India Map', routes: 'Route Explorer',
  government: 'Gov Intelligence', insights: 'Market Insights',
  alerts: 'Price Alerts', sources: 'Data Sources', collection: 'Collection',
  methodology: 'Methodology', exports: 'Exports', admin: 'Admin Console',
  livefares: 'Live Fares', anomalies: 'Anomalies', forecast: 'Forecast', historicalfares: 'Historical Fares',
}

export default function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const { user, logout } = useAuth()
  const govData = useGovData()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  const role = user?.role ?? 'PUBLIC'
  const plan = user?.plan ?? 'FREE'
  const planKey = roleFromPlan(role, plan)
  const roleBadge = ROLE_BADGE[planKey]

  function isVisible(item: NavItem): boolean {
    if (!item.minRole) return true
    if (item.minRole === 'ADMIN') return role === 'ADMIN'
    if (item.minRole === 'ANALYST') return role === 'ANALYST' || role === 'ADMIN'
    if (item.minRole === 'SUBSCRIBER') return plan !== 'FREE' || role === 'ANALYST' || role === 'ADMIN'
    return true
  }

  function navClick(page: Page) {
    if (!canAccess(role, plan, page)) return
    onNavigate(page)
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-sans)', background: 'var(--color-surface-canvas)' }}>

      {/* ── Sidebar ────────────────────────────────────── */}
      <div style={{
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
        <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid var(--color-border-primary)' }}>
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
            </div>
          </div>
          {/* Role badge */}
          <div style={{
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

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 10px 0' }}>
          {/* Section: Navigation */}
          <div style={{ padding: '4px 14px 6px', marginTop: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em' }}>NAVIGATION</span>
          </div>
          {publicNav.filter(isVisible).map(({ page, icon: Icon, label, badge }) => (
            <NavButton key={page} icon={<Icon size={15} />} label={label} badge={badge}
              active={currentPage === page} onClick={() => navClick(page)} />
          ))}

          {(role === 'ANALYST' || role === 'ADMIN') && (
            <>
              <div style={{ margin: '12px 0 6px', padding: '4px 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em' }}>ANALYTICS</span>
              </div>
              {analyticsNav.filter(isVisible).map(({ page, icon: Icon, label }) => (
                <NavButton key={page} icon={<Icon size={15} />} label={label}
                  active={currentPage === page} onClick={() => navClick(page)} />
              ))}
            </>
          )}

          {role === 'ADMIN' && (
            <>
              <div style={{ margin: '12px 0 6px', padding: '4px 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.12em' }}>SYSTEM</span>
              </div>
              {systemNav.filter(isVisible).map(({ page, icon: Icon, label }) => (
                <NavButton key={page} icon={<Icon size={15} />} label={label}
                  active={currentPage === page} onClick={() => navClick(page)} />
              ))}
            </>
          )}
        </div>

        {/* Footer avatar */}
        <div style={{ borderTop: '1px solid var(--color-border-primary)', padding: '10px 12px' }}>
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
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 1 }}>{user?.plan ?? 'FREE'}</div>
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
                    Role: {user?.role} · Plan: {user?.plan}
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

      {/* ── Main area ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
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
          <div style={{ flex: 1, maxWidth: 300, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search routes, airports…"
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
              <button onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', padding: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Right status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0 }}>
            <DataStatusBanner
              anyGovConnected={govData.anyConnected}
              isLoading={govData.isLoading}
              lastFetch={govData.lastFetch}
            />
            {/* System status dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-warning)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em' }}>SOURCES: CHALLENGE</span>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main
          style={{
            flex: 1, overflowY: 'auto', padding: '24px', position: 'relative',
            backgroundImage: 'radial-gradient(circle, var(--color-border-primary) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
          className="page-enter"
          key={currentPage}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
