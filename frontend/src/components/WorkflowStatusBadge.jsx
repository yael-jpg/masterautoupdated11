/**
 * WorkflowStatusBadge
 * A color-coded badge for all workflow statuses across the system.
 * Usage: <WorkflowStatusBadge status="Approved" />
 */

const STATUS_STYLES = {
  // ── Quotation statuses ──────────────────────────────────────────────────────
  Draft:          { bg: '#e2e8f0', color: '#475569', label: 'Draft' },
  Pending:        { bg: '#e2e8f0', color: '#475569', label: 'Pending' },
  Sent:           { bg: 'rgba(148,163,184,0.14)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)', label: 'Sent' },
  Approved:       { bg: '#dcfce7', color: '#15803d', label: 'Approved' },
  'Not Approved': { bg: '#fee2e2', color: '#b91c1c', label: 'Not Approved' },

  // ── Scheduling (Appointment) statuses ──────────────────────────────────────
  Scheduled:            { bg: 'rgba(148,163,184,0.14)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)', label: 'Scheduled' },
  'Checked-In':         { bg: 'rgba(148,163,184,0.18)', color: '#b0bac8', border: '1px solid rgba(148,163,184,0.35)', label: 'Checked-In' },
  'Ready for Release':  { bg: '#d1fae5', color: '#065f46', label: 'Ready for Release' }, // emerald (#10b981)
  Paid:                 { bg: '#dcfce7', color: '#15803d', label: 'Paid' },         // green  (#059669)

  // ── Job Order statuses — colours mirror Scheduling equivalents ───────────
  'In Progress':  { bg: '#fef3c7', color: '#b45309', label: 'In Progress' },  // amber  (#f59e0b)
  Ongoing:        { bg: '#fef3c7', color: '#b45309', label: 'Ongoing' },       // legacy alias → same amber
  'For QA':       { bg: '#ffedd5', color: '#c2410c', label: 'For QA' },        // orange (#f97316)
  Completed:      { bg: 'rgba(100,116,139,0.14)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.35)', label: 'Completed' },     // dark slate pill
  Complete:       { bg: 'rgba(100,116,139,0.14)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.35)', label: 'Complete' },       // terminal history status — same dark pill
  Released:       { bg: 'rgba(148,163,184,0.14)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.3)', label: 'Released' },
  Cancelled:      { bg: '#fee2e2', color: '#b91c1c', label: 'Cancelled' },     // red    (#ef4444)

  // ── Payment statuses ────────────────────────────────────────────────────────
  PAID:             { bg: '#dcfce7', color: '#15803d', label: 'Paid' },
  PARTIALLY_PAID:   { bg: '#fef9c3', color: '#a16207', label: 'Partial' },
  PARTIAL:          { bg: '#fef9c3', color: '#a16207', label: 'Partial' },
  UNPAID:           { bg: '#fee2e2', color: '#b91c1c', label: 'Unpaid' },
  OVERPAID:         { bg: '#f3e8ff', color: '#7e22ce', label: 'Overpaid' },
  'WITH BALANCE':   { bg: '#fff7ed', color: '#c2410c', label: 'With Balance' },
  VOIDED:           { bg: '#f1f5f9', color: '#64748b', label: 'Voided' },
  Overdue:          { bg: '#fee2e2', color: '#b91c1c', label: 'Overdue' },

  // ── Commission statuses ─────────────────────────────────────────────────────
  payable:  { bg: '#fef9c3', color: '#a16207', label: 'Payable' },
  paid:     { bg: '#dcfce7', color: '#15803d', label: 'Paid' },

  // ── Inventory / stock statuses ──────────────────────────────────────────────
  ok:           { bg: '#dcfce7', color: '#15803d', label: 'In Stock' },
  low:          { bg: '#fef9c3', color: '#a16207', label: 'Low Stock' },
  out:          { bg: '#fee2e2', color: '#b91c1c', label: 'Out of Stock' },
  IN_STOCK:     { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)',   label: 'In Stock' },
  LOW_STOCK:    { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)',  label: 'Low Stock' },
  OUT_OF_STOCK: { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',   label: 'Out of Stock' },
}

const DEFAULT_STYLE = { bg: 'rgba(100,116,139,0.14)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.35)' }

export function WorkflowStatusBadge({ status, size = 'sm' }) {
  if (!status) return null
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE
  const label = style.label ?? status

  const padding  = size === 'lg' ? '5px 14px' : '3px 10px'
  const fontSize = size === 'lg' ? '13px'      : '12px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding,
        borderRadius: '999px',
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.03em',
        background: style.bg,
        color: style.color,
        border: style.border || 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

export { STATUS_STYLES }
