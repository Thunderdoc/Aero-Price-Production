import { useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ChevronDown, ChevronRight, Shield } from 'lucide-react'
import StatusBadge from '../components/StatusBadge'
import TrendIndicator from '../components/TrendIndicator'
import DataFreshness from '../components/DataFreshness'
import { LineChart } from '../components/MiniChart'
import {
  indexValue, indexChange7d, indexChange30d, totalObservations,
  activeSources, corridors, regionalData, routeWeights, priceHistoryData
} from '../data/sampleData'

type DrillLevel = 'national' | 'regional' | 'corridor'

export default function GovernmentIntelligence() {
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('national')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)

  const benchmarkSeries = [
    { name: 'AeroPrice Index', data: [108.2, 110.4, 111.9, 113.1, 114.8, 115.85], color: '#5250f3' },
    { name: 'MoSPI Reference', data: [107.5, 109.8, 111.2, 112.4, 114.0, 114.9], color: '#f59e0b' },
  ]
  const benchmarkLabels = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']

  const qualityMetrics = [
    { label: 'Valid Observations', value: totalObservations.toLocaleString('en-IN'), status: 'success', pct: '96.4%' },
    { label: 'Rejected Observations', value: '764', status: 'warning', pct: '3.6%' },
    { label: 'Duplicates Removed', value: '218', status: 'default', pct: '1.0%' },
    { label: 'Missing Fares', value: '43', status: 'default', pct: '0.2%' },
    { label: 'Outliers Flagged', value: '31', status: 'warning', pct: '0.1%' },
    { label: 'Stale Sources', value: '1', status: 'danger', pct: 'SpiceJet' },
    { label: 'Source Failures', value: '0', status: 'success', pct: 'None' },
    { label: 'Low Coverage Corridors', value: '1', status: 'warning', pct: 'BOM-CCU' },
  ]

  return (
    <div className="flex flex-col gap-xl max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-lg">
        <div>
          <div className="flex items-center gap-sm mb-sm">
            <Shield size={16} className="text-brand-primary" />
            <Badge label="GOVERNMENT INTELLIGENCE" variant="brand" />
          </div>
          <h1 className="text-title text-text-primary">Government Airfare Intelligence</h1>
          <p className="text-label-sm text-text-secondary mt-xs max-w-xl">
            High-frequency airfare observations for statistical analysis, benchmarking and early market visibility.
          </p>
        </div>
        <StatusBadge status="sample" />
      </div>

      {/* KPI header */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <div className="grid gap-lg flex-wrap" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {[
            { label: 'ALL-INDIA INDEX', value: indexValue.toFixed(2), sub: 'Base: 100' },
            { label: '7D CHANGE', value: `+${indexChange7d.toFixed(2)}%`, sub: 'vs last week', trend: 'up' as const },
            { label: '30D CHANGE', value: `+${indexChange30d.toFixed(2)}%`, sub: 'vs last month', trend: 'up' as const },
            { label: 'OBSERVATIONS', value: totalObservations.toLocaleString('en-IN'), sub: 'Total validated' },
            { label: 'CORRIDORS', value: corridors.length.toString(), sub: 'Monitored routes' },
            { label: 'SOURCES', value: activeSources.toString(), sub: 'Active collectors' },
            { label: 'FRESHNESS', value: '18 min', sub: 'Since last obs.', fresh: true },
          ].map(({ label, value, sub, trend, fresh }) => (
            <div key={label} className="flex flex-col gap-xs">
              <span className="text-video-title text-text-tertiary">{label}</span>
              <span className={`text-heading font-semibold ${fresh ? 'text-success' : 'text-text-primary'}`}>{value}</span>
              {trend
                ? <TrendIndicator direction={trend} value={parseFloat(value)} size="sm" />
                : <span className="text-video-title text-text-tertiary">{sub}</span>
              }
            </div>
          ))}
        </div>
      </div>

      {/* Index hierarchy drill-down */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <div className="flex items-center justify-between mb-lg flex-wrap gap-md">
          <h2 className="text-heading text-text-primary">Index Hierarchy</h2>
          <div className="flex items-center gap-sm text-video-title text-text-tertiary">
            <button
              onClick={() => setDrillLevel('national')}
              className={`px-sm py-xs rounded-corner-md transition-all ${drillLevel === 'national' ? 'bg-brand-secondary text-text-primary' : 'hover:bg-surface-hover text-text-secondary'}`}
            >
              All India
            </button>
            <ChevronRight size={12} />
            <button
              onClick={() => setDrillLevel('regional')}
              className={`px-sm py-xs rounded-corner-md transition-all ${drillLevel === 'regional' ? 'bg-brand-secondary text-text-primary' : 'hover:bg-surface-hover text-text-secondary'}`}
            >
              Regions
            </button>
            <ChevronRight size={12} />
            <button
              onClick={() => setDrillLevel('corridor')}
              className={`px-sm py-xs rounded-corner-md transition-all ${drillLevel === 'corridor' ? 'bg-brand-secondary text-text-primary' : 'hover:bg-surface-hover text-text-secondary'}`}
            >
              Corridors
            </button>
          </div>
        </div>

        {drillLevel === 'national' && (
          <div className="flex items-center gap-xl p-lg bg-bg-faint rounded-corner-md">
            <div className="flex flex-col gap-xs">
              <span className="text-video-title text-text-tertiary">ALL INDIA</span>
              <span className="text-title font-semibold text-text-primary">{indexValue.toFixed(2)}</span>
            </div>
            <div className="flex-1 flex gap-lg flex-wrap">
              <div><span className="text-video-title text-text-tertiary">7D </span>
                <TrendIndicator direction="up" value={indexChange7d} size="sm" /></div>
              <div><span className="text-video-title text-text-tertiary">30D </span>
                <TrendIndicator direction="up" value={indexChange30d} size="sm" /></div>
              <div><span className="text-video-title text-text-tertiary">Coverage: </span>
                <span className="text-label-sm text-text-primary">91%</span></div>
            </div>
            <Button variant="subtle" onClick={() => setDrillLevel('regional')}
              iconEnd={<ChevronDown size={16} />}>Drill to Regions</Button>
          </div>
        )}

        {drillLevel === 'regional' && (
          <div className="flex flex-col gap-md">
            {regionalData.map(r => (
              <div
                key={r.region}
                className={`flex items-center gap-xl p-lg rounded-corner-md cursor-pointer transition-all duration-200 ${selectedRegion === r.region ? 'bg-brand-secondary' : 'bg-bg-faint hover:bg-bg-subtle'}`}
                onClick={() => { setSelectedRegion(r.region); setDrillLevel('corridor') }}
              >
                <div className="w-20">
                  <span className="text-label font-medium text-text-primary">{r.region}</span>
                </div>
                <div className="text-heading font-semibold text-text-primary w-20">₹{r.avgFare.toLocaleString('en-IN')}</div>
                <TrendIndicator direction={r.change7d > 0.5 ? 'up' : r.change7d < -0.5 ? 'down' : 'stable'} value={Math.abs(r.change7d)} size="sm" />
                <span className="text-video-title text-text-tertiary ml-auto">{r.routeCount} routes · {r.observations.toLocaleString('en-IN')} obs</span>
                <ChevronRight size={14} className="text-text-tertiary" />
              </div>
            ))}
          </div>
        )}

        {drillLevel === 'corridor' && (
          <div className="flex flex-col gap-md">
            {corridors.map(c => (
              <div key={c.id} className="flex items-center gap-xl p-md bg-bg-faint rounded-corner-md">
                <div className="w-24 text-label-sm font-medium text-text-primary">{c.from} → {c.to}</div>
                <div className="text-label-sm text-text-primary w-24">₹{c.currentFare.toLocaleString('en-IN')}</div>
                <TrendIndicator direction={c.trend} value={Math.abs(c.change7d)} size="sm" />
                <DataFreshness minutesAgo={c.freshness} className="ml-auto" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Route weights */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <div className="mb-lg">
          <h2 className="text-heading text-text-primary">Route Weights</h2>
          <p className="text-label-sm text-text-secondary mt-xs">
            Route weights are methodology inputs traceable to DGCA annual traffic data. Weights sum to 1.000.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-label-sm" role="table">
            <thead>
              <tr className="border-b border-border-primary">
                {['Route', 'Weight', 'Source', 'Version', 'Effective Date'].map(h => (
                  <th key={h} className="text-left py-sm pr-lg text-video-title text-text-tertiary font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {routeWeights.map(w => (
                <tr key={w.route} className="border-b border-border-primary hover:bg-surface-hover transition-colors">
                  <td className="py-sm pr-lg text-text-primary font-medium">{w.route}</td>
                  <td className="py-sm pr-lg text-text-primary">{w.weight.toFixed(3)}</td>
                  <td className="py-sm pr-lg text-text-secondary">{w.source}</td>
                  <td className="py-sm pr-lg text-text-secondary">{w.version}</td>
                  <td className="py-sm text-text-secondary">{w.effectiveDate}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border-primary">
                <td className="py-sm pr-lg text-text-primary font-semibold">Total</td>
                <td className="py-sm pr-lg text-text-primary font-semibold">
                  {routeWeights.reduce((s, w) => s + w.weight, 0).toFixed(3)}
                </td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Benchmark */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <div className="mb-lg">
          <h2 className="text-heading text-text-primary">Benchmark vs Official Reference</h2>
          <p className="text-label-sm text-text-secondary mt-xs">
            AeroPrice Index compared to MoSPI CPI Transport sub-index. Values are SAMPLE DATA.
          </p>
        </div>
        <LineChart series={benchmarkSeries} labels={benchmarkLabels} width={560} height={160} />
        <div className="flex items-center gap-xl mt-md flex-wrap">
          {benchmarkSeries.map(s => (
            <div key={s.name} className="flex items-center gap-xs">
              <div className="w-4 h-0.5 rounded" style={{ backgroundColor: s.color }} />
              <span className="text-video-title text-text-secondary">{s.name}</span>
            </div>
          ))}
          <span className="text-video-title text-text-tertiary">
            Directional correlation: 0.94 (SAMPLE) · Period: Apr–Sep 2026
          </span>
        </div>
      </div>

      {/* Data quality */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <h2 className="text-heading text-text-primary mb-lg">Data Quality Dashboard</h2>
        <div className="grid gap-md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {qualityMetrics.map(m => (
            <div key={m.label} className="flex items-center justify-between p-md bg-bg-faint rounded-corner-md">
              <div className="flex flex-col gap-xs">
                <span className="text-video-title text-text-tertiary">{m.label}</span>
                <span className="text-label font-medium text-text-primary">{m.value}</span>
                <span className="text-video-title text-text-tertiary">{m.pct}</span>
              </div>
              <Badge
                label={m.status === 'success' ? '✓' : m.status === 'warning' ? '!' : m.status === 'danger' ? '✗' : '–'}
                variant={m.status as any}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
