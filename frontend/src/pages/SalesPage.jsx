import { useEffect, useState } from 'react'
import { apiDelete, apiDownload, apiGet, apiPatch } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { ConfirmModal } from '../components/ConfirmModal'
import { SalesReports } from '../components/SalesReports'
import { SalesReportModal } from '../components/SalesReportModal'
import { PaymentStatusBadge } from '../components/PaymentStatusBadge'
import '../components/SalesReports.css'

function StatCard({ label, value, sub, color = '#a0a8b8', icon }) {
  return (
    <div className="sp-stat-card">
      <div className="sp-stat-bar" style={{ background: color }} />
      <div className="sp-stat-header">
        <span className="sp-stat-label">{label}</span>
        {icon && <span className="sp-stat-icon">{icon}</span>}
      </div>
      <div className="sp-stat-value" style={{ color }}>{value}</div>
      {sub && <div className="sp-stat-sub">{sub}</div>}
    </div>
  )
}

export function SalesPage({ token }) {
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [error, setError] = useState('')
  const [showReportModal, setShowReportModal] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const loadData = async (
    nextPage = page,
    nextSearch = search,
    nextStatus = statusFilter,
    nextSortBy = sortBy,
    nextSortDir = sortDir,
    nextDateFrom = dateFrom,
    nextDateTo = dateTo,
  ) => {
    const PAGE_LIMIT = 10

    // Fetch both sales + quotations in parallel (all records, merge client-side)
    const [salesResult, quotResult] = await Promise.all([
      apiGet('/sales',      token, { page: 1, limit: 2000, sortBy: 'createdAt', sortDir: 'desc' }),
      apiGet('/quotations', token, { page: 1, limit: 2000 }),
    ])

    // Normalize quotation fields to match sales shape
    const normalizeQuot = (q) => {
      let allServices = '-'
      try {
        const arr = typeof q.services === 'string' ? JSON.parse(q.services) : (q.services || [])
        allServices = arr.map(s => s.name || s.service_name || s.label || '').filter(Boolean).join(' | ') || '-'
      } catch (_) {}
      return {
        ...q,
        reference_no: q.quotation_no,
        job_order_no: q.job_order_no,
        workflow_status: q.status,
        all_services: allServices,
        doc_type: 'Quotation',
        is_locked: false,
      }
    }

    const allRecords = [
      ...(salesResult.data || []),
      ...(quotResult.data  || []).map(normalizeQuot),
    ]

    // Client-side filtering
    const sl = nextSearch.toLowerCase()
    let filtered = allRecords.filter(r => {
      if (nextSearch && !(
        (r.reference_no  || '').toLowerCase().includes(sl) ||
        (r.job_order_no  || '').toLowerCase().includes(sl) ||
        (r.customer_name || '').toLowerCase().includes(sl) ||
        (r.all_services  || '').toLowerCase().includes(sl)
      )) return false
      if (nextStatus && r.workflow_status !== nextStatus) return false
      if (nextDateFrom && new Date(r.created_at) < new Date(nextDateFrom)) return false
      if (nextDateTo   && new Date(r.created_at) > new Date(nextDateTo + 'T23:59:59')) return false
      return true
    })

    // Client-side sorting
    filtered.sort((a, b) => {
      let av, bv
      if      (nextSortBy === 'amount')    { av = Number(a.total_amount  || 0);  bv = Number(b.total_amount  || 0) }
      else if (nextSortBy === 'status')    { av = a.workflow_status || '';       bv = b.workflow_status || '' }
      else if (nextSortBy === 'reference') { av = a.reference_no   || '';       bv = b.reference_no   || '' }
      else if (nextSortBy === 'customer')  { av = a.customer_name  || '';       bv = b.customer_name  || '' }
      else                                 { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime() }
      if (nextSortDir === 'asc') return av > bv ? 1 : av < bv ? -1 : 0
      return av < bv ? 1 : av > bv ? -1 : 0
    })

    // Client-side pagination
    const total      = filtered.length
    const totalPages = Math.max(Math.ceil(total / PAGE_LIMIT), 1)
    const realPage   = Math.min(nextPage, totalPages)
    const offset     = (realPage - 1) * PAGE_LIMIT
    const pageRows   = filtered.slice(offset, offset + PAGE_LIMIT)

    setPagination({ page: realPage, totalPages, total, limit: PAGE_LIMIT })
    setPage(realPage)
    setRows(
      pageRows.map((sale) => ({
        key: `txn-${sale.doc_type || 'sale'}-${sale.id}`,
        cells: [
          sale.reference_no,
          sale.customer_name,
          (() => {
            const serviceStr = sale.all_services || sale.service_package || '-'
            const services = serviceStr.split(' | ').map(s => s.trim()).filter(Boolean)
            if (services.length <= 1) return services[0] || '-'
            return (
              <div key="svc" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {services.map((svc, i) => (
                  <span key={i} style={{
                    fontSize: '0.72rem', padding: '2px 7px',
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '999px', color: '#aaaaaa', whiteSpace: 'nowrap',
                  }}>{svc}</span>
                ))}
              </div>
            )
          })(),
          `${String.fromCharCode(8369)}${Number(sale.total_amount).toLocaleString()}`,
          <span key="status" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {sale.workflow_status}
            {sale.is_locked && (
              <span title="Invoice locked" style={{
                color: '#10b981', fontSize: '0.7rem', background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.3)', borderRadius: '999px', padding: '1px 6px',
              }}>Locked</span>
            )}
          </span>,
          <PaymentStatusBadge key="pstatus" status={sale.payment_status || 'UNPAID'} balance={sale.outstanding_balance} showBalance />,
        ],
        raw: sale,
      }))
    )
  }

  const loadStats = async () => {
    try {
      // Load sales and quotations in parallel for combined stat cards
      const [salesResult, quotResult] = await Promise.all([
        apiGet('/sales',       token, { page: 1, limit: 2000, sortBy: 'createdAt', sortDir: 'desc' }),
        apiGet('/quotations',  token, { page: 1, limit: 2000 }),
      ])
      const all      = salesResult.data || []
      const allQuots = quotResult.data  || []

      // Sales totals (legacy)
      const salesTotal   = salesResult.pagination?.total || all.length
      const salesRevenue = all.reduce((s, x) => s + Number(x.total_amount || 0), 0)
      const salesOut     = all.reduce((s, x) => s + Number(x.outstanding_balance ?? 0), 0)

      // Quotation totals (new flow)
      const quotTotal    = quotResult.pagination?.total || allQuots.length
      const quotRevenue  = allQuots.reduce((s, x) => s + Number(x.total_amount || 0), 0)
      const quotOut      = allQuots.reduce((s, x) => s + Number(x.outstanding_balance ?? 0), 0)

      const total          = salesTotal + quotTotal
      const totalRevenue   = salesRevenue + quotRevenue
      const outstanding    = salesOut + quotOut
      const unpaidCount    = all.filter(x => (x.payment_status || 'UNPAID') === 'UNPAID').length
                           + allQuots.filter(x => (x.payment_status || 'UNPAID') === 'UNPAID').length
      const partialCount   = all.filter(x => (x.payment_status || '') === 'PARTIAL').length
                           + allQuots.filter(x => (x.payment_status || '') === 'PARTIALLY_PAID').length
      const paidCount      = all.filter(x => (x.payment_status || '') === 'PAID').length
                           + allQuots.filter(x => (x.payment_status || '') === 'PAID').length
      const voidedCount    = all.filter(x => x.workflow_status === 'Voided').length
      setStats({ total, totalRevenue, outstanding, unpaidCount, partialCount, paidCount, voidedCount })
    } catch (_) {}
  }

  const handleVoid = (record) => {
    const isQuot = record.doc_type === 'Quotation'
    setConfirmConfig({
      isOpen: true, title: 'Void Document',
      message: 'Void this document? This cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          if (isQuot) {
            await apiPatch(`/quotations/${record.id}/status`, token, { status: 'Not Approved' })
          } else {
            await apiPatch(`/sales/${record.id}/void`, token, { reason: 'Voided from dashboard' })
          }
          await Promise.all([loadData(), loadStats()])
          setError('')
        } catch (e) { setError(e.message) }
      },
    })
  }

  const handleDelete = (record) => {
    const isQuot = record.doc_type === 'Quotation'
    setConfirmConfig({
      isOpen: true, title: 'Delete Document',
      message: 'Delete this document permanently?',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const endpoint = isQuot ? `/quotations/${record.id}` : `/sales/${record.id}`
          await apiDelete(endpoint, token)
          await Promise.all([loadData(), loadStats()])
          setError('')
        } catch (e) { setError(e.message) }
      },
    })
  }

  const handlePdf = async (sale) => {
    try {
      const typeMap = { Quotation: 'quotation', JobOrder: 'job-order', Invoice: 'invoice' }
      const type = typeMap[sale.doc_type] || 'invoice'
      await apiDownload(`/exports/sales/${sale.id}/${type}/pdf`, token, `${type}-${sale.reference_no}.pdf`)
      setError('')
    } catch (e) { setError(e.message) }
  }


  useEffect(() => {
    loadStats()
    loadData(1, search, statusFilter, sortBy, sortDir, dateFrom, dateTo).catch(e => setError(e.message))
  }, [token])

  useEffect(() => {
    loadData(1, search, statusFilter, sortBy, sortDir, dateFrom, dateTo).catch(e => setError(e.message))
  }, [search, statusFilter, sortBy, sortDir, dateFrom, dateTo])

  const PHP = `${String.fromCharCode(8369)}`

  return (
    <div className="page-grid">
      <div className="sp-stat-grid" style={{ gridColumn: '1 / -1' }}>
        <StatCard
          label="Total Invoices"
          value={stats ? stats.total.toLocaleString() : '...'}
          sub={stats ? `${stats.paidCount} paid · ${stats.voidedCount} voided` : ''}
          color="#aaaaaa"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>}
        />
        <StatCard
          label="Total Revenue"
          value={stats ? `${PHP}${stats.totalRevenue.toLocaleString('en-PH')}` : '...'}
          sub="Sum of all invoice amounts"
          color="#34d399"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
        />
        <StatCard
          label="Outstanding Balance"
          value={stats ? `${PHP}${stats.outstanding.toLocaleString('en-PH')}` : '...'}
          sub={stats ? `${stats.unpaidCount} unpaid · ${stats.partialCount} partial` : ''}
          color="#fbbf24"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
        />
        <StatCard
          label="Collected"
          value={stats ? `${PHP}${(stats.totalRevenue - stats.outstanding).toLocaleString('en-PH')}` : '...'}
          sub={stats ? `${stats.paidCount} fully settled` : ''}
          color="#a0a8b8"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>}
        />
      </div>

      <SectionCard 
        title="Transactions" 
        subtitle="Invoice history, status management and PDF export"
        actionNode={
          <button type="button" className="sp-dl-btn" onClick={() => setShowReportModal(true)}>
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Report
          </button>
        }
      >
          <>
            {stats && (
              <div className="sp-pills">
                {[
                  { label: 'All',     value: stats.total,        active: statusFilter === '',                onClick: () => { setPage(1); setStatusFilter('') },               color: '#aaaaaa' },
                  { label: 'Unpaid',  value: stats.unpaidCount,  active: false,                             onClick: () => { setPage(1); setStatusFilter('') },               color: '#fbbf24' },
                  { label: 'Partial', value: stats.partialCount, active: statusFilter === 'Partially Paid', onClick: () => { setPage(1); setStatusFilter('Partially Paid') },  color: '#f97316' },
                  { label: 'Paid',    value: stats.paidCount,    active: statusFilter === 'Paid',           onClick: () => { setPage(1); setStatusFilter('Paid') },            color: '#34d399' },
                  { label: 'Voided',  value: stats.voidedCount,  active: statusFilter === 'Voided',         onClick: () => { setPage(1); setStatusFilter('Voided') },          color: '#94a3b8' },
                ].map(({ label, value, color, active, onClick }) => (
                  <button
                    key={label} type="button" onClick={onClick}
                    className={`sp-pill${active ? ' active' : ''}`}
                    style={{ border: `1px solid ${color}${active ? '66' : '33'}`, background: `${color}${active ? '22' : '0d'}`, color }}
                  >
                    {label} <span style={{ opacity: 0.75 }}>({value})</span>
                  </button>
                ))}
              </div>
            )}

            <div className="sp-toolbar">
              <input type="search" placeholder="Search reference, customer, service..." value={search} onChange={e => { setPage(1); setSearch(e.target.value) }} />
              <select value={statusFilter} onChange={e => { setPage(1); setStatusFilter(e.target.value) }}>
                <option value="">All Status</option>
                <option>In Progress</option>
                <option>QA</option>
                <option>Ready for Release</option>
                <option>Completed/Released</option>
                <option>Partially Paid</option>
                <option>Voided</option>
              </select>
              <input type="date" value={dateFrom} onChange={e => { setPage(1); setDateFrom(e.target.value) }} />
              <input type="date" value={dateTo}   onChange={e => { setPage(1); setDateTo(e.target.value) }} />
              <select value={sortBy} onChange={e => { setPage(1); setSortBy(e.target.value) }}>
                <option value="createdAt">Sort: Date</option>
                <option value="amount">Sort: Amount</option>
                <option value="status">Sort: Status</option>
                <option value="reference">Sort: Reference</option>
                <option value="customer">Sort: Customer</option>
              </select>
              <select value={sortDir} onChange={e => { setPage(1); setSortDir(e.target.value) }}>
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
            </div>


            <DataTable
              headers={['Reference', 'Customer', 'Package / Service', 'Amount', 'Status', 'Payment']}
              rows={rows}
              rowActions={(sale) => (
                <div className="row-actions">
                  <button type="button" className="btn-icon" onClick={() => handlePdf(sale)} title="Export PDF" aria-label="PDF">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" /><path d="M9 15h6" /><path d="M9 11h3" />
                    </svg>
                  </button>
                  <button type="button" className="btn-icon action-danger"
                    onClick={() => !sale.is_locked && handleVoid(sale)}
                    title={sale.is_locked ? 'Locked' : 'Void'}
                    style={sale.is_locked ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                    </svg>
                  </button>
                  <button type="button" className="btn-icon action-danger"
                    onClick={() => !sale.is_locked && handleDelete(sale)}
                    title={sale.is_locked ? 'Locked' : 'Delete'}
                    style={sale.is_locked ? { opacity: 0.35, cursor: 'not-allowed' } : {}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            />

            <PaginationBar
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPageChange={p => loadData(p, search, statusFilter, sortBy, sortDir, dateFrom, dateTo).catch(e => setError(e.message))}
            />
          </>

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
          variant={confirmConfig.variant || 'danger'}
        />

        {error && <p className="page-error">{error}</p>}
      </SectionCard>

      <SectionCard title="Reports & Analytics" subtitle="Revenue breakdown, payment trends and period summaries">
        <SalesReports token={token} />
      </SectionCard>

      {showReportModal && (
        <SalesReportModal token={token} onClose={() => setShowReportModal(false)} />
      )}
    </div>
  )
}