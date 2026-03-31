import { useEffect, useRef, useState } from 'react'
import { NotificationCenter } from './NotificationCenter'

export function TopBar({
  title,
  user,
  onProfile,
  onLogout,
  onExport,
  onNewTransaction,
  onToggleSidebar,
  notifications,
  onMarkAsRead,
  onClearAllNotifications,
  onOpenNotification,
}) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)

  const currentDate = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="topbar-toggle" onClick={onToggleSidebar} aria-label="Toggle navigation">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="topbar-heading">
          <h1>{title}</h1>
          <p>{currentDate}</p>
        </div>
      </div>
      <div className="topbar-right">
        <NotificationCenter
          notifications={notifications}
          onMarkAsRead={onMarkAsRead}
          onClearAll={onClearAllNotifications}
          onOpenNotification={onOpenNotification}
        />
        <div className="topbar-profile-menu" ref={profileMenuRef}>
          <button
            type="button"
            className={`topbar-user ${isProfileMenuOpen ? 'active' : ''}`}
            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isProfileMenuOpen}
          >
            <span className="topbar-user-text">
              <strong>{user?.role}</strong>
              <span>{user?.fullName}</span>
            </span>
            <svg className="topbar-user-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
            <svg className="topbar-user-avatar" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>

          {isProfileMenuOpen && (
            <div className="topbar-profile-dropdown" role="menu">
              <button
                type="button"
                className="topbar-profile-item"
                role="menuitem"
                onClick={() => {
                  setIsProfileMenuOpen(false)
                  onProfile?.()
                }}
              >
                Profile Page
              </button>
              <button
                type="button"
                className="topbar-profile-item danger"
                role="menuitem"
                onClick={() => {
                  setIsProfileMenuOpen(false)
                  onLogout?.()
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        <button type="button" className="topbar-export-btn btn-secondary" onClick={onExport}>
          Export
        
        </button>
        <button type="button" className="topbar-new-btn btn-primary" onClick={onNewTransaction}>
          + New Transaction
        </button>
      </div>
    </header>
  )
}
