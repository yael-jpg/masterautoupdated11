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
          {isFull ? '● FULLY PAID' : '◐ PARTIAL / DOWNPAYMENT'}
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
  const [me, setMe] = useState(null)

  const derivedById = (() => {
    const byId = new Map()
    const byInvoice = new Map()

    for (const p of payments) {
      const key = p?.sale_reference_no || '—'
      const arr = byInvoice.get(key) || []
      arr.push(p)
      byInvoice.set(key, arr)
    }

    for (const [, invoicePayments] of byInvoice) {
      const sorted = invoicePayments
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

      let cumulativePaid = 0
      const invoiceTotal = sorted.reduce((mx, p) => Math.max(mx, Number(p?.total_amount) || 0), 0)
      for (const p of sorted) {
        cumulativePaid += Number(p?.amount) || 0
        if (p?.id != null) {
          byId.set(p.id, { cumulativePaid, invoiceTotal })
        }
      }
    }

    return byId
  })()

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const [rows, meData] = await Promise.all([
          portalGet('/payments'),
          portalGet('/me').catch(() => null),
        ])
        if (stopped) return
        setPayments(Array.isArray(rows) ? rows : [])
        if (meData) setMe(meData)
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

  const escapeHtml = (value) => {
    const s = String(value ?? '')
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  const formatMoney = (amount) => {
    const n = Number(amount) || 0
    return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const handlePrint = (payment) => {
    const invoiceRef = payment?.sale_reference_no || '—'
    const invoicePayments = payments
      .filter((p) => (p?.sale_reference_no || '—') === invoiceRef)
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    const invoiceTotal = Number(payment?.total_amount) || 0
    const totalPaid = Number(payment?.paid_total) || 0
    const isFullySettled = invoiceTotal > 0 && totalPaid >= invoiceTotal
    const printedAt = new Date()

    const displayCustomer =
      me?.full_name ||
      me?.fullName ||
      payment?.customer_name ||
      '—'

    const win = window.open('', '_blank', 'width=600,height=700')
    win.document.write(`
      <html>
        <head>
          <title>Receipt — ${escapeHtml(invoiceRef)}</title>
          <style>
            @page { margin: 14mm; }
            body {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
              padding: 0;
              margin: 0;
              color: #111;
              background: #fff;
            }
            .wrap { max-width: 520px; margin: 0 auto; padding: 24px 18px; }
            .title { text-align: center; font-weight: 800; letter-spacing: 0.08em; font-size: 20px; }
            .subtitle { text-align: center; margin-top: 6px; color: #444; font-size: 12px; }
            .rule { border: 0; border-top: 1px dashed #cfcfcf; margin: 18px 0; }

            .kv { display: grid; grid-template-columns: 120px 1fr; row-gap: 6px; column-gap: 10px; font-size: 13px; }
            .k { color: #111; }
            .v { text-align: right; }
            .v strong { font-weight: 800; }

            .section-title { margin-top: 18px; font-weight: 800; font-size: 13px; }
            .lines { margin-top: 10px; font-size: 13px; }
            .line { display: grid; grid-template-columns: 22px 1fr 120px; column-gap: 8px; align-items: baseline; padding: 8px 0; }
            .line-amount { text-align: right; }
            .line-ref { grid-column: 2 / 4; color: #777; font-size: 11px; margin-top: 2px; }

            .total-row { display: grid; grid-template-columns: 1fr 160px; margin-top: 8px; font-size: 14px; font-weight: 800; }
            .total-row .amt { text-align: right; }
            .settled { margin-top: 10px; text-align: center; font-size: 12.5px; font-weight: 800; color: #16a34a; }
            .thanks { margin-top: 18px; text-align: center; font-size: 12px; color: #333; }
            .printed { margin-top: 6px; text-align: center; font-size: 11px; color: #777; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="title">ACKNOWLEDGEMENT RECEIPT</div>
            <div class="subtitle">MasterAuto Service</div>

            <hr class="rule" />

            <div class="kv">
              <div class="k">Date:</div>
              <div class="v">${escapeHtml(new Date(payment.created_at).toLocaleDateString('en-PH'))}</div>

              <div class="k">Invoice:</div>
              <div class="v">${escapeHtml(invoiceRef)}</div>

              <div class="k">Customer:</div>
              <div class="v">${escapeHtml(displayCustomer)}</div>

              <div class="k">Invoice Total:</div>
              <div class="v"><strong>${escapeHtml(formatMoney(invoiceTotal))}</strong></div>
            </div>

            <hr class="rule" />

            <div class="section-title">Payment Breakdown (${invoicePayments.length} line${invoicePayments.length === 1 ? '' : 's'})</div>
            <div class="lines">
              ${invoicePayments.map((p, idx) => {
                const type = p?.payment_type || '—'
                const ref = p?.reference_no ? `Ref: ${p.reference_no}` : ''
                return `
                  <div>
                    <div class="line">
                      <div>${idx + 1}.</div>
                      <div>${escapeHtml(type)}</div>
                      <div class="line-amount">${escapeHtml(formatMoney(p?.amount))}</div>
                      ${ref ? `<div class="line-ref">${escapeHtml(ref)}</div>` : ''}
                    </div>
                  </div>
                `
              }).join('')}
            </div>

            <hr class="rule" />

            <div class="total-row">
              <div>TOTAL PAID:</div>
              <div class="amt">${escapeHtml(formatMoney(totalPaid))}</div>
            </div>
            ${isFullySettled ? `<div class="settled">✓ Fully Settled</div>` : ''}

            <hr class="rule" />

            <div class="thanks">Thank you for your payment!</div>
            <div class="printed">Printed: ${escapeHtml(printedAt.toLocaleString('en-PH'))}</div>
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
            const derived = p?.id != null ? derivedById.get(p.id) : null
            const paidTotal = derived ? derived.cumulativePaid : (Number(p.paid_total) || 0)
            const saleTotal = derived ? derived.invoiceTotal : (Number(p.total_amount) || 0)

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
