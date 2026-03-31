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

function normalizePortalServiceCategory(category, name) {
  const raw = String(category || '').trim()
  if (!raw) return raw
  if (/^ppf$/i.test(raw)) return 'PPF Services'
  if (/^ppf\s*services?$/i.test(raw)) return 'PPF Services'
  if (/^detailing$/i.test(raw)) return 'Detailing Services'
  if (/^detailing\s*services?$/i.test(raw)) return 'Detailing Services'
  // Fallback heuristic in case category data is inconsistent.
  if (/\bppf\b/i.test(String(name || '')) && raw.toLowerCase() !== 'ppf services') return 'PPF Services'
  return raw
}

function isTint(name) {
  return String(name || '').toLowerCase().includes('tint')
}

function isDetailing(name) {
  return String(name || '').toLowerCase().includes('detail')
}

function isExteriorDetail(name) {
  const n = String(name || '').toLowerCase()
  return n.includes('exterior') && n.includes('detail')
}

function isInteriorDetail(name) {
  const n = String(name || '').toLowerCase()
  return n.includes('interior') && n.includes('detail')
}

function PortalProcessPanel({ title, subtitle, steps }) {
  if (!steps?.length) return null

  const PALETTE = ['#7aa8f8', '#7aa8f8', '#7aa8f8', '#a888ff', '#5ce4e0', '#5eda98']
  const pickColor = (i) => PALETTE[i] || '#94a3b8'

  return (
    <div
      style={{
        marginTop: 10,
        padding: '13px 16px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 7,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
          color: '#c0c0c0', flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#c0c0c0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.50)', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((s, i) => {
          const dayColor = s?.dayColor || pickColor(i)
          return (
            <div key={s.num} style={{ display: 'flex', gap: 12, position: 'relative' }}>
              {i < steps.length - 1 && (
                <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 1, background: 'rgba(255,255,255,0.07)' }} />
              )}
              <div style={{
                width: 23, height: 23, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(10,13,30,0.85)', border: `1px solid ${dayColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, color: dayColor, zIndex: 1, marginTop: 1,
              }}>{s.num}</div>
              <div style={{ paddingBottom: i < steps.length - 1 ? 11 : 0, flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f2' }}>{s.name}</span>
                  {s.timing && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: `${dayColor}18`, border: `1px solid ${dayColor}40`,
                      color: dayColor, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                    }}>{s.timing}</span>
                  )}
                </div>
                {s.note && <div style={{ fontSize: 11.5, color: 'rgba(189,200,218,0.45)', marginTop: 2, fontStyle: 'italic' }}>{s.note}</div>}
                {s.warning && <div style={{ fontSize: 11.5, color: 'rgba(248,113,113,0.95)', marginTop: 2, fontWeight: 700 }}>{s.warning}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Service Picker (portal-themed two-panel) ────────────────────────
function PortalServicePicker({ services, value, onChange, vehicleSize, priceOverrides }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [panelStyle, setPanelStyle] = useState({})
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  const normalizedServices = services.map((s) => ({
    ...s,
    category: normalizePortalServiceCategory(s.category, s.name),
  }))

  const categories = ['All', ...Array.from(new Set(normalizedServices.map((s) => s.category).filter(Boolean))).sort()]

  const isServiceAvailableForSize = (svc) => {
    const entry = getCatalogEntry(svc?.code)
    if (!entry) return true
    const sizeKey = vehicleSize || 'medium'
    const p = getEffectivePrice(entry.code, sizeKey, priceOverrides)
    return Number(p || 0) > 0
  }

  const filtered = normalizedServices.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === 'All' || s.category === activeCategory
    return matchSearch && matchCat && isServiceAvailableForSize(s)
  })

  const selected = normalizedServices.find((s) => s.id === Number(value))

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
                      ? normalizedServices.length
                      : normalizedServices.filter((s) => s.category === cat).length}
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
  const [showConfirm, setShowConfirm] = useState(false)
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

    // Calculate scheduleEnd for multi-day services (used by admin during approval)
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
      } else if (isTint(selectedService?.name) || isDetailing(selectedService?.name)) {
        const end = new Date(form.scheduleStart)
        end.setDate(end.getDate() + 4)
        end.setHours(15, 0, 0, 0)
        scheduleEnd = end.toISOString()
      } else if (selectedService) {
        const end = new Date(form.scheduleStart)
        end.setDate(end.getDate() + 1)
        end.setHours(15, 0, 0, 0)
        scheduleEnd = end.toISOString()
      }
    }

    // Store pending booking data and show confirmation modal
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
    setShowConfirm(true)
  }

  const handleConfirmSchedule = async () => {
    if (!pendingBook) return
    setError('')
    setLoading(true)
    try {
      const result = await portalPost('/appointments/book', pendingBook)
      setShowConfirm(false)
      setSuccess({
        quotationNo: result?.quotationNo || null,
        branch: pendingBook?.branch || null,
        vehicle: selectedVehicle,
        service: selectedService,
        vehicleSize: form.vehicleSize || 'medium',
        serviceUnitPrice: selectedService ? selectedServicePrice : null,
        scheduleStart: new Date(pendingBook.scheduleStart),
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
          <h2>Request Schedule</h2>
          <p>Select your vehicle, preferred service, and schedule.</p>
        </div>

        <div className="portal-booking-success">
          <div className="portal-booking-success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3>Schedule Request Sent!</h3>
          <p>We’ll review your request and confirm your schedule.</p>

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
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(189,200,218,0.55)', textAlign: 'center' }}>
            You can track this under <strong>Appointments</strong>.
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
        <h2>Request Schedule</h2>
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

            {/* Service process / installation steps (shown when a service is picked) */}
            {selectedService && (() => {
              const svcName = selectedService?.name
              const showCoating = isCoating(svcName)
              const showPpf = isPPF(svcName)
              const showTint = isTint(svcName)
              const showDetailing = isDetailing(svcName)
              if (!showCoating && !showPpf && !showTint && !showDetailing) return null

              const tintSteps = [
                { num: 1, name: 'Vehicle inspection & glass cleaning', timing: 'Day 1' },
                { num: 2, name: 'Tint film application', timing: 'Day 2' },
                { num: 3, name: 'Curing stage', timing: 'Day 3', warning: 'Do not roll down windows during curing' },
                { num: 4, name: 'Final check & release', timing: 'Day 3/4' },
              ]
              const extSteps = [
                { num: 1, name: 'Initial vehicle checking', timing: 'Day 1', note: 'paint defects, damages, etc.' },
                { num: 2, name: 'Decontamination', timing: 'Day 1' },
                { num: 3, name: 'Exterior detailing', timing: 'Day 1–3', note: "varies based on the car's condition" },
              ]
              const intSteps = [
                { num: 1, name: 'Initial vehicle checking', timing: 'Day 1', note: 'interior — dust, dirt, etc.' },
                { num: 2, name: 'Chair & matting removal', timing: 'Day 1' },
                { num: 3, name: 'Vacuum & vacmaster', timing: 'Day 2', note: 'deep vacuum of seats and carpets' },
                { num: 4, name: 'Drying stage & reinstallation', timing: 'Day 3–4', note: 'reinstall all chairs and carpets' },
              ]

              return (
                <>
                  {showCoating && <CoatingProcess />}
                  {showPpf && <PPFProcess />}
                  {showTint && (
                    <PortalProcessPanel
                      title="Window Tint Process"
                      subtitle="Usually 3–4 days"
                      steps={tintSteps}
                    />
                  )}
                  {showDetailing && (
                    <PortalProcessPanel
                      title={isExteriorDetail(svcName) ? 'Exterior Detailing Process' : isInteriorDetail(svcName) ? 'Interior Detailing Process' : 'Detailing Process'}
                      subtitle="Usually 1–4 days"
                      steps={isExteriorDetail(svcName) ? extSteps : isInteriorDetail(svcName) ? intSteps : [...extSteps.slice(0, 2), ...intSteps.slice(0, 2)]}
                    />
                  )}
                </>
              )
            })()}

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

          {/* Service process moved under the Service picker */}

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
              {loading ? 'Submitting…' : 'Confirm Schedule'}
            </button>
            <span style={{ fontSize: 12, color: 'rgba(189,200,218,0.40)' }}>
              📞 Need to cancel or reschedule? Call us directly.
            </span>
          </div>

        </form>
      </div>

      {/* ─── Confirm Schedule (Walk-in Payment) Modal ─── */}
      {showConfirm && pendingBook && (() => {
        return createPortal(
          <div className="portal-pay-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowConfirm(false); setError('') } }}>
            <div className="portal-pay-modal">
              <div className="portal-pay-header">
                <h3>Confirm Schedule</h3>
                <button type="button" className="portal-pay-close" onClick={() => { setShowConfirm(false); setError('') }} aria-label="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              {/* Summary */}
              <div className="portal-pay-summary">
                <span className="portal-pay-summary-label">Branch</span>
                <span className="portal-pay-summary-name">{String(pendingBook.branch || '')}</span>

                {selectedService && (
                  <>
                    <span className="portal-pay-summary-label" style={{ marginTop: 10 }}>Service</span>
                    <span className="portal-pay-summary-name">{selectedService.name}</span>
                    <span className="portal-pay-summary-price">₱{Number(selectedServicePrice || 0).toLocaleString()}</span>
                  </>
                )}

                <span className="portal-pay-summary-label" style={{ marginTop: 10 }}>Payment</span>
                <div className="portal-pay-summary-notes">
                  <div className="portal-pay-summary-note">
                    Payment will be made at the selected branch (walk-in) when you bring your vehicle.
                  </div>
                </div>

                <span className="portal-pay-summary-label" style={{ marginTop: 10 }}>Approval</span>
                <div className="portal-pay-summary-notes">
                  <div className="portal-pay-summary-subnote">
                    We will email you once the schedule is approved.
                  </div>
                </div>
              </div>

              {error && <div className="portal-login-error" style={{ marginTop: 8 }}>{error}</div>}

              <div className="portal-pay-actions">
                <button type="button" className="portal-pay-back-btn" onClick={() => { setShowConfirm(false); setError('') }}>
                  ← Back
                </button>
                <button
                  type="button"
                  className="portal-submit-btn"
                  style={{ flex: 1 }}
                  disabled={loading}
                  onClick={handleConfirmSchedule}
                >
                  {loading ? 'Submitting…' : 'Confirm Schedule'}
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
