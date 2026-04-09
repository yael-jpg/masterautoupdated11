import React, { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '../components/SectionCard'
import { buildApiUrl } from '../api/client'
import { pushToast } from '../api/client'
import './SubscriptionsPage.css'

function toDateInputValue(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function computeEndDate(startDate, frequency) {
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return ''
  const end = new Date(start)
  const f = String(frequency || 'Monthly').toLowerCase()
  if (f === 'monthly') end.setMonth(end.getMonth() + 1)
  else if (f === 'quarterly') end.setMonth(end.getMonth() + 3)
  else if (f === 'semi-annual') end.setMonth(end.getMonth() + 6)
  else if (f === 'annual') end.setFullYear(end.getFullYear() + 1)
  else end.setMonth(end.getMonth() + 1)
  return toDateInputValue(end)
}

export function SubscriptionsPage({ token, onOpenRequestAppointment }) {
  const [activeTab, setActiveTab] = useState('active')
  const [search, setSearch] = useState('')
  const [requests, setRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestActionId, setRequestActionId] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [customers, setCustomers] = useState([])
  const [packages, setPackages] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [createForm, setCreateForm] = useState(() => {
    const startDate = toDateInputValue(new Date())
    return {
      customerId: '',
      packageId: '',
      frequency: 'Monthly',
      price: '0',
      startDate,
      endDate: computeEndDate(startDate, 'Monthly'),
    }
  })

  useEffect(() => {
    if (!token) return
    let stopped = false

    const toRequestRowsFromAppointments = (payload) => {
      const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : [])
      return rows
        .filter((r) => String(r?.notes || '').includes('[PORTAL SUBSCRIPTION AVAIL REQUEST]'))
        .map((r) => ({
          appointment_id: r?.id,
          status: r?.status,
          schedule_start: r?.schedule_start,
          schedule_end: r?.schedule_end,
          requested_at: r?.created_at,
          notes: r?.notes,
          quotation_id: r?.quotation_id || null,
          quotation_no: r?.quotation_no || null,
          customer_id: r?.customer_id || null,
          customer_name: r?.customer_name || null,
          customer_mobile: r?.customer_mobile || null,
          vehicle_id: r?.vehicle_id || null,
          plate_number: r?.plate_number || null,
          vehicle_name: [r?.make, r?.model, r?.variant].filter(Boolean).join(' ') || null,
        }))
    }

    const loadRequests = async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoadingRequests(true)
          setRequestError('')
        }
        const { url, headers } = buildApiUrl('/subscriptions/requests', token)
        const res = await fetch(url, { headers })
        const data = await res.json().catch(() => ([]))

        if (res.ok) {
          if (!stopped) {
            setRequests(Array.isArray(data) ? data : [])
            setRequestError('')
          }
          return
        }

        // Fallback for servers that haven't loaded /subscriptions/requests yet.
        if (res.status === 404) {
          const apptQuery = '/appointments?page=1&limit=200&tab=active&sortBy=createdAt&sortDir=desc'
          const { url: apptUrl, headers: apptHeaders } = buildApiUrl(apptQuery, token)
          const apptRes = await fetch(apptUrl, { headers: apptHeaders })
          const apptData = await apptRes.json().catch(() => ({}))
          if (!apptRes.ok) {
            throw new Error(apptData?.message || 'Failed to load subscription requests')
          }

          if (!stopped) {
            setRequests(toRequestRowsFromAppointments(apptData))
            setRequestError('')
          }
          return
        }

        throw new Error(data?.message || 'Failed to load subscription requests')
      } catch (err) {
        if (!stopped) setRequestError(err?.message || 'Failed to load subscription requests')
      } finally {
        if (!stopped && !silent) setLoadingRequests(false)
      }
    }

    loadRequests()

    const timer = setInterval(() => {
      if (!stopped) loadRequests({ silent: true })
    }, 10000)

    const onAppointmentsUpdated = () => {
      if (!stopped) loadRequests({ silent: true })
    }

    window.addEventListener('ma:appointments-updated', onAppointmentsUpdated)
    window.addEventListener('ma:quotations-updated', onAppointmentsUpdated)

    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('ma:appointments-updated', onAppointmentsUpdated)
      window.removeEventListener('ma:quotations-updated', onAppointmentsUpdated)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    let stopped = false

    const loadSubscriptions = async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoadingSubscriptions(true)
          setSubscriptionError('')
        }
        const { url, headers } = buildApiUrl('/subscriptions/entries', token)
        const res = await fetch(url, { headers })
        const data = await res.json().catch(() => ([]))
        if (!res.ok) throw new Error(data?.message || 'Failed to load subscriptions')
        if (!stopped) setSubscriptions(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!stopped) setSubscriptionError(err?.message || 'Failed to load subscriptions')
      } finally {
        if (!stopped && !silent) setLoadingSubscriptions(false)
      }
    }

    loadSubscriptions()
    const timer = setInterval(() => { if (!stopped) loadSubscriptions({ silent: true }) }, 10000)
    const onSubscriptionsUpdated = () => { if (!stopped) loadSubscriptions({ silent: true }) }
    window.addEventListener('ma:subscriptions-updated', onSubscriptionsUpdated)

    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('ma:subscriptions-updated', onSubscriptionsUpdated)
    }
  }, [token])

  useEffect(() => {
    const handleOpenRequestsView = (event) => {
      const targetTab = String(event?.detail?.tab || '').toLowerCase()
      if (targetTab === 'requests') {
        setActiveTab('requests')
      }
    }

    window.addEventListener('ma:subscriptions-view', handleOpenRequestsView)
    return () => window.removeEventListener('ma:subscriptions-view', handleOpenRequestsView)
  }, [])

  const filteredRequests = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    if (!q) return requests
    return requests.filter((r) => {
      const haystack = [
        r?.quotation_no,
        r?.customer_name,
        r?.customer_mobile,
        r?.plate_number,
        r?.vehicle_name,
        r?.status,
        r?.notes,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [requests, search])

  const requestCount = requests.length

  const filteredSubscriptions = useMemo(() => {
    const q = String(search || '').trim().toLowerCase()
    const byTab = subscriptions.filter((s) => {
      if (activeTab === 'active') return s.status === 'Active'
      if (activeTab === 'expiring') return s.status === 'Expiring Soon'
      if (activeTab === 'cancelled') return s.status === 'Cancelled'
      if (activeTab === 'expired') return s.status === 'Expired'
      return true
    })
    if (!q) return byTab
    return byTab.filter((s) => {
      const haystack = [
        s?.customer_name,
        s?.customer_mobile,
        s?.vehicle_name,
        s?.plate_number,
        s?.package_name,
        s?.status,
      ].map((v) => String(v || '').toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [subscriptions, activeTab, search])

  const customerOptions = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return customers.slice(0, 25)
    return customers
      .filter((c) => {
        const fullName = String(c?.full_name || '').toLowerCase()
        const mobile = String(c?.mobile || '').toLowerCase()
        const email = String(c?.email || '').toLowerCase()
        return fullName.includes(q) || mobile.includes(q) || email.includes(q)
      })
      .slice(0, 25)
  }, [customers, customerSearch])

  const canSubmitCreate = Boolean(createForm.customerId && createForm.packageId && createForm.frequency && createForm.startDate && createForm.endDate)

  const openCreateModal = async () => {
    setShowCreateModal(true)
    setCreateError('')
    setCreateLoading(true)

    const startDate = toDateInputValue(new Date())
    setCreateForm({
      customerId: '',
      packageId: '',
      frequency: 'Monthly',
      price: '0',
      startDate,
      endDate: computeEndDate(startDate, 'Monthly'),
    })
    setCustomerSearch('')

    try {
      const [{ url: customerUrl, headers: customerHeaders }, { url: packageUrl, headers: packageHeaders }] = [
        buildApiUrl('/customers?page=1&limit=500', token),
        buildApiUrl('/subscriptions?status=active', token),
      ]

      const [customerRes, packageRes] = await Promise.all([
        fetch(customerUrl, { headers: customerHeaders }),
        fetch(packageUrl, { headers: packageHeaders }),
      ])

      const customerData = await customerRes.json().catch(() => ({}))
      const packageData = await packageRes.json().catch(() => ([]))

      if (!customerRes.ok) {
        throw new Error(customerData?.message || 'Failed to load customers')
      }
      if (!packageRes.ok) {
        throw new Error(packageData?.message || 'Failed to load services')
      }

      const customerRows = Array.isArray(customerData?.data) ? customerData.data : (Array.isArray(customerData) ? customerData : [])
      setCustomers(customerRows)
      setPackages(Array.isArray(packageData) ? packageData : [])
    } catch (err) {
      setCreateError(err?.message || 'Failed to load subscription form data')
    } finally {
      setCreateLoading(false)
    }
  }

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setCreateError('')
  }

  const handleCreateSubmit = () => {
    // Modal UI requested; backend create-subscription endpoint is separate from package routes.
    // Keep data in the form and let user proceed once endpoint is wired.
    setCreateError('Create subscription submit API is not connected yet. UI modal is ready.')
  }

  const handlePickCustomer = (customer) => {
    setCreateForm((prev) => ({ ...prev, customerId: String(customer.id) }))
    setCustomerSearch(String(customer?.full_name || '').trim())
  }

  const handleServiceChange = (packageId) => {
    const selected = packages.find((p) => String(p.id) === String(packageId))
    const freq = selected?.price_by_frequency || {}
    const defaultPrice = Number(freq.monthly ?? selected?.price ?? 0)
    setCreateForm((prev) => ({
      ...prev,
      packageId,
      price: String(defaultPrice),
    }))
  }

  const handleFrequencyChange = (frequency) => {
    const selected = packages.find((p) => String(p.id) === String(createForm.packageId))
    const freq = selected?.price_by_frequency || {}
    const mappedPrice = Number(
      frequency === 'Weekly'
        ? (freq.weekly ?? 0)
        : frequency === 'Annual'
          ? (freq.annual ?? 0)
          : (freq.monthly ?? selected?.price ?? 0),
    )
    setCreateForm((prev) => ({
      ...prev,
      frequency,
      price: String(mappedPrice),
      endDate: computeEndDate(prev.startDate, frequency),
    }))
  }

  const handleStartDateChange = (startDate) => {
    setCreateForm((prev) => ({
      ...prev,
      startDate,
      endDate: computeEndDate(startDate, prev.frequency),
    }))
  }

  const updateRequestStatus = async (appointmentId, nextStatus, successMessage) => {
    if (!appointmentId || !token) return
    setRequestActionId(appointmentId)
    try {
      const { url, headers } = buildApiUrl(`/appointments/${appointmentId}`, token)
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || `Failed to update request to ${nextStatus}`)
      }

      setRequests((prev) => prev.map((r) => (
        Number(r?.appointment_id) === Number(appointmentId)
          ? { ...r, status: nextStatus }
          : r
      )))
      pushToast('success', successMessage)
      window.dispatchEvent(new CustomEvent('ma:appointments-updated'))
    } catch (err) {
      pushToast('error', err?.message || 'Request update failed')
    } finally {
      setRequestActionId(null)
    }
  }

  const handleApproveRequest = async (appointmentId) => {
    if (!appointmentId || !token) return
    setRequestActionId(appointmentId)
    try {
      const { url, headers } = buildApiUrl(`/subscriptions/requests/${appointmentId}/approve`, token)
      const res = await fetch(url, { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to approve subscription request')

      setRequests((prev) => prev.filter((r) => Number(r?.appointment_id) !== Number(appointmentId)))
      if (data?.subscription) {
        setSubscriptions((prev) => [data.subscription, ...prev])
      }

      pushToast('success', data?.message || 'Subscription request approved.')
      window.dispatchEvent(new CustomEvent('ma:subscriptions-updated'))
      window.dispatchEvent(new CustomEvent('ma:appointments-updated'))
      setActiveTab('active')
    } catch (err) {
      pushToast('error', err?.message || 'Approval failed')
    } finally {
      setRequestActionId(null)
    }
  }

  const handleRejectRequest = async (appointmentId) => {
    await updateRequestStatus(appointmentId, 'Cancelled', 'Subscription request rejected.')
  }

  const handleDeleteRequest = async (appointmentId) => {
    if (!appointmentId || !token) return
    const ok = window.confirm('Delete this subscription request? This cannot be undone.')
    if (!ok) return

    setRequestActionId(appointmentId)
    try {
      const { url, headers } = buildApiUrl(`/appointments/${appointmentId}`, token)
      const res = await fetch(url, { method: 'DELETE', headers })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to delete subscription request')
      }

      setRequests((prev) => prev.filter((r) => Number(r?.appointment_id) !== Number(appointmentId)))
      pushToast('success', 'Subscription request deleted.')
      window.dispatchEvent(new CustomEvent('ma:appointments-updated'))
    } catch (err) {
      pushToast('error', err?.message || 'Delete request failed')
    } finally {
      setRequestActionId(null)
    }
  }

  const counts = useMemo(() => {
    return subscriptions.reduce(
      (acc, s) => {
        const status = String(s?.status || '').trim()
        if (status === 'Active') acc.active += 1
        else if (status === 'Expiring Soon') acc.expiring += 1
        else if (status === 'Expired') acc.expired += 1
        else if (status === 'Cancelled') acc.cancelled += 1

        const monthly = Number(s?.monthly_revenue ?? s?.price ?? 0)
        if (Number.isFinite(monthly)) acc.revenue += monthly
        return acc
      },
      { active: 0, expiring: 0, expired: 0, cancelled: 0, revenue: 0 },
    )
  }, [subscriptions])

  const stats = [
    { label: 'ACTIVE SUBSCRIPTIONS', value: String(counts.active), trend: 'Healthy' },
    { label: 'EXPIRING SOON', value: String(counts.expiring), trend: '7 days' },
    { label: 'EXPIRED', value: String(counts.expired), trend: 'Action needed' },
    { label: 'CANCELLED', value: String(counts.cancelled), trend: 'Archived' },
    { label: 'MONTHLY REVENUE', value: `₱${counts.revenue.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`, trend: 'Total' },
  ]

  return (
    <div className="page-grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">Subscription Management</h1>
          <p className="page-subtitle">Track and manage vehicle subscriptions</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>+ Create Subscription</button>
      </header>

      <section className="kpi-grid">
        {stats.map((st, i) => (
          <article key={i} className="stat-card">
            <p className="stat-label">{st.label}</p>
            <h3>{st.value}</h3>
            <span>{st.trend}</span>
          </article>
        ))}
      </section>

      <SectionCard title="Subscriptions Directory">
        <div className="filter-bar">
          <div className="subscriptions-search">
            <svg className="subscriptions-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search customer, vehicle, package..."
              className="input-field subscriptions-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={() => setSearch('')}>Clear</button>
        </div>

        <div className="tabs-nav">
          <button className={activeTab === 'active' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('active')}>Active ({counts.active})</button>
          <button className={activeTab === 'expiring' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('expiring')}>Expiring ({counts.expiring})</button>
          <button className={activeTab === 'cancelled' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('cancelled')}>Cancelled ({counts.cancelled})</button>
          <button className={activeTab === 'expired' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('expired')}>Expired ({counts.expired})</button>
          <button className={activeTab === 'requests' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('requests')}>Subscription Requests ({requestCount})</button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {activeTab === 'requests' ? (
                  <>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Preferred Start</th>
                    <th>Status</th>
                    <th>Requested At</th>
                    <th>Actions</th>
                  </>
                ) : (
                  <>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Package</th>
                    <th>Status</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'requests' ? (
                loadingRequests ? (
                  <tr>
                    <td colSpan="7" className="table-empty">Loading subscription requests...</td>
                  </tr>
                ) : requestError ? (
                  <tr>
                    <td colSpan="7" className="table-empty">{requestError}</td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="table-empty">No subscription requests found.</td>
                  </tr>
                ) : (
                  filteredRequests.map((row) => (
                    <tr key={row.appointment_id}>
                      <td>{row.quotation_no || `REQ-${row.appointment_id}`}</td>
                      <td>
                        <div>{row.customer_name || '—'}</div>
                        <div className="td-sub">{row.customer_mobile || '—'}</div>
                      </td>
                      <td>
                        <div>{row.plate_number || '—'}</div>
                        <div className="td-sub">{row.vehicle_name || '—'}</div>
                      </td>
                      <td>{row.schedule_start ? new Date(row.schedule_start).toLocaleString('en-PH') : '—'}</td>
                      <td>{row.status || 'Requested'}</td>
                      <td>{row.requested_at ? new Date(row.requested_at).toLocaleString('en-PH') : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ minHeight: 30, padding: '4px 10px' }}
                            disabled={requestActionId === row.appointment_id}
                            onClick={() => handleApproveRequest(row.appointment_id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ minHeight: 30, padding: '4px 10px' }}
                            disabled={requestActionId === row.appointment_id}
                            onClick={() => handleRejectRequest(row.appointment_id)}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ minHeight: 30, padding: '4px 10px', borderColor: 'rgba(239, 68, 68, 0.45)', color: '#ef4444' }}
                            disabled={requestActionId === row.appointment_id}
                            onClick={() => handleDeleteRequest(row.appointment_id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              ) : (
                loadingSubscriptions ? (
                  <tr>
                    <td colSpan="6" className="table-empty">Loading subscriptions...</td>
                  </tr>
                ) : subscriptionError ? (
                  <tr>
                    <td colSpan="6" className="table-empty">{subscriptionError}</td>
                  </tr>
                ) : filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="table-empty">No subscriptions found in this view.</td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div>{row.customer_name || '—'}</div>
                        <div className="td-sub">{row.customer_mobile || '—'}</div>
                      </td>
                      <td>
                        <div>{row.plate_number || '—'}</div>
                        <div className="td-sub">{row.vehicle_name || '—'}</div>
                      </td>
                      <td>{row.package_name || '—'}</td>
                      <td>{row.status || '—'}</td>
                      <td>{row.start_date ? new Date(row.start_date).toLocaleDateString('en-PH') : '—'}</td>
                      <td>{row.end_date ? new Date(row.end_date).toLocaleDateString('en-PH') : '—'}</td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {showCreateModal && (
        <div className="modal-overlay subscriptions-create-overlay" onClick={closeCreateModal}>
          <div className="modal-content subscriptions-create-modal" onClick={(e) => e.stopPropagation()}>
            <div className="subscriptions-create-header">
              <h2 className="subscriptions-create-title">Create Subscription</h2>
              <button type="button" onClick={closeCreateModal} className="btn-secondary subscriptions-create-close" aria-label="Close create subscription modal">×</button>
            </div>

            <div className="subscriptions-create-body">
              {createError && (
                <div className="subscriptions-create-error">{createError}</div>
              )}

              <div className="subscriptions-create-field">
                <label className="subscriptions-create-label">Customer <span className="subscriptions-create-required">*</span></label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search..."
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value)
                    setCreateForm((prev) => ({ ...prev, customerId: '' }))
                  }}
                />
                {customerSearch && !createLoading && customerOptions.length > 0 && !createForm.customerId && (
                  <div className="subscriptions-create-customer-options">
                    {customerOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handlePickCustomer(c)}
                        className="subscriptions-create-customer-option"
                      >
                        {c.full_name || '—'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="subscriptions-create-field">
                <label className="subscriptions-create-label">Service <span className="subscriptions-create-required">*</span></label>
                <select className="input-field" value={createForm.packageId} onChange={(e) => handleServiceChange(e.target.value)}>
                  <option value="">-- Select Service --</option>
                  {packages.map((p) => (
                    <option key={p.id} value={String(p.id)}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="subscriptions-create-two-col">
                <div className="subscriptions-create-field">
                  <label className="subscriptions-create-label">Frequency <span className="subscriptions-create-required">*</span></label>
                  <select className="input-field" value={createForm.frequency} onChange={(e) => handleFrequencyChange(e.target.value)}>
                    <option>Monthly</option>
                    <option>Quarterly</option>
                    <option>Semi-Annual</option>
                    <option>Annual</option>
                  </select>
                </div>

                <div className="subscriptions-create-field">
                  <label className="subscriptions-create-label">Price (₱)</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    value={createForm.price}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, price: e.target.value }))}
                  />
                </div>
              </div>

              <div className="subscriptions-create-two-col">
                <div className="subscriptions-create-field">
                  <label className="subscriptions-create-label">Start Date <span className="subscriptions-create-required">*</span></label>
                  <input type="date" className="input-field" value={createForm.startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
                </div>

                <div className="subscriptions-create-field">
                  <label className="subscriptions-create-label">End Date <span className="subscriptions-create-required">*</span></label>
                  <input type="date" className="input-field" value={createForm.endDate} onChange={(e) => setCreateForm((prev) => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>

              <div className="subscriptions-create-actions">
                <button type="button" className="btn-secondary" onClick={closeCreateModal}>Cancel</button>
                <button type="button" className="btn-primary" onClick={handleCreateSubmit} disabled={!canSubmitCreate || createLoading}>Create Subscription</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
