import type { ReactNode } from 'react'
import {
  Home, Map, Plane, Building2, Database,
  Settings, Shield, Bell, BarChart2, BookOpen,
  Download, Activity, Users, Wifi
} from 'lucide-react'
import { SidebarNavigation, SidebarButton, SidebarSection } from './ui/Sidebar'
import SampleDataBanner from './SampleDataBanner'

export type Page =
  | 'overview' | 'map' | 'routes' | 'government' | 'insights'
  | 'alerts' | 'sources' | 'collection' | 'methodology' | 'exports'
  | 'admin'

interface NavItem { page: Page; icon: typeof Home; label: string; badge?: string }

const publicNav: NavItem[] = [
  { page: 'overview',   icon: Home,      label: 'Overview' },
  { page: 'map',        icon: Map,       label: 'India Map' },
  { page: 'routes',     icon: Plane,     label: 'Route Explorer' },
  { page: 'insights',   icon: BarChart2, label: 'Market Insights' },
  { page: 'alerts',     icon: Bell,      label: 'Price Alerts', badge: '4' },
]

const analyticsNav: NavItem[] = [
  { page: 'government', icon: Building2, label: 'Gov Intelligence' },
  { page: 'methodology',icon: BookOpen,  label: 'Methodology' },
  { page: 'exports',    icon: Download,  label: 'Exports' },
]

const systemNav: NavItem[] = [
  { page: 'sources',    icon: Database,  label: 'Data Sources' },
  { page: 'collection', icon: Activity,  label: 'Collection' },
  { page: 'admin',      icon: Shield,    label: 'Admin Console' },
]

interface AppShellProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  children: ReactNode
}

export default function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-surface-canvas)' }}>
      <SidebarNavigation
        footer={
          <>
            <SidebarButton icon={<Users size={15} />} label="Team" onClick={() => {}} />
            <SidebarButton icon={<Settings size={15} />} label="Settings" onClick={() => {}} />
          </>
        }
      >
        <SidebarSection label="Public" />
        {publicNav.map(({ page, icon: Icon, label, badge }) => (
          <SidebarButton
            key={page}
            icon={<Icon size={15} />}
            label={label}
            badge={badge}
            active={currentPage === page}
            onClick={() => onNavigate(page)}
          />
        ))}

        <SidebarSection label="Analytics" />
        {analyticsNav.map(({ page, icon: Icon, label }) => (
          <SidebarButton
            key={page}
            icon={<Icon size={15} />}
            label={label}
            active={currentPage === page}
            onClick={() => onNavigate(page)}
          />
        ))}

        <SidebarSection label="System" />
        {systemNav.map(({ page, icon: Icon, label }) => (
          <SidebarButton
            key={page}
            icon={<Icon size={15} />}
            label={label}
            active={currentPage === page}
            onClick={() => onNavigate(page)}
          />
        ))}
      </SidebarNavigation>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            height: 48,
            padding: '0 var(--space-2xl)',
            background: 'var(--color-surface-bg)',
            borderBottom: '1px solid var(--color-border-primary)',
            gap: 'var(--space-xl)',
          }}
        >
          <SampleDataBanner />
          <div className="flex items-center shrink-0" style={{ gap: 'var(--space-md)' }}>
            <LiveIndicator />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto" style={{ padding: 'var(--space-2xl)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

function LiveIndicator() {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 'var(--space-xs)',
        padding: '3px var(--space-sm)',
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-success-bg)',
      }}
    >
      <span
        className="animate-pulse-dot"
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--color-success)',
          display: 'block',
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', fontFamily: 'var(--font-sans)', letterSpacing: '0.04em' }}>
        LIVE
      </span>
    </div>
  )
}
