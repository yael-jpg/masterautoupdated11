import { useEffect, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PaginationBar } from '../components/PaginationBar'
import { SERVICE_CATALOG, VEHICLE_SIZE_OPTIONS, formatCurrency, getCatalogGroups, getEffectivePrice } from '../data/serviceCatalog'
import { SearchableSelect } from '../components/SearchableSelect'
import { CustomerAutocomplete } from '../components/CustomerAutocomplete'
import { normalizeEmailClient } from '../utils/validationClient'

import './QuotationsPage.css'
import './CrmPage.css'

function normalizeServiceCode(code) {
  const raw = String(code || '').trim()
  if (!raw) return ''
  return raw.replace(/^CAT-/i, '').toLowerCase()
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Constants ────────────────────────────────────────────────────────────────

const QUOTATION_STATUSES = ['Draft', 'Sent', 'Pending', 'Approved', 'Not Approved', 'Cancelled', 'History']

const STATUS_META = {
  Draft: { cls: 'badge-neutral', label: 'Draft' },
  Sent: { cls: 'badge-info', label: 'Sent' },
  Pending: { cls: 'badge-warning', label: 'Pending' },
  Approved: { cls: 'badge-success', label: 'Approved' },
  'Not Approved': { cls: 'badge-danger', label: 'Not Approved' },
  Cancelled: { cls: 'badge-danger', label: 'Cancelled' },
  History: { cls: 'badge-secondary', label: 'History' },
}

const EMPTY_FORM = {
  customerId: '',
  vehicleId: '',
  vehicleSize: 'medium',
  notes: '',
  items: [],
  applyVat: false,
  promoCode: '',
  bay: '',
}
const BRANCH_OPTIONS = [
  { value: 'Cubao', label: 'Cubao Branch' },
  { value: 'Manila', label: 'Manila Branch' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { cls: 'badge-neutral', label: status }
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>
}

function ServiceLineEditor({ items, onItemsChange, vehicleSize, priceOverrides = {}, customCatalog = [], materialsNotesByCode = {} }) {
  const fullCatalog = [...SERVICE_CATALOG, ...customCatalog.filter((s) => s.enabled !== false)]
  const [addCode, setAddCode] = useState('')

  const addItem = () => {
    if (!addCode) return
    const def = fullCatalog.find((s) => s.code === addCode)
    if (!def) return
    if (items.find((i) => i.code === addCode)) return
    const bikeSize = vehicleSize === 'small-bike' || vehicleSize === 'big-bike'
    if (bikeSize && !def.sizePrices[vehicleSize]) return

    const unitPrice = getEffectivePrice(addCode, vehicleSize, priceOverrides)
      || getEffectivePrice(addCode, 'medium', priceOverrides)
      || 0
    onItemsChange([
      ...items,
      { code: def.code, name: def.name, group: def.group, qty: 1, unitPrice, total: unitPrice },
    ])
    setAddCode('')
  }

  const updateQty = (code, qty) => {
    onItemsChange(
      items.map((i) => i.code === code ? { ...i, qty, total: qty * i.unitPrice } : i),
    )
  }

  const updatePrice = (code, unitPrice) => {
    onItemsChange(
      items.map((i) => i.code === code ? { ...i, unitPrice, total: i.qty * unitPrice } : i),
    )
  }

  const removeItem = (code) => onItemsChange(items.filter((i) => i.code !== code))

  const selectedDef = fullCatalog.find((s) => s.code === addCode)
  const isBikeSize = vehicleSize === 'small-bike' || vehicleSize === 'big-bike'
  const selectedUnavailableForBike = isBikeSize && selectedDef && !selectedDef.sizePrices[vehicleSize]
  const selectedMaterialsNotes = selectedDef
    ? (materialsNotesByCode[normalizeServiceCode(selectedDef.code)] || '')
    : ''
  // Build options for SearchableSelect: hide already-added and unavailable-for-bike services
  const badgeFor = (s) => {
    const m = s.name.match(/(\d+)\s*Years?/i)
    return m ? `${m[1]}YR` : null
  }

  const options = fullCatalog
    .filter((s) => {
      const alreadyAdded = !!items.find((i) => i.code === s.code)
      const unavailableForBike = isBikeSize && !s.sizePrices[vehicleSize]
      return !alreadyAdded && !unavailableForBike
    })
    .map((s) => ({ value: s.code, label: s.name, category: s.group, description: s.group, badge: badgeFor(s) }))

  return (
    <div className="sle-wrap">
      <div className="sle-add-row">
        <SearchableSelect
          options={options}
          value={addCode}
          onChange={setAddCode}
          grouped={true}
          placeholder="— Select service to add —"
        />
        <button type="button" className="btn-secondary sle-add-btn" onClick={addItem} disabled={!addCode || selectedUnavailableForBike}>
          + Add
        </button>
      </div>
      {selectedUnavailableForBike && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '6px',
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '0.82rem',
          fontWeight: 600,
        }}>
          ⚠ <strong>{selectedDef.name}</strong> is not available for {vehicleSize === 'small-bike' ? 'Small Bike' : 'Big Bike'}. Please select a different service.
        </div>
      )}

      {!!selectedMaterialsNotes && !selectedUnavailableForBike && (
        <div style={{ marginTop: 8 }}>
          <div className="sle-service-group">Materials Notes (client-visible)</div>
          <div className="sle-service-name" style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: 4, whiteSpace: 'pre-wrap' }}>
            {selectedMaterialsNotes}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <table className="sle-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Qty</th>
              <th>Unit Price (₱)</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.code}>
                <td>
                  <span className="sle-service-name">{item.name}</span>
                  <span className="sle-service-group">{item.group}</span>
                  {(() => {
                    const notes = materialsNotesByCode[normalizeServiceCode(item.code)]
                    const clean = String(notes || '').trim()
                    return clean ? <span className="sle-service-group">Materials: {clean}</span> : null
                  })()}
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updateQty(item.code, Math.max(1, Number(e.target.value)))}
                    className="sle-num"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => updatePrice(item.code, Number(e.target.value))}
                    className="sle-num"
                  />
                </td>
                <td className="sle-total">{formatCurrency(item.total)}</td>
                <td>
                  <button type="button" className="sle-remove" onClick={() => removeItem(item.code)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items.length === 0 && (
        <p className="sle-empty">No services added yet. Select from the list above.</p>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function QuotationsPage({ token, user, onCreateJobOrder, preselectedQuotation, onPreselectedConsumed, onRequestCreateBooking }) {
  const [quotations, setQuotations] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isSuperAdmin = user?.role === 'SuperAdmin'

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  // customerPreview: holds { id, full_name, mobile } of the currently selected customer
  // used to restore the display label in CustomerAutocomplete after edit / preselect
  const [customerPreview, setCustomerPreview] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [filteredVehicles, setFilteredVehicles] = useState([])

  const [viewItem, setViewItem] = useState(null)
  const [confirmCfg, setConfirmCfg] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } })

  // Customer modal (reuse CRM view)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerQuotations, setCustomerQuotations] = useState([])
  const [customerJobOrders, setCustomerJobOrders] = useState([])
  const [customerVehicles, setCustomerVehicles] = useState([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState('')

  // Materials notes lookup from DB services (keyed by normalized code)
  const [materialsNotesByCode, setMaterialsNotesByCode] = useState({})
  useEffect(() => {
    if (!token) return
    apiGet('/services', token)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        const next = {}
        for (const svc of list) {
          const key = normalizeServiceCode(svc?.code)
          if (!key) continue
          const notes = String(svc?.materials_notes || '').trim()
          if (notes) next[key] = notes
        }
        setMaterialsNotesByCode(next)
      })
      .catch(() => {
        // non-blocking: quotation can still be created without notes
      })
  }, [token])

  // Branch locations from configuration
  const [branchLocations, setBranchLocations] = useState(['Cubao', 'Manila'])
  useEffect(() => {
    apiGet('/config/category/booking', token)
      .then((arr) => {
        const entries = Array.isArray(arr) ? arr : []
        const raw = entries.find((e) => e.key === 'branch_locations')?.value ?? null
        const parsed = Array.isArray(raw) ? raw : (() => { try { return raw ? JSON.parse(raw) : null } catch { return null } })()
        if (Array.isArray(parsed) && parsed.length > 0) setBranchLocations(parsed)
      })
      .catch(() => { })
  }, [token])

  // Balance guard state
  const [balanceWarning, setBalanceWarning] = useState(null)  // { balances, totalOutstanding, canOverride }
  const [overrideBalance, setOverrideBalance] = useState(false)

  // Promo code state
  const [promoInfo, setPromoInfo] = useState(null)   // { discount_type, discount_value, code, description } | null
  const [promoError, setPromoError] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)

  const displayBranch = (q) => {
    const bay = String(q?.bay || q?.customer_bay || '').trim()
    if (bay) return bay
    const m = String(q?.quotation_no || '').match(/^QT-([A-Z]{2,3})-/)
    return m ? m[1] : '—'
  }

  // VAT rate from configuration
  const [vatRate, setVatRate] = useState(0)
  useEffect(() => {
    apiGet('/config', token).then((res) => {
      const data = res.data || res
      const businessEntries = data?.business || []
      const entry = Array.isArray(businessEntries)
        ? businessEntries.find((e) => e.key === 'tax_vat_rate')
        : null
      if (entry) setVatRate(Number(entry.value) || 0)
    }).catch(() => { })
  }, [token])

  // Service price overrides + active vehicle sizes + custom services from Settings > Quotations
  const [priceOverrides, setPriceOverrides] = useState({})
  const [activeSizes, setActiveSizes] = useState(VEHICLE_SIZE_OPTIONS)
  const [customServices, setCustomServices] = useState([])
  const [leadPreview, setLeadPreview] = useState(null)
  const leadSourceRef = useRef(null)
  const [leadScheduleHintsByQuotationId, setLeadScheduleHintsByQuotationId] = useState({})
  const processingLeadRef = useRef(null)
  useEffect(() => {
    apiGet('/config/category/quotations', token)
      .then((rows) => {
        const arr = Array.isArray(rows) ? rows : []
        const pricesRow = arr.find((r) => r.key === 'service_prices')
        if (pricesRow?.value) {
          try { setPriceOverrides(typeof pricesRow.value === 'string' ? JSON.parse(pricesRow.value) : pricesRow.value) } catch { }
        }
        const sizesRow = arr.find((r) => r.key === 'vehicle_sizes')
        if (sizesRow?.value) {
          try {
            const parsed = typeof sizesRow.value === 'string' ? JSON.parse(sizesRow.value) : sizesRow.value
            if (Array.isArray(parsed) && parsed.length > 0) {
              setActiveSizes(parsed.filter((s) => s.enabled !== false))
            }
          } catch { }
        }
        const svcRow = arr.find((r) => r.key === 'custom_services')
        if (svcRow?.value) {
          try {
            const parsed = typeof svcRow.value === 'string' ? JSON.parse(svcRow.value) : svcRow.value
            if (Array.isArray(parsed)) setCustomServices(parsed)
          } catch { }
        }
      })
      .catch(() => { })
  }, [token])

  // Services Process from configuration
  const [servicesProcess, setServicesProcess] = useState({})
  useEffect(() => {
    apiGet('/config/category/services_process', token).then((res) => {
      const arr = Array.isArray(res) ? res : []
      const mapped = {}
      arr.forEach(e => { mapped[e.key] = e.value })
      setServicesProcess(mapped)
    }).catch(() => { })
  }, [token])

  // ── Data loading ─────────────────────────────────────────────────────────

  const load = async (pg = page, srch = search, st = filterStatus, tab = viewMode) => {
    setLoading(true)
    try {
      const res = await apiGet('/quotations', token, { page: pg, limit: 10, search: srch, status: st, tab })
      setQuotations(res.data)
      setPagination(res.pagination)
      setPage(res.pagination.page)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1, '', '', 'active') }, [token])

  // Auto-refresh when the app detects new portal booking requests (quotations)
  useEffect(() => {
    if (!token) return
    const handler = () => {
      load(page, search, filterStatus, viewMode).catch(() => {})
    }
    window.addEventListener('ma:quotations-updated', handler)
    return () => window.removeEventListener('ma:quotations-updated', handler)
  }, [token, page, search, filterStatus, viewMode])

  useEffect(() => {
    apiGet('/vehicles', token, { page: 1, limit: 500 })
      .then((vRes) => setVehicles(vRes.data || vRes))
      .catch(() => { })
  }, [token])

  // If a preselected quotation payload is provided (from lead or vehicle save), open New Quotation prefilled
  useEffect(() => {
    if (preselectedQuotation && (preselectedQuotation.customerId || preselectedQuotation.isFromLead)) {
      // Prevent double-processing same lead
      const leadId = preselectedQuotation.id || JSON.stringify(preselectedQuotation)
      if (preselectedQuotation.isFromLead && processingLeadRef.current === leadId) return
      if (preselectedQuotation.isFromLead) processingLeadRef.current = leadId

      if (preselectedQuotation.isFromLead) {
        setLeadPreview(preselectedQuotation)
        leadSourceRef.current = preselectedQuotation
        
        // Initial blank form
        const baseForm = {
          ...EMPTY_FORM,
          vehicleSize: preselectedQuotation.vehicleSize || 'medium',
          notes: preselectedQuotation.notes || '',
          bay: preselectedQuotation.branch || '',
        }

        // Match service if possible
        if (preselectedQuotation.serviceCode) {
          const fullCatalog = [...SERVICE_CATALOG, ...customServices]
          const matchQuery = fullCatalog.find(s => s.code === preselectedQuotation.serviceCode)
          if (matchQuery) {
            const price = getEffectivePrice(matchQuery.code, preselectedQuotation.vehicleSize || 'medium', priceOverrides) || 0
            baseForm.items = [{ code: matchQuery.code, name: matchQuery.name, group: matchQuery.group, qty: 1, unitPrice: price, total: price }]
          } else {
            const fallbackName = String(preselectedQuotation.serviceName || preselectedQuotation.serviceCode || '').trim()
            const fallbackUnitPrice = Number(preselectedQuotation.serviceUnitPrice)
            const unitPrice = Number.isFinite(fallbackUnitPrice) && fallbackUnitPrice > 0 ? fallbackUnitPrice : 0
            if (fallbackName) {
              baseForm.items = [{
                code: preselectedQuotation.serviceCode || 'lead-service',
                name: fallbackName,
                group: preselectedQuotation.serviceCategory || 'Online Lead',
                qty: 1,
                unitPrice,
                total: unitPrice,
              }]
            }
          }
        }

        setForm(baseForm)

        // PROACTIVE AUTO-FILL: Search or Create customer/vehicle
        const processLeadAutoFill = async () => {
          setLoading(true)
          try {
            // 1. Customer
            let cId = preselectedQuotation.customerId || null
            let cPrev = null

            if (cId) {
              const res = await apiGet(`/customers/${cId}`, token)
              const c = res.data || res
              if (c) cPrev = { id: c.id, full_name: c.full_name, mobile: c.mobile }
            } else {
              const mobileDigits = String(preselectedQuotation.customerMobile || '').replace(/\D/g, '')
              const cRes = await apiGet('/customers', token, { search: mobileDigits, limit: 10 })
              const customerData = cRes.data || cRes
              const exactMatch = Array.isArray(customerData) 
                ? customerData.find(c => String(c.mobile || '').replace(/\D/g, '').endsWith(mobileDigits.slice(-10)))
                : null

              if (exactMatch) {
                cId = exactMatch.id
                cPrev = { id: cId, full_name: exactMatch.full_name, mobile: exactMatch.mobile }
              } else {
                const nc = await apiPost('/customers', token, {
                  fullName: preselectedQuotation.customerName,
                  mobile: preselectedQuotation.customerMobile,
                  email: normalizeEmailClient(preselectedQuotation.customerEmail),
                  customerType: 'Retail',
                  bay: preselectedQuotation.branch || ''
                })
                cId = nc.id
                cPrev = { id: cId, full_name: nc.full_name, mobile: nc.mobile }
              }
            }

            // 2. Vehicle
            let vId = preselectedQuotation.vehicleId || null
            const vRes = await apiGet(`/vehicles/customer/${cId}`, token)
            const list = Array.isArray(vRes) ? vRes : (vRes.data || [])
            let selectedVehicle = null

            if (vId) {
              const exists = list.find(v => String(v.id) === String(vId))
              if (!exists) vId = null
              else selectedVehicle = exists
            }

            if (!vId) {
              const lpPlate = (preselectedQuotation.vehiclePlate || '').replace(/\s+/g, '').toUpperCase()
              const foundVeh = lpPlate ? list.find(v => (v.plate_number || v.plate_no || '').replace(/\s+/g, '').toUpperCase() === lpPlate) : null

              if (foundVeh) {
                vId = foundVeh.id
                selectedVehicle = foundVeh
              } else if (lpPlate) {
                const nv = await apiPost('/vehicles', token, {
                  customerId: cId,
                  make: preselectedQuotation.vehicleMake,
                  model: preselectedQuotation.vehicleModel,
                  plateNumber: preselectedQuotation.vehiclePlate,
                })
                vId = nv.id
                selectedVehicle = nv
              }
            }

            // Keep the local vehicle cache in sync so the dropdown is immediately populated.
            if (selectedVehicle && selectedVehicle.id) {
              setVehicles((prev) => {
                const idStr = String(selectedVehicle.id)
                const next = Array.isArray(prev) ? prev.filter((v) => String(v.id) !== idStr) : []
                return [selectedVehicle, ...next]
              })
            }

          setCustomerPreview(cPrev)
          setForm(prev => ({ ...prev, customerId: String(cId), vehicleId: vId ? String(vId) : '' }))
          pushToast('success', 'Customer/Vehicle auto-identified')
        } catch (err) {
          pushToast('error', `Auto-fill failed: ${err.message}`)
        } finally {
          setLoading(false)
        }
      }
      processLeadAutoFill()
    } else {
      setForm((p) => ({ ...p, customerId: String(preselectedQuotation.customerId || ''), vehicleId: preselectedQuotation.vehicleId ? String(preselectedQuotation.vehicleId) : '' }))
      setLeadPreview(null)
      leadSourceRef.current = null
    }
    setEditingId(null)
    setFormError('')
    setBalanceWarning(null)
    setOverrideBalance(false)
    setShowForm(true)
    if (onPreselectedConsumed) onPreselectedConsumed()
  }
}, [preselectedQuotation, priceOverrides, token, customServices])

  useEffect(() => {
    if (form.customerId) {
      const vList = vehicles.filter((v) => String(v.customer_id) === String(form.customerId))
      setFilteredVehicles(vList)
      // Auto-select: if only one vehicle, pick it; if multiple, pick first — but only when vehicle not already set
      if (vList.length >= 1 && !form.vehicleId) {
        setForm((p) => ({ ...p, vehicleId: String(vList[0].id) }))
      }
    } else {
      setFilteredVehicles([])
    }
  }, [form.customerId, vehicles])

  // ── Derived ───────────────────────────────────────────────────────────────

  const subtotal = form.items.reduce((s, i) => s + (i.total || 0), 0)
  const vatAmount = form.applyVat ? subtotal * (vatRate / 100) : 0
  const preDiscount = subtotal + vatAmount
  const promoDiscount = promoInfo
    ? promoInfo.discount_type === 'percent'
      ? Math.min((promoInfo.discount_value / 100) * preDiscount, preDiscount)
      : Math.min(promoInfo.discount_value, preDiscount)
    : 0
  const totalAmount = Math.max(preDiscount - promoDiscount, 0)

  // ── Promo code validate ───────────────────────────────────────────────────

  const validatePromoCode = async (code) => {
    if (!code || !code.trim()) {
      setPromoInfo(null)
      setPromoError('')
      return
    }
    setPromoLoading(true)
    setPromoError('')
    try {
      const res = await apiGet(`/promo-codes/validate/${encodeURIComponent(code.trim())}`, token)
      if (res.valid) {
        setPromoInfo(res)
        setPromoError('')
      } else {
        setPromoInfo(null)
        setPromoError(res.message || 'Invalid promo code.')
      }
    } catch (e) {
      setPromoInfo(null)
      setPromoError(e.message || 'Invalid promo code.')
    } finally {
      setPromoLoading(false)
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setBalanceWarning(null)
    setOverrideBalance(false)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setCustomerPreview(null)
    setBalanceWarning(null)
    setOverrideBalance(false)
    setPromoInfo(null)
    setPromoError('')
    leadSourceRef.current = null
  }

  const handleEdit = async (quotation) => {
    try {
      const full = await apiGet(`/quotations/${quotation.id}`, token)
      const rawServices = Array.isArray(full.services) ? full.services : []
      setEditingId(quotation.id)
      setCustomerPreview(full.customer_id ? { id: full.customer_id, full_name: full.customer_name, mobile: full.customer_mobile } : null)
      setForm({
        customerId: String(full.customer_id || ''),
        vehicleId: String(full.vehicle_id || ''),
        vehicleSize: full.vehicle_size || 'medium',
        notes: full.notes || '',
        bay: full.bay || '',
        applyVat: false,
        promoCode: full.promo_code || '',
        items: rawServices.map((s) => ({
          code: s.code,
          name: s.name,
          group: s.group || s.category || '',
          qty: s.qty || 1,
          unitPrice: s.unitPrice || s.base_price || 0,
          total: s.total || (s.qty || 1) * (s.unitPrice || s.base_price || 0),
        })),
      })
      setFormError('')
      setBalanceWarning(null)
      setOverrideBalance(false)
      setPromoInfo(null)
      setPromoError('')
      setShowForm(true)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleVehicleSizeChange = (size) => {
    const newItems = form.items.map((item) => {
      const def = SERVICE_CATALOG.find((s) => s.code === item.code)
      const unitPrice = def?.sizePrices[size] || def?.sizePrices['medium'] || item.unitPrice
      return { ...item, unitPrice, total: item.qty * unitPrice }
    })
    setForm((p) => ({ ...p, vehicleSize: size, items: newItems }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.customerId || !form.vehicleId) {
      setFormError('Customer and vehicle are required.')
      return
    }
    if (form.items.length === 0) {
      setFormError('Add at least one service.')
      return
    }
    try {
      const payload = {
        customerId: Number(form.customerId),
        vehicleId: Number(form.vehicleId),
        services: form.items,
        notes: form.notes,
        totalAmount: preDiscount,
        vehicleSize: form.vehicleSize,
        ...(form.promoCode?.trim() ? { promoCode: form.promoCode.trim() } : {}),
        ...(overrideBalance ? { overrideBalance: true } : {}),
      }

      // Branch (bay) is now assigned from CRM / customer profile during creation.
      // Keep it editable only when editing an existing quotation.
      if (editingId) payload.bay = form.bay || null
      if (editingId) {
        const updated = await apiPatch(`/quotations/${editingId}`, token, payload)
        closeForm()
        await load(1, search, filterStatus)
        // Open updated quotation in the detail modal
        setViewItem(updated)
      } else {
        const leadSource = leadSourceRef.current
        const created = await apiPost('/quotations', token, payload)
        closeForm()
        await load(1, search, filterStatus)
        // Fetch the full joined record so customer/vehicle names appear in the detail modal
        const full = await apiGet(`/quotations/${created.id}`, token)
        // Keep schedule hints from online lead in-memory so Create Schedule can prefill start/end.
        if (leadSource?.isFromLead && (leadSource.preferredDate || leadSource.endDate)) {
          setLeadScheduleHintsByQuotationId((prev) => ({
            ...prev,
            [created.id]: {
              preferredDate: leadSource.preferredDate || null,
              endDate: leadSource.endDate || null,
            },
          }))
        }

        // If this quotation was created from an online quotation request, move that request to history.
        if (leadSource?.isFromLead && leadSource?.id) {
          try {
            await apiPatch(`/online-quotation-requests/${leadSource.id}/status`, token, { status: 'Archived' })
            window.dispatchEvent(new CustomEvent('ma:online-quotation-requests-updated'))
          } catch (err) {
            // Non-blocking: the quotation is already saved.
            pushToast('warning', `Quotation saved, but failed to archive lead: ${err.message}`)
          }
        }
        setViewItem(full)
        pushToast('success', 'Quotation saved')
      }
    } catch (e) {
      // Customer has unpaid WITH BALANCE quotations
      if (e.hasUnpaidBalance) {
        setBalanceWarning({ balances: e.balances || [], totalOutstanding: e.totalOutstanding || 0, canOverride: e.canOverride })
        setFormError('')
      } else {
        setFormError(e.message)
      }
    }
  }

  const handleStatusChange = (id, status, afterClose) => {
    const titles = { Approved: 'Approve Quotation', 'Not Approved': 'Reject Quotation', Pending: 'Reset to Pending' }
    const messages = {
      Approved: 'Are you sure you want to approve this quotation?',
      'Not Approved': 'Are you sure you want to reject this quotation?',
      Pending: 'Reset this quotation back to Pending?',
    }
    setConfirmCfg({
      isOpen: true,
      title: titles[status],
      message: messages[status],
      onConfirm: async () => {
        try {
          await apiPatch(`/quotations/${id}/status`, token, { status })
          await load(page, search, filterStatus)
          if (viewItem?.id === id) setViewItem((p) => ({ ...p, status }))
          setConfirmCfg((p) => ({ ...p, isOpen: false }))
          if (status === 'Approved') pushToast('success', 'Quotation approved successfully!')
          else if (status === 'Not Approved') pushToast('warning', 'Quotation marked as Not Approved.')
          else if (status === 'Pending') pushToast('info', 'Quotation reset to Pending.')
          if (afterClose) afterClose()
        } catch (e) {
          setError(e.message)
          setConfirmCfg((p) => ({ ...p, isOpen: false }))
        }
      },
    })
  }

  const handleDelete = (id) => {
    setConfirmCfg({
      isOpen: true,
      title: 'Delete Quotation',
      message: 'This will permanently delete the quotation and cannot be undone.',
      onConfirm: async () => {
        try {
          await apiDelete(`/quotations/${id}`, token)
          await load(page, search, filterStatus)
          setConfirmCfg((p) => ({ ...p, isOpen: false }))
        } catch (e) {
          setError(e.message)
          setConfirmCfg((p) => ({ ...p, isOpen: false }))
        }
      },
    })
  }

  const handleView = async (id) => {
    try {
      const q = await apiGet(`/quotations/${id}`, token)
      setViewItem(q)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleCreateJO = (quotation) => {
    setViewItem(null)
    if (onCreateJobOrder) onCreateJobOrder(quotation)
  }

  const renderConfiguredProcess = (configKey, title, subtitle) => {
    const text = servicesProcess[configKey]
    if (!text) return null
    const lines = text.split('\n').filter(l => l.trim())
    return (
      <div style={{ marginTop: '10px', background: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f1f5f9' }}>{title}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{subtitle}</div>
          </div>
        </div>
        {lines.map((line, idx) => {
          const isHeader = line.toUpperCase().includes('DAY') && !line.match(/^\d+\./)
          const isStep = line.match(/^\d+\./)
          const isFooter = line.toLowerCase().includes('estimated total duration')

          if (isHeader) {
            return (
              <div key={idx} style={{ fontSize: '0.63rem', fontWeight: 700, color: '#a0a8b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: idx === 0 ? '0 0 6px' : '14px 0 6px' }}>{line}</div>
            )
          }
          if (isStep) {
            const matches = line.match(/^(\d+)\.\s*(.*?)(?::\s*(.*))?$/)
            if (matches) {
              const [, num, name, desc] = matches
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111111', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 10px', marginBottom: 5 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a0a8b8' }}>{num}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e2e8f0' }}>{name}</div>
                    {desc && <div style={{ fontSize: '0.65rem', color: '#475569' }}>{desc}</div>}
                  </div>
                </div>
              )
            }
          }
          if (isFooter) {
            const parts = line.split(':')
            return (
              <div key={idx} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap' }}>{parts[0]}</span>
                <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '100%', background: 'rgba(255,255,255,0.2)', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#aaaaaa', whiteSpace: 'nowrap' }}>{parts[1] || ''}</span>
              </div>
            )
          }
          return <div key={idx} style={{ fontSize: '0.65rem', color: '#475569', marginBottom: 4 }}>{line}</div>
        })}
      </div>
    )
  }

  const handlePrintQuotation = (q) => {
    const statusColors = {
      draft: { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' },
      sent: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
      pending: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
      approved: { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
      'not approved': { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
      history: { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' },
    }
    const st = statusColors[(q.status || '').toLowerCase()] || { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' }

    const serviceRows = (q.services || []).map((s) => {
      const notes = materialsNotesByCode[normalizeServiceCode(s?.code)]
      const clean = String(notes || '').trim()
      return `
      <tr>
        <td>
          <span class="svc-name">${escapeHtml(s.name || '')}</span>
          ${s.group ? `<span class="svc-group">${escapeHtml(s.group)}</span>` : ''}
          ${clean ? `<span class="svc-group">Materials: ${escapeHtml(clean)}</span>` : ''}
        </td>
        <td style="text-align:right;font-weight:600;color:#111">${s.qty}</td>
        <td style="text-align:right;font-weight:600;color:#111">&#8369;${Number(s.unitPrice || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-weight:700;color:#111">&#8369;${Number(s.total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quotation — ${escapeHtml(q.quotation_no)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 36px 40px; max-width: 780px; margin: 0 auto; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 1.5px solid #e5e7eb; margin-bottom: 22px; }
    .brand-name { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-right { text-align: right; }
    .doc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; }
    .doc-number { font-size: 18px; font-weight: 800; color: #111; margin-top: 3px; }

    .meta-row { display: flex; gap: 0; margin-bottom: 22px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .meta-item { flex: 1; padding: 12px 18px; border-right: 1px solid #e5e7eb; }
    .meta-item:last-child { border-right: none; }
    .meta-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #9ca3af; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111; }
    .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
    .info-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; position: relative; overflow: hidden; }
    .info-block::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #374151; }
    .info-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #374151; margin-bottom: 8px; }
    .info-name { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 5px; }
    .info-line { font-size: 12px; color: #4b5563; margin-bottom: 3px; }

    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.3px; color: #6b7280; margin: 22px 0 10px; display: flex; align-items: center; gap: 8px; }
    .section-title::before { content: ''; display: inline-block; width: 3px; height: 14px; background: #374151; border-radius: 2px; flex-shrink: 0; }

    .svc-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .svc-table th { background: #f9fafb; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; padding: 10px 14px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .svc-table th.right { text-align: right; }
    .svc-table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    .svc-table tr:last-child td { border-bottom: none; }
    .svc-name { font-size: 13px; color: #111; font-weight: 500; display: block; }
    .svc-group { font-size: 11px; color: #9ca3af; display: block; margin-top: 2px; }

    .total-row { display: flex; justify-content: flex-end; margin-top: 14px; }
    .total-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 20px; display: flex; align-items: center; gap: 24px; }
    .total-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #6b7280; }
    .total-amount { font-size: 18px; font-weight: 800; color: #059669; }

    .notes-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; color: #374151; background: #fafafa; white-space: pre-wrap; font-size: 12.5px; line-height: 1.6; }

    .sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; margin-top: 48px; }
    .sig-box { border-top: 1.5px solid #d1d5db; padding-top: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; text-align: center; }

    @media print { body { padding: 24px 28px; } }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand-name">MasterAuto</div>
      <div class="brand-sub">Automotive Services</div>
    </div>
    <div class="doc-right">
      <div class="doc-label">Quotation</div>
      <div class="doc-number">${escapeHtml(q.quotation_no)}</div>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-label">Date Issued</div>
      <div class="meta-value">${new Date(q.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Status</div>
      <span class="badge" style="background:${st.bg};color:${st.color}">
        <span class="badge-dot" style="background:${st.dot}"></span>
        ${q.status}
      </span>
    </div>
  </div>

  <div class="grid">
    <div class="info-block">
      <div class="info-label">Customer</div>
      <div class="info-name">${escapeHtml(q.customer_name || '—')}</div>
      ${q.customer_mobile ? `<div class="info-line">${escapeHtml(q.customer_mobile)}</div>` : ''}
      ${q.customer_email ? `<div class="info-line">${escapeHtml(q.customer_email)}</div>` : ''}
      ${q.customer_address ? `<div class="info-line">${escapeHtml(q.customer_address)}</div>` : ''}
    </div>
    <div class="info-block">
      <div class="info-label">Vehicle</div>
      <div class="info-name">${escapeHtml(q.plate_number || '—')}</div>
      <div class="info-line">${escapeHtml([q.make, q.model, q.vehicle_year].filter(Boolean).join(' '))}</div>
      ${q.color ? `<div class="info-line">Color: ${escapeHtml(q.color)}</div>` : ''}
      ${q.variant ? `<div class="info-line">Variant: ${escapeHtml(q.variant)}</div>` : ''}
    </div>
  </div>

  <div class="section-title">Services</div>
  <table class="svc-table">
    <thead><tr><th>Service</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Total</th></tr></thead>
    <tbody>${serviceRows}</tbody>
  </table>

  <div class="total-row">
    <div class="total-box">
      <span class="total-label">Total Amount</span>
      <span class="total-amount">&#8369;${Number(q.total_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
    </div>
  </div>

  ${q.notes ? `<div class="section-title">Notes</div><div class="notes-box">${escapeHtml(q.notes)}</div>` : ''}

</body>
</html>`

    const win = window.open('', '_blank', 'width=860,height=750')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const openCustomerDetails = async (customer) => {
    setSelectedCustomer(customer)
    setShowCustomerModal(true)
    setServicesError('')
    setServicesLoading(true)
    try {
      const [qRes, joRes, vRes] = await Promise.all([
        apiGet('/quotations', token, { page: 1, limit: 200, search: customer.full_name }).catch(() => ({ data: [] })),
        apiGet('/job-orders', token, { page: 1, limit: 200, search: customer.full_name }).catch(() => ({ data: [] })),
        apiGet(`/vehicles/customer/${customer.id}`, token).catch(() => ({ data: [] })),
      ])
      setCustomerQuotations(qRes.data || [])
      setCustomerJobOrders(joRes.data || [])
      setCustomerVehicles((vRes && (vRes.data || vRes)) || [])
    } catch (err) {
      setServicesError(err.message || 'Failed to load services')
    } finally {
      setServicesLoading(false)
    }
  }

  const handleFilterByCustomer = async (customerName) => {
    try {
      setSearch(customerName)
      setPage(1)
      await load(1, customerName, filterStatus)
    } catch (e) {
      setError(e.message)
    }
  }

  const fetchCustomerAndOpen = async (customerId) => {
    try {
      const cust = await apiGet(`/customers/${customerId}`, token)
      // API may return object or { data: obj }
      const customer = (cust && (cust.data || cust)) || { id: customerId }
      await openCustomerDetails(customer)
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const ACTIVE_STATUSES = ['Draft', 'Pending', 'Sent', 'Approved']
  const HISTORY_STATUSES = ['Approved', 'Not Approved', 'Cancelled']

  return (
    <div className="page-grid">
      <SectionCard
        title="Quotations"
        subtitle="Create and manage service quotations. Only Approved quotations can proceed to a Job Order."
        actionLabel={viewMode === 'active' ? '+ New Quotation' : undefined}
        onActionClick={viewMode === 'active' ? openNew : undefined}
      >
        {/* ── Active / History tab switcher ── */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
          {[{ key: 'active', label: 'Active Quotations' }, { key: 'history', label: 'History' }].map(({ key, label }) => {
            const isSelected = viewMode === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setViewMode(key)
                  setFilterStatus('')
                  setPage(1)
                  load(1, search, '', key)
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

        {/* Toolbar */}
        <div className="module-toolbar">
          <input
            type="search"
            placeholder="Search quotation no., customer, plate..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); load(1, e.target.value, filterStatus, viewMode) }}
          />
          <div className="toolbar-filters">
            {['', ...(viewMode === 'history' ? HISTORY_STATUSES : ACTIVE_STATUSES)].map((s) => (
              <button
                key={s || 'all'}
                type="button"
                className={`filter-chip${filterStatus === s ? ' active' : ''}`}
                onClick={() => { setFilterStatus(s); load(1, search, s, viewMode) }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="form-error-text">{error}</p>}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table qo-table">
            <thead>
              <tr>
                <th>Quotation No.</th>
                <th>Branch</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Services</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="table-empty">Loading…</td></tr>
              )}
              {!loading && quotations.length === 0 && (
                <tr><td colSpan={8} className="table-empty">No quotations found.</td></tr>
              )}
              {!loading && quotations.map((q) => (
                <tr key={q.id} onClick={() => handleView(q.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="td-name">{q.quotation_no}</span>
                    <div className="td-sub" style={{ marginTop: 6 }}>{new Date(q.created_at).toLocaleDateString('en-PH')}</div>
                  </td>
                  <td>
                    <span className="td-sub">{displayBranch(q)}</span>
                  </td>
                  <td>
                    <span className="td-name link-btn" style={{ cursor: 'pointer' }}>{q.customer_name}</span>
                  </td>
                  <td>
                    <span className="td-name">{q.plate_number}</span>
                    <span className="td-sub">{q.make} {q.model} {q.vehicle_year}</span>
                  </td>
                  <td>
                    <span className="td-sub">{Array.isArray(q.services) ? q.services.length : 0} service(s)</span>
                  </td>
                  <td className="td-amount">{formatCurrency(q.total_amount)}</td>
                  <td><StatusBadge status={q.status} /></td>

                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      {/* History tab: show only disabled Edit + Delete icons */}
                      {viewMode === 'history' ? (
                        <>
                          <button
                            type="button"
                            className="btn-icon action-edit"
                            title="Cannot edit — history record"
                            disabled
                            style={{ cursor: 'not-allowed', opacity: 0.35 }}
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                          </button>
                          <button
                            type="button"
                            className="btn-icon action-danger"
                            title="Cannot delete — history record"
                            disabled
                            style={{ cursor: 'not-allowed', opacity: 0.35 }}
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Draft / legacy Pending: can Send, Approve, or Reject */}
                          {(q.status === 'Draft' || q.status === 'Pending') && (
                            <>
                              <button type="button" className="btn-icon action-send" title="Send to customer" onClick={() => handleStatusChange(q.id, 'Sent')}>
                                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l.065-.021L10 15.233l6.66 2.708.065.021a1 1 0 001.169-1.409l-7-14zM10 13.566V9a1 1 0 10-2 0v4.566l-4.553 1.851L10 4.118l6.553 11.299L10 13.566z" /></svg>
                              </button>
                              <button type="button" className="btn-approve-sm" onClick={() => handleStatusChange(q.id, 'Approved', () => handleView(q.id))}>
                                ✓ Approve
                              </button>
                              <button type="button" className="btn-reject-sm" onClick={() => handleStatusChange(q.id, 'Not Approved')}>
                                ✕ Reject
                              </button>
                            </>
                          )}
                          {/* Sent: Approve or Reject */}
                          {q.status === 'Sent' && (
                            <>
                              <button type="button" className="btn-approve-sm" onClick={() => handleStatusChange(q.id, 'Approved', () => handleView(q.id))}>
                                ✓ Approve
                              </button>
                              <button type="button" className="btn-reject-sm" onClick={() => handleStatusChange(q.id, 'Not Approved')}>
                                ✕ Reject
                              </button>
                            </>
                          )}
                          {/* Approved: show JO status; JO creation now happens via Scheduling → Start Job */}
                          {q.status === 'Approved' && q.job_order_count === 0 && (
                            <button
                              type="button"
                              className="btn-schedule btn-schedule-sm"
                              title="Create a schedule for this quotation"
                              onClick={(e) => {
                                e.stopPropagation()
                                const hint = leadScheduleHintsByQuotationId[q.id] || null
                                const payload = { quotationId: q.id, customerId: q.customer_id, vehicleId: q.vehicle_id, ...(hint || {}) }
                                if (typeof onRequestCreateBooking === 'function') return onRequestCreateBooking(payload)
                                window.dispatchEvent(new CustomEvent('ma:create-schedule', { detail: payload }))
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                              Create Schedule
                            </button>
                          )}
                          {q.status === 'Approved' && q.job_order_count > 0 && (
                            <button
                              type="button"
                              className="btn-schedule btn-schedule-sm"
                              title="Create another schedule for this quotation"
                              onClick={(e) => {
                                e.stopPropagation()
                                const hint = leadScheduleHintsByQuotationId[q.id] || null
                                const payload = { quotationId: q.id, customerId: q.customer_id, vehicleId: q.vehicle_id, ...(hint || {}) }
                                if (typeof onRequestCreateBooking === 'function') return onRequestCreateBooking(payload)
                                window.dispatchEvent(new CustomEvent('ma:create-schedule', { detail: payload }))
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                              Create Schedule
                            </button>
                          )}
                          {/* Edit / Delete for non-terminal statuses */}
                          {!['Approved', 'Not Approved'].includes(q.status) && (
                            <>
                              <button
                                type="button"
                                className="btn-icon action-edit"
                                title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : 'Edit'}
                                onClick={() => handleEdit(q)}
                                disabled={!isSuperAdmin}
                                style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                              </button>
                              <button
                                type="button"
                                className="btn-icon action-danger"
                                title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : q.status === 'Approved' ? 'Cannot delete an approved quotation' : 'Delete'}
                                onClick={() => handleDelete(q.id)}
                                disabled={!isSuperAdmin || q.status === 'Approved'}
                                style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={(p) => { setPage(p); load(p, search, filterStatus) }}
        />
      </SectionCard>

      {/* ── New / Edit Quotation Modal ────────────────────────────────────── */}
      <Modal isOpen={showForm} onClose={closeForm} title={editingId ? 'Edit Quotation' : 'New Quotation'} wide>
        <form className="entity-form qo-form" onSubmit={handleSubmit}>
          {leadPreview && (
            <div style={{ background: 'rgba(52, 152, 219, 0.1)', border: '1px solid rgba(52, 152, 219, 0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', gridColumn: '1/-1' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#3498db', fontWeight: 700, marginBottom: '4px' }}>From Online Lead</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f1f5f9' }}>{leadPreview.customerName} — {leadPreview.customerMobile}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Vehicle: {leadPreview.vehiclePlate || 'No Plate'} • {leadPreview.vehicleMake} {leadPreview.vehicleModel}</div>
              </div>
              <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', height: '32px' }} onClick={() => setLeadPreview(null)}>Dismiss</button>
            </div>
          )}
          {formError && (
            <div className="wizard-error">
              <span className="wizard-error-icon">⚠</span> {formError}
            </div>
          )}

          {/* ── Section: Customer & Vehicle ── */}
          <div className="vf-section-divider" style={{ gridColumn: '1/-1' }}>
            <span className="vf-section-icon">👤</span>
            <span className="vf-section-label">Customer &amp; Vehicle</span>
            <span className="vf-section-line" />
          </div>

          <div className="qo-form-grid">
            <div className="form-group">
              <label className="vf-label">Customer <span className="vf-required">*</span></label>
              <CustomerAutocomplete
                value={form.customerId}
                initialLabel={
                  customerPreview
                    ? `${customerPreview.full_name} — ${customerPreview.mobile}`
                    : ''
                }
                token={token}
                onChange={(c) => {
                  setForm((p) => ({ ...p, customerId: c ? String(c.id) : '', vehicleId: '', bay: p.bay || (c?.bay || '') }))
                  setCustomerPreview(c || null)
                }}
                onAddNew={(c) => {
                  setForm((p) => ({ ...p, customerId: String(c.id), vehicleId: '', bay: p.bay || (c?.bay || '') }))
                  setCustomerPreview(c)
                }}
              />
            </div>

            <div className="form-group">
              <label className="vf-label">Vehicle <span className="vf-required">*</span></label>
              <select
                value={form.vehicleId}
                onChange={(e) => setForm((p) => ({ ...p, vehicleId: e.target.value }))}
                disabled={!form.customerId}
              >
                <option value="">— Select vehicle —</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number} — {v.make} {v.model} {v.year}
                  </option>
                ))}
              </select>
              {form.customerId && filteredVehicles.length === 0 && (
                <span className="form-hint">No vehicles registered for this customer.</span>
              )}
            </div>

            {editingId && (
              <div className="form-group">
                <label className="vf-label">🏢 Branch <span className="vf-required">*</span></label>
                <select value={form.bay} onChange={(e) => setForm((p) => ({ ...p, bay: e.target.value }))} required>
                  <option value="">— Select branch —</option>
                  {branchLocations.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ── Section: Pricing & Services ── */}
          <div className="vf-section-divider" style={{ gridColumn: '1/-1' }}>
            <span className="vf-section-icon">🔧</span>
            <span className="vf-section-label">Pricing &amp; Services</span>
            <span className="vf-section-line" />
          </div>

          <div className="qo-form-grid">
            <div className="form-group">
              <label className="vf-label">📐 Vehicle Size <span className="vf-optional">(for pricing)</span></label>
              <SearchableSelect
                options={activeSizes.map((o) => ({ value: o.key, label: o.label }))}
                value={form.vehicleSize}
                onChange={(v) => handleVehicleSizeChange(v)}
                placeholder="Select vehicle size…"
              />
              {/* ── Dynamic Service Processes from Configuration ── */}
              {form.items.some(i => i.group === 'PPF Services') &&
                renderConfiguredProcess('ppf_process', 'PPF Installation Process', 'Paint Protection Film application workflow')}

              {form.items.some(i => i.group === 'Window Tint Services') &&
                renderConfiguredProcess('window_tint_process', 'Window Tint Process', '1-day installation + curing workflow')}

              {(form.items.some(i => i.code === 'detail-exterior') || form.items.some(i => i.code === 'detail-full')) &&
                renderConfiguredProcess('detailing_process', 'Exterior Detail Process', '3-4 day detailing workflow')}

              {(form.items.some(i => i.code === 'detail-interior') || form.items.some(i => i.code === 'detail-full')) &&
                renderConfiguredProcess('detailing_process', 'Interior Detail Process', '3-4 day detailing workflow')}

              {(form.items.some(i => i.code === 'coat-ceramic' || i.code === 'coat-graphene')) &&
                renderConfiguredProcess('coating_process', 'Coating Process', 'Premium ceramic & graphene coating workflow')}

              {form.items.some(i => i.group === 'Car Wash Services') &&
                renderConfiguredProcess('car_wash_process', 'Car Wash Process', 'Professional wash workflow')}

              {form.items.some(i => i.group === 'Other Services') &&
                renderConfiguredProcess('other_services_process', 'Other Services Process', 'Targeted treatments workflow')}
            </div>

            <div className="form-group">
              <label className="vf-label">🔧 Services <span className="vf-required">*</span></label>
              <ServiceLineEditor
                items={form.items}
                vehicleSize={form.vehicleSize}
                priceOverrides={priceOverrides}
                customCatalog={customServices}
                onItemsChange={(items) => setForm((p) => ({ ...p, items }))}
                materialsNotesByCode={materialsNotesByCode}
              />
            </div>
          </div>

          {form.items.length > 0 && (
            <div className="qo-total-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              {vatRate > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500, color: 'rgba(189,200,218,0.85)', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={form.applyVat}
                      onChange={(e) => setForm((p) => ({ ...p, applyVat: e.target.checked }))}
                      style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#a0a8b8' }}
                    />
                    Apply VAT ({vatRate}%)
                  </label>
                  <span style={{ color: form.applyVat ? '#fde047' : 'rgba(189,200,218,0.35)', fontWeight: 500 }}>
                    {form.applyVat ? `+ ${formatCurrency(vatAmount)}` : formatCurrency(0)}
                  </span>
                </div>
              )}

              {/* Promo code row */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Promo code (optional)"
                    value={form.promoCode}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, promoCode: e.target.value.toUpperCase() }))
                      setPromoInfo(null)
                      setPromoError('')
                    }}
                    onBlur={() => validatePromoCode(form.promoCode)}
                    style={{
                      flex: 1,
                      padding: '7px 11px',
                      background: '#1a1a1a',
                      border: promoInfo
                        ? '1px solid rgba(34,197,94,0.5)'
                        : promoError
                          ? '1px solid rgba(239,68,68,0.5)'
                          : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      letterSpacing: '0.08em',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => validatePromoCode(form.promoCode)}
                    disabled={promoLoading || !form.promoCode?.trim()}
                    style={{
                      padding: '7px 14px',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: '8px',
                      color: '#a0a8b8',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {promoLoading ? '…' : 'Apply'}
                  </button>
                </div>
                {promoError && (
                  <div style={{ marginTop: '5px', fontSize: '0.78rem', color: '#f87171' }}>✕ {promoError}</div>
                )}
                {promoInfo && (
                  <div style={{ marginTop: '5px', fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>
                    ✓ {promoInfo.code}
                    {promoInfo.description ? ` — ${promoInfo.description}` : ''}
                  </div>
                )}
              </div>

              {promoDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4ade80', fontWeight: 500, fontSize: '0.9rem' }}>
                    Discount ({promoInfo.discount_type === 'percent' ? `${promoInfo.discount_value}%` : 'fixed'})
                  </span>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>— {formatCurrency(promoDiscount)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', marginTop: '2px' }}>
                <span style={{ fontWeight: 700 }}>Total Amount</span>
                <strong className="qo-total-amount">{formatCurrency(totalAmount)}</strong>
              </div>
            </div>
          )}

          {/* Outstanding balance warning */}
          {balanceWarning && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px', padding: '14px 16px', marginTop: '16px' }}>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: '8px' }}>
                ⚠ Customer has unpaid balance(s) — ₱{Number(balanceWarning.totalOutstanding).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(189,200,218,0.75)', marginBottom: '10px' }}>
                {balanceWarning.balances.map(b => (
                  <div key={b.id} style={{ padding: '3px 0' }}>
                    {b.quotation_no} — ₱{Number(b.outstanding_balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })} outstanding
                  </div>
                ))}
              </div>
              {balanceWarning.canOverride ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#f97316', cursor: 'pointer', fontWeight: 600 }}>
                  <input type="checkbox" checked={overrideBalance} onChange={e => setOverrideBalance(e.target.checked)} />
                  Admin Override — create quotation despite outstanding balance
                </label>
              ) : (
                <div style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 600 }}>
                  Contact an Admin to override and create a new quotation.
                </div>
              )}
            </div>
          )}

          <div className="vf-form-actions full-width">
            <button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button>
            <button type="submit" className="btn-primary vf-submit" disabled={balanceWarning && !overrideBalance}>
              {editingId ? '✓ Update Quotation' : '+ Save Quotation'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Customer Detail Modal (CRM) ────────────────────────────────────────── */}
      <Modal
        isOpen={showCustomerModal}
        onClose={() => { setShowCustomerModal(false); setSelectedCustomer(null); setCustomerQuotations([]); setCustomerJobOrders([]); }}
        title=""
        wide
      >
        <div className="crm-modal">
          {servicesError && <div className="form-error-banner full-width">{servicesError}</div>}
          <div className="crm-modal-inner">

            {/* ── Left: Contact panel ── */}
            <aside className="crm-modal-left">
              <div className="crm-avatar-section">
                <div className="crm-avatar">
                  {selectedCustomer
                    ? selectedCustomer.full_name.trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                    : 'C'}
                </div>
                <h2 className="crm-name">{selectedCustomer?.full_name || 'Customer'}</h2>
                {selectedCustomer?.customer_type && (
                  <span className={`crm-type-badge crm-type-${selectedCustomer.customer_type.toLowerCase()}`}>
                    {selectedCustomer.customer_type.toUpperCase()}
                  </span>
                )}
              </div>

              <div className="crm-section-label">CONTACT INFORMATION</div>
              <div className="crm-contact-list">
                <div className="crm-contact-row">
                  <span className="crm-row-label">MOBILE</span>
                  <span className="crm-row-value">{selectedCustomer?.mobile || '-'}</span>
                </div>
                <div className="crm-contact-row">
                  <span className="crm-row-label">EMAIL</span>
                  <span className="crm-row-value crm-email">{selectedCustomer?.email || '-'}</span>
                </div>
                <div className="crm-contact-row">
                  <span className="crm-row-label">CUSTOMER TYPE</span>
                  {selectedCustomer?.customer_type
                    ? <span className={`crm-type-badge crm-type-${selectedCustomer.customer_type.toLowerCase()}`}>{selectedCustomer.customer_type.toUpperCase()}</span>
                    : <span className="crm-row-value">-</span>}
                </div>
                <div className="crm-contact-row">
                  <span className="crm-row-label">PREFERRED CONTACT</span>
                  <span className="crm-row-value">{selectedCustomer?.preferred_contact_method || '-'}</span>
                </div>
                {selectedCustomer?.lead_source && (
                  <div className="crm-contact-row">
                    <span className="crm-row-label">LEAD SOURCE</span>
                    <span className="crm-row-value">{selectedCustomer.lead_source}</span>
                  </div>
                )}
                <div className="crm-contact-row">
                  <span className="crm-row-label">ADDRESS</span>
                  <span className="crm-row-value crm-address">{selectedCustomer?.address || 'Not provided'}</span>
                </div>
              </div>
            </aside>

            {/* ── Right: History panel ── */}
            <section className="crm-modal-right">
              <div className="crm-services-body">
                {servicesLoading ? (
                  <div className="crm-loading">
                    <span className="crm-loading-dot" /><span className="crm-loading-dot" /><span className="crm-loading-dot" />
                    <span style={{ marginLeft: 8 }}>Loading history…</span>
                  </div>
                ) : (
                  <>
                    {customerVehicles.length > 0 && (
                      <div className="crm-section">
                        <div className="crm-section-label">VEHICLES</div>
                        <ul className="crm-vehicles-list">
                          {customerVehicles.map((v) => (
                            <li key={`v-${v.id}`} className="crm-vehicle-item">
                              <strong className="plate">{v.plate_number || [v.custom_make, v.custom_model].filter(Boolean).join(' ') || '—'}</strong>
                              <div className="vehicle-meta">
                                {[v.make_name || v.custom_make, v.model_name || v.custom_model, v.year].filter(Boolean).join(' ')}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {customerQuotations.length > 0 && (
                      <div className="crm-section">
                        <div className="crm-section-label">QUOTATIONS</div>
                        <div className="crm-card-list">
                          {customerQuotations.map((q) => (
                            <div key={`q-${q.id}`} className="crm-card">
                              <div className="crm-card-header">
                                <strong className="crm-ref">{q.quotation_no}</strong>
                                <span className={`crm-status-badge status-${(q.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                  {(q.status || '').toUpperCase()}
                                </span>
                                {q.total_amount != null && (
                                  <span className="crm-amount">₱{Number(q.total_amount).toLocaleString('en-PH')}</span>
                                )}
                              </div>
                              <ul className="card-services">
                                {(Array.isArray(q.services) ? q.services : []).map((s, i) => (
                                  <li key={i}>{s.name || s.description || s}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {customerJobOrders.length > 0 && (
                      <div className="crm-section">
                        <div className="crm-section-label">JOB ORDERS</div>
                        <div className="crm-card-list">
                          {customerJobOrders.map((jo) => (
                            <div key={`jo-${jo.id}`} className="crm-card">
                              <div className="crm-card-header">
                                <strong className="crm-ref">{jo.job_order_no}</strong>
                                <span className={`crm-status-badge status-${(jo.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                  {(jo.status || '').toUpperCase()}
                                </span>
                                {jo.total_amount != null && (
                                  <span className="crm-amount">₱{Number(jo.total_amount).toLocaleString('en-PH')}</span>
                                )}
                              </div>
                              <ul className="card-services">
                                {(Array.isArray(jo.services) ? jo.services : []).map((s, i) => (
                                  <li key={i}>{s.name || s.description || s}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {customerVehicles.length === 0 && customerQuotations.length === 0 && customerJobOrders.length === 0 && (
                      <div className="crm-empty-state">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.25 }}>
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="currentColor" />
                        </svg>
                        <p>No history found for this customer.</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="crm-modal-actions">
                <button className="btn-secondary" onClick={() => setShowCustomerModal(false)}>Close</button>
                <button className="btn-primary">New Quotation</button>
              </div>
            </section>
          </div>
        </div>
      </Modal>

      {/* ── Quotation Detail Modal ────────────────────────────────────────── */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Quotation — ${viewItem?.quotation_no || ''}`} wide>
        {viewItem && (
          <div className="qo-detail">

            {/* ── Top Strip: No · Date · Status ── */}
            <div className="qo-detail-strip">
              <div className="qo-strip-cell">
                <span className="qo-strip-label">Quotation No.</span>
                <span className="qo-strip-value mono">{viewItem.quotation_no}</span>
              </div>
              <div className="qo-strip-divider" />
              <div className="qo-strip-cell">
                <span className="qo-strip-label">Date Issued</span>
                <span className="qo-strip-value">{new Date(viewItem.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              <div className="qo-strip-divider" />
              <div className="qo-strip-cell">
                <span className="qo-strip-label">Status</span>
                <StatusBadge status={viewItem.status} />
              </div>
              <div className="qo-strip-divider" />
              <div className="qo-strip-cell">
                <span className="qo-strip-label">Branch</span>
                <span className="qo-strip-value">{viewItem.bay || viewItem.customer_bay || '—'}</span>
              </div>
            </div>

            {/* ── Customer / Vehicle ── */}
            <div className="qo-detail-grid">
              <div className="qo-info-block">
                <div className="qo-info-block-header">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  <span>Customer</span>
                </div>
                <p className="qo-info-name">{viewItem.customer_name}</p>
                {viewItem.customer_mobile && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.38 2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z" /></svg>
                    <span>{viewItem.customer_mobile}</span>
                  </div>
                )}
                {viewItem.customer_email && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                    <span>{viewItem.customer_email}</span>
                  </div>
                )}
                {viewItem.customer_address && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    <span>{viewItem.customer_address}</span>
                  </div>
                )}
              </div>

              <div className="qo-info-block">
                <div className="qo-info-block-header">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 5v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                  <span>Vehicle</span>
                </div>
                <p className="qo-info-name">{[viewItem.make, viewItem.model, viewItem.variant].filter(Boolean).join(' ')}</p>
                {viewItem.plate_number && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="10" rx="2" /><line x1="7" y1="12" x2="7" y2="12" /><line x1="12" y1="12" x2="17" y2="12" /></svg>
                    <span>{viewItem.plate_number}</span>
                  </div>
                )}
                {viewItem.vehicle_year && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span>Year {viewItem.vehicle_year}</span>
                  </div>
                )}
                {viewItem.color && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
                    <span>{viewItem.color}</span>
                  </div>
                )}
                {viewItem.vehicle_size && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    <span style={{ textTransform: 'capitalize' }}>{viewItem.vehicle_size?.replace(/-/g, ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Services ── */}
            <div className="qo-services-section">
              <div className="qo-services-header">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                <span>Services</span>
                <span className="qo-services-count">{(viewItem.services || []).length} item{(viewItem.services || []).length !== 1 ? 's' : ''}</span>
              </div>
              <table className="qo-svc-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewItem.services || []).map((s, i) => (
                    <tr key={i}>
                      <td>
                        <span className="sle-service-name">{s.name}</span>
                        {s.group && <span className="sle-service-group">{s.group}</span>}
                        {(() => {
                          const notes = materialsNotesByCode[normalizeServiceCode(s?.code)]
                          const clean = String(notes || '').trim()
                          return clean ? <span className="sle-service-group">Materials: {clean}</span> : null
                        })()}
                      </td>
                      <td className="qo-svc-center">{s.qty}</td>
                      <td>{formatCurrency(s.unitPrice)}</td>
                      <td className="qo-svc-total">{formatCurrency(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total block */}
              <div className="qo-total-block">
                {viewItem.promo_code && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 }}>
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                      Promo Code&nbsp;
                      <span style={{ fontWeight: 700, color: '#4ade80', letterSpacing: '0.06em' }}>{viewItem.promo_code}</span>
                    </span>
                    {Number(viewItem.discount_amount) > 0 && (
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#4ade80' }}>
                        — {formatCurrency(Number(viewItem.discount_amount))}
                      </span>
                    )}
                  </div>
                )}
                <div className="qo-total-block-inner">
                  <span className="qo-total-block-label">Total Amount</span>
                  <span className="qo-total-block-amount">{formatCurrency(viewItem.total_amount)}</span>
                </div>
              </div>
            </div>

            {viewItem.notes && (
              <div className="qo-notes">
                <h4>Notes</h4>
                <p>{viewItem.notes}</p>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="qo-detail-actions">
              <button type="button" className="btn-secondary" onClick={() => { setViewItem(null); handleEdit(viewItem) }}>
                Edit
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }}
                onClick={() => handlePrintQuotation(viewItem)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                Print
              </button>
              <div style={{ flex: 1 }} />
              {['Draft', 'Pending', 'Sent'].includes(viewItem.status) && (
                <>
                  <button type="button" className="btn-reject-small"
                    onClick={() => handleStatusChange(viewItem.id, 'Not Approved')}>
                    ✕ Reject
                  </button>
                  <button type="button" className="btn-approve-large"
                    onClick={() => handleStatusChange(viewItem.id, 'Approved')}>
                    ✓ Approve
                  </button>
                </>
              )}
              {viewItem.status === 'Approved' && (
                <button
                  type="button"
                  className="btn-schedule"
                  onClick={() => {
                    if (typeof onRequestCreateBooking === 'function') {
                      setViewItem(null)
                      const hint = leadScheduleHintsByQuotationId[viewItem.id] || null
                      onRequestCreateBooking({ quotationId: viewItem.id, customerId: viewItem.customer_id, vehicleId: viewItem.vehicle_id, ...(hint || {}) })
                    }
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  Create Schedule
                </button>
              )}
            </div>

          </div>
        )}
      </Modal>

      {/* Confirm */}
      <ConfirmModal
        isOpen={confirmCfg.isOpen}
        title={confirmCfg.title}
        message={confirmCfg.message}
        onConfirm={confirmCfg.onConfirm}
        onClose={() => setConfirmCfg((p) => ({ ...p, isOpen: false }))}
      />
    </div>
  )
}

export default QuotationsPage
