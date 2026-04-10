import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, pushToast } from '../api/client'
import { SectionCard } from '../components/SectionCard'
import { ConfirmModal } from '../components/ConfirmModal'
import { formatCurrency } from '../data/serviceCatalog'

// ── Helper Component: Truncated Services ───────────────────────────────────
const TruncatedServices = ({ services }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  if (!Array.isArray(services) || services.length === 0) return 'N/A'
  
  const names = services.map(s => s.name)
  const limit = 2
  
  if (names.length <= limit) return names.join(', ')

  return (
    <span>
      {isExpanded ? names.join(', ') : `${names.slice(0, limit).join(', ')}... `}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#3b82f6',
          cursor: 'pointer',
          fontSize: '0.82rem',
          padding: 0,
          marginLeft: '4px',
          fontWeight: 500,
          textDecoration: 'none'
        }}
      >
        {isExpanded ? 'View Less' : 'View More'}
      </button>
    </span>
  )
}

export function JoApprovalPage({ token }) {
  const [loading, setLoading] = useState(true)
  const [jobOrders, setJobOrders] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  
  // Modals
  const [approveItem, setApproveItem] = useState(null)
  const [rejectItem, setRejectItem] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  const formatJoNoForDisplay = (value) => {
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

  const loadData = async (mode = viewMode) => {
    try {
      setLoading(true)
      const params = mode === 'active' 
        ? { status: 'Pending JO Approval' } 
        : { tab: 'approval_history' }
        
      const res = await apiGet('/job-orders', token, params)
      setJobOrders(res.data)
    } catch (err) {
      pushToast('error', 'Failed to load job orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [viewMode])

  const handleApprove = async () => {
    if (!approveItem) return
    try {
      setProcessing(true)
      await apiPost(`/job-orders/${approveItem.id}/approve`, token, {})
      pushToast('success', 'Job Order approved successfully.')
      setApproveItem(null)
      loadData()
    } catch (err) {
      pushToast('error', err.message || 'Failed to approve job order')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectItem) return
    if (!rejectReason.trim()) {
      pushToast('error', 'Rejection reason is required.')
      return
    }
    try {
      setProcessing(true)
      await apiPatch(`/job-orders/${rejectItem.id}/status`, token, {
        status: 'Cancelled',
        cancelReason: rejectReason.trim()
      })
      pushToast('success', 'Job Order rejected and cancelled.')
      setRejectItem(null)
      setRejectReason('')
      loadData()
    } catch (err) {
      pushToast('error', err.message || 'Failed to reject job order')
    } finally {
      setProcessing(false)
    }
  }

  const filteredJobOrders = jobOrders.filter((jo) => {
    const q = appliedSearch.trim().toLowerCase()
    if (!q) return true
    const servicesText = Array.isArray(jo.services) ? jo.services.map((s) => s.name).join(' ') : ''
    return [
      formatJoNoForDisplay(jo.job_order_no),
      jo.customer_name,
      servicesText,
    ].some((v) => String(v || '').toLowerCase().includes(q))
  })

  return (
    <div className="page-container joa-page">
      <SectionCard 
        title="Job Order Approval Dashboard" 
        subtitle="Review and approve newly created job orders before they move to operations."
      >
        <div className="joa-controls">
          {/* Underline Tabs */}
          <div className="joa-tabs" role="tablist" aria-label="JO approval views">
            <button 
              onClick={() => setViewMode('active')}
              className={`joa-tab-btn ${viewMode === 'active' ? 'active' : ''}`}
            >
              Active Job Orders
            </button>
            <button 
              onClick={() => setViewMode('history')}
              className={`joa-tab-btn ${viewMode === 'history' ? 'active' : ''}`}
            >
              History
            </button>
          </div>

          <div className="joa-search-row">
            <input
              type="search"
              placeholder="Search JO no., quotation no., customer, plate..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedSearch(searchTerm)
              }}
              className="joa-search-input"
            />
            <button
              type="button"
              onClick={() => setAppliedSearch(searchTerm)}
              className="btn-primary joa-search-btn"
            >
              Search
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>
        ) : jobOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 16 }}>{viewMode === 'active' ? 'No pending job orders requiring approval.' : 'No approval history found.'}</p>
          </div>
        ) : filteredJobOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 16 }}>No matching records found.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Job Order No</th>
                  <th style={{ textAlign: 'center' }}>Customer</th>
                  <th style={{ textAlign: 'center' }}>Service</th>
                  <th style={{ textAlign: 'center' }}>Total Amount</th>
                  <th style={{ textAlign: 'center' }}>{viewMode === 'active' ? 'Proposed Schedule' : 'Approved Date'}</th>
                  <th style={{ textAlign: 'center' }}>{viewMode === 'active' ? 'Actions' : 'Current Status'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobOrders.map(jo => {
                  const servicesList = Array.isArray(jo.services) 
                    ? jo.services.map(s => s.name).join(', ') 
                    : 'N/A'
                    
                  const dateStr = viewMode === 'active'
                    ? (jo.schedule_start ? new Date(jo.schedule_start).toLocaleDateString() : 'N/A')
                    : (jo.pending_at ? new Date(jo.pending_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

                  return (
                    <tr key={jo.id}>
                      <td className="mono" style={{ textAlign: 'center' }}>{formatJoNoForDisplay(jo.job_order_no)}</td>
                      <td style={{ textAlign: 'center' }}>{jo.customer_name}</td>
                      <td style={{ textAlign: 'center' }}>
                        <TruncatedServices services={jo.services} />
                      </td>
                      <td style={{ fontWeight: 600, textAlign: 'center' }}>{formatCurrency(jo.quotation_amount || 0)}</td>
                      <td style={{ textAlign: 'center' }}>{dateStr}</td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {viewMode === 'active' ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                            <button
                              className="btn-primary"
                              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 10 }}
                              onClick={() => setApproveItem(jo)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn-danger-outline"
                              style={{ 
                                padding: '8px 16px', 
                                fontSize: 13, 
                                borderRadius: 4,
                                background: '#f2f2f2',
                                color: '#ff4d4d',
                                border: '1px solid #dcdcdc',
                                cursor: 'pointer',
                                fontWeight: 500,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                              onClick={() => setRejectItem(jo)}
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className={`status-badge badge-${jo.status === 'Cancelled' ? 'danger' : 'success'}`} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                            {jo.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* APPROVE MODAL */}
      {approveItem && (
        <ConfirmModal
          isOpen={true}
          title="Approve Job Order"
          confirmText="Approve Job Order"
          cancelText="Cancel"
          confirmColor="var(--primary-color)"
          onConfirm={handleApprove}
          onCancel={() => setApproveItem(null)}
          loading={processing}
        >
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '12px' }}>
              You are approving Job Order <strong>{formatJoNoForDisplay(approveItem.job_order_no)}</strong>
            </p>
            
            <div style={{ 
              background: 'rgba(255,255,255,0.05)', 
              padding: '16px', 
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px 24px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Customer</label>
                <div style={{ fontWeight: 600 }}>{approveItem.customer_name}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Plate Number</label>
                <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{approveItem.plate_number || 'N/A'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Vehicle</label>
                <div style={{ fontWeight: 600 }}>{approveItem.make} {approveItem.model} {approveItem.vehicle_year}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Amount</label>
                <div style={{ fontWeight: 700, color: '#10b981' }}>{formatCurrency(approveItem.quotation_amount || 0)}</div>
              </div>
            </div>
            
            {approveItem.notes && (
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Notes</label>
                <div style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', fontStyle: 'italic' }}>
                  "{approveItem.notes}"
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>
            Once approved, the status will move to <strong>Pending</strong>.
          </p>
        </ConfirmModal>
      )}

      {/* REJECT MODAL */}
      {rejectItem && (
        <ConfirmModal
          isOpen={true}
          title="Reject Job Order"
          confirmText="Reject Job Order"
          cancelText="Cancel"
          confirmColor="#ef4444"
          onConfirm={handleReject}
          onCancel={() => {
            setRejectItem(null)
            setRejectReason('')
          }}
          loading={processing}
        >
          <p style={{ marginBottom: 16 }}>
            Please provide a reason for rejecting Job Order <strong>{formatJoNoForDisplay(rejectItem.job_order_no)}</strong>. This will cancel the linked quotation and appointment.
          </p>
          <div className="form-group">
            <textarea
              className="form-control"
              placeholder="E.g., Missing vehicle details, schedule conflict..."
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
            />
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}
