import { useState } from 'react'

const TOAST_META = {
  success: {
    title: 'Success',
    accent: '#2ecc71',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  add: {
    title: 'Added',
    accent: '#10b981',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  edit: {
    title: 'Updated',
    accent: '#a0a8b8',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  update: {
    title: 'Saved',
    accent: '#06b6d4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    ),
  },
  delete: {
    title: 'Deleted',
    accent: '#f97316',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4h6v2" />
      </svg>
    ),
  },
  error: {
    title: 'Error',
    accent: '#ff6370',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  warning: {
    title: 'Warning',
    accent: '#f59e0b',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    title: 'Info',
    accent: '#a0a8b8',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  loading: {
    title: 'Loading',
    accent: '#a0a8b8',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.9s linear infinite' }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    ),
  },
}

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const meta = TOAST_META[toast.type] || TOAST_META.info

  const handleClose = () => {
    setExiting(true)
    setTimeout(() => onDismiss(toast.id), 280)
  }

  return (
    <div
      className={`toast ${toast.type || 'info'}${exiting ? ' toast-exit' : ''}`}
      style={{ '--toast-accent': meta.accent }}
    >
      <div className="toast-icon-wrap" style={{ background: `${meta.accent}22`, color: meta.accent }}>
        {meta.icon}
      </div>
      <div className="toast-body">
        <span className="toast-title">{meta.title}</span>
        <span className="toast-message">{toast.message}</span>
      </div>
      <button className="toast-close" onClick={handleClose} aria-label="Dismiss">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="toast-progress" style={{ '--toast-duration': '3.2s', background: meta.accent }} />
    </div>
  )
}

export function ToastViewport({ toasts, loading, onDismiss }) {
  const meta = TOAST_META.loading
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {loading && (
        <div className="toast loading" style={{ '--toast-accent': meta.accent }}>
          <div className="toast-icon-wrap" style={{ background: `${meta.accent}22`, color: meta.accent }}>
            {meta.icon}
          </div>
          <div className="toast-body">
            <span className="toast-title">Loading</span>
            <span className="toast-message">Syncing data…</span>
          </div>
        </div>
      )}
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss || (() => {})} />
      ))}
    </div>
  )
}
