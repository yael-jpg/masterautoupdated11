import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete, pushToast } from '../api/client'
import { WorkflowStatusBadge } from '../components/WorkflowStatusBadge'
import { StatCard } from '../components/StatCard'
import { ConfirmModal } from '../components/ConfirmModal'

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(new Date().getFullYear(), i, 1)
  return {
    value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
  }
})

export function CommissionsPage({ token }) {
  const [summary, setSummary]     = useState([])
  const [records, setRecords]     = useState([])
  const [rates, setRates]         = useState([])
  const [statusFilter, setStatusFilter] = useState('payable')
  const [monthFilter, setMonthFilter]   = useState('')
  const [loading, setLoading]     = useState(false)

  // Rate form
  const [showRateForm, setShowRateForm] = useState(false)
  const [rateForm, setRateForm]   = useState({ userId: '', serviceCode: '', rateType: 'percent', rateValue: '' })
  const [rateLoading, setRateLoading] = useState(false)

  // Pay confirm
  const [payTarget, setPayTarget] = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (monthFilter) params.set('month', monthFilter)

      // Parallel loads
      const [sum, recs, rateData] = await Promise.all([
        apiGet('/commissions/summary', token),
        apiGet(`/commissions?${params}`, token),
        apiGet('/commissions/rates', token),
      ])
      setSummary(Array.isArray(sum) ? sum : [])
      setRecords(Array.isArray(recs) ? recs : [])
      setRates(Array.isArray(rateData) ? rateData : [])
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setLoading(false)
    }
  }, [token, statusFilter, monthFilter])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Mark as Paid ─────────────────────────────────────────────────────────
  async function confirmPay() {
    try {
      await apiPatch(`/commissions/${payTarget.id}/pay`, token, {})
      pushToast('update', `Commission marked as paid`)
      setPayTarget(null)
      loadAll()
    } catch (e) {
      pushToast('error', e.message)
      setPayTarget(null)
    }
  }

  // ── Rate form ─────────────────────────────────────────────────────────────
  async function submitRate(e) {
    e.preventDefault()
    setRateLoading(true)
    try {
      await apiPost('/commissions/rates', token, {
        userId: Number(rateForm.userId),
        serviceCode: rateForm.serviceCode || null,
        rateType: rateForm.rateType,
        rateValue: Number(rateForm.rateValue),
      })
      pushToast('edit', 'Commission rate saved')
      setShowRateForm(false)
      setRateForm({ userId: '', serviceCode: '', rateType: 'percent', rateValue: '' })
      loadAll()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setRateLoading(false)
    }
  }

  async function deleteRate(id) {
    try {
      await apiDelete(`/commissions/rates/${id}`, token)
      pushToast('delete', 'Rate deleted')
      loadAll()
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  // ── Computed totals ───────────────────────────────────────────────────────
  const totalPayable = records.filter(r => r.status === 'payable').reduce((s, r) => s + Number(r.commission_amount), 0)
  const totalAllTime = summary.reduce((s, r) => s + Number(r.total_earned || 0), 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '0 4px' }}>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        <StatCard label="Installers"        value={summary.length}       color="#888888" />
        <StatCard label="Currently Payable" value={`₱${totalPayable.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} color="#f59e0b" />
        <StatCard label="All-Time Earned"   value={`₱${totalAllTime.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} color="#22c55e" />
        <StatCard label="Rate Rules"        value={rates.length}         color="#94a3b8" />
      </div>

      {/* ── Installer Summary ──────────────────────────────────────────────── */}
      <section>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>Installer Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {summary.length === 0 && !loading && (
            <p style={{ color: '#64748b', fontSize: 13 }}>No commission data yet.</p>
          )}
          {summary.map(ins => (
            <div key={ins.user_id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{ins.full_name}</div>
              <SummaryRow label="Total Earned" value={`₱${Number(ins.total_earned || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
              <SummaryRow label="Payable"      value={`₱${Number(ins.total_payable || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} highlight />
              <SummaryRow label="Paid Out"     value={`₱${Number(ins.total_paid || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Commission Rates ──────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Commission Rates</h3>
          <button onClick={() => setShowRateForm(true)} style={primaryBtnStyle}>+ Add Rate Rule</button>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Installer', 'Service Code', 'Type', 'Rate', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No rate rules configured.</td></tr>
              ) : rates.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.installer_name}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#475569' }}>{r.service_code || <span style={{ color: '#94a3b8' }}>All Services</span>}</td>
                  <td style={{ padding: '10px 14px' }}>{r.rate_type === 'percent' ? 'Percentage' : 'Fixed'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.rate_type === 'percent' ? `${r.rate_value}%` : `₱${Number(r.rate_value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => deleteRate(r.id)} style={{ padding: '3px 10px', border: '1px solid #ef4444', borderRadius: 6, background: 'transparent', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Commission Records ────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Commission Records</h3>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Status</option>
            <option value="payable">Payable</option>
            <option value="paid">Paid</option>
          </select>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={selectStyle}>
            <option value="">All Months</option>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Installer', 'Job Order', 'Service', 'Labor Value', 'Rate', 'Commission', 'Status', 'Paid At', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>No commission records found.</td></tr>
              ) : records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.installer_name}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#aaaaaa' }}>{r.job_order_no}</td>
                  <td style={{ padding: '10px 14px' }}>{r.service_name || r.service_code || 'General'}</td>
                  <td style={{ padding: '10px 14px' }}>₱{Number(r.labor_value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{r.rate_type === 'percent' ? `${r.rate_value}%` : `₱${r.rate_value}`}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#22c55e' }}>₱{Number(r.commission_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '10px 14px' }}><WorkflowStatusBadge status={r.status} /></td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{r.paid_at ? new Date(r.paid_at).toLocaleDateString('en-PH') : '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.status === 'payable' && (
                      <button onClick={() => setPayTarget(r)}
                        style={{ padding: '3px 10px', border: '1px solid #22c55e', borderRadius: 6, background: 'transparent', color: '#22c55e', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Rate Form Modal ───────────────────────────────────────────────── */}
      {showRateForm && (
        <ModalOverlay onClose={() => setShowRateForm(false)}>
          <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Add Commission Rate Rule</h3>
          <form onSubmit={submitRate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Installer User ID *</label>
              <input type="number" required value={rateForm.userId} onChange={e => setRateForm(f => ({ ...f, userId: e.target.value }))} style={inputStyle} placeholder="User ID of installer" />
            </div>
            <div>
              <label style={labelStyle}>Service Code (leave blank for all services)</label>
              <input type="text" value={rateForm.serviceCode} onChange={e => setRateForm(f => ({ ...f, serviceCode: e.target.value }))} style={inputStyle} placeholder="e.g. OIL-CHANGE" />
            </div>
            <div>
              <label style={labelStyle}>Rate Type *</label>
              <select value={rateForm.rateType} onChange={e => setRateForm(f => ({ ...f, rateType: e.target.value }))} style={inputStyle}>
                <option value="percent">Percentage of Labor Value</option>
                <option value="fixed">Fixed Amount (₱)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{rateForm.rateType === 'percent' ? 'Rate (%) *' : 'Fixed Amount (₱) *'}</label>
              <input type="number" step="0.01" required min="0" value={rateForm.rateValue} onChange={e => setRateForm(f => ({ ...f, rateValue: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowRateForm(false)} style={cancelBtnStyle}>Cancel</button>
              <button type="submit" disabled={rateLoading} style={primaryBtnStyle}>{rateLoading ? 'Saving…' : 'Save Rate Rule'}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ── Pay Confirm Modal ─────────────────────────────────────────────── */}
      {payTarget && (
        <ConfirmModal
          message={`Mark commission of ₱${Number(payTarget.commission_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} for ${payTarget.installer_name} as PAID?`}
          onConfirm={confirmPay}
          onCancel={() => setPayTarget(null)}
        />
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SummaryRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? '#f59e0b' : '#1e293b' }}>{value}</span>
    </div>
  )
}

function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        {children}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }
const inputStyle = { width: '100%', padding: '8px 11px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }
const selectStyle = { padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }
const cancelBtnStyle = { padding: '8px 18px', background: '#f1f5f9', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }
const primaryBtnStyle = { padding: '8px 18px', background: '#444444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
