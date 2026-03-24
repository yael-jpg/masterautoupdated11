import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { apiDownload } from '../api/client'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PaymentStatusBadge } from '../components/PaymentStatusBadge'
import { OverpaymentResolutionModal } from '../components/OverpaymentResolutionModal'
import { SearchableSelect } from '../components/SearchableSelect'

export function PaymentsPage({ token, user }) {
  const isSuperAdmin = user?.role === 'SuperAdmin'
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [sales, setSales] = useState([])
  const [error, setError] = useState('')
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  })
  const [endOfDayData, setEndOfDayData] = useState(null)
  const [showReconciliation, setShowReconciliation] = useState(false)

  // ── Payment config from Settings ────────────────────────────────────────
  const [paymentConfig, setPaymentConfig] = useState({
    acceptedMethods: ['Cash', 'GCash', 'Bank Transfer', 'Check', 'Credit Card'],
    enablePartialPayments: true,
    minimumDownpaymentPercentage: 30,
    enableRefunds: true,
    refundEligibilityDays: 30,
    paymentDueDays: 30,
    enableOnlinePayment: false,
    requireDownpaymentBeforePrint: true,
  })

  useEffect(() => {
    apiGet('/config/category/payment', token)
      .then((entries) => {
        const get = (key) => entries.find((e) => e.key === key)?.value ?? null
        const parseMethods = (v) => {
          if (Array.isArray(v)) return v
          try { return JSON.parse(v || '[]') } catch { return ['Cash'] }
        }
        setPaymentConfig({
          acceptedMethods: parseMethods(get('accepted_payment_methods')),
          enablePartialPayments: get('enable_partial_payments') !== false && get('enable_partial_payments') !== 'false',
          minimumDownpaymentPercentage: parseFloat(get('minimum_down_payment_percentage') || '30'),
          enableRefunds: get('enable_refunds') !== false && get('enable_refunds') !== 'false',
          refundEligibilityDays: parseFloat(get('refund_eligibility_days') || '30'),
          paymentDueDays: parseFloat(get('payment_due_days') || '30'),
          enableOnlinePayment: get('enable_online_payment') === true || get('enable_online_payment') === 'true',
          requireDownpaymentBeforePrint: get('require_downpayment_before_print') !== false && get('require_downpayment_before_print') !== 'false',
        })
      })
      .catch(() => {})
  }, [token])

  // Overpayment resolution state
  const [overpaymentModal, setOverpaymentModal] = useState({
    isOpen: false,
    saleId: null,
    customerId: null,
    overpaidAmount: 0,
    invoiceRef: '',
  })
  const [unresolvedOverpayments, setUnresolvedOverpayments] = useState([])

  // Form Initial State
  const initialFormState = {
    quotationId: '',
  }
  const [form, setForm] = useState(initialFormState)
  const [paymentLines, setPaymentLines] = useState([])
  const [newPaymentLine, setNewPaymentLine] = useState({ amount: '', paymentType: 'Cash', referenceNo: '', isDeposit: false })

  // Keep default method in sync when config loads
  useEffect(() => {
    if (paymentConfig.acceptedMethods.length > 0 && !paymentConfig.acceptedMethods.includes(newPaymentLine.paymentType)) {
      setNewPaymentLine((prev) => ({ ...prev, paymentType: paymentConfig.acceptedMethods[0] }))
    }
  }, [paymentConfig.acceptedMethods])

  const handleCloseModal = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(initialFormState)
    setPaymentLines([])
    setNewPaymentLine({ amount: '', paymentType: 'Cash', referenceNo: '', isDeposit: false })
    setError('')
  }

  const handleOpenNewPaymentForm = () => {
    setShowForm(true)
    setEditingId(null)
    if (sales.length > 0) {
      setForm({ quotationId: sales[0].id })
    } else {
      setForm(initialFormState)
    }
    setPaymentLines([])
    setNewPaymentLine({ amount: '', paymentType: 'Cash', referenceNo: '', isDeposit: false })
    setError('')
  }

  function formatJoNoForDisplay(value) {
    const jo = String(value || '').trim()
    if (!jo) return ''
    if (/^JO-[A-Z]{3}-\d{3}-\d{4}$/i.test(jo)) return jo.toUpperCase()

    // Legacy pattern: JO-YYYY-NNNN -> JO-CBO-0YY-NNNN
    const legacy = jo.match(/^JO-(\d{4})-(\d{4})$/i)
    if (legacy) {
      const yearShort = legacy[1].slice(-3)
      return `JO-CBO-${yearShort}-${legacy[2]}`
    }

    return jo.toUpperCase()
  }

  const loadData = async (nextPage = page, nextSearch = search, tab = viewMode) => {
    // Keep existing logic
    try {
      const [paymentsResult, salesResult] = await Promise.all([
        apiGet('/payments', token, {
          page: nextPage,
          limit: pagination.limit,
          search: nextSearch,
          tab,
        }),
        apiGet('/quotations', token, { page: 1, limit: 200, status: 'Approved' }),
      ])
      const payments = paymentsResult.data // Assuming apiGet returns { data: [], pagination: {} }
      const salesData = salesResult.data || salesResult

      if (paymentsResult.pagination) {
        setPagination(paymentsResult.pagination)
        setPage(paymentsResult.pagination.page)
      }

      // Load unresolved overpayments for banner
      try {
        const ovResult = await apiGet('/overpayments', token)
        setUnresolvedOverpayments(Array.isArray(ovResult) ? ovResult : [])
      } catch (_) {
        setUnresolvedOverpayments([])
      }

      setRows(
        payments.map((row) => ({
          key: `sale-${row.sale_id}`,
          cells: [
            row.job_order_no
              ? <span key="jo" className="td-ref">{formatJoNoForDisplay(row.job_order_no)}</span>
              : <span key="jo" className="td-sub">—</span>,
            row.customer_name || row.sale_reference || '-',
            <span key="inv" style={{ color: '#e2e8f0', fontWeight: 600 }}>₱{Number(row.sale_total).toLocaleString()}</span>,
            <span key="paid" style={{ color: '#34d399', fontWeight: 600 }}>₱{Number(row.amount).toLocaleString()}</span>,
            (() => {
              const methods = (row.payment_methods || '').split(', ').map(m => m.trim()).filter(Boolean)
              if (!methods.length) return <span key="meth" style={{ color: 'rgba(189,200,218,0.4)' }}>-</span>
              return (
                <div key="meth" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {methods.map((m, i) => (
                    <span key={i} style={{
                      fontSize: '0.72rem',
                      padding: '2px 7px',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '999px',
                      color: '#aaaaaa',
                      whiteSpace: 'nowrap',
                    }}>{m}</span>
                  ))}
                </div>
              )
            })(),
            <PaymentStatusBadge key="ps" status={row.sale_payment_status || 'UNPAID'} balance={row.sale_outstanding} showBalance />,
          ],
          raw: row,
        }))
      )
      const unpaidSales = salesData
        .map(q => ({
          ...q,
          total_paid: q.total_paid || 0,
          outstanding_balance: q.outstanding_balance ?? q.total_amount,
          payment_status: q.payment_status || 'UNPAID',
        }))
        .filter(q => !['PAID', 'SETTLED', 'OVERPAID'].includes(q.payment_status))

      setSales(unpaidSales)
      setSelectedKeys(new Set())

      // Default to first quotation if not set
      if (!form.quotationId && unpaidSales.length > 0) {
        setForm((prev) => ({ ...prev, quotationId: unpaidSales[0].id }))
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (saleGroup) => {
    if (saleGroup._isPortal) { handlePortalEditOpen(saleGroup); return }
    // Load all payment lines for this sale
    setEditingId(saleGroup.sale_id)
    setForm({ quotationId: saleGroup.quotation_id || saleGroup.sale_id })
    setPaymentLines(
      (saleGroup.payments || []).map((p) => ({
        id: p.id,
        amount: p.amount,
        paymentType: p.payment_type,
        referenceNo: p.reference_no || '',
        isDeposit: p.is_deposit,
      }))
    )
    setShowForm(true)
  }

  const handleDelete = (saleGroup) => {
    pushToast('error', 'Payment records cannot be deleted. Contact a system administrator if a correction is needed.')
  }

  // ── Portal / Online Booking Down Payments ─────────────────────────────
  const [portalPayments, setPortalPayments] = useState([])
  useEffect(() => {
    apiGet('/payments/portal', token, search ? { search } : {})
      .then((rows) => setPortalPayments(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [token, search])

  const [portalEdit, setPortalEdit] = useState(null)
  const [portalEditForm, setPortalEditForm] = useState({ down_payment_status: 'pending' })
  const [portalLines, setPortalLines] = useState([])
  const [portalNewLine, setPortalNewLine] = useState({ amount: '', method: 'cash', ref: '' })
  const [portalEditError, setPortalEditError] = useState('')
  const [portalEditSaving, setPortalEditSaving] = useState(false)

  const visibleRows = rows

  const methodLabel = (m) => (
    { gcash: 'GCash', card: 'Credit/Debit Card', bank: 'Bank Transfer', cash: 'Pay on Arrival (Cash)' }[m] || (m || '—')
  )

  const isPortalPaid = (row) => {
    if (['PAID', 'SETTLED', 'OVERPAID'].includes(row.quotation_payment_status)) return true
    if (row.down_payment_method && row.down_payment_method !== 'cash') return true
    if ((row.down_payment_status || 'pending') === 'collected') return true
    return false
  }

  const buildPortalRow = (row) => ({
    key: `portal-${row.appointment_id}`,
    cells: [
      <span key="jo" className="td-sub">—</span>,
      row.customer_name,
      <span key="inv" style={{ color: '#e2e8f0', fontWeight: 600 }}>
        ₱{Number(row.down_payment_amount).toLocaleString()}
        <span style={{ fontSize: '0.7rem', color: 'rgba(189,200,218,0.35)', fontWeight: 400, marginLeft: 5 }}>🌐</span>
      </span>,
      <span key="paid" style={{ color: '#34d399', fontWeight: 600 }}>₱{Number(row.down_payment_amount).toLocaleString()}</span>,
      (() => {
        const label = methodLabel(row.down_payment_method)
        if (!label || label === '—') return <span key="meth" style={{ color: 'rgba(189,200,218,0.4)' }}>-</span>
        return <span key="meth" style={{ fontSize: '0.72rem', padding: '2px 7px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '999px', color: '#aaaaaa', whiteSpace: 'nowrap' }}>{label}</span>
      })(),
      (() => {
        if (row.quotation_payment_status) {
          return <PaymentStatusBadge key="ps" status={row.quotation_payment_status} balance={row.outstanding_balance} showBalance />
        }
        const paid = isPortalPaid(row)
        return <PaymentStatusBadge key="ps" status={paid ? 'PAID' : 'UNPAID'} balance={paid ? null : row.down_payment_amount} showBalance={!paid} />
      })(),
    ],
    raw: { ...row, _isPortal: true },
  })

  const combinedActiveRows = viewMode !== 'active' ? visibleRows : [
    ...visibleRows,
    ...portalPayments.filter((row) => !isPortalPaid(row)).map(buildPortalRow),
  ]

  const combinedHistoryRows = viewMode !== 'history' ? visibleRows : [
    ...visibleRows,
    ...portalPayments.filter((row) => isPortalPaid(row)).map(buildPortalRow),
  ]

  const handleToggleRow = (row, checked) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(row.key)
      } else {
        next.delete(row.key)
      }
      return next
    })
  }

  const handleToggleAll = (checked, visible) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      visible.forEach((row) => {
        if (checked) {
          next.add(row.key)
        } else {
          next.delete(row.key)
        }
      })
      return next
    })
  }

  const handleBulkDelete = () => {
    pushToast('error', 'Payment records cannot be deleted. Contact a system administrator if a correction is needed.')
  }

  const handleAddPaymentLine = () => {
    if (!newPaymentLine.amount || Number(newPaymentLine.amount) <= 0) {
      setError('Payment amount must be greater than zero')
      return
    }

    // Enforce partial payment policy
    if (!paymentConfig.enablePartialPayments) {
      const fin = getSelectedSaleFinancial()
      if (fin && Number(newPaymentLine.amount) < fin.balance) {
        setError('Partial payments are disabled. Please enter the full remaining balance.')
        return
      }
    }

    // Enforce minimum down payment percentage
    if (paymentConfig.minimumDownpaymentPercentage > 0 && paymentLines.length === 0) {
      const fin = getSelectedSaleFinancial()
      if (fin && fin.paid === 0) {
        const minRequired = (fin.total * paymentConfig.minimumDownpaymentPercentage) / 100
        if (Number(newPaymentLine.amount) < minRequired) {
          setError(`Minimum down payment is ${paymentConfig.minimumDownpaymentPercentage}% of the invoice total (₱${minRequired.toLocaleString('en-PH', { minimumFractionDigits: 2 })})`)
          return
        }
      }
    }

    // For Cash payments, auto-set reference to amount if empty
    let lineToAdd = { ...newPaymentLine, id: Math.random() }
    if (newPaymentLine.paymentType === 'Cash' && !newPaymentLine.referenceNo) {
      lineToAdd.referenceNo = newPaymentLine.amount
    }

    setPaymentLines([...paymentLines, lineToAdd])
    setNewPaymentLine({ amount: '', paymentType: paymentConfig.acceptedMethods[0] || 'Cash', referenceNo: '', isDeposit: false })
    setError('')
  }

  const handleRemovePaymentLine = (index) => {
    setPaymentLines(paymentLines.filter((_, i) => i !== index))
  }

  const calculateTotalPayment = () => {
    return paymentLines.reduce((sum, line) => sum + (Number(line.amount || 0)), 0)
  }

  useEffect(() => {
    loadData(1, search, viewMode).catch((loadError) => setError(loadError.message))
  }, [token, search, viewMode])

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      if (!form.quotationId) {
        setError('Please select a quotation')
        return
      }
      if (!paymentLines.length) {
        setError('Add at least one payment method')
        return
      }

      // Auto-determine deposit: if total payment doesn't cover the full outstanding balance, it's a deposit/downpayment
      const fin = getSelectedSaleFinancial()
      const sessionTotal = calculateTotalPayment()
      const autoIsDeposit = sessionTotal < fin.balance

      let paymentResponses = []

      if (editingId) {
        // Delete all existing payment lines for this sale, then recreate
        const saleGroup = rows.find((r) => r.raw.sale_id === editingId)?.raw
        const existingLines = saleGroup?.payments || []
        await Promise.all(existingLines.map((p) => apiDelete(`/payments/${p.id}`, token)))
        paymentResponses = await Promise.all(
          paymentLines.map(line =>
            apiPost('/payments', token, {
              quotationId: Number(form.quotationId),
              amount: Number(line.amount),
              paymentType: line.paymentType,
              referenceNo: line.referenceNo,
              isDeposit: autoIsDeposit,
            })
          )
        )
      } else {
        paymentResponses = await Promise.all(
          paymentLines.map(line =>
            apiPost('/payments', token, {
              quotationId: Number(form.quotationId),
              amount: Number(line.amount),
              paymentType: line.paymentType,
              referenceNo: line.referenceNo,
              isDeposit: autoIsDeposit,
            })
          )
        )
      }

      // Capture data for receipt before closing modal and clearing state
      const finishedSaleGroup = (() => {
        if (!fin) return null
        const baseGroup = editingId ? rows.find((r) => r.raw.sale_id === editingId)?.raw : null
        const q = sales.find(s => Number(s.id) === Number(form.quotationId))

        return {
          created_at: baseGroup?.created_at || new Date().toISOString(),
          sale_reference: baseGroup?.sale_reference || q?.quotation_no || `QT-${form.quotationId}`,
          customer_name: baseGroup?.customer_name || q?.customer_name || 'N/A',
          sale_total: fin.total,
          sale_outstanding: Math.max(0, fin.total - sessionTotal),
          payments: paymentLines.map(l => ({
            amount: Number(l.amount),
            payment_type: l.paymentType,
            reference_no: l.referenceNo,
            is_deposit: sessionTotal < fin.total && l.isDeposit ? true : (sessionTotal < fin.total)
          }))
        }
      })()

      handleCloseModal()
      await loadData(page, search)
      setError('')
      pushToast('success', editingId ? 'Payment updated successfully!' : 'Payment recorded successfully!')

      if (finishedSaleGroup) {
        handlePrintReceipt(finishedSaleGroup)
      }

      // Check if any payment triggered an excess (split was applied)
      const overpaymentHit = paymentResponses.find(r => r?.overpayment?.detected)
      if (overpaymentHit) {
        const ov = overpaymentHit.overpayment
        const quotation = sales.find(s => Number(s.id) === Number(form.quotationId))
        setOverpaymentModal({
          isOpen: true,
          saleId: Number(form.quotationId),
          customerId: quotation?.customer_id || null,
          // Use excess_amount — the part NOT applied to the invoice
          overpaidAmount: ov.overpaid_amount,
          invoiceRef: quotation?.quotation_no || `Quotation #${form.quotationId}`,
        })
      }
    } catch (createError) {
      setError(createError.message)
    }
  }

  const getPaymentTypeRefLabel = (paymentType) => {
    const labels = {
      'Cash': 'Cash Amount',
      'Credit Card': 'Card Slip #',
      'Debit Card': 'Card Slip #',
      'GCash': 'GCash Ref #',
      'GCash/Maya': 'GCash Ref #',
      'Maya': 'Maya Ref #',
      'PayMaya': 'Maya Ref #',
      'Bank Transfer': 'Bank Ref #',
      'Check': 'Check #',
    }
    return labels[paymentType] || 'Reference #'
  }

  const handlePrintReceipt = (saleGroup) => {
    const lines = saleGroup.payments || []
    const totalPaid = lines.reduce((s, p) => s + Number(p.amount), 0)
    const linesHtml = lines.map((p, i) => `
      <tr>
        <td style="padding: 4px 0;">${i + 1}. ${p.payment_type}</td>
        <td style="text-align: right; padding: 4px 0;">₱${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr><td style="font-size:11px; color:#888; padding-bottom:6px;" colspan="2">&nbsp;&nbsp;&nbsp;Ref: ${p.reference_no || '-'}${p.is_deposit ? ' &nbsp;<em>Deposit</em>' : ''}</td></tr>
    `).join('')
    const content = `
      <div style="font-family: monospace; padding: 20px; max-width: 400px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="margin: 0;">ACKNOWLEDGEMENT RECEIPT</h2>
          <p style="margin: 5px 0; color: #666;">MasterAuto Service</p>
        </div>
        <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
        <table style="width: 100%; font-size: 14px;">
          <tr><td>Date:</td><td style="text-align: right;">${new Date(saleGroup.created_at).toLocaleDateString()}</td></tr>
          <tr><td>Invoice:</td><td style="text-align: right;">${saleGroup.sale_reference || 'N/A'}</td></tr>
          <tr><td>Customer:</td><td style="text-align: right;">${saleGroup.customer_name || 'N/A'}</td></tr>
          <tr><td>Invoice Total:</td><td style="text-align: right;">₱${Number(saleGroup.sale_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
        <div style="font-weight: bold; font-size: 13px; margin-bottom: 8px;">Payment Breakdown (${lines.length} line${lines.length > 1 ? 's' : ''})</div>
        <table style="width: 100%; font-size: 14px;">${linesHtml}</table>
        <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;">
        <table style="width: 100%; font-size: 16px; font-weight: bold;">
          <tr><td>TOTAL PAID:</td><td style="text-align: right;">₱${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          ${Number(saleGroup.sale_outstanding) > 0 ? `<tr style="font-size:13px; font-weight:normal;"><td>Remaining Balance:</td><td style="text-align:right; color:#c0392b;">₱${Number(saleGroup.sale_outstanding).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>` : '<tr style="font-size:13px;"><td colspan="2" style="text-align:center; color:#27ae60;">\u2713 Fully Settled</td></tr>'}
        </table>
        <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
        <div style="text-align: center; font-size: 12px; color: #666;">
          <p style="margin: 5px 0;">Thank you for your payment!</p>
          <p style="margin: 5px 0;">Printed: ${new Date().toLocaleString()}</p>
        </div>
      </div>
    `
    const printWindow = window.open('', '', 'width=420,height=650')
    printWindow.document.write(content)
    printWindow.document.close()
    printWindow.print()
  }

  const getEndOfDaySummary = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [result, ovSummary] = await Promise.all([
        apiGet('/payments', token, { page: 1, limit: 1000, dateFrom: today, dateTo: today }),
        apiGet('/overpayments/summary', token, { date: today }),
      ])

      const saleGroups = result.data || []
      // Each row is a sale group; amount = SUM for that sale; payments = individual lines
      const allLines = saleGroups.flatMap(g => g.payments || [])
      const summary = {
        total: saleGroups.reduce((sum, g) => sum + Number(g.amount), 0),
        by_type: {},
        count: allLines.length,
        overpayments: ovSummary,
      }

      allLines.forEach(p => {
        const type = p.payment_type
        if (!summary.by_type[type]) summary.by_type[type] = 0
        summary.by_type[type] += Number(p.amount)
      })

      return summary
    } catch (err) {
      return null
    }
  }

  const getSelectedSaleBalance = () => {
    const sale = sales.find(s => s.id === Number(form.quotationId))
    if (!sale) return null
    return sale.outstanding_balance ?? sale.total_amount
  }

  const [availableCredit, setAvailableCredit] = useState(0)

  const getSelectedSaleFinancial = () => {
    const sale = sales.find(s => s.id === Number(form.quotationId))
    if (!sale) return null
    return {
      total:   Number(sale.total_amount || 0),
      paid:    Number(sale.total_paid || 0),
      // Round to 2 decimal places to avoid floating-point drift in comparisons
      balance: Math.round(Math.max(Number(sale.outstanding_balance ?? sale.total_amount ?? 0), 0) * 100) / 100,
      status:  sale.payment_status || 'UNPAID',
    }
  }

  // Fetch available store credit when selected quotation/customer changes
  useEffect(() => {
    const sale = sales.find(s => s.id === Number(form.quotationId))
    if (!sale?.customer_id) { setAvailableCredit(0); return }
    apiGet(`/overpayments/credits/${sale.customer_id}`, token)
      .then(r => setAvailableCredit(Number(r.available_balance || 0)))
      .catch(() => setAvailableCredit(0))
  }, [form.quotationId, sales, token])
  const handleExport = async () => {
    try {
      await apiDownload('/exports/report/sales?format=csv', token, `sales-report-${Date.now()}.csv`)
    } catch (e) {
      setError(e.message || 'Failed to download report')
    }
  }



  const portalSessionTotal = portalLines.reduce((s, l) => s + Number(l.amount || 0), 0)

  const handlePortalEditOpen = (row) => {
    setPortalEdit(row)
    setPortalEditForm({ down_payment_status: row.down_payment_status || 'pending' })
    // Seed with existing line so user sees current value
    setPortalLines(row.down_payment_amount > 0 ? [{
      id: 1,
      amount: row.down_payment_amount,
      method: row.down_payment_method || 'cash',
      ref:    row.down_payment_ref || '',
    }] : [])
    setPortalNewLine({ amount: '', method: 'cash', ref: '' })
    setPortalEditError('')
  }

  const handlePortalAddLine = () => {
    if (!portalNewLine.amount || Number(portalNewLine.amount) <= 0) {
      setPortalEditError('Amount must be greater than zero.')
      return
    }
    setPortalEditError('')
    setPortalLines((prev) => [...prev, { id: Date.now(), amount: portalNewLine.amount, method: portalNewLine.method, ref: portalNewLine.ref }])
    setPortalNewLine((p) => ({ ...p, amount: '', ref: '' }))
  }

  const handlePortalRemoveLine = (id) => setPortalLines((prev) => prev.filter((l) => l.id !== id))

  const handlePortalEditSave = async (e) => {
    e.preventDefault()
    setPortalEditError('')
    if (!portalLines.length) {
      setPortalEditError('Add at least one payment line.')
      return
    }
    const total = portalLines.reduce((s, l) => s + Number(l.amount || 0), 0)
    if (total <= 0) {
      setPortalEditError('Total must be greater than zero.')
      return
    }
    setPortalEditSaving(true)
    try {
      await apiPatch(`/payments/portal/${portalEdit.appointment_id}`, token, {
        down_payment_amount: total,
        down_payment_method: portalLines[0].method,
        down_payment_ref:    portalLines[0].ref,
        down_payment_status: portalEditForm.down_payment_status,
      })
      setPortalPayments((prev) => prev.map((r) =>
        r.appointment_id === portalEdit.appointment_id
          ? { ...r,
              down_payment_amount: total,
              down_payment_method: portalLines[0].method,
              down_payment_ref:    portalLines[0].ref,
              down_payment_status: portalEditForm.down_payment_status }
          : r
      ))
      pushToast('success', 'Portal payment updated.')
      setPortalEdit(null)
    } catch (err) {
      setPortalEditError(err.message || 'Failed to save.')
    } finally {
      setPortalEditSaving(false)
    }
  }

  return (
    <div className="page-grid">
      {/* ── Unresolved Overpayment Banner ──────────────────────────────── */}
      {unresolvedOverpayments.length > 0 && (
        <div
          style={{
            gridColumn: '1 / -1',
            background: 'rgba(255,255,255,0.05)',
            border: '1.5px solid rgba(255,255,255,0.14)',
            borderRadius: '12px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#c0c8d8', fontSize: '0.95rem' }}>
              {unresolvedOverpayments.length} Unresolved Overpayment{unresolvedOverpayments.length > 1 ? 's' : ''} Detected
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(189,200,218,0.6)', marginTop: '2px' }}>
              Cashier session cannot be closed until all overpayments are resolved.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {unresolvedOverpayments.slice(0, 3).map((op) => (
              <button
                key={op.sale_id}
                type="button"
                onClick={() =>
                  setOverpaymentModal({
                    isOpen: true,
                    saleId: op.sale_id,
                    customerId: op.customer_id,
                    overpaidAmount: op.overpaid_amount,
                    invoiceRef: op.reference_no,
                  })
                }
                style={{
                  padding: '6px 14px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '8px',
                  color: '#c0c8d8',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Resolve {op.reference_no} · ₱{Number(op.overpaid_amount).toLocaleString()}
              </button>
            ))}
            {unresolvedOverpayments.length > 3 && (
              <span style={{ color: 'rgba(189,200,218,0.5)', fontSize: '0.78rem', alignSelf: 'center' }}>
                +{unresolvedOverpayments.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      <SectionCard
        title="Payments & POS"
        subtitle="Cash, Credit Card, GCash/Maya, Bank Transfer with split-payment support"
        actionLabel={viewMode === 'active' ? (showForm ? 'Cancel payment' : '+ Record payment') : undefined}
        onActionClick={viewMode === 'active' ? () => {
           if (showForm) {
             handleCloseModal()
           } else {
             handleOpenNewPaymentForm()
           }
        } : undefined}
      >
        {/* ── Active / History / Portal tab switcher ── */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
          {[{ key: 'active', label: 'Active Payments' }, { key: 'history', label: 'History' }].map(({ key, label }) => {
            const isSelected = viewMode === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setViewMode(key)
                  setPage(1)
                  if (showForm) handleCloseModal()
                }}
                style={{
                  padding: '8px 22px',
                  border: 'none',
                  borderBottom: isSelected ? '2px solid #ffffff' : '2px solid transparent',
                  background: 'transparent',
                  color: isSelected ? '#ffffff' : 'rgba(189,200,218,0.5)',
                  fontWeight: isSelected ? 700 : 400,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                  outline: 'none',
                  letterSpacing: '0.02em',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="module-toolbar">
          <input
            type="search"
            placeholder="Search invoice, method, reference..."
            value={search}
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
          />
          <button
            type="button"
            className="btn-danger"
            onClick={handleBulkDelete}
            disabled={!isSuperAdmin || !selectedKeys.size}
            title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : undefined}
            style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
          >
            Delete Selected ({selectedKeys.size})
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSelectedKeys(new Set())}>
            Clear Selection
          </button>
          <button type="button" className="btn-secondary" onClick={handleExport} title="Export as CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </div>

        <>
        <DataTable
          headers={['JO No.', 'Customer', 'Invoice Total', 'Total Paid', 'Methods', 'Payment Status']}
          rows={viewMode === 'history' ? combinedHistoryRows : combinedActiveRows}
          selectable
          selectedKeys={selectedKeys}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onRowClick={handleEdit}
          rowActions={(saleGroup) => (
            <div className="row-actions">
              {!saleGroup._isPortal && (
                <button type="button" className="btn-icon" onClick={() => handlePrintReceipt(saleGroup)} title="Print Receipt" aria-label="Print Receipt">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </button>
              )}
              <button type="button" className="btn-icon" onClick={() => handleEdit(saleGroup)} title="Edit" aria-label="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              {!saleGroup._isPortal && (
                <button type="button" className="btn-icon action-danger" onClick={() => handleDelete(saleGroup)}
                  title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : 'Delete'}
                  disabled={!isSuperAdmin}
                  style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
                  aria-label="Delete">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          )}
        />

        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={(nextPage) => loadData(nextPage, search).catch((e) => setError(e.message))}
        />


        </>

        <Modal
          isOpen={showForm}
          onClose={handleCloseModal}
          title={editingId ? 'Edit Payment' : 'Record Payment'}
        >
          <form className="rp-form" onSubmit={handleSubmit}>

            {/* Quotation selector */}
            <div className="rp-field">
              <label className="rp-label">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Quotation
              </label>
              <SearchableSelect
                placeholder="Search quotation or customer…"
                value={String(form.quotationId ?? '')}
                onChange={(val) => setForm((prev) => ({ ...prev, quotationId: val }))}
                required
                options={sales.map((q) => ({
                  value: String(q.id),
                  label: q.quotation_no,
                  description: q.customer_name || `Customer #${q.customer_id}`,
                }))}
              />
            </div>

            {/* Invoice Summary */}
            {(() => {
              const fin = getSelectedSaleFinancial()
              if (!fin) return null
              return (
                <div className="rp-summary-card">
                  <div className="rp-summary-header">
                    <span className="rp-summary-title">Invoice Summary</span>
                    <PaymentStatusBadge status={fin.status} size="md" />
                  </div>
                  <div className="rp-summary-grid">
                    <div className="rp-summary-cell">
                      <span className="rp-summary-cell-label">Invoice Total</span>
                      <span className="rp-summary-cell-value">₱{fin.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="rp-summary-cell">
                      <span className="rp-summary-cell-label">Amount Paid</span>
                      <span className="rp-summary-cell-value paid">₱{fin.paid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="rp-summary-cell">
                      <span className="rp-summary-cell-label">Remaining</span>
                      <span className={`rp-summary-cell-value ${fin.balance > 0 ? 'remaining' : 'settled'}`}>
                        {fin.balance > 0 ? `₱${fin.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '✓ Settled'}
                      </span>
                    </div>
                  </div>
                  {availableCredit > 0 && (
                    <div className="rp-summary-footer">
                      <span className="rp-summary-footer-label">Available Store Credit</span>
                      <span className="rp-summary-footer-value">₱{availableCredit.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {paymentLines.length > 0 && (
                    <div className="rp-summary-footer">
                      <span className="rp-summary-footer-label">This session</span>
                      <span className="rp-summary-footer-value">
                        ₱{paymentLines.reduce((sum, l) => sum + Number(l.amount || 0), 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        &nbsp;·&nbsp;{paymentLines.length} method{paymentLines.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Overpayment warning */}
            {(() => {
              const fin = getSelectedSaleFinancial()
              const sessionTotal = calculateTotalPayment()
              const newLineAmt = Number(newPaymentLine.amount || 0)
              const projectedTotal = Math.round((sessionTotal + newLineAmt) * 100) / 100
              const balance = Math.round((fin?.balance ?? 0) * 100) / 100
              if (!fin || balance <= 0 || projectedTotal <= balance) return null
              const excess = (projectedTotal - balance).toFixed(2)
              return (
                <div className="rp-notice warning">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <div>
                    <div className="rp-notice-title">Payment exceeds remaining balance</div>
                    <div className="rp-notice-body">
                      Only <strong>₱{balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> will be applied.
                      Excess <strong>₱{Number(excess).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong> goes to Overpayment Resolution.
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Payment Lines — Split Payment */}
            <div className="rp-lines-card">
              <div className="rp-lines-input-row">
                <div className="rp-field sm">
                  <label className="rp-label">Amount</label>
                  <input
                    className="rp-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={newPaymentLine.amount}
                    onChange={(e) => setNewPaymentLine({ ...newPaymentLine, amount: e.target.value })}
                  />
                </div>
                <div className="rp-field sm">
                  <label className="rp-label">Method</label>
                  <select
                    className="rp-select"
                    value={newPaymentLine.paymentType}
                    onChange={(e) => setNewPaymentLine({ ...newPaymentLine, paymentType: e.target.value })}
                  >
                    {paymentConfig.acceptedMethods.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="rp-field sm">
                  <label className="rp-label">{getPaymentTypeRefLabel(newPaymentLine.paymentType)}</label>
                  <input
                    className="rp-input"
                    placeholder={getPaymentTypeRefLabel(newPaymentLine.paymentType)}
                    value={newPaymentLine.referenceNo}
                    onChange={(e) => setNewPaymentLine({ ...newPaymentLine, referenceNo: e.target.value })}
                  />
                </div>
                <button type="button" className="rp-add-btn" onClick={handleAddPaymentLine}>
                  + Add
                </button>
              </div>

              {paymentLines.length > 0 && (
                <div className="rp-lines-list">
                  {paymentLines.map((line, idx) => (
                    <div key={line.id} className="rp-line-row">
                      <span className="rp-line-amount">₱{Number(line.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      <span className="rp-line-method">{line.paymentType}</span>
                      <span className="rp-line-ref">{line.referenceNo || '—'}</span>
                      <button
                        type="button"
                        className="rp-remove-btn"
                        onClick={() => handleRemovePaymentLine(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="rp-lines-total">
                    <span>Session Total</span>
                    <strong>₱{Number(calculateTotalPayment()).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Policy notices */}
            {!paymentConfig.enablePartialPayments && (
              <div className="rp-notice danger">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                <div>
                  <span className="rp-notice-title">Partial payments disabled.</span>
                  {' '}Each entry must cover the full remaining balance.
                </div>
              </div>
            )}
            {paymentConfig.enablePartialPayments && paymentConfig.minimumDownpaymentPercentage > 0 && (
              <div className="rp-notice info">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  Minimum down payment: <strong>{paymentConfig.minimumDownpaymentPercentage}%</strong> of invoice total required on first payment.
                </div>
              </div>
            )}
            {paymentConfig.enableRefunds && (
              <div className="rp-notice neutral">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a0a8b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
                <div>
                  <strong>Refund Policy:</strong> Eligible within {paymentConfig.refundEligibilityDays} days of payment
                </div>
              </div>
            )}

            <div className="vf-form-actions">
              <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const saleGroup = rows.find(r => r.raw.sale_id === editingId)?.raw
                    if (saleGroup) handlePrintReceipt(saleGroup)
                  }}
                >
                  🖨 Print Receipt
                </button>
              )}
              <button type="submit" className="vf-submit">
                {editingId ? '✓ Update Payment' : '✓ Record Payment'}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
          variant={confirmConfig.variant}
        />
        {error ? <p className="page-error">{error}</p> : null}

        {/* ── Portal payment edit modal ── */}
        <Modal
          isOpen={!!portalEdit}
          onClose={() => setPortalEdit(null)}
          title="Edit Payment"
        >
          {portalEdit && (
            <form className="rp-form" onSubmit={handlePortalEditSave}>

              {/* Booking Reference — mirrors Quotation field */}
              <div className="rp-field">
                <label className="rp-label">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Booking Reference
                </label>
                <div className="rp-input" style={{ opacity: 0.65, cursor: 'default', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{portalEdit.reference}</span>
                  <span style={{ color: 'rgba(189,200,218,0.45)', fontSize: '0.82rem' }}>{portalEdit.customer_name}{portalEdit.plate_number ? ` · ${portalEdit.plate_number}` : ''}</span>
                </div>
              </div>

              {/* Invoice Summary card */}
              {(() => {
                const isCollected = (portalEditForm.down_payment_status || 'pending') === 'collected'
                const total  = portalSessionTotal
                const paid   = isCollected ? total : 0
                const remaining = total - paid
                return (
                  <div className="rp-summary-card">
                    <div className="rp-summary-header">
                      <span className="rp-summary-title">Down Payment Summary</span>
                      <PaymentStatusBadge status={isCollected ? 'PAID' : 'UNPAID'} size="md" />
                    </div>
                    <div className="rp-summary-grid">
                      <div className="rp-summary-cell">
                        <span className="rp-summary-cell-label">Down Payment</span>
                        <span className="rp-summary-cell-value">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="rp-summary-cell">
                        <span className="rp-summary-cell-label">Amount Paid</span>
                        <span className="rp-summary-cell-value paid">₱{paid.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="rp-summary-cell">
                        <span className="rp-summary-cell-label">Remaining</span>
                        <span className={`rp-summary-cell-value ${remaining > 0 ? 'remaining' : 'settled'}`}>
                          {remaining > 0 ? `₱${remaining.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '✓ Settled'}
                        </span>
                      </div>
                    </div>
                    {(portalEdit.service_name || portalEdit.appointment_status) && (
                      <div className="rp-summary-footer">
                        <span className="rp-summary-footer-label">This session</span>
                        <span className="rp-summary-footer-value">
                          ₱{portalSessionTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}&nbsp;·&nbsp;{portalLines.length} method{portalLines.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Payment Lines card */}
              <div className="rp-lines-card">
                <div className="rp-lines-input-row">
                  <div className="rp-field sm">
                    <label className="rp-label">Amount</label>
                    <input
                      className="rp-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={portalNewLine.amount}
                      onChange={(e) => setPortalNewLine((p) => ({ ...p, amount: e.target.value }))}
                    />
                  </div>
                  <div className="rp-field sm">
                    <label className="rp-label">Method</label>
                    <select
                      className="rp-select"
                      value={portalNewLine.method}
                      onChange={(e) => setPortalNewLine((p) => ({ ...p, method: e.target.value }))}
                    >
                      <option value="cash">Cash</option>
                      <option value="gcash">GCash</option>
                      <option value="card">Credit/Debit Card</option>
                      <option value="bank">Bank Transfer</option>
                    </select>
                  </div>
                  <div className="rp-field sm">
                    <label className="rp-label">{portalNewLine.method === 'cash' ? 'Cash Amount' : portalNewLine.method === 'gcash' ? 'GCash Ref #' : portalNewLine.method === 'card' ? 'Card Slip #' : 'Bank Ref #'}</label>
                    <input
                      className="rp-input"
                      placeholder={portalNewLine.method === 'cash' ? 'Cash Amount' : 'Reference #'}
                      value={portalNewLine.ref}
                      onChange={(e) => setPortalNewLine((p) => ({ ...p, ref: e.target.value }))}
                    />
                  </div>
                  <button type="button" className="rp-add-btn" onClick={handlePortalAddLine}>
                    + Add
                  </button>
                </div>

                {portalLines.length > 0 && (
                  <div className="rp-lines-list">
                    {portalLines.map((line) => (
                      <div key={line.id} className="rp-line-row">
                        <span className="rp-line-amount">₱{Number(line.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                        <span className="rp-line-method">{methodLabel(line.method)}</span>
                        <span className="rp-line-ref">{line.ref || '—'}</span>
                        <button type="button" className="rp-remove-btn" onClick={() => handlePortalRemoveLine(line.id)}>✕</button>
                      </div>
                    ))}
                    <div className="rp-lines-total">
                      <span>Session Total</span>
                      <strong>₱{portalSessionTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Mark as Collected notice */}
              <div
                className={`rp-notice ${portalEditForm.down_payment_status === 'collected' ? 'info' : 'neutral'}`}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setPortalEditForm((p) => ({ ...p, down_payment_status: p.down_payment_status === 'collected' ? 'pending' : 'collected' }))}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={portalEditForm.down_payment_status === 'collected' ? '#34d399' : '#a0a8b8'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {portalEditForm.down_payment_status === 'collected'
                    ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                    : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                  }
                </svg>
                <div>
                  {portalEditForm.down_payment_status === 'collected'
                    ? <><span className="rp-notice-title" style={{ color: '#34d399' }}>Marked as Collected.</span>{' '}Down payment has been received from the customer.</>
                    : <><strong>Mark as Collected:</strong>{' '}Click here to confirm the down payment was received.</>
                  }
                </div>
              </div>

              {/* Appointment info notice */}
              <div className="rp-notice neutral">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a0a8b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <div>
                  <strong>Appointment:</strong>{' '}{portalEdit.appointment_status}{portalEdit.service_name ? ` · ${portalEdit.service_name}` : ''}
                </div>
              </div>

              {portalEditError && <p className="page-error" style={{ marginTop: 4 }}>{portalEditError}</p>}

              <div className="vf-form-actions">
                <button type="button" className="btn-secondary" onClick={() => setPortalEdit(null)}>Cancel</button>
                <button type="submit" className="vf-submit" disabled={portalEditSaving}>
                  {portalEditSaving ? 'Saving…' : '✓ Update Payment'}
                </button>
              </div>
            </form>
          )}
        </Modal>

      </SectionCard>

      <OverpaymentResolutionModal
        isOpen={overpaymentModal.isOpen}
        token={token}
        saleId={overpaymentModal.saleId}
        customerId={overpaymentModal.customerId}
        overpaidAmount={overpaymentModal.overpaidAmount}
        invoiceRef={overpaymentModal.invoiceRef}
        onResolved={async () => {
          setOverpaymentModal(prev => ({ ...prev, isOpen: false }))
          await loadData(page, search)
        }}
        onClose={() => setOverpaymentModal(prev => ({ ...prev, isOpen: false }))}
      />

      <section className="quick-panels">
        <article>
          <h3>Receipt Output</h3>
          <p>Official Receipt / Acknowledgement print and PDF archive.</p>
          <p style={{ fontSize: '12px', color: 'rgba(189,200,218,0.6)', marginTop: '8px' }}>Each payment transaction generates a system receipt. Click "Receipt" button in table to print.</p>
        </article>
        <article>
          <h3>End-of-Day Reconciliation</h3>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={async () => {
              // Check for unresolved overpayments before generating summary
              try {
                const sessionCheck = await apiGet('/overpayments/check-session', token)
                if (!sessionCheck.can_close_session) {
                  setConfirmConfig({
                    isOpen: true,
                    title: 'Unresolved Overpayments',
                    message: sessionCheck.message + ' Please resolve all overpayments first.',
                    variant: 'danger',
                    onConfirm: () => {},
                  })
                  return
                }
              } catch (_) { /* non-blocking */ }
              const data = await getEndOfDaySummary()
              setEndOfDayData(data)
              setShowReconciliation(true)
            }}
            style={{ marginTop: '8px', marginBottom: '12px' }}
          >
            Generate Today's Summary
          </button>
          {endOfDayData && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ fontSize: '12px', color: 'rgba(189,200,218,0.7)', marginBottom: '8px' }}>Today's Summary:</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#aaaaaa', marginBottom: '8px' }}>
                ₱{Number(endOfDayData.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(189,200,218,0.7)' }}>
                {endOfDayData.count} transaction{endOfDayData.count !== 1 ? 's' : ''} recorded
              </div>
              {Object.keys(endOfDayData.by_type).length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: 'rgba(189,200,218,0.8)' }}>By Method:</div>
                  {Object.entries(endOfDayData.by_type).map(([type, amount]) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(189,200,218,0.6)', fontSize: '11px', marginBottom: '2px' }}>
                      <span>{type}:</span>
                      <span>₱{Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Overpayment Report Section */}
              {endOfDayData.overpayments && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '12px' }}>
                  <div style={{ fontWeight: '700', marginBottom: '6px', color: '#c0c8d8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overpayment Report:</div>
                  {[
                    { label: 'Overpayments received', value: endOfDayData.overpayments.overpayments_collected?.total, color: '#c0c8d8' },
                    { label: 'Refunds issued', value: endOfDayData.overpayments.refunds_issued?.total, color: '#fca5a5' },
                    { label: 'Credits created', value: endOfDayData.overpayments.credits_created?.total, color: '#a0a8b8' },
                    { label: 'Credits used', value: endOfDayData.overpayments.credits_used?.total, color: '#6ee7b7' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(189,200,218,0.6)', fontSize: '11px', marginBottom: '2px' }}>
                      <span>{label}:</span>
                      <span style={{ color, fontWeight: 600 }}>₱{Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const ov = endOfDayData.overpayments || {}
                  const ovSection = ov.overpayments_collected
                    ? `<hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">
                       <div style="font-weight: bold; margin-bottom: 8px;">OVERPAYMENT REPORT</div>
                       <table style="width: 100%; font-size: 13px;">
                         <tr><td>Overpayments received:</td><td style="text-align:right;">₱${Number(ov.overpayments_collected.total||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
                         <tr><td>Refunds issued:</td><td style="text-align:right;">₱${Number(ov.refunds_issued?.total||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
                         <tr><td>Credits created:</td><td style="text-align:right;">₱${Number(ov.credits_created?.total||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
                         <tr><td>Credits used:</td><td style="text-align:right;">₱${Number(ov.credits_used?.total||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td></tr>
                       </table>`
                    : ''
                  const content = `
                    <div style="font-family: monospace; padding: 20px; max-width: 500px; margin: 0 auto;">
                      <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;">END-OF-DAY SUMMARY</h2>
                        <p style="margin: 5px 0; color: #666;">MasterAuto Service</p>
                        <p style="margin: 5px 0; color: #666; font-size: 12px;">${new Date().toLocaleDateString()}</p>
                      </div>

                      <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">

                      <table style="width: 100%; font-size: 14px; margin-bottom: 15px;">
                        <tr style="font-weight: bold;">
                          <td>Payment Method</td>
                          <td style="text-align: right;">Amount</td>
                        </tr>
                        <tr style="border-top: 1px dashed #ccc;">
                        ${Object.entries(endOfDayData.by_type).map(([type, amount]) => `
                          <tr>
                            <td>${type}</td>
                            <td style="text-align: right;">₱${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        `).join('')}
                        </tr>
                      </table>

                      <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;">

                      <table style="width: 100%; font-size: 16px; font-weight: bold;">
                        <tr>
                          <td>TOTAL COLLECTED:</td>
                          <td style="text-align: right;">₱${Number(endOfDayData.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        </tr>
                        <tr>
                          <td>Transaction Count:</td>
                          <td style="text-align: right;">${endOfDayData.count}</td>
                        </tr>
                      </table>

                      ${ovSection}

                      <hr style="border: none; border-top: 1px dashed #ccc; margin: 15px 0;">

                      <div style="text-align: center; font-size: 12px; color: #666;">
                        <p style="margin: 5px 0;">Generated: ${new Date().toLocaleString()}</p>
                        <p style="margin: 5px 0;">For reconciliation purposes only.</p>
                      </div>
                    </div>
                  `
                  const printWindow = window.open('', '', 'width=550,height=700')
                  printWindow.document.write(content)
                  printWindow.document.close()
                  printWindow.print()
                }}
                style={{ marginTop: '8px', width: '100%', padding: '8px' }}
              >
                Print Summary
              </button>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
