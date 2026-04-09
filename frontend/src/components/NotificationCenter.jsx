import { useEffect, useMemo, useRef, useState } from 'react'

export function NotificationCenter({ notifications, onMarkAsRead, onClearAll, onOpenNotification }) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const containerRef = useRef(null)
  const unreadCount = notifications.filter((n) => !n.read).length

  const selected = useMemo(
    () => notifications.find((n) => n.id === selectedId) || null,
    [notifications, selectedId],
  )

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null)
  }, [selectedId, selected])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
        setSelectedId(null)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setSelectedId(null)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const formatDetailValue = (value) => {
    if (value == null) return '—'
    if (Array.isArray(value)) {
      const parts = value
        .map((v) => (v == null ? '' : String(v)))
        .filter(Boolean)
      return parts.length ? parts.join(', ') : '—'
    }
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <div className="notification-center" ref={containerRef}>
      <button
        type="button"
        className="notification-bell"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            {selected ? (
              <>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to notifications"
                >
                  Back
                </button>
                <h3>Details</h3>
                <span className="notification-header-spacer" />
              </>
            ) : (
              <>
                <h3>Notifications</h3>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null)
                      onClearAll?.()
                    }}
                    className="btn-link"
                  >
                    Clear all
                  </button>
                )}
              </>
            )}
          </div>
          <div className="notification-list">
            {!selected && notifications.length === 0 ? (
              <div className="notification-empty">No notifications</div>
            ) : selected ? (
              <div className="notification-details" role="region" aria-label="Notification details">
                <div className="notification-details-head">
                  <strong className="notification-details-title">{selected.title}</strong>
                  <span className="notification-details-time">{selected.time}</span>
                </div>
                <p className="notification-details-message">{selected.message}</p>

                {selected.details && typeof selected.details === 'object' && (
                  <div className="notification-details-meta" aria-label="Notification metadata">
                    {Object.entries(selected.details)
                      .filter(([k]) => k !== 'raw')
                      .map(([key, value]) => (
                        <div key={key} className="notification-details-meta-row">
                          <span className="notification-details-meta-key">{key}</span>
                          <span className="notification-details-meta-value">{formatDetailValue(value)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                  onClick={async () => {
                    const handled = await onOpenNotification?.(notification)
                    if (handled) {
                      if (!notification.read) onMarkAsRead?.(notification.id)
                      setSelectedId(null)
                      setIsOpen(false)
                      return
                    }

                    setSelectedId(notification.id)
                    if (!notification.read) onMarkAsRead?.(notification.id)
                  }}
                >
                  <div className="notification-content">
                    <strong>{notification.title}</strong>
                    <p>{notification.message}</p>
                    <span className="notification-time">{notification.time}</span>
                  </div>
                  {!notification.read && <span className="notification-dot" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
