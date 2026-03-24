import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'

function PaymentStatusBadge({ paidTotal, totalAmount }) {
  const total = Number(totalAmount) || 0
  const paid = Number(paidTotal) || 0
  if (total === 0) return null
  const pct = Math.min(100, Math.round((paid / total) * 100))
  const isFull = paid >= total
  const color = isFull ? '#4ade80' : '#facc15'
  const label = isFull ? 'Fully Paid' : 'Partial Payment'
  return (
    <div className="portal-paystatus">
      <div className="portal-paystatus-top">
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
          background: `${color}18`, border: `1px solid ${color}40`, color,
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
        }}>
          {isFull ? '● FULLY PAID' : '◐ PARTIAL PAID'}
        </span>
        <span className="portal-paystatus-pct">
          {pct}%
        </span>
      </div>
      <div className="portal-paystatus-bar">
        <div className="portal-paystatus-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="portal-paystatus-foot">
        ₱{paid.toLocaleString()} / ₱{total.toLocaleString()}
      </div>
    </div>
  )
}

export function PortalReceipts() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const rows = await portalGet('/payments')
        if (stopped) return
        setPayments(Array.isArray(rows) ? rows : [])
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

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase()
    return (
      !q ||
      (p.sale_reference_no || '').toLowerCase().includes(q) ||
      (p.service_package || '').toLowerCase().includes(q) ||
      (p.payment_type || '').toLowerCase().includes(q)
    )
  })

  const total = filtered.reduce((s, p) => s + Number(p.amount), 0)

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const fmtTime = (d) => new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })

  const handlePrint = (payment) => {
    const win = window.open('', '_blank', 'width=600,height=700')
    win.document.write(`
      <html>
        <head>
          <title>Receipt — ${payment.sale_reference}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .sub { color: #555; font-size: 13px; margin-bottom: 32px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { text-align: left; padding: 8px; border-bottom: 2px solid #111; font-size: 12px; text-transform: uppercase; }
            td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
            .total { text-align: right; font-weight: bold; font-size: 16px; margin-top: 16px; }
            .footer { margin-top: 40px; font-size: 11px; color: #888; }
            .tag { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:700; }
            .tag-dep { background:#fef9e7; color:#92400e; }
            .tag-set { background:#f0fdf4; color:#16a34a; }
          </style>
        </head>
        <body>
          <h1>MasterAuto Receipt</h1>
          <div class="sub">Reference: ${payment.sale_reference_no || '—'}</div>
          <table>
            <thead><tr><th>Description</th><th>Type</th><th>Ref#</th><th>Tag</th><th>Amount</th></tr></thead>
            <tbody>
              <tr>
                <td>${payment.service_package || '—'}</td>
                <td>${payment.payment_type}</td>
                <td>${payment.reference_no || '—'}</td>
                <td><span class="tag ${payment.is_deposit ? 'tag-dep' : 'tag-set'}">${payment.is_deposit ? 'Deposit' : 'Settled'}</span></td>
                <td>₱${Number(payment.amount).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <div class="total">This Payment: ₱${Number(payment.amount).toLocaleString()}</div>
          <div class="total" style="color:#555;font-size:13px;font-weight:400">Total Paid on Invoice: ₱${Number(payment.paid_total||0).toLocaleString()} / ₱${Number(payment.total_amount||0).toLocaleString()}</div>
          <div class="footer">
            <p>Vehicle: ${payment.plate_number || '—'} · ${payment.make || ''} ${payment.model || ''}</p>
            <p>Date: ${new Date(payment.created_at).toLocaleString('en-PH')}</p>
            <p>Thank you for trusting MasterAuto!</p>
          </div>
          <script>window.onload = () => { window.print(); }</script>
        </body>
      </html>
    `)
    win.document.close()
  }

  if (loading) {
    return <div style={{ color: 'rgba(189,200,218,0.45)', padding: 48, textAlign: 'center', fontSize: 13 }}>Loading…</div>
  }

  return (
    <>
      <div className="portal-hero">
        <h2>Receipts & Payments</h2>
        <p>View all your payment records and download receipts.</p>
      </div>

      {/* Toolbar */}
      <div className="portal-toolbar">
        <input
          type="text"
          placeholder="Search by reference, service, or method…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="portal-control"
        />
        <div className="portal-toolbar-total">
          Total: ₱{total.toLocaleString()}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="portal-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          <p>No payments found</p>
        </div>
      ) : (
        <div className="portal-stack">
          {filtered.map((p) => {
            const isDeposit = p.is_deposit
            const typeColor = isDeposit ? '#f59e0b' : '#4ade80'
            const typeLabel = isDeposit ? 'Deposit' : 'Settled'
            const paidTotal = Number(p.paid_total) || 0
            const saleTotal = Number(p.total_amount) || 0
            const isFullyPaid = saleTotal > 0 && paidTotal >= saleTotal

            return (
              <div key={p.id} className="portal-receipt-card">
                {/* Col 1: Date/Time + Reference */}
                <div className="portal-receipt-col">
                  <div className="portal-receipt-date">{fmtDate(p.created_at)}</div>
                  <div className="portal-receipt-time">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {fmtTime(p.created_at)}
                  </div>
                  <div className="portal-receipt-ref">
                    {p.sale_reference_no || '—'}
                  </div>
                </div>

                {/* Col 2: Service + Vehicle + Deposit tag */}
                <div className="portal-receipt-col">
                  <div className="portal-receipt-service">
                    {p.service_package || '—'}
                  </div>
                  <div className="portal-receipt-vehicle">
                    {p.plate_number || '—'}{p.make ? ` · ${p.make}` : ''}{p.model ? ` ${p.model}` : ''}
                  </div>
                  <div className="portal-receipt-meta">
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: `${typeColor}18`, border: `1px solid ${typeColor}40`, color: typeColor,
                      letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>● {typeLabel.toUpperCase()}</span>
                    <span className="portal-receipt-meta-type">{p.payment_type}</span>
                  </div>
                </div>

                {/* Col 3: Payment status */}
                <div className="portal-receipt-col" style={{ gap: 6 }}>
                  <div className="portal-receipt-amount">
                    ₱{Number(p.amount).toLocaleString()}
                  </div>
                  {saleTotal > 0 && (
                    <PaymentStatusBadge paidTotal={paidTotal} totalAmount={saleTotal} />
                  )}
                </div>

                {/* Col 4: Print */}
                <div className="portal-receipt-actions">
                  <button
                    onClick={() => handlePrint(p)}
                    className="portal-receipt-print-btn"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
