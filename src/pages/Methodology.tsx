import { useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { methodologySteps } from '../data/sampleData'

export default function Methodology() {
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  const toggle = (id: string) => setExpandedStep(v => v === id ? null : id)

  return (
    <div className="flex flex-col gap-xl max-w-3xl">
      <div>
        <h1 className="text-title text-text-primary">Methodology</h1>
        <p className="text-label-sm text-text-secondary mt-xs max-w-xl">
          Interactive pipeline from raw source collection to published all-India airfare price index. Click any stage to expand.
        </p>
      </div>

      {/* Jevons formula highlight */}
      <div className="bg-surface-bg rounded-corner-lg p-xl">
        <h2 className="text-label font-medium text-text-primary mb-md">Core Index Formula — Jevons</h2>
        <div className="bg-bg-faint rounded-corner-md p-lg font-mono text-label-sm text-text-primary">
          P<sub>J</sub> = ( ∏ p<sub>i</sub> / p<sub>0</sub> )<sup>1/n</sup> × 100
        </div>
        <div className="mt-md flex flex-col gap-xs text-label-sm text-text-secondary">
          <p>Where p<sub>i</sub> = current period fare, p<sub>0</sub> = base period fare, n = number of observations.</p>
          <p>Route-level relatives are weighted by DGCA annual passenger traffic shares and aggregated via weighted geometric mean.</p>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bg-surface-bg rounded-corner-lg overflow-hidden">
        <div className="p-xl pb-md">
          <h2 className="text-label font-medium text-text-primary">Data Pipeline</h2>
          <p className="text-label-sm text-text-secondary mt-xs">
            {methodologySteps.length} stages from source to publication.
          </p>
        </div>
        <div className="flex flex-col">
          {methodologySteps.map((step, i) => {
            const isExpanded = expandedStep === step.id
            const isLast = i === methodologySteps.length - 1
            return (
              <div key={step.id} className={`${!isLast ? 'border-b border-border-primary' : ''}`}>
                {/* Step header */}
                <button
                  onClick={() => toggle(step.id)}
                  className="w-full flex items-center gap-lg px-xl py-md hover:bg-surface-hover transition-all duration-200 text-left focus-visible:outline-2 focus-visible:outline-brand-primary focus-visible:outline-offset-2"
                  aria-expanded={isExpanded}
                >
                  {/* Step number + connector */}
                  <div className="flex flex-col items-center shrink-0" style={{ width: 24 }}>
                    <div className={`w-6 h-6 rounded-corner-full flex items-center justify-center text-video-title font-medium transition-colors ${
                      isExpanded ? 'bg-brand-primary text-on-brand' : 'bg-bg-subtle text-text-secondary'
                    }`}>
                      {i + 1}
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-border-primary mt-xs" style={{ minHeight: 16 }} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-md">
                      <span className="text-label font-medium text-text-primary">{step.label}</span>
                      <span className="text-label-sm text-text-secondary">{step.description}</span>
                    </div>
                  </div>

                  {isExpanded
                    ? <ChevronDown size={16} className="text-text-tertiary shrink-0" />
                    : <ChevronRight size={16} className="text-text-tertiary shrink-0" />
                  }
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-xl pb-xl ml-10 animate-fade-up">
                    <div className="grid gap-lg" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      {[
                        { label: 'Input', value: step.input },
                        { label: 'Output', value: step.output },
                        { label: 'Method', value: step.method },
                        { label: 'Limitations', value: step.limitations },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex flex-col gap-xs">
                          <span className="text-video-title text-text-tertiary">{label}</span>
                          <span className="text-label-sm text-text-secondary">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-md">
                      <span className="text-video-title text-text-tertiary">Quality Checks</span>
                      <ul className="mt-xs flex flex-col gap-xs">
                        {step.qualityChecks.map(q => (
                          <li key={q} className="flex items-center gap-xs text-label-sm text-text-secondary">
                            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
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
