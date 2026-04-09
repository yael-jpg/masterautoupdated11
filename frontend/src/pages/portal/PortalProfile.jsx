import { useState, useEffect, useRef } from 'react'
import { portalGet, portalPut, setPortalSession, getPortalToken } from '../../api/portalClient'

// ── helpers ──────────────────────────────────────────────────────────────────
const PMS_TIER_LABEL_BY_KM = {
  5000: 'Basic PMS',
  10000: 'Standard PMS',
  20000: 'Advanced PMS',
  40000: 'Major PMS',
  50000: 'Premium PMS',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

const JO_STATUS_COLOR = {
  Pending:    'badge-neutral',
  'In Progress': 'badge-warning',
  Completed:  'badge-success',
  Released:   'badge-success',
  Cancelled:  'badge-danger',
}
const Q_STATUS_COLOR = {
  Pending:        'badge-warning',
  Approved:       'badge-success',
  'Not Approved': 'badge-danger',
}
const PMT_TYPE_COLOR = {
  deposit:  { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.28)', text: '#fbbf24' },
  partial:  { bg: 'rgba(160,168,184,0.10)', border: 'rgba(160,168,184,0.22)', text: '#a0a8b8' },
  full:     { bg: 'rgba(52,211,153,0.10)', border: 'rgba(52,211,153,0.25)', text: '#34d399' },
  default:  { bg: 'rgba(160,168,184,0.08)', border: 'rgba(160,168,184,0.18)', text: '#a0a8b8' },
}
function pmtColor(p) {
  if (p.is_deposit) return PMT_TYPE_COLOR.deposit
  const paid = Number(p.paid_total || p.amount || 0)
  const total = Number(p.total_amount || 0)
  if (total > 0 && paid >= total) return PMT_TYPE_COLOR.full
  if (paid > 0) return PMT_TYPE_COLOR.partial
  return PMT_TYPE_COLOR.default
}
function pmtLabel(p) {
  if (p.is_deposit) return 'Deposit'
  const paid = Number(p.paid_total || p.amount || 0)
  const total = Number(p.total_amount || 0)
  if (total > 0 && paid >= total) return 'Full Payment'
  return 'Partial'
}

function normalizePmsLabel(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return ''

  const legacyNamePattern = /(kilometer\s*pms|km\s*pms)$/i
  if (!legacyNamePattern.test(value)) return value

  const kmMatch = value.match(/(\d[\d,]*)\s*(km|kilometer)/i)
  if (!kmMatch) return value

  const km = Number(String(kmMatch[1]).replace(/,/g, ''))
  if (!Number.isFinite(km) || km <= 0) return value

  const tier = PMS_TIER_LABEL_BY_KM[km] || 'Custom PMS'
  return `${tier} - ${km.toLocaleString('en-US')} KM`
}

function useEscClose(onClose) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

function isProfileDirty(form, serverMe) {
  if (!serverMe) return false
  return (
    String(form.full_name || '') !== String(serverMe.full_name || '') ||
    String(form.email || '') !== String(serverMe.email || '') ||
    String(form.mobile || '') !== String(serverMe.mobile || '') ||
    String(form.address || '') !== String(serverMe.address || '') ||
    String(form.lead_source || '') !== String(serverMe.lead_source || '') ||
    String(form.preferred_contact_method || '') !== String(serverMe.preferred_contact_method || '')
  )
}

// ── Vehicle detail modal ──────────────────────────────────────────────────────
function VehicleDetailModal({ v, onClose }) {
  useEscClose(onClose)
  const title = v.plate_number || v.conduction_sticker || '—'
  const subtitle = [v.year, v.make, v.model].filter(Boolean).join(' ')
  return (
    <div onClick={onClose} className="portal-detail-overlay">
      <div onClick={(e) => e.stopPropagation()} className="portal-detail-panel">
        <div className="portal-detail-header">
          <div className="portal-detail-header-main">
            <div className="portal-detail-kicker">Vehicle Details</div>
            <div className="portal-detail-title portal-detail-mono">{title}</div>
            {subtitle && <div className="portal-detail-subtitle">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="portal-detail-close" aria-label="Close">×</button>
        </div>
        <div className="portal-detail-body">
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Plate / Conduction Sticker</div>
              <div className="portal-detail-val portal-detail-mono">
                {v.plate_number || v.conduction_sticker || <span className="portal-detail-dim">—</span>}
              </div>
            </div>
          </div>
          <div className="portal-detail-grid">
            {[["Make", v.make], ["Model", v.model], ["Year", v.year], ["Color", v.color], ["Variant", v.variant], ["Fuel Type", v.fuel_type], ["Transmission", v.transmission], ["Odometer", v.odometer ? `${Number(v.odometer).toLocaleString()} km` : null]].map(([lbl, val]) => (
              <div key={lbl} className="portal-detail-cell">
                <div className="portal-detail-lbl">{lbl}</div>
                <div className={`portal-detail-cell-value ${val ? '' : 'portal-detail-cell-value--empty'}`}>{val || '—'}</div>
              </div>
            ))}
          </div>
          {(v.engine_no || v.chassis_no) && (
            <div className="portal-detail-card">
              <div className="portal-detail-card-main">
                {v.engine_no && (
                  <>
                    <div className="portal-detail-lbl">Engine No.</div>
                    <div className={`portal-detail-val portal-detail-mono ${v.chassis_no ? 'portal-detail-val--mb' : ''}`}>{v.engine_no}</div>
                  </>
                )}
                {v.chassis_no && (
                  <>
                    <div className="portal-detail-lbl">Chassis No.</div>
                    <div className="portal-detail-val portal-detail-mono">{v.chassis_no}</div>
                  </>
                )}
              </div>
            </div>
          )}
          {v.notes && <div className="portal-detail-notes">📝 {v.notes}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Quotation detail modal ────────────────────────────────────────────────────
function QuotationDetailModal({ q, onClose }) {
  useEscClose(onClose)
  const statusCls = Q_STATUS_COLOR[q.quotation_approval_status] || 'badge-neutral'
  return (
    <div onClick={onClose} className="portal-detail-overlay">
      <div onClick={(e) => e.stopPropagation()} className="portal-detail-panel">
        <div className="portal-detail-header">
          <div className="portal-detail-header-main">
            <div className="portal-detail-kicker">Quotation Details</div>
            <div className="portal-detail-badges">
              <span className="portal-detail-title portal-detail-mono">{q.reference_no}</span>
              <span className={`badge ${statusCls}`}>{q.quotation_approval_status || 'Pending'}</span>
              {q.linked_job_order_no && <span className="portal-detail-linked portal-detail-mono">→ {q.linked_job_order_no}</span>}
            </div>
          </div>
          <button onClick={onClose} className="portal-detail-close" aria-label="Close">×</button>
        </div>
        <div className="portal-detail-body">
          <div className="portal-detail-amount">
            <span className="portal-detail-amount-label">Total Amount</span>
            <span className="portal-detail-amount-value portal-detail-mono">₱{Number(q.total_amount || 0).toLocaleString()}</span>
          </div>
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Vehicle</div>
              <div className="portal-detail-val portal-detail-mono">{q.plate_number || <span className="portal-detail-dim">—</span>}</div>
            </div>
          </div>
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Service</div>
              <div className="portal-detail-val">{normalizePmsLabel(q.service_package) || <span className="portal-detail-dim">—</span>}</div>
            </div>
          </div>
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Created</div>
              <div className="portal-detail-val">{fmtDateTime(q.created_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Job Order detail modal ────────────────────────────────────────────────────
function JobOrderDetailModal({ j, onClose }) {
  useEscClose(onClose)
  const statusCls = JO_STATUS_COLOR[j.workflow_status] || 'badge-neutral'
  return (
    <div onClick={onClose} className="portal-detail-overlay">
      <div onClick={(e) => e.stopPropagation()} className="portal-detail-panel">
        <div className="portal-detail-header">
          <div className="portal-detail-header-main">
            <div className="portal-detail-kicker">Job Order Details</div>
            <div className="portal-detail-badges">
              <span className="portal-detail-title portal-detail-mono">{j.reference_no}</span>
              <span className={`badge ${statusCls}`}>{j.workflow_status || 'Pending'}</span>
            </div>
          </div>
          <button onClick={onClose} className="portal-detail-close" aria-label="Close">×</button>
        </div>
        <div className="portal-detail-body">
          <div className="portal-detail-amount">
            <span className="portal-detail-amount-label">Total Amount</span>
            <span className="portal-detail-amount-value portal-detail-mono">₱{Number(j.total_amount || 0).toLocaleString()}</span>
          </div>
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Vehicle</div>
              <div className="portal-detail-val portal-detail-mono">{j.plate_number || <span className="portal-detail-dim">—</span>}</div>
            </div>
          </div>
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Service</div>
              <div className="portal-detail-val">{normalizePmsLabel(j.service_package) || <span className="portal-detail-dim">—</span>}</div>
            </div>
          </div>
          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Created</div>
              <div className="portal-detail-val">{fmtDateTime(j.created_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Payment detail modal ──────────────────────────────────────────────────────
function PaymentDetailModal({ p, onClose }) {
  useEscClose(onClose)
  const c   = pmtColor(p)
  const lbl = pmtLabel(p)
  const pillStyle = { '--pill-bg': c.bg, '--pill-border': c.border, '--pill-text': c.text }
  const accentStyle = { '--accent-bg': c.bg, '--accent-border': c.border, '--accent-text': c.text }
  return (
    <div onClick={onClose} className="portal-detail-overlay">
      <div onClick={(e) => e.stopPropagation()} className="portal-detail-panel">
        <div className="portal-detail-header">
          <div className="portal-detail-header-main">
            <div className="portal-detail-kicker">Payment Details</div>
            <div className="portal-detail-badges">
              <span className="portal-detail-pill" style={pillStyle}>{lbl}</span>
              {p.payment_type && <span className="portal-detail-subtitle">{p.payment_type}</span>}
            </div>
          </div>
          <button onClick={onClose} className="portal-detail-close" aria-label="Close">×</button>
        </div>
        <div className="portal-detail-body">
          <div className="portal-detail-accent" style={accentStyle}>
            <span className="portal-detail-accent-label">Amount Paid</span>
            <span className="portal-detail-accent-value portal-detail-mono">₱{Number(p.amount).toLocaleString()}</span>
          </div>

          <div className="portal-detail-card">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <div className="portal-detail-card-main">
              <div className="portal-detail-lbl">Date &amp; Time</div>
              <div className="portal-detail-val">{fmtDateTime(p.created_at)}</div>
            </div>
          </div>

          {p.sale_reference_no && (
            <div className="portal-detail-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div className="portal-detail-card-main">
                <div className="portal-detail-lbl">Reference No.</div>
                <div className="portal-detail-val portal-detail-mono">{p.sale_reference_no}</div>
              </div>
            </div>
          )}

          {p.service_package && (
            <div className="portal-detail-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              <div className="portal-detail-card-main">
                <div className="portal-detail-lbl">Service</div>
                <div className="portal-detail-val">{normalizePmsLabel(p.service_package)}</div>
              </div>
            </div>
          )}

          {p.plate_number && (
            <div className="portal-detail-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-detail-icon"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              <div className="portal-detail-card-main">
                <div className="portal-detail-lbl">Vehicle</div>
                <div className="portal-detail-val portal-detail-mono">{p.plate_number}</div>
                {(p.make || p.model) && <div className="portal-detail-subval">{[p.make, p.model].filter(Boolean).join(' ')}</div>}
              </div>
            </div>
          )}

          {p.total_amount != null && (
            <div className="portal-detail-split" style={accentStyle}>
              <div className="portal-detail-split-card">
                <div className="portal-detail-split-label">This Payment</div>
                <div className="portal-detail-split-value portal-detail-split-value--accent portal-detail-mono">₱{Number(p.amount).toLocaleString()}</div>
              </div>
              <div className="portal-detail-split-card">
                <div className="portal-detail-split-label">Invoice Total</div>
                <div className="portal-detail-split-value portal-detail-mono">₱{Number(p.total_amount).toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── small info-row component ──────────────────────────────────────────────────
function InfoRow({ label, value }) {
  return (
    <div className="portal-info-row">
      <span className="portal-info-row-label">{label}</span>
      <span className="portal-info-row-value">{value || <span className="portal-detail-dim">—</span>}</span>
    </div>
  )
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="portal-profile-tab-bar">
      {tabs.map((t) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`portal-profile-tab ${isActive ? 'portal-profile-tab--active' : ''}`}
          >
            <span className="portal-profile-tab-icon">{t.icon}</span>
            {t.label}
            {t.count > 0 && (
              <span className="portal-profile-tab-count">{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PortalProfile({ customer, onCustomerUpdate }) {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    mobile: '',
    address: '',
    lead_source: '',
    preferred_contact_method: 'Email',
  })
  const [serverMe, setServerMe] = useState(null)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwError, setPwError] = useState('')

  const savingRef = useRef(false)
  const savingPwRef = useRef(false)
  const formRef = useRef(form)
  const serverMeRef = useRef(serverMe)

  useEffect(() => { savingRef.current = saving }, [saving])
  useEffect(() => { savingPwRef.current = savingPw }, [savingPw])
  useEffect(() => { formRef.current = form }, [form])
  useEffect(() => { serverMeRef.current = serverMe }, [serverMe])

  // supplementary data
  const [vehicles,  setVehicles]  = useState([])
  const [jobOrders, setJobOrders] = useState([])
  const [payments,  setPayments]  = useState([])

  // tab navigation
  const [activeTab, setActiveTab] = useState('profile')

  // detail modals
  const [selVehicle,   setSelVehicle]   = useState(null)
  const [selQuotation, setSelQuotation] = useState(null)
  const [selJob,       setSelJob]       = useState(null)
  const [selPayment,   setSelPayment]   = useState(null)

  // Prevent background scroll while any detail modal is open
  useEffect(() => {
    const anyOpen = !!(selVehicle || selQuotation || selJob || selPayment)
    if (!anyOpen) return

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [selVehicle, selQuotation, selJob, selPayment])

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      try {
        const currentForm = formRef.current
        const currentServerMe = serverMeRef.current
        const shouldFetchMe =
          (!savingRef.current && !savingPwRef.current) &&
          (!currentServerMe || !isProfileDirty(currentForm, currentServerMe))

        const [meMaybe, v, jo, p] = await Promise.all([
          shouldFetchMe ? portalGet('/me') : Promise.resolve(null),
          portalGet('/vehicles'),
          portalGet('/job-orders'),
          portalGet('/payments'),
        ])

        if (stopped) return

        if (meMaybe) {
          setServerMe(meMaybe)
          const shouldHydrateForm = isInitial || !isProfileDirty(formRef.current, meMaybe)
          if (shouldHydrateForm) {
            setForm({
              full_name: meMaybe.full_name || '',
              email:     meMaybe.email    || '',
              mobile:    meMaybe.mobile   || '',
              address:   meMaybe.address  || '',
              lead_source: meMaybe.lead_source || '',
              preferred_contact_method: 'Email',
            })
          }
        }

        setVehicles(Array.isArray(v) ? v : [])
        setJobOrders(Array.isArray(jo) ? jo : [])
        setPayments(Array.isArray(p) ? p : [])
      } catch (err) {
        if (isInitial) setError(err.message)
      } finally {
        if (isInitial) setLoading(false)
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

  const handleChange = (field, value) => {
    if (field === 'mobile') {
      value = value.replace(/\D/g, '').slice(0, 11)
    }
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    setError('')
    try {
      if (!String(form.lead_source || '').trim()) {
        setError('Lead Source is required.')
        return
      }
      if (!String(form.preferred_contact_method || '').trim()) {
        setError('Preferred Contact is required.')
        return
      }

      const res = await portalPut('/me', {
        full_name: form.full_name,
        email: form.email || null,
        mobile: form.mobile,
        address: form.address || null,
        lead_source: String(form.lead_source || '').trim(),
        preferred_contact_method: 'Email',
      })

      setServerMe(res.customer)
      
      const updated = {
        ...customer,
        name: res.customer.full_name,
        email: res.customer.email,
        mobile: res.customer.mobile,
        lead_source: res.customer.lead_source,
        preferred_contact_method: res.customer.preferred_contact_method,
      }
      setPortalSession(getPortalToken(), updated)
      onCustomerUpdate(updated)
      setSuccess('Profile updated successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPwSuccess('')
    setPwError('')
    if (!String(form.lead_source || '').trim()) {
      setPwError('Lead Source is required.')
      return
    }
    if (!String(form.preferred_contact_method || '').trim()) {
      setPwError('Preferred Contact is required.')
      return
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New passwords do not match.')
      return
    }
    setSavingPw(true)
    try {
      const res = await portalPut('/me', {
        full_name: form.full_name,
        mobile: form.mobile,
        email: form.email || null,
        address: form.address || null,
        lead_source: String(form.lead_source || '').trim(),
        preferred_contact_method: 'Email',
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      })
      if (res && res.customer) setServerMe(res.customer)
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
      setPwSuccess('Password changed successfully.')
    } catch (err) {
      setPwError(err.message)
    } finally {
      setSavingPw(false)
    }
  }

  const initials = form.full_name
    ? form.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  if (loading) {
    return (
      <div className="portal-profile-loading">
        <div className="portal-profile-spinner" />
        <span>Loading profile…</span>
      </div>
    )
  }

  const quotations = jobOrders.filter((j) => j.doc_type === 'Quotation')
  const jos        = jobOrders.filter((j) => j.doc_type === 'JobOrder')

  const TABS = [
    {
      key: 'profile', label: 'Profile',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      count: 0,
    },
    {
      key: 'vehicles', label: 'Vehicles',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
      count: vehicles.length,
    },
    {
      key: 'quotations', label: 'Quotations',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
      count: quotations.length,
    },
    {
      key: 'jobs', label: 'Job Orders',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      count: jos.length,
    },
    {
      key: 'payments', label: 'Payments',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
      count: payments.length,
    },
  ]

  return (
    <div className="portal-profile-root">
      {/* ── detail modals ────────────────────────────────────────── */}
      {selVehicle   && <VehicleDetailModal   v={selVehicle}   onClose={() => setSelVehicle(null)} />}
      {selQuotation && <QuotationDetailModal q={selQuotation} onClose={() => setSelQuotation(null)} />}
      {selJob       && <JobOrderDetailModal  j={selJob}       onClose={() => setSelJob(null)} />}
      {selPayment   && <PaymentDetailModal   p={selPayment}   onClose={() => setSelPayment(null)} />}

      {/* ── hero (always visible) ──────────────────────────────── */}
      <div className="portal-profile-hero">
        <div className="portal-profile-avatar-lg">{initials}</div>
        <div className="portal-profile-hero-info">
          <div className="portal-profile-hero-name">{form.full_name || '—'}</div>
          <div className="portal-profile-hero-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Client Account
          </div>
        </div>
      </div>

      {/* ── tab bar ──────────────────────────────────────────────── */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── PROFILE TAB ─────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <>
          {/* Contact summary */}
          <div className="portal-profile-summary-card">
            <div className="portal-profile-summary-head">
              <span className="portal-profile-summary-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.58 3.38 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16a2 2 0 0 1 .27.92z"/></svg>
              </span>
              <span className="portal-profile-summary-title">Contact Information</span>
            </div>
            <InfoRow label="Full Name" value={form.full_name} />
            <InfoRow label="Mobile"    value={form.mobile} />
            <InfoRow label="Email"     value={form.email} />
            <InfoRow label="Address"   value={form.address} />
            <InfoRow label="Lead Source" value={form.lead_source} />
            <InfoRow label="Preferred Contact" value={form.preferred_contact_method} />
          </div>

          {/* Edit forms side by side */}
          <div className="portal-profile-grid">
            {/* Personal Information */}
            <div className="portal-profile-card">
              <div className="portal-profile-card-header">
                <span className="portal-profile-card-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <h3>Personal Information</h3>
              </div>

              {success && <div className="portal-profile-success">{success}</div>}
              {error   && <div className="portal-profile-error">{error}</div>}

              <form onSubmit={handleSave} className="portal-profile-form" noValidate>
                <div className="portal-profile-field">
                  <label>Full Name</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={(e) => handleChange('full_name', e.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>Mobile Number</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="12" y1="18" x2="12.01" y2="18"/>
                      </svg>
                    </span>
                    <input
                      type="tel"
                      value={form.mobile}
                      onChange={(e) => handleChange('mobile', e.target.value)}
                      placeholder="09XXXXXXXXX"
                      maxLength={11}
                      inputMode="numeric"
                      required
                    />
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>Email Address</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>Address</label>
                  <div className="portal-profile-input-wrap portal-profile-textarea-wrap">
                    <span className="portal-profile-input-icon portal-profile-input-icon--top">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </span>
                    <textarea
                      value={form.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Your address (optional)"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>Lead Source</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18"/>
                        <path d="M19 9l-5 5-4-4-3 3"/>
                      </svg>
                    </span>
                    <select
                      value={form.lead_source}
                      onChange={(e) => handleChange('lead_source', e.target.value)}
                      required
                    >
                      <option value="">— Select lead source —</option>
                      <option value="Walk-in">Walk-in</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Referral">Referral</option>
                      <option value="Google">Google</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>Preferred Contact</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.58 3.38 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16a2 2 0 0 1 .27.92z"/>
                      </svg>
                    </span>
                    <input
                      type="text"
                      value="Email"
                      disabled
                      aria-label="Preferred Contact"
                    />
                  </div>
                </div>

                <button type="submit" className="portal-profile-save-btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* Change Password */}
            <div className="portal-profile-card portal-profile-card--pw">
              <div className="portal-profile-card-header">
                <span className="portal-profile-card-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <h3>Change Password</h3>
              </div>

              {pwSuccess && <div className="portal-profile-success">{pwSuccess}</div>}
              {pwError   && <div className="portal-profile-error">{pwError}</div>}

              <form onSubmit={handlePasswordChange} className="portal-profile-form" noValidate>
                <div className="portal-profile-field">
                  <label>Current Password</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={pwForm.current_password}
                      onChange={(e) => setPwForm((p) => ({ ...p, current_password: e.target.value }))}
                      placeholder="Current password"
                      required
                    />
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>New Password</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={pwForm.new_password}
                      onChange={(e) => setPwForm((p) => ({ ...p, new_password: e.target.value }))}
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                <div className="portal-profile-field">
                  <label>Confirm New Password</label>
                  <div className="portal-profile-input-wrap">
                    <span className="portal-profile-input-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={pwForm.confirm_password}
                      onChange={(e) => setPwForm((p) => ({ ...p, confirm_password: e.target.value }))}
                      placeholder="Repeat new password"
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="portal-profile-save-btn portal-profile-save-btn--pw" disabled={savingPw}>
                  {savingPw ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ── VEHICLES TAB ────────────────────────────────────────── */}
      {activeTab === 'vehicles' && (
        <div className="portal-profile-list">
          {vehicles.length === 0 ? (
            <p className="portal-profile-empty">No vehicles registered.</p>
          ) : (
            vehicles.map((v) => (
              <div
                key={v.id}
                onClick={() => setSelVehicle(v)}
                className="portal-profile-item"
              >
                <div className="portal-profile-item-main">
                  <div className="portal-profile-item-title">{v.plate_number || v.conduction_sticker || '—'}</div>
                  <div className="portal-profile-item-subtitle">{[v.year, v.make, v.model].filter(Boolean).join(' ')}{v.color ? ` · ${v.color}` : ''}</div>
                </div>
                {v.variant && <span className="portal-profile-item-note">{v.variant}</span>}
                {v.odometer && <span className="portal-profile-item-mono-note">{Number(v.odometer).toLocaleString()} km</span>}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="portal-profile-item-chevron"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── QUOTATIONS TAB ──────────────────────────────────────── */}
      {activeTab === 'quotations' && (
        <div className="portal-profile-list">
          {quotations.length === 0 ? (
            <p className="portal-profile-empty">No quotations found.</p>
          ) : (
            quotations.map((q) => (
              <div
                key={q.id}
                onClick={() => setSelQuotation(q)}
                className="portal-profile-item portal-profile-item--wrap"
              >
                <div className="portal-profile-item-main">
                  <div className="portal-profile-item-top">
                    <span className="portal-profile-item-ref">{q.reference_no}</span>
                    <span className={`badge ${Q_STATUS_COLOR[q.quotation_approval_status] || 'badge-neutral'}`}>{q.quotation_approval_status || 'Pending'}</span>
                    {q.linked_job_order_no && (
                      <span className="portal-detail-linked portal-detail-mono">→ {q.linked_job_order_no}</span>
                    )}
                  </div>
                  <div className="portal-profile-item-subline">{q.plate_number} · {normalizePmsLabel(q.service_package)}</div>
                </div>
                <div className="portal-profile-item-right">
                  <div className="portal-profile-item-amount">₱{Number(q.total_amount).toLocaleString()}</div>
                  <div className="portal-profile-item-date">{fmtDate(q.created_at)}</div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="portal-profile-item-chevron"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── JOB ORDERS TAB ──────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <div className="portal-profile-list">
          {jos.length === 0 ? (
            <p className="portal-profile-empty">No job orders found.</p>
          ) : (
            jos.map((j) => (
              <div
                key={j.id}
                onClick={() => setSelJob(j)}
                className="portal-profile-item portal-profile-item--wrap"
              >
                <div className="portal-profile-item-main">
                  <div className="portal-profile-item-top">
                    <span className="portal-profile-item-ref">{j.reference_no}</span>
                    <span className={`badge ${JO_STATUS_COLOR[j.workflow_status] || 'badge-neutral'}`}>{j.workflow_status || 'Pending'}</span>
                  </div>
                  <div className="portal-profile-item-subline">{j.plate_number} · {normalizePmsLabel(j.service_package)}</div>
                </div>
                <div className="portal-profile-item-right">
                  <div className="portal-profile-item-amount">₱{Number(j.total_amount).toLocaleString()}</div>
                  <div className="portal-profile-item-date">{fmtDate(j.created_at)}</div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="portal-profile-item-chevron"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── PAYMENTS TAB ────────────────────────────────────────── */}
      {activeTab === 'payments' && (
        <div className="portal-profile-list">
          {payments.length === 0 ? (
            <p className="portal-profile-empty">No payments on record.</p>
          ) : (
            <>
              {payments.map((p) => {
                const c   = pmtColor(p)
                const lbl = pmtLabel(p)
                const payVars = { '--pay-bg': c.bg, '--pay-border': c.border, '--pay-text': c.text }
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelPayment(p)}
                    className="portal-profile-item portal-profile-item--wrap"
                    style={payVars}
                  >
                    <div className="portal-profile-item-main">
                      <div className="portal-profile-item-top">
                        <span className="portal-profile-pay-pill">{lbl}</span>
                        {p.payment_type && <span className="portal-profile-item-note">{p.payment_type}</span>}
                      </div>
                      <div className="portal-profile-item-subline">{p.sale_reference_no || '—'}{p.service_package ? ` · ${normalizePmsLabel(p.service_package)}` : ''}</div>
                      {p.plate_number && (
                        <div className="portal-profile-pay-plate">{p.plate_number}{p.make ? ` · ${p.make} ${p.model || ''}` : ''}</div>
                      )}
                    </div>
                    <div className="portal-profile-item-right">
                      <div className="portal-profile-pay-amount">₱{Number(p.amount).toLocaleString()}</div>
                      <div className="portal-profile-item-date">{fmtDateTime(p.created_at)}</div>
                    </div>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="portal-profile-item-chevron"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                )
              })}
              {/* Total */}
              <div className="portal-profile-totalbar">
                <span className="portal-profile-totalbar-label">Total Paid</span>
                <span className="portal-profile-totalbar-value">₱{payments.reduce((s, p) => s + Number(p.amount || 0), 0).toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
