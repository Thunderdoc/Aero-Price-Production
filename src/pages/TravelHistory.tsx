import { useEffect, useState } from 'react'
import { ArrowRight, Bookmark, CalendarDays, Clock3, Plane, Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { Page } from '../components/AppShell'

type RouteActivity = { id: string; route: string; searchedAt: string; travelDate: string | null; resultCount: number }
type PriceAlert = { id: string; route: string; targetFare: number; createdAt: string }

function readList<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

function dateTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function TravelHistory({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user } = useAuth()
  const [activity, setActivity] = useState<RouteActivity[]>([])
  const [alerts, setAlerts] = useState<PriceAlert[]>([])

  useEffect(() => {
    const refresh = () => {
      const email = user?.email ?? 'anonymous'
      setActivity(readList<RouteActivity>(`aeroprice_route_activity:${email}`))
      setAlerts(readList<PriceAlert>(`aeroprice_price_alerts:${email}`))
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [user?.email])

  return <div className="page-enter" style={{ maxWidth: 980, display: 'grid', gap: 18 }}>
    <section style={{ padding: '24px 26px', borderRadius: 16, background: 'linear-gradient(125deg, #0a1c38, #124a91)', color: '#fff', boxShadow: '0 14px 30px rgba(16,54,109,.20)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b9d9ff', fontSize: 11, fontWeight: 800, letterSpacing: '.12em' }}><Clock3 size={15} /> YOUR TRAVEL HISTORY</div>
      <h1 style={{ margin: '10px 0 6px', fontSize: 27, letterSpacing: '-.03em' }}>Your route activity, in one place.</h1>
      <p style={{ maxWidth: 620, margin: 0, color: '#dbeafe', fontSize: 13, lineHeight: 1.55 }}>View the route searches made from Route Explorer and the alerts you have saved. Only actions performed in this account and browser appear here.</p>
      <button onClick={() => onNavigate('routes')} style={{ marginTop: 17, border: 0, borderRadius: 9, padding: '10px 14px', background: '#fff', color: '#165ec9', fontWeight: 800, cursor: 'pointer' }}><Search size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Explore a route <ArrowRight size={14} style={{ verticalAlign: 'middle', marginLeft: 5 }} /></button>
    </section>

    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
      {[{ icon: Search, label: 'Route searches', value: activity.length }, { icon: Bookmark, label: 'Saved alerts', value: alerts.length }, { icon: CalendarDays, label: 'Latest activity', value: activity[0] ? new Date(activity[0].searchedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—' }].map(({ icon: Icon, label, value }) => <div key={label} style={{ padding: 16, borderRadius: 13, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)' }}><Icon size={17} color="#1769e8" /><div style={{ marginTop: 10, fontSize: 20, fontWeight: 850, color: 'var(--color-text-primary)' }}>{value}</div><div style={{ marginTop: 3, color: 'var(--color-text-secondary)', fontSize: 11 }}>{label}</div></div>)}
    </section>

    <section style={{ padding: 18, borderRadius: 14, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><div><h2 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 17 }}>Recent route searches</h2><p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 12 }}>Recorded when you load verified fares in Route Explorer.</p></div><Plane size={19} color="#1769e8" /></div>
      {activity.length ? <div style={{ display: 'grid', marginTop: 13 }}>{activity.slice(0, 12).map(item => <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--color-border-primary)' }}><span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 9, color: '#1769e8', background: 'var(--color-brand-muted)' }}><Plane size={15} /></span><div><b style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{item.route.replace('-', ' → ')}</b><div style={{ marginTop: 3, color: 'var(--color-text-secondary)', fontSize: 11 }}>{item.travelDate ? `Travel date ${item.travelDate}` : 'All recorded travel dates'} · {item.resultCount} verified records</div></div><time style={{ color: 'var(--color-text-tertiary)', fontSize: 10 }}>{dateTime(item.searchedAt)}</time></div>)}</div> : <EmptyState onClick={() => onNavigate('routes')} />}
    </section>

    <section style={{ padding: 18, borderRadius: 14, border: '1px solid var(--color-border-primary)', background: 'var(--color-surface-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} color="#159669" /><div><h2 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 17 }}>Your saved price alerts</h2><p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 12 }}>Alerts are kept separately from the verified market feed.</p></div></div>
      {alerts.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: 10, marginTop: 14 }}>{alerts.map(alert => <div key={alert.id} style={{ padding: 13, borderRadius: 10, background: 'var(--color-surface-secondary)' }}><b style={{ color: 'var(--color-text-primary)', fontSize: 13 }}>{alert.route.replace('-', ' → ')}</b><div style={{ marginTop: 7, color: 'var(--color-text-secondary)', fontSize: 11 }}>Target below ₹{alert.targetFare.toLocaleString('en-IN')}</div><div style={{ marginTop: 4, color: 'var(--color-text-tertiary)', fontSize: 10 }}>Created {dateTime(alert.createdAt)}</div></div>)}</div> : <div style={{ marginTop: 14, padding: 14, borderRadius: 9, color: 'var(--color-text-secondary)', background: 'var(--color-surface-secondary)', fontSize: 12 }}>No saved alerts. Price Alerts become available after your administrator approves access.</div>}
    </section>
  </div>
}

function EmptyState({ onClick }: { onClick: () => void }) {
  return <div style={{ marginTop: 14, padding: '30px 14px', borderRadius: 11, border: '1px dashed var(--color-border-secondary)', textAlign: 'center' }}><Search size={22} color="var(--color-text-tertiary)" /><div style={{ marginTop: 8, color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 800 }}>No route activity yet</div><p style={{ margin: '4px 0 12px', color: 'var(--color-text-secondary)', fontSize: 11 }}>Search a route to begin building your personal travel history.</p><button onClick={onClick} style={{ border: 0, background: 'none', color: '#1769e8', fontWeight: 800, cursor: 'pointer' }}>Open Route Explorer →</button></div>
}
