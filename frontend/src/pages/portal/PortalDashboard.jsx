import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'
import { ApptDetailModal } from './ApptDetailModal'

const STATUS_DOT = {
  Scheduled: '#c8c8c8',
  Confirmed: '#c8c8c8',
  'Checked-in': '#f59e0b',
  'In progress': '#f59e0b',
  'In Progress': '#f59e0b',
  QA: '#a78bfa',
  'Ready for release': '#34d399',
  'Completed/Released': '#34d399',
  Completed: '#34d399',
  Cancelled: '#ef4444',
  'No Show': '#ef4444',
}

export function PortalDashboard({ customer, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAppt, setSelectedAppt] = useState(null)

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const [s, a, v] = await Promise.all([
          portalGet('/dashboard/stats'),
          portalGet('/appointments'),
          portalGet('/vehicles'),
        ])
        if (stopped) return
        setStats(s)
        setAppointments(Array.isArray(a) ? a : [])
        setVehicles(Array.isArray(v) ? v : [])
      } catch (_) {
        // Silent
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

  const firstName = customer?.name?.split(' ')[0] ?? 'there'

  // Next upcoming appointment
  const ACTIVE_APPT_STATUSES = new Set([
    'Scheduled',
    'Confirmed',
    'Checked-in',
    'In progress',
    'In Progress',
    'QA',
    'Ready for release',
  ])

  const now = Date.now()
  const nextAppt = appointments
    .filter((a) => ACTIVE_APPT_STATUSES.has(a.status))
    .map((a) => ({ a, t: new Date(a.schedule_start).getTime() }))
    .filter((x) => Number.isFinite(x.t) && x.t >= now)
    .sort((x, y) => x.t - y.t)[0]?.a || null

  // Active jobs
  const activeJobs = stats?.activeJobs ?? 0
  const totalSpend = Number(stats?.totalSpend ?? 0)
  const spendK = Math.round(totalSpend / 1000)
  const maxK = Math.max(spendK + 10, 50)
  const pct = maxK > 0 ? Math.min((spendK / maxK) * 100, 100) : 0

  // Most recent vehicle
  const primaryVehicle = vehicles[0]

  // Hero subtitle: show next appt vehicle + service if available
  const heroSub = nextAppt
    ? `${nextAppt.make} ${nextAppt.model} — ${nextAppt.service_name || 'Service'} scheduled`
    : primaryVehicle
      ? `${primaryVehicle.make} ${primaryVehicle.model} — No upcoming appointments`
      : 'No vehicles registered yet'

  // Recent vehicles list (appointments, latest 5)
  const recentRows = appointments.slice(0, 5)

  const markCancelled = (appointmentId) => {
    const nowIso = new Date().toISOString()
    setAppointments((prev) => prev.map((a) => (
      a.id === appointmentId
        ? { ...a, cancel_request_status: 'PENDING', cancel_requested_at: nowIso }
        : a
    )))
  }

  if (loading) {
    return (
      <div className="portal-dash-loading">Loading your dashboard…</div>
    )
  }

  return (
    <div className="portal-dash">


      {/* ── Welcome + quick actions ── */}
      <div className="portal-dash-welcome">
        <div className="portal-dash-welcome-text">
          <h2>Welcome back, <span>{firstName}</span> 👋</h2>
          <p>{heroSub}</p>
        </div>
        <div className="portal-dash-welcome-actions">
          <button className="portal-action-btn" onClick={() => onNavigate('vehicles')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Make Vehicle
          </button>
          <button className="portal-action-btn" onClick={() => onNavigate('history')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            View Service History
          </button>
        </div>
      </div>

      {/* ── Body: KPI cards + section cards ── */}
      <div className="portal-dash-body">

        {/* KPI stat cards */}
        <div className="kpi-grid">

          {/* Next Appointment */}
          <div className="stat-card clickable" onClick={() => onNavigate('appointments')}>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="stat-label">Next Appointment</p>
            <h3 className={`portal-dash-nextappt-value ${nextAppt ? 'portal-dash-nextappt-value--has' : ''}`}>
              {nextAppt
                ? new Date(nextAppt.schedule_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'}
            </h3>
            <span className="stat-trend neutral">
              {nextAppt ? `${nextAppt.make} ${nextAppt.model} · ${nextAppt.service_name || 'Service'}` : 'No upcoming bookings'}
            </span>
          </div>

          {/* Jobs In Progress */}
          <div className="stat-card clickable" onClick={() => onNavigate('jobs')}>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <p className="stat-label">Jobs in Progress</p>
            <h3>{activeJobs}</h3>
            <span className={`stat-trend ${activeJobs > 0 ? 'positive' : 'neutral'}`}>
              {activeJobs === 0 ? 'No active jobs' : activeJobs === 1 ? 'Ongoing service' : 'Active services'}
            </span>
          </div>

          {/* Total Spend */}
          <div className="stat-card clickable" onClick={() => onNavigate('receipts')}>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <p className="stat-label">Total Spend</p>
            <h3>₱{totalSpend.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</h3>
            <span className="stat-trend neutral">Lifetime service spend</span>
          </div>

          {/* My Vehicles */}
          <div className="stat-card clickable" onClick={() => onNavigate('vehicles')}>
            <div className="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 5v3h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <p className="stat-label">My Vehicles</p>
            <h3>{vehicles.length}</h3>
            <span className="stat-trend neutral">
              {vehicles.length === 0 ? 'No vehicles yet' : vehicles.length === 1 ? 'Registered vehicle' : 'Registered vehicles'}
            </span>
          </div>

        </div>{/* end kpi-grid */}

        {/* Recent Appointments section card */}
        <section className="section-card portal-dash-section">
          <div className="section-card-head">
            <div>
              <h2>Recent Appointments</h2>
              <p>Latest bookings and their status</p>
            </div>
            <button type="button" onClick={() => onNavigate('appointments')}>View All</button>
          </div>

          {recentRows.length === 0 ? (
            <div className="portal-dash-vehicles-empty">No appointments on record yet.</div>
          ) : (
            <div className="portal-stack">
              {recentRows.map((a) => (
                <div
                  className="portal-dash-vehicle-row is-clickable"
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  title="Click to view details"
                  onClick={() => setSelectedAppt(a)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedAppt(a)
                  }}
                >
                  <div className="portal-dash-vr-date">
                    {new Date(a.schedule_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="portal-dash-vr-service">{a.service_name || 'General Service'}</div>
                  <div className="portal-dash-vr-vehicle">
                    {a.plate_number}
                    <span>{a.make} {a.model}</span>
                  </div>
                  <div className="portal-dash-vr-status">
                    <span
                      className="portal-dash-vr-badge"
                      style={{ '--dot': STATUS_DOT[a.status] || '#64748b' }}
                    >
                      {a.status}
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="portal-dash-row-chevron">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>{/* end portal-dash-body */}

      {selectedAppt && (
        <ApptDetailModal
          appt={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onCancelled={markCancelled}
        />
      )}
    </div>
  )
}
