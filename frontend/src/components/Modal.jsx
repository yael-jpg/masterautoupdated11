import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ isOpen, onClose, title, children, wide = false, className = '' }) {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ pointerEvents: 'all' }}>
      <div 
        className={`modal-content ${wide ? 'modal-wide' : ''} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ pointerEvents: 'all' }}
      >
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
