import { useState } from 'react'
import { ChevronDown, ChevronRight, BookOpen, GitBranch, ShieldCheck } from 'lucide-react'
import type { Page } from '../components/AppShell'

type MethodologyStep = { step: number; title: string; description: string; category: string }

const methodologySteps: MethodologyStep[] = [
  { step: 1, title: 'Source Registry', description: 'The backend records configured and public-interface sources separately. The no-key Google Flights connector is unofficial and can fail when the public interface changes. Blocked, stale, and unconfigured sources are not labelled live.', category: 'COLLECTION' },
  { step: 2, title: 'Normalization and Deduplication', description: 'Provider responses are normalized into the fare observation schema and duplicate fingerprints are removed before a row can enter the analytical path.', category: 'PROCESSING' },
  { step: 3, title: 'Provenance Gate', description: 'REAL and OFFICIAL observations can enter production analytics. Generated test fixtures and sandbox responses are excluded from the live fare, index, forecast, and anomaly endpoints.', category: 'VALIDATION' },
  { step: 4, title: 'Booking Window and Cabin Buckets', description: 'Verified observations are grouped by route, advance-days window, and cabin so displayed medians and comparisons are calculated from the selected backend slice.', category: 'PROCESSING' },
  { step: 5, title: 'Route and Fare Summaries', description: 'Route cards, fare ranges, movements, exports, and source counts are calculated from persisted observations returned by the backend; missing history is displayed as unavailable.', category: 'INDEXING' },
  { step: 6, title: 'Matched-Sample Index', description: 'The index endpoint publishes a value only when the backend confirms enough matched REAL/OFFICIAL corridor observations. Otherwise it returns an explicit no-data state.', category: 'INDEXING' },
  { step: 7, title: 'Backend Anomaly Detection', description: 'Anomaly results are produced by the backend detector from eligible persisted observations. The interface does not invent expected fares, causes, deviations, or scores.', category: 'VALIDATION' },
  { step: 8, title: 'Freshness and Health', description: 'Health and source status distinguish a connected database, stored observations, and currently live provider data. Historical rows are never presented as live.', category: 'VALIDATION' },
]

type NodeStatus = 'DOCUMENTED'

interface StepMeta {
  status: NodeStatus
  statusDetail: string
  linkedSource?: string
}

const STEP_META: Record<number, StepMeta> = {
  1: { status: 'DOCUMENTED', statusDetail: 'Current provider availability is shown in Data Sources.', linkedSource: 'sources' },
  2: { status: 'DOCUMENTED', statusDetail: 'The backend normalizes and deduplicates eligible observations.' },
  3: { status: 'DOCUMENTED', statusDetail: 'Production provenance filtering is enforced by the backend.' },
  4: { status: 'DOCUMENTED', statusDetail: 'Groups are calculated from returned observations.' },
  5: { status: 'DOCUMENTED', statusDetail: 'Missing history is shown as unavailable.' },
  6: { status: 'DOCUMENTED', statusDetail: 'Publication requires at least ten matched corridors.' },
  7: { status: 'DOCUMENTED', statusDetail: 'Detector output depends on eligible persisted observations.' },
  8: { status: 'DOCUMENTED', statusDetail: 'See Data Sources for current freshness.', linkedSource: 'sources' },
}

const CATEGORY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  COLLECTION:  { label: 'COLLECTION',  color: 'var(--color-brand-primary)', bg: 'rgba(37,99,235,0.12)' },
  PROCESSING:  { label: 'PROCESSING',  color: 'var(--color-info)',          bg: 'var(--color-info-bg)' },
  INDEXING:    { label: 'INDEXING',    color: 'var(--color-brand-primary)', bg: 'var(--color-brand-muted)' },
  VALIDATION:  { label: 'VALIDATION',  color: 'var(--color-success)',       bg: 'var(--color-success-bg)' },
}

const NODE_STATUS_STYLE: Record<NodeStatus, { icon: typeof BookOpen; color: string; bg: string; label: string }> = {
  DOCUMENTED: { icon: BookOpen, color: 'var(--color-info)', bg: 'var(--color-info-bg)', label: 'METHOD' },
}

const JEVONS = `P = Π (p_it / p_i0)^(1/n)

where:
  p_it   = fare for corridor i at time t (current period)
  p_i0   = median fare on the first verified collection day
  n      = matched corridors with observations in both periods
  Π      = geometric product over all matched corridors i

The index is published only when the backend confirms the required matched REAL/OFFICIAL observations.
Current backend collection uses equal weights (1.0) for each route. This is an AeroPrice sample index, not an official DGCA or MoSPI index.`

export default function Methodology({ onNavigate }: { onNavigate?: (page: Page) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1, 7, 8]))

  function toggle(step: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(step) ? next.delete(step) : next.add(step)
      return next
    })
  }

  const categories = [...new Set(methodologySteps.map(s => s.category))]

  return (
    <div className="flex flex-col page-enter" style={{ gap: 'var(--space-2xl)' }}>

      {/* Dark hero header */}
      <div style={{
        background: 'var(--gradient-hero-dark)', borderRadius: 'var(--radius-xl)',
        overflow: 'hidden', position: 'relative', padding: '24px 28px',
        boxShadow: '0 16px 40px rgba(8,14,26,0.3)', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '32px 32px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(37,99,235,0.15)', filter: 'blur(50px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GitBranch size={13} color="white" />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(147,197,253,0.7)', letterSpacing: '0.14em', fontFamily: 'var(--font-mono)' }}>8-STAGE PIPELINE · BACKEND METHOD</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.92)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.025em', margin: 0, marginBottom: 4 }}>
            Collection &amp; Processing Pipeline
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-sans)', margin: 0 }}>
            End-to-end statistical methodology behind the AeroPrice India Airfare Index
          </p>
        </div>
      </div>

      {/* Pipeline status banner */}
      <div style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--color-success-bg)', border: '1px solid rgba(22,163,74,0.3)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <ShieldCheck size={18} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-info)', fontFamily: 'var(--font-sans)' }}>BACKEND DATA CONTRACT — NOT A LIVE STATUS REPORT</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', marginTop: 3, lineHeight: 1.5 }}>
            This page documents how the backend processes data. Check Data Sources and the index page for current availability and publication status.
          </div>
        </div>
      </div>

      {/* Category legend */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
        {categories.map(cat => {
          const cs = CATEGORY_STYLE[cat] ?? { label: cat, color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)' }
          return (
            <span key={cat} className="ap-badge" style={{ background: cs.bg, color: cs.color }}>
              {cs.label}
            </span>
          )
        })}
        <span className="ap-badge" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>{methodologySteps.length} BACKEND RULES</span>
      </div>

      {/* Pipeline accordion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', position: 'relative' }}>
        {/* Vertical connector line */}
        <div style={{ position: 'absolute', left: 22, top: 40, bottom: 40, width: 2, background: 'var(--color-border-primary)', zIndex: 0 }} />

        {methodologySteps.map((step) => {
          const meta = STEP_META[step.step]
          const ns = NODE_STATUS_STYLE[meta.status]
          const NodeIcon = ns.icon
          const cat = CATEGORY_STYLE[step.category] ?? { label: step.category, color: 'var(--color-text-tertiary)', bg: 'var(--color-surface-secondary)' }
          const isOpen = expanded.has(step.step)
          return (
            <div key={step.step} style={{ position: 'relative', zIndex: 1 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(step.step)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggle(step.step)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: 'transparent', padding: 0,
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--space-md)',
                }}
              >
                {/* Node circle */}
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '50%', background: ns.bg, border: `2px solid ${ns.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
                  <NodeIcon size={16} style={{ color: ns.color }} />
                </div>

                {/* Step content */}
                <div style={{ flex: 1, background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', borderTop: `1px solid ${isOpen ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`, borderRight: `1px solid ${isOpen ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`, borderBottom: `1px solid ${isOpen ? 'var(--color-brand-primary)' : 'var(--color-border-primary)'}`, borderLeft: `3px solid ${ns.color}`, padding: 'var(--space-lg)', transition: 'border-color 150ms' }}>
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
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: ns.bg, fontSize: 11, color: ns.color, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                        <NodeIcon size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                        {meta.statusDetail}
                      </div>
                      {meta.linkedSource && onNavigate && (
                        <button
                          onClick={() => onNavigate(meta.linkedSource as Page)}
                          style={{ fontSize: 11, color: 'var(--color-brand-primary)', fontFamily: 'var(--font-sans)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, textAlign:'left' }}>
                          → View {meta.linkedSource === 'sources' ? 'Data Sources' : 'Government Intelligence'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Jevons formula */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border-primary)', padding: 'var(--space-xl)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginBottom: 'var(--space-md)' }}>AEROPRICE MATCHED-SAMPLE JEVONS FORMULA (NOT AN OFFICIAL INDEX)</div>
        <div style={{ background: 'var(--color-surface-dark)', color: 'rgba(255,255,255,0.85)', borderRadius: 'var(--radius-md)', padding: 'var(--space-xl)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 2, whiteSpace: 'pre-wrap' }}>
          {JEVONS}
        </div>
      </div>
    </div>
  )
}
