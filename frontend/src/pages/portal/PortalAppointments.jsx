import { useEffect, useState } from 'react'
import { portalGet, portalPost } from '../../api/portalClient'
import { pushToast } from '../../api/client'

const STATUS_CLASS = {
  Scheduled: 'badge-info',
  Confirmed: 'badge-info',
  'In Progress': 'badge-warning',
  Cancelled: 'badge-danger',
  'No Show': 'badge-danger',
  Completed: 'badge-success',
  'Completed/Released': 'badge-success',
}

const QUOTATION_CLASS = {
  Pending: 'badge-warning',
  Approved: 'badge-success',
  'Not Approved': 'badge-danger',
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function ApptDetailModal({ appt, onClose, onCancelled }) {
  const [cancelLoading, setCancelLoading] = useState(false)

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const branch = [appt.installer_team].filter(Boolean).join(' · ')
  const cancelReqStatus = String(appt?.cancel_request_status || '').toUpperCase()
  const cancelReqPending = cancelReqStatus === 'PENDING'
  const canCancel = (appt.status === 'Scheduled' || appt.status === 'Confirmed') && !cancelReqPending

  const dpPaid = (appt?.down_payment_method && appt.down_payment_method !== 'cash' && Number(appt.down_payment_amount || 0) > 0)
    ? Number(appt.down_payment_amount || 0)
    : 0
  const invoicePaid = Number(appt?.paid_amount || 0)
  const hasAnyPaid = (dpPaid + invoicePaid) > 0

  const scheduleSummary = appt.schedule_start
    ? `${fmtDate(appt.schedule_start)} · ${fmtTime(appt.schedule_start)}${appt.schedule_end ? ` — ${fmtTime(appt.schedule_end)}` : ''}`
    : '—'

  const apptSummary = [
    appt.plate_number,
    [appt.make, appt.model].filter(Boolean).join(' '),
    appt.service_name || 'Service',
  ].filter(Boolean).join(' · ')

  const paymentBadge = (() => {
    const total = Number(appt.total_amount || 0)
    const paid = Number(appt.paid_amount || 0)
    if (!total) return null
    if (paid >= total) return { cls: 'badge-success', label: 'Paid' }
    if (paid > 0) return { cls: 'badge-warning', label: 'Partial' }
    return { cls: 'badge-danger', label: 'Unpaid' }
  })()

  const handleCancel = async (action = null) => {
    if (!canCancel || cancelLoading) return
    const ok = window.confirm(
      hasAnyPaid
        ? `Cancel this appointment and request a ${action === 'credit' ? 'credit' : 'refund'}?`
        : 'Request cancellation for this appointment?',
    )
    if (!ok) return

    setCancelLoading(true)
    try {
      await portalPost(`/appointments/${appt.id}/cancel`, hasAnyPaid ? { action } : {})
      pushToast('success', 'Cancellation request sent for approval.')
      onCancelled?.(appt.id)
      onClose()
    } catch (err) {
      pushToast('error', err?.message || 'Failed to cancel appointment.')
    } finally {
      setCancelLoading(false)
    }
  }

  return (
    <div onClick={onClose} className="portal-detail-overlay portal-appt-overlay">
      <div onClick={(e) => e.stopPropagation()} className="portal-detail-panel portal-appt-panel">
        <div className="portal-appt-header">
          <div className="portal-appt-header-main">
            <div className="portal-appt-kicker">Appointment Details</div>
            <div className="portal-appt-title">{scheduleSummary}</div>
            <div className="portal-appt-subtitle">{apptSummary}</div>

            <div className="portal-appt-badges">
              <span className={`badge ${STATUS_CLASS[appt.status] || 'badge-neutral'}`}>{appt.status}</span>
              {cancelReqPending && <span className="badge badge-warning">Pending Approval</span>}
              {cancelReqStatus === 'REJECTED' && <span className="badge badge-danger">Rejected</span>}
              {appt.quotation_approval_status && (
                <span className={`badge ${QUOTATION_CLASS[appt.quotation_approval_status] || 'badge-neutral'}`}>
                  Quotation: {appt.quotation_approval_status}
                </span>
              )}
            </div>
          </div>

          <button onClick={onClose} className="portal-appt-close" aria-label="Close">×</button>
        </div>

        <div className="portal-appt-body">
          <div className="portal-appt-summary">
            <div className="portal-appt-summary-col">
              <div className="portal-appt-lbl">Schedule</div>
              <div className="portal-appt-val">{fmtDate(appt.schedule_start)}</div>
              <div className="portal-appt-subval">
                {fmtTime(appt.schedule_start)}
                {appt.schedule_end && <> — {fmtTime(appt.schedule_end)}</>}
              </div>
            </div>

            <div className="portal-appt-summary-col">
              <div className="portal-appt-lbl">Vehicle</div>
              <div className="portal-appt-val portal-appt-mono">{appt.plate_number}</div>
              <div className="portal-appt-subval">
                {[appt.year, appt.make, appt.model].filter(Boolean).join(' ')}
                {appt.color ? <> · {appt.color}</> : ''}
              </div>
            </div>

            <div className="portal-appt-summary-col">
              <div className="portal-appt-lbl">Service</div>
              <div className="portal-appt-val">{appt.service_name || 'General Service'}</div>
              <div className="portal-appt-subval">{appt.service_category || '—'}</div>
            </div>

            <div className="portal-appt-summary-right">
              <span className={`badge ${STATUS_CLASS[appt.status] || 'badge-neutral'}`}>{appt.status}</span>
              {paymentBadge && <span className={`badge ${paymentBadge.cls}`}>{paymentBadge.label}</span>}
            </div>
          </div>

          <div className="portal-appt-grid">
            <div className="portal-appt-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-appt-icon">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <div className="portal-appt-card-main">
                <div className="portal-appt-lbl">Installer Team</div>
                <div className={`portal-appt-val ${branch ? '' : 'portal-appt-dim'}`}>{branch || '—'}</div>
              </div>
            </div>

            {appt.job_order_no && (
              <div className="portal-appt-card">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-appt-icon">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
                  <polyline points="3.29 7 12 12 20.71 7" />
                  <line x1="12" y1="22" x2="12" y2="12" />
                </svg>
                <div className="portal-appt-card-main">
                  <div className="portal-appt-lbl">Job Order</div>
                  <div className="portal-appt-val portal-appt-mono">{appt.job_order_no}</div>
                  <div className="portal-appt-subval">Linked to this appointment</div>
                </div>
              </div>
            )}
          </div>

          {Number(appt.total_amount) > 0 && (
            <div className="portal-appt-card">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="portal-appt-icon">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <div className="portal-appt-card-main">
                <div className="portal-appt-lbl">Payment</div>
                <div className="portal-appt-pay-row">
                  {(() => {
                    const total = Number(appt.total_amount || 0)
                    const paid = Number(appt.paid_amount || 0)
                    if (paid >= total) return <span className="badge badge-success">Fully Paid</span>
                    if (paid > 0) return <span className="badge badge-warning">Partial Payment</span>
                    return <span className="badge badge-neutral">Unpaid</span>
                  })()}
                  <span className="portal-appt-pay-paid">₱{Number(appt.paid_amount || 0).toLocaleString()}</span>
                  <span className="portal-appt-pay-total">/ ₱{Number(appt.total_amount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {appt.notes && (
            <div className="portal-appt-notes">📝 {appt.notes}</div>
          )}

          <div className="portal-appt-footer">
            {appt.created_at && (
              <div className="portal-appt-meta">Booked on {fmtDate(appt.created_at)}</div>
            )}

            <div className="portal-appt-actions">
              {cancelReqPending && (
                <button type="button" disabled className="btn-secondary" title="Waiting for admin approval">
                  Cancellation Requested
                </button>
              )}

              {canCancel && (
                hasAnyPaid ? (
                  <>
                    <button type="button" onClick={() => handleCancel('refund')} disabled={cancelLoading} className="btn-danger" title="Cancel and request refund">
                      {cancelLoading ? 'Processing…' : 'Cancel (Refund)'}
                    </button>
                    <button type="button" onClick={() => handleCancel('credit')} disabled={cancelLoading} className="btn-secondary" title="Cancel and request credit">
                      {cancelLoading ? 'Processing…' : 'Cancel (Credit)'}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => handleCancel(null)} disabled={cancelLoading} className="btn-danger" title="Cancel appointment">
                    {cancelLoading ? 'Sending…' : 'Request Cancellation'}
                  </button>
                )
              )}

              <button type="button" onClick={onClose} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PortalAppointments({ onBook }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('active')

  const markCancelled = (appointmentId) => {
    const nowIso = new Date().toISOString()
    setAppointments((prev) => prev.map((a) => (
      a.id === appointmentId
        ? { ...a, cancel_request_status: 'PENDING', cancel_requested_at: nowIso }
        : a
    )))
    setSelected((prev) => (prev && prev.id === appointmentId
      ? { ...prev, cancel_request_status: 'PENDING', cancel_requested_at: nowIso }
      : prev))
  }

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const rows = await portalGet('/appointments')
        if (stopped) return
        setAppointments(Array.isArray(rows) ? rows : [])
      } catch (_) {
        // Silent: portal should remain usable even if polling fails
      } finally {
        if (!stopped && isInitial) setLoading(false)
      }
    }

    load(true)

    const intervalMs = 10000
    const id = setInterval(() => load(false), intervalMs)

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const activeAppointments = appointments.filter((a) => a.status !== 'Cancelled')
  const historyAppointments = appointments.filter((a) => a.status === 'Cancelled')
  const shown = tab === 'history' ? historyAppointments : activeAppointments

  if (loading) {
    return <div style={{ color: 'rgba(189,200,218,0.45)', padding: 48, textAlign: 'center', fontSize: 13 }}>Loading…</div>
  }

  return (
    <>
      {selected && <ApptDetailModal appt={selected} onClose={() => setSelected(null)} onCancelled={markCancelled} />}

      <div className="portal-hero">
        <div>
          <h2>My Appointments</h2>
          <p>All scheduled and past appointments for your vehicles. Click any row to view details.</p>
        </div>
      </div>

      <div className="portal-tabs">
        <button type="button" className={`portal-tab-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          Appointments
          <span className="portal-tab-count">{activeAppointments.length}</span>
        </button>
        <button type="button" className={`portal-tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          History
          <span className="portal-tab-count">{historyAppointments.length}</span>
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="portal-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p>
            {tab === 'history'
              ? 'No cancelled appointments yet.'
              : <>No appointments yet. Use <strong>Request Quotation</strong> in the sidebar to start one.</>}
          </p>
        </div>
      ) : (
        <div className="portal-section">
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Vehicle</th>
                  <th>Service</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelected(a)}
                    style={{ cursor: 'pointer' }}
                    title="Click to view details"
                  >
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(a.schedule_start).toLocaleString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{a.plate_number}</span>
                      <br />
                      <span style={{ fontSize: 11, color: 'rgba(189,200,218,0.45)' }}>{a.year} {a.make} {a.model}</span>
                    </td>
                    <td>{a.service_name || 'General'}</td>
                    <td style={{ fontSize: 12, color: 'rgba(189,200,218,0.55)' }}>
                      {[a.installer_team].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[a.status] || 'badge-neutral'}`}>{a.status}</span>
                      {String(a?.cancel_request_status || '').toUpperCase() === 'PENDING' && (
                        <span className="badge badge-warning" style={{ marginLeft: 4 }}>Pending Approval</span>
                      )}
                      {String(a?.cancel_request_status || '').toUpperCase() === 'REJECTED' && (
                        <span className="badge badge-danger" style={{ marginLeft: 4 }}>Rejected</span>
                      )}
                      {a.quotation_approval_status && (
                        <span
                          className={`badge ${QUOTATION_CLASS[a.quotation_approval_status] || 'badge-neutral'}`}
                          style={{ marginLeft: 4 }}
                          title={`Quotation ${a.quotation_reference_no || ''}`}
                        >
                          Quotation: {a.quotation_approval_status}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'rgba(189,200,218,0.50)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(() => {
                        const total = Number(a.total_amount || 0)
                        const paid = Number(a.paid_amount || 0)
                        if (!total) return <span style={{ color: 'rgba(189,200,218,0.30)' }}>—</span>
                        if (paid >= total) return <span className="badge badge-success">Paid</span>
                        if (paid > 0) {
                          return (
                            <>
                              <span className="badge badge-warning">Partial</span>
                              <span style={{ fontSize: 10, color: 'rgba(189,200,218,0.40)', marginLeft: 4 }}>
                                ₱{paid.toLocaleString()} / ₱{total.toLocaleString()}
                              </span>
                            </>
                          )
                        }
                        return <span className="badge badge-neutral">Unpaid</span>
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
