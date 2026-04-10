import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { VehicleDetail } from '../components/VehicleDetail'
import { CampaignsModal } from './CampaignsModal'
import { SearchableSelect } from '../components/SearchableSelect'
import { normalizeEmailClient } from '../utils/validationClient'
import { onConfigUpdated, onVehicleMakesUpdated } from '../utils/events'
import './CrmPage.css'

const EMPTY_FORM = {
  fullName: '',
  mobile: '',
  email: '',
  customerType: 'Retail',
  leadSource: 'Walk-in',
  preferredContactMethod: 'Call',
  address: '',
  bay: '',
}

export function CRMPage({
  token,
  user,
  autoOpenCustomerId,
  autoOpenRegisterVehicle,
  onAutoOpenConsumed,
  onAutoOpenRegisterVehicleConsumed,
  onAfterSave,
  onNewQuotation,
}) {
  const isSuperAdmin = user?.role === 'SuperAdmin'
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [rows, setRows] = useState([])
  const [customersRaw, setCustomersRaw] = useState([])
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [error, setError] = useState('')
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} })
  const [balanceCustomerIds, setBalanceCustomerIds] = useState(new Set())
  const [showCampaigns, setShowCampaigns] = useState(false)
  const [blastCustomerIds, setBlastCustomerIds] = useState([])
  const [branchLocations, setBranchLocations] = useState(['Cubao', 'Manila'])
  const [customerTypes, setCustomerTypes] = useState(['Retail', 'Dealer', 'Corporate', 'VIP'])
  const [leadSources, setLeadSources] = useState(['Walk-in', 'Facebook', 'Referral', 'Google', 'Other'])
  const [contactMethods, setContactMethods] = useState(['Call', 'SMS', 'Email', 'WhatsApp'])

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerQuotations, setCustomerQuotations] = useState([])
  const [customerJobOrders, setCustomerJobOrders] = useState([])
  const [customerVehicles, setCustomerVehicles] = useState([])
  const [customerPayments, setCustomerPayments] = useState([])
  const [customerAppointments, setCustomerAppointments] = useState([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState('')

  const [activeHistoryTab, setActiveHistoryTab] = useState('vehicles')

  // Register Vehicle modal (CRM-only; no Vehicles page)
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [vehicleMakes, setVehicleMakes] = useState([])
  const [vehicleModels, setVehicleModels] = useState([])
  const [vehicleVariants, setVehicleVariants] = useState([])
  const [vehicleCategories, setVehicleCategories] = useState([])
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [vehicleError, setVehicleError] = useState('')
  const [vehicleFieldErrors, setVehicleFieldErrors] = useState({})
  const [vehicleConfirmConfig, setVehicleConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} })
  const [vehicleForm, setVehicleForm] = useState({
    plateNumber: '',
    make: '',
    customMake: '',
    model: '',
    year: new Date().getFullYear(),
    variant: '',
    color: '',
    odometer: 0,
    bodyType: '',
  })

  const [viewingVehicle, setViewingVehicle] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)

  // Close modal helper
  const handleCloseModal = () => {
    setShowForm(false)
    setEditingId(null)
    setFormError('')
    setFieldErrors({})
    setForm(EMPTY_FORM)
  }

  const loadCustomers = async (nextPage = page, nextSearch = search, opts = {}) => {
    const { includeBalance = true, silent = false, resetSelection = true } = opts
    try {
      const [result, balanceResult] = await Promise.all([
        apiGet('/customers', token, {
          page: nextPage,
          limit: pagination.limit,
          search: nextSearch,
        }),
        includeBalance
          ? apiGet('/quotations', token, { page: 1, limit: 500, status: 'WITH BALANCE' }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ])

      const customers = result.data
      const withBalanceIds = includeBalance
        ? new Set((balanceResult.data || []).map((q) => q.customer_id))
        : balanceCustomerIds

      if (includeBalance) setBalanceCustomerIds(withBalanceIds)
      setCustomersRaw(customers)
      setPagination(result.pagination)
      setPage(result.pagination.page)
      setRows(
        customers.map((customer) => ({
          key: `customer-${customer.id}`,
          cells: [
            <span key="name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>{customer.full_name}</span>
              {withBalanceIds.has(customer.id) && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: '999px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', whiteSpace: 'nowrap' }}>
                  HAS BALANCE
                </span>
              )}
            </span>,
            customer.mobile,
            customer.customer_type,
            customer.lead_source,
            customer.preferred_contact_method,
          ],
          raw: customer,
        })),
      )
      if (resetSelection) setSelectedKeys(new Set())
    } catch (e) {
      if (!silent) throw e
    }
  }

  useEffect(() => {
    loadCustomers(1, search).catch((loadError) => setError(loadError.message))
  }, [token, search])

  // Auto-open a specific customer's details (used after creating a customer, etc.)
  useEffect(() => {
    if (!token) return
    if (!autoOpenCustomerId) return

    let cancelled = false
    const run = async () => {
      try {
        const customer = await apiGet(`/customers/${autoOpenCustomerId}`, token)
        if (cancelled) return
        await openCustomerDetails(customer)
        if (!cancelled && autoOpenRegisterVehicle) {
          openRegisterVehicle(customer)
          if (typeof onAutoOpenRegisterVehicleConsumed === 'function') onAutoOpenRegisterVehicleConsumed()
        }
      } catch (_) {
        // Silent: fallback to showing CRM list
      } finally {
        if (!cancelled && typeof onAutoOpenConsumed === 'function') onAutoOpenConsumed()
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, autoOpenCustomerId, autoOpenRegisterVehicle])

  // Load vehicle dropdown data for the Register Vehicle modal
  useEffect(() => {
    if (!token) return

    const unsafeNames = [/^all(\b|$)/i, /^all vehicles?/i]

    const loadMakes = () => {
      apiGet('/vehicle-makes', token)
        .then((data) => {
          const arr = Array.isArray(data) ? data : []
          const safeMakes = arr.filter((m) => m && m.name && m.name !== 'Other' && !unsafeNames.some((rx) => rx.test(m.name)))
          setVehicleMakes(safeMakes)
        })
        .catch(() => setVehicleMakes([]))
    }

    const loadCategories = () => {
      apiGet('/config', token)
        .then((resp) => {
          const data = resp.data || resp || {}
          const entries = data.vehicle || []
          const entry = (Array.isArray(entries)
            ? entries
            : Object.entries(entries || {}).map(([k, v]) => ({ key: k, value: v.value })))
            .find((e) => e.key === 'default_categories')
          if (entry) {
            try { setVehicleCategories(JSON.parse(entry.value || '[]')) } catch { /* ignore */ }
          }
        })
        .catch(() => {})
    }

    loadMakes()
    loadCategories()

    const offMakes = onVehicleMakesUpdated(() => loadMakes())
    const offCfg = onConfigUpdated((e) => {
      const cat = e?.detail?.category
      if (!cat || cat === 'vehicle') loadCategories()
    })

    return () => {
      offMakes()
      offCfg()
    }
  }, [token])

  const openRegisterVehicle = (customer) => {
    if (!customer?.id) return
    setVehicleError('')
    setVehicleFieldErrors({})
    setVehicleForm({
      plateNumber: '',
      make: '',
      customMake: '',
      model: '',
      year: new Date().getFullYear(),
      variant: '',
      color: '',
      odometer: 0,
      bodyType: '',
      _customModel: false,
      _customVariant: false,
    })
    setVehicleModels([])
    setVehicleVariants([])
    setShowVehicleForm(true)
  }

  const closeRegisterVehicle = () => {
    setShowVehicleForm(false)
    setVehicleSaving(false)
    setVehicleModels([])
    setVehicleVariants([])
    setVehicleConfirmConfig((p) => ({ ...p, isOpen: false }))
  }

  useEffect(() => {
    if (!showVehicleForm) return
    if (!vehicleForm.make || vehicleForm.make.toLowerCase() === 'other') {
      setVehicleModels([])
      setVehicleVariants([])
      return
    }

    const makeName = String(vehicleForm.make || '').trim().toLowerCase()
    const makeObj = vehicleMakes.find((m) => String(m?.name || '').trim().toLowerCase() === makeName)
    if (!makeObj?.id) {
      setVehicleModels([])
      setVehicleVariants([])
      return
    }

    apiGet(`/vehicle-makes/${makeObj.id}/models`, token)
      .then((data) => {
        setVehicleModels(Array.isArray(data) ? data : [])
      })
      .catch(() => setVehicleModels([]))

    setVehicleVariants([])
  }, [showVehicleForm, vehicleForm.make, vehicleMakes, token])

  useEffect(() => {
    if (!showVehicleForm) return
    if (!vehicleForm.model) {
      setVehicleVariants([])
      return
    }

    const modelName = String(vehicleForm.model || '').trim().toLowerCase()
    const modelObj = vehicleModels.find((m) => String(m?.name || '').trim().toLowerCase() === modelName)
    if (!modelObj?.id) {
      setVehicleVariants([])
      return
    }

    apiGet(`/vehicle-makes/models/${modelObj.id}/variants`, token)
      .then((data) => {
        setVehicleVariants(Array.isArray(data) ? data : [])
      })
      .catch(() => setVehicleVariants([]))
  }, [showVehicleForm, vehicleForm.model, vehicleModels, token])

  const submitVehicle = async (payload) => {
    if (!selectedCustomer?.id) throw new Error('Missing customer')
    const rawMake = (payload.make || '').trim()
    const matchedMake = vehicleMakes.find((m) => String(m?.name || '').toLowerCase() === rawMake.toLowerCase())
    const explicitOther = rawMake.toLowerCase() === 'other'
    const resolvedMake = matchedMake ? matchedMake.name : 'Other'
    const resolvedCustomMake = explicitOther
      ? (payload.customMake || '').trim()
      : (matchedMake ? '' : rawMake)

    return apiPost('/vehicles', token, {
      customerId: Number(selectedCustomer.id),
      plateNumber: payload.plateNumber,
      make: resolvedMake,
      customMake: resolvedMake === 'Other' ? resolvedCustomMake : null,
      model: payload.model,
      year: Number(payload.year),
      variant: payload.variant || '',
      color: payload.color || '',
      odometer: Number(payload.odometer),
      bodyType: payload.bodyType || '',
      forceCreate: payload.forceCreate || false,
    })
  }

  const handleVehicleSubmit = async (e) => {
    e.preventDefault()
    setVehicleError('')
    setVehicleFieldErrors({})

    const errors = {}
    if (!vehicleForm.plateNumber?.trim()) errors.plateNumber = 'Plate number is required'
    if (!vehicleForm.make?.trim()) errors.make = 'Make is required'
    if (vehicleForm.make === 'Other' && !vehicleForm.customMake?.trim()) errors.customMake = 'Specify make is required'
    if (!vehicleForm.model?.trim()) errors.model = 'Model is required'
    if (vehicleForm.year === '' || vehicleForm.year === null || Number.isNaN(Number(vehicleForm.year)) || Number(vehicleForm.year) < 1900) {
      errors.year = 'A valid year after 1900 is required'
    }
    if (vehicleForm.odometer === '' || vehicleForm.odometer === null || Number.isNaN(Number(vehicleForm.odometer)) || Number(vehicleForm.odometer) < 0) {
      errors.odometer = 'Valid odometer reading (>= 0) is required'
    }

    if (Object.keys(errors).length > 0) {
      setVehicleFieldErrors(errors)
      setVehicleError(Object.values(errors)[0])
      return
    }

    setVehicleSaving(true)
    try {
      await submitVehicle(vehicleForm)
      pushToast('success', 'Vehicle registered successfully!')
      // Refresh vehicles list inside the customer modal
      const vRes = await apiGet(`/vehicles/customer/${selectedCustomer.id}`, token).catch(() => ({ data: [] }))
      setCustomerVehicles((vRes && (vRes.data || vRes)) || [])
      closeRegisterVehicle()
    } catch (err) {
      // Duplicate plate warning (409) — confirm override
      if (err?.duplicate && !err?.sameCustomer) {
        setVehicleConfirmConfig({
          isOpen: true,
          title: 'Duplicate Plate Detected',
          message: err.message || 'This plate number already exists. Continue anyway?',
          onConfirm: async () => {
            try {
              await submitVehicle({ ...vehicleForm, forceCreate: true })
              pushToast('success', 'Vehicle registered successfully!')
              const vRes = await apiGet(`/vehicles/customer/${selectedCustomer.id}`, token).catch(() => ({ data: [] }))
              setCustomerVehicles((vRes && (vRes.data || vRes)) || [])
              closeRegisterVehicle()
            } catch (forceErr) {
              setVehicleError(forceErr?.message || 'Failed to register vehicle')
            } finally {
              setVehicleConfirmConfig((p) => ({ ...p, isOpen: false }))
              setVehicleSaving(false)
            }
          },
        })
      } else {
        setVehicleError(err?.message || 'Failed to register vehicle')
      }
    } finally {
      setVehicleSaving(false)
    }
  }

  useEffect(() => {
    if (!token) return
    let stopped = false

    const refresh = async () => {
      if (stopped) return
      await loadCustomers(page, search, { includeBalance: false, silent: true, resetSelection: false })
    }

    const handleFocus = () => refresh()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    const intervalMs = 5000
    const id = setInterval(refresh, intervalMs)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stopped = true
      clearInterval(id)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [token, page, search])

  const loadBranchLocations = useCallback(async () => {
    try {
      const arr = await apiGet('/config/category/booking', token)
      const entries = Array.isArray(arr) ? arr : []
      const raw = entries.find((e) => e.key === 'branch_locations')?.value ?? null
      const parsed = Array.isArray(raw) ? raw : (() => { try { return raw ? JSON.parse(raw) : null } catch { return null } })()
      if (Array.isArray(parsed) && parsed.length > 0) setBranchLocations(parsed)
    } catch {
      // ignore
    }
  }, [token])

  const loadCrmSettings = useCallback(async () => {
    try {
      const arr = await apiGet('/config/category/crm', token)
      const entries = Array.isArray(arr) ? arr : []

      const parseTags = (key) => {
        const raw = entries.find((e) => e.key === key)?.value
        if (!raw) return null
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
          return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
        } catch { return null }
      }

      const cTypes = parseTags('customer_types')
      if (cTypes) setCustomerTypes(cTypes)

      const lSources = parseTags('lead_sources')
      if (lSources) setLeadSources(lSources)

      const cMethods = parseTags('contact_methods')
      if (cMethods) setContactMethods(cMethods)
    } catch {
      // ignore
    }
  }, [token])

  useEffect(() => {
    loadBranchLocations()
    loadCrmSettings()

    const off = onConfigUpdated((e) => {
      const cat = e?.detail?.category
      if (!cat || cat === 'booking') loadBranchLocations()
      if (!cat || cat === 'crm') loadCrmSettings()
    })
    return off
  }, [loadBranchLocations, loadCrmSettings])

  const visibleRows = rows

  const openCustomerDetails = async (customer) => {
    setSelectedCustomer(customer)
    setShowCustomerModal(true)
    setServicesError('')
    setServicesLoading(true)
    try {
      const freshCustomer = await apiGet(`/customers/${customer.id}`, token).catch(() => null)
      const effectiveCustomer = freshCustomer || customer
      if (freshCustomer) {
        setSelectedCustomer(freshCustomer)
        setCustomersRaw((prev) => prev.map((c) => (c.id === freshCustomer.id ? { ...c, ...freshCustomer } : c)))
        setRows((prev) =>
          prev.map((r) => {
            if (r?.raw?.id !== freshCustomer.id) return r
            return {
              ...r,
              cells: [
                <span key="name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span>{freshCustomer.full_name}</span>
                  {balanceCustomerIds.has(freshCustomer.id) && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: '999px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', whiteSpace: 'nowrap' }}>
                      HAS BALANCE
                    </span>
                  )}
                </span>,
                freshCustomer.mobile,
                freshCustomer.customer_type,
                freshCustomer.lead_source,
                freshCustomer.preferred_contact_method,
              ],
              raw: { ...r.raw, ...freshCustomer },
            }
          }),
        )
      }

      const [qRes, joRes, vRes, pRes, aRes] = await Promise.all([
        apiGet('/quotations', token, { page: 1, limit: 200, search: effectiveCustomer.full_name }).catch(() => ({ data: [] })),
        apiGet('/job-orders', token, { page: 1, limit: 200, search: effectiveCustomer.full_name }).catch(() => ({ data: [] })),
        apiGet(`/vehicles/customer/${effectiveCustomer.id}`, token).catch(() => ({ data: [] })),
        apiGet(`/customers/${effectiveCustomer.id}/payments`, token).catch(() => ({ data: [] })),
        apiGet('/appointments', token, { page: 1, limit: 100, search: effectiveCustomer.full_name, sortBy: 'createdAt', sortDir: 'desc' }).catch(() => ({ data: [] })),
      ])
      setCustomerQuotations(qRes.data || [])
      setCustomerJobOrders(joRes.data || [])
      // vRes may be { data: [...] } or raw array depending on API shape
      const nextVehicles = (vRes && (vRes.data || vRes)) || []
      const nextPayments = pRes.data || []
      const nextAppointments = aRes.data || []
      const nextQuotations = qRes.data || []
      const nextJobOrders = joRes.data || []

      setCustomerVehicles(nextVehicles)
      setCustomerPayments(nextPayments)
      setCustomerAppointments(nextAppointments)

      // Default to the first non-empty tab (keeps the UI from landing on an empty tab).
      const firstNonEmpty =
        (nextVehicles.length > 0 && 'vehicles') ||
        (nextAppointments.length > 0 && 'appointments') ||
        (nextQuotations.length > 0 && 'quotations') ||
        (nextJobOrders.length > 0 && 'jobOrders') ||
        (nextPayments.length > 0 && 'payments') ||
        'vehicles'
      setActiveHistoryTab(firstNonEmpty)

      setCustomerQuotations(nextQuotations)
      setCustomerJobOrders(nextJobOrders)
    } catch (err) {
      setServicesError(err.message || 'Failed to load services')
    } finally {
      setServicesLoading(false)
    }
  }

  const openVehicleDetails = async (vehicle) => {
    if (!vehicle?.id) return
    try {
      const res = await apiGet(`/vehicles/${vehicle.id}`, token)
      const full = (res && (res.data || res.vehicle)) ? (res.data || res.vehicle) : res
      const hydrated = full && full.id
        ? full
        : {
          ...vehicle,
          make: vehicle.make_name || vehicle.custom_make || vehicle.make,
          model: vehicle.model_name || vehicle.custom_model || vehicle.model,
          customer_name: vehicle.customer_name || selectedCustomer?.full_name,
        }
      setViewingVehicle(hydrated)
    } catch (err) {
      pushToast('error', err?.message || 'Failed to load vehicle details')
    }
  }

  const handleToggleRow = (row, isSelected) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (isSelected) next.add(row.key)
      else next.delete(row.key)
      return next
    })
  }

  const handleToggleAll = async (isSelected, rowsToToggle) => {
    if (isSelected) {
      try {
        // Fetch ALL customers (across all pages) so select-all truly selects everyone
        const allResult = await apiGet('/customers', token, { page: 1, limit: 9999, search })
        const allCustomers = allResult.data || []
        setCustomersRaw(allCustomers)
        const allRows = allCustomers.map((customer) => ({
          key: `customer-${customer.id}`,
          cells: [
            <span key="name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span>{customer.full_name}</span>
              {balanceCustomerIds.has(customer.id) && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', padding: '1px 6px', borderRadius: '999px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', whiteSpace: 'nowrap' }}>
                  HAS BALANCE
                </span>
              )}
            </span>,
            customer.mobile,
            customer.customer_type,
            customer.lead_source,
            customer.preferred_contact_method,
          ],
          raw: customer,
        }))
        setRows(allRows)
        setSelectedKeys(new Set(allRows.map((r) => r.key)))
      } catch {
        // Fallback: select only current visible page
        setSelectedKeys(new Set(rowsToToggle.map((r) => r.key)))
      }
    } else {
      setSelectedKeys(new Set())
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    setFieldErrors({})
    
    const errors = {}
    if (!form.fullName.trim()) { errors.fullName = 'Full name is required.' }
    if (!form.mobile.trim() || form.mobile.length < 10) { errors.mobile = 'A valid mobile number is required.' }
    if (!form.bay.trim()) { errors.bay = 'Please select a branch.' }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setFormError(Object.values(errors)[0])
      return
    }

    try {
      if (editingId) {
        await apiPatch(`/customers/${editingId}`, token, form)
        handleCloseModal()
        await loadCustomers(page, search)
        setError('')
        pushToast('success', 'Customer updated successfully.')
      } else {
        const result = await apiPost('/customers', token, form)
        handleCloseModal()
        await loadCustomers(1, search)
        setError('')
        pushToast('success', 'Customer registered successfully!')
        // Navigate to Register Vehicle with new customer
        if (onAfterSave) onAfterSave(result.data || result)
      }
    } catch (submitError) {
      setFormError(submitError.message)
    }
  }

  const handleEdit = (customer) => {
    if (!isSuperAdmin) return
    setEditingId(customer.id)
    setFormError('')
    setFieldErrors({})
    setForm({
      fullName: customer.full_name,
      mobile: customer.mobile,
      email: customer.email || '',
      customerType: customer.customer_type || 'Retail',
      leadSource: customer.lead_source || 'Walk-in',
      preferredContactMethod: customer.preferred_contact_method || 'Call',
      address: customer.address || '',
      bay: customer.bay || '',
    })
    setShowForm(true)
  }

  const handleDelete = (customerId) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Customer',
      message: 'Are you sure you want to delete this customer? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await apiDelete(`/customers/${customerId}`, token)
          await loadCustomers(page, search)
          setConfirmConfig((p) => ({ ...p, isOpen: false }))
          setError('')
          pushToast('success', 'Customer deleted successfully.')
        } catch (deleteError) {
          setError(deleteError.message)
        }
      },
    })
  }

  const handleBulkDelete = () => {
    if (!selectedKeys.size) return

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Selected',
      message: `Are you sure you want to delete ${selectedKeys.size} customers?`,
      onConfirm: async () => {
        try {
          const selectedIds = rows
            .filter((row) => selectedKeys.has(row.key))
            .map((row) => row.raw.id)

          await Promise.all(selectedIds.map((id) => apiDelete(`/customers/${id}`, token)))
          await loadCustomers(page, search)
          setConfirmConfig((p) => ({ ...p, isOpen: false }))
          setSelectedKeys(new Set())
          setError('')
          pushToast('success', `${selectedIds.length} customers deleted.`)
        } catch (bulkError) {
          setError(bulkError.message)
        }
      },
    })
  }

  const handleEmailBlast = () => {
    if (!selectedKeys.size) {
      pushToast('warning', 'No customers selected for email blast.')
      return
    }
    const selectedIds = rows
      .filter((row) => selectedKeys.has(row.key))
      .map((row) => row.raw.id)
    setBlastCustomerIds(selectedIds)
    setShowCampaigns(true)
  }

  return (
    <div className="page-grid crm-page">
      <SectionCard
        title="Customer Relationship Management"
        subtitle="Profiles, tags, lead sources, notes, interaction history, document links"
        actionLabel={showForm ? 'Cancel adding' : '+ Add customer'}
        onActionClick={!editingId || isSuperAdmin ? () => setShowForm(!showForm) : undefined}
      >
        <div className="module-toolbar">
          <input
            type="search"
            placeholder="Search customer, mobile, type, lead..."
            value={search}
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
          />
          <button
            type="button"
            className="btn-danger"
            onClick={handleBulkDelete}
            disabled={!isSuperAdmin || !selectedKeys.size || customersRaw.length <= 1}
            title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : `Delete Selected (${selectedKeys.size})`}
            aria-label={`Delete Selected (${selectedKeys.size})`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            <span style={{ opacity: 0.9 }}>({selectedKeys.size})</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleEmailBlast}
            title="Email Blast"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v16H4z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Email Blast
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSelectedKeys(new Set())}>
            Clear Selection
          </button>
        </div>

        <DataTable
          headers={['Full Name', 'Mobile', 'Type/Tag', 'Lead Source', 'Preferred Contact']}
          rows={visibleRows}
          onRowClick={openCustomerDetails}
          selectable
          selectedKeys={selectedKeys}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          rowActions={(customer) => (
            <div className="row-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleEdit(customer)}
                disabled={!isSuperAdmin}
                title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : 'Edit'}
                style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleDelete(customer.id)}
                disabled={!isSuperAdmin || customersRaw.length <= 1}
                title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : 'Delete'}
                style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
              >
                Delete
              </button>
            </div>
          )}
        />

        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={(nextPage) => loadCustomers(nextPage, search).catch((e) => setError(e.message))}
        />

        <Modal
          isOpen={showCustomerModal}
          onClose={() => { 
            setShowCustomerModal(false); 
            setSelectedCustomer(null); 
            setCustomerQuotations([]); 
            setCustomerJobOrders([]); 
            setCustomerPayments([]); 
            setCustomerAppointments([]);
            setCustomerVehicles([]);
            setActiveHistoryTab('vehicles');
          }}
          title={selectedCustomer?.full_name || 'Customer'}
          wide
        >
          <div className="crm-modal">
            {servicesError && <div className="form-error-banner full-width">{servicesError}</div>}
            <div className="crm-modal-inner">

              {/* ── Left: Contact panel ──────────────────────────────────── */}
              <aside className="crm-modal-left">
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

              {/* ── Right: History panel ─────────────────────────────────── */}
              <section className="crm-modal-right">
                <div className="crm-history-tabs admin-tabs" role="tablist" aria-label="Customer history">
                  <button
                    type="button"
                    className={`admin-tab ${activeHistoryTab === 'vehicles' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeHistoryTab === 'vehicles'}
                    onClick={() => setActiveHistoryTab('vehicles')}
                  >
                    Vehicles
                  </button>
                  <button
                    type="button"
                    className={`admin-tab ${activeHistoryTab === 'appointments' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeHistoryTab === 'appointments'}
                    onClick={() => setActiveHistoryTab('appointments')}
                  >
                    Appointments
                  </button>
                  <button
                    type="button"
                    className={`admin-tab ${activeHistoryTab === 'quotations' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeHistoryTab === 'quotations'}
                    onClick={() => setActiveHistoryTab('quotations')}
                  >
                    Quotations
                  </button>
                  <button
                    type="button"
                    className={`admin-tab ${activeHistoryTab === 'jobOrders' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeHistoryTab === 'jobOrders'}
                    onClick={() => setActiveHistoryTab('jobOrders')}
                  >
                    Job Orders
                  </button>
                  <button
                    type="button"
                    className={`admin-tab ${activeHistoryTab === 'payments' ? 'active' : ''}`}
                    role="tab"
                    aria-selected={activeHistoryTab === 'payments'}
                    onClick={() => setActiveHistoryTab('payments')}
                  >
                    Payments
                  </button>
                </div>

                <div className="crm-services-body">
                  {servicesLoading ? (
                    <div className="crm-loading">
                      <span className="crm-loading-dot" /><span className="crm-loading-dot" /><span className="crm-loading-dot" />
                      <span style={{ marginLeft: 8 }}>Loading history…</span>
                    </div>
                  ) : (
                    <>
                      {activeHistoryTab === 'vehicles' && (
                        customerVehicles.length > 0 ? (
                          <ul className="crm-vehicles-list" role="tabpanel">
                            {customerVehicles.map((v) => (
                              <li
                                key={`v-${v.id}`}
                                className="crm-vehicle-item is-clickable"
                                role="button"
                                tabIndex={0}
                                title="View vehicle details"
                                onClick={() => openVehicleDetails(v)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    openVehicleDetails(v)
                                  }
                                }}
                              >
                                <strong className="plate">{v.plate_number || [v.custom_make, v.custom_model].filter(Boolean).join(' ') || '—'}</strong>
                                <div className="vehicle-meta">
                                  {[v.make_name || v.custom_make, v.model_name || v.custom_model, v.year].filter(Boolean).join(' ')}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="crm-empty-state" role="tabpanel">
                            <p>No vehicles found.</p>
                          </div>
                        )
                      )}

                      {activeHistoryTab === 'appointments' && (
                        customerAppointments.length > 0 ? (
                          <div className="crm-card-list" role="tabpanel">
                            {customerAppointments.map((appt) => (
                              <div key={`appt-${appt.id}`} className="crm-card crm-booking-card">
                                <div className="crm-card-header">
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <strong className="crm-ref">
                                      {new Date(appt.schedule_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </strong>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                      {new Date(appt.schedule_start).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <span className={`crm-status-badge status-${(appt.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                    {(appt.status || '').toUpperCase()}
                                  </span>
                                </div>
                                <div className="crm-card-body" style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                                  {appt.notes && (
                                    <p style={{ fontStyle: 'italic', margin: '4px 0 0', opacity: 0.8 }}>"{appt.notes}"</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="crm-empty-state" role="tabpanel">
                            <p>No appointments found.</p>
                          </div>
                        )
                      )}

                      {activeHistoryTab === 'quotations' && (
                        customerQuotations.length > 0 ? (
                          <div className="crm-card-list" role="tabpanel">
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
                        ) : (
                          <div className="crm-empty-state" role="tabpanel">
                            <p>No quotations found.</p>
                          </div>
                        )
                      )}

                      {activeHistoryTab === 'jobOrders' && (
                        customerJobOrders.length > 0 ? (
                          <div className="crm-card-list" role="tabpanel">
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
                        ) : (
                          <div className="crm-empty-state" role="tabpanel">
                            <p>No job orders found.</p>
                          </div>
                        )
                      )}

                      {activeHistoryTab === 'payments' && (
                        customerPayments.length > 0 ? (
                          <div className="crm-payment-list" role="tabpanel">
                            {customerPayments.map((p) => {
                              const isDeposit = p.is_deposit
                              const isPaid = p.payment_status === 'PAID' || p.payment_status === 'SETTLED'
                              let typeLabel, typeCls, rowCls
                              if (isDeposit) { typeLabel = 'Downpayment'; typeCls = 'pay-deposit'; rowCls = 'pay-row-deposit' }
                              else if (isPaid) { typeLabel = 'Full Payment'; typeCls = 'pay-full'; rowCls = 'pay-row-full' }
                              else { typeLabel = 'Partial'; typeCls = 'pay-partial'; rowCls = 'pay-row-partial' }
                              const d = new Date(p.created_at)
                              const dateStr = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                              const timeStr = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })
                              return (
                                <div key={`p-${p.id}`} className={`crm-payment-row ${rowCls}`}>
                                  <div className="crm-pay-badge-col">
                                    <span className={`crm-pay-type ${typeCls}`}>{typeLabel}</span>
                                  </div>
                                  <div className="crm-pay-info-col">
                                    <div className="crm-pay-meta-top">
                                      <span className="crm-pay-ref">{p.quotation_no}</span>
                                    </div>
                                    <span className="crm-pay-method">{p.payment_type}{p.reference_no ? ` · ${p.reference_no}` : ''}</span>
                                  </div>
                                  <div className="crm-pay-amount-col">
                                    <span className="crm-pay-amount">₱{Number(p.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                    <div className="crm-pay-datetime">
                                      <span className="crm-pay-date">{dateStr}</span>
                                      <span className="crm-pay-time">{timeStr}</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="crm-empty-state" role="tabpanel">
                            <p>No payments found.</p>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>

                <div className="crm-modal-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowCustomerModal(false)
                      if (selectedCustomer) handleEdit(selectedCustomer)
                    }}
                  >
                    Edit Profile
                  </button>
                  {customerVehicles.length > 0 && (
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (selectedCustomer && onNewQuotation) {
                          setShowCustomerModal(false)
                          onNewQuotation(selectedCustomer)
                        }
                      }}
                    >
                      New Quotation
                    </button>
                  )}

                  <button
                    className="btn-primary"
                    onClick={() => {
                      if (selectedCustomer) openRegisterVehicle(selectedCustomer)
                    }}
                  >
                    Register Vehicle
                  </button>
                </div>
              </section>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showVehicleForm}
          onClose={closeRegisterVehicle}
          title="Register Vehicle"
        >
          <form className="entity-form vehicle-form" onSubmit={handleVehicleSubmit}>
            {vehicleError && (
              <div className="form-error-banner full-width">
                <span>⚠</span> {vehicleError}
              </div>
            )}

            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">👤</span>
              <span className="vf-section-label">Owner</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group full-width">
              <label className="vf-label">Customer</label>
              <input value={selectedCustomer?.full_name || ''} disabled />
            </div>

            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">🪪</span>
              <span className="vf-section-label">Identification</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Plate Number <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">🔢</span>
                <input
                  className={`vf-has-icon ${vehicleFieldErrors.plateNumber ? 'vf-field-error' : ''}`}
                  placeholder="ABC 1234"
                  value={vehicleForm.plateNumber}
                  onChange={(event) => {
                    setVehicleForm((prev) => ({ ...prev, plateNumber: event.target.value }))
                    if (vehicleFieldErrors.plateNumber) setVehicleFieldErrors((p) => ({ ...p, plateNumber: null }))
                  }}
                  required
                />
              </div>
              {vehicleFieldErrors.plateNumber && <div className="vf-inline-error">{vehicleFieldErrors.plateNumber}</div>}
            </div>

            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">🚗</span>
              <span className="vf-section-label">Vehicle Specs</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Make <span className="vf-required">*</span></label>
              <SearchableSelect
                options={[
                  ...vehicleMakes.map((m) => ({
                    value: m.name,
                    label: m.name,
                    category: m.category || 'Other',
                  })),
                  { value: 'Other', label: 'Other (Specify)', category: 'Custom' },
                ]}
                value={vehicleForm.make}
                onChange={(nextMake) => {
                  setVehicleForm((prev) => ({
                    ...prev,
                    make: nextMake,
                    model: '',
                    variant: '',
                    customMake: nextMake.trim().toLowerCase() === 'other' ? prev.customMake : '',
                    _customModel: false,
                    _customVariant: false,
                  }))
                  if (vehicleFieldErrors.make) setVehicleFieldErrors((p) => ({ ...p, make: null }))
                }}
                placeholder="Search or type make"
                required
                grouped
                allowCustomValue
                customValueText={(q) => `Use "${q}" as custom make`}
              />
              {vehicleFieldErrors.make && <div className="vf-inline-error">{vehicleFieldErrors.make}</div>}
            </div>

            {vehicleForm.make === 'Other' && (
              <div className="form-group">
                <label className="vf-label">Specify Make <span className="vf-required">*</span></label>
                <input
                  placeholder="Enter brand name"
                  value={vehicleForm.customMake}
                  onChange={(event) => {
                    setVehicleForm((prev) => ({ ...prev, customMake: event.target.value }))
                    if (vehicleFieldErrors.customMake) setVehicleFieldErrors((p) => ({ ...p, customMake: null }))
                  }}
                  required
                  className={vehicleFieldErrors.customMake ? 'vf-field-error' : ''}
                />
                {vehicleFieldErrors.customMake && <div className="vf-inline-error">{vehicleFieldErrors.customMake}</div>}
              </div>
            )}

            <div className="form-group">
              <label className="vf-label">Model <span className="vf-required">*</span></label>
              {!vehicleForm.make ? (
                <input
                  placeholder="Select make first"
                  value={vehicleForm.model}
                  onChange={() => {}}
                  disabled
                  className={vehicleFieldErrors.model ? 'vf-field-error' : ''}
                />
              ) : (
                <SearchableSelect
                  options={vehicleModels.map((m) => ({ value: m.name, label: m.name }))}
                  value={vehicleForm.model}
                  onChange={(val) => {
                    setVehicleForm((prev) => ({ ...prev, model: String(val || '').trim(), variant: '', _customVariant: false }))
                    if (vehicleFieldErrors.model) setVehicleFieldErrors((p) => ({ ...p, model: null }))
                  }}
                  placeholder="Search or type model"
                  required
                  allowCustomValue
                />
              )}
              {vehicleFieldErrors.model && <div className="vf-inline-error">{vehicleFieldErrors.model}</div>}
            </div>

            <div className="form-group">
              <label className="vf-label">Variant</label>
              {!vehicleForm.model ? (
                <input
                  placeholder="Select model first"
                  value={vehicleForm.variant}
                  onChange={() => {}}
                  disabled
                />
              ) : (
                <SearchableSelect
                  options={vehicleVariants.map((v) => ({ value: v.name, label: v.name }))}
                  value={vehicleForm.variant}
                  onChange={(val) => setVehicleForm((prev) => ({ ...prev, variant: String(val || '').trim() }))}
                  placeholder="Search or type variant"
                  allowCustomValue
                />
              )}
            </div>

            <div className="form-group">
              <label className="vf-label">Year Model <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📅</span>
                <input
                  className={`vf-has-icon ${vehicleFieldErrors.year ? 'vf-field-error' : ''}`}
                  type="number"
                  placeholder="2024"
                  value={vehicleForm.year}
                  onChange={(event) => {
                    setVehicleForm((prev) => ({ ...prev, year: event.target.value }))
                    if (vehicleFieldErrors.year) setVehicleFieldErrors((p) => ({ ...p, year: null }))
                  }}
                  required
                />
              </div>
              {vehicleFieldErrors.year && <div className="vf-inline-error">{vehicleFieldErrors.year}</div>}
            </div>

            {vehicleCategories.length > 0 && (
              <div className="form-group">
                <label className="vf-label">Body Type</label>
                <select
                  value={vehicleForm.bodyType}
                  onChange={(event) => setVehicleForm((prev) => ({ ...prev, bodyType: event.target.value }))}
                >
                  <option value="">— Select category —</option>
                  {vehicleCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">🎨</span>
              <span className="vf-section-label">Details</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Color</label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">🎨</span>
                <input
                  className="vf-has-icon"
                  placeholder="e.g. Pearl White"
                  value={vehicleForm.color}
                  onChange={(event) => setVehicleForm((prev) => ({ ...prev, color: event.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">Odometer (km) <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📍</span>
                <input
                  className={`vf-has-icon ${vehicleFieldErrors.odometer ? 'vf-field-error' : ''}`}
                  type="number"
                  placeholder="0"
                  value={vehicleForm.odometer}
                  onChange={(event) => {
                    setVehicleForm((prev) => ({ ...prev, odometer: event.target.value }))
                    if (vehicleFieldErrors.odometer) setVehicleFieldErrors((p) => ({ ...p, odometer: null }))
                  }}
                  required
                />
              </div>
              {vehicleFieldErrors.odometer && <div className="vf-inline-error">{vehicleFieldErrors.odometer}</div>}
            </div>

            <div className="vf-form-actions full-width">
              <button type="button" className="btn-secondary" onClick={closeRegisterVehicle} disabled={vehicleSaving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary vf-submit" disabled={vehicleSaving}>
                {vehicleSaving ? 'Saving…' : '+ Save Vehicle'}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmModal
          isOpen={vehicleConfirmConfig.isOpen}
          title={vehicleConfirmConfig.title}
          message={vehicleConfirmConfig.message}
          onConfirm={vehicleConfirmConfig.onConfirm}
          onClose={() => setVehicleConfirmConfig((p) => ({ ...p, isOpen: false }))}
        />

        <Modal
          isOpen={showForm}
          onClose={handleCloseModal}
          title={editingId ? 'Edit Customer' : 'Register Customer'}
        >
          <form className="entity-form customer-form" onSubmit={handleSubmit}>
            {formError && (
              <div className="form-error-banner full-width">
                <span>⚠</span> {formError}
              </div>
            )}

            {/* ── Identity ──────────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">👤</span>
              <span className="vf-section-label">Identity</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Full Name <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">✏️</span>
                <input
                  className={`vf-has-icon ${fieldErrors.fullName ? 'vf-field-error' : ''}`}
                  placeholder="e.g. Juan dela Cruz"
                  value={form.fullName}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, fullName: e.target.value }))
                    if (fieldErrors.fullName) setFieldErrors(p => ({ ...p, fullName: null }))
                  }}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">Mobile Number <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📱</span>
                <input
                  className={`vf-has-icon ${fieldErrors.mobile ? 'vf-field-error' : ''}`}
                  type="tel"
                  inputMode="numeric"
                  placeholder="09123456789"
                  maxLength="11"
                  value={form.mobile}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 11)
                    setForm((p) => ({ ...p, mobile: v }))
                    if (fieldErrors.mobile) setFieldErrors(p => ({ ...p, mobile: null }))
                  }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">🏢 Branch <span className="vf-required">*</span></label>
              <select 
                value={form.bay} 
                onChange={(e) => {
                  setForm((p) => ({ ...p, bay: e.target.value }))
                  if (fieldErrors.bay) setFieldErrors(p => ({ ...p, bay: null }))
                }}
                className={fieldErrors.bay ? 'vf-field-error' : ''}
              >
                <option value="">— Select branch —</option>
                {branchLocations.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="vf-label">Email Address <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">✉️</span>
                <input
                  className="vf-has-icon"
                  type="email"
                  placeholder="customer@email.com"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: normalizeEmailClient(e.target.value) }))}
                />
              </div>
            </div>

            {/* ── Profile ───────────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">📊</span>
              <span className="vf-section-label">Profile</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Customer Type</label>
              <select value={form.customerType} onChange={(e) => setForm((p) => ({ ...p, customerType: e.target.value }))}>
                {customerTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="vf-label">Lead Source</label>
              <select value={form.leadSource} onChange={(e) => setForm((p) => ({ ...p, leadSource: e.target.value }))}>
                {leadSources.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="vf-label">Preferred Contact</label>
              <select value={form.preferredContactMethod} onChange={(e) => setForm((p) => ({ ...p, preferredContactMethod: e.target.value }))}>
                {contactMethods.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* ── Location ──────────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">📍</span>
              <span className="vf-section-label">Location</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group full-width">
              <label className="vf-label">Address <span className="vf-optional">(optional)</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">🏠</span>
                <input
                  className="vf-has-icon"
                  placeholder="Complete address (optional)"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
            </div>

            <div className="vf-form-actions full-width">
              <button type="button" className="btn-secondary" onClick={handleCloseModal}>Cancel</button>
              <button type="submit" className="btn-primary vf-submit">
                {editingId ? '✓ Update Customer' : '+ Save Customer'}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      </SectionCard>

      <section className="quick-panels">
        <article>
          <h3>Contact Preference</h3>
          <p>Email • SMS • Call • WhatsApp</p>
        </article>
        <article>
          <h3>Document Storage</h3>
          <p>Quotations, invoices, IDs, warranties</p>
        </article>
      </section>

      {showCampaigns && (
        <CampaignsModal
          token={token}
          customerIds={blastCustomerIds}
          onClose={() => { setShowCampaigns(false); setBlastCustomerIds([]) }}
        />
      )}

      {viewingVehicle && (
        <Modal
          isOpen={!!viewingVehicle}
          onClose={() => setViewingVehicle(null)}
          title=""
          wide
        >
          <VehicleDetail
            vehicle={viewingVehicle}
            token={token}
            onClose={() => setViewingVehicle(null)}
          />
        </Modal>
      )}
    </div>
  )
}
