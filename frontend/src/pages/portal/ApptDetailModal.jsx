import { useEffect, useState } from 'react'
import { portalPost } from '../../api/portalClient'
import { pushToast } from '../../api/client'

export const STATUS_CLASS = {
  Scheduled: 'badge-info',
  Confirmed: 'badge-info',
  'In Progress': 'badge-warning',
  Cancelled: 'badge-danger',
  'No Show': 'badge-danger',
  Completed: 'badge-success',
  'Completed/Released': 'badge-success',
}

export const QUOTATION_CLASS = {
  Pending: 'badge-warning',
  Approved: 'badge-success',
  'Not Approved': 'badge-danger',
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function ApptDetailModal({ appt, onClose, onCancelled }) {
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

  const hasSchedule = Boolean(appt?.schedule_start)

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
              <span className={`status-badge ${STATUS_CLASS[appt.status] || 'badge-neutral'}`}>{appt.status}</span>
              {paymentBadge && (
                <span className={`status-badge ${paymentBadge.cls}`}>Payment: {paymentBadge.label}</span>
              )}
              {cancelReqPending && <span className="status-badge badge-warning">Pending Approval</span>}
              {cancelReqStatus === 'REJECTED' && <span className="status-badge badge-danger">Rejected</span>}
              {appt.quotation_approval_status && (
                <span className={`status-badge ${QUOTATION_CLASS[appt.quotation_approval_status] || 'badge-neutral'}`}>
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
              <div className="portal-appt-val">{hasSchedule ? fmtDate(appt.schedule_start) : '—'}</div>
              <div className="portal-appt-subval">
                {hasSchedule ? (
                  <>
                    {fmtTime(appt.schedule_start)}
                    {appt.schedule_end && <> — {fmtTime(appt.schedule_end)}</>}
                  </>
                ) : (
                  '—'
                )}
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
                    if (paid >= total) return <span className="status-badge badge-success">Fully Paid</span>
                    if (paid > 0) return <span className="status-badge badge-warning">Partial Payment</span>
                    return <span className="status-badge badge-neutral">Unpaid</span>
                  })()}
                  <span className="portal-appt-pay-paid">₱{Number(appt.paid_amount || 0).toLocaleString()}</span>
                  <span className="portal-appt-pay-total">/ ₱{Number(appt.total_amount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {appt.notes && (
            <div className="portal-appt-notes">
              <div className="portal-appt-lbl">Notes</div>
              <div className="portal-appt-notes-text">{appt.notes}</div>
            </div>
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
