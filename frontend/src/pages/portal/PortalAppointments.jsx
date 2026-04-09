import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'
import { ApptDetailModal, QUOTATION_CLASS, STATUS_CLASS } from './ApptDetailModal'

const HISTORY_STATUSES = new Set([
  'Cancelled',
  'No Show',
  'Completed',
  'Completed/Released',
])

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

  const activeAppointments = appointments.filter((a) => !HISTORY_STATUSES.has(a.status))
  const historyAppointments = appointments.filter((a) => HISTORY_STATUSES.has(a.status))
  const shown = tab === 'history' ? historyAppointments : activeAppointments

  if (loading) {
    return <div className="portal-loading">Loading…</div>
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
              ? 'No appointment history yet.'
              : <>No appointments yet. Use <strong>Request Schedule</strong> in the sidebar to start one.</>}
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
                    className="portal-appointments-row"
                    title="Click to view details"
                  >
                    <td className="portal-appointments-date-cell">
                      {new Date(a.schedule_start).toLocaleString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className="portal-appointments-plate">{a.plate_number}</span>
                      <br />
                      <span className="portal-appointments-vehicle-meta">{a.year} {a.make} {a.model}</span>
                    </td>
                    <td>{a.service_name || 'General'}</td>
                    <td className="portal-appointments-team-cell">
                      {[a.installer_team].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[a.status] || 'badge-neutral'}`}>{a.status}</span>
                      {String(a?.cancel_request_status || '').toUpperCase() === 'PENDING' && (
                        <span className="badge badge-warning portal-appointments-badge-gap">Pending Approval</span>
                      )}
                      {String(a?.cancel_request_status || '').toUpperCase() === 'REJECTED' && (
                        <span className="badge badge-danger portal-appointments-badge-gap">Rejected</span>
                      )}
                      {a.quotation_approval_status && (
                        <span
                          className={`badge ${QUOTATION_CLASS[a.quotation_approval_status] || 'badge-neutral'} portal-appointments-badge-gap`}
                          title={`Quotation ${a.quotation_reference_no || ''}`}
                        >
                          Quotation: {a.quotation_approval_status}
                        </span>
                      )}
                    </td>
                    <td className="portal-appointments-payment-cell">
                      {(() => {
                        const total = Number(a.total_amount || 0)
                        const paid = Number(a.paid_amount || 0)
                        if (!total) return <span className="portal-appointments-empty">—</span>
                        if (paid >= total) return <span className="badge badge-success">Paid</span>
                        if (paid > 0) {
                          return (
                            <>
                              <span className="badge badge-warning">Partial</span>
                              <span className="portal-appointments-partial-meta">
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
