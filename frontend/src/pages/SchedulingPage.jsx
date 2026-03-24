import { useEffect, useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { apiDelete, apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { SERVICE_CATALOG } from '../data/serviceCatalog'
import { PaymentStatusBadge } from '../components/PaymentStatusBadge'
import { SearchableSelect } from '../components/SearchableSelect'

export function SchedulingPage({ token, user, onNavigateToJobOrder, preselectedBooking, onPreselectedBookingConsumed }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('In Progress')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [customers, setCustomers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [services, setServices] = useState([])
  const [sales, setSales] = useState([])
  const [error, setError] = useState('')
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  })
  const [forceReleaseConfig, setForceReleaseConfig] = useState({
    isOpen: false,
    appointment: null,
    totalAmount: 0,
    totalPaid: 0,
    balance: 0,
    reason: '',
  })

  // ── Booking Rules from Settings ─────────────────────────────────────────
  const [bookingConfig, setBookingConfig] = useState({
    allowCancelPartialPayment: true,
    autoCompleteWhenPaid: true,
    allowEditAfterApproval: false,
    enableGuestBooking: false,
    autoCancelUnpaidHours: 0,
  })
  const [branchLocations, setBranchLocations] = useState(['Cubao', 'Manila'])

  // Shared label style for form fields (slightly lower spacing to match design)
  const formLabelStyle = { display: 'block', marginBottom: '6px' }

  

  useEffect(() => {
    // Use /config/category/booking — public endpoint, works for all roles
    apiGet('/config/category/booking', token)
      .then((arr) => {
        const entries = Array.isArray(arr) ? arr : []
        const get = (key) => entries.find((e) => e.key === key)?.value ?? null
        setBookingConfig({
          allowCancelPartialPayment: get('allow_cancel_after_partial_payment') !== false && get('allow_cancel_after_partial_payment') !== 'false',
          autoCompleteWhenPaid: get('auto_complete_when_paid') !== false && get('auto_complete_when_paid') !== 'false',
          allowEditAfterApproval: get('allow_edit_after_approval') === true || get('allow_edit_after_approval') === 'true',
          enableGuestBooking: get('enable_guest_booking') === true || get('enable_guest_booking') === 'true',
          autoCancelUnpaidHours: parseInt(String(get('auto_cancel_unpaid_hours') || '0'), 10),
        })
        // branch_locations value may already be a parsed array (data_type='json') or a JSON string
        const raw = get('branch_locations')
        const parsed = Array.isArray(raw) ? raw : (() => { try { return raw ? JSON.parse(raw) : null } catch { return null } })()
        if (Array.isArray(parsed) && parsed.length > 0) setBranchLocations(parsed)
      })
      .catch(() => {})
  }, [token])

  const [cancelModal, setCancelModal] = useState({
    isOpen: false,
    appointment: null,
    paymentGuard: null,   // null (unpaid) | 'PARTIAL' | 'FULL'
    totalPaid: 0,
    totalAmount: 0,
    action: 'refund',     // 'refund' | 'credit' | 'reschedule'
    reason: '',
    loading: false,
    preview: null,        // cascade preview data from /cancel-preview
    previewLoading: false,
  })


  // ── Service Duration helpers (auto end-date) ──────────────────────────────
  function getServiceDuration(servicesArr) {
    if (!Array.isArray(servicesArr) || servicesArr.length === 0) return null
    const hasPpf       = servicesArr.some(s => String(s.code||'').toLowerCase().startsWith('ppf-') || String(s.group||'').toLowerCase().includes('ppf') || String(s.name||'').toLowerCase().includes('ppf'))
    const hasCoating   = servicesArr.some(s => {
      const code = String(s.code||'').toLowerCase()
      const name = String(s.name||'').toLowerCase()
      const group = String(s.group||'').toLowerCase()
      return code.includes('coat') || group.includes('coating') || name.includes('ceramic coating') || name.includes('graphene coating')
    })
    const hasTint      = servicesArr.some(s => String(s.group||'').toLowerCase().includes('window tint') || String(s.code||'').toLowerCase().includes('tint') || String(s.name||'').toLowerCase().includes('tint'))
    const hasExtDetail = servicesArr.some(s => String(s.code||'').toLowerCase() === 'detail-exterior' || String(s.name||'').toLowerCase().includes('exterior detail'))
    const hasIntDetail = servicesArr.some(s => String(s.code||'').toLowerCase() === 'detail-interior' || String(s.name||'').toLowerCase().includes('interior detail'))
    if (hasPpf)       return { days: 7, label: 'PPF Installation — 7 days' }
    if (hasCoating)   return { days: 3, label: 'Coating Service — 3 days' }
    if (hasTint)      return { days: 4, label: 'Window Tint — 3-4 days' }
    if (hasExtDetail) return { days: 4, label: 'Exterior Detailing — 3-4 days' }
    if (hasIntDetail) return { days: 4, label: 'Interior Detailing — 3-4 days' }
    return { days: 1, label: 'Other — 1 day' }
  }

  function computeEndFromStart(startStr, days) {
    if (!startStr || !days) return ''
    const d = new Date(startStr)
    d.setDate(d.getDate() + days)
    d.setHours(15, 0, 0, 0)
    // Build local ISO string directly — avoids timezone offset corruption
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function formatLocalDateTimeForInput(date) {
    if (!date) return ''
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function normalizePreferredDateTime(dateLike, { defaultHour, defaultMinute = 0 } = {}) {
    if (!dateLike) return null
    const d = new Date(dateLike)
    if (Number.isNaN(d.getTime())) return null

    // If lead date came in as date-only (00:00), snap into working hours.
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      d.setHours(defaultHour ?? 8, defaultMinute, 0, 0)
    }
    return d
  }

  // Initial form state
  const initialFormState = {
    customerId: '',
    vehicleId: '',
    serviceId: '',
    quotationId: '',
    saleServiceLabel: '',   // display-only: service_package from the selected quotation
    scheduleStart: '',
    scheduleEnd: '',
    installerTeam: '',
    status: 'Scheduled',
    notificationChannel: 'SMS',
    notes: '',
  }

  const [form, setForm] = useState(initialFormState)
  const [autoEndInfo, setAutoEndInfo] = useState(null)
  const [lockedCustomerId, setLockedCustomerId] = useState(null)
  const [lockedVehicleId, setLockedVehicleId] = useState(null)

  // If a preselected booking is provided (e.g., from Quotations), open the New Booking modal prefilled
  useEffect(() => {
    if (preselectedBooking && (preselectedBooking.customerId || preselectedBooking.quotationId)) {
      const preferredStart = normalizePreferredDateTime(preselectedBooking.preferredDate, { defaultHour: 8 })
      const preferredEnd = normalizePreferredDateTime(preselectedBooking.endDate, { defaultHour: 15 })

      setForm((f) => ({
        ...f,
        customerId: preselectedBooking.customerId || f.customerId,
        vehicleId: preselectedBooking.vehicleId || f.vehicleId,
        quotationId: preselectedBooking.quotationId || f.quotationId,
        scheduleStart: preferredStart ? formatLocalDateTimeForInput(preferredStart) : f.scheduleStart,
        scheduleEnd: preferredEnd ? formatLocalDateTimeForInput(preferredEnd) : f.scheduleEnd,
      }))
      // remember that customer/vehicle are locked for this new booking
      if (preselectedBooking.customerId) setLockedCustomerId(String(preselectedBooking.customerId))
      if (preselectedBooking.vehicleId) setLockedVehicleId(String(preselectedBooking.vehicleId))
      setEditingId(null)
      setShowForm(true)
      if (onPreselectedBookingConsumed) onPreselectedBookingConsumed()
    }
  }, [preselectedBooking])

  // Auto-compute duration info whenever quotationId or sales list changes
  // (covers both the dropdown selection AND when modal opens from Quotations page)
  useEffect(() => {
    if (!form.quotationId || !sales.length) return
    const matched = sales.find(s => String(s.id) === String(form.quotationId))
    if (!matched) return
    const servicesArr = Array.isArray(matched.services) ? matched.services : []
    const duration = getServiceDuration(servicesArr)
    setAutoEndInfo(duration)
    if (duration) {
      setForm(prev => ({
        ...prev,
        scheduleEnd: prev.scheduleEnd ? prev.scheduleEnd : (prev.scheduleStart ? computeEndFromStart(prev.scheduleStart, duration.days) : prev.scheduleEnd),
      }))
    }
  }, [form.quotationId, sales])

  // Helpers to prevent selecting past times for the Start Date & Time picker
  const TIME_INTERVAL = 30 // minutes
  const selectedStartDate = form.scheduleStart ? new Date(form.scheduleStart) : null
  const selectedEndDate = form.scheduleEnd ? new Date(form.scheduleEnd) : null

  // Return the minimum selectable time for the given date (in local time).
  // If the date is today, round up the current time to the next interval
  // (e.g. next 30-min slot) so earlier times are disabled. For future
  // dates return start of day.
  function getMinTimeForDate(date) {
    const now = new Date()
    if (!date) {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return start
    }
    const d = new Date(date)
    // compare local date strings to account for timezone
    if (d.toDateString() === now.toDateString()) {
      // round now up to the next TIME_INTERVAL
      const rounded = new Date(now)
      const mins = rounded.getMinutes()
      const remainder = mins % TIME_INTERVAL
      if (remainder !== 0) {
        rounded.setMinutes(mins + (TIME_INTERVAL - remainder))
      }
      rounded.setSeconds(0)
      rounded.setMilliseconds(0)
      return rounded
    }
    const start = new Date(d)
    start.setHours(8, 0, 0, 0)
    return start
  }

  function getMaxTimeForDate(date) {
    const d = date ? new Date(date) : new Date()
    d.setHours(17, 0, 0, 0)
    return d
  }

  // Filter time options for the time picker — disable times that are before
  // the rounded minimum time for today. React-Datepicker passes a Date
  // representing the candidate time (on the currently visible day) so we can
  // compare it directly against our calculated min time.
  function filterTimeOption(time) {
    try {
      const candidate = new Date(time)
      const hours = candidate.getHours()
      const minutes = candidate.getMinutes()
      // Enforce working hours: 8:00 AM – 5:00 PM
      const totalMins = hours * 60 + minutes
      if (totalMins < 8 * 60 || totalMins > 17 * 60) return false
      // Also disable past times for today
      const min = getMinTimeForDate(candidate)
      return candidate >= min
    } catch (e) {
      return true
    }
  }

  const toCatalogServiceCode = (catalogCode) => `CAT-${String(catalogCode || '').toUpperCase()}`

  const mapCatalogToServicePayload = (catalogService) => {
    const lowestPrice = Math.min(...Object.values(catalogService.sizePrices || {}).map(Number))

    return {
      code: toCatalogServiceCode(catalogService.code),
      name: catalogService.name,
      category: catalogService.group,
      basePrice: Number.isFinite(lowestPrice) ? lowestPrice : 0,
      description: `Synced from quotation catalog (${catalogService.group})`,
    }
  }

  const syncCatalogServices = async (currentServices) => {
    const normalizedServices = Array.isArray(currentServices) ? currentServices : []
    const existingCodes = new Set(
      normalizedServices.map((service) => String(service.code || '').toUpperCase()),
    )

    const missingPayloads = SERVICE_CATALOG
      .map(mapCatalogToServicePayload)
      .filter((payload) => !existingCodes.has(payload.code))

    if (!missingPayloads.length) {
      return normalizedServices
    }

    for (const payload of missingPayloads) {
      try {
        await apiPost('/services', token, payload)
      } catch {
        // ignore per-item creation errors and continue syncing remaining services
      }
    }

    try {
      const refreshed = await apiGet('/services', token)
      return Array.isArray(refreshed) ? refreshed : normalizedServices
    } catch {
      return normalizedServices
    }
  }

  const servicesByCode = useMemo(() => {
    return services.reduce((acc, service) => {
      acc[String(service.code || '').toUpperCase()] = service
      return acc
    }, {})
  }, [services])

  const groupedServices = useMemo(() => {
    const groups = [
      {
        label: 'PAINT PROTECTION',
        codes: ['ppf-basic', 'ppf-standard-5y', 'ppf-standard-7y', 'ppf-signature'],
      },
      {
        label: 'CAR WASH',
        codes: ['wash-basic', 'wash-premium', 'wash-signature'],
      },
      {
        label: 'DETAILING',
        codes: [
          'detail-exterior',
          'detail-interior',
          'detail-full',
          'coat-ceramic',
          'coat-graphene',
          'other-b2z',
          'other-headlight',
          'other-acid-rain',
          'other-water-repellant',
          'other-engine-wash',
          'other-engine-detail',
          'other-armorall',
        ],
      },
    ]

    return groups
      .map((group) => ({
        label: group.label,
        items: group.codes
          .map((catalogCode) => servicesByCode[toCatalogServiceCode(catalogCode)])
          .filter(Boolean),
      }))
      .filter((group) => group.items.length)
  }, [servicesByCode])

  const handleCloseModal = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(initialFormState)
    setAutoEndInfo(null)
    setLockedCustomerId(null)
    setLockedVehicleId(null)
  }

  const loadData = async (
    nextPage = page,
    nextSearch = search,
    nextStatus = statusFilter,
    nextSortBy = sortBy,
    nextSortDir = sortDir,
    nextDateFrom = dateFrom,
    nextDateTo = dateTo,
    nextTab = viewMode,
  ) => {
    try {
      const [appointmentResult, customerResult, vehicleResult, serviceList, salesResult] = await Promise.all([
        apiGet('/appointments', token, {
          page: nextPage,
          limit: pagination.limit,
          search: nextSearch,
          // Pass tab= for server-side Active/History split
          // Only pass status when in 'active' tab to narrow within active records
          tab: nextTab,
          ...(nextTab === 'active' && nextStatus ? { status: nextStatus } : {}),
          sortBy: nextSortBy,
          sortDir: nextSortDir,
          dateFrom: nextDateFrom,
          dateTo: nextDateTo,
        }),
        apiGet('/customers', token, { page: 1, limit: 100 }),
        apiGet('/vehicles', token, { page: 1, limit: 100 }),
        apiGet('/services', token),
        apiGet('/quotations', token, { page: 1, limit: 500, status: 'Approved' }),
      ])
      const syncedServices = await syncCatalogServices(serviceList)
      const syncedServicesById = syncedServices.reduce((acc, service) => {
        acc[Number(service.id)] = service
        return acc
      }, {})

      const appointments = appointmentResult.data
      const customerList = customerResult.data || customerResult
      const vehicleList = vehicleResult.data || vehicleResult
      setPagination(appointmentResult.pagination)
      setPage(appointmentResult.pagination.page)

      setRows(
        appointments.map((appointment) => ({
          key: `appointment-${appointment.id}`,
          cells: [
            // History tab shows completed_at; Active tab shows scheduled time
            nextTab === 'history'
              ? (appointment.completed_at
                  ? new Date(appointment.completed_at).toLocaleString('en-PH')
                  : '—')
              : new Date(appointment.schedule_start).toLocaleString('en-PH'),
            appointment.customer_name,
            appointment.plate_number,
            (() => {
              // Prefer aggregated sale items; fall back to single service name
              const raw = appointment.all_services || appointment.service_name ||
                (appointment.service_id
                  ? syncedServicesById[Number(appointment.service_id)]?.name || `Service #${appointment.service_id}`
                  : 'Custom')
              const services = raw.split(' | ').map(s => s.trim()).filter(Boolean)
              if (services.length <= 1) return <span key="svc">{services[0] || 'Custom'}</span>
              return (
                <div key="svc" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {services.map((svc, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 7px',
                        background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '999px',
                        color: '#aaaaaa',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              )
            })(),
            appointment.installer_team || '-',
            <span key="badges" style={{ display: 'inline-flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
              {appointment.booking_source === 'portal' && (
                <span key="portal-badge" style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#60a5fa',
                  background: 'rgba(96,165,250,0.12)',
                  border: '1px solid rgba(96,165,250,0.35)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.03em',
                }}>🌐 Online Booking</span>
              )}
              {String(appointment?.cancel_request_status || '').toUpperCase() === 'PENDING' && (
                <span key="cancel-req" style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#f59e0b',
                  background: 'rgba(245,158,11,0.10)',
                  border: '1px solid rgba(245,158,11,0.30)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.03em',
                }}>⏳ Cancel Requested</span>
              )}
              <StatusBadge key="status" status={appointment.status} />
              {appointment.payment_status && appointment.status !== 'Completed' && (
                <PaymentStatusBadge
                  key="pstatus"
                  status={appointment.payment_status}
                  balance={nextTab === 'active' ? appointment.outstanding_balance : undefined}
                  showBalance={nextTab === 'active'}
                />
              )}
              {appointment.booking_source === 'portal' && Number(appointment.down_payment_amount) > 0 && (
                <span key="dp-badge" style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: '#34d399',
                  background: 'rgba(52,211,153,0.10)',
                  border: '1px solid rgba(52,211,153,0.30)',
                  whiteSpace: 'nowrap',
                }}
                  title={`Down payment via ${appointment.down_payment_method || 'unknown'}${appointment.down_payment_ref ? ` — Ref: ${appointment.down_payment_ref}` : ''}`}
                >
                  💳 ₱{Number(appointment.down_payment_amount).toLocaleString()} down
                  {appointment.down_payment_method === 'cash' ? ' (on arrival)' : ` · ${appointment.down_payment_method || ''}`}
                </span>
              )}
            </span>,
          ],
          raw: appointment,
        })),
      )
      setCustomers(customerList)
      setVehicles(vehicleList)
      setServices(syncedServices)
      const rawQuotations = salesResult.data || salesResult || []
      setSales(rawQuotations.map((q) => ({
        ...q,
        service_package: Array.isArray(q.services)
          ? q.services.map((s) => s.name).join(', ')
          : (q.service_package || ''),
        reference_no: q.quotation_no || q.reference_no,
      })))
      setSelectedKeys(new Set())
    } catch (err) {
      setError(err.message)
    }
  }

  // Auto-refresh when the app detects new bookings (e.g., portal online bookings)
  useEffect(() => {
    if (!token) return
    const handler = () => {
      loadData().catch(() => {})
    }
    window.addEventListener('ma:appointments-updated', handler)
    return () => window.removeEventListener('ma:appointments-updated', handler)
    // Depend on active filters so refresh uses current query params.
  }, [token, page, search, statusFilter, sortBy, sortDir, dateFrom, dateTo, viewMode])

  // Helper to format date for datetime-local input
  const formatDateForInput = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    // Adjust for timezone offset to display correct local time in input
    const offset = date.getTimezoneOffset() * 60000
    const localISOTime = (new Date(date - offset)).toISOString().slice(0, 16)
    return localISOTime
  }


  const handleEdit = (appointment) => {
    setEditingId(appointment.id)
    const matchedSale = sales.find(s => Number(s.id) === Number(appointment.quotation_id || appointment.sale_id))
    const matchedLabel = matchedSale
      ? (Array.isArray(matchedSale.services)
          ? matchedSale.services.map((s) => s.name).join(', ')
          : matchedSale.service_package || '')
      : (appointment.service_name || '')
    setForm({
      customerId: appointment.customer_id,
      vehicleId: appointment.vehicle_id,
      serviceId: appointment.service_id,
      quotationId: appointment.quotation_id || appointment.sale_id || '',
      saleServiceLabel: matchedLabel,
      scheduleStart: formatDateForInput(appointment.schedule_start),
      scheduleEnd: formatDateForInput(appointment.schedule_end),
      installerTeam: appointment.installer_team || '',
      status: appointment.status,
      notificationChannel: appointment.notification_channel || 'SMS',
      notes: appointment.notes || '',
    })
    setLockedCustomerId(String(appointment.customer_id))
    setLockedVehicleId(String(appointment.vehicle_id))
    setShowForm(true)
  }

  const STATUS_BADGE_COLOR = {
    'Scheduled':          '#94a3b8',
    'Checked-In':         '#94a3b8',
    'In Progress':        '#f59e0b',
    'For QA':             '#f97316',
    'Ready for Release':  '#10b981',
    'Paid':               '#059669',
    'Released':           '#94a3b8',
    'Completed':          '#64748b',
    'Cancelled':          '#ef4444',
  }

  const StatusBadge = ({ status }) => {
    const color = STATUS_BADGE_COLOR[status] || '#94a3b8'
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.03em',
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        whiteSpace: 'nowrap',
      }}>{status}</span>
    )
  }

  const handleDelete = (appointmentId) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Booking',
      message: 'Are you sure you want to permanently delete this booking? This action cannot be undone. Bookings with existing payments cannot be deleted.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiDelete(`/appointments/${appointmentId}`, token)
          await loadData()
          setError('')
        } catch (deleteError) {
          setError(deleteError.message)
        }
      }
    })
  }

  // Archive a Completed booking (soft delete — Admin only)
  const handleArchive = (appointment) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Archive Completed Booking',
      message: `Archive the booking for ${appointment.customer_name}? This is a soft archive — financial records will NOT be affected. Only Admins can perform this action.`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await apiPost(`/appointments/${appointment.id}/archive`, token, {})
          await loadData()
          pushToast('success', 'Booking archived successfully.')
          setError('')
        } catch (archiveError) {
          setError(archiveError.message)
        }
      }
    })
  }

  // View invoice reference for a Completed booking
  const handleViewInvoice = (appointment) => {
    const ref = appointment.sale_reference
      || (appointment.quotation_id ? `Quotation #${appointment.quotation_id}` : null)
      || (appointment.sale_id ? `Sale #${appointment.sale_id}` : null)
      || 'N/A'
    pushToast('info', `Invoice reference: ${ref}. Go to Payments for full details.`)
  }

  // Duplicate a Completed booking as a new Scheduled booking
  const handleDuplicate = (appointment) => {
    const matchedSale = sales.find(s => Number(s.id) === Number(appointment.quotation_id || appointment.sale_id))
    const matchedLabel = matchedSale
      ? (Array.isArray(matchedSale.services)
          ? matchedSale.services.map((s) => s.name).join(', ')
          : matchedSale.service_package || '')
      : (appointment.service_name || '')
    setEditingId(null)
    setForm({
      customerId: appointment.customer_id,
      vehicleId: appointment.vehicle_id,
      serviceId: appointment.service_id,
      quotationId: appointment.quotation_id || appointment.sale_id || '',
      saleServiceLabel: matchedLabel,
      scheduleStart: '',
      scheduleEnd: '',
      installerTeam: appointment.installer_team || '',
      status: 'Scheduled',
      notificationChannel: appointment.notification_channel || 'SMS',
      notes: '',
    })
    setShowForm(true)
    pushToast('info', 'Duplicated booking — update the date and save.')
  }

  // Status flow constants (mirrors workflowEngine.js APPOINTMENT_WORKFLOW)
  const STATUS_ORDER = ['Scheduled', 'Checked-In', 'In Progress', 'For QA', 'Ready for Release', 'Paid', 'Released', 'Completed']

  // Which roles can trigger each stage transition
  const APPT_STAGE_ROLES = {
    'Checked-In':         ['Admin', 'Manager', 'Technician', 'QA', 'Cashier', 'Reception'],
    'In Progress':        ['Admin', 'Manager', 'Technician', 'QA', 'Cashier', 'Reception'],
    'For QA':             ['Admin', 'Manager', 'Technician', 'QA'],
    'Ready for Release':  ['Admin', 'Manager', 'QA'],
    'Paid':               ['Admin', 'Manager', 'Cashier'],
    'Released':           ['Admin', 'Manager'],
    'Completed':          ['Admin', 'Manager'],
    'Cancelled':          ['Admin', 'Manager'],
  }

  const canAdvanceAppt = (nextStatus, appointment) => {
    const allowed = APPT_STAGE_ROLES[nextStatus] || []
    if (!allowed.includes(user?.role || '')) return false
    return true
  }

  const getAdvanceDisabledReason = (nextStatus, appointment) => {
    const allowed = APPT_STAGE_ROLES[nextStatus] || []
    if (!allowed.includes(user?.role || '')) return `Your role (${user?.role}) cannot advance to this stage`
    return null
  }

  const STATUS_NEXT_LABEL = {
    'Scheduled':          { label: 'Check In',           color: '#a0a8b8' },
    'Checked-In':         { label: 'Start Work',          color: '#a0a8b8' },
    'In Progress':        { label: 'Send to QA',          color: '#f59e0b' },
    'For QA':             { label: 'Ready for Release',   color: '#10b981' },
    'Ready for Release':  { label: 'Mark Paid',           color: '#059669' },
    'Paid':               { label: 'Release Vehicle',     color: '#aaaaaa' },
    'Released':           { label: 'Complete',            color: '#64748b' },
  }

  const handleTransition = async (appointment, nextStatus) => {
    // Warn (but don't block) if advancing to Ready for Release while payment is incomplete
    if (nextStatus === 'Ready for Release') {
      const ps = appointment?.payment_status
      if (ps !== 'PAID' && ps !== 'SETTLED' && ps !== 'OVERPAID') {
        const bal = appointment?.outstanding_balance
        const balStr = bal ? ` Outstanding balance: ₱${Number(bal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''
        pushToast('warning', `Client has not fully paid.${balStr} Please collect payment before marking as Ready for Release.`)
        return
      }
    }
    try {
      const result = await apiPost(`/appointments/${appointment.id}/transition`, token, { status: nextStatus })
      await loadData()
      setError('')

      // Show contextual toast based on the status reached
      if (result?.notificationType === 'ready_for_release') {
        pushToast(
          'success',
          result.emailSent
            ? `✉️ Email sent to ${result.customerEmail} — Vehicle ready for pickup.`
            : `Status updated to Ready for Release.`,
        )
      } else if (result?.notificationType === 'released') {
        pushToast(
          'success',
          result.emailSent
            ? `✉️ Receipt & thank-you email sent to ${result.customerEmail}.`
            : `Vehicle released.`,
        )
      } else if (result?.notificationType === 'completed') {
        pushToast(
          'success',
          result.emailSent
            ? `✅ Job completed! Confirmation email sent to ${result.customerEmail}.`
            : `✅ Job marked as Completed.`,
        )
      } else if (nextStatus === 'Cancelled') {
        pushToast('warning', `Booking cancelled.`)
      } else {
        pushToast('update', `Status updated to ${nextStatus}.`)
      }

      // If a linked Job Order was auto-synced, show a secondary toast
      if (result?.jobOrderSynced) {
        pushToast('update', `Job Order also advanced: ${result.jobOrderSynced.from} → ${result.jobOrderSynced.to}.`)
      }
    } catch (err) {
      // If backend says can't release due to outstanding balance, offer override
      if (err.requiresOverride || (err.message && err.message.includes('cannot be released'))) {
        setForceReleaseConfig({
          isOpen: true,
          appointment,
          totalAmount: Number(appointment.outstanding_balance || 0) + Number(appointment.total_paid || 0),
          totalPaid: Number(appointment.total_paid || 0),
          balance: err.outstanding_balance || appointment.outstanding_balance || 0,
          reason: '',
        })
        setError('')
      } else {
        setError(err.message || `Cannot transition to "${nextStatus}"`)
      }
    }
  }

  const handleStartJob = async (appointment) => {
    try {
      const result = await apiPost(`/appointments/${appointment.id}/start-job`, token, {})
      await loadData()
      setError('')
      pushToast('success', `Job Order ${result.jobOrder?.job_order_no} created — appointment moved to In Progress.`)
      if (onNavigateToJobOrder && result.jobOrder?.id) {
        onNavigateToJobOrder(result.jobOrder.id)
      }
    } catch (err) {
      pushToast('error', err.message || 'Failed to start job.')
    }
  }

  const handleCancelAppointment = async (appointment) => {
    const totalPaid   = Number(appointment.total_paid   || 0)
    const ps          = appointment.payment_status || 'UNPAID'

    // IMPORTANT:
    // Some bookings (e.g., portal down payments) can have total_paid > 0 while
    // outstanding_balance is 0 because no invoice (sale/quotation) exists yet.
    // In that case, it is NOT “fully paid” — treat it as PARTIAL.
    const hasAnyPaid = totalPaid > 0
    const isFullPaid = hasAnyPaid && (ps === 'PAID' || ps === 'SETTLED' || ps === 'OVERPAID')
    const isPartialPaid = hasAnyPaid && !isFullPaid

    if (isPartialPaid && !bookingConfig.allowCancelPartialPayment) {
      pushToast('error', 'Cancelling bookings with partial payments is disabled by policy. Contact an Admin to override.')
      return
    }

    // Fetch cascade preview for all cases, open modal in loading state
    const guard = isFullPaid ? 'FULL' : isPartialPaid ? 'PARTIAL' : null
    setCancelModal({
      isOpen: true, appointment,
      paymentGuard: guard,
      totalPaid,
      // totalAmount is not reliable when there's no linked invoice; use it only for display.
      totalAmount: Number(appointment.outstanding_balance || 0) + totalPaid,
      action: 'refund', reason: '', loading: false,
      preview: null, previewLoading: true,
    })

    try {
      const preview = await apiGet(`/appointments/${appointment.id}/cancel-preview`, token)
      setCancelModal(prev => ({ ...prev, preview, previewLoading: false }))
    } catch (_) {
      setCancelModal(prev => ({ ...prev, previewLoading: false }))
    }
  }

  const handleApprovePortalCancelRequest = async (appointment) => {
    if (!appointment?.id) return
    const ok = window.confirm('Approve this cancellation request? This will cancel the booking.')
    if (!ok) return

    try {
      await apiPost(`/appointments/${appointment.id}/portal-cancel-request/approve`, token, {})
      await loadData()
      pushToast('success', 'Cancellation request approved. Booking cancelled.')
      window.dispatchEvent(new CustomEvent('ma:appointments-updated', { detail: { source: 'portal', appointmentId: appointment.id } }))
    } catch (err) {
      pushToast('error', err.message || 'Failed to approve cancellation request.')
    }
  }

  const handleRejectPortalCancelRequest = async (appointment) => {
    if (!appointment?.id) return
    const reason = window.prompt('Reject cancellation request (optional reason):', '')
    if (reason === null) return

    try {
      await apiPost(`/appointments/${appointment.id}/portal-cancel-request/reject`, token, { reason })
      await loadData()
      pushToast('success', 'Cancellation request rejected.')
      window.dispatchEvent(new CustomEvent('ma:appointments-updated', { detail: { source: 'portal', appointmentId: appointment.id } }))
    } catch (err) {
      pushToast('error', err.message || 'Failed to reject cancellation request.')
    }
  }

  const visibleRows = rows

  const handleToggleRow = (row, checked) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(row.key)
      } else {
        next.delete(row.key)
      }
      return next
    })
  }

  const handleToggleAll = (checked, visible) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      visible.forEach((row) => {
        if (checked) {
          next.add(row.key)
        } else {
          next.delete(row.key)
        }
      })
      return next
    })
  }

  const selectedAppointments = rows
    .filter((row) => selectedKeys.has(row.key))
    .map((row) => row.raw)

  const handleBulkStatus = async () => {
    if (!selectedAppointments.length) return
    
    // We can add bulk confirmation here if desired, keeping it direct for now as per minimal change philosophy unless asked
    try {
      await Promise.all(
        selectedAppointments.map((item) =>
          apiPatch(`/appointments/${item.id}`, token, { status: bulkStatus }),
        ),
      )
      await loadData()
      setError('')
    } catch (bulkError) {
      setError(bulkError.message)
    }
  }

  const handleBulkDelete = () => {
    if (!selectedAppointments.length) return

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Selected Bookings',
      message: `Are you sure you want to delete ${selectedAppointments.length} bookings?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          await Promise.all(
            selectedAppointments.map((item) => apiDelete(`/appointments/${item.id}`, token)),
          )
          await loadData()
          setError('')
        } catch (bulkError) {
          setError(bulkError.message)
        }
      }
    })
  }

  useEffect(() => {
    loadData(1, search, statusFilter, sortBy, sortDir, dateFrom, dateTo, viewMode).catch((loadError) =>
      setError(loadError.message),
    )
  }, [token, search, statusFilter, sortBy, sortDir, dateFrom, dateTo, viewMode])

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      if (!form.quotationId) {
        setError('Please select a quotation/sale to link this booking.')
        return
      }

      // Determine if we're editing a Completed appointment (notes-only mode)
      const editingAppointment = editingId ? rows.find(r => r.raw?.id === editingId)?.raw : null
      const isCompletedEdit = editingId && editingAppointment?.status === 'Completed'

      const payload = isCompletedEdit
        ? { notes: form.notes }
        : {
            customerId: Number(form.customerId),
            vehicleId: Number(form.vehicleId),
            quotationId: Number(form.quotationId),
            // serviceId is resolved on the backend from the sale when omitted
            ...(form.serviceId ? { serviceId: Number(form.serviceId) } : {}),
            scheduleStart: form.scheduleStart,
            scheduleEnd: form.scheduleEnd || undefined,
            installerTeam: form.installerTeam,
            status: form.status,
            notificationChannel: form.notificationChannel,
            notes: form.notes || undefined,
          }

      if (editingId) {
        await apiPatch(`/appointments/${editingId}`, token, payload)
        handleCloseModal()
        await loadData(page, search, statusFilter, sortBy, sortDir, dateFrom, dateTo)
        setError('')
      } else {
        // Create the appointment then immediately start the job so it appears in Job Orders
        const newAppointment = await apiPost('/appointments', token, payload)
        handleCloseModal()
        await loadData(page, search, statusFilter, sortBy, sortDir, dateFrom, dateTo)
        setError('')
        // Auto-start creates the Job Order and navigates there
        try {
          const result = await apiPost(`/appointments/${newAppointment.id}/start-job`, token, {})
          pushToast('success', `Booking saved — Job Order ${result.jobOrder?.job_order_no} created.`)
          if (onNavigateToJobOrder && result.jobOrder?.id) {
            onNavigateToJobOrder(result.jobOrder.id)
          }
        } catch (startErr) {
          // start-job failed (e.g. quotation mismatch) — booking was still saved; user can click Start Job manually
          pushToast('info', 'Booking saved. Click "Start Job" in the table to create a Job Order.')
        }
      }
    } catch (createError) {
      setError(createError.message)
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Scheduling & Client Notifications"
        subtitle="Day/Week/Month booking, resource assignment, and status workflow"
        actionLabel={showForm ? 'Cancel booking' : '+ New booking'}
        onActionClick={() => {
          if (showForm) {
            handleCloseModal()
          } else {
            setForm(initialFormState)
            setAutoEndInfo(null)
            setShowForm(true)
            setEditingId(null)
          }
        }}
      >
        {/* ── Active / History tab switcher ── */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
          {[{ key: 'active', label: 'Active Bookings' }, { key: 'history', label: 'History' }].map(({ key, label }) => {
            const isSelected = viewMode === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setViewMode(key)
                  setPage(1)
                  setStatusFilter('')
                  setSortBy(key === 'history' ? 'completedAt' : 'createdAt')
                  setSortDir('desc')
                }}
                style={{
                  padding: '8px 22px',
                  border: 'none',
                  borderBottom: isSelected ? '2px solid #ffffff' : '2px solid transparent',
                  background: 'transparent',
                  color: isSelected ? '#ffffff' : 'rgba(189,200,218,0.5)',
                  fontWeight: isSelected ? 700 : 400,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                  outline: 'none',
                  letterSpacing: '0.02em',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="module-toolbar">
          <input
            type="search"
            placeholder="Search customer, plate..."
            value={search}
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
          />
          {/* Status sub-filter — only shown on the Active tab */}
          {viewMode === 'active' && (
            <div className="toolbar-filters">
              {['', 'Scheduled', 'Checked-In', 'In Progress', 'For QA', 'Ready for Release', 'Paid', 'Released'].map((s) => (
                <button
                  key={s || 'all'}
                  type="button"
                  className={`filter-chip${statusFilter === s ? ' active' : ''}`}
                  onClick={() => { setPage(1); setStatusFilter(s) }}
                >
                  {s || 'All Active'}
                </button>
              ))}
            </div>
          )}
        </div>

        <DataTable
          headers={
            viewMode === 'history'
              ? ['Closed At', 'Customer', 'Plate', 'Service', 'Installer Team', 'Status / Payment']
              : ['Time', 'Customer', 'Plate', 'Service', 'Installer Team', 'Status / Payment']
          }
          rows={visibleRows}
          onRowClick={(raw) => handleEdit(raw)}
          rowActions={(appointment) => {
            const currentStatus = appointment.status
            const nextMeta = STATUS_NEXT_LABEL[currentStatus]
            const isCompleted = currentStatus === 'Completed'
            const isCancelled = currentStatus === 'Cancelled'
            const isTerminal = isCompleted || isCancelled
            const canStartJob = (currentStatus === 'Scheduled' || currentStatus === 'Checked-in' || currentStatus === 'Checked-In')
            const isAdmin = user?.role === 'SuperAdmin'
            const cancelReqPending = String(appointment?.cancel_request_status || '').toUpperCase() === 'PENDING'
            const canResolveCancelReq = user?.role === 'Admin' || user?.role === 'Manager' || user?.role === 'SuperAdmin'
            return (
              <div className="row-actions">
                {/* Start Job icon — creates JO, advances to In Progress */}
                {canStartJob && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    style={{ color: '#10b981', borderColor: '#10b981', whiteSpace: 'nowrap' }}
                    title="Start Job — creates a Job Order and advances to In Progress"
                    aria-label="Start Job"
                    onClick={() => handleStartJob(appointment)}
                  >
                    Start Job
                  </button>
                )}

                {/* ── Non-Completed actions ───────────────────────────── */}
                {!isCompleted && (
                  <>
                    {/* Edit — gated by allow_edit_after_approval */}
                    {(() => {
                      const isScheduled = appointment.status === 'Scheduled'
                      const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager'
                      const editBlocked = !bookingConfig.allowEditAfterApproval && !isScheduled && !isAdminOrManager
                      return (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => editBlocked ? pushToast('error', 'Editing after approval is disabled by booking policy.') : handleEdit(appointment)}
                          title={editBlocked ? 'Editing after approval is disabled by policy' : 'Edit booking'}
                          aria-label="Edit"
                          style={editBlocked ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )
                    })()}

                    {/* View Invoice */}
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleViewInvoice(appointment)}
                      title="View invoice reference"
                      aria-label="View Invoice"
                      style={{ color: '#a0a8b8' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </button>

                    {/* Cancel — only for non-terminal; style varies by payment state */}
                    {!isTerminal && cancelReqPending && canResolveCancelReq && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleApprovePortalCancelRequest(appointment)}
                          title="Approve portal cancellation request"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Approve Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleRejectPortalCancelRequest(appointment)}
                          title="Reject portal cancellation request"
                          style={{ whiteSpace: 'nowrap', color: '#ef4444', borderColor: '#ef4444' }}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {!isTerminal && cancelReqPending && !canResolveCancelReq && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled
                        title="Cancellation request pending approval"
                        style={{ whiteSpace: 'nowrap', opacity: 0.6, cursor: 'not-allowed' }}
                      >
                        Cancel Requested
                      </button>
                    )}

                    {!isTerminal && !cancelReqPending && (() => {
                      const tp    = Number(appointment.total_paid || 0)
                      const ps    = appointment.payment_status || 'UNPAID'
                      const hasAnyPaid = tp > 0
                      const fullPaid    = hasAnyPaid && (ps === 'PAID' || ps === 'SETTLED' || ps === 'OVERPAID')
                      const partialPaid = hasAnyPaid && !fullPaid
                      const cancelIcon  = (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )
                      const isAdminOrManager = user?.role === 'Admin' || user?.role === 'Manager'
                      if (fullPaid) return (
                        <button type="button" className="btn-icon"
                          onClick={() => isAdminOrManager ? handleCancelAppointment(appointment) : null}
                          disabled={!isAdminOrManager}
                          title={isAdminOrManager
                            ? 'Fully paid — choose refund or credit before cancelling'
                            : 'Cannot cancel — customer has paid in full. Contact an Admin.'}
                          aria-label="Cancel with refund"
                          style={isAdminOrManager
                            ? { color: '#ef4444' }
                            : { color: '#94a3b8', cursor: 'not-allowed', opacity: 0.45 }}
                        >{cancelIcon}</button>
                      )
                      if (partialPaid) return (
                        <button type="button" className="btn-icon"
                          onClick={() => handleCancelAppointment(appointment)}
                          title="Partial payment exists — cancellation requires refund, credit, or reschedule"
                          aria-label="Cancel with resolution"
                          style={{ color: '#f59e0b' }}
                        >{cancelIcon}</button>
                      )
                      return (
                        <button type="button" className="btn-icon action-danger"
                          onClick={() => handleCancelAppointment(appointment)}
                          title="Cancel booking"
                          aria-label="Cancel"
                        >{cancelIcon}</button>
                      )
                    })()}

                    {/* Delete — SuperAdmin only. Disabled (with tooltip) if customer has paid. */}
                    {(() => {
                      const isPaid = appointment.status === 'Paid'
                        || (appointment.payment_status && appointment.payment_status !== 'UNPAID')
                        || Number(appointment.total_paid || 0) > 0
                      const isDisabled = !isAdmin || isPaid
                      return (
                        <button
                          type="button"
                          className={isDisabled ? 'btn-icon' : 'btn-icon action-danger'}
                          disabled={isDisabled}
                          onClick={() => !isDisabled && handleDelete(appointment.id)}
                          title={!isAdmin ? 'Access restricted — SuperAdmin only' : isPaid ? 'Deletion disabled — customer has already paid' : 'Delete booking'}
                          aria-label="Delete"
                          style={isDisabled ? { color: '#94a3b8', cursor: 'not-allowed', opacity: 0.45 } : undefined}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      )
                    })()}
                  </>
                )}

                {/* ── Completed status actions ────────────────────────── */}
                {isCompleted && (
                  <>
                    {/* View Details / Edit Notes */}
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleEdit(appointment)}
                      title="View details / Edit notes"
                      aria-label="View Details"
                      style={{ color: '#a0a8b8' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                    {/* View Invoice */}
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleViewInvoice(appointment)}
                      title="View invoice reference"
                      aria-label="View Invoice"
                      style={{ color: '#a0a8b8' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </button>

                    {/* Archive — SuperAdmin only; hidden if already archived */}
                    {!appointment.archived_at && (
                      <button
                        type="button"
                        className={isAdmin ? 'btn-icon action-danger' : 'btn-icon'}
                        onClick={() => isAdmin && handleArchive(appointment)}
                        disabled={!isAdmin}
                        title={!isAdmin ? 'Access restricted — SuperAdmin only' : 'Archive this completed booking'}
                        aria-label="Archive"
                        style={isAdmin ? { color: '#f97316' } : { color: '#94a3b8', cursor: 'not-allowed', opacity: 0.45 }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="21 8 21 21 3 21 3 8" />
                          <rect x="1" y="3" width="22" height="5" />
                          <line x1="10" y1="12" x2="14" y2="12" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          }}
        />

        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={(nextPage) =>
            loadData(nextPage, search, statusFilter, sortBy, sortDir, dateFrom, dateTo, viewMode).catch((e) =>
              setError(e.message),
            )
          }
        />

        <Modal
          isOpen={showForm}
          onClose={handleCloseModal}
          className="modal-booking"
          wide
          title={(() => {
            if (!editingId) return 'New Booking'
            const editingAppt = rows.find(r => r.raw?.id === editingId)?.raw
            return editingAppt ? `Booking — ${editingAppt.customer_name}` : 'Edit Booking'
          })()}
        >
          {showForm && (
            <div className="booking-modal-content">
              {editingId && (() => {
                const appt = rows.find(r => r.raw?.id === editingId)?.raw
                if (!appt) return null
                const cust = customers.find(c => Number(c.id) === Number(appt.customer_id))
                return (
                  <div className="booking-header-overview" style={{ marginBottom: '24px' }}>
                    <div className="qo-detail-strip" style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', padding: '15px' }}>
                      <div className="qo-strip-cell">
                        <span className="qo-strip-label">Customer</span>
                        <strong className="qo-strip-value" style={{ display: 'block', fontSize: '1.05rem' }}>{appt.customer_name}</strong>
                        {cust?.mobile && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>📞 {cust.mobile}</span>}
                      </div>
                      <div className="qo-strip-divider" />
                      <div className="qo-strip-cell">
                        <span className="qo-strip-label">Vehicle</span>
                        <strong className="qo-strip-value" style={{ display: 'block' }}>{appt.plate_number || '—'}</strong>
                        {appt.vehicle_id && (() => {
                          const v = vehicles.find(veh => Number(veh.id) === Number(appt.vehicle_id))
                          if (!v) return null
                          return <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{[v.make, v.model, v.year].filter(Boolean).join(' ')}</span>
                        })()}
                      </div>
                      <div className="qo-strip-divider" />
                      <div className="qo-strip-cell">
                        <span className="qo-strip-label">Services</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {(appt.all_services || appt.service_name || 'Custom').split(' | ').map((s, idx) => (
                            <span key={idx} style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.12)' }}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="qo-strip-divider" />
                      <div className="qo-strip-cell" style={{ textAlign: 'right' }}>
                        <div style={{ marginBottom: '6px' }}>
                          <StatusBadge status={appt.status} />
                        </div>
                        <PaymentStatusBadge status={appt.payment_status} />
                      </div>
                    </div>
                  </div>
                )
              })()}
              
              <form className="entity-form" onSubmit={handleSubmit}>
            {/* Derive completed-edit mode from current rows */}
            {(() => {
              const editingAppt = editingId ? rows.find(r => r.raw?.id === editingId)?.raw : null
              const isCompletedEdit = !!editingAppt && editingAppt.status === 'Completed'
              return (
                <>
                  {/* Banner for Completed bookings */}
                  {isCompletedEdit && (
                    <div className="full-width" style={{
                      background: 'rgba(100,116,139,0.15)',
                      border: '1px solid rgba(100,116,139,0.4)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      marginBottom: '16px',
                      color: '#94a3b8',
                      fontSize: '0.85rem',
                    }}>
                      <strong style={{ color: '#64748b' }}>✓ Completed Booking</strong> — Full editing is disabled. Only the <em>Notes</em> field can be updated.
                    </div>
                  )}

                  {/* All standard fields — disabled when editing a Completed booking */}
                  <fieldset disabled={isCompletedEdit} style={{ border: 'none', margin: 0, padding: 0 }}>
                    <div className="vf-section-divider">
                      <span className="vf-section-icon">👤</span>
                      <span className="vf-section-label">Primary Selection</span>
                      <span className="vf-section-line" />
                    </div>
                    <div className="form-group full-width">
                      <label className="vf-label">👤 Customer</label>
                      {lockedCustomerId ? (
                        <div style={{ padding: '8px 10px', background: '#0b1220', borderRadius: 6 }}>
                          <strong>
                            {(customers.find(c => String(c.id) === String(form.customerId)) || {}).full_name || 'Customer'}
                          </strong>
                          <input type="hidden" name="customerId" value={form.customerId} />
                        </div>
                      ) : (
                        <SearchableSelect
                          options={customers.map((c) => ({
                            value: String(c.id),
                            label: c.full_name,
                            description: [c.mobile, c.email].filter(Boolean).join(' • ') || undefined,
                          }))}
                          value={form.customerId}
                          onChange={(newCustomerId) => {
                            const customerSales = sales.filter(s => String(s.customer_id) === String(newCustomerId))
                            const autoSale = customerSales[0] || null
                            const autoLabel = autoSale
                              ? (Array.isArray(autoSale.services)
                                  ? autoSale.services.map((s) => s.name).join(', ')
                                  : autoSale.service_package || '')
                              : ''
                            const matchedService = autoSale
                              ? services.find(sv =>
                                  autoLabel &&
                                  (sv.name.toLowerCase() === autoLabel.toLowerCase() ||
                                   autoLabel.toLowerCase().includes(sv.name.toLowerCase()) ||
                                   sv.name.toLowerCase().includes(autoLabel.toLowerCase()))
                                )
                              : null
                            setForm((prev) => ({
                              ...prev,
                              customerId: newCustomerId,
                              quotationId: autoSale ? String(autoSale.id) : '',
                              saleServiceLabel: autoLabel,
                              serviceId: matchedService?.id || '',
                              vehicleId: autoSale?.vehicle_id ? String(autoSale.vehicle_id) : '',
                            }))
                          }}
                          placeholder="— Search customer —"
                        />
                      )}
                    </div>
                    <div className="vf-section-divider">
                      <span className="vf-section-icon">📅</span>
                      <span className="vf-section-label">Booking Details</span>
                      <span className="vf-section-line" />
                    </div>
                    <div className="form-row" style={{ display: 'flex', gap: 16 }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="vf-label">👤 Customer</label>
                        {lockedCustomerId ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="text" readOnly value={(customers.find(c => String(c.id) === String(form.customerId)) || {}).full_name || 'Customer'} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, background: '#0b0f12', color: '#ffffff', border: '1px solid rgba(255,255,255,0.06)' }} />
                            <input type="hidden" name="customerId" value={form.customerId} />
                          </div>
                        ) : (
                          <SearchableSelect
                            options={customers.map((c) => ({
                              value: String(c.id),
                              label: c.full_name,
                              description: [c.mobile, c.email].filter(Boolean).join(' • ') || undefined,
                            }))}
                            value={form.customerId}
                            onChange={(v) => setForm((prev) => ({ ...prev, customerId: v }))}
                            placeholder="— Select customer —"
                          />
                        )}
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="vf-label">🚗 Vehicle</label>
                        {lockedVehicleId ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="text" readOnly value={(vehicles.find(v => String(v.id) === String(form.vehicleId)) || {}).plate_number || 'Vehicle'} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, background: '#0b0f12', color: '#ffffff', border: '1px solid rgba(255,255,255,0.06)' }} />
                            <input type="hidden" name="vehicleId" value={form.vehicleId} />
                          </div>
                        ) : (
                          <SearchableSelect
                            options={vehicles.map((v) => ({
                              value: String(v.id),
                              label: v.plate_number || `Vehicle #${v.id}`,
                              description: [v.make, v.model, v.vehicle_year || v.year].filter(Boolean).join(' ') || undefined,
                            }))}
                            value={form.vehicleId}
                            onChange={(v) => setForm((prev) => ({ ...prev, vehicleId: v }))}
                            placeholder="— Select vehicle —"
                          />
                        )}
                      </div>

                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="vf-label">💳 Quotation / Sale <span className="vf-required">*</span></label>
                        {((lockedCustomerId || editingId) && form.quotationId) ? (() => {
                          const lockedId = form.quotationId
                          const lockedSale = sales.find(s => String(s.id) === String(lockedId))
                          const lockedLabel = lockedSale
                            ? (Array.isArray(lockedSale.services)
                                ? lockedSale.services.map((s) => s.name).join(', ')
                                : lockedSale.service_package || '')
                            : ''
                          const displayText = lockedSale
                            ? `${lockedSale.quotation_no || lockedSale.reference_no}${lockedLabel ? ' · ' + lockedLabel : ''}`
                            : `Quotation #${form.quotationId}`
                          return (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="text"
                                readOnly
                                value={displayText}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, background: '#0b0f12', color: '#ffffff', border: '1px solid rgba(255,255,255,0.06)', cursor: 'default' }}
                              />
                              <input type="hidden" name="quotationId" value={form.quotationId} />
                            </div>
                          )
                        })() : (
                        <SearchableSelect
                          options={(form.customerId
                            ? sales.filter(s => String(s.customer_id) === String(form.customerId))
                            : sales
                          ).filter((sale) => {
                            const currentEditingQuotationId = editingId
                              ? rows.find(r => r.raw.id === editingId)?.raw?.quotation_id
                              : null
                            if (currentEditingQuotationId && Number(sale.id) === Number(currentEditingQuotationId)) return true
                            return Number(sale.appointment_count || 0) === 0
                          }).map((sale) => {
                            const svcLabel = Array.isArray(sale.services)
                              ? sale.services.map((s) => s.name).join(', ')
                              : (sale.service_package || '')
                            return {
                              value: String(sale.id),
                              label: sale.quotation_no || sale.reference_no,
                              description: [sale.customer_name, svcLabel].filter(Boolean).join(' · ') || undefined,
                            }
                          })}
                          value={form.quotationId}
                          onChange={(v) => {
                            const selectedSale = sales.find(s => Number(s.id) === Number(v))
                            const selectedLabel = selectedSale
                              ? (Array.isArray(selectedSale.services)
                                  ? selectedSale.services.map((s) => s.name).join(', ')
                                  : selectedSale.service_package || '')
                              : ''
                            const matchedService = selectedSale
                              ? services.find(sv =>
                                  selectedLabel &&
                                  (sv.name.toLowerCase() === selectedLabel.toLowerCase() ||
                                   selectedLabel.toLowerCase().includes(sv.name.toLowerCase()) ||
                                   sv.name.toLowerCase().includes(selectedLabel.toLowerCase()))
                                )
                              : null
                            const duration = selectedSale ? getServiceDuration(Array.isArray(selectedSale.services) ? selectedSale.services : []) : null
                            setAutoEndInfo(duration)
                            setForm(prev => ({
                              ...prev,
                              quotationId: v,
                              saleServiceLabel: selectedLabel,
                              serviceId: matchedService?.id || '',
                              customerId: selectedSale?.customer_id ? String(selectedSale.customer_id) : prev.customerId,
                              vehicleId: selectedSale?.vehicle_id ? String(selectedSale.vehicle_id) : prev.vehicleId,
                              scheduleEnd: duration && prev.scheduleStart ? computeEndFromStart(prev.scheduleStart, duration.days) : prev.scheduleEnd,
                            }))
                          }}
                          placeholder="— Select quotation —"
                        />
                        )}
                      </div>
                    </div>

                    <div className="form-row" style={{ display: 'flex', gap: 16 }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="vf-label">📅 Start Date &amp; Time</label>
                        <DatePicker
                          selected={selectedStartDate}
                          onChange={(date) => {
                            if (date) {
                              const pad = (n) => String(n).padStart(2, '0')
                              const localISOTime = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
                              setForm((prev) => ({
                                ...prev,
                                scheduleStart: localISOTime,
                                scheduleEnd: autoEndInfo ? computeEndFromStart(localISOTime, autoEndInfo.days) : prev.scheduleEnd,
                              }))
                            } else {
                              setForm((prev) => ({ ...prev, scheduleStart: '' }))
                            }
                          }}
                          showTimeSelect
                          timeFormat="h:mm aa"
                          timeIntervals={TIME_INTERVAL}
                          dateFormat="MMMM d, yyyy h:mm aa"
                          placeholderText="Select date & time"
                          minDate={isCompletedEdit ? undefined : new Date()}
                          minTime={getMinTimeForDate(selectedStartDate)}
                          maxTime={getMaxTimeForDate(selectedStartDate)}
                          filterTime={filterTimeOption}
                          required={!isCompletedEdit}
                          disabled={isCompletedEdit}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="vf-label">
                          🗓 Est. End Date &amp; Time
                          {autoEndInfo && (
                            <span style={{ marginLeft: 7, fontSize: '0.65rem', fontWeight: 700, color: '#a0a8b8', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                              {autoEndInfo.label}
                            </span>
                          )}
                        </label>
                        <DatePicker
                          selected={selectedEndDate}
                          onChange={(date) => {
                            if (date) {
                              const pad = (n) => String(n).padStart(2, '0')
                              const localISOTime = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
                              setForm((prev) => ({ ...prev, scheduleEnd: localISOTime }))
                            } else {
                              setForm((prev) => ({ ...prev, scheduleEnd: '' }))
                            }
                          }}
                          showTimeSelect
                          timeFormat="h:mm aa"
                          timeIntervals={TIME_INTERVAL}
                          dateFormat="MMMM d, yyyy h:mm aa"
                          placeholderText="Auto-calculated or pick manually"
                          minDate={selectedStartDate || (!isCompletedEdit ? new Date() : undefined)}
                          minTime={getMinTimeForDate(selectedEndDate)}
                          maxTime={getMaxTimeForDate(selectedEndDate)}
                          filterTime={filterTimeOption}
                          disabled={isCompletedEdit}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="vf-label">🔖 Status</label>
                        <select
                          value={form.status}
                          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        >
                          <option>Scheduled</option>
                          <option>Checked-in</option>
                          <option>In progress</option>
                          <option>QA</option>
                          <option>Ready for release</option>
                          <option>Completed/Released</option>
                        </select>
                      </div>
                    </div>
                  </fieldset>

                  {/* ── Service Process Panel ── */}
                  {autoEndInfo && autoEndInfo.label !== 'Other — 1 day' && (() => {
                    const isCoating   = autoEndInfo.label.includes('Coating')
                    const isPpf       = autoEndInfo.label.includes('PPF')
                    const isTint      = autoEndInfo.label.includes('Tint')
                    const isExtDetail = autoEndInfo.label.includes('Exterior')
                    const isIntDetail = autoEndInfo.label.includes('Interior')

                    const coatingSteps = [
                      { num:1, name:'Premium wash',               timing:'1st day' },
                      { num:2, name:'Decontamination',            timing:'1st day' },
                      { num:3, name:'Exterior detailing',         timing:'1st–2nd day', note:'depends on car condition' },
                      { num:4, name:'Ceramic / Graphene coating', timing:'1st day' },
                      { num:5, name:'Curing',                     timing:'2nd day' },
                      { num:6, name:'Release',                    timing:'2nd day afternoon' },
                    ]
                    const ppfSteps = [
                      { num:1, name:'Surface prep & decontamination', timing:'Day 1' },
                      { num:2, name:'Film cutting & templating',      timing:'Day 2' },
                      { num:3, name:'PPF application begins',         timing:'Day 3' },
                      { num:4, name:'Application continues',          timing:'Days 3–5' },
                      { num:5, name:'Film trimming & edge sealing',   timing:'Day 5' },
                      { num:6, name:'Curing stage',                   timing:'Day 6' },
                      { num:7, name:'Final inspection & release',     timing:'Day 7' },
                    ]
                    const tintSteps = [
                      { num:1, name:'Vehicle inspection & glass cleaning', timing:'Day 1' },
                      { num:2, name:'Tint film application',               timing:'Day 2' },
                      { num:3, name:'Curing stage',                        timing:'Day 3', warning:'⚠ Do not roll down windows during curing' },
                      { num:4, name:'Final check & release',               timing:'Day 3/4' },
                    ]
                    const extSteps = [
                      { num:1, name:'Initial Vehicle Checking', timing:'1st day', note:'damages, paint defects, etc.' },
                      { num:2, name:'Decontamination',          timing:'1st day' },
                      { num:3, name:'Exterior Detailing',       timing:'1st–3rd day', note:"days of work will vary on the car's condition" },
                    ]
                    const intSteps = [
                      { num:1, name:'Initial Vehicle Checking',      timing:'1st day', note:'interior — dust, dirt, etc.' },
                      { num:2, name:'Chair & Matting Removal',        timing:'1st day' },
                      { num:3, name:'Vacuum & Vacmaster',             timing:'2nd day', note:'deep vacuum of seats and carpets' },
                      { num:4, name:'Drying Stage & Reinstallation',  timing:'3rd–4th day', note:'reinstall all chairs and carpets, release car' },
                    ]

                    const title = isCoating ? 'Coating Service Process'
                      : isPpf       ? 'PPF Installation Process'
                      : isTint      ? 'Window Tint Process'
                      : isExtDetail ? 'Exterior Detail Process'
                      : 'Interior Detail Process'

                    const steps = isCoating ? coatingSteps
                      : isPpf       ? ppfSteps
                      : isTint      ? tintSteps
                      : isExtDetail ? extSteps
                      : intSteps

                    return (
                      <div style={{ margin: '12px 0 4px', background: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ width:26, height:26, borderRadius:'50%', background:'linear-gradient(135deg,#3a3a3a,#1c1c1c)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                          <div>
                            <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#f1f5f9' }}>{title}</div>
                            <div style={{ fontSize:'0.68rem', color:'#64748b' }}>{autoEndInfo.label}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                          {steps.map((s) => (
                            <div key={s.num} style={{ display:'flex', alignItems:'center', gap:8, background:'#111111', border:'1px solid #2a2a2a', borderRadius:6, padding:'6px 10px', flex:'1 1 calc(50% - 6px)', minWidth:220 }}>
                              <div style={{ width:20, height:20, borderRadius:4, background:'#1a1a1a', border:'1px solid #333333', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <span style={{ fontSize:'0.65rem', fontWeight:700, color:'#a0a8b8' }}>{s.num}</span>
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                                  <span style={{ fontSize:'0.75rem', fontWeight:700, color:'#e2e8f0' }}>{s.name}</span>
                                  <span style={{ fontSize:'0.63rem', color:'#a0a8b8', whiteSpace:'nowrap' }}>{s.timing}</span>
                                </div>
                                {s.note && <div style={{ fontSize:'0.63rem', color:'#475569' }}>{s.note}</div>}
                                {s.warning && <div style={{ fontSize:'0.63rem', color:'#f87171', fontWeight:600 }}>{s.warning}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #2a2a2a', display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:'0.7rem', fontWeight:600, color:'#94a3b8', whiteSpace:'nowrap' }}>Estimated Duration</span>
                          <div style={{ flex:1, height:4, background:'#111111', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:'100%', background:'linear-gradient(90deg,#909090,#a0a8b8)', borderRadius:99 }} />
                          </div>
                          <span style={{ fontSize:'0.7rem', fontWeight:700, color:'#909090', whiteSpace:'nowrap' }}>{autoEndInfo.label.split('—')[1]?.trim()}</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Notes — always editable, including for Completed bookings */}
                  <div className="vf-section-divider" style={{ marginTop: 8 }}>
                    <span className="vf-section-icon">📝</span>
                    <span className="vf-section-label">Additional Information</span>
                    <span className="vf-section-line" />
                  </div>
                  <div className="form-group full-width" style={{ marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Notes / Remarks
                      {isCompletedEdit && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, color: '#10b981',
                          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                          borderRadius: '4px', padding: '1px 6px', letterSpacing: '0.04em',
                        }}>EDITABLE</span>
                      )}
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Optional notes or follow-up remarks..."
                      value={form.notes}
                      onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                      style={{
                        width: '100%',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        color: '#f0f3f8',
                        resize: 'vertical',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Policy notices driven by Booking Rules config */}
                  {!editingId && bookingConfig.autoCancelUnpaidHours > 0 && (
                    <div className="full-width">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: '10px', padding: '11px 14px' }}>
                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>⏱️</span>
                        <div style={{ fontSize: '0.8rem', color: '#fde68a', lineHeight: 1.5 }}>
                          Unpaid bookings are automatically cancelled after <strong>{bookingConfig.autoCancelUnpaidHours} hour{bookingConfig.autoCancelUnpaidHours !== 1 ? 's' : ''}</strong>. Ensure payment is recorded promptly.
                        </div>
                      </div>
                    </div>
                  )}
                  {!editingId && bookingConfig.autoCompleteWhenPaid && (
                    <div className="full-width">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', padding: '11px 14px' }}>
                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>✅</span>
                        <div style={{ fontSize: '0.8rem', color: '#6ee7b7', lineHeight: 1.5 }}>
                          This booking will be <strong>automatically marked as Completed</strong> once full payment is received.
                        </div>
                      </div>
                    </div>
                  )}
                  {!editingId && !bookingConfig.allowCancelPartialPayment && (
                    <div className="full-width">
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '10px', padding: '11px 14px' }}>
                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>🚫</span>
                        <div style={{ fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.5 }}>
                          <strong>Partial payment cancellations are disabled.</strong> Once a partial payment is recorded, this booking cannot be cancelled without Admin intervention.
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="full-width" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', padding: '10px 14px', color: '#ef4444', fontSize: '0.875rem', marginTop: '4px' }}>
                      {error}
                    </div>
                  )}

                  <div className="vf-form-actions full-width">
                    <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary vf-submit">
                      {editingId ? (isCompletedEdit ? '✓ Save Notes' : '✓ Update Booking') : '+ Create Booking'}
                    </button>
                  </div>
                </>
              )
            })()}
          </form>
        </div>
        )}
      </Modal>

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
          variant={confirmConfig.variant || 'danger'}
        />

        {/* Cancellation Modal — unified for unpaid / partial / full */}
        <Modal
          isOpen={cancelModal.isOpen}
          onClose={() => !cancelModal.loading && setCancelModal(prev => ({ ...prev, isOpen: false }))}
          title={
            cancelModal.paymentGuard === null
              ? 'Cancel Booking'
              : cancelModal.paymentGuard === 'FULL'
                ? '⚠️ Full Payment — Refund Required'
                : '⚠️ Partial Payment — Choose a Resolution'
          }
        >
          <div style={{ padding: '8px 0 16px' }}>

            {/* ── Cascade effects panel ── */}
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                Cancelling this booking will:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'rgba(189,200,218,0.85)', fontSize: '0.875rem', lineHeight: 1.9 }}>
                <li>Mark this <strong style={{ color: '#f0f3f8' }}>Scheduling</strong> record as <strong style={{ color: '#ef4444' }}>Cancelled</strong></li>
                <li>
                  {cancelModal.previewLoading
                    ? <span style={{ color: 'rgba(189,200,218,0.45)', fontStyle: 'italic' }}>Loading affected job orders…</span>
                    : cancelModal.preview?.affectedJobOrders?.length
                      ? <>Cancel <strong style={{ color: '#f0f3f8' }}>{cancelModal.preview.affectedJobOrders.length}</strong> linked Job Order{cancelModal.preview.affectedJobOrders.length !== 1 ? 's' : ''} ({cancelModal.preview.affectedJobOrders.map(jo => jo.job_order_no).join(', ')})</>
                      : <span style={{ color: 'rgba(189,200,218,0.45)' }}>No active Job Orders linked</span>
                  }
                </li>
                {cancelModal.paymentGuard !== null && (
                  <li>Update payment record as <strong style={{ color: cancelModal.paymentGuard === 'FULL' ? '#ef4444' : '#f59e0b' }}>{cancelModal.paymentGuard === 'FULL' ? 'Refunded' : 'Cancelled / Credited'}</strong></li>
                )}
                {!cancelModal.previewLoading && cancelModal.preview?.hasCustomerEmail && (
                  <li>Send a <strong style={{ color: '#aaaaaa' }}>cancellation notification</strong> email to the customer</li>
                )}
              </ul>
            </div>

            {/* ── Payment summary banner (paid cases only) ── */}
            {cancelModal.paymentGuard !== null && (
              <>
                <div style={{ background: cancelModal.paymentGuard === 'FULL' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', border: `1px solid ${cancelModal.paymentGuard === 'FULL' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                  <div style={{ fontWeight: 700, color: cancelModal.paymentGuard === 'FULL' ? '#ef4444' : '#f59e0b', marginBottom: '8px' }}>
                    {cancelModal.paymentGuard === 'FULL' ? 'Customer has paid in full' : 'Customer has made a partial payment'}
                  </div>
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    {[{ label: 'Amount Paid', value: cancelModal.totalPaid, color: '#10b981' }, { label: 'Total Amount', value: cancelModal.totalAmount, color: '#c7d4f0' }].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: '0.72rem', color: 'rgba(189,200,218,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>&#8369;{Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ color: 'rgba(189,200,218,0.8)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '16px' }}>
                  {cancelModal.paymentGuard === 'FULL'
                    ? <>Direct cancellation is blocked. You must process a <strong style={{ color: '#10b981' }}>refund</strong> or apply the payment as a <strong style={{ color: '#aaaaaa' }}>credit</strong> before cancelling.</>
                    : <>Direct cancellation is not allowed while a partial payment exists. Choose how to resolve it:</>
                  }
                </div>

                {/* Action selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {[
                    { value: 'refund',     label: 'Refund payment',             desc: 'Cancel the booking and flag the paid amount for manual refund processing.',    color: '#ef4444' },
                    { value: 'credit',     label: 'Apply as credit / voucher',   desc: 'Cancel the booking and log the paid amount as credit toward a future booking.', color: '#aaaaaa' },
                    { value: 'reschedule', label: 'Reschedule the booking',       desc: "Don't cancel — open a new booking pre-filled with this customer's details.",   color: '#10b981', hide: cancelModal.paymentGuard === 'FULL' },
                  ].filter(o => !o.hide).map(({ value, label, desc, color }) => (
                    <label key={value}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: `1px solid ${cancelModal.action === value ? color + '88' : 'rgba(255,255,255,0.08)'}`, background: cancelModal.action === value ? color + '15' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <input type="radio" name="cancel_action" value={value}
                        checked={cancelModal.action === value}
                        onChange={() => setCancelModal(prev => ({ ...prev, action: value }))}
                        style={{ marginTop: '3px', accentColor: color }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color, fontSize: '0.9rem' }}>{label}</div>
                        <div style={{ color: 'rgba(189,200,218,0.6)', fontSize: '0.8rem', marginTop: '2px' }}>{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}

            {/* ── Reason field (all cases) ── */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: 'rgba(189,200,218,0.7)', fontSize: '0.85rem', marginBottom: '6px' }}>Reason / Notes <span style={{ color: 'rgba(189,200,218,0.4)', fontStyle: 'italic' }}>(optional)</span></label>
              <textarea rows={2}
                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px', color: '#f0f3f8', resize: 'vertical', fontSize: '0.875rem', boxSizing: 'border-box' }}
                placeholder="e.g. Customer cancelled due to schedule conflict..."
                value={cancelModal.reason}
                onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            {/* ── Footer buttons ── */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary"
                onClick={() => setCancelModal(prev => ({ ...prev, isOpen: false }))}
                disabled={cancelModal.loading}
              >Close</button>

              {cancelModal.paymentGuard === null ? (
                /* Unpaid — simple confirm cancel */
                <button type="button"
                  disabled={cancelModal.loading}
                  style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px', padding: '8px 18px', fontWeight: 600, cursor: cancelModal.loading ? 'not-allowed' : 'pointer', opacity: cancelModal.loading ? 0.6 : 1 }}
                  onClick={async () => {
                    setCancelModal(prev => ({ ...prev, loading: true }))
                    try {
                      await apiPost(`/appointments/${cancelModal.appointment.id}/transition`, token, {
                        status: 'Cancelled',
                        cancelReason: cancelModal.reason,
                      })
                      setCancelModal(prev => ({ ...prev, isOpen: false, loading: false }))
                      await loadData()
                      pushToast('warning', 'Booking cancelled.')
                      setError('')
                    } catch (err) {
                      setCancelModal(prev => ({ ...prev, loading: false }))
                      setError(err.message || 'Cancellation failed.')
                    }
                  }}
                >
                  {cancelModal.loading ? 'Cancelling…' : 'Confirm Cancellation'}
                </button>
              ) : (
                /* Paid (partial / full) — call cancel-with-action */
                <button type="button" className="btn-primary"
                  disabled={cancelModal.loading}
                  style={cancelModal.action === 'reschedule'
                    ? { background: 'rgba(16,185,129,0.2)', borderColor: '#10b981', color: '#10b981' }
                    : cancelModal.action === 'credit'
                      ? { background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.22)', color: '#aaaaaa' }
                      : { background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ef4444' }}
                  onClick={async () => {
                    setCancelModal(prev => ({ ...prev, loading: true }))
                    try {
                      const result = await apiPost(
                        `/appointments/${cancelModal.appointment.id}/cancel-with-action`,
                        token,
                        { action: cancelModal.action, cancelReason: cancelModal.reason },
                      )
                      setCancelModal(prev => ({ ...prev, isOpen: false, loading: false }))
                      if (result.action === 'reschedule') {
                        const t = result.bookingTemplate || {}
                        setForm({ ...initialFormState, customerId: String(t.customer_id || ''), vehicleId: String(t.vehicle_id || ''), serviceId: '', quotationId: '', installerTeam: t.assigned_team || '', notes: t.notes || '', status: 'Scheduled' })
                        setEditingId(null)
                        setShowForm(true)
                        pushToast('info', result.message || 'Original booking kept. Fill in a new date and save.')
                      } else {
                        await loadData()
                        pushToast(result.action === 'refund' ? 'warning' : 'success', result.message)
                      }
                      setError('')
                    } catch (err) {
                      setCancelModal(prev => ({ ...prev, loading: false }))
                      setError(err.message || 'Action failed.')
                    }
                  }}
                >
                  {cancelModal.loading ? 'Processing…' : cancelModal.action === 'reschedule' ? 'Open Reschedule Form' : cancelModal.action === 'credit' ? 'Cancel — Apply Credit' : 'Cancel — Flag Refund'}
                </button>
              )}
            </div>
          </div>
        </Modal>

{/* Conditional Release Modal */}
        <Modal
          isOpen={forceReleaseConfig.isOpen}
          onClose={() => setForceReleaseConfig(prev => ({ ...prev, isOpen: false, reason: '' }))}
          title="⚠ Conditional Release — Manager Approval Required"
        >
          <div style={{ padding: '8px 0 16px' }}>
            {/* Warning banner */}
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>Vehicle has an outstanding balance</div>
              <div style={{ color: 'rgba(189,200,218,0.75)', fontSize: '0.82rem' }}>
                Releasing this vehicle will mark the quotation as <strong style={{ color: '#f97316' }}>WITH BALANCE</strong>. The customer will be tracked for follow-up collection.
              </div>
            </div>

            {/* Financial summary */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(189,200,218,0.5)', marginBottom: '12px' }}>Financial Summary</div>
              {[
                { label: 'Total Amount', value: forceReleaseConfig.totalAmount, color: '#c7d4f0' },
                { label: 'Total Paid', value: forceReleaseConfig.totalPaid, color: '#10b981' },
                { label: 'Outstanding Balance', value: forceReleaseConfig.balance, color: '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'rgba(189,200,218,0.7)', fontSize: '0.875rem' }}>{label}</span>
                  <strong style={{ color, fontSize: '0.95rem' }}>
                    ₱{Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              ))}
            </div>

            {/* Reason input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: 'rgba(189,200,218,0.7)', fontSize: '0.85rem', marginBottom: '8px' }}>
                Reason for Conditional Release <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', color: '#f0f3f8', resize: 'vertical', fontSize: '0.9rem', boxSizing: 'border-box' }}
                placeholder="e.g. Customer has committed to settle by next visit..."
                value={forceReleaseConfig.reason}
                onChange={(e) => setForceReleaseConfig(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setForceReleaseConfig(prev => ({ ...prev, isOpen: false, reason: '' }))}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ef4444' }}
                disabled={!forceReleaseConfig.reason.trim()}
                onClick={async () => {
                  try {
                    await apiPost(`/appointments/${forceReleaseConfig.appointment.id}/force-release`, token, {
                      overrideReason: forceReleaseConfig.reason,
                    })
                    setForceReleaseConfig({ isOpen: false, appointment: null, totalAmount: 0, totalPaid: 0, balance: 0, reason: '' })
                    await loadData()
                    pushToast('warning', `⚠ Vehicle conditionally released. Quotation marked WITH BALANCE.`)
                    setError('')
                  } catch (err) {
                    setError(err.message || 'Conditional release failed')
                    setForceReleaseConfig(prev => ({ ...prev, isOpen: false }))
                  }
                }}
              >
                Approve Conditional Release
              </button>
            </div>
          </div>
        </Modal>



      </SectionCard>

      <section className="quick-panels">
        <article>
          <h3>Status Pipeline</h3>
          <p>Scheduled → Checked-in → In progress → QA → Ready → Released.</p>
        </article>
        <article>
          <h3>Automated Notifications</h3>
          <p>Email/SMS/WhatsApp confirmation, reminders, pickup alert, follow-up.</p>
        </article>
      </section>
    </div>
  )
}
