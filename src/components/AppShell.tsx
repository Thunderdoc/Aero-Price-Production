import { useState, type ReactNode } from 'react'
import {
  Home, Map, Plane, Building2, Database,
  Settings, Shield, Bell, BarChart2, BookOpen,
  Download, Activity, LogOut, ChevronDown, Table2, Search
} from 'lucide-react'
import { SidebarNavigation, SidebarButton, SidebarSection } from './ui/Sidebar'
import DataStatusBanner from './DataStatusBanner'
import { useAuth, canAccess, type UserRole, type UserPlan } from '../contexts/AuthContext'
import { useGovData } from '../hooks/useGovData'

export type Page =
  | 'overview' | 'map' | 'routes' | 'government' | 'insights'
  | 'alerts' | 'sources' | 'collection' | 'methodology' | 'exports'
  | 'admin' | 'livefares'

interface NavItem { page: Page; icon: typeof Home; label: string; badge?: string; minRole?: 'ANALYST' | 'ADMIN' | 'SUBSCRIBER' }

const publicNav: NavItem[] = [
  { page: 'overview',  icon: Home,      label: 'Overview' },
  { page: 'map',       icon: Map,       label: 'India Map' },
  { page: 'routes',    icon: Plane,     label: 'Route Explorer' },
  { page: 'insights',  icon: BarChart2, label: 'Market Insights' },
  { page: 'livefares', icon: Table2,    label: 'Live Fares' },
  { page: 'alerts',    icon: Bell,      label: 'Price Alerts' },
]

const analyticsNav: NavItem[] = [
  { page: 'government',  icon: Building2, label: 'Gov Intelligence', minRole: 'ANALYST' },
  { page: 'methodology', icon: BookOpen,  label: 'Methodology', minRole: 'ANALYST' },
  { page: 'exports',     icon: Download,  label: 'Exports', minRole: 'ANALYST' },
]

const systemNav: NavItem[] = [
  { page: 'sources',    icon: Database,  label: 'Data Sources', minRole: 'ANALYST' },
  { page: 'collection', icon: Activity,  label: 'Collection', minRole: 'ADMIN' },
  { page: 'admin',      icon: Shield,    label: 'Admin Console', minRole: 'ADMIN' },
]

const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ADMIN:      { label: 'ADMIN', bg: 'var(--color-danger-bg)',   color: 'var(--color-danger)' },
  ANALYST:    { label: 'ANALYST', bg: 'var(--color-info-bg)',   color: 'var(--color-info)' },
  SUBSCRIBER: { label: 'PRO',   bg: 'var(--color-brand-muted)', color: 'var(--color-brand-primary)' },
  FREE:       { label: 'FREE',  bg: 'var(--color-surface-secondary)', color: 'var(--color-text-tertiary)' },
}

function roleFromPlan(role: UserRole, plan: UserPlan): string {
  if (role === 'ADMIN') return 'ADMIN'
  if (role === 'ANALYST') return 'ANALYST'
  if (plan === 'SUBSCRIBER') return 'SUBSCRIBER'
  return 'FREE'
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
  livefares: 'Live Fares',
}

export default function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  const { user, logout } = useAuth()
  const govData = useGovData()
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-surface-canvas)' }}>
      {/* Sidebar */}
      <div style={{ width: 'var(--sidebar-width)', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-surface-bg)', borderRight: '1px solid var(--color-border-primary)', overflow: 'hidden' }}>
        {/* Logo area */}
        <div style={{ padding: 'var(--space-xl) var(--space-lg) var(--space-md)', borderBottom: '1px solid var(--color-border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
              <path d="M4 28 Q18 4 32 18" stroke="var(--color-brand-primary)" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="32" cy="18" r="3" fill="var(--color-brand-primary)"/>
              <line x1="14" y1="32" x2="14" y2="22" stroke="var(--color-brand-light)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="20" y1="32" x2="20" y2="18" stroke="var(--color-brand-primary)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>AEROPRICE</div>
              <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>INDIA</div>
            </div>
          </div>
          {/* Role badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', background: roleBadge.bg, borderRadius: 'var(--radius-full)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: roleBadge.color, letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>{roleBadge.label}</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md) var(--space-sm)' }}>
          <div style={{ marginBottom: 'var(--space-xs)', padding: '0 var(--space-sm)' }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>PUBLIC</span>
          </div>
          {publicNav.filter(isVisible).map(({ page, icon: Icon, label, badge }) => (
            <SidebarButton
              key={page}
              icon={<Icon size={15} />}
              label={label}
              badge={badge}
              active={currentPage === page}
              onClick={() => navClick(page)}
            />
          ))}

          {(role === 'ANALYST' || role === 'ADMIN') && (
            <>
              <div style={{ margin: 'var(--space-md) 0 var(--space-xs)', padding: '0 var(--space-sm)' }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>ANALYTICS</span>
              </div>
              {analyticsNav.filter(isVisible).map(({ page, icon: Icon, label }) => (
                <SidebarButton
                  key={page}
                  icon={<Icon size={15} />}
                  label={label}
                  active={currentPage === page}
                  onClick={() => navClick(page)}
                />
              ))}
            </>
          )}

          {role === 'ADMIN' && (
            <>
              <div style={{ margin: 'var(--space-md) 0 var(--space-xs)', padding: '0 var(--space-sm)' }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.1em', fontFamily: 'var(--font-sans)' }}>SYSTEM</span>
              </div>
              {systemNav.filter(isVisible).map(({ page, icon: Icon, label }) => (
                <SidebarButton
                  key={page}
                  icon={<Icon size={15} />}
                  label={label}
                  active={currentPage === page}
                  onClick={() => navClick(page)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer avatar */}
        <div style={{ borderTop: '1px solid var(--color-border-primary)', padding: 'var(--space-md) var(--space-lg)' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAvatarOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 'var(--space-sm)', borderRadius: 'var(--radius-md)', textAlign: 'left' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'white', fontFamily: 'var(--font-sans)' }}>{user?.initials ?? 'U'}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? 'User'}</div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{user?.plan}</div>
              </div>
              <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            </button>
            {avatarOpen && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--color-surface-bg)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-floating)', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--color-border-primary)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{user?.email}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>Role: {user?.role} · Plan: {user?.plan}</div>
                </div>
                <button
                  onClick={() => { setAvatarOpen(false); logout() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', width: '100%', padding: 'var(--space-md) var(--space-lg)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-danger)', fontFamily: 'var(--font-sans)' }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-danger-bg)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <div
          style={{
            height: 48, display: 'flex', alignItems: 'center',
            padding: '0 var(--space-2xl)',
            background: 'var(--color-surface-bg)',
            borderBottom: '1px solid var(--color-border-primary)',
            gap: 'var(--space-xl)', flexShrink: 0,
          }}
        >
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>AeroPrice India</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>/</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{PAGE_TITLES[currentPage]}</span>
          </div>

          {/* Search */}
          <div style={{ flex: 1, maxWidth: 320, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search routes, airports…"
              style={{
                width: '100%', paddingLeft: 30, paddingRight: 'var(--space-lg)', paddingTop: 6, paddingBottom: 6,
                background: 'var(--color-surface-secondary)',
                border: '1px solid var(--color-border-primary)',
                borderRadius: 'var(--radius-full)',
                fontSize: 12, fontFamily: 'var(--font-sans)',
                color: 'var(--color-text-primary)', outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-border-focus)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border-primary)' }}
            />
          </div>

          {/* Right status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginLeft: 'auto', flexShrink: 0 }}>
            <DataStatusBanner
              anyGovConnected={govData.anyConnected}
              isLoading={govData.isLoading}
              lastFetch={govData.lastFetch}
            />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto" style={{ padding: 'var(--space-2xl)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
