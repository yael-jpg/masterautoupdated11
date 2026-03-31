import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'

function isFullySettled(paidTotal, totalAmount) {
  const total = Number(totalAmount) || 0
  const paid = Number(paidTotal) || 0
  return total > 0 && paid >= total
}

export function PortalReceipts() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('receipts')
  const [expandedInvoiceRef, setExpandedInvoiceRef] = useState(null)

  const allInvoices = (() => {
    const byInvoice = new Map()
    for (const p of payments) {
      const key = p?.sale_reference_no || '—'
      const arr = byInvoice.get(key) || []
      arr.push(p)
      byInvoice.set(key, arr)
    }

    const out = []
    for (const [invoiceRef, invoicePayments] of byInvoice.entries()) {
      const sorted = invoicePayments
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

      const invoiceTotal = sorted.reduce((mx, p) => Math.max(mx, Number(p?.total_amount) || 0), 0)
      const paidTotal = sorted.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0)
      const settled = isFullySettled(paidTotal, invoiceTotal)
      const lastPayment = sorted[sorted.length - 1] || null
      const settledAt = lastPayment?.created_at || null
      const lastActivityAt = lastPayment?.created_at || sorted[0]?.created_at || null

      out.push({
        invoiceRef,
        payments: sorted,
        invoiceTotal,
        paidTotal,
        remainingBalance: Math.max(0, invoiceTotal - paidTotal),
        settled,
        settledAt,
        lastActivityAt,
        service_package: lastPayment?.service_package || sorted[0]?.service_package || '—',
        plate_number: lastPayment?.plate_number || sorted[0]?.plate_number || '—',
        make: lastPayment?.make || sorted[0]?.make || null,
        model: lastPayment?.model || sorted[0]?.model || null,
      })
    }

    return out
      .filter((x) => Number(x.invoiceTotal || 0) > 0)
      .sort((a, b) => new Date((b.lastActivityAt || 0)) - new Date((a.lastActivityAt || 0)))
  })()

  const receiptInvoices = allInvoices.filter((x) => x.settled)
  const paymentInvoices = allInvoices.filter((x) => !x.settled)

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

  const baseRows = tab === 'payments' ? paymentInvoices : receiptInvoices
  const filtered = baseRows.filter((inv) => {
    const q = search.toLowerCase()
    return (
      !q ||
      (inv.invoiceRef || '').toLowerCase().includes(q) ||
      (inv.service_package || '').toLowerCase().includes(q) ||
      (inv.plate_number || '').toLowerCase().includes(q)
    )
  })

  const total = tab === 'payments'
    ? filtered.reduce((s, inv) => s + Number(inv.remainingBalance || 0), 0)
    : filtered.reduce((s, inv) => s + Number(inv.invoiceTotal || 0), 0)

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

  const handlePrint = (invoiceRef) => {
    const inv = allInvoices.find((x) => x.invoiceRef === invoiceRef)
    const invoicePayments = inv?.payments || []
    const invoiceTotal = Number(inv?.invoiceTotal) || 0
    const totalPaid = Number(inv?.paidTotal) || 0
    const isSettled = isFullySettled(totalPaid, invoiceTotal)
    const printedAt = new Date()

    const receiptDate = inv?.settledAt || inv?.lastActivityAt || invoicePayments[invoicePayments.length - 1]?.created_at || null
    const receiptDateDisplay = receiptDate
      ? new Date(receiptDate).toLocaleDateString('en-PH')
      : printedAt.toLocaleDateString('en-PH')

    const displayCustomer = me?.full_name || me?.fullName || '—'

    const win = window.open('', '_blank', 'width=600,height=700')
    if (!win) {
      window.alert('Popup blocked. Please allow popups to print the receipt.')
      return
    }

    win.document.open()
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
              <div class="v">${escapeHtml(receiptDateDisplay)}</div>

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
            ${isSettled ? `<div class="settled">✓ Fully Settled</div>` : ''}

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
        <h2>Receipts &amp; Payments</h2>
        <p>{tab === 'payments' ? 'Payment history for unsettled invoices.' : 'Receipt history for fully settled payments.'}</p>
      </div>

      <div className="portal-tabs">
        <button type="button" className={`portal-tab-btn ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>
          Payments
          <span className="portal-tab-count">{paymentInvoices.length}</span>
        </button>
        <button type="button" className={`portal-tab-btn ${tab === 'receipts' ? 'active' : ''}`} onClick={() => setTab('receipts')}>
          Receipts
          <span className="portal-tab-count">{receiptInvoices.length}</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="portal-toolbar">
        <input
          type="text"
          placeholder="Search by reference, service, or plate…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="portal-control"
        />
        <div className="portal-toolbar-total">
          {tab === 'payments' ? 'Outstanding: ' : 'Total: '}
          ₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="portal-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          <p>{tab === 'payments' ? 'No payments found' : 'No receipts found'}</p>
        </div>
      ) : (
        <div className="portal-stack">
          {filtered.map((inv) => {
            const isExpanded = tab === 'payments' && expandedInvoiceRef === inv.invoiceRef
            return (
              <div key={inv.invoiceRef} className="portal-receipt-card">
                {/* Col 1: Date/Time + Reference */}
                <div className="portal-receipt-col">
                  <div className="portal-receipt-date">
                    {tab === 'payments'
                      ? (inv.lastActivityAt ? fmtDate(inv.lastActivityAt) : '—')
                      : (inv.settledAt ? fmtDate(inv.settledAt) : '—')}
                  </div>
                  <div className="portal-receipt-time">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {tab === 'payments'
                      ? (inv.lastActivityAt ? fmtTime(inv.lastActivityAt) : '—')
                      : (inv.settledAt ? fmtTime(inv.settledAt) : '—')}
                  </div>
                  <div className="portal-receipt-ref">
                    {inv.invoiceRef || '—'}
                  </div>
                </div>

                {/* Col 2: Service + Vehicle + Deposit tag */}
                <div className="portal-receipt-col">
                  <div className="portal-receipt-service">
                    {inv.service_package || '—'}
                  </div>
                  <div className="portal-receipt-vehicle">
                    {inv.plate_number || '—'}{inv.make ? ` · ${inv.make}` : ''}{inv.model ? ` ${inv.model}` : ''}
                  </div>
                  <div className="portal-receipt-meta">
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: tab === 'payments' ? `#facc1518` : `#4ade8018`,
                      border: tab === 'payments' ? `1px solid #facc1540` : `1px solid #4ade8040`,
                      color: tab === 'payments' ? '#facc15' : '#4ade80',
                      letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>
                      ● {tab === 'payments' ? (inv.paidTotal > 0 ? 'PARTIAL / UNSETTLED' : 'UNPAID') : 'FULLY SETTLED'}
                    </span>
                    <span className="portal-receipt-meta-type">{inv.payments.length} payment{inv.payments.length === 1 ? '' : 's'}</span>
                  </div>
                </div>

                {/* Col 3: Payment status */}
                <div className="portal-receipt-col" style={{ gap: 6 }}>
                  <div className="portal-receipt-amount">
                    ₱{Number(inv.invoiceTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.45)' }}>
                    {tab === 'payments'
                      ? `Remaining ₱${Number(inv.remainingBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'Invoice total'}
                  </div>
                </div>

                {/* Col 4: Print */}
                <div className="portal-receipt-actions">
                  <button
                    onClick={() => handlePrint(inv.invoiceRef)}
                    className="portal-receipt-print-btn"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print
                  </button>
                </div>

                {tab === 'payments' && (
                  <div style={{ gridColumn: '1 / -1', marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => setExpandedInvoiceRef(isExpanded ? null : inv.invoiceRef)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'rgba(200,200,200,0.55)',
                        fontSize: 12,
                        fontWeight: 650,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        letterSpacing: '0.03em',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(200,200,200,0.90)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(200,200,200,0.55)')}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </button>

                    {isExpanded && (
                      <div style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
                          <span style={{ color: 'rgba(189,200,218,0.45)' }}>Paid:</span>
                          <span style={{ color: '#e2e8f2', fontWeight: 650 }}>
                            ₱{Number(inv.paidTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span style={{ color: 'rgba(189,200,218,0.35)' }}>·</span>
                          <span style={{ color: 'rgba(189,200,218,0.45)' }}>Remaining:</span>
                          <span style={{ color: '#e2e8f2', fontWeight: 650 }}>
                            ₱{Number(inv.remainingBalance || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span style={{ color: 'rgba(189,200,218,0.35)' }}>·</span>
                          <span style={{ color: 'rgba(189,200,218,0.45)' }}>Total:</span>
                          <span style={{ color: '#e2e8f2', fontWeight: 650 }}>
                            ₱{Number(inv.invoiceTotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div style={{ fontSize: 11, fontWeight: 750, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(200,200,200,0.45)' }}>
                          Payment Breakdown
                        </div>
                        {inv.payments.map((p, idx) => (
                          <div
                            key={p.id ?? `${inv.invoiceRef}-${idx}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              gap: 12,
                              padding: '10px 12px',
                              background: 'rgba(255,255,255,0.025)',
                              borderRadius: 8,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: 'rgba(226,232,242,0.88)', fontWeight: 650 }}>
                                {p.payment_type || 'Payment'}
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(189,200,218,0.45)', marginTop: 2 }}>
                                {p.created_at ? `${fmtDate(p.created_at)} · ${fmtTime(p.created_at)}` : '—'}
                                {p.reference_no ? ` · Ref: ${p.reference_no}` : ''}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 12, fontWeight: 750, color: 'rgba(200,200,200,0.78)', fontFamily: 'monospace' }}>
                                ₱{Number(p.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
