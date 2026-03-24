import { useState } from 'react'

const GROUP_LABELS = {
  master:     'Master Data',
  operations: 'Operations',
  finance:    'Finance',
  management: 'Management',
  settings:   'Settings',
}

export function Sidebar({ navItems, activeKey, onChange, user, onLogout, collapsed }) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Collect unique group keys in insertion order
  const groupKeys = []
  const seenGroups = new Set()
  for (const item of navItems) {
    const g = item.group || '__none__'
    if (!seenGroups.has(g)) { seenGroups.add(g); groupKeys.push(g) }
  }

  const initials = user?.fullName
    ? user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-header">
          {collapsed
            ? <img src="/images/logo-letter.png" alt="M" className="sidebar-logo-letter" />
            : (
              <div className="brand-name-row">
                <img src="/images/logo.png" alt="MasterAuto" className="sidebar-logo" />
              </div>
            )
          }
        </div>
        {!collapsed && <p className="sidebar-tagline">Management System</p>}
      </div>

      {/* Nav groups */}
      <nav className="sidebar-nav">
        {groupKeys.map((g) => {
          const items = navItems.filter((i) => (i.group || '__none__') === g)
          const label = GROUP_LABELS[g]
          return (
            <div key={g} className="nav-group">
              {!collapsed && label && (
                <span className="nav-group-label">{label}</span>
              )}
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  className={`nav-link${item.key === activeKey ? ' active' : ''}`}
                  data-nav-label={item.label}
                >
                  {item.icon && <span className="nav-icon">{item.icon}</span>}
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                  {!collapsed && item.badge != null && (
                    <span className="nav-badge">{item.badge}</span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="sidebar-footer">
        {collapsed ? (
          <button
            type="button"
            className="btn-secondary sidebar-logout"
            onClick={onLogout}
            title="Logout"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        ) : (
          <div className="sidebar-user-card">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user?.fullName}</span>
              <small className="sidebar-user-role">{user?.role}</small>
            </div>
            <div className="sidebar-user-menu" style={{ position: 'relative' }}>
              <button
                type="button"
                className="sidebar-dots-btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="User menu"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div
                    className="sidebar-dropdown-backdrop"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="sidebar-user-dropdown">
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onLogout() }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
