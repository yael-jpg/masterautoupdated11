import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './DashboardHome.css'
import { apiGet } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { StatCard } from '../components/StatCard'

const DASHBOARD_PAGE_SIZE = 5
const DASHBOARD_FETCH_LIMIT = 50

export function DashboardHome({ token, onNavigate }) {
  const [report, setReport] = useState(null)
  const [salesRows, setSalesRows] = useState([])
  const [scheduleRows, setScheduleRows] = useState([])
  const [salesPage, setSalesPage] = useState(1)
  const [schedulePage, setSchedulePage] = useState(1)
  const [error, setError] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 900)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const pick = (row, keys, fallback = '-') => {
          for (const key of keys) {
            const value = row?.[key]
            if (value !== undefined && value !== null && String(value).trim() !== '') return value
          }
          return fallback
        }

        const [reportData, quotations, appointments] = await Promise.all([
          apiGet('/reports/sales-summary', token),
          apiGet('/quotations', token, { page: 1, limit: DASHBOARD_FETCH_LIMIT }),
          apiGet('/appointments', token, {
            page: 1,
            limit: DASHBOARD_FETCH_LIMIT,
            tab: 'active',
            sortBy: 'createdAt',
            sortDir: 'desc',
          }),
        ])

        setReport(reportData)
        setSalesRows(
          (quotations.data || []).map((row) => [
            pick(row, ['quotation_no', 'reference_no', 'id']),
            pick(row, ['customer_name', 'full_name', 'customer']),
            pick(row, ['plate_number', 'vehicle_plate']),
            `₱${Number(pick(row, ['total_amount', 'amount_total', 'grand_total'], 0)).toLocaleString()}`,
            renderStatusPill(pick(row, ['status', 'workflow_status', 'payment_status'])),
          ]),
        )
        setScheduleRows(
          (appointments.data || []).map((row) => [
            row?.schedule_start
              ? new Date(row.schedule_start).toLocaleTimeString('en-PH', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '-',
            pick(row, ['customer_name', 'full_name', 'customer']),
            pick(row, ['plate_number', 'vehicle_plate']),
            row?.service_id ? (pick(row, ['service_name'], `Service #${row.service_id}`)) : pick(row, ['service_name'], 'Custom Service'),
            renderStatusPill(pick(row, ['status', 'workflow_status'])),
          ]),
        )
      } catch (err) {
        console.error('Dashboard load error:', err)
        setError(err.message)
      }
    }

    load()
  }, [token])

  useEffect(() => {
    const salesTotalPages = Math.max(1, Math.ceil(salesRows.length / DASHBOARD_PAGE_SIZE))
    const scheduleTotalPages = Math.max(1, Math.ceil(scheduleRows.length / DASHBOARD_PAGE_SIZE))

    setSalesPage((prev) => Math.min(prev, salesTotalPages))
    setSchedulePage((prev) => Math.min(prev, scheduleTotalPages))
  }, [salesRows, scheduleRows])

  const kpiCards = useMemo(
    () => [
      {
        label: 'Daily Sales',
        value: report ? `₱${Number(report.dailyTotal).toLocaleString()}` : '—',
        trend: 'Current day total',
        onClick: () => onNavigate && onNavigate('sales'),
      },
      {
        label: 'Monthly Sales',
        value: report ? `₱${Number(report.monthlyTotal).toLocaleString()}` : '—',
        trend: 'Current month total',
        onClick: () => onNavigate && onNavigate('sales'),
      },
      {
        label: 'Outstanding',
        value: report ? `₱${Number(report.outstandingBalance).toLocaleString()}` : '—',
        trend: 'Unpaid balances',
        onClick: () => onNavigate && onNavigate('payments'),
      },
      {
        label: 'Top Services',
        value: report ? `${report.byServiceType.length}` : '—',
        trend: 'Tracked categories',
        onClick: () => onNavigate && onNavigate('admin'),
      },
    ],
    [report, onNavigate],
  )

  const chartData = useMemo(() => {
    if (!report) return { trend: [], distribution: [] }

    const trend = (report.salesTrend || []).map((item) => ({
      name: item.date,
      total: Number(item.total),
    }))

    const rawDistribution = (report.byServiceType || [])
      .map((item) => ({
        name: item.service_package,
        value: Number(item.total) || 0,
      }))
      .filter((item) => item.value > 0)

    const MAX_VISIBLE_SLICES = 5
    let distribution = rawDistribution

    if (rawDistribution.length > MAX_VISIBLE_SLICES) {
      const top = rawDistribution.slice(0, MAX_VISIBLE_SLICES)
      const othersTotal = rawDistribution
        .slice(MAX_VISIBLE_SLICES)
        .reduce((sum, item) => sum + item.value, 0)

      distribution = othersTotal > 0
        ? [...top, { name: 'Others', value: othersTotal }]
        : top
    }

    return { trend, distribution }
  }, [report])

  const salesTotalPages = Math.max(1, Math.ceil(salesRows.length / DASHBOARD_PAGE_SIZE))
  const scheduleTotalPages = Math.max(1, Math.ceil(scheduleRows.length / DASHBOARD_PAGE_SIZE))

  const pagedSalesRows = useMemo(() => {
    const start = (salesPage - 1) * DASHBOARD_PAGE_SIZE
    return salesRows.slice(start, start + DASHBOARD_PAGE_SIZE)
  }, [salesRows, salesPage])

  const pagedScheduleRows = useMemo(() => {
    const start = (schedulePage - 1) * DASHBOARD_PAGE_SIZE
    return scheduleRows.slice(start, start + DASHBOARD_PAGE_SIZE)
  }, [scheduleRows, schedulePage])

  const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#f97316', '#14b8a6']

  const renderStatusPill = (status) => {
    const text = String(status || '-').trim() || '-'
    const normalized = text.toLowerCase()
    let tone = 'neutral'
    if (['approved', 'completed', 'released', 'paid', 'done'].some((s) => normalized.includes(s))) tone = 'success'
    else if (['pending', 'requested', 'draft', 'scheduled'].some((s) => normalized.includes(s))) tone = 'warning'
    else if (['cancelled', 'void', 'rejected', 'overdue'].some((s) => normalized.includes(s))) tone = 'danger'
    return <span className={`dashboard-status-pill dashboard-status-pill--${tone}`}>{text}</span>
  }

  const chartColors = {
    grid: 'rgba(255,255,255,0.05)',
    axis: '#8b96a8',
    tooltipBg: 'rgba(235, 238, 244, 0.95)',
    tooltipBorder: 'rgba(120, 130, 145, 0.5)',
    tooltipText: '#1d2430',
    cursor: 'rgba(255,255,255,0.03)',
    legendText: '#c5cedf',
  }

  if (error) {
    return (
      <div className="page-grid">
        <p className="page-error">Error loading dashboard: {error}</p>
        <button className="btn-secondary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        {kpiCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <section className="charts-grid">
        <article className="chart-card">
          <h3>Weekly Revenue Trend</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%" debounce={120}>
              <BarChart data={chartData.trend} margin={isMobile ? { top: 8, right: 8, left: 12, bottom: 0 } : { top: 8, right: 14, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke={chartColors.axis}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={chartColors.axis}
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `₱${value / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    borderColor: chartColors.tooltipBorder,
                    borderRadius: '8px',
                    color: chartColors.tooltipText,
                  }}
                  cursor={{ fill: chartColors.cursor }}
                />
                <Bar dataKey="total" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4338ca" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="chart-card">
          <h3>Service Distribution</h3>
          <div className="chart-container dashboard-pie-panel">
            <div className="dashboard-pie-canvas">
              <ResponsiveContainer width="100%" height="100%" debounce={120}>
                <PieChart>
                  <Pie
                    data={chartData.distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 44 : 58}
                    outerRadius={isMobile ? 68 : 82}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `₱${Number(value || 0).toLocaleString('en-PH')}`}
                    contentStyle={{
                      backgroundColor: chartColors.tooltipBg,
                      borderColor: chartColors.tooltipBorder,
                      borderRadius: '8px',
                      color: chartColors.tooltipText,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="dashboard-pie-legend" aria-label="Service distribution legend">
              {chartData.distribution.map((entry, index) => (
                <div className="dashboard-pie-legend-item" key={`legend-${entry.name}-${index}`}>
                  <span
                    className="dashboard-pie-legend-dot"
                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                    aria-hidden="true"
                  />
                  <div className="dashboard-pie-legend-content">
                    <span className="dashboard-pie-legend-label">{entry.name}</span>
                    <span className="dashboard-pie-legend-value">₱{Number(entry.value || 0).toLocaleString('en-PH')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-split">
        <SectionCard
          title="Sales Snapshot"
          subtitle="Recent transactions"
          actionLabel="Go to Sales"
          onActionClick={() => onNavigate && onNavigate('sales')}
        >
          <div className="dashboard-table-wrap">
            <DataTable
              headers={['Quotation #', 'Customer', 'Plate', 'Amount', 'Status']}
              rows={pagedSalesRows}
            />
          </div>
          {salesRows.length > DASHBOARD_PAGE_SIZE ? (
            <PaginationBar
              page={salesPage}
              totalPages={salesTotalPages}
              total={salesRows.length}
              onPageChange={setSalesPage}
            />
          ) : null}
        </SectionCard>

        <SectionCard
          title="Today's Schedule"
          subtitle="Live appointments"
          actionLabel="Go to Schedule"
          onActionClick={() => onNavigate && onNavigate('scheduling')}
        >
          <div className="dashboard-table-wrap">
            <DataTable
              headers={['Time', 'Customer', 'Plate', 'Service', 'Status']}
              rows={pagedScheduleRows}
            />
          </div>
          {scheduleRows.length > DASHBOARD_PAGE_SIZE ? (
            <PaginationBar
              page={schedulePage}
              totalPages={scheduleTotalPages}
              total={scheduleRows.length}
              onPageChange={setSchedulePage}
            />
          ) : null}
        </SectionCard>
      </section>
    </div>
  )
}
