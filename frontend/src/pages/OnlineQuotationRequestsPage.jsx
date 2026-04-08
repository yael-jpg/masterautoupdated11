import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, pushToast } from '../api/client'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PaginationBar } from '../components/PaginationBar'
import './QuotationsPage.css' // Using Quotations styling to keep UI consistent

const STATUS_OPTIONS = ['New', 'In Progress', 'Followed Up', 'Invalid', 'Archived']

function getRequestedServiceLabel(r) {
  const name = typeof r?.service_name === 'string' ? r.service_name.trim() : ''
  if (name) return name

  const code = typeof r?.service_code === 'string' ? r.service_code.trim() : ''
  if (code) return code

  // Backward-compat: older records used a string code in service_id
  const legacy = typeof r?.service_id === 'string' ? r.service_id.trim() : ''
  if (legacy) return legacy

  return '—'
}

function normalizeLeadNotes(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''

  // Legacy records stored an auto-generated summary block in notes.
  // Keep only the guest-entered portion when present.
  if (!/^\[ONLINE QUOTATION REQUEST\]/i.test(text)) return text

  const dropPrefixes = [
    /^\[ONLINE QUOTATION REQUEST\]/i,
    /^Branch:/i,
    /^Preferred start:/i,
    /^Estimated end:/i,
    /^Vehicle size:/i,
    /^Make\/Model:/i,
    /^Requested service:/i,
  ]

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const kept = lines.filter((line) => !dropPrefixes.some((rx) => rx.test(line)))
  return kept.join('\n').trim()
}

function StatusBadge({ status }) {
  const s = status || 'New'
  const norm = s.toLowerCase().replace(/\s+/g, '-')
  let cls = 'crm-status-badge status-draft'
  if (norm === 'in-progress') cls = 'crm-status-badge status-pending'
  if (norm === 'followed-up') cls = 'crm-status-badge status-approved'
  if (norm === 'invalid') cls = 'crm-status-badge status-not-approved'
  if (norm === 'archived') cls = 'crm-status-badge status-released'
  
  return <span className={cls}>{s.toUpperCase()}</span>
}

export function OnlineQuotationRequestsPage({ token, user: _user, onConvert }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [viewItem, setViewItem] = useState(null)
  const [confirmCfg, setConfirmCfg] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      const chime = (freq, start) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.5);
      };

      chime(880, now); // A5
      chime(1108.73, now + 0.1); // C#6
    } catch (e) {
      // Audio might be blocked by browser until user interacts
    }
  };

  const load = async (p = 1, s = search, st = statusFilter) => {
    setLoading(true)
    setError('')
    try {
      const res = await apiGet('/online-quotation-requests', token, { page: p, limit: 10, search: s, status: st })
      setRequests(res.data)
      setPagination(res.pagination)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(page, search, statusFilter)
  }, [page, statusFilter])

  // Auto-refresh and play sound when new online requests arrive
  useEffect(() => {
    const handler = (e) => {
      // Only play sound if it's from a 'public' source (a new lead),
      // not a 'staff' action like deleting or status updates.
      if (e?.detail?.source && e.detail.source !== 'staff') {
        playNotificationSound()
      }
      load(page, search, statusFilter)
    }
    window.addEventListener('ma:online-quotation-requests-updated', handler)
    return () => window.removeEventListener('ma:online-quotation-requests-updated', handler)
  }, [page, search, statusFilter])

  const handleSearchChange = (val) => {
    setSearch(val)
    setPage(1)
    load(1, val, statusFilter)
  }

  const handleStatusUpdate = async (id, status) => {
    try {
      await apiPatch(`/online-quotation-requests/${id}/status`, token, { status })
      load(page, search, statusFilter)
      window.dispatchEvent(new CustomEvent('ma:online-quotation-requests-updated', { detail: { source: 'staff', requestId: id } }))
      if (viewItem?.id === id) setViewItem(prev => ({ ...prev, status }))
      pushToast('success', `Status updated to ${status}`)
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  const handleDelete = (id) => {
    setConfirmCfg({
      isOpen: true,
      title: 'Delete Request',
      message: 'Are you sure you want to delete this online request?',
      onConfirm: async () => {
        try {
          await apiDelete(`/online-quotation-requests/${id}`, token)
          load(page, search, statusFilter)
          window.dispatchEvent(new CustomEvent('ma:online-quotation-requests-updated', { detail: { source: 'staff', requestId: id } }))
          setConfirmCfg(p => ({ ...p, isOpen: false }))
          pushToast('success', 'Request deleted')
        } catch (e) {
          pushToast('error', e.message)
        }
      }
    })
  }

  return (
    <div className="page-grid">
      <SectionCard 
        title="Online Quotation" 
        subtitle="Manage and vet inquiries from the public quotation portal before converting them into formal quotes."
      >
        <div className="module-toolbar">
          <input
            type="search"
            placeholder="Search name, phone, email, plate..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <div className="toolbar-filters">
            {['', ...STATUS_OPTIONS].map((s) => (
              <button
                key={s || 'all'}
                type="button"
                className={`filter-chip${statusFilter === s ? ' active' : ''}`}
                onClick={() => { setStatusFilter(s); setPage(1) }}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="form-error-text" style={{ padding: '0 20px' }}>{error}</p>}

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table qo-table">
            <thead>
              <tr>
                <th>Date Submitted</th>
                <th>Guest / Contact</th>
                <th>Vehicle Detail</th>
                <th>Branch</th>
                <th>Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && requests.length === 0 && (
                <tr><td colSpan={6} className="table-empty">Loading leads...</td></tr>
              )}
              {!loading && requests.length === 0 && (
                <tr><td colSpan={6} className="table-empty">No workspace leads found for the selected filter.</td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id} onClick={() => setViewItem(r)} style={{ cursor: 'pointer' }}>
                  <td>
                    <span className="td-name">{new Date(r.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <div className="td-sub" style={{ marginTop: 4 }}>{new Date(r.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td>
                    <span className="td-name">{r.full_name}</span>
                    <div className="td-sub" style={{ marginTop: 4, color: '#3498db', fontWeight: 600 }}>{r.mobile}</div>
                    {r.email && <div className="td-sub">{r.email}</div>}
                  </td>
                  <td>
                    <span className="td-name">{r.vehicle_make} {r.vehicle_model}</span>
                    <div className="td-sub" style={{ marginTop: 4 }}>Plate: <strong style={{ color: '#fff' }}>{r.vehicle_plate || '—'}</strong></div>
                    <div className="td-sub" style={{ textTransform: 'capitalize' }}>{r.vehicle_size} size</div>
                    <div className="td-sub">Service: <strong style={{ color: '#fff' }}>{getRequestedServiceLabel(r)}</strong></div>
                  </td>
                  <td>
                    <span className="td-sub">{r.branch || 'N/A'}</span>
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="btn-icon" title="View Details" onClick={() => setViewItem(r)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button className="btn-icon action-danger" title="Delete Permanent" onClick={() => handleDelete(r.id)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
        />
      </SectionCard>

      {/* Detail Modal */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title="Inquiry Detail" wide>
        {viewItem && (
          <div className="qo-detail">
            {/* Lead Status / Date Strip */}
            <div style={{ display: 'flex', gap: 24, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.03)', marginBottom: 18 }}>
               <div className="qo-detail-meta">
                  <span className="qo-meta-label">Submitted On</span>
                  <span style={{ fontSize: '1rem', fontWeight: 600 }}>{new Date(viewItem.created_at).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
               </div>
               <div style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
               <div className="qo-detail-meta">
                  <span className="qo-meta-label">Current Status</span>
                  <StatusBadge status={viewItem.status} />
               </div>
            </div>

            <div className="qo-detail-grid">
              <div className="qo-info-block">
                <h4>Guest Information</h4>
                <p className="qo-info-name">{viewItem.full_name}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem', color: '#cbd5e1' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.38 2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>
                    <strong>{viewItem.mobile}</strong>
                  </div>
                  {viewItem.email && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      <span>{viewItem.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="qo-info-block">
                <h4>Vehicle Details</h4>
                <p className="qo-info-name">{viewItem.vehicle_make} {viewItem.vehicle_model}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem', color: '#cbd5e1' }}>
                  <div>Plate: <strong style={{ color: '#fff' }}>{viewItem.vehicle_plate || '—'}</strong></div>
                  <div>Size Category: <span style={{ textTransform: 'capitalize' }}>{viewItem.vehicle_size}</span></div>
                </div>
              </div>
            </div>

            <div className="qo-notes" style={{ marginTop: 20 }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'rgba(189,200,218,0.5)' }}>Request Context</h4>
              <div style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#f1f5f9' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, display: 'block' }}>Branch Selection</span>
                    <strong>{viewItem.branch || 'Any / Manila'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, display: 'block' }}>Preferred Date</span>
                    <strong>{viewItem.preferred_date ? new Date(viewItem.preferred_date).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Flexible'}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5, display: 'block' }}>Requested Service</span>
                    <strong>{getRequestedServiceLabel(viewItem)}</strong>
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 8, borderLeft: '3px solid #3498db', whiteSpace: 'pre-wrap' }}>
                  {normalizeLeadNotes(viewItem.notes)}
                </div>
              </div>
            </div>

            <div className="qo-detail-actions">
              <div style={{ flex: 1 }} />

              <button 
                className="btn-approve-large" 
                onClick={() => {
                   if (onConvert) onConvert(viewItem)
                   window.dispatchEvent(new CustomEvent('ma:online-quotation-requests-updated', { detail: { source: 'staff', requestId: viewItem.id } }))
                   setViewItem(null)
                }}
              >
                Proceed to Quotation
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmCfg.isOpen}
        title={confirmCfg.title}
        message={confirmCfg.message}
        onConfirm={confirmCfg.onConfirm}
        onClose={() => setConfirmCfg(p => ({ ...p, isOpen: false }))}
      />
    </div>
  )
}
