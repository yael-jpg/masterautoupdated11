import './App.css'
import './styles/design-system.css'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from './hooks/useTheme'
import { createPortal } from 'react-dom'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { LoginPage } from './pages/LoginPage'
import { apiDownload, apiGet, buildApiUrl, loginRequest, pushToast } from './api/client'
import { createRealtimeClient } from './utils/realtime'
import { emitConfigUpdated, emitPackagesUpdated, emitVehicleMakesUpdated } from './utils/events'
import { ToastViewport } from './components/ToastViewport'
import { computeNewPortalBookings, computeNewPortalCancellations, computeNewPortalCancellationRequests, computeNewPortalQuotationBookings, createPortalBookingWatchState } from './utils/portalBookingWatcher'
import { getJwtExpMs } from './utils/jwt'

const lazyNamed = (loader, exportName) => lazy(() => loader().then((m) => ({ default: m[exportName] })))

const DashboardHome = lazyNamed(() => import('./pages/DashboardHome'), 'DashboardHome')
const CRMPage = lazyNamed(() => import('./pages/CrmPage'), 'CRMPage')
const SalesPage = lazyNamed(() => import('./pages/SalesPage'), 'SalesPage')
const ServicesPage = lazyNamed(() => import('./pages/ServicesPage'), 'ServicesPage')
const PaymentsPage = lazyNamed(() => import('./pages/PaymentsPage'), 'PaymentsPage')
const SchedulingPage = lazyNamed(() => import('./pages/SchedulingPage'), 'SchedulingPage')
const AdminPage = lazyNamed(() => import('./pages/AdminPage'), 'AdminPage')
const QuotationsPage = lazyNamed(() => import('./pages/QuotationsPage'), 'QuotationsPage')
const JobOrdersPage = lazyNamed(() => import('./pages/JobOrdersPage'), 'JobOrdersPage')
const JoApprovalPage = lazyNamed(() => import('./pages/JoApprovalPage'), 'JoApprovalPage')
const InventoryPage = lazyNamed(() => import('./pages/InventoryPage'), 'InventoryPage')
const OnlineQuotationRequestsPage = lazyNamed(() => import('./pages/OnlineQuotationRequestsPage'), 'OnlineQuotationRequestsPage')
const SettingsPage = lazyNamed(() => import('./pages/SettingsPage'), 'SettingsPage')
const SubscriptionsPage = lazyNamed(() => import('./pages/SubscriptionsPage'), 'SubscriptionsPage')
const PMSPage = lazyNamed(() => import('./pages/PMSPage'), 'PMSPage')
const LandingChatPage = lazyNamed(() => import('./pages/LandingChatPage'), 'LandingChatPage')
const MAX_DB_NOTIFICATION_ID = 2147483647

const ADMIN_SEGMENT_BY_KEY = {
  dashboard: 'dashboard',
  crm: 'crm',
  services: 'services',
  pms: 'pms',
  'online-quotation': 'online-quotation',
  quotations: 'quotations',
  scheduling: 'scheduling',
  'job-orders': 'job-orders',
  'landing-chat': 'landing-chat',
  'jo-approval': 'jo-approval',
  subscriptions: 'subscriptions',
  payments: 'payments',
  sales: 'sales',
  inventory: 'inventory',
  admin: 'admin-security',
  settings: 'configurations',
}

const ADMIN_KEY_BY_SEGMENT = {
  dashboard: 'dashboard',
  crm: 'crm',
  services: 'services',
  pms: 'pms',
  'online-quotation': 'online-quotation',
  quotations: 'quotations',
  scheduling: 'scheduling',
  'job-orders': 'job-orders',
  'landing-chat': 'landing-chat',
  'jo-approval': 'jo-approval',
  subscriptions: 'subscriptions',
  payments: 'payments',
  sales: 'sales',
  inventory: 'inventory',
  'admin-security': 'admin',
  admin: 'admin',
  configuration: 'settings',
  configurations: 'settings',
  settings: 'settings',
}

function adminPathForKey(key) {
  const segment = ADMIN_SEGMENT_BY_KEY[key] || 'dashboard'
  return `/admin/${segment}`
}

function adminKeyFromPath(pathname) {
  const raw = String(pathname || '').trim().toLowerCase()
  if (!raw.startsWith('/admin')) return null
  const segment = raw.replace(/^\/admin\/?/, '').split('/')[0]
  if (!segment) return 'dashboard'
  return ADMIN_KEY_BY_SEGMENT[segment] || null
}

function SessionExpiredOverlay({ message, onResignIn }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content session-expired-modal">
        <div className="modal-header">
          <h2>Session Expired</h2>
        </div>
        <div className="session-expired-body">
          <p className="session-expired-message">
            {message || 'Your session has expired. Please sign in again.'}
          </p>
          <div className="session-expired-actions">
            <button type="button" className="btn-primary" onClick={onResignIn}>
              Re-sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PageLoadingFallback() {
  return <div className="dashboard-page-loading">Loading page...</div>
}

function App() {
  // Initialize theme on mount (reads localStorage, applies data-theme to <html>)
  useTheme()

  const [session, setSession] = useState(() => {
    const token = localStorage.getItem('masterauto_token')
    const userJson = localStorage.getItem('masterauto_user')
    return {
      token,
      user: userJson ? JSON.parse(userJson) : null,
    }
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(null)
  const [activeKey, setActiveKey] = useState('dashboard')
  const [networkBusy, setNetworkBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.innerWidth <= 1024)
  const [crmAutoOpenCustomerId, setCrmAutoOpenCustomerId] = useState(null)
  const [crmAutoOpenRegisterVehicle, setCrmAutoOpenRegisterVehicle] = useState(false)
  const [pendingQuotation, setPendingQuotation] = useState(null)
  const [preselectedBooking, setPreselectedBooking] = useState(null)
  const [openAppointmentId, setOpenAppointmentId] = useState(null)
  const [fromQuotation, setFromQuotation] = useState(null)
  const [openJobOrderId, setOpenJobOrderId] = useState(null)
  const [notifications, setNotifications] = useState([])
  const localNotificationSeqRef = useRef(0)
  const notifiedPortalAppointmentIdsRef = useRef(new Set())
  const [onlineLeadCount, setOnlineLeadCount] = useState(0)
  const [adminAllowedModules, setAdminAllowedModules] = useState(null)
  const syncingFromRouteRef = useRef(false)

  // ── Admin notification sound ─────────────────────────────────────────
  // Notes:
  // - Browsers usually block audio until the user interacts with the page.
  // - Avoid side effects in setState updaters: detect new notifications via effect.
  const soundArmedRef = useRef(false)
  const soundSeenIdsRef = useRef(new Set())
  const soundCooldownUntilRef = useRef(0)
  const audioContextRef = useRef(null)

  useEffect(() => {
    // Mark existing notifications as "seen" so we don't beep on initial render.
    const seen = soundSeenIdsRef.current
    notifications.forEach((n) => seen.add(n.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const arm = () => {
      soundArmedRef.current = true
    }

    window.addEventListener('pointerdown', arm, { once: true })
    window.addEventListener('keydown', arm, { once: true })
    window.addEventListener('touchstart', arm, { once: true })

    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      window.removeEventListener('touchstart', arm)
    }
  }, [])

  const playNotificationBeep = async () => {
    if (!soundArmedRef.current) return

    const now = Date.now()
    if (now < soundCooldownUntilRef.current) return
    soundCooldownUntilRef.current = now + 1200

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx()
      }

      const ctx = audioContextRef.current
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = 880

      const t0 = ctx.currentTime
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)

      oscillator.connect(gain)
      gain.connect(ctx.destination)

      oscillator.start(t0)
      oscillator.stop(t0 + 0.2)
    } catch (_) {
      // Ignore: audio may be blocked or unavailable.
    }
  }

  useEffect(() => {
    const seen = soundSeenIdsRef.current
    const newlyAdded = []
    for (const n of notifications) {
      if (!seen.has(n.id)) newlyAdded.push(n)
    }

    if (newlyAdded.length === 0) return

    const isSoundWorthy = (n) => {
      const title = String(n?.title || '').trim().toLowerCase()
      if (!title) return true
      // Skip the initial default notification
      if (title === 'welcome!') return false
      return true
    }

    const anyWorthy = newlyAdded.some(isSoundWorthy)
    newlyAdded.forEach((n) => seen.add(n.id))

    // Prevent unbounded growth if the app stays open for days.
    if (seen.size > 2000) {
      soundSeenIdsRef.current = new Set(notifications.slice(0, 200).map((n) => n.id))
    }

    if (anyWorthy) {
      playNotificationBeep()
    }
  }, [notifications])

  // ── Online booking watcher (no refresh needed) ─────────────────────────
  // The Notification Center is currently frontend-only. To notify admins/staff
  // when a portal booking happens, we poll for newly created portal appointments.
  const portalWatchRef = useRef(createPortalBookingWatchState())
  const onlineQuotationWatchRef = useRef({ initialized: false, lastSeenIso: null, seenIds: new Set() })
  const customerWatchRef = useRef({ initialized: false, lastSeenIso: null, seenIds: new Set() })
  const vehicleWatchRef = useRef({ initialized: false, lastSeenId: null, seenIds: new Set() })

  // Stabilize the global "Syncing data…" indicator so it doesn't flicker on fast requests.
  // - show only if requests last longer than a short delay
  // - once shown, keep visible for a minimum duration
  // - when requests hit 0, wait briefly before hiding (prevents rapid hide/show loops)
  const networkBusyUiRef = useRef({
    isShown: false,
    shownAtMs: 0,
    lastActive: 0,
    showTimer: null,
    hideTimer: null,
  })

  // Keep staff login URL clean:
  // - Logged out → always show /admin/login (even if user opens /admin)
  // - Logged in  → show /admin (if user is on /admin/login)
  useEffect(() => {
    const pathname = window.location.pathname

    if (!session.token) {
      // When the session expired, do not auto-navigate to login.
      // Show a caution prompt and let the user click "Re-sign in".
      if (sessionExpiredNotice) return
      // Backwards-compat: if old /login is used, normalize to /admin/login.
      if (pathname !== '/admin/login') window.history.replaceState({}, '', '/admin/login')
      return
    }

    if (pathname === '/login' || pathname === '/admin/login') window.history.replaceState({}, '', '/admin')

    if (pathname === '/subscriptions/requests' || pathname === '/admin/subscriptions/requests') {
      window.history.replaceState({}, '', '/admin')
      setActiveKey('subscriptions')
      window.dispatchEvent(new CustomEvent('ma:subscriptions-view', { detail: { tab: 'requests' } }))
    }
  }, [session.token])

  useEffect(() => {
    if (!session.token) return

    let stopped = false
    let timer = null

    const getPollIntervalMs = () => (document.hidden ? 15000 : 5000)

    // Reset per-login session state
    portalWatchRef.current = createPortalBookingWatchState()
    onlineQuotationWatchRef.current = { initialized: false, lastSeenIso: null, seenIds: new Set() }
    customerWatchRef.current = { initialized: false, lastSeenIso: null, seenIds: new Set() }
    vehicleWatchRef.current = { initialized: false, lastSeenId: null, seenIds: new Set() }
    notifiedPortalAppointmentIdsRef.current = new Set()

    const fetchOnlineLeadCount = async () => {
      try {
        const leadParams = new URLSearchParams({ page: '1', limit: '1', status: 'New' })
        const { url, headers } = buildApiUrl(`/online-quotation-requests?${leadParams.toString()}`, session.token)
        const res = await fetch(url, { headers })
        if (res.ok) {
          const result = await res.json().catch(() => ({}))
          setOnlineLeadCount(result?.pagination?.total || 0)
        }
      } catch (_) {}
    }

    const addOnlineBookingRequestNotification = (quotation) => {
      const customerText = quotation?.customer_name || 'Customer'
      const plateText = quotation?.plate_number || 'No plate'
      const quotationNo = quotation?.quotation_no ? String(quotation.quotation_no) : 'Quotation'

      let serviceText = 'Custom'
      if (Array.isArray(quotation?.services) && quotation.services.length > 0) {
        serviceText = quotation.services
          .map((s) => s?.name)
          .filter(Boolean)
          .join(', ') || serviceText
      }

      const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

      setNotifications((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          title: 'Portal Schedule Request',
          message: `${customerText} • ${plateText} • ${serviceText} • Ref: ${quotationNo}`,
          details: {
            type: 'quotation',
            quotation_id: quotation?.id,
            quotation_no: quotation?.quotation_no,
            customer_name: quotation?.customer_name,
            plate_number: quotation?.plate_number,
            services: Array.isArray(quotation?.services)
              ? quotation.services.map((s) => s?.name).filter(Boolean)
              : null,
          },
          time,
          read: false,
        },
        ...prev,
      ])
    }

    const addOnlineCancellationNotification = (appointment) => {
      const scheduleText = appointment?.schedule_start
        ? new Date(appointment.schedule_start).toLocaleString('en-PH')
        : '—'
      const plateText = appointment?.plate_number || 'No plate'
      const customerText = appointment?.customer_name || 'Customer'
      const serviceText = appointment?.service_name || (appointment?.service_id ? `Service #${appointment.service_id}` : 'Custom')
      const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

      setNotifications((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          title: 'Online Cancellation',
          message: `${customerText} • ${plateText} • ${serviceText} • ${scheduleText}`,
          details: {
            type: 'appointment',
            appointment_id: appointment?.id,
            customer_name: appointment?.customer_name,
            plate_number: appointment?.plate_number,
            service_name: appointment?.service_name,
            schedule_start: appointment?.schedule_start,
          },
          time,
          read: false,
        },
        ...prev,
      ])
    }

    const addOnlineCancellationRequestNotification = (appointment) => {
      const scheduleText = appointment?.schedule_start
        ? new Date(appointment.schedule_start).toLocaleString('en-PH')
        : '—'
      const plateText = appointment?.plate_number || 'No plate'
      const customerText = appointment?.customer_name || 'Customer'
      const serviceText = appointment?.service_name || (appointment?.service_id ? `Service #${appointment.service_id}` : 'Custom')
      const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

      setNotifications((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          title: 'Cancellation Request',
          message: `${customerText} • ${plateText} • ${serviceText} • ${scheduleText}`,
          details: {
            type: 'appointment',
            appointment_id: appointment?.id,
            customer_name: appointment?.customer_name,
            plate_number: appointment?.plate_number,
            service_name: appointment?.service_name,
            schedule_start: appointment?.schedule_start,
          },
          time,
          read: false,
        },
        ...prev,
      ])
    }

    const addOnlineQuotationLeadNotification = (lead) => {
      const nameText = lead?.full_name || 'Guest'
      const mobileText = lead?.mobile || 'No mobile'
      const vehicleText = [lead?.vehicle_make, lead?.vehicle_model].filter(Boolean).join(' ') || 'Vehicle'
      const branchText = lead?.branch ? String(lead.branch) : 'Any branch'
      const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

      setNotifications((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          title: 'Online Quotation Request',
          message: `${nameText} • ${mobileText} • ${vehicleText} • ${branchText}`,
          details: {
            type: 'lead',
            lead_id: lead?.id,
            full_name: lead?.full_name,
            mobile: lead?.mobile,
            vehicle_make: lead?.vehicle_make,
            vehicle_model: lead?.vehicle_model,
            branch: lead?.branch,
          },
          time,
          read: false,
        },
        ...prev,
      ])
    }

    const addOnlineScheduleRequestNotification = (appointment) => {
      const customerText = appointment?.customer_name || 'Customer'
      const plateText = appointment?.plate_number ? ` • ${appointment.plate_number}` : ''
      const rawService = appointment?.all_services || appointment?.service_name
      const serviceText = rawService ? ` • ${rawService}` : ''
      const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

      setNotifications((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          title: 'Portal Schedule Request',
          message: `${customerText}${plateText}${serviceText}`,
          details: {
            type: 'appointment',
            appointment_id: appointment?.id,
            customer_name: appointment?.customer_name,
            plate_number: appointment?.plate_number,
            service_name: appointment?.service_name,
            schedule_start: appointment?.schedule_start,
          },
          time,
          read: false,
        },
        ...prev,
      ])
    }

    const poll = async (isInitial = false) => {
      try {
        // NEW: Portal booking requests create quotations (not appointments)
        const qParams = new URLSearchParams({
          page: '1',
          limit: '10',
          tab: 'active',
        })
        const { url: qUrl, headers: qHeaders } = buildApiUrl(`/quotations?${qParams.toString()}`, session.token)
        const qRes = await fetch(qUrl, { headers: qHeaders })
        if (!qRes.ok) throw new Error('quotation poll failed')
        const qResult = await qRes.json().catch(() => ({}))
        const qRows = qResult?.data || []

        const { nextState: nextStateAfterQuotations, newRows: newQuotationRows } = computeNewPortalQuotationBookings(
          portalWatchRef.current,
          qRows,
          new Date(),
        )
        portalWatchRef.current = nextStateAfterQuotations

        if (newQuotationRows.length > 0) {
          newQuotationRows.forEach((q) => {
            // Portal schedule requests now create appointments; notifications should come from appointments.
            window.dispatchEvent(new CustomEvent('ma:quotations-updated', { detail: { source: 'portal', quotationId: q.id } }))
          })
        }

        // Poll for new portal schedule requests (appointments created by portal)
        try {
          const apptParams = new URLSearchParams({
            page: '1',
            limit: '10',
            tab: 'active',
            sortBy: 'createdAt',
            sortDir: 'desc',
          })
          const { url: apptUrl, headers: apptHeaders } = buildApiUrl(`/appointments?${apptParams.toString()}`, session.token)
          const apptRes = await fetch(apptUrl, { headers: apptHeaders })
          if (!apptRes.ok) throw new Error('appointment poll failed')
          const apptResult = await apptRes.json().catch(() => ({}))
          const apptRows = apptResult?.data || []

          // Ensure Requested portal schedules always notify at least once per login session.
          // This prevents missed notifications if the watcher baseline/diff fails for any reason.
          const isPortalRow = (r) => {
            if (!r) return false
            const source = String(r.booking_source || '').toLowerCase()
            if (source === 'portal') return true
            const notes = String(r.notes || '')
            return notes.includes('[PORTAL BOOKING REQUEST]')
          }
          const isRequested = (r) => String(r?.status || '').toLowerCase() === 'requested'
          const notifiedSet = notifiedPortalAppointmentIdsRef.current
          apptRows
            .filter((r) => isPortalRow(r) && isRequested(r))
            .forEach((r) => {
              const id = r?.id
              if (id === undefined || id === null) return
              if (notifiedSet.has(id)) return
              notifiedSet.add(id)
              addOnlineScheduleRequestNotification(r)
              window.dispatchEvent(
                new CustomEvent('ma:appointments-updated', {
                  detail: { source: 'portal', appointmentId: id, status: r?.status },
                }),
              )
            })

          const { nextState: nextStateAfterAppts, newRows: newApptRows } = computeNewPortalBookings(
            portalWatchRef.current,
            apptRows,
            new Date(),
          )
          portalWatchRef.current = nextStateAfterAppts

          newApptRows.forEach((appt) => {
            if (appt?.id !== undefined && appt?.id !== null) {
              notifiedPortalAppointmentIdsRef.current.add(appt.id)
            }
            addOnlineScheduleRequestNotification(appt)
            window.dispatchEvent(new CustomEvent('ma:appointments-updated', { detail: { source: 'portal', appointmentId: appt.id, status: appt.status } }))
          })
        } catch (_) {
          // Silent
        }

        // Poll for new portal cancellation requests (pending approval)
        try {
          const reqParams = new URLSearchParams({
            page: '1',
            limit: '10',
            tab: 'active',
            sortBy: 'cancelRequestedAt',
            sortDir: 'desc',
          })
          const { url: reqUrl, headers: reqHeaders } = buildApiUrl(`/appointments?${reqParams.toString()}`, session.token)
          const reqRes = await fetch(reqUrl, { headers: reqHeaders })
          if (!reqRes.ok) throw new Error('request poll failed')
          const reqResult = await reqRes.json().catch(() => ({}))
          const reqRows = reqResult?.data || []

          const { nextState: nextStateAfterReq, newRows: newReqRows } = computeNewPortalCancellationRequests(
            portalWatchRef.current,
            reqRows,
            new Date(),
          )
          portalWatchRef.current = nextStateAfterReq

          newReqRows.forEach((appt) => {
            addOnlineCancellationRequestNotification(appt)
            window.dispatchEvent(new CustomEvent('ma:appointments-updated', { detail: { source: 'portal', appointmentId: appt.id, cancel_request_status: 'PENDING' } }))
          })
        } catch (_) {
          // Silent
        }

        // Also poll for new portal cancellations (uses cancelled_at)
        try {
          const cancelParams = new URLSearchParams({
            page: '1',
            limit: '10',
            tab: 'history',
            sortBy: 'cancelledAt',
            sortDir: 'desc',
          })
          const { url: cancelUrl, headers: cancelHeaders } = buildApiUrl(`/appointments?${cancelParams.toString()}`, session.token)
          const cancelRes = await fetch(cancelUrl, { headers: cancelHeaders })
          if (!cancelRes.ok) throw new Error('cancel poll failed')
          const cancelResult = await cancelRes.json().catch(() => ({}))
          const cancelRows = cancelResult?.data || []

          const { nextState: nextStateAfterCancels, newRows: newCancelledRows } = computeNewPortalCancellations(
            portalWatchRef.current,
            cancelRows,
            new Date(),
          )
          portalWatchRef.current = nextStateAfterCancels

          newCancelledRows.forEach((appt) => {
            addOnlineCancellationNotification(appt)
            window.dispatchEvent(new CustomEvent('ma:appointments-updated', { detail: { source: 'portal', appointmentId: appt.id, status: 'Cancelled' } }))
          })
        } catch (_) {
          // Silent
        }

        // Poll for new public Online Quotation requests (leads)
        try {
          const leadParams = new URLSearchParams({
            page: '1',
            limit: '10',
            status: 'New',
          })
          const { url: leadUrl, headers: leadHeaders } = buildApiUrl(`/online-quotation-requests?${leadParams.toString()}`, session.token)
          const leadRes = await fetch(leadUrl, { headers: leadHeaders })
          if (!leadRes.ok) throw new Error('online quotation poll failed')
          const leadResult = await leadRes.json().catch(() => ({}))
          const leadRows = Array.isArray(leadResult?.data) ? leadResult.data : []
          const totalCount = leadResult?.pagination?.total || 0
          setOnlineLeadCount((prev) => {
            // Only update if different to avoid redundant re-renders
            if (prev !== totalCount) return totalCount
            return prev
          })

          const watch = onlineQuotationWatchRef.current

          const toIso = (value) => {
            if (!value) return null
            const d = new Date(value)
            if (Number.isNaN(d.getTime())) return null
            return d.toISOString()
          }

          const withIso = leadRows
            .map((r) => ({ row: r, createdIso: toIso(r?.created_at) }))
            .filter((x) => x.createdIso)

          const latestIso = withIso[0]?.createdIso || new Date().toISOString()

          // First run: establish baseline without notifying
          if (!watch.initialized) {
            // Like portal quotation notifications, surface very recent leads so
            // admins/staff don't miss a request created just before login/refresh.
            const graceMs = 2 * 60 * 1000
            const graceCutoffIso = new Date(Date.now() - graceMs).toISOString()
            const recentRows = withIso
              .filter((x) => x.createdIso >= graceCutoffIso)
              .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
              .map((x) => x.row)

            // Establish baseline
            watch.seenIds = new Set(leadRows.map((r) => r?.id).filter((id) => id !== undefined && id !== null))
            watch.lastSeenIso = latestIso
            watch.initialized = true

            if (recentRows.length > 0) {
              recentRows.forEach((r) => {
                if (r?.id != null) watch.seenIds.add(r.id)
                addOnlineQuotationLeadNotification(r)
                window.dispatchEvent(new CustomEvent('ma:online-quotation-requests-updated', { detail: { source: 'public', requestId: r.id } }))
              })
            }
          } else {
            const lastSeenIso = watch.lastSeenIso || new Date().toISOString()
            const seenIds = watch.seenIds instanceof Set ? watch.seenIds : new Set()

            const newRows = withIso
              .filter(({ row, createdIso }) => {
                if (createdIso > lastSeenIso) return true
                if (createdIso === lastSeenIso && row?.id != null && !seenIds.has(row.id)) return true
                return false
              })
              .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
              .map((x) => x.row)

            if (newRows.length > 0) {
              newRows.forEach((r) => {
                if (r?.id != null) seenIds.add(r.id)
                addOnlineQuotationLeadNotification(r)
                window.dispatchEvent(new CustomEvent('ma:online-quotation-requests-updated', { detail: { source: 'public', requestId: r.id } }))
              })
              watch.seenIds = seenIds
              watch.lastSeenIso = toIso(newRows[newRows.length - 1]?.created_at) || lastSeenIso
            } else {
              watch.seenIds = seenIds
              watch.lastSeenIso = lastSeenIso
            }
          }
        } catch (_) {
          // Silent
        }

        // Poll for newly created customers (walk-in and others)
        try {
          const custParams = new URLSearchParams({
            page: '1',
            limit: '10',
          })
          const { url: custUrl, headers: custHeaders } = buildApiUrl(`/customers?${custParams.toString()}`, session.token)
          const custRes = await fetch(custUrl, { headers: custHeaders })
          if (!custRes.ok) throw new Error('customers poll failed')
          const custResult = await custRes.json().catch(() => ({}))
          const custRows = Array.isArray(custResult?.data) ? custResult.data : []

          const watch = customerWatchRef.current

          const toIso = (value) => {
            if (!value) return null
            const d = new Date(value)
            if (Number.isNaN(d.getTime())) return null
            return d.toISOString()
          }

          const withIso = custRows
            .map((r) => ({ row: r, createdIso: toIso(r?.created_at) }))
            .filter((x) => x.createdIso)

          const latestIso = withIso[0]?.createdIso || new Date().toISOString()

          if (!watch.initialized) {
            const graceMs = 2 * 60 * 1000
            const graceCutoffIso = new Date(Date.now() - graceMs).toISOString()
            const recentRows = withIso
              .filter((x) => x.createdIso >= graceCutoffIso)
              .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
              .map((x) => x.row)

            watch.seenIds = new Set(custRows.map((r) => r?.id).filter((id) => id !== undefined && id !== null))
            watch.lastSeenIso = latestIso
            watch.initialized = true

            if (recentRows.length > 0) {
              recentRows.forEach((c) => {
                if (c?.id != null) watch.seenIds.add(c.id)
                const leadSource = String(c?.lead_source || '').trim().toLowerCase()
                const isPortal = leadSource === 'portal' || leadSource.includes('portal')
                const isWalkIn = String(c?.customer_type || '').toLowerCase() === 'walk-in'
                const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                setNotifications((prev) => [
                  {
                    id: `${Date.now()}-${Math.random()}`,
                    title: isPortal ? 'New Online Customer Register' : isWalkIn ? 'New Walk-in Customer' : 'New Customer',
                    message: `${c?.full_name || 'Customer'} • ${c?.mobile || 'No mobile'}${c?.email ? ` • ${c.email}` : ''}`,
                    details: {
                      type: 'customer',
                      customer_id: c?.id,
                      customer_type: c?.customer_type,
                      full_name: c?.full_name,
                      mobile: c?.mobile,
                      email: c?.email,
                      lead_source: c?.lead_source,
                    },
                    time,
                    read: false,
                  },
                  ...prev,
                ])
              })
            }
          } else {
            const lastSeenIso = watch.lastSeenIso || new Date().toISOString()
            const seenIds = watch.seenIds instanceof Set ? watch.seenIds : new Set()

            const newRows = withIso
              .filter(({ row, createdIso }) => {
                if (createdIso > lastSeenIso) return true
                if (createdIso === lastSeenIso && row?.id != null && !seenIds.has(row.id)) return true
                return false
              })
              .sort((a, b) => new Date(a.createdIso) - new Date(b.createdIso))
              .map((x) => x.row)

            if (newRows.length > 0) {
              newRows.forEach((c) => {
                if (c?.id != null) seenIds.add(c.id)
                const leadSource = String(c?.lead_source || '').trim().toLowerCase()
                const isPortal = leadSource === 'portal' || leadSource.includes('portal')
                const isWalkIn = String(c?.customer_type || '').toLowerCase() === 'walk-in'
                const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                setNotifications((prev) => [
                  {
                    id: `${Date.now()}-${Math.random()}`,
                    title: isPortal ? 'New Online Customer Register' : isWalkIn ? 'New Walk-in Customer' : 'New Customer',
                    message: `${c?.full_name || 'Customer'} • ${c?.mobile || 'No mobile'}${c?.email ? ` • ${c.email}` : ''}`,
                    details: {
                      type: 'customer',
                      customer_id: c?.id,
                      customer_type: c?.customer_type,
                      full_name: c?.full_name,
                      mobile: c?.mobile,
                      email: c?.email,
                      lead_source: c?.lead_source,
                    },
                    time,
                    read: false,
                  },
                  ...prev,
                ])
              })

              watch.seenIds = seenIds
              watch.lastSeenIso = toIso(newRows[newRows.length - 1]?.created_at) || lastSeenIso
            } else {
              watch.seenIds = seenIds
              watch.lastSeenIso = lastSeenIso
            }
          }
        } catch (_) {
          // Silent
        }

        // Poll for newly added vehicles (includes portal vehicle registrations)
        try {
          const vehParams = new URLSearchParams({
            page: '1',
            limit: '10',
            status: 'all',
          })
          const { url: vehUrl, headers: vehHeaders } = buildApiUrl(`/vehicles?${vehParams.toString()}`, session.token)
          const vehRes = await fetch(vehUrl, { headers: vehHeaders })
          if (!vehRes.ok) throw new Error('vehicles poll failed')
          const vehResult = await vehRes.json().catch(() => ({}))
          const vehRows = Array.isArray(vehResult?.data) ? vehResult.data : []

          const watch = vehicleWatchRef.current
          const ids = vehRows.map((v) => v?.id).filter((id) => id !== undefined && id !== null)
          const maxId = ids.length ? Math.max(...ids.map((x) => Number(x)).filter((x) => Number.isFinite(x))) : null

          if (!watch.initialized) {
            watch.seenIds = new Set(ids)
            watch.lastSeenId = maxId
            watch.initialized = true
          } else {
            const seenIds = watch.seenIds instanceof Set ? watch.seenIds : new Set()
            const newRows = vehRows
              .filter((v) => v?.id != null && !seenIds.has(v.id))
              .sort((a, b) => Number(a?.id) - Number(b?.id))

            if (newRows.length > 0) {
              newRows.forEach((v) => {
                if (v?.id != null) seenIds.add(v.id)
                const time = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                const plateText = v?.plate_number || 'No plate'
                const modelText = [v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle'
                const custText = v?.customer_name || 'Customer'
                setNotifications((prev) => [
                  {
                    id: `${Date.now()}-${Math.random()}`,
                    title: 'New Vehicle Added',
                    message: `${custText} • ${plateText} • ${modelText}`,
                    details: {
                      type: 'vehicle',
                      vehicle_id: v?.id,
                      customer_id: v?.customer_id,
                      customer_name: v?.customer_name,
                      plate_number: v?.plate_number,
                      make: v?.make,
                      model: v?.model,
                      year: v?.year,
                      color: v?.color,
                    },
                    time,
                    read: false,
                  },
                  ...prev,
                ])
              })
            }

            watch.seenIds = seenIds
            watch.lastSeenId = maxId
          }
        } catch (_) {
          // Silent
        }
      } catch (_) {
        // Silent: do not spam toasts for background polling
      }
    }

    const scheduleNextPoll = () => {
      if (stopped) return
      timer = setTimeout(async () => {
        if (stopped) return
        await poll(false)
        scheduleNextPoll()
      }, getPollIntervalMs())
    }

    // initial baseline + adaptive polling (slower when tab is hidden)
    poll(true)
    scheduleNextPoll()

    const visibilityHandler = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      scheduleNextPoll()
    }
    document.addEventListener('visibilitychange', visibilityHandler)

    const onlineUpdateHandler = (e) => {
      // If the update came from staff (promote/delete/status change), refresh the count immediately.
      if (e?.detail?.source === 'staff' && !stopped) {
        fetchOnlineLeadCount()
      }
    }
    window.addEventListener('ma:online-quotation-requests-updated', onlineUpdateHandler)

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', visibilityHandler)
      window.removeEventListener('ma:online-quotation-requests-updated', onlineUpdateHandler)
    }
  }, [session.token])

  useEffect(() => {
    let stopped = false

    const loadModuleAccess = async () => {
      if (!session.token || !session.user?.role) {
        setAdminAllowedModules(null)
        return
      }

      if (session.user.role === 'SuperAdmin') {
        setAdminAllowedModules(null)
        return
      }

      try {
        const payload = await apiGet('/admin/module-access', session.token)
        if (stopped) return
        const allowed = Array.isArray(payload?.adminAllowedModules)
          ? payload.adminAllowedModules
          : []
        setAdminAllowedModules(allowed)
      } catch {
        if (!stopped) {
          setAdminAllowedModules(null)
        }
      }
    }

    loadModuleAccess()
    return () => {
      stopped = true
    }
  }, [session.token, session.user?.role])

  useEffect(() => {
    if (!session.token) return
    let stopped = false

    const toUiNotification = (n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      details: n.payload || null,
      time: n.created_at ? new Date(n.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : 'Now',
      read: Boolean(n.is_read),
    })

    const load = async () => {
      try {
        const { url, headers } = buildApiUrl('/notifications', session.token)
        const res = await fetch(url, { headers })
        if (!res.ok) return
        const rows = await res.json().catch(() => [])
        if (!stopped && Array.isArray(rows)) {
          setNotifications(rows.map(toUiNotification))
        }
      } catch (_) {
        // Silent
      }
    }

    load()
    return () => { stopped = true }
  }, [session.token])

  useEffect(() => {
    if (!session.token) return

    const socket = createRealtimeClient(session.token)
    if (!socket) return

    const toUiNotification = (n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      details: n.payload || null,
      time: n.created_at ? new Date(n.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : 'Now',
      read: Boolean(n.is_read),
    })

    socket.on('notification:new', (n) => {
      if (!n?.id) return
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev
        return [toUiNotification(n), ...prev]
      })
    })

    socket.on('settings:updated', (payload) => {
      emitConfigUpdated({ source: 'realtime', ...(payload || {}) })
    })

    socket.on('data:changed', (payload) => {
      const scope = String(payload?.scope || '').toLowerCase()
      if (scope === 'subscriptions' || scope === 'pms') emitPackagesUpdated({ source: 'realtime', ...(payload || {}) })
      if (scope === 'vehicle-makes' || scope === 'vehicles') emitVehicleMakesUpdated({ source: 'realtime', ...(payload || {}) })
      if (scope === 'appointments') {
        window.dispatchEvent(new CustomEvent('ma:appointments-updated', { detail: payload || {} }))
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [session.token])

  useEffect(() => {
    const handleNetwork = (event) => {
      const active = Number(event?.detail?.activeRequests || 0)
      const ui = networkBusyUiRef.current
      const now = Date.now()

      ui.lastActive = active

      const showDelayMs = 250
      const minVisibleMs = 700
      const hideDelayMs = 300

      const clearTimer = (key) => {
        const t = ui[key]
        if (t) clearTimeout(t)
        ui[key] = null
      }

      if (active > 0) {
        // If we're about to show, don't also hide.
        clearTimer('hideTimer')

        // Already shown: keep it.
        if (ui.isShown) return

        // Only show if the request(s) are not just a quick blip.
        if (!ui.showTimer) {
          ui.showTimer = setTimeout(() => {
            ui.showTimer = null
            // Requests might have finished during the delay.
            if (Number(ui.lastActive || 0) <= 0) return
            ui.isShown = true
            ui.shownAtMs = Date.now()
            setNetworkBusy(true)
          }, showDelayMs)
        }
        return
      }

      // active === 0
      clearTimer('showTimer')
      if (!ui.isShown) return

      const elapsed = now - (ui.shownAtMs || now)
      const remainingMin = Math.max(minVisibleMs - elapsed, 0)
      const delay = Math.max(remainingMin, hideDelayMs)

      // Avoid rapid hide/show loops between back-to-back requests.
      if (!ui.hideTimer) {
        ui.hideTimer = setTimeout(() => {
          ui.hideTimer = null
          ui.isShown = false
          ui.shownAtMs = 0
          setNetworkBusy(false)
        }, delay)
      }
    }

    const handleToast = (event) => {
      const message = event.detail?.message
      const type = event.detail?.type || 'info'
      if (!message) {
        return
      }

      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, 3200)

      // Add to notification center for important messages
      if (type === 'success' || type === 'error') {
        localNotificationSeqRef.current += 1
        const notifId = `local-${Date.now()}-${localNotificationSeqRef.current}`
        setNotifications((prev) => [
          {
            id: notifId,
            title: type === 'success' ? 'Success' : 'Error',
            message,
            time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
            read: false,
          },
          ...prev,
        ])
      }
    }

    window.addEventListener('ma:network', handleNetwork)
    window.addEventListener('ma:toast', handleToast)

    const handleSessionExpired = (event) => {
      if (event?.detail?.scope && event.detail.scope !== 'admin') return
      const msg = event?.detail?.message || 'Session expired. Please sign in again.'
      try {
        localStorage.removeItem('masterauto_token')
        localStorage.removeItem('masterauto_user')
      } catch (_) {}
      setSession({ token: null, user: null })
      setSessionExpiredNotice({ message: msg, at: Date.now() })
    }

    window.addEventListener('ma:session-expired', handleSessionExpired)

    return () => {
      window.removeEventListener('ma:network', handleNetwork)
      window.removeEventListener('ma:toast', handleToast)
      window.removeEventListener('ma:session-expired', handleSessionExpired)

      // Cleanup any pending timers
      const ui = networkBusyUiRef.current
      if (ui?.showTimer) clearTimeout(ui.showTimer)
      if (ui?.hideTimer) clearTimeout(ui.hideTimer)
      if (ui) {
        ui.showTimer = null
        ui.hideTimer = null
        ui.isShown = false
        ui.shownAtMs = 0
      }
    }
  }, [])

  // Proactive token expiry handling (so idle sessions still auto-logout).
  useEffect(() => {
    const token = session.token
    if (!token) return

    const emitExpired = (message) => {
      window.dispatchEvent(new CustomEvent('ma:session-expired', { detail: { scope: 'admin', message } }))
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
  }, [session.token])

  const dismissToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id))

  // Close drawer on Escape key + lock body scroll when drawer is open on mobile
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsSidebarCollapsed(true)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    const isMobile = window.innerWidth <= 1024
    if (isMobile && !isSidebarCollapsed) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isSidebarCollapsed])

  const navItems = useMemo(
    () => {
      const baseItems = [
      { 
        key: 'dashboard', 
        label: 'Dashboard',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        ) 
      },
      { 
        key: 'crm',
        group: 'master',
        label: 'CRM',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        ) 
      },
      { 
        key: 'services',
        group: 'master',
        label: 'Services',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 1.4 0l1.6-1.6a1 1 0 1 1 1.4 1.4l-1.6 1.6a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 1 1-1.4 1.4l-1.6-1.6a1 1 0 0 0-1.4 0l-1.6 1.6a1 1 0 1 1-1.4-1.4l1.6-1.6a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 1 1 1.4-1.4z"></path>
            <path d="M3 21l6-6"></path>
            <path d="M5 11l8 8"></path>
          </svg>
        ) 
      },
      {
        key: 'pms',
        group: 'master',
        label: 'PMS Management',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 1.4 0l1.6-1.6a1 1 0 1 1 1.4 1.4l-1.6 1.6a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 1 1-1.4 1.4l-1.6-1.6a1 1 0 0 0-1.4 0l-1.6 1.6a1 1 0 1 1-1.4-1.4l1.6-1.6a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 1 1 1.4-1.4z"></path>
            <path d="M3 21l6-6"></path>
            <path d="M12 21H21"></path>
          </svg>
        )
      },
      {
        key: 'online-quotation',
        group: 'operations',
        label: 'Online Quotation',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        ),
        badge: onlineLeadCount > 0 ? onlineLeadCount : null,
      },
      {
        key: 'quotations',
        group: 'operations',
        label: 'Quotations',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        ),
      },
      { 
        key: 'scheduling',
        group: 'operations',
        label: 'Scheduling',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        ) 
      },
      {
        key: 'job-orders',
        group: 'operations',
        label: 'Job Orders',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="6"></rect>
            <path d="M3 9h18"></path>
            <path d="M3 9v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"></path>
            <line x1="9" y1="14" x2="15" y2="14"></line>
            <line x1="9" y1="18" x2="15" y2="18"></line>
          </svg>
        ),
      },
      ...(session.user?.role === 'SuperAdmin' ? [{
        key: 'landing-chat',
        group: 'operations',
        label: 'Landing Chat',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        ),
      }] : []),
      ...(session.user?.role === 'SuperAdmin' ? [{
        key: 'jo-approval',
        group: 'operations',
        label: 'JO Approval',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="6"></rect>
            <path d="M3 9h18"></path>
            <path d="M3 9v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"></path>
            <path d="M9 16l2 2 4-4"></path>
          </svg>
        ),
      }] : []),
      {
        key: 'subscriptions',
        group: 'operations',
        label: 'Subscriptions',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
        ),
      },
      {
        key: 'payments',
        group: 'finance',
        label: 'Payments & POS',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
            <line x1="1" y1="10" x2="23" y2="10"></line>
          </svg>
        ) 
      },
      { 
        key: 'sales',
        group: 'finance',
        label: 'Sales & Invoices',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        ) 
      },
      {
        key: 'inventory',
        group: 'management',
        label: 'Inventory',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
        ),
      },
      ...(session.user?.role === 'SuperAdmin' ? [{ 
        key: 'admin',
        group: 'management',
        label: 'Admin & Security',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        ) 
      }] : []),
      ...(session.user?.role === 'SuperAdmin' ? [{
        key: 'settings',
        group: 'settings',
        label: 'Configuration',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        ),
      }] : []),
      ]

      if (session.user?.role !== 'Admin' || !Array.isArray(adminAllowedModules)) {
        return baseItems
      }

      const allowed = new Set(adminAllowedModules)
      allowed.add('dashboard')
      const filtered = baseItems.filter((item) => allowed.has(item.key))
      return filtered.length ? filtered : baseItems.filter((item) => item.key === 'dashboard')
    },
    [session.user?.role, onlineLeadCount, adminAllowedModules],
  )

  useEffect(() => {
    if (!navItems.some((item) => item.key === activeKey)) {
      setActiveKey(navItems[0]?.key || 'dashboard')
    }
  }, [activeKey, navItems])

  useEffect(() => {
    if (!session.token) return

    const applyRoute = () => {
      const routeKey = adminKeyFromPath(window.location.pathname)
      if (!routeKey) return
      const allowed = new Set(navItems.map((item) => item.key))
      const resolvedKey = allowed.has(routeKey) ? routeKey : 'dashboard'
      setActiveKey((prev) => {
        if (prev === resolvedKey) return prev
        syncingFromRouteRef.current = true
        return resolvedKey
      })
    }

    applyRoute()
    window.addEventListener('popstate', applyRoute)
    return () => window.removeEventListener('popstate', applyRoute)
  }, [session.token, navItems])

  useEffect(() => {
    if (!session.token) return

    if (syncingFromRouteRef.current) {
      syncingFromRouteRef.current = false
      return
    }

    const targetPath = adminPathForKey(activeKey)
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath)
    }
  }, [session.token, activeKey])

  const pageMap = {
    dashboard: <DashboardHome token={session.token} onNavigate={setActiveKey} />,
    crm: <CRMPage
      token={session.token}
      user={session.user}
      autoOpenCustomerId={crmAutoOpenCustomerId}
      autoOpenRegisterVehicle={crmAutoOpenRegisterVehicle}
      onAutoOpenConsumed={() => setCrmAutoOpenCustomerId(null)}
      onAutoOpenRegisterVehicleConsumed={() => setCrmAutoOpenRegisterVehicle(false)}
      onAfterSave={(newCustomer) => {
        // After registering a customer, immediately open their details in CRM and show the Register Vehicle modal.
        setCrmAutoOpenCustomerId(newCustomer.id)
        setCrmAutoOpenRegisterVehicle(true)
        setActiveKey('crm')
    }} onNewQuotation={(customer) => {
      setPendingQuotation({ customerId: customer.id })
      setActiveKey('quotations')
    }} />,
    sales: <SalesPage token={session.token} />,
    services: <ServicesPage token={session.token} />,
    pms: <PMSPage token={session.token} />,
    subscriptions: <SubscriptionsPage
      token={session.token}
      onOpenRequestAppointment={(appointmentId) => {
        if (!appointmentId) return
        setOpenAppointmentId(appointmentId)
        setActiveKey('scheduling')
      }}
    />,
    payments: <PaymentsPage token={session.token} user={session.user} />,
    scheduling: (
      <SchedulingPage
        token={session.token}
        user={session.user}
        preselectedBooking={preselectedBooking}
        onPreselectedBookingConsumed={() => setPreselectedBooking(null)}
        openAppointmentId={openAppointmentId}
        onOpenAppointmentConsumed={() => setOpenAppointmentId(null)}
        onNavigateToJobOrder={(joId) => {
          setOpenJobOrderId(joId)
          setActiveKey('job-orders')
        }}
      />
    ),
    admin: session.user?.role === 'SuperAdmin' ? <AdminPage token={session.token} user={session.user} /> : <DashboardHome token={session.token} onNavigate={setActiveKey} />,
    quotations: <QuotationsPage token={session.token} user={session.user} preselectedQuotation={pendingQuotation} onPreselectedConsumed={() => setPendingQuotation(null)} onRequestCreateBooking={(payload) => {
      // payload: { quotationId, customerId, vehicleId }
      setPreselectedBooking(payload)
      setActiveKey('scheduling')
    } } onCreateJobOrder={(q) => {
      setFromQuotation(q)
      setActiveKey('job-orders')
    }} />,
    'online-quotation': <OnlineQuotationRequestsPage token={session.token} user={session.user} onConvert={(lead) => {
      const serviceCode =
        (typeof lead.service_code === 'string' && lead.service_code.trim())
          ? lead.service_code.trim()
          : (typeof lead.serviceCode === 'string' && lead.serviceCode.trim())
            ? lead.serviceCode.trim()
            : (typeof lead.service_id === 'string' && lead.service_id.trim())
              ? lead.service_id.trim()
              : null

      setPendingQuotation({
        id: lead.id,
        customerId: lead.customer_id,
        vehicleId: lead.vehicle_id,
        customerName: lead.full_name,
        customerMobile: lead.mobile,
        customerEmail: lead.email,
        vehicleMake: lead.vehicle_make,
        vehicleModel: lead.vehicle_model,
        vehiclePlate: lead.vehicle_plate,
        vehicleSize: lead.vehicle_size,
        serviceCode,
        serviceName: lead.service_name,
        serviceCategory: lead.service_category,
        serviceUnitPrice: lead.unit_price,
        preferredDate: lead.preferred_date,
        endDate: lead.end_date,
        notes: lead.notes,
        branch: lead.branch,
        isFromLead: true
      })
      setActiveKey('quotations')
    }} />,
    'job-orders' : <JobOrdersPage token={session.token} user={session.user} fromQuotation={fromQuotation} onFromQuotationConsumed={() => setFromQuotation(null)} openJobOrderId={openJobOrderId} onOpenJobOrderConsumed={() => setOpenJobOrderId(null)} />,
    'jo-approval': <JoApprovalPage token={session.token} onApprovedJobOrder={(joId) => { setOpenJobOrderId(joId); setActiveKey('job-orders') }} />,
    inventory: <InventoryPage token={session.token} />,
    settings: <SettingsPage token={session.token} user={session.user} />,
    'landing-chat': <LandingChatPage token={session.token} />,
  }

  const handleLogin = async (email, password) => {
    try {
      setAuthLoading(true)
      setAuthError('')
      const result = await loginRequest(email, password)
      localStorage.setItem('masterauto_token', result.token)
      localStorage.setItem('masterauto_user', JSON.stringify(result.user))
      setSession({ token: result.token, user: result.user })
      setSessionExpiredNotice(null)
      window.history.replaceState({}, '', '/admin/dashboard')
    } catch (error) {
      setAuthError(error.message)
      pushToast('error', error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('masterauto_token')
    localStorage.removeItem('masterauto_user')
    setSession({ token: '', user: null })
    setSessionExpiredNotice(null)
    window.history.replaceState({}, '', '/admin/login')
  }

  const handleExport = async () => {
    try {
      const exportMap = {
        crm: { path: '/exports/customers/excel', filename: 'customers.xlsx' },
        vehicles: { path: '/exports/vehicles/excel', filename: 'vehicles.xlsx' },
        sales: { path: '/exports/sales/excel', filename: 'sales.xlsx' },
        services: { path: '/exports/services/excel', filename: 'services.xlsx' },
        payments: { path: '/exports/payments/excel', filename: 'payments.xlsx' },
        scheduling: { path: '/exports/appointments/excel', filename: 'appointments.xlsx' },
        dashboard: { path: '/exports/sales/csv', filename: 'sales.csv' },
        admin: { path: '/exports/services/excel', filename: 'services.xlsx' },
      }

      const target = exportMap[activeKey] || exportMap.dashboard
      await apiDownload(target.path, session.token, target.filename)
      pushToast('success', `Export ready: ${target.filename}`)
    } catch (error) {
      pushToast('error', error.message)
    }
  }

  const handleMarkAsRead = async (notificationId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    )
    if (!session.token) return
    const idAsNumber = Number(notificationId)
    const isPersistedId = Number.isInteger(idAsNumber) && idAsNumber > 0 && idAsNumber <= MAX_DB_NOTIFICATION_ID
    if (!isPersistedId) return
    try {
      const { url, headers } = buildApiUrl(`/notifications/read/${idAsNumber}`, session.token)
      await fetch(url, { method: 'PUT', headers })
    } catch (_) {
      // Silent
    }
  }

  const handleOpenNotification = async (notification) => {
    const type = notification?.details?.type
    if (type === 'subscription-request') {
      setActiveKey('subscriptions')
      window.dispatchEvent(new CustomEvent('ma:subscriptions-view', { detail: { tab: 'requests' } }))
      return true
    }

    if (type === 'landing-chat') {
      const threadId = Number(notification?.details?.thread_id || 0)
      setActiveKey('landing-chat')
      if (threadId > 0) {
        window.dispatchEvent(new CustomEvent('ma:landing-chat-focus-thread', { detail: { threadId } }))
      }
      return true
    }

    if (type !== 'quotation' && type !== 'appointment' && type !== 'booking-request') return false

    if (type === 'appointment' || type === 'booking-request') {
      const appointmentId = notification?.details?.appointment_id
      if (!appointmentId) return false
      setOpenAppointmentId(appointmentId)
      setActiveKey('scheduling')
      return true
    }

    const quotationId = notification?.details?.quotation_id
    if (!quotationId) return false

    try {
      let customerId = notification?.details?.customer_id
      let vehicleId = notification?.details?.vehicle_id

      if (!customerId || !vehicleId) {
        const { url, headers } = buildApiUrl(`/quotations/${quotationId}`, session.token)
        const res = await fetch(url, { headers })
        if (res.ok) {
          const q = await res.json().catch(() => null)
          customerId = customerId || q?.customer_id
          vehicleId = vehicleId || q?.vehicle_id
        }
      }

      if (!customerId || !vehicleId) return false

      setPreselectedBooking({ quotationId, customerId, vehicleId })
      setActiveKey('scheduling')
      return true
    } catch (err) {
      pushToast('error', err?.message || 'Failed to open notification')
      return false
    }
  }

  const handleClearAllNotifications = () => {
    setNotifications([])
  }

  if (!session.token) {
    if (sessionExpiredNotice) {
      return (
        <>
          <SessionExpiredOverlay
            message={sessionExpiredNotice.message}
            onResignIn={() => {
              setSessionExpiredNotice(null)
              window.history.replaceState({}, '', '/admin/login')
            }}
          />
          {createPortal(
            <ToastViewport toasts={toasts} loading={networkBusy} onDismiss={dismissToast} />,
            document.body,
          )}
        </>
      )
    }
    return (
      <>
        <LoginPage onLogin={handleLogin} loading={authLoading} error={authError} />
        {createPortal(
          <ToastViewport toasts={toasts} loading={networkBusy} onDismiss={dismissToast} />,
          document.body,
        )}
      </>
    )
  }

  return (
    <main className="dashboard-page">
      <div className={`dashboard-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Backdrop inside shell so it shares the backdrop-filter stacking context with the sidebar */}
        {!isSidebarCollapsed && (
          <div className="mobile-backdrop" onClick={() => setIsSidebarCollapsed(true)} />
        )}
        <Sidebar
          navItems={navItems}
          activeKey={activeKey}
          onChange={(key) => {
            setActiveKey(key)
            if (window.innerWidth <= 1024) setIsSidebarCollapsed(true)
          }}
          user={session.user}
          onLogout={handleLogout}
          collapsed={isSidebarCollapsed}
        />
        <section className="dashboard-main">
          <TopBar
            title={navItems.find((item) => item.key === activeKey)?.label ?? 'Dashboard'}
            user={session.user}
            onProfile={() => session.user?.role === 'SuperAdmin' ? setActiveKey('admin') : null}
            onLogout={handleLogout}
            onExport={handleExport}
            onNewTransaction={() => setActiveKey('sales')}
            onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
            isSidebarCollapsed={isSidebarCollapsed}
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onClearAllNotifications={handleClearAllNotifications}
            onOpenNotification={handleOpenNotification}
          />
          <div className="dashboard-content">
            <Suspense fallback={<PageLoadingFallback />}>
              {pageMap[activeKey]}
            </Suspense>
          </div>
        </section>
      </div>
      {createPortal(
        <ToastViewport toasts={toasts} loading={networkBusy} onDismiss={dismissToast} />,
        document.body,
      )}
    </main>
  )
}

export default App
