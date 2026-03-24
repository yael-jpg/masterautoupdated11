import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiDownload } from '../api/client'
import './SalesReportModal.css'

// ─── Column definitions ──────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: 'date',            label: 'Date',              group: 'General' },
  { key: 'reference',       label: 'Reference No.',     group: 'General' },
  { key: 'status',          label: 'Workflow Status',   group: 'General' },
  { key: 'staff',           label: 'Created By',        group: 'General' },
  { key: 'customer_name',   label: 'Customer Name',     group: 'Customer' },
  { key: 'customer_id',     label: 'Customer ID',       group: 'Customer' },
  { key: 'services',        label: 'Service / Description', group: 'Service' },
  { key: 'vehicle_make',    label: 'Make',              group: 'Vehicle' },
  { key: 'vehicle_model',   label: 'Model',             group: 'Vehicle' },
  { key: 'vehicle_variant', label: 'Variant',           group: 'Vehicle' },
  { key: 'vehicle_plate',   label: 'Plate Number',      group: 'Vehicle' },
  { key: 'amount_subtotal', label: 'Subtotal',          group: 'Financials' },
  { key: 'amount_discount', label: 'Discount',          group: 'Financials' },
  { key: 'amount_total',    label: 'Total Amount',      group: 'Financials' },
  { key: 'amount_paid',     label: 'Amount Paid',       group: 'Financials' },
  { key: 'amount_balance',  label: 'Outstanding Balance', group: 'Financials' },
  { key: 'payment_status',  label: 'Payment Status',    group: 'Financials' },
]

const DEFAULT_COLS = ['date','reference','customer_name','services','vehicle_plate','amount_total','payment_status','status']

const STATUSES = [
  'In Progress',
  'QA',
  'Ready for Release',
  'Completed/Released',
  'Partially Paid',
  'Voided',
]

const STATUS_COLORS = {
  'Completed/Released': '#34d399',
  'Partially Paid':     '#f97316',
  'In Progress':        '#a0a8b8',
  'QA':                 '#a0a8b8',
  'Ready for Release':  '#fbbf24',
  'Voided':             '#94a3b8',
  'PAID':    '#34d399',
  'PARTIAL': '#f97316',
  'UNPAID':  '#ef4444',
  'OVERPAID':'#a0a8b8',
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const PHP = '₱'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function groupBy(arr, fn) {
  return arr.reduce((acc, item) => {
    const k = fn(item)
    ;(acc[k] = acc[k] || []).push(item)
    return acc
  }, {})
}

function StatusPill({ value }) {
  const color = STATUS_COLORS[value] || '#94a3b8'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '999px',
      background: `${color}22`, border: `1px solid ${color}55`,
      color, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>{value}</span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SalesReportModal({ token, onClose }) {
  const thisYear  = new Date().getFullYear()
  const thisMonth = new Date().getMonth() + 1

  const [periodMode, setPeriodMode] = useState('all')     // 'all' | 'month' | 'range'
  const [month,      setMonth]      = useState(thisMonth)
  const [year,       setYear]       = useState(thisYear)
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [selStatuses, setSelStatuses] = useState(new Set())   // empty = all
  const [selColumns,  setSelColumns]  = useState(new Set(DEFAULT_COLS))
  const [preview,    setPreview]    = useState(null)         // { rows, columns, total, summary }
  const [previewLoading, setPreviewLoading] = useState(false)
  const [downloading,    setDownloading]    = useState('')   // '' | 'csv' | 'excel' | 'pdf'
  const [error,          setError]          = useState('')

  // ── Build query params ─────────────────────────────────────────────────────
  const buildParams = useCallback((fmt) => {
    const p = { format: fmt, columns: [...selColumns].join(',') }
    if (selStatuses.size > 0) p.status = [...selStatuses].join(',')
    if (periodMode === 'month') { p.month = month; p.year = year }
    else if (periodMode === 'range') { if (dateFrom) p.dateFrom = dateFrom; if (dateTo) p.dateTo = dateTo }
    // 'all' → no date params → backend returns everything
    return p
  }, [periodMode, month, year, dateFrom, dateTo, selStatuses, selColumns])

  const isValid = selColumns.size > 0

  // ── Preview ────────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!isValid) return
    setPreviewLoading(true); setError('')
    try {
      const result = await apiGet('/exports/report/sales', token, buildParams('json'))
      setPreview(result)
    } catch (e) { setError(e.message) }
    finally { setPreviewLoading(false) }
  }

  // ── Lock body scroll while modal is open ───────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Auto-load preview on open ─────────────────────────────────────────────
  useEffect(() => { handlePreview() }, [])

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async (fmt) => {
    if (!isValid) return
    setDownloading(fmt); setError('')
    try {
      const params  = buildParams(fmt)
      const qs      = new URLSearchParams(params).toString()
      const ext     = fmt === 'excel' ? 'xlsx' : fmt
      await apiDownload(`/exports/report/sales?${qs}`, token, `sales-report.${ext}`)
    } catch (e) { setError(e.message) }
    finally { setDownloading('') }
  }

  // ── Column toggle helpers ─────────────────────────────────────────────────
  const toggleCol   = (key) => setSelColumns(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const toggleGroup = (keys, allOn) => setSelColumns(prev => { const n = new Set(prev); keys.forEach(k => allOn ? n.delete(k) : n.add(k)); return n })
  const toggleAll   = () => setSelColumns(prev => prev.size === ALL_COLUMNS.length ? new Set(DEFAULT_COLS) : new Set(ALL_COLUMNS.map(c => c.key)))

  const toggleStatus = (s) => {
    setSelStatuses(prev => {
      const n = new Set(prev)
      const isChecking = !n.has(s)
      isChecking ? n.add(s) : n.delete(s)

      // If checking a filter, automatically ensure the 'status' column is enabled
      if (isChecking) {
        setSelColumns(prevCols => {
          if (!prevCols.has('status')) {
            const nc = new Set(prevCols)
            nc.add('status')
            return nc
          }
          return prevCols
        })
      }
      return n
    })
  }

  const colGroups = groupBy(ALL_COLUMNS, c => c.group)

  // ── Misc ──────────────────────────────────────────────────────────────────
  const yearOptions = Array.from({ length: 6 }, (_, i) => thisYear - i)
  const previewColDefs = preview ? ALL_COLUMNS.filter(c => preview.columns.includes(c.key)) : []

  return createPortal(
    <div className="srm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="srm-panel">
        {/* ── Title bar ─────────────────────────────────────────────────── */}
        <div className="srm-header">
          <div className="srm-header-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <span>Download Sales Report</span>
          </div>
          <button className="srm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="srm-body">
          {/* ── Left column: filters ─────────────────────────────────────── */}
          <div className="srm-filters">

            {/* Period */}
            <div className="srm-section">
              <div className="srm-section-title">Time Period</div>
              <div className="srm-toggle-row">
                <button className={`srm-toggle ${periodMode === 'all'   ? 'active' : ''}`} onClick={() => setPeriodMode('all')}>All Time</button>
                <button className={`srm-toggle ${periodMode === 'month' ? 'active' : ''}`} onClick={() => setPeriodMode('month')}>Month/Year</button>
                <button className={`srm-toggle ${periodMode === 'range' ? 'active' : ''}`} onClick={() => setPeriodMode('range')}>Date Range</button>
              </div>
              {periodMode === 'all' ? (
                <div style={{ fontSize: '0.78rem', color: 'rgba(189,200,218,0.45)', padding: '6px 2px' }}>All records will be included — no date filter applied.</div>
              ) : periodMode === 'month' ? (
                <div className="srm-row">
                  <select className="srm-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <select className="srm-select" value={year} onChange={e => setYear(Number(e.target.value))}>
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              ) : (
                <div className="srm-row">
                  <div className="srm-date-group">
                    <label>From</label>
                    <input type="date" className="srm-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div className="srm-date-group">
                    <label>To</label>
                    <input type="date" className="srm-input" value={dateTo}   onChange={e => setDateTo(e.target.value)} />
                  </div>
                </div>
              )}
            </div>

            {/* Status filter */}
            <div className="srm-section">
              <div className="srm-section-title">
                Status
                <span className="srm-hint">{selStatuses.size === 0 ? 'All' : `${selStatuses.size} selected`}</span>
              </div>
              <div className="srm-checkgrid">
                {STATUSES.map(s => (
                  <label key={s} className={`srm-checkitem ${selStatuses.has(s) ? 'checked' : ''}`}>
                    <input type="checkbox" checked={selStatuses.has(s)} onChange={() => toggleStatus(s)} />
                    <StatusPill value={s} />
                  </label>
                ))}
              </div>
              {selStatuses.size > 0 && (
                <button className="srm-link" onClick={() => setSelStatuses(new Set())}>Clear (show all)</button>
              )}
            </div>

            {/* Column selector */}
            <div className="srm-section">
              <div className="srm-section-title">
                Columns
                <button className="srm-link" onClick={toggleAll}>
                  {selColumns.size === ALL_COLUMNS.length ? 'Reset to default' : 'Select all'}
                </button>
              </div>
              {Object.entries(colGroups).map(([group, cols]) => {
                const groupKeys = cols.map(c => c.key)
                const allOn = groupKeys.every(k => selColumns.has(k))
                return (
                  <div key={group} className="srm-col-group">
                    <div className="srm-col-group-header">
                      <span>{group}</span>
                      <button className="srm-link" onClick={() => toggleGroup(groupKeys, allOn)}>
                        {allOn ? 'Deselect' : 'Select all'}
                      </button>
                    </div>
                    <div className="srm-checkgrid compact">
                      {cols.map(c => (
                        <label key={c.key} className={`srm-checkitem ${selColumns.has(c.key) ? 'checked' : ''}`}>
                          <input type="checkbox" checked={selColumns.has(c.key)} onChange={() => toggleCol(c.key)} />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Right column: preview ─────────────────────────────────────── */}
          <div className="srm-preview-area">
            <div className="srm-preview-header">
              <span className="srm-section-title" style={{ margin: 0 }}>
                Preview
                {preview && <span className="srm-hint">{preview.total} record{preview.total !== 1 ? 's' : ''} (showing first 10)</span>}
              </span>
              <button className="srm-btn secondary" onClick={handlePreview} disabled={!isValid || previewLoading}>
                {previewLoading ? 'Loading…' : '⟳ Refresh Preview'}
              </button>
            </div>

            {preview ? (
              <>
                <div className="srm-table-wrap">
                  <table className="srm-table">
                    <thead>
                      <tr>{previewColDefs.map(c => <th key={c.key}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.length === 0 ? (
                        <tr><td colSpan={previewColDefs.length} className="srm-empty">No records match the selected filters.</td></tr>
                      ) : preview.rows.map((r, i) => (
                        <tr key={i}>
                          {previewColDefs.map(c => (
                            <td key={c.key}>
                              {(c.key === 'status' || c.key === 'payment_status')
                                ? <StatusPill value={r[c.key] || ''} />
                                : r[c.key] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary strip */}
                {preview.summary && (
                  <div className="srm-summary">
                    <div className="srm-summary-item">
                      <span>Grand Total</span>
                      <strong>{PHP}{Number(preview.summary.grandTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="srm-summary-item">
                      <span>Total Paid</span>
                      <strong style={{ color: '#34d399' }}>{PHP}{Number(preview.summary.grandPaid).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="srm-summary-item">
                      <span>Outstanding</span>
                      <strong style={{ color: '#fbbf24' }}>{PHP}{Number(preview.summary.grandBalance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div className="srm-summary-item">
                      <span>Records</span>
                      <strong>{preview.total}</strong>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="srm-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                </svg>
                <p>Configure filters and click <strong>Refresh Preview</strong> to see a data preview before downloading.</p>
              </div>
            )}

            {error && <div className="srm-error">⚠ {error}</div>}
          </div>
        </div>

        {/* ── Footer: download buttons ──────────────────────────────────────── */}
        <div className="srm-footer">
          <span className="srm-footer-hint">
            {!isValid
              ? 'Select at least one column to enable download.'
              : `${selColumns.size} column${selColumns.size !== 1 ? 's' : ''} selected`}
          </span>
          <div className="srm-footer-actions">
            <button className="srm-btn secondary" onClick={onClose}>Cancel</button>
            <button
              className={`srm-btn format-csv ${downloading === 'csv' ? 'loading' : ''}`}
              onClick={() => handleDownload('csv')}
              disabled={!isValid || !!downloading}
              title="Download as CSV"
            >
              {downloading === 'csv' ? 'Generating…' : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</>
              )}
            </button>
            <button
              className={`srm-btn format-excel ${downloading === 'excel' ? 'loading' : ''}`}
              onClick={() => handleDownload('excel')}
              disabled={!isValid || !!downloading}
              title="Download as Excel"
            >
              {downloading === 'excel' ? 'Generating…' : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Excel</>
              )}
            </button>
            <button
              className={`srm-btn format-pdf ${downloading === 'pdf' ? 'loading' : ''}`}
              onClick={() => handleDownload('pdf')}
              disabled={!isValid || !!downloading}
              title="Download as PDF"
            >
              {downloading === 'pdf' ? 'Generating…' : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 11h3"/></svg> PDF</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
