import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  icon?: ReactNode
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeW: Record<string, string> = { sm: '360px', md: '480px', lg: '640px' }

export function Modal({ isOpen, onClose, title, icon, description, children, footer, size = 'md' }: ModalProps) {
  const onCloseRef = useRef(onClose)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0)
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-aeroprice-modal]')
      if (dialogs[dialogs.length - 1] !== panelRef.current) return
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current() }
      if (e.key === 'Tab') {
        const elements = focusable()
        const first = elements[0], last = elements.at(-1)
        if (!first) { e.preventDefault(); return }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal((
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-[var(--space-xl)]"
      style={{ background: 'rgba(15,23,42,0.46)', zIndex: 20000 }}
      onClick={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-aeroprice-modal
        className="modal-panel flex flex-col bg-[var(--color-surface-bg)] rounded-[var(--radius-xl)] shadow-[var(--shadow-floating)] w-full"
        style={{ maxWidth: sizeW[size], maxHeight: 'min(calc(100dvh - 32px), 760px)', minHeight: 0, outline: 'none', overflow: 'hidden' }}
      >
        {title && (
          <div className="flex items-center justify-between p-[var(--space-xl)] border-b border-[var(--color-border-primary)]">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {icon && <span style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, flex: '0 0 42px', borderRadius: 12, background: 'var(--color-brand-muted)', color: 'var(--color-brand-primary)' }}>{icon}</span>}
              <div><h2 className="text-heading text-primary" style={{ margin: 0 }}>{title}</h2>{description && <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{description}</p>}</div>
            </div>
            <button
              onClick={onClose}
              className="p-[var(--space-xs)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-[var(--space-xl)] flex flex-col gap-[var(--space-lg)]" style={{ minHeight: 0 }}>
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-[var(--space-md)] p-[var(--space-xl)] border-t border-[var(--color-border-primary)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  ), document.body)
}
