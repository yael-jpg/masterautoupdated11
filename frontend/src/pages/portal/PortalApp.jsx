import { useEffect, useRef, useState } from 'react'
import './Portal.css'
import '../../App.css'
import { clearPortalSession, getPortalCustomer, getPortalToken, portalGet } from '../../api/portalClient'
import { NotificationCenter } from '../../components/NotificationCenter'
import { PortalLoginPage } from './PortalLoginPage'
import { PortalDashboard } from './PortalDashboard'
import { PortalBooking } from './PortalBooking'
import { PortalJobStatus } from './PortalJobStatus'
import { PortalReceipts } from './PortalReceipts'
import { PortalServiceHistory } from './PortalServiceHistory'
import { PortalWarranty } from './PortalWarranty'
import { PortalAppointments } from './PortalAppointments'
import { PortalServices } from './PortalServices'
import { PortalVehicles } from './PortalVehicles'
import { PortalProfile } from './PortalProfile'
import { getJwtExpMs } from '../../utils/jwt'

function SessionExpiredOverlay({ message, onResignIn }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ width: 'min(520px, 100%)' }}>
        <div className="modal-header">
          <h2>Session Expired</h2>
        </div>
        <div style={{ padding: '22px 24px 24px' }}>
          <p style={{ margin: '0 0 18px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {message || 'Your session has expired. Please sign in again.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" onClick={onResignIn}>
              Re-sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const NAV = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    key: 'appointments',
    label: 'Appointments',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
      </svg>
    ),
  },
  {
    key: 'services',
    label: 'Services Menu',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    key: 'book',
    label: 'Request Quotation',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    ),
  },
  {
    key: 'jobs',
    label: 'Job Status',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    key: 'receipts',
    label: 'Receipts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    key: 'history',
    label: 'Service History',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
      </svg>
    ),
  },
  {
    key: 'warranty',
    label: 'Warranty',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
]

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  appointments: 'Appointments',
  vehicles: 'Vehicles',
  services: 'Services',
  book: 'Request Quotation',
  jobs: 'Job Status',
  receipts: 'Receipts & Payments',
  history: 'Service History',
  warranty: 'Warranty Tracker',
  profile: 'My Account',
}

export function PortalApp() {
  const [token, setToken] = useState(() => getPortalToken())
  const [customer, setCustomer] = useState(() => getPortalCustomer())
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(null)
  const [activePage, setActivePage] = useState('dashboard')
  const [initialServiceId, setInitialServiceId] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notifications, setNotifications] = useState([])

  const portalNotifWatchRef = useRef({
    initialized: false,
    apptStatusById: new Map(),
    joStatusById: new Map(),
    quotationStatusById: new Map(),
    seenApptIds: new Set(),
    seenJoIds: new Set(),
    seenQuotationIds: new Set(),
    seenVehicleIds: new Set(),
    seenPaymentIds: new Set(),
  })

  const handleLogin = (t, c) => {
    setToken(t)
    setCustomer(c)
    setSessionExpiredNotice(null)
    setActivePage('dashboard')
    window.history.replaceState({}, '', '/portal')
  }

  const handleLogout = () => {
    clearPortalSession()
    setToken('')
    setCustomer(null)
    setSessionExpiredNotice(null)
    window.history.replaceState({}, '', '/portal/login')
  }

  // Force logout when the portal JWT expires.
  useEffect(() => {
    const handleSessionExpired = (event) => {
      if (event?.detail?.scope && event.detail.scope !== 'portal') return
      const msg = event?.detail?.message || 'Session expired. Please sign in again.'
      setNotifications((prev) => [
        { id: `${Date.now()}-${Math.random()}`, read: false, time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }), title: 'Session Expired', message: msg },
        ...prev,
      ])
      clearPortalSession()
      setToken('')
      setCustomer(null)
      setSessionExpiredNotice({ message: msg, at: Date.now() })
    }

    window.addEventListener('ma:session-expired', handleSessionExpired)
    return () => window.removeEventListener('ma:session-expired', handleSessionExpired)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Proactive token expiry handling (so idle sessions still auto-logout).
  useEffect(() => {
    if (!token) return

    const emitExpired = (message) => {
      window.dispatchEvent(new CustomEvent('ma:session-expired', { detail: { scope: 'portal', message } }))
    }

    const expMs = getJwtExpMs(token)
    if (!expMs) return

    const tick = () => {
      if (Date.now() >= expMs) {
        emitExpired('Session expired. Please sign in again.')
        return true
      }
      return false
    }

    if (tick()) return

    const timeoutMs = Math.max(0, expMs - Date.now() + 500)
    const t = setTimeout(() => tick(), timeoutMs)
    const i = setInterval(() => tick(), 15000)

    return () => {
      clearTimeout(t)
      clearInterval(i)
    }
  }, [token])

  // Keep portal URLs clean:
  // - Logged out → always show /portal/login
  // - Logged in  → show /portal (if user is on /portal/login)
  useEffect(() => {
    const pathname = window.location.pathname

    if (!token || !customer) {
      if (sessionExpiredNotice) return
      if (pathname !== '/portal/login') window.history.replaceState({}, '', '/portal/login')
      return
    }

    if (pathname === '/portal/login') window.history.replaceState({}, '', '/portal')
  }, [token, customer])

  // ── Portal notifications (auto, no refresh needed) ───────────────────
  useEffect(() => {
    if (!token || !customer) return

    let stopped = false
    const intervalMs = 5000

    const timeNow = () => new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    const cap = (list) => (list.length > 40 ? list.slice(0, 40) : list)

    const addNotification = (n) => {
      setNotifications((prev) => cap([{ id: `${Date.now()}-${Math.random()}`, read: false, time: timeNow(), ...n }, ...prev]))
    }

    const poll = async (isInitial = false) => {
      try {
        const watch = portalNotifWatchRef.current

        const graceMs = 2 * 60 * 1000
        const cutoff = Date.now() - graceMs
        const isRecent = (value) => {
          if (!value) return false
          const t = new Date(value).getTime()
          return Number.isFinite(t) && t >= cutoff
        }

        const byCreatedAtAsc = (a, b) => new Date(a?.created_at).getTime() - new Date(b?.created_at).getTime()

        const [appts, docs, vehs, pays] = await Promise.all([
          portalGet('/appointments'),
          portalGet('/job-orders'),
          portalGet('/vehicles').catch(() => []),
          portalGet('/payments').catch(() => []),
        ])

        if (stopped) return

        const apptRows = Array.isArray(appts) ? appts : []
        const docRows = Array.isArray(docs) ? docs : []
        const vehicleRows = Array.isArray(vehs) ? vehs : []
        const paymentRows = Array.isArray(pays) ? pays : []

        const jobOrders = docRows.filter((d) => d?.doc_type === 'JobOrder')
        const quotations = docRows.filter((d) => d?.doc_type === 'Quotation')

        if (!watch.initialized || isInitial) {
          // Establish baseline first so we don't spam old items.
          watch.seenApptIds = new Set(apptRows.map((a) => a?.id).filter((id) => id != null))
          watch.apptStatusById = new Map(apptRows.map((a) => [a?.id, a?.status]))

          watch.seenJoIds = new Set(jobOrders.map((j) => j?.id).filter((id) => id != null))
          watch.joStatusById = new Map(jobOrders.map((j) => [j?.id, j?.workflow_status]))

          watch.seenQuotationIds = new Set(quotations.map((q) => q?.id).filter((id) => id != null))
          watch.quotationStatusById = new Map(quotations.map((q) => [q?.id, q?.quotation_approval_status]))

          watch.seenVehicleIds = new Set(vehicleRows.map((v) => v?.id).filter((id) => id != null))
          watch.seenPaymentIds = new Set(paymentRows.map((p) => p?.id).filter((id) => id != null))

          // Grace window: notify very recent items created right before login/refresh.
          const recentVehicles = vehicleRows.filter((v) => v?.id != null && isRecent(v?.created_at)).sort(byCreatedAtAsc)
          for (const v of recentVehicles) {
            addNotification({
              title: 'New Vehicle Added',
              message: `${v?.plate_number || 'No plate'} • ${[v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle'}`,
              details: {
                type: 'vehicle',
                vehicle_id: v.id,
                plate_number: v?.plate_number,
                make: v?.make,
                model: v?.model,
                year: v?.year,
                color: v?.color,
              },
            })
          }

          const recentPayments = paymentRows.filter((p) => p?.id != null && isRecent(p?.created_at)).sort(byCreatedAtAsc)
          for (const p of recentPayments) {
            const amount = Number(p?.amount) || 0
            addNotification({
              title: 'Payment Received',
              message: `${p?.sale_reference_no || 'Invoice'} • ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              details: {
                type: 'payment',
                payment_id: p.id,
                sale_reference_no: p?.sale_reference_no,
                amount: p?.amount,
                payment_type: p?.payment_type,
                reference_no: p?.reference_no,
                created_at: p?.created_at,
              },
            })
          }

          const recentJobOrders = jobOrders.filter((jo) => jo?.id != null && isRecent(jo?.created_at)).sort(byCreatedAtAsc)
          for (const jo of recentJobOrders) {
            addNotification({
              title: 'New Job Order',
              message: `${jo?.service_package || 'Service'} • ${jo?.workflow_status || 'Pending'}`,
              details: {
                type: 'job-order',
                job_order_id: jo.id,
                reference_no: jo?.reference_no,
                status: jo?.workflow_status,
                plate_number: jo?.plate_number,
              },
            })
          }

          const recentQuotations = quotations.filter((q) => q?.id != null && isRecent(q?.created_at)).sort(byCreatedAtAsc)
          for (const q of recentQuotations) {
            addNotification({
              title: 'New Quotation',
              message: `${q?.service_package || 'Quotation'} • ${q?.quotation_approval_status || 'Pending'}`,
              details: {
                type: 'quotation',
                quotation_id: q.id,
                reference_no: q?.reference_no,
                status: q?.quotation_approval_status,
                plate_number: q?.plate_number,
              },
            })
          }

          watch.initialized = true
          portalNotifWatchRef.current = watch
          return
        }

        // Vehicles: new vehicles under account
        for (const v of vehicleRows) {
          if (v?.id == null) continue
          if (!watch.seenVehicleIds.has(v.id)) {
            watch.seenVehicleIds.add(v.id)
            addNotification({
              title: 'New Vehicle Added',
              message: `${v?.plate_number || 'No plate'} • ${[v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle'}`,
              details: {
                type: 'vehicle',
                vehicle_id: v.id,
                plate_number: v?.plate_number,
                make: v?.make,
                model: v?.model,
                year: v?.year,
                color: v?.color,
              },
            })
          }
        }

        // Payments: new payment entries
        for (const p of paymentRows) {
          if (p?.id == null) continue
          if (!watch.seenPaymentIds.has(p.id)) {
            watch.seenPaymentIds.add(p.id)
            const amount = Number(p?.amount) || 0
            addNotification({
              title: 'Payment Received',
              message: `${p?.sale_reference_no || 'Invoice'} • ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              details: {
                type: 'payment',
                payment_id: p.id,
                sale_reference_no: p?.sale_reference_no,
                amount: p?.amount,
                payment_type: p?.payment_type,
                reference_no: p?.reference_no,
                created_at: p?.created_at,
              },
            })
          }
        }

        // Appointments: new or status change
        for (const a of apptRows) {
          if (a?.id == null) continue
          const prevStatus = watch.apptStatusById.get(a.id)
          const nextStatus = a?.status

          if (!watch.seenApptIds.has(a.id)) {
            watch.seenApptIds.add(a.id)
            watch.apptStatusById.set(a.id, nextStatus)
            addNotification({
              title: 'New Appointment',
              message: `${a?.service_name || 'Service'} • ${new Date(a?.schedule_start).toLocaleString('en-PH')}`,
              details: {
                type: 'appointment',
                appointment_id: a.id,
                status: nextStatus,
                schedule_start: a?.schedule_start,
                service_name: a?.service_name,
                plate_number: a?.plate_number,
              },
            })
          } else if (prevStatus && nextStatus && prevStatus !== nextStatus) {
            watch.apptStatusById.set(a.id, nextStatus)
            addNotification({
              title: 'Appointment Update',
              message: `${a?.service_name || 'Service'} • ${prevStatus} → ${nextStatus}`,
              details: {
                type: 'appointment',
                appointment_id: a.id,
                previous_status: prevStatus,
                status: nextStatus,
                schedule_start: a?.schedule_start,
                service_name: a?.service_name,
                plate_number: a?.plate_number,
              },
            })
          }
        }

        // Job Orders: workflow_status changes
        for (const jo of jobOrders) {
          if (jo?.id == null) continue
          const prevStatus = watch.joStatusById.get(jo.id)
          const nextStatus = jo?.workflow_status

          if (!watch.seenJoIds.has(jo.id)) {
            watch.seenJoIds.add(jo.id)
            watch.joStatusById.set(jo.id, nextStatus)
            addNotification({
              title: 'New Job Order',
              message: `${jo?.service_package || 'Service'} • ${nextStatus || 'Pending'}`,
              details: {
                type: 'job-order',
                job_order_id: jo.id,
                reference_no: jo?.reference_no,
                status: nextStatus,
                plate_number: jo?.plate_number,
              },
            })
          } else if (prevStatus && nextStatus && prevStatus !== nextStatus) {
            watch.joStatusById.set(jo.id, nextStatus)
            addNotification({
              title: 'Job Status Update',
              message: `${jo?.service_package || 'Service'} • ${prevStatus} → ${nextStatus}`,
              details: {
                type: 'job-order',
                job_order_id: jo.id,
                reference_no: jo?.reference_no,
                previous_status: prevStatus,
                status: nextStatus,
                plate_number: jo?.plate_number,
              },
            })
          }
        }

        // Quotations: approval status changes (Sent/Pending/Approved/etc)
        for (const q of quotations) {
          if (q?.id == null) continue
          const prevStatus = watch.quotationStatusById.get(q.id)
          const nextStatus = q?.quotation_approval_status

          if (!watch.seenQuotationIds.has(q.id)) {
            watch.seenQuotationIds.add(q.id)
            watch.quotationStatusById.set(q.id, nextStatus)
            addNotification({
              title: 'New Quotation',
              message: `${q?.service_package || 'Quotation'} • ${nextStatus || 'Pending'}`,
              details: {
                type: 'quotation',
                quotation_id: q.id,
                reference_no: q?.reference_no,
                status: nextStatus,
                plate_number: q?.plate_number,
              },
            })
          } else if (prevStatus && nextStatus && prevStatus !== nextStatus) {
            watch.quotationStatusById.set(q.id, nextStatus)
            addNotification({
              title: 'Quotation Update',
              message: `${q?.reference_no || 'Quotation'} • ${prevStatus} → ${nextStatus}`,
              details: {
                type: 'quotation',
                quotation_id: q.id,
                reference_no: q?.reference_no,
                previous_status: prevStatus,
                status: nextStatus,
                plate_number: q?.plate_number,
              },
            })
          }
        }

        portalNotifWatchRef.current = watch
      } catch (_) {
        // Silent
      }
    }

    poll(true)
    const id = setInterval(() => poll(false), intervalMs)

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [token, customer])

  if (!token || !customer) {
    if (sessionExpiredNotice) {
      return (
        <SessionExpiredOverlay
          message={sessionExpiredNotice.message}
          onResignIn={() => {
            setSessionExpiredNotice(null)
            window.history.replaceState({}, '', '/portal/login')
          }}
        />
      )
    }
    return <PortalLoginPage onLogin={handleLogin} />
  }

  const initials = customer.name
    ? customer.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <PortalDashboard customer={customer} onNavigate={setActivePage} />
      case 'appointments':
        return <PortalAppointments onBook={() => setActivePage('book')} />
      case 'vehicles':
        return <PortalVehicles onBook={() => setActivePage('book')} />
      case 'services':
        return <PortalServices onBook={(svcId) => { setInitialServiceId(svcId || ''); setActivePage('book') }} />
      case 'book':
        return <PortalBooking initialServiceId={initialServiceId} />
      case 'jobs':
        return <PortalJobStatus />
      case 'receipts':
        return <PortalReceipts />
      case 'history':
        return <PortalServiceHistory />
      case 'warranty':
        return <PortalWarranty />
      case 'profile':
        return <PortalProfile customer={customer} onCustomerUpdate={setCustomer} />
      default:
        return <PortalDashboard customer={customer} onNavigate={setActivePage} />
    }
  }

  return (
    <div className="portal-root">
      <div className={`portal-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        {}
        {mobileNavOpen && (
          <div className="portal-mobile-overlay" onClick={() => setMobileNavOpen(false)} />
        )}
        <aside className={`portal-sidebar${sidebarCollapsed ? ' collapsed' : ''}${mobileNavOpen ? ' mobile-open' : ''}`}>
          <div className="portal-sidebar-brand">
            {sidebarCollapsed
              ? <img src="/images/logo-letter.png" alt="M" className="portal-brand-logo-letter" />
              : <img src="/images/logo.png" alt="MasterAuto" className="portal-brand-logo" />
            }
            {!sidebarCollapsed && <p className="portal-brand-sub">Client Portal</p>}
          </div>

          <nav className="portal-nav">
            {NAV.map((item) => (
              <button
                key={item.key}
                className={`portal-nav-item${activePage === item.key ? ' active' : ''}`}
                onClick={() => { setActivePage(item.key); setMobileNavOpen(false) }}
                title={item.label}
              >
                {item.icon}
                <span className="portal-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="portal-sidebar-footer">
            <div
              className="portal-user-chip portal-user-chip--clickable"
              onClick={() => { setActivePage('profile'); setMobileNavOpen(false) }}
              title="Edit my account"
            >
              <div className="portal-avatar">{initials}</div>
              <div className="portal-sidebar-user-info">
                <div className="portal-user-name">{customer.name}</div>
                <div className="portal-user-label">Client Account</div>
              </div>
            </div>
            <button className="portal-logout-btn portal-sidebar-logout" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </aside>

        {}
        <main className={`portal-main${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
          <div className="portal-topbar">
            <div className="portal-topbar-left">
              {}
              <button
                className="portal-mobile-hamburger"
                onClick={() => setMobileNavOpen((v) => !v)}
                aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              >
                {mobileNavOpen
                  ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                  )
                }
              </button>
              {}
              <button
                className="portal-sidebar-toggle"
                onClick={() => setSidebarCollapsed((c) => !c)}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div>
                <h2>{PAGE_TITLES[activePage] || 'Portal'}</h2>
                <div className="portal-topbar-sub">
                {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>
            <div className="portal-topbar-right">
              <NotificationCenter
                notifications={notifications}
                onMarkAsRead={(id) => {
                  setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
                }}
                onClearAll={() => setNotifications([])}
              />
              <div
                className="portal-topbar-user portal-topbar-user--clickable"
                onClick={() => setActivePage('profile')}
                title="Edit my account"
              >
                <div className="portal-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials}</div>
                <div>
                  <div className="portal-topbar-user-name">{customer.name}</div>
                  <div className="portal-topbar-user-role">Client Account</div>
                </div>
              </div>
              <button className="portal-topbar-logout" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>

          <div className="portal-content">
            {activePage === 'dashboard'
              ? renderPage()
              : <div className="portal-page">{renderPage()}</div>
            }
          </div>
        </main>
      </div>
    </div>
  )
}
