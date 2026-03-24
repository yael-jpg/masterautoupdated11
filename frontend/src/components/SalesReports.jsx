import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'
import './SalesReports.css'

export function SalesReports({ token }) {
  const [period, setPeriod] = useState('month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [summary, setSummary] = useState(null)
  const [byType, setByType] = useState([])
  const [byStaff, setByStaff] = useState([])
  const [outstanding, setOutstanding] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadReports = async () => {
    setLoading(true)
    try {
      const [summaryRes, typeRes, staffRes, outstandingRes] = await Promise.all([
        apiGet('/sales/reports/summary', token, { period }),
        apiGet('/sales/reports/by-type', token, { dateFrom, dateTo }),
        apiGet('/sales/reports/by-staff', token, { dateFrom, dateTo }),
        apiGet('/sales/reports/outstanding', token),
      ])
      
      setSummary(summaryRes)
      setByType(Array.isArray(typeRes) ? typeRes : [])
      setByStaff(Array.isArray(staffRes) ? staffRes : [])
      setOutstanding(Array.isArray(outstandingRes) ? outstandingRes : [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [token, period])

  return (
    <div className="sales-reports">
      <div className="reports-toolbar">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="day">Today</option>
          <option value="week">Last 7 Days</option>
          <option value="month">This Month</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
        />
        <button onClick={loadReports} className="btn-secondary">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ color: '#ffadb6', padding: '12px', background: 'rgba(255,99,112,0.1)', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      {/* Summary Cards */}
      {summary && (
        <div className="reports-grid">
          <div className="report-card">
            <h4>Total Sales</h4>
            <div className="stat-value">₱{Number(summary.summary?.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div className="stat-detail">{summary.summary?.total_count || 0} transactions</div>
          </div>

          <div className="report-card">
            <h4>Quotations</h4>
            <div className="stat-value">
              {summary.byStatus?.find(s => s.workflow_status === 'For Job Order')?.count || 0}
            </div>
            <div className="stat-detail">
              ₱{Number(summary.byStatus?.find(s => s.workflow_status === 'For Job Order')?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="report-card">
            <h4>In Progress</h4>
            <div className="stat-value">
              {summary.byStatus?.find(s => s.workflow_status === 'In Progress')?.count || 0}
            </div>
            <div className="stat-detail">
              ₱{Number(summary.byStatus?.find(s => s.workflow_status === 'In Progress')?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="report-card">
            <h4>Completed</h4>
            <div className="stat-value">
              {summary.byStatus?.find(s => s.workflow_status === 'Completed/Released')?.count || 0}
            </div>
            <div className="stat-detail">
              ₱{Number(summary.byStatus?.find(s => s.workflow_status === 'Completed/Released')?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="report-card">
            <h4>Partially Paid</h4>
            <div className="stat-value">
              {summary.byStatus?.find(s => s.workflow_status === 'Partially Paid')?.count || 0}
            </div>
            <div className="stat-detail">
              ₱{Number(summary.byStatus?.find(s => s.workflow_status === 'Partially Paid')?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* Sales by Type */}
      {byType.length > 0 && (
        <div className="report-section">
          <h3>Sales by Service Type</h3>
          <div className="report-table">
            <div className="table-header">
              <div className="col-service">Service Type</div>
              <div className="col-count">Count</div>
              <div className="col-total">Total</div>
              <div className="col-avg">Avg Amount</div>
            </div>
            {byType.map((row, idx) => (
              <div key={idx} className="table-row">
                <div className="col-service">{row.service_type}</div>
                <div className="col-count">{row.count}</div>
                <div className="col-total">₱{Number(row.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                <div className="col-avg">₱{Number(row.avg_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales by Staff */}
      {byStaff.length > 0 && (
        <div className="report-section">
          <h3>Sales by Staff</h3>
          <div className="report-table">
            <div className="table-header">
              <div className="col-staff">Staff Name</div>
              <div className="col-count">Sales</div>
              <div className="col-total">Total Sales</div>
            </div>
            {byStaff.map((row, idx) => (
              <div key={idx} className="table-row">
                <div className="col-staff">{row.staff_name || 'Unassigned'}</div>
                <div className="col-count">{row.sales_count}</div>
                <div className="col-total">₱{Number(row.total_sales).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outstanding Balances */}
      {outstanding.length > 0 && (
        <div className="report-section">
          <h3>Outstanding Balances</h3>
          <div className="report-table">
            <div className="table-header">
              <div className="col-ref">Reference</div>
              <div className="col-customer">Customer</div>
              <div className="col-vehicle">Vehicle</div>
              <div className="col-total">Total Amount</div>
              <div className="col-outstanding">Outstanding</div>
              <div className="col-days">Days Outstanding</div>
            </div>
            {outstanding.map((row, idx) => (
              <div key={idx} className="table-row" style={{ borderLeft: `3px solid ${row.days_outstanding > 30 ? '#ef4444' : row.days_outstanding > 7 ? '#fbbf24' : '#34d399'}` }}>
                <div className="col-ref">{row.reference_no}</div>
                <div className="col-customer">{row.customer_name}</div>
                <div className="col-vehicle">{row.vehicle_plate || row.plate_number}</div>
                <div className="col-total">₱{Number(row.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                <div className="col-outstanding">₱{Number(row.outstanding_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                <div className="col-days" style={{ color: row.days_outstanding > 30 ? '#ef4444' : row.days_outstanding > 7 ? '#fbbf24' : '#34d399' }}>
                  {row.days_outstanding} days
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {outstanding.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(189,200,218,0.6)' }}>
          No outstanding balances 🎉
        </div>
      )}
    </div>
  )
}
