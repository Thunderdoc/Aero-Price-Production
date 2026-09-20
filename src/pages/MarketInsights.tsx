import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import TrendIndicator from '../components/TrendIndicator'
import { corridors, carriers, priceHistoryData, bookingWindowData, recentAnomalies } from '../data/sampleData'

const card: React.CSSProperties = {
  background: 'var(--color-surface-bg)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-xl)',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid var(--color-border-primary)',
}

// Multi-line SVG chart
function MultiLineChart({ series, labels, width = 500, height = 180 }: {
  series: { name: string; data: number[]; color: string }[]
  labels: string[]
  width?: number
  height?: number
}) {
  const allValues = series.flatMap(s => s.data)
  const min = Math.min(...allValues) * 0.98
  const max = Math.max(...allValues) * 1.02
  const pad = { top: 12, right: 12, bottom: 28, left: 48 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom

  const toX = (i: number) => pad.left + (i / (labels.length - 1)) * w
  const toY = (v: number) => pad.top + h - ((v - min) / (max - min)) * h

  const ticks = 4
  const tickValues = Array.from({ length: ticks }, (_, i) => min + (max - min) * (i / (ticks - 1)))

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', maxWidth: '100%' }}>
      {/* Grid lines */}
      {tickValues.map(v => (
        <g key={v}>
          <line x1={pad.left} y1={toY(v)} x2={pad.left + w} y2={toY(v)} stroke="var(--color-border-primary)" strokeWidth={1} />
          <text x={pad.left - 6} y={toY(v) + 4} textAnchor="end" style={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            {v.toFixed(0)}
          </text>
        </g>
      ))}

      {/* Lines */}
      {series.map(s => {
        const pts = s.data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
        return (
          <polyline
            key={s.name}
            points={pts}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}

      {/* X labels */}
      {labels.map((l, i) => (
        i % Math.ceil(labels.length / 8) === 0 && (
          <text key={l} x={toX(i)} y={height - 4} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
            {l}
          </text>
        )
      ))}
    </svg>
  )
}

// Booking window bar chart
function WindowBars() {
  const data = bookingWindowData
  const max = Math.max(...data.map(d => d.avgFare))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
      {data.map(d => {
        const h = (d.avgFare / max) * 80
        const isOptimal = d.window >= 21 && d.window <= 30
        return (
          <div key={d.window} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div
              title={`${d.label}: ₹${d.avgFare.toLocaleString('en-IN')}`}
              style={{
                width: '100%', height: h,
                background: isOptimal ? 'var(--color-success)' : 'var(--color-brand-primary)',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                opacity: isOptimal ? 1 : 0.55,
                cursor: 'default',
                transition: 'opacity 150ms',
              }}
            />
            <span style={{ fontSize: 8, fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', lineHeight: 1, whiteSpace: 'nowrap' }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

type TabId = 'price' | 'carriers' | 'routes' | 'anomalies'

const TABS: { id: TabId; label: string }[] = [
  { id: 'price', label: 'Price History' },
  { id: 'carriers', label: 'Carrier Benchmarks' },
  { id: 'routes', label: 'Route Analysis' },
  { id: 'anomalies', label: 'Anomalies' },
]

export default function MarketInsights() {
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null)
  const [chartPeriod, setChartPeriod] = useState<'30' | '60' | '90'>('90')
  const [activeTab, setActiveTab] = useState<TabId>('price')

  const historySlice = chartPeriod === '30' ? priceHistoryData.slice(-30) : chartPeriod === '60' ? priceHistoryData.slice(-60) : priceHistoryData

  const priceSeries = [
    { name: 'DEL–BOM', data: historySlice.map(d => d.DEL_BOM), color: '#2563eb' },
    { name: 'DEL–BLR', data: historySlice.map(d => d.DEL_BLR), color: '#4f46e5' },
    { name: 'BOM–BLR', data: historySlice.map(d => d.BOM_BLR), color: '#0891b2' },
    { name: 'Index', data: historySlice.map(d => d.index * 55), color: '#d97706' },
  ]
  const historyLabels = historySlice.map(d => d.date.slice(5))

  const topRoutesByObs = [...corridors].sort((a, b) => b.observations - a.observations).slice(0, 8)
  const topRoutesByFare = [...corridors].sort((a, b) => b.currentFare - a.currentFare).slice(0, 5)

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: 1000 }}>

      {/* Header */}
      <div style={{ paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart2 size={18} style={{ color: 'white' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', marginBottom: 2 }}>
              MARKET INSIGHTS
            </div>
            <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Airfare trend analysis across Indian corridors
            </h1>
          </div>
        </div>
      </div>


      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border-primary)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              marginBottom: -2,
              color: activeTab === tab.id ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 500,
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
              transition: 'color var(--transition-fast), border-color var(--transition-fast)',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Price History Chart */}
      {activeTab === 'price' && <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }}>
        <div className="flex items-center justify-between flex-wrap" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>Price History</h2>
            <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 2 }}>Top routes vs all-India index · SAMPLE DATA</p>
          </div>
          <div className="flex" style={{ gap: 'var(--space-xs)' }}>
            {(['30', '60', '90'] as const).map(p => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                style={{
                  padding: '4px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-primary)',
                  background: chartPeriod === p ? 'var(--color-brand-primary)' : 'transparent',
                  color: chartPeriod === p ? 'white' : 'var(--color-text-secondary)',
                  fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', fontWeight: 500, cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                {p}D
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <MultiLineChart series={priceSeries} labels={historyLabels} width={680} height={200} />
        </div>
        <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)', marginTop: 'var(--space-md)' }}>
          {priceSeries.map(s => (
            <div key={s.name} className="flex items-center" style={{ gap: 'var(--space-xs)' }}>
              <span style={{ display: 'block', width: 24, height: 3, background: s.color, borderRadius: 2 }} />
              <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>{s.name}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'var(--space-lg)', paddingTop: 'var(--space-lg)', borderTop: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ap-badge ap-badge-info">KAGGLE 2019</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>Sample price data — connect live collectors to see real fares</span>
        </div>
      </div>}

      {/* Carriers tab */}
      {activeTab === 'carriers' && <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>

        {/* Carrier table */}
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)', flex: '3 1 340px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
              Carrier Benchmarks
            </h2>
            <span className="ap-badge ap-badge-info">KAGGLE 2019</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                  {['Carrier', 'Avg Fare', 'Share', 'On-Time', 'Routes'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-md)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {carriers.map(car => (
                  <tr
                    key={car.code}
                    onClick={() => setSelectedCarrier(selectedCarrier === car.code ? null : car.code)}
                    style={{
                      borderBottom: '1px solid var(--color-border-primary)',
                      cursor: 'pointer',
                      background: selectedCarrier === car.code ? 'var(--color-brand-muted)' : 'transparent',
                      transition: 'background 150ms',
                    }}
                    onMouseOver={e => { if (selectedCarrier !== car.code) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                    onMouseOut={e => { if (selectedCarrier !== car.code) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <div className="flex items-center" style={{ gap: 'var(--space-sm)' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: car.color, flexShrink: 0, display: 'block' }} />
                        <span style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, color: 'var(--color-text-primary)' }}>{car.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      ₹{car.avgFare.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <div className="flex items-center" style={{ gap: 'var(--space-sm)' }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-secondary)', overflow: 'hidden', minWidth: 50 }}>
                          <div style={{ height: '100%', width: `${car.marketShare}%`, background: car.color }} />
                        </div>
                        <span style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-secondary)', minWidth: 28 }}>{car.marketShare}%</span>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', color: car.onTimePerf >= 80 ? 'var(--color-success)' : car.onTimePerf >= 70 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                      {car.onTimePerf}%
                    </td>
                    <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)' }}>
                      {car.routes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Booking window */}
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)', flex: '2 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
              Booking Window
            </h2>
            <span className="ap-badge ap-badge-info">KAGGLE 2019</span>
          </div>
          <p style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Green</span> = optimal window (T+21–30)
          </p>
          <WindowBars />
          <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md) var(--space-lg)', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--color-success)' }}>
            <p style={{ fontSize: 'var(--text-caption-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-success)', marginBottom: 2 }}>Recommendation</p>
            <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
              Book 21–30 days ahead to save up to <strong>₹{(bookingWindowData[0].avgFare - bookingWindowData.find(d => d.window === 30)!.avgFare).toLocaleString('en-IN')}</strong> per fare.
            </p>
          </div>
        </div>
      </div>}

      {/* Routes tab */}
      {activeTab === 'routes' && <div className="flex flex-wrap" style={{ gap: 'var(--space-xl)' }}>

        {/* Routes by observation count */}
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)', flex: '3 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
              Routes by Coverage Volume
            </h2>
            <span className="ap-badge ap-badge-info">KAGGLE 2019</span>
          </div>
          <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
            {topRoutesByObs.map((r, i) => {
              const pct = (r.observations / topRoutesByObs[0].observations) * 100
              return (
                <div key={r.id} className="flex items-center" style={{ gap: 'var(--space-md)' }}>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', width: 18, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontSize: 'var(--text-body-size)', fontWeight: 500, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', minWidth: 90 }}>{r.from}–{r.to}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-surface-secondary)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-brand-primary)', borderRadius: 'var(--radius-full)' }} />
                  </div>
                  <span style={{ fontSize: 'var(--text-caption-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', minWidth: 52, textAlign: 'right' }}>
                    {r.observations.toLocaleString('en-IN')}
                  </span>
                  {r.trend === 'up' ? <TrendingUp size={12} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                    : r.trend === 'down' ? <TrendingDown size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                    : <Minus size={12} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Highest fares */}
        <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)', flex: '2 1 200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-lg)' }}>
            <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
              Priciest Routes
            </h2>
            <span className="ap-badge ap-badge-info">KAGGLE 2019</span>
          </div>
          <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
            {topRoutesByFare.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between" style={{ padding: 'var(--space-sm) var(--space-md)', background: i === 0 ? 'var(--color-danger-bg)' : 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex flex-col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 'var(--text-body-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                    {r.from} → {r.to}
                  </span>
                  <TrendIndicator direction={r.trend} value={Math.abs(r.change7d)} size="sm" />
                </div>
                <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                  ₹{r.currentFare.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {/* Anomalies tab */}
      {activeTab === 'anomalies' && <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 style={{ fontSize: 'var(--text-heading-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>Anomaly Detection Log</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ap-badge ap-badge-info">KAGGLE 2019</span>
            <Badge label={`${recentAnomalies.filter(a => !a.resolved).length} unresolved`} variant="warning" />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
                {['Route', 'Detected', 'Type', 'Actual', 'Expected', 'Deviation', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: 'var(--space-sm) var(--space-md)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-text-tertiary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentAnomalies.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border-primary)', transition: 'background 100ms' }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>{a.route}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-caption-size)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{a.detectedAt}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                    <Badge label={a.type} variant={a.type === 'SPIKE' ? 'danger' : a.type === 'DIP' ? 'success' : 'warning'} />
                  </td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', color: 'var(--color-text-primary)' }}>₹{a.fare.toLocaleString('en-IN')}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)' }}>₹{a.expectedFare.toLocaleString('en-IN')}</td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-body-size)', color: a.deviation > 0 ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                    {a.deviation > 0 ? '+' : ''}{(a.deviation * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                    <Badge label={a.resolved ? 'Resolved' : 'Active'} variant={a.resolved ? 'default' : 'warning'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Data provenance footer */}
      <div style={{ padding: '8px 0', borderTop: '1px solid var(--color-border-primary)', fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
        Fare data: Kaggle Indian Flight Prices dataset (10,683 obs · Mar–Jun 2019)
      </div>

    </div>
  )
}
