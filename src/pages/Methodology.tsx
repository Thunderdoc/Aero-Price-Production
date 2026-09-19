import { useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { methodologySteps } from '../data/sampleData'

const CATEGORY_COLORS: Record<string, string> = {
  COLLECTION:   'var(--color-brand-primary)',
  PROCESSING:   'var(--color-indigo)',
  INDEXING:     'var(--color-teal)',
  VALIDATION:   'var(--color-warning)',
  DISTRIBUTION: 'var(--color-success)',
}

const CATEGORY_VARIANTS: Record<string, 'brand' | 'info' | 'success' | 'warning' | 'default'> = {
  COLLECTION:   'brand',
  PROCESSING:   'info',
  INDEXING:     'info',
  VALIDATION:   'warning',
  DISTRIBUTION: 'success',
}

export default function Methodology() {
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  const toggle = (step: number) => setExpandedStep(v => v === step ? null : step)

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)', maxWidth: '640px' }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-title-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
          Methodology
        </h1>
        <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)', maxWidth: 520 }}>
          Interactive pipeline from raw source collection to published all-India airfare price index. Click any stage to expand.
        </p>
      </div>

      {/* Jevons formula */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-xl)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }}>
        <h2 style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-md)' }}>
          Core Index Formula — Jevons
        </h2>
        <div style={{ background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-body-size)', color: 'var(--color-text-primary)' }}>
          P<sub>J</sub> = ( ∏ p<sub>i</sub> / p<sub>0</sub> )<sup>1/n</sup> × 100
        </div>
        <div style={{ marginTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>
            Where p<sub>i</sub> = current period fare, p<sub>0</sub> = base period fare, n = number of observations.
          </p>
          <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)' }}>
            Route-level relatives are weighted by DGCA annual passenger traffic shares and aggregated via weighted geometric mean.
          </p>
        </div>
      </div>

      {/* Category legend */}
      <div className="flex flex-wrap" style={{ gap: 'var(--space-sm)' }}>
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div key={cat} className="flex items-center" style={{ gap: 'var(--space-xs)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'block', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', fontWeight: 500, letterSpacing: '0.06em' }}>{cat}</span>
          </div>
        ))}
      </div>

      {/* Pipeline steps */}
      <div style={{ background: 'var(--color-surface-bg)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-border-primary)' }}>
        <div style={{ padding: 'var(--space-xl)', paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--color-border-primary)' }}>
          <h2 style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
            Data Pipeline
          </h2>
          <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)' }}>
            {methodologySteps.length} stages from source to publication.
          </p>
        </div>

        <div className="flex flex-col">
          {methodologySteps.map((step, i) => {
            const isExpanded = expandedStep === step.step
            const isLast = i === methodologySteps.length - 1
            const accentColor = CATEGORY_COLORS[step.category] ?? 'var(--color-brand-primary)'

            return (
              <div
                key={step.step}
                style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border-primary)' }}
              >
                <button
                  onClick={() => toggle(step.step)}
                  aria-expanded={isExpanded}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-lg)',
                    padding: 'var(--space-md) var(--space-xl)',
                    background: isExpanded ? 'var(--color-surface-secondary)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 150ms',
                    width: '100%',
                    textAlign: 'left',
                  }}
                  onMouseOver={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-hover)' }}
                  onMouseOut={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {/* Step number */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 24 }}>
                    <div
                      style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: isExpanded ? accentColor : 'var(--color-surface-secondary)',
                        border: `2px solid ${isExpanded ? accentColor : 'var(--color-border-secondary)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 200ms', flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-sans)', color: isExpanded ? 'white' : 'var(--color-text-tertiary)' }}>
                        {step.step}
                      </span>
                    </div>
                    {!isLast && (
                      <div style={{ width: 1, flex: 1, background: 'var(--color-border-primary)', minHeight: 8, marginTop: 2 }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center flex-wrap" style={{ gap: 'var(--space-md)' }}>
                      <span style={{ fontSize: 'var(--text-label-size)', fontWeight: 600, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                        {step.title}
                      </span>
                      <Badge label={step.category} variant={CATEGORY_VARIANTS[step.category] ?? 'default'} />
                    </div>
                  </div>

                  {isExpanded
                    ? <ChevronDown size={15} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                    : <ChevronRight size={15} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  }
                </button>

                {isExpanded && (
                  <div
                    className="animate-fade-up"
                    style={{
                      padding: 'var(--space-lg) var(--space-xl) var(--space-xl)',
                      paddingLeft: 'calc(var(--space-xl) + 24px + var(--space-lg))',
                      background: 'var(--color-surface-secondary)',
                    }}
                  >
                    <p style={{ fontSize: 'var(--text-body-size)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
                      {step.description}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
