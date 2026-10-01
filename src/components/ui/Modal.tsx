import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeW: Record<string, string> = { sm: '360px', md: '480px', lg: '640px' }

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
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
        className="modal-panel flex flex-col bg-[var(--color-surface-bg)] rounded-[var(--radius-xl)] shadow-[var(--shadow-floating)] w-full"
        style={{ maxWidth: sizeW[size], maxHeight: 'min(85vh, 760px)' }}
      >
        {title && (
          <div className="flex items-center justify-between p-[var(--space-xl)] border-b border-[var(--color-border-primary)]">
            <span className="text-heading text-primary">{title}</span>
            <button
              onClick={onClose}
              className="p-[var(--space-xs)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand-primary)] focus-visible:outline-offset-2"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-[var(--space-xl)] flex flex-col gap-[var(--space-lg)]">
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
