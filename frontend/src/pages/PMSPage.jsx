import React, { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '../components/SectionCard'
import { buildApiUrl, pushToast } from '../api/client'

export function PMSPage({ token }) {
  const [activeTab, setActiveTab] = useState('requests')
  const [search, setSearch] = useState('')
  const [requests, setRequests] = useState([])
  const [trackingRows, setTrackingRows] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [loadingTracking, setLoadingTracking] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [trackingError, setTrackingError] = useState('')
  const [requestActionId, setRequestActionId] = useState(null)

  useEffect(() => {
    if (!token) return
    let stopped = false

    const toRequestRowsFromAppointments = (payload) => {
      const rows = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : [])
      return rows
        .filter((r) => String(r?.notes || '').includes('[PORTAL PMS AVAIL REQUEST]'))
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
        const { url, headers } = buildApiUrl('/pms/requests', token)
        const res = await fetch(url, { headers })
        const data = await res.json().catch(() => ([]))
        if (!res.ok) {
          if (res.status === 404) {
            const apptQuery = '/appointments?page=1&limit=200&tab=active&sortBy=createdAt&sortDir=desc'
            const { url: apptUrl, headers: apptHeaders } = buildApiUrl(apptQuery, token)
            const apptRes = await fetch(apptUrl, { headers: apptHeaders })
            const apptData = await apptRes.json().catch(() => ({}))
            if (!apptRes.ok) {
              throw new Error(apptData?.message || 'Failed to load PMS requests')
            }

            if (!stopped) {
              setRequests(toRequestRowsFromAppointments(apptData))
            }
            return
          }

          throw new Error(data?.message || 'Failed to load PMS requests')
        }
        if (!stopped) {
          setRequests(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        if (!stopped) setRequestError(err?.message || 'Failed to load PMS requests')
      } finally {
        if (!stopped && !silent) setLoadingRequests(false)
      }
    }

    const loadTracking = async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setLoadingTracking(true)
          setTrackingError('')
        }
        const { url, headers } = buildApiUrl('/pms/tracking', token)
        const res = await fetch(url, { headers })
        const data = await res.json().catch(() => ([]))
        if (!res.ok) throw new Error(data?.message || 'Failed to load PMS tracking')
        if (!stopped) setTrackingRows(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!stopped) setTrackingError(err?.message || 'Failed to load PMS tracking')
      } finally {
        if (!stopped && !silent) setLoadingTracking(false)
      }
    }

    loadRequests()
    loadTracking()
    const timer = setInterval(() => { if (!stopped) loadRequests({ silent: true }) }, 10000)
    const trackingTimer = setInterval(() => { if (!stopped) loadTracking({ silent: true }) }, 10000)
    const onAppointmentsUpdated = () => { if (!stopped) loadRequests({ silent: true }) }
    const onPmsUpdated = () => { if (!stopped) loadTracking({ silent: true }) }
    window.addEventListener('ma:appointments-updated', onAppointmentsUpdated)
    window.addEventListener('ma:pms-updated', onPmsUpdated)

    return () => {
      stopped = true
      clearInterval(timer)
      clearInterval(trackingTimer)
      window.removeEventListener('ma:appointments-updated', onAppointmentsUpdated)
      window.removeEventListener('ma:pms-updated', onPmsUpdated)
    }
  }, [token])

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
      ].map((v) => String(v || '').toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [requests, search])

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
      if (!res.ok) throw new Error(data?.message || `Failed to update request to ${nextStatus}`)

      setRequests((prev) => prev.filter((r) => Number(r?.appointment_id) !== Number(appointmentId)))
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
      const { url, headers } = buildApiUrl(`/pms/requests/${appointmentId}/approve`, token)
      const res = await fetch(url, { method: 'POST', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 404) {
          await updateRequestStatus(appointmentId, 'In Progress', 'PMS request approved and moved to Service Tracking.')
          return
        }
        throw new Error(data?.message || 'Failed to approve PMS request')
      }

      setRequests((prev) => prev.filter((r) => Number(r?.appointment_id) !== Number(appointmentId)))
      setTrackingRows((prev) => [
        {
          id: appointmentId,
          customer_name: null,
          customer_mobile: null,
          plate_number: null,
          vehicle_name: null,
          package_name: 'PMS Service',
          due_date: new Date().toISOString(),
          status: 'In Progress',
        },
        ...prev,
      ])
      pushToast('success', data?.message || 'PMS request approved.')
      window.dispatchEvent(new CustomEvent('ma:appointments-updated'))
      window.dispatchEvent(new CustomEvent('ma:pms-updated'))
    } catch (err) {
      pushToast('error', err?.message || 'Approval failed')
    } finally {
      setRequestActionId(null)
    }
  }

  const handleRejectRequest = async (appointmentId) => {
    await updateRequestStatus(appointmentId, 'Cancelled', 'PMS request cancelled.')
  }

  const handleDeleteRequest = async (appointmentId) => {
    if (!appointmentId || !token) return
    const ok = window.confirm('Delete this PMS request? This cannot be undone.')
    if (!ok) return

    setRequestActionId(appointmentId)
    try {
      const { url, headers } = buildApiUrl(`/appointments/${appointmentId}`, token)
      const res = await fetch(url, { method: 'DELETE', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to delete PMS request')

      setRequests((prev) => prev.filter((r) => Number(r?.appointment_id) !== Number(appointmentId)))
      pushToast('success', 'PMS request deleted.')
      window.dispatchEvent(new CustomEvent('ma:appointments-updated'))
    } catch (err) {
      pushToast('error', err?.message || 'Delete request failed')
    } finally {
      setRequestActionId(null)
    }
  }

  const stats = [
    { label: 'PMS SERVICE REQUESTS', value: String(requests.length), trend: 'Pending review' },
    { label: 'IN PROGRESS', value: String(trackingRows.filter((r) => String(r?.status || '') === 'In Progress').length), trend: 'Current' },
    { label: 'COMPLETED SERVICES', value: String(trackingRows.filter((r) => String(r?.status || '') === 'Completed').length), trend: 'Total' },
    { label: 'TOTAL PMS REVENUE', value: '₱0', trend: 'Accumulated' },
  ]

  const renderHeaders = () => {
    switch (activeTab) {
      case 'requests':
        return (
          <>
            <th>Subscription</th>
            <th>Customer</th>
            <th>Vehicle</th>
            <th>Preferred Start</th>
            <th>Status</th>
            <th>Requested At</th>
            <th>Actions</th>
          </>
        )
      case 'tracking':
        return (
          <>
            <th>Service</th>
            <th>Vehicle</th>
            <th>Due Date</th>
            <th>Status</th>
          </>
        )
      case 'history':
        return (
          <>
            <th>Reference</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Status</th>
          </>
        )
      default:
        return <th>Data</th>
    }
  }

  return (
    <div className="page-grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">PMS Management</h1>
          <p className="page-subtitle">Preventive Maintenance Service overview & tracking</p>
        </div>
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

      <div className="tabs-nav">
        <button className={activeTab === 'requests' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('requests')}>Service Requests ({requests.length})</button>
        <button className={activeTab === 'tracking' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('tracking')}>Service Tracking</button>
        <button className={activeTab === 'history' ? 'tab-btn active' : 'tab-btn'} onClick={() => setActiveTab('history')}>Service History</button>
      </div>

      <SectionCard 
        title={'PMS ' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        actionLabel={activeTab === 'requests' ? 'Clear' : 'Refresh'}
        onActionClick={() => {
          if (activeTab === 'requests') setSearch('')
        }}
      >
        {activeTab === 'requests' && (
          <div className="filter-bar" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search customer, vehicle, reference..."
              className="input-field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {renderHeaders()}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'requests' ? (
                loadingRequests ? (
                  <tr>
                    <td colSpan="7" className="table-empty">Loading PMS requests...</td>
                  </tr>
                ) : requestError ? (
                  <tr>
                    <td colSpan="7" className="table-empty">{requestError}</td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="table-empty">No PMS requests found.</td>
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
                            style={{ minHeight: 30, padding: '4px 10px', borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }}
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
                activeTab === 'tracking' ? (
                  loadingTracking ? (
                    <tr>
                      <td colSpan="4" className="table-empty">Loading PMS tracking...</td>
                    </tr>
                  ) : trackingError ? (
                    <tr>
                      <td colSpan="4" className="table-empty">{trackingError}</td>
                    </tr>
                  ) : trackingRows.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="table-empty">No PMS service tracking records found.</td>
                    </tr>
                  ) : (
                    trackingRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.package_name || 'PMS Service'}</td>
                        <td>
                          <div>{row.plate_number || '—'}</div>
                          <div className="td-sub">{row.vehicle_name || '—'}</div>
                        </td>
                        <td>{row.due_date ? new Date(row.due_date).toLocaleString('en-PH') : '—'}</td>
                        <td>{row.status || 'In Progress'}</td>
                      </tr>
                    ))
                  )
                ) : (
                  <tr>
                    <td colSpan="4" className="table-empty">No data found for {activeTab}.</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  )
}
