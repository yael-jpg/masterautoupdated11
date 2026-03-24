import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'
import { getServiceProcess } from '../../components/ServiceProcess'

// ── Job Order pipeline (driven by jo.status) ────────────────
const JO_STEPS = [
  { key: 'Pending',      label: 'Pending' },
  { key: 'In Progress',  label: 'In Progress' },
  { key: 'For QA',       label: 'QA Check' },
  { key: 'Completed',    label: 'Completed' },
  { key: 'Released',     label: 'Released ✓' },
]

function getJOStepIndex(status) {
  const idx = JO_STEPS.findIndex((s) => s.key === status)
  return idx >= 0 ? idx : 0
}

// ── Badge colours ────────────────────────────────────────────
const JO_STATUS_CLASS = {
  'Pending':     'badge badge-neutral',
  'In Progress': 'badge badge-info',
  'For QA':      'badge badge-info',
  'Completed':   'badge badge-success',
  'Released':    'badge badge-success',
  'Closed':      'badge badge-success',
  'Cancelled':   'badge badge-danger',
}

const Q_STATUS_CLASS = {
  'Draft':        'badge badge-neutral',
  'Pending':      'badge badge-warning',
  'Sent':         'badge badge-info',
  'Approved':     'badge badge-success',
  'Not Approved': 'badge badge-danger',
  'Cancelled':    'badge badge-danger',
  'WITH BALANCE': 'badge badge-warning',
}

const APPROVAL_MSG = {
  Approved:       { text: 'Quotation Approved — Work is authorized to proceed.', color: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.22)', icon: '✓' },
  'Not Approved': { text: 'Quotation Not Approved. Please contact the shop.', color: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.22)', icon: '✗' },
  Sent:           { text: 'Quotation sent — awaiting your approval. Please contact the shop to confirm.', color: 'rgba(99,179,237,0.08)', border: 'rgba(99,179,237,0.22)', icon: '📨' },
  Pending:        { text: 'Quotation is being prepared by the team.', color: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.22)', icon: '⏳' },
  Draft:          { text: 'Quotation is in draft state.', color: 'rgba(120,120,120,0.08)', border: 'rgba(120,120,120,0.18)', icon: '📝' },
}

// ── JO Progress stepper ──────────────────────────────────────
function JOStepper({ status }) {
  if (status === 'Cancelled') {
    return (
      <div className="portal-stepper-status">
        <span className="badge badge-danger">Cancelled</span>
        <span className="portal-stepper-status-msg portal-stepper-status-msg--danger">This job order has been cancelled.</span>
      </div>
    )
  }
  if (status === 'Closed' || status === 'Released') {
    return (
      <div className="portal-stepper-status">
        <span className="badge badge-success">Completed &amp; Released ✓</span>
        <span className="portal-stepper-status-msg portal-stepper-status-msg--success">All work has been completed and the vehicle released.</span>
      </div>
    )
  }

  const current = getJOStepIndex(status)
  return (
    <div className="portal-stepper-wrap">
      <div className="portal-stepper">
        {JO_STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <div key={step.key} className="portal-stepper-item">
              <div className={`portal-stepper-node${done ? ' done' : active ? ' active' : ''}`}>
                {done
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : <span>{i + 1}</span>
                }
              </div>
              <div className={`portal-stepper-label${active ? ' active' : done ? ' done' : ''}`}>{step.label}</div>
              {i < JO_STEPS.length - 1 && (
                <div className={`portal-stepper-line${done ? ' done' : ''}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Job Order card ───────────────────────────────────────────
function JobOrderCard({ job }) {
  const [open, setOpen] = useState(false)
  const joStatus = job.workflow_status || 'Pending'
  const badgeClass = JO_STATUS_CLASS[joStatus] || 'badge badge-neutral'
  const isDone = joStatus === 'Completed' || joStatus === 'Released' || joStatus === 'Closed'

  return (
    <div className={`portal-section portal-record-card ${isDone ? 'portal-record-card--done' : ''}`}>
      {/* Header row */}
      <div
        className="portal-record-head"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="portal-record-main">
          <div className="portal-record-toprow">
            <span className="portal-record-kind">
              Job Order
            </span>
            <span className="portal-record-ref">
              {job.reference_no}
            </span>
            {job.quotation_no && (
              <span className="portal-record-subref">
                / {job.quotation_no}
              </span>
            )}
            <span className={badgeClass}>{joStatus}</span>
          </div>
          <div className="portal-record-title">
            {job.service_package}
          </div>
          <div className="portal-record-meta">
            {[job.year, job.make, job.model].filter(Boolean).join(' ')}
            {job.plate_number ? ` · ${job.plate_number}` : ''}
            {' · '}{new Date(job.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
        <div className="portal-record-side">
          <div className="portal-record-amount">
            ₱{Number(job.total_amount).toLocaleString()}
          </div>
          <div className="portal-record-togglehint">
            {open ? '▲ Hide' : '▼ Details'}
          </div>
        </div>
      </div>

      {/* Progress stepper preview (always visible when collapsed) */}
      {!open && (
        <div className="portal-record-preview">
          <JOStepper status={joStatus} />
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div className="portal-record-body">
          {/* Stepper */}
          <JOStepper status={joStatus} />

          {/* Appointment schedule info */}
          {job.schedule_start && (
            <div className="portal-info-box portal-info-box--row portal-info-box--spaced">
              <div className="portal-info-item">
                <span className="portal-info-label">Schedule:</span>
                <span className="portal-info-value">
                  {new Date(job.schedule_start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {new Date(job.schedule_start).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  {job.schedule_end && (
                    <> — {new Date(job.schedule_end).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}</>
                  )}
                </span>
              </div>
              {job.installer_team && (
                <div className="portal-info-item">
                  <span className="portal-info-label">Team:</span>
                  <span className="portal-info-value">{job.installer_team}</span>
                </div>
              )}
            </div>
          )}

          {/* Service process description */}
          {getServiceProcess(job.service_package)}

          {/* Line items */}
          {(job.items || []).length > 0 && (
            <>
              <div className="portal-subhead portal-subhead--spaced">
                Services / Line Items
              </div>
              <div className="portal-table-wrap">
                <table className="portal-table">
                  <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {job.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.name}</td>
                        <td>{item.qty}</td>
                        <td>₱{Number(item.price).toLocaleString()}</td>
                        <td>₱{(Number(item.price) * Number(item.qty)).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="portal-table-total-row">
                      <td colSpan={3} className="portal-table-total-label">Total</td>
                      <td className="portal-table-total-value">
                        ₱{Number(job.total_amount).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Quotation card ───────────────────────────────────────────
function QuotationCard({ job }) {
  const [open, setOpen] = useState(false)
  const qStatus = job.quotation_approval_status || 'Pending'
  const badgeClass = Q_STATUS_CLASS[qStatus] || 'badge badge-neutral'
  const info = APPROVAL_MSG[qStatus] || APPROVAL_MSG.Pending
  const serviceCount = (job.items || []).length
  const isConverted = !!job.linked_job_order_no

  return (
    <div className={`portal-section portal-record-card ${isConverted ? 'portal-record-card--converted' : ''}`}>
      {/* Header */}
      <div
        className="portal-record-head"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="portal-record-main">
          <div className="portal-record-toprow">
            <span className="portal-record-kind portal-record-kind--muted">
              Quotation
            </span>
            <span className="portal-record-ref portal-record-ref--muted">
              {job.reference_no}
            </span>
            <span className={badgeClass}>{qStatus}</span>
          </div>

          {/* Vehicle + services summary row */}
          <div className="portal-record-summary">
            <div className="portal-record-summary-title">
              {job.plate_number && (
                <span className="portal-record-plate">{job.plate_number}</span>
              )}
              {[job.make, job.model, job.year].filter(Boolean).join(' ')}
            </div>
            {serviceCount > 0 && (
              <span className="portal-record-summary-meta">
                {serviceCount} service{serviceCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="portal-record-meta portal-record-meta--dim">
            {new Date(job.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>

        <div className="portal-record-side">
          <div className="portal-record-amount portal-record-amount--muted">
            ₱{Number(job.total_amount).toLocaleString()}
          </div>
          <div className="portal-record-togglehint">
            {open ? '▲ Hide' : '▼ Details'}
          </div>
        </div>
      </div>

      {/* Converted-to-JO notice (always visible if applicable) */}
      {isConverted && (
        <div className="portal-banner portal-banner--success">
          <span className="portal-banner-icon portal-banner-icon--sm">✓</span>
          <span>
            Converted to Job Order <span className="portal-record-ref">{job.linked_job_order_no}</span> — see Job Orders tab for progress.
          </span>
        </div>
      )}

      {/* Approval status banner (show when not yet a JO) */}
      {!isConverted && (
        <div className="portal-banner" style={{ background: info.color, borderColor: info.border }}>
          <span className="portal-banner-icon">{info.icon}</span>
          <span>{info.text}</span>
        </div>
      )}

      {/* Expanded */}
      {open && (
        <div className="portal-record-body">

          {/* Notes */}
          {job.notes && (
            <div className="portal-note-box">
              📝 {job.notes}
            </div>
          )}

          {/* Line items table */}
          {(job.items || []).length > 0 && (
            <>
              <div className="portal-subhead">
                Services Quoted
              </div>
              <div className="portal-table-wrap">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.name}</td>
                        <td>{item.qty}</td>
                        <td>₱{Number(item.price).toLocaleString()}</td>
                        <td>₱{(Number(item.price) * Number(item.qty)).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="portal-table-total-row">
                      <td colSpan={3} className="portal-table-total-label">Total</td>
                      <td className="portal-table-total-value portal-table-total-value--muted">
                        ₱{Number(job.total_amount).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export function PortalJobStatus() {
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('jobs')   // 'jobs' | 'quotations'
  const [joTab, setJoTab]     = useState('all')    // 'all' | 'active' | 'done'

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const rows = await portalGet('/job-orders')
        if (stopped) return
        setJobs(Array.isArray(rows) ? rows : [])
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

  if (loading) {
    return <div className="portal-loading">Loading…</div>
  }

  // Split by doc_type
  const jobOrders  = jobs.filter((j) => j.doc_type === 'JobOrder')
  const quotations = jobs.filter((j) => j.doc_type === 'Quotation')

  // JO sub-filters (use workflow_status — the jo.status column)
  const activeJOs = jobOrders.filter((j) => {
    const s = j.workflow_status
    return s !== 'Completed' && s !== 'Released' && s !== 'Closed' && s !== 'Cancelled'
  })
  const doneJOs = jobOrders.filter((j) => {
    const s = j.workflow_status
    return s === 'Completed' || s === 'Released' || s === 'Closed'
  })

  const joVisible = (joTab === 'active' ? activeJOs : joTab === 'done' ? doneJOs : jobOrders)

  const JO_TABS = [
    { key: 'all',    label: 'All',         count: jobOrders.length },
    { key: 'active', label: 'In Progress', count: activeJOs.length },
    { key: 'done',   label: 'Completed',   count: doneJOs.length },
  ]

  // Quotations needing attention
  const pendingQ = quotations.filter((q) => q.quotation_approval_status === 'Pending' || q.quotation_approval_status === 'Sent')

  return (
    <>
      <div className="portal-hero">
        <h2>Job Orders &amp; Quotations</h2>
        <p>Track the progress of your vehicle services and quotation approvals in real time.</p>
      </div>

      {/* Live alert strip */}
      {(activeJOs.length > 0 || pendingQ.length > 0) && (
        <div className="portal-alert-strip">
          {activeJOs.length > 0 && (
            <div className="portal-alert-pill portal-alert-pill--neutral">
              <span className="portal-alert-dot" />
              {activeJOs.length} job{activeJOs.length !== 1 ? 's' : ''} in progress
            </div>
          )}
          {pendingQ.length > 0 && (
            <div
              className="portal-alert-pill portal-alert-pill--warn portal-alert-pill--clickable"
              onClick={() => setSection('quotations')}
            >
              <span className="portal-alert-dot" />
              {pendingQ.length} quotation{pendingQ.length !== 1 ? 's' : ''} awaiting action →
            </div>
          )}
        </div>
      )}

      {/* ── Top-level section switcher ── */}
      <div className="portal-tabs portal-tabs--block">
        <button
          onClick={() => setSection('jobs')}
          className={`portal-tab-btn ${section === 'jobs' ? 'active' : ''}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Job Orders
          {jobOrders.length > 0 && (
            <span className="portal-tab-count">
              {jobOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSection('quotations')}
          className={`portal-tab-btn ${section === 'quotations' ? 'active' : ''}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Quotations
          {quotations.length > 0 && (
            <span className="portal-tab-count">
              {quotations.length}
            </span>
          )}
        </button>
      </div>

      {/* ── JOB ORDERS section ─────────────────────────────── */}
      {section === 'jobs' && (
        <>
          {/* Sub-tabs */}
          <div className="portal-tabs portal-tabs--block">
            {JO_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setJoTab(t.key)}
                className={`portal-tab-btn portal-tab-btn--sm ${joTab === t.key ? 'active' : ''}`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="portal-tab-count">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {joVisible.length === 0 ? (
            <div className="portal-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <p>No job orders in this category</p>
            </div>
          ) : (
            joVisible.map((job) => <JobOrderCard key={job.id} job={job} />)
          )}
        </>
      )}

      {/* ── QUOTATIONS section ──────────────────────────────── */}
      {section === 'quotations' && (
        <>
          {quotations.length === 0 ? (
            <div className="portal-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>No quotations found</p>
              <p style={{ fontSize: 12, marginTop: 6, color: 'rgba(189,200,218,0.30)' }}>
                When the shop creates a quotation for your vehicle, it will appear here.
              </p>
            </div>
          ) : (
            quotations.map((job) => <QuotationCard key={job.id} job={job} />)
          )}
        </>
      )}
    </>
  )
}
