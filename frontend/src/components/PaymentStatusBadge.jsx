/**
 * PaymentStatusBadge
 * Displays color-coded financial status:
 *   UNPAID         → Red
 *   PARTIALLY_PAID → Orange  (replaces WITH DEPOSIT)
 *   PAID           → Green   (replaces SETTLED)
 *   OVERPAID       → Purple
 */

const PAYMENT_STATUS_CONFIG = {
  UNPAID:          { label: 'Unpaid',          color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.35)' },
  PARTIALLY_PAID:  { label: 'Partial',         color: '#f97316', bg: 'rgba(249,115,22,0.12)',   border: 'rgba(249,115,22,0.35)' },
  // Legacy aliases kept for rows that haven't been re-computed yet
  PARTIAL:         { label: 'Partial',         color: '#f97316', bg: 'rgba(249,115,22,0.12)',   border: 'rgba(249,115,22,0.35)' },
  'WITH DEPOSIT':  { label: 'Partial',         color: '#f97316', bg: 'rgba(249,115,22,0.12)',   border: 'rgba(249,115,22,0.35)' },
  PAID:            { label: 'Paid',            color: '#10b981', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.35)' },
  // Legacy alias
  SETTLED:         { label: 'Paid',            color: '#10b981', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.35)' },
  OVERPAID:        { label: 'Overpaid',        color: '#a0a8b8', bg: 'rgba(255,255,255,0.06)',   border: 'rgba(255,255,255,0.18)' },
}

export function PaymentStatusBadge({ status, balance, showBalance = false, size = 'sm' }) {
  const cfg = PAYMENT_STATUS_CONFIG[status] || PAYMENT_STATUS_CONFIG['UNPAID']
  const fontSize = size === 'sm' ? '0.78rem' : '0.88rem'
  const padding  = size === 'sm' ? '3px 10px' : '5px 14px'

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding,
          borderRadius: '999px',
          fontSize,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: cfg.color,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          textTransform: 'uppercase',
        }}
      >
        {cfg.label}
      </span>
      {showBalance && balance != null && Number(balance) > 0 && (
        <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600 }}>
          ₱{Number(balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
        </span>
      )}
    </span>
  )
}

export { PAYMENT_STATUS_CONFIG }
