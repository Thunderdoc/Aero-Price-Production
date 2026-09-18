import type { ReactNode } from 'react'
import {
  Home, Map, Plane, Building2, Database,
  BarChart2, BookOpen, Download, Settings, User
} from 'lucide-react'
import { SidebarNavigation, SidebarButton } from './ui/Sidebar'
import SampleDataBanner from './SampleDataBanner'

export type Page =
  | 'overview' | 'map' | 'routes' | 'government'
  | 'sources' | 'collection' | 'methodology' | 'exports'

const navItems: { page: Page; icon: typeof Home; label: string }[] = [
  { page: 'overview',    icon: Home,      label: 'Overview' },
  { page: 'map',         icon: Map,       label: 'Airfare Map' },
  { page: 'routes',      icon: Plane,     label: 'Route Explorer' },
  { page: 'government',  icon: Building2, label: 'Government Intelligence' },
  { page: 'sources',     icon: Database,  label: 'Data Sources' },
  { page: 'collection',  icon: BarChart2, label: 'Collection' },
  { page: 'methodology', icon: BookOpen,  label: 'Methodology' },
  { page: 'exports',     icon: Download,  label: 'Exports' },
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
            <SidebarButton icon={<Settings size={18} />} label="Settings" onClick={() => {}} />
            <SidebarButton icon={<User size={18} />} label="Profile" onClick={() => {}} />
          </>
        }
      >
        {navItems.map(({ page, icon: Icon, label }) => (
          <SidebarButton
            key={page}
            icon={<Icon size={18} />}
            label={label}
            active={currentPage === page}
            onClick={() => onNavigate(page)}
          />
        ))}
      </SidebarNavigation>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <SampleDataBanner />
        <main className="flex-1 overflow-y-auto p-[var(--space-2xl)]">
          {children}
        </main>
      </div>
    </div>
  )
}
