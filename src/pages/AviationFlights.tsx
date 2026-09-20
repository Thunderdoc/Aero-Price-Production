import { useState, useEffect } from 'react'
import { List, RefreshCw, Search, AlertTriangle, Clock } from 'lucide-react'
import { fetchAllCorridorFlights, type LiveFlight } from '../services/flightData'

const STATUS_ORDER = ['active','scheduled','landed','cancelled','diverted']

function statusMeta(s: string) {
  const m: Record<string, { color: string; label: string }> = {
    active:    { color:'var(--color-success)', label:'ACTIVE' },
    scheduled: { color:'var(--color-warning)', label:'SCHEDULED' },
    landed:    { color:'var(--color-info)',    label:'LANDED' },
    cancelled: { color:'var(--color-danger)',  label:'CANCELLED' },
    diverted:  { color:'#a78bfa',             label:'DIVERTED' },
  }
  return m[s] ?? { color:'var(--color-text-tertiary)', label:s.toUpperCase() }
}

export default function AviationFlights() {
  const [flights, setFlights] = useState<LiveFlight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [lastFetch, setLastFetch] = useState<Date|null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const results = await fetchAllCorridorFlights()
      const all = results.flatMap(r => r.flights)
      setFlights(all)
      if (results.every(r => r.source === 'UNAVAILABLE')) {
        setError(results[0]?.error ?? 'AviationStack unavailable')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
    setLastFetch(new Date())
  }

  useEffect(() => { load() }, [])

  const filtered = flights
    .filter(f => statusFilter === 'all' || f.status === statusFilter)
    .filter(f => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        f.flight_iata.toLowerCase().includes(q) ||
        f.airline_name.toLowerCase().includes(q) ||
        f.dep_iata.toLowerCase().includes(q) ||
        f.arr_iata.toLowerCase().includes(q)
      )
    })

  const statuses = ['all', ...STATUS_ORDER]

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'var(--font-sans)' }}>
      {/* Header */}
      <div style={{ padding:'16px 24px', flexShrink:0, borderBottom:'1px solid var(--color-border-primary)',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <List size={17} style={{ color:'var(--color-brand-primary)' }}/>
          <h1 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--color-text-primary)', letterSpacing:'-0.01em' }}>
            Flights
          </h1>
          <span style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>
            AviationStack · domestic India corridors
          </span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {lastFetch && (
            <span style={{ fontSize:11, color:'var(--color-text-tertiary)', display:'flex', alignItems:'center', gap:4 }}>
              <Clock size={11}/>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
          <button onClick={load} disabled={loading}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8,
              border:'1px solid var(--color-border-primary)', background:'var(--color-surface-secondary)',
              fontSize:11, color:'var(--color-text-secondary)', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1, fontFamily:'var(--font-sans)' }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding:'8px 24px', flexShrink:0, display:'flex', alignItems:'center', gap:8,
          background:'var(--color-warning-bg)', borderBottom:'1px solid rgba(217,119,6,0.2)' }}>
          <AlertTriangle size={13} style={{ color:'var(--color-warning)' }}/>
          <span style={{ fontSize:11, color:'var(--color-warning)' }}>{error}</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ padding:'12px 24px', flexShrink:0, borderBottom:'1px solid var(--color-border-primary)',
        display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 10px',
          background:'var(--color-surface-secondary)', borderRadius:8, border:'1px solid var(--color-border-primary)',
          flex:1, maxWidth:260 }}>
          <Search size={13} style={{ color:'var(--color-text-tertiary)' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search flight, airline, route…"
            style={{ border:'none', background:'none', outline:'none', fontSize:12,
              color:'var(--color-text-primary)', width:'100%', fontFamily:'var(--font-sans)' }}/>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {statuses.map(s => {
            const meta = s==='all' ? { color:'var(--color-text-secondary)', label:'ALL' } : statusMeta(s)
            return (
              <button key={s} onClick={()=>setStatusFilter(s)}
                style={{ padding:'5px 12px', borderRadius:7, cursor:'pointer', fontFamily:'var(--font-sans)',
                  fontSize:11, fontWeight:600, letterSpacing:'0.05em',
                  border: statusFilter===s ? `1px solid ${meta.color}` : '1px solid var(--color-border-primary)',
                  background: statusFilter===s ? `${meta.color}18` : 'var(--color-surface-secondary)',
                  color: statusFilter===s ? meta.color : 'var(--color-text-tertiary)',
                  transition:'all 0.12s' }}>
                {meta.label}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize:11, color:'var(--color-text-tertiary)', marginLeft:'auto' }}>
          {filtered.length} of {flights.length}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {flights.length === 0 && !loading ? (
          <div style={{ padding:40, textAlign:'center', color:'var(--color-text-tertiary)' }}>
            <p style={{ margin:0, fontSize:13 }}>
              {error ? 'Could not load flights from AviationStack.' : 'No flights loaded yet.'}
            </p>
            <p style={{ margin:'8px 0 0', fontSize:11 }}>
              AviationStack free tier returns scheduled flight data for configured routes.
            </p>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:'var(--color-surface-secondary)' }}>
                {['Flight','Airline','Route','Departure','Arrival','Status'].map(h => (
                  <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontSize:10, fontWeight:700,
                    color:'var(--color-text-tertiary)', letterSpacing:'0.07em',
                    borderBottom:'1px solid var(--color-border-primary)', whiteSpace:'nowrap' }}>
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const meta = statusMeta(f.status)
                return (
                  <tr key={`${f.flight_iata}-${i}`}
                    style={{ borderBottom:'1px solid var(--color-border-primary)',
                      background: i%2===0 ? 'transparent' : 'var(--color-surface-canvas)' }}>
                    <td style={{ padding:'10px 16px', fontSize:13, fontWeight:700,
                      color:'var(--color-text-primary)', fontFamily:'var(--font-mono)' }}>
                      {f.flight_iata || '—'}
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:12, color:'var(--color-text-secondary)' }}>
                      {f.airline_name || f.airline_iata || '—'}
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)',
                      color:'var(--color-text-primary)', fontWeight:600 }}>
                      {f.dep_iata} → {f.arr_iata}
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)',
                      color:'var(--color-text-secondary)' }}>
                      <div>{f.dep_scheduled ? new Date(f.dep_scheduled).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</div>
                      {f.dep_actual && (
                        <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>
                          Actual: {new Date(f.dep_actual).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:12, fontFamily:'var(--font-mono)',
                      color:'var(--color-text-secondary)' }}>
                      <div>{f.arr_scheduled ? new Date(f.arr_scheduled).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</div>
                      {f.arr_actual && (
                        <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>
                          Actual: {new Date(f.arr_actual).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <span style={{ fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:99,
                        color: meta.color, background:`${meta.color}18`,
                        border:`1px solid ${meta.color}44`, letterSpacing:'0.08em' }}>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
