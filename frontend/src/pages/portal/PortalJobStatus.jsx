import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'
import { getServiceProcess } from '../../components/ServiceProcess'

function normalizeServiceCode(code) {
  const raw = String(code || '').trim()
  if (!raw) return ''
  return raw.replace(/^CAT-/i, '').toLowerCase()
}

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
function JobOrderCard({ job, materialsNotesByCode = {} }) {
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
                        <td>
                          <div>{item.name}</div>
                          {(() => {
                            const notes = materialsNotesByCode[normalizeServiceCode(item?.code)]
                            const clean = String(notes || '').trim()
                            return clean
                              ? <div className="portal-record-meta portal-record-meta--dim" style={{ marginTop: 2 }}>Materials: {clean}</div>
                              : null
                          })()}
                        </td>
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

// ── Main page ────────────────────────────────────────────────
export function PortalJobStatus() {
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [joTab, setJoTab]     = useState('all')    // 'all' | 'active' | 'done'

  const [materialsNotesByCode, setMaterialsNotesByCode] = useState({})

  useEffect(() => {
    let stopped = false
    portalGet('/services')
      .then((rows) => {
        if (stopped) return
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
      .catch(() => { /* non-blocking */ })
    return () => { stopped = true }
  }, [])

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

  return (
    <>
      <div className="portal-hero">
        <h2>Job Orders</h2>
        <p>Track the progress of your vehicle services in real time.</p>
      </div>

      {/* Live alert strip */}
      {activeJOs.length > 0 && (
        <div className="portal-alert-strip">
          {activeJOs.length > 0 && (
            <div className="portal-alert-pill portal-alert-pill--neutral">
              <span className="portal-alert-dot" />
              {activeJOs.length} job{activeJOs.length !== 1 ? 's' : ''} in progress
            </div>
          )}
        </div>
      )}

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
        joVisible.map((job) => <JobOrderCard key={job.id} job={job} materialsNotesByCode={materialsNotesByCode} />)
      )}
    </>
  )
}
