import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'
import { methodologySteps } from '../data/sampleData'

type NodeStatus = 'ACTIVE' | 'BLOCKED' | 'PENDING' | 'CONNECTED'

interface StepMeta {
  status: NodeStatus
  statusDetail: string
  linkedSource?: string
}

const STEP_META: Record<number, StepMeta> = {
  1: { status: 'BLOCKED', statusDetail: 'All airfare sources returning CHALLENGE DETECTED — backend collector required', linkedSource: 'sources' },
  2: { status: 'PENDING', statusDetail: 'Pending real observations from acquisition stage' },
  3: { status: 'PENDING', statusDetail: 'Pending real observations — outlier detection inactive' },
  4: { status: 'PENDING', statusDetail: 'Pending real observations for normalisation pipeline' },
  5: { status: 'PENDING', statusDetail: 'Pending real observations — tax-strip tables loaded' },
  6: { status: 'PENDING', statusDetail: 'Pending T+1→T+45 observations per corridor' },
  7: { status: 'CONNECTED', statusDetail: 'DGCA traffic weights loaded (AllOrigins fetch)', linkedSource: 'government' },
  8: { status: 'PENDING', statusDetail: 'INDEX NOT PUBLISHED — insufficient matched-sample corridors (<15)' },
  9: { status: 'PENDING', statusDetail: 'STL decomposition inactive — no time series available' },
  10: { status: 'PENDING', statusDetail: 'Isolation Forest model not yet trained — awaiting observations' },
  11: { status: 'PENDING', statusDetail: 'Cross-source consensus unavailable — no active sources' },
  12: { status: 'PENDING', statusDetail: 'Freshness scoring inactive — no live corridors' },
}

const CATEGORY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  COLLECTION:  { label: 'COLLECTION',  color: 'var(--color-danger)',       bg: 'var(--color-danger-bg)' },
  PROCESSING:  { label: 'PROCESSING',  color: 'var(--color-info)',          bg: 'var(--color-info-bg)' },
  INDEXING:    { label: 'INDEXING',    color: 'var(--color-brand-primary)', bg: 'var(--color-brand-muted)' },
  VALIDATION:  { label: 'VALIDATION',  color: 'var(--color-success)',       bg: 'var(--color-success-bg)' },
}

const NODE_STATUS_STYLE: Record<NodeStatus, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  ACTIVE:    { icon: CheckCircle, color: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'ACTIVE' },
  BLOCKED:   { icon: XCircle,     color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  label: 'BLOCKED' },
  PENDING:   { icon: Clock,       color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'PENDING' },
  CONNECTED: { icon: CheckCircle, color: 'var(--color-info)',    bg: 'var(--color-info-bg)',    label: 'CONNECTED' },
}

const JEVONS = `P = Π (p_it / p_i0)^(1/n)

where:
  p_it   = fare for corridor i at time t
  p_i0   = base-period fare (January 2025 = 100)
  n      = matched corridors with obs. in both periods
  Π      = product over all matched corridors i

Published only when n ≥ 15.`

export default function Methodology() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]))

  function toggle(step: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(step) ? next.delete(step) : next.add(step)
      return next
    })
  }

  const categories = [...new Set(methodologySteps.map(s => s.category))]

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-2xl)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em' }}>Methodology</h1>
        <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 'var(--space-xs)', maxWidth: 520 }}>
          12-stage pipeline from raw fare ingestion to Jevons index publication. Node status reflects current collector state.
        </p>
      </div>

      {/* Pipeline status banner */}
      <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning)40', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-warning)', fontFamily: 'var(--font-sans)' }}>PIPELINE PAUSED — ACQUISITION BLOCKED</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 3 }}>
            Stage 1 (Collection) is blocked by bot-protection on all airline sources. Stages 2–12 are pending. Government data (Stage 7) is connected.
          </div>
        </div>
      </div>

      {/* Category legend */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
        {categories.map(cat => {
          const cs = CATEGORY_STYLE[cat] ?? { label: cat, color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)' }
          return (
            <span key={cat} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: cs.color, background: cs.bg, padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>
              {cs.label}
            </span>
          )
        })}
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-danger)', background: 'var(--color-danger-bg)', padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>BLOCKED</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-warning)', background: 'var(--color-warning-bg)', padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>PENDING</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-info)', background: 'var(--color-info-bg)', padding: '3px 8px', borderRadius: 'var(--radius-full)', fontFamily: 'var(--font-sans)' }}>CONNECTED</span>
      </div>

      {/* Pipeline accordion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', position: 'relative' }}>
        {/* Vertical connector line */}
        <div style={{ position: 'absolute', left: 22, top: 40, bottom: 40, width: 2, background: 'var(--color-border-primary)', zIndex: 0 }} />

        {methodologySteps.map((step) => {
          const meta = STEP_META[step.step] ?? { status: 'PENDING' as NodeStatus, statusDetail: '' }
          const ns = NODE_STATUS_STYLE[meta.status]
          const NodeIcon = ns.icon
          const cat = CATEGORY_STYLE[step.category] ?? { label: step.category, color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)' }
          const isOpen = expanded.has(step.step)
          return (
            <div key={step.step} style={{ position: 'relative', zIndex: 1 }}>
              <button
                onClick={() => toggle(step.step)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: 'transparent', padding: 0,
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)',
                }}
              >
                {/* Node circle */}
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', background: ns.bg, border: `2px solid ${ns.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                  <NodeIcon size={16} style={{ color: ns.color }} />
                </div>

                {/* Step content */}
                <div style={{ flex: 1, background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: `1px solid ${isOpen ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`, padding: 'var(--space-lg)', transition: 'border-color 150ms' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{String(step.step).padStart(2, '0')}</span>
                      <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>{step.title}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: cat.color, background: cat.bg, padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-sans)' }}>{cat.label}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: ns.color, background: ns.bg, padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-sans)' }}>{ns.label}</span>
                    </div>
                    {isOpen ? <ChevronDown size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />}
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                      <p style={{ fontSize: 'var(--text-body-size)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', lineHeight: 1.6, margin: 0 }}>{step.description}</p>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: ns.bg + '80', fontSize: 11, color: ns.color, fontFamily: 'var(--font-sans)' }}>
                        <NodeIcon size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                        {meta.statusDetail}
                      </div>
                      {meta.linkedSource && (
                        <div style={{ fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)' }}>
                          → See Data Sources for current source status
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </button>
            </div>
          )
        })}
      </div>

      {/* Jevons formula */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-md)' }}>JEVONS PRICE INDEX FORMULA</div>
        <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 2, whiteSpace: 'pre-wrap' }}>
          {JEVONS}
        </div>
      </div>
    </div>
  )
}
