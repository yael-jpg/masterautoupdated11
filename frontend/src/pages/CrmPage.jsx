import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { CampaignsModal } from './CampaignsModal'
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

export function CRMPage({ token, user, onAfterSave, onNewQuotation, onRegisterVehicle }) {
  const isSuperAdmin = user?.role === 'SuperAdmin'
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formError, setFormError] = useState('')
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

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerQuotations, setCustomerQuotations] = useState([])
  const [customerJobOrders, setCustomerJobOrders] = useState([])
  const [customerVehicles, setCustomerVehicles] = useState([])
  const [customerPayments, setCustomerPayments] = useState([])
  const [customerAppointments, setCustomerAppointments] = useState([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState('')

  const [form, setForm] = useState(EMPTY_FORM)

  // Close modal helper
  const handleCloseModal = () => {
    setShowForm(false)
    setEditingId(null)
    setFormError('')
    setForm(EMPTY_FORM)
  }

  const loadCustomers = async (nextPage = page, nextSearch = search, opts = {}) => {
    const { includeBalance = true, silent = false } = opts
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
      setSelectedKeys(new Set())
    } catch (e) {
      if (!silent) throw e
    }
  }

  useEffect(() => {
    loadCustomers(1, search).catch((loadError) => setError(loadError.message))
  }, [token, search])

  useEffect(() => {
    if (!token) return
    let stopped = false

    const refresh = async () => {
      if (stopped) return
      await loadCustomers(page, search, { includeBalance: false, silent: true })
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

  useEffect(() => {
    apiGet('/config/category/booking', token)
      .then((arr) => {
        const entries = Array.isArray(arr) ? arr : []
        const raw = entries.find((e) => e.key === 'branch_locations')?.value ?? null
        const parsed = Array.isArray(raw) ? raw : (() => { try { return raw ? JSON.parse(raw) : null } catch { return null } })()
        if (Array.isArray(parsed) && parsed.length > 0) setBranchLocations(parsed)
      })
      .catch(() => {})
  }, [token])

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
      setCustomerVehicles((vRes && (vRes.data || vRes)) || [])
      setCustomerPayments(pRes.data || [])
      setCustomerAppointments(aRes.data || [])
    } catch (err) {
      setServicesError(err.message || 'Failed to load services')
    } finally {
      setServicesLoading(false)
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
    if (!form.fullName.trim()) { setFormError('Full name is required.'); return }
    if (!form.mobile.trim() || form.mobile.length < 10) { setFormError('A valid mobile number is required.'); return }
    if (!form.bay.trim()) { setFormError('Please select a branch.'); return }
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
    <div className="page-grid">
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

                      {customerAppointments.length > 0 && (
                        <div className="crm-section">
                          <div className="crm-section-label">BOOKINGS / APPOINTMENTS</div>
                          <div className="crm-card-list">
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

                      {customerPayments.length > 0 && (
                        <div className="crm-section">
                          <div className="crm-section-label">PAYMENT HISTORY</div>
                          <div className="crm-payment-list">
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
                        </div>
                      )}

                      {customerVehicles.length === 0 && customerQuotations.length === 0 && customerJobOrders.length === 0 && customerPayments.length === 0 && customerAppointments.length === 0 && (
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
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowCustomerModal(false)
                      if (selectedCustomer) handleEdit(selectedCustomer)
                    }}
                  >
                    Edit Profile
                  </button>
                  {customerVehicles.length === 0 ? (
                    <button
                      className="btn-primary"
                      onClick={() => {
                        if (selectedCustomer && onRegisterVehicle) {
                          setShowCustomerModal(false)
                          onRegisterVehicle(selectedCustomer)
                        }
                      }}
                    >
                      🚗 Register Vehicle
                    </button>
                  ) : (
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
                </div>
              </section>
            </div>
          </div>
        </Modal>

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
                  className="vf-has-icon"
                  placeholder="e.g. Juan dela Cruz"
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">Mobile Number <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📱</span>
                <input
                  className="vf-has-icon"
                  type="tel"
                  inputMode="numeric"
                  placeholder="09123456789"
                  maxLength="11"
                  value={form.mobile}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 11)
                    setForm((p) => ({ ...p, mobile: v }))
                  }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">🏢 Branch <span className="vf-required">*</span></label>
              <select value={form.bay} onChange={(e) => setForm((p) => ({ ...p, bay: e.target.value }))}>
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
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
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
                <option>Retail</option>
                <option>Dealer</option>
                <option>Corporate</option>
                <option>VIP</option>
              </select>
            </div>

            <div className="form-group">
              <label className="vf-label">Lead Source</label>
              <select value={form.leadSource} onChange={(e) => setForm((p) => ({ ...p, leadSource: e.target.value }))}>
                <option>Walk-in</option>
                <option>Facebook</option>
                <option>Referral</option>
                <option>Google</option>
                <option>Other</option>
              </select>
            </div>

            <div className="form-group">
              <label className="vf-label">Preferred Contact</label>
              <select value={form.preferredContactMethod} onChange={(e) => setForm((p) => ({ ...p, preferredContactMethod: e.target.value }))}>
                <option>Call</option>
                <option>SMS</option>
                <option>Email</option>
                <option>WhatsApp</option>
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
    </div>
  )
}
