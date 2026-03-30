import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { portalGet, portalPost } from '../../api/portalClient'
import { CoatingProcess, PPFProcess, isCoating, isPPF } from '../../components/ServiceProcess'
import { SERVICE_CATALOG, VEHICLE_SIZE_OPTIONS, getEffectivePrice } from '../../data/serviceCatalog'

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
const API_BASE = (() => {
  const trimmed = String(RAW_API_BASE || '').replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
})()
const PUBLIC_BASE = `${API_BASE}/public`

function dbCodeToCatalogCode(dbCode) {
  if (!dbCode) return null
  return String(dbCode).replace(/^CAT-/i, '').toLowerCase()
}

function getCatalogEntry(dbCode) {
  const code = dbCodeToCatalogCode(dbCode)
  return code ? SERVICE_CATALOG.find((c) => c.code === code) : null
}

// ─── Service Picker (portal-themed two-panel) ────────────────────────
function PortalServicePicker({ services, value, onChange, vehicleSize, priceOverrides }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [panelStyle, setPanelStyle] = useState({})
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  const categories = ['All', ...Array.from(new Set(services.map((s) => s.category).filter(Boolean))).sort()]

  const isServiceAvailableForSize = (svc) => {
    const entry = getCatalogEntry(svc?.code)
    if (!entry) return true
    const sizeKey = vehicleSize || 'medium'
    const p = getEffectivePrice(entry.code, sizeKey, priceOverrides)
    return Number(p || 0) > 0
  }

  const filtered = services.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === 'All' || s.category === activeCategory
    return matchSearch && matchCat && isServiceAvailableForSize(s)
  })

  const selected = services.find((s) => s.id === Number(value))

  const openPanel = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const panelWidth = Math.min(520, window.innerWidth - 16)
      let left = rect.right - panelWidth
      if (left < 8) left = 8
      setPanelStyle({ position: 'fixed', top: rect.bottom + 6, left, width: panelWidth, zIndex: 9999 })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        const panelWidth = Math.min(520, window.innerWidth - 16)
        let left = rect.right - panelWidth
        if (left < 8) left = 8
        setPanelStyle((s) => ({ ...s, top: rect.bottom + 6, left }))
      }
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  const pick = (svc) => {
    onChange(svc.id)
    setOpen(false)
    setSearch('')
  }

  const panel = open &&
    createPortal(
      <div className="portal-svc-panel" ref={panelRef} style={panelStyle}>
        {/* Search */}
        <div className="portal-svc-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            autoFocus
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Two-panel body */}
        <div className="portal-svc-body">
          {/* Left: categories */}
          <ul className="portal-svc-cat-list">
            {categories.map((cat) => (
              <li key={cat}>
                <button
                  type="button"
                  className={`portal-svc-cat-btn${activeCategory === cat ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                  <span className="portal-svc-cat-count">
                    {cat === 'All'
                      ? services.length
                      : services.filter((s) => s.category === cat).length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* Right: service items */}
          <ul className="portal-svc-item-list">
            {filtered.length === 0 ? (
              <li className="portal-svc-empty">No services found</li>
            ) : (
              filtered.map((svc) => (
                <li key={svc.id}>
                  <button
                    type="button"
                    className={`portal-svc-item-btn${Number(value) === svc.id ? ' active' : ''}`}
                    onClick={() => pick(svc)}
                  >
                    <span className="portal-svc-item-name">{svc.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
        {value && (
          <div className="portal-svc-footer">
            <button type="button" className="portal-svc-clear" onClick={() => { onChange(''); setOpen(false) }}>
              Clear selection
            </button>
          </div>
        )}
      </div>,
      document.body,
    )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`portal-svc-trigger${open ? ' open' : ''}`}
        onClick={open ? () => setOpen(false) : openPanel}
      >
        {selected ? (
          <span className="portal-svc-trigger-selected">
            <span className="portal-svc-trigger-cat">{selected.category}</span>
            {selected.name}
          </span>
        ) : (
          <span className="portal-svc-trigger-placeholder">— General / No specific service —</span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {panel}
    </>
  )
}

// ─── Main Component ─────────────────────────────────────────────────
export function PortalBooking({ initialServiceId = '' }) {
  const [vehicles, setVehicles] = useState([])
  const [services, setServices] = useState([])
  const [branches, setBranches] = useState(['Cubao', 'Manila'])
  const [priceOverrides, setPriceOverrides] = useState({})
  const [form, setForm] = useState({
    vehicleId: '',
    branch: '',
    vehicleSize: 'medium',
    serviceId: initialServiceId,
    scheduleStart: null,
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState('')
  const [showPayment, setShowPayment] = useState(false)
  const [payment, setPayment] = useState({ method: 'gcash', amount: '', ref: '' })
  const [pendingBook, setPendingBook] = useState(null)

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      try {
        const [v, s, overrides, branchList] = await Promise.all([
          portalGet('/vehicles'),
          portalGet('/services'),
          fetch(`${PUBLIC_BASE}/price-config`)
            .then((r) => r.ok ? r.json().catch(() => ({})) : ({}))
            .catch(() => ({})),
          fetch(`${PUBLIC_BASE}/branch-locations`)
            .then((r) => r.ok ? r.json().catch(() => null) : null)
            .catch(() => null),
        ])

        if (stopped) return
        setVehicles(Array.isArray(v) ? v : [])
        setServices(Array.isArray(s) ? s : [])
        setPriceOverrides(overrides && typeof overrides === 'object' ? overrides : {})

        if (Array.isArray(branchList) && branchList.length > 0) {
          const cleaned = branchList.map((x) => String(x || '').trim()).filter(Boolean)
          if (cleaned.length) setBranches(cleaned)
        }

        if (isInitial && Array.isArray(v) && v.length === 1) {
          setForm((f) => ({ ...f, vehicleId: String(v[0].id) }))
        }
      } catch (_) {
        // Silent
      }
    }

    load(true)

    const intervalMs = 20000
    const id = setInterval(() => load(false), intervalMs)

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const selectedVehicle = vehicles.find((v) => String(v.id) === String(form.vehicleId))
  const selectedService = services.find((s) => s.id === Number(form.serviceId))

  const selectedServicePrice = (() => {
    if (!selectedService) return 0
    const entry = getCatalogEntry(selectedService.code)
    if (entry) {
      const p = getEffectivePrice(entry.code, form.vehicleSize || 'medium', priceOverrides)
      return Number(p || 0)
    }
    return Number(selectedService.base_price || 0)
  })()

  const selectedServiceUnavailable = (() => {
    if (!selectedService) return false
    const entry = getCatalogEntry(selectedService.code)
    if (!entry) return false
    return selectedServicePrice <= 0
  })()

  useEffect(() => {
    if (!form.serviceId) return
    if (!selectedService) return
    if (!selectedServiceUnavailable) return
    setForm((f) => ({ ...f, serviceId: '' }))
    // Keep it quiet; the service simply disappears for this size.
  }, [form.vehicleSize])

  const minDate = (() => {
    const d = new Date()
    d.setHours(d.getHours() + 2, 0, 0, 0)
    return d
  })()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.scheduleStart) { setError('Please select a preferred date and time.'); return }
    if (!String(form.branch || '').trim()) { setError('Please select a branch.'); return }
    if (selectedService && selectedServiceUnavailable) {
      setError('Selected service is not available for the chosen vehicle size.')
      return
    }
    setError('')

    // Calculate scheduleEnd for multi-day services
    let scheduleEnd = null
    if (form.scheduleStart) {
      if (isCoating(selectedService?.name)) {
        const end = new Date(form.scheduleStart)
        end.setDate(end.getDate() + 1)
        end.setHours(17, 0, 0, 0)
        scheduleEnd = end.toISOString()
      } else if (isPPF(selectedService?.name)) {
        const end = new Date(form.scheduleStart)
        end.setDate(end.getDate() + 6)
        end.setHours(15, 0, 0, 0)
        scheduleEnd = end.toISOString()
      }
    }

    // Store pending booking data and show payment modal
    const minDown = selectedService ? Math.ceil(selectedServicePrice * 0.5) : 0
    setPendingBook({
      vehicleId: Number(form.vehicleId),
      branch: String(form.branch || '').trim(),
      vehicleSize: form.vehicleSize || 'medium',
      serviceId: form.serviceId ? Number(form.serviceId) : null,
      serviceUnitPrice: selectedService ? selectedServicePrice : null,
      scheduleStart: form.scheduleStart.toISOString(),
      scheduleEnd,
      notes: form.notes,
    })
    setPayment({ method: 'gcash', amount: String(minDown), ref: '' })
    setShowPayment(true)
  }

  const handleConfirmPayment = async () => {
    const minDown = selectedService ? Math.ceil(selectedServicePrice * 0.5) : 0
    const amt = Number(payment.amount)
    if (selectedService && (isNaN(amt) || amt < minDown)) {
      setError(`Minimum down payment is ₱${minDown.toLocaleString()}.`)
      return
    }
    if (payment.method !== 'cash' && !payment.ref.trim()) {
      setError('Please enter a reference number for your payment.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await portalPost('/appointments/book', {
        ...pendingBook,
        downPaymentAmount: selectedService ? amt : null,
        downPaymentMethod: payment.method,
        downPaymentRef: payment.method !== 'cash' ? payment.ref.trim() : null,
      })
      setShowPayment(false)
      setSuccess({
        quotationNo: result?.quotationNo || null,
        branch: pendingBook?.branch || null,
        vehicle: selectedVehicle,
        service: selectedService,
        vehicleSize: form.vehicleSize || 'medium',
        serviceUnitPrice: selectedService ? selectedServicePrice : null,
        scheduleStart: new Date(pendingBook.scheduleStart),
        payment: {
          amount: selectedService ? amt : null,
          method: payment.method,
          ref: payment.ref.trim(),
        },
      })
      setForm({
        vehicleId: vehicles.length === 1 ? String(vehicles[0].id) : '',
        branch: '',
        vehicleSize: 'medium',
        serviceId: '',
        scheduleStart: null,
        notes: '',
      })
      setPendingBook(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <>
        <div className="portal-hero">
          <h2>Request Quotation</h2>
          <p>Select your vehicle, preferred service, and schedule.</p>
        </div>

        <div className="portal-booking-success">
          <div className="portal-booking-success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3>Quotation Request Sent!</h3>
          <p>We’ll review and send/approve your quotation before scheduling.</p>

          <div className="portal-booking-success-details">
            {success.quotationNo && (
              <div className="portal-booking-success-row">
                <span className="label">Reference</span>
                <span className="value" style={{ fontFamily: 'var(--font-mono)' }}>{success.quotationNo}</span>
              </div>
            )}
            {success.vehicle && (
              <div className="portal-booking-success-row">
                <span className="label">Vehicle</span>
                <span className="value">{success.vehicle.plate_number} — {success.vehicle.year} {success.vehicle.make} {success.vehicle.model}</span>
              </div>
            )}
            {success.branch && (
              <div className="portal-booking-success-row">
                <span className="label">Branch</span>
                <span className="value">{success.branch}</span>
              </div>
            )}
            {success.service && (
              <div className="portal-booking-success-row">
                <span className="label">Service</span>
                <span className="value">{success.service.name} — ₱{Number(success.serviceUnitPrice || success.service.base_price || 0).toLocaleString()}</span>
              </div>
            )}
            {success.vehicleSize && (
              <div className="portal-booking-success-row">
                <span className="label">Size</span>
                <span className="value">{VEHICLE_SIZE_OPTIONS.find((s) => s.key === success.vehicleSize)?.label || success.vehicleSize}</span>
              </div>
            )}
            <div className="portal-booking-success-row">
              <span className="label">Requested Time</span>
              <span className="value">
                {success.scheduleStart.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                {' · '}
                {success.scheduleStart.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            </div>
            {success.payment?.amount && (
              <div className="portal-booking-success-row">
                <span className="label">Down Payment</span>
                <span className="value" style={{ color: '#5eda98', fontWeight: 600 }}>
                  ₱{Number(success.payment.amount).toLocaleString()}
                  {' · '}
                  {{ gcash: 'GCash', card: 'Credit/Debit Card', bank: 'Bank Transfer', cash: 'Pay on Arrival (Cash)' }[success.payment.method] || success.payment.method}
                  {success.payment.ref && ` · Ref: ${success.payment.ref}`}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(189,200,218,0.55)', textAlign: 'center' }}>
            You can track this under <strong>Job Orders &amp; Quotations → Quotations</strong>.
          </div>

          <button
            type="button"
            className="portal-submit-btn"
            style={{ marginTop: '8px', maxWidth: 220 }}
            onClick={() => setSuccess(null)}
          >
            Request Another
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="portal-hero">
        <h2>Request Quotation</h2>
        <p>Select your vehicle, preferred service, and schedule. We'll confirm within 24 hours.</p>
      </div>

      {error && (
        <div className="portal-login-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      <div className="portal-section">
        <form className="portal-form portal-booking-form" onSubmit={handleSubmit}>

          {/* Vehicle */}
          <div className="portal-form-group">
            <label>Vehicle <span className="portal-required">*</span></label>
            {vehicles.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(189,200,218,0.45)', margin: 0 }}>
                No vehicles registered. Contact the shop to add your vehicle.
              </p>
            ) : (
              <select
                value={form.vehicleId}
                onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
                required
              >
                <option value="">— Select your vehicle —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number} — {v.year} {v.make} {v.model}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Branch */}
          <div className="portal-form-group">
            <label>Branch <span className="portal-required">*</span></label>
            <select
              value={form.branch}
              onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
              required
            >
              <option value="">— Select branch —</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Vehicle size */}
          <div className="portal-form-group">
            <label>Vehicle Size <span className="portal-required">*</span></label>
            <select
              value={form.vehicleSize}
              onChange={(e) => setForm((f) => ({ ...f, vehicleSize: e.target.value }))}
              required
            >
              {VEHICLE_SIZE_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <small style={{ fontSize: 11, color: 'rgba(189,200,218,0.45)', marginTop: 4, display: 'block' }}>
              Prices vary by size (same as Online Quotation).
            </small>
          </div>

          {/* Service */}
          <div className="portal-form-group">
            <label>Service</label>
            <PortalServicePicker
              services={services}
              value={form.serviceId}
              onChange={(id) => {
                const svc = services.find((s) => s.id === Number(id))
                const coating = isCoating(svc?.name)
                const ppf = isPPF(svc?.name)
                setForm((f) => {
                  let scheduleStart = f.scheduleStart
                  if ((coating || ppf) && !scheduleStart) {
                    // Auto-set to now + 2h rounded up to next 15 min
                    const d = new Date()
                    d.setHours(d.getHours() + 2)
                    const rem = d.getMinutes() % 15
                    if (rem !== 0) d.setMinutes(d.getMinutes() + (15 - rem))
                    d.setSeconds(0, 0)
                    scheduleStart = d
                  }
                  return { ...f, serviceId: id ? String(id) : '', scheduleStart }
                })
              }}
              vehicleSize={form.vehicleSize}
              priceOverrides={priceOverrides}
            />

            {selectedService?.materials_notes && String(selectedService.materials_notes).trim() && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(0,0,0,0.25)',
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(189,200,218,0.65)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Materials Notes
                </div>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 12.5, color: 'rgba(189,200,218,0.85)', lineHeight: 1.5 }}>
                  {String(selectedService.materials_notes).trim()}
                </div>
              </div>
            )}
          </div>

          {/* Date & Time */}
          <div className="portal-form-group">
            <label>
              Preferred Start Date &amp; Time <span className="portal-required">*</span>
              {isCoating(selectedService?.name) && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#5eda98', marginLeft: 8,
                  background: 'rgba(94,218,152,0.10)', border: '1px solid rgba(94,218,152,0.25)',
                  borderRadius: 20, padding: '2px 9px' }}>
                  Est. release: next day afternoon
                </span>
              )}
              {isPPF(selectedService?.name) && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#a888ff', marginLeft: 8,
                  background: 'rgba(168,136,255,0.10)', border: '1px solid rgba(168,136,255,0.25)',
                  borderRadius: 20, padding: '2px 9px' }}>
                  Est. release: 7th day · 3:00 PM
                </span>
              )}
            </label>
            <div className="portal-datepicker-wrap">
              <DatePicker
                selected={form.scheduleStart}
                onChange={(date) => setForm((f) => ({ ...f, scheduleStart: date }))}
                showTimeSelect
                timeIntervals={15}
                timeCaption="Time"
                dateFormat="MMMM d, yyyy  h:mm aa"
                placeholderText="Pick a date and time…"
                minDate={minDate}
                minTime={
                  form.scheduleStart &&
                  form.scheduleStart.toDateString() === minDate.toDateString()
                    ? minDate
                    : new Date(new Date().setHours(7, 0, 0, 0))
                }
                maxTime={new Date(new Date().setHours(18, 0, 0, 0))}
                required
                className="portal-datepicker-input"
                calendarClassName="portal-datepicker-cal"
                popperPlacement="bottom-start"
              />
            </div>
            <small style={{ fontSize: 11, color: 'rgba(189,200,218,0.45)', marginTop: 4, display: 'block' }}>
              Shop hours: Mon – Sat, 7:00 AM – 6:00 PM
            </small>
          </div>

          {/* Service process (kept separate so the top row stays compact) */}
          {(isCoating(selectedService?.name) || isPPF(selectedService?.name)) && (
            <div style={{ alignSelf: 'start' }}>
              {isCoating(selectedService?.name) && <CoatingProcess />}
              {isPPF(selectedService?.name) && <PPFProcess />}
            </div>
          )}

          {/* Notes */}
          <div className="portal-form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Special Requests / Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any specific concerns, parts needed, or instructions for our team…"
              style={{ minHeight: 90 }}
            />
          </div>

          {/* Summary preview */}
          {(form.vehicleId || form.serviceId || form.scheduleStart) && (
            <div className="portal-booking-preview" style={{ gridColumn: '1 / -1' }}>
              <p className="portal-booking-preview-title">Booking Summary</p>
              {selectedVehicle && (
                <div className="portal-booking-preview-row">
                  <span>Vehicle</span>
                  <strong>{selectedVehicle.plate_number} — {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</strong>
                </div>
              )}
              {selectedService && (
                <div className="portal-booking-preview-row">
                  <span>Service</span>
                  <strong>{selectedService.name} <em style={{ fontWeight: 400, fontSize: 12, opacity: 0.7 }}>₱{Number(selectedServicePrice || 0).toLocaleString()}</em></strong>
                </div>
              )}
              {form.scheduleStart && (
                <div className="portal-booking-preview-row">
                  <span>Start Date</span>
                  <strong>
                    {form.scheduleStart.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    {' · '}
                    {form.scheduleStart.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </strong>
                </div>
              )}
              {form.scheduleStart && isCoating(selectedService?.name) && (() => {
                const est = new Date(form.scheduleStart)
                est.setDate(est.getDate() + 1)
                est.setHours(17, 0, 0, 0)
                return (
                  <div className="portal-booking-preview-row">
                    <span style={{ color: '#5eda98' }}>Est. Release</span>
                    <strong style={{ color: '#5eda98' }}>
                      {est.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · 5:00 PM'}
                    </strong>
                  </div>
                )
              })()}
              {form.scheduleStart && isPPF(selectedService?.name) && (() => {
                const est = new Date(form.scheduleStart)
                est.setDate(est.getDate() + 6)
                est.setHours(15, 0, 0, 0)
                return (
                  <div className="portal-booking-preview-row">
                    <span style={{ color: '#a888ff' }}>Est. Release</span>
                    <strong style={{ color: '#a888ff' }}>
                      {est.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · 3:00 PM'}
                    </strong>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Submit */}
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="portal-submit-btn"
              disabled={loading || vehicles.length === 0}
              style={{ maxWidth: 220 }}
            >
              {loading ? 'Booking…' : 'Confirm Appointment'}
            </button>
            <span style={{ fontSize: 12, color: 'rgba(189,200,218,0.40)' }}>
              📞 Need to cancel or reschedule? Call us directly.
            </span>
          </div>

        </form>
      </div>

      {/* ─── Down Payment Modal ─── */}
      {showPayment && pendingBook && (() => {
        const minDown = selectedService ? Math.ceil(selectedServicePrice * 0.5) : 0
        const amt = Number(payment.amount)
        const methodLabels = { gcash: 'GCash', card: 'Credit/Debit Card', bank: 'Bank Transfer', cash: 'Pay on Arrival (Cash)' }
        return createPortal(
          <div className="portal-pay-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowPayment(false); setError('') } }}>
            <div className="portal-pay-modal">
              <div className="portal-pay-header">
                <h3>Down Payment</h3>
                <button type="button" className="portal-pay-close" onClick={() => { setShowPayment(false); setError('') }} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Service summary */}
              {selectedService && (
                <div className="portal-pay-summary">
                  <span className="portal-pay-summary-label">Service</span>
                  <span className="portal-pay-summary-name">{selectedService.name}</span>
                  <span className="portal-pay-summary-price">₱{Number(selectedServicePrice || 0).toLocaleString()}</span>
                  <span className="portal-pay-summary-label" style={{ marginTop: 6 }}>Required Down Payment (min. 50%)</span>
                  <span className="portal-pay-summary-min">₱{minDown.toLocaleString()}</span>
                </div>
              )}

              {/* Amount input */}
              {selectedService && (
                <div className="portal-pay-field">
                  <label>Down Payment Amount <span className="portal-required">*</span></label>
                  <div className="portal-pay-amount-wrap">
                    <span className="portal-pay-peso">₱</span>
                    <input
                      type="number"
                      min={minDown}
                      max={selectedServicePrice}
                      step="1"
                      value={payment.amount}
                      onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
                      className="portal-pay-amount-input"
                    />
                  </div>
                  {!isNaN(amt) && amt > 0 && amt < minDown && (
                    <small className="portal-pay-warn">Minimum is ₱{minDown.toLocaleString()}</small>
                  )}
                </div>
              )}

              {/* Payment method */}
              <div className="portal-pay-field">
                <label>Payment Method <span className="portal-required">*</span></label>
                <div className="portal-pay-methods">
                  {Object.entries(methodLabels).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`portal-pay-method-btn${payment.method === key ? ' active' : ''}`}
                      onClick={() => setPayment((p) => ({ ...p, method: key, ref: '' }))}
                    >
                      {key === 'gcash' && <span className="portal-pay-method-icon">📱</span>}
                      {key === 'card' && <span className="portal-pay-method-icon">💳</span>}
                      {key === 'bank' && <span className="portal-pay-method-icon">🏦</span>}
                      {key === 'cash' && <span className="portal-pay-method-icon">💵</span>}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference number (hidden for cash) */}
              {payment.method !== 'cash' && (
                <div className="portal-pay-field">
                  <label>Reference / Confirmation Number <span className="portal-required">*</span></label>
                  <input
                    type="text"
                    placeholder={payment.method === 'gcash' ? 'e.g. 1234567890' : payment.method === 'card' ? 'Last 4 digits or auth code' : 'Bank transaction ref'}
                    value={payment.ref}
                    onChange={(e) => setPayment((p) => ({ ...p, ref: e.target.value }))}
                    className="portal-pay-ref-input"
                  />
                </div>
              )}

              {payment.method === 'cash' && (
                <p className="portal-pay-cash-note">
                  💡 Cash payment will be collected when you drop off your vehicle. Please bring the exact amount.
                </p>
              )}

              {error && <div className="portal-login-error" style={{ marginTop: 8 }}>{error}</div>}

              <div className="portal-pay-actions">
                <button type="button" className="portal-pay-back-btn" onClick={() => { setShowPayment(false); setError('') }}>
                  ← Back
                </button>
                <button
                  type="button"
                  className="portal-submit-btn"
                  style={{ flex: 1 }}
                  disabled={loading}
                  onClick={handleConfirmPayment}
                >
                  {loading ? 'Booking…' : 'Confirm & Book'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      })()}
    </>
  )
}
