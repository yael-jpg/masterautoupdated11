import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
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
            row.quotation_no,
            row.customer_name,
            row.plate_number,
            `₱${Number(row.total_amount).toLocaleString()}`,
            row.status,
          ]),
        )
        setScheduleRows(
          appointments.data.map((row) => [
            new Date(row.schedule_start).toLocaleTimeString('en-PH', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            row.customer_name,
            row.plate_number,
            row.service_id ? (row.service_name || `Service #${row.service_id}`) : 'Custom Service',
            row.installer_team || '-',
            row.status,
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

    const distribution = (report.byServiceType || []).slice(0, 5).map((item) => ({
      name: item.service_package,
      value: Number(item.total),
    }))

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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.trend} margin={isMobile ? { top: 8, right: 8, left: 0, bottom: 0 } : undefined}>
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
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.distribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 70 : 60}
                  outerRadius={isMobile ? 100 : 80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    borderColor: chartColors.tooltipBorder,
                    borderRadius: '8px',
                    color: chartColors.tooltipText,
                  }}
                />
                {!isMobile && (
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    iconType="circle"
                    formatter={(value) => <span style={{ color: chartColors.legendText, fontSize: '12px' }}>{value}</span>}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
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
          <DataTable
            headers={['Quotation #', 'Customer', 'Plate', 'Amount', 'Status']}
            rows={pagedSalesRows}
          />
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
          <DataTable
            headers={['Time', 'Customer', 'Plate', 'Service', 'Status']}
            rows={pagedScheduleRows}
          />
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
