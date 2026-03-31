import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost, apiDelete, pushToast } from '../api/client'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PaginationBar } from '../components/PaginationBar'
import { formatCurrency } from '../data/serviceCatalog'
import { WorkflowStatusBadge } from '../components/WorkflowStatusBadge'
import { WorkflowStepper } from '../components/WorkflowStepper'
import { PaymentStatusBadge } from '../components/PaymentStatusBadge'
import { onConfigUpdated } from '../utils/events'

function normalizeServiceCode(code) {
  const raw = String(code || '').trim()
  if (!raw) return ''
  return raw.replace(/^CAT-/i, '').toLowerCase()
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Workflow constants (mirrors workflowEngine.js) ───────────────────────────

const JO_STATUS_ORDER = ['Pending JO Approval', 'Pending', 'In Progress', 'For QA', 'Completed', 'Released', 'Complete']
const JO_TERMINAL = new Set(['Complete', 'Cancelled', 'Deleted'])
const JO_STATUSES = [...JO_STATUS_ORDER, 'Cancelled', 'Deleted']

// Statuses where cancellation is blocked (work already in flight or done)
const CANCEL_BLOCKED_STATUSES = new Set(['In Progress', 'For QA', 'Completed', 'Released'])
// Payment statuses where cancellation is blocked (money already received)
const CANCEL_BLOCKED_PAYMENTS = new Set(['PAID', 'PARTIALLY_PAID', 'SETTLED'])

const JO_STAGE_ROLES = {
  'Pending JO Approval': ['SuperAdmin'],
  'Pending': ['Admin', 'SuperAdmin'],
  'In Progress': ['Admin', 'SuperAdmin'],
  'For QA': ['Admin', 'SuperAdmin'],
  'Completed': ['Admin', 'SuperAdmin'],
  'Released': ['Admin', 'SuperAdmin'],
  'Complete': ['Admin', 'SuperAdmin'],
  'Cancelled': ['Admin', 'SuperAdmin'],
}

function getNextJoStatus(current) {
  const idx = JO_STATUS_ORDER.indexOf(current)
  if (idx === -1 || idx === JO_STATUS_ORDER.length - 1) return null
  return JO_STATUS_ORDER[idx + 1]
}

function canAdvanceTo(nextStatus, userRole) {
  const allowed = JO_STAGE_ROLES[nextStatus]
  if (!allowed) return true
  return allowed.includes(userRole)
}

function canCancel(currentStatus, userRole) {
  if (JO_TERMINAL.has(currentStatus)) return false
  return ['Admin', 'Manager', 'SuperAdmin'].includes(userRole)
}

// Returns a block reason when the customer has not yet paid ≥50% of the total
// Returns null when the advance is allowed.
function get50PctBlockReason(jo) {
  if (jo.pending_at) return null; // Waived if approved securely by SuperAdmin in JO approval dashboard
  const totalAmount = Number(jo.total_paid || 0) + Number(jo.balance || 0)
  if (totalAmount <= 0) return null // no amount on record — allow
  const paidPct = (Number(jo.total_paid || 0) / totalAmount) * 100
  if (paidPct < 50) {
    const paid = Number(jo.total_paid || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
    const total = totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })
    return `At least 50% payment is required before advancing this job order. Paid: ₱${paid} / ₱${total} (${Math.floor(paidPct)}%).`
  }
  return null
}

// ── Print eligibility ───────────────────────────────────────────────────────
// Returns { eligible, status, label, pct } for the print button.
// status: 'free' | 'unpaid' | 'partial' | 'paid'
function getPrintEligibility(jo, guardEnabled) {
  if (!guardEnabled) return { eligible: true, status: 'free', label: 'Print JO', pct: null }
  if (jo.pending_at) return { eligible: true, status: 'free', label: '🟢 SuperAdmin Approved – Eligible to Print', pct: 100 }
  const paid = Number(jo.total_paid || 0)
  // quotation_amount may be absent from list rows — fall back to paid + outstanding balance
  const total = Number(jo.quotation_amount || 0) || (paid + Number(jo.balance || 0))
  if (total <= 0) return { eligible: false, status: 'unpaid', label: '🔴 Not Eligible – Payment < 50%', pct: 0 }
  const pct = (paid / total) * 100
  if (pct < 50) return { eligible: false, status: 'unpaid', label: '🔴 Not Eligible – Payment < 50%', pct }
  if (pct < 100) return { eligible: true, status: 'partial', label: '🟡 50% Downpaid – Eligible to Print', pct }
  return { eligible: true, status: 'paid', label: '🟢 Fully Paid – Eligible to Print', pct }
}

// Returns a human-readable reason WHY cancel is blocked (null = not blocked)
function getCancelBlockReason(currentStatus, paymentStatus) {
  if (currentStatus === 'Deleted') {
    return 'This Job Order is already "Deleted" and cannot be cancelled.'
  }
  if (CANCEL_BLOCKED_STATUSES.has(currentStatus)) {
    return `This Job Order is already "${currentStatus}" and cannot be cancelled. Only Pending jobs can be cancelled.`
  }
  if (CANCEL_BLOCKED_PAYMENTS.has(paymentStatus)) {
    const label = paymentStatus === 'PAID' ? 'fully paid' : paymentStatus === 'SETTLED' ? 'settled' : 'partially paid'
    return `This Job Order cannot be cancelled because payment has already been ${label}. Please contact an administrator for exceptions.`
  }
  return null
}

function InstallerPicker({ selected, onChange, presets = [], limit }) {
  const toggle = (name) => {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name))
    } else {
      if (limit === 1) {
        onChange([name])
      } else if (limit && selected.length >= limit) {
        return
      } else {
        onChange([...selected, name])
      }
    }
  }

  return (
    <div className="installer-picker">
      <div className="installer-presets">
        {presets.map((name) => (
          <button
            key={name}
            type="button"
            className={`installer-chip${selected.includes(name) ? ' selected' : ''}`}
            onClick={() => toggle(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="installer-selected">
          {selected.map((n) => (
            <span key={n} className="installer-tag">
              {n}
              <button type="button" onClick={() => toggle(n)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PPF date helpers ──────────────────────────────────────────────────────────

function isPpfJob(services) {
  if (!Array.isArray(services)) return false
  return services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    const group = String(s.group || '').toLowerCase()
    return code.startsWith('ppf-') || group.includes('ppf')
  })
}

function isCoatingJob(services) {
  if (!Array.isArray(services)) return false
  return services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    const group = String(s.group || '').toLowerCase()
    const name = String(s.name || '').toLowerCase()
    return code.includes('coat') || group.includes('coating') || name.includes('ceramic coating') || name.includes('graphene coating') || name.includes('coat')
  })
}

function isDetailingJob(services) {
  if (!Array.isArray(services)) return false
  return services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    const group = String(s.group || '').toLowerCase()
    const name = String(s.name || '').toLowerCase()
    return (
      code.startsWith('detail-')
      || group.includes('detailing')
      || name.includes('detail')
      || group.includes('detail')
    )
  })
}

function isTintJob(services) {
  if (!Array.isArray(services)) return false
  return services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    const group = String(s.group || '').toLowerCase()
    const name = String(s.name || '').toLowerCase()
    return (
      code.startsWith('tint-')
      || group.includes('tint')
      || name.includes('tint')
    )
  })
}

function ppfOffsetDate(dateStr, offsetDays) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatJoNumber(jo) {
  if (!jo || !jo.job_order_no) return ''
  const joNo = jo.job_order_no
  if (!joNo.startsWith('JO-20')) return joNo

  let branch = 'BR'
  if (jo.quotation_no) {
    const match = jo.quotation_no.match(/^QT-([A-Z]{2,3})-/)
    if (match) branch = match[1]
  }
  return joNo.replace(/^JO-20(\d{2})/, `JO-${branch}-0$1`)
}

function displayJoBranch(jo) {
  const bay = String(jo?.customer_bay || '').trim()
  if (bay) return bay
  const qtMatch = String(jo?.quotation_no || '').match(/^QT-([A-Z]{2,3})-/)
  if (qtMatch) return qtMatch[1]
  const joMatch = String(jo?.job_order_no || '').match(/^JO-([A-Z]{2,3})-/)
  if (joMatch) return joMatch[1]
  return '—'
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function JobOrdersPage({ token, user, fromQuotation, onFromQuotationConsumed, openJobOrderId, onOpenJobOrderConsumed }) {
  const [jobOrders, setJobOrders] = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewMode, setViewMode] = useState('active') // 'active' | 'history'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [workerPresets, setWorkerPresets] = useState([])
  const [preparedByPresets, setPreparedByPresets] = useState([])

  // Materials notes lookup from DB services (keyed by normalized code)
  const [materialsNotesByCode, setMaterialsNotesByCode] = useState({})
  useEffect(() => {
    if (!token) return
    apiGet('/services', token)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        const next = {}
        for (const svc of list) {
          const key = normalizeServiceCode(svc?.code)
          if (!key) continue
          const notes = String(svc?.materials_notes || '').trim()
          if (notes) next[key] = notes
        }
        setMaterialsNotesByCode(next)
      })
      .catch(() => {
        // non-blocking
      })
  }, [token])

  // Create JO form
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ quotationId: '', assignedInstallers: [], preparedBy: [], notes: '' })
  const [createError, setCreateError] = useState('')
  const [quotationPreview, setQuotationPreview] = useState(null)

  // Detail modal
  const [viewItem, setViewItem] = useState(null)

  // Inline installer editing in detail modal
  const [editInstallers, setEditInstallers] = useState(null) // null = not editing, array = editing
  const [editPreparedBy, setEditPreparedBy] = useState(null)
  const [savingInstallers, setSavingInstallers] = useState(false)

  // Status change confirm
  const [confirmCfg, setConfirmCfg] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } })

  // Cancel modal (with mandatory reason)
  const [cancelModal, setCancelModal] = useState({ isOpen: false, jo: null, reason: '', saving: false })
  // Cancel blocked warning
  const [cancelWarn, setCancelWarn] = useState({ isOpen: false, message: '' })
  // Delete modal (Admin/Manager, Pending JOs only)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, jo: null, saving: false })

  // Conditional release
  const [forceReleaseJO, setForceReleaseJO] = useState({
    isOpen: false, jobOrder: null, totalAmount: 0, totalPaid: 0, balance: 0, reason: ''
  })

  // Print payment guard setting (default true — enforced unless explicitly disabled in Settings)
  const [requirePaymentBeforePrint, setRequirePaymentBeforePrint] = useState(true)
  useEffect(() => {
    apiGet('/config', token).then((res) => {
      const data = res.data || res
      // Response is { category: [{key, value}, ...], ... } — flatten across all categories
      let val = undefined
      if (data && typeof data === 'object') {
        for (const entries of Object.values(data)) {
          if (Array.isArray(entries)) {
            const found = entries.find((e) => e.key === 'require_downpayment_before_print')
            if (found) { val = found.value; break }
          }
        }
      }
      setRequirePaymentBeforePrint(val === true || val === 'true' || val === '1')
    }).catch(() => { })
  }, [token])

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = async (pg = page, srch = search, st = filterStatus, tab = viewMode) => {
    setLoading(true)
    try {
      const res = await apiGet('/job-orders', token, {
        page: pg,
        limit: 10,
        search: srch,
        tab,
        // Only forward status sub-filter when on the Active tab
        ...(tab === 'active' && st ? { status: st } : {}),
      })
      const rows = Array.isArray(res.data) ? res.data : []
      const cleaned = tab === 'active'
        ? rows.filter((r) => String(r?.status || '').trim() !== 'Deleted')
        : rows
      setJobOrders(cleaned)
      setPagination(res.pagination)
      setPage(res.pagination.page)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1, search, filterStatus, viewMode) }, [token])

  const loadRolesPresets = useCallback(async () => {
    try {
      const entries = await apiGet('/config/category/roles', token)
      if (!Array.isArray(entries)) return

      const workerEntry = entries.find((e) => e.key === 'assigned_workers')
      if (workerEntry?.value) {
        try {
          const parsed = JSON.parse(workerEntry.value)
          if (Array.isArray(parsed)) setWorkerPresets(parsed)
        } catch { /* use empty array */ }
      }

      const preparedByEntry = entries.find((e) => e.key === 'prepared_by_names')
      if (preparedByEntry?.value) {
        try {
          const parsed = JSON.parse(preparedByEntry.value)
          if (Array.isArray(parsed)) setPreparedByPresets(parsed)
        } catch { /* use empty array */ }
      }
    } catch {
      // ignore
    }
  }, [token])

  // Load assigned workers & prepared by presets from configuration
  useEffect(() => {
    loadRolesPresets()
    const off = onConfigUpdated((e) => {
      const cat = e?.detail?.category
      if (!cat || cat === 'roles') loadRolesPresets()
    })
    return off
  }, [loadRolesPresets])

  // Re-fetch when viewMode changes
  useEffect(() => { load(1, search, filterStatus, viewMode) }, [viewMode])

  // If navigated here from QuotationsPage with an approved quotation, auto-open create form
  useEffect(() => {
    if (fromQuotation) {
      setCreateForm({ quotationId: fromQuotation.id, assignedInstallers: [], preparedBy: [], notes: '' })
      setQuotationPreview(fromQuotation)
      setCreateError('')
      setShowCreate(true)
      if (onFromQuotationConsumed) onFromQuotationConsumed()
    }
  }, [fromQuotation])

  // If navigated here from Scheduling after Start Job, auto-open that job order
  useEffect(() => {
    if (openJobOrderId) {
      apiGet(`/job-orders/${openJobOrderId}`, token)
        .then((jo) => {
          setViewItem(jo)
          setEditInstallers(jo.assigned_installers || [])
          setEditPreparedBy(jo.prepared_by || [])
          if (onOpenJobOrderConsumed) onOpenJobOrderConsumed()
        })
        .catch(() => { if (onOpenJobOrderConsumed) onOpenJobOrderConsumed() })
    }
  }, [openJobOrderId])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleSearch = (val) => { setSearch(val); load(1, val, filterStatus, viewMode) }
  const handleFilterStatus = (val) => { setFilterStatus(val); load(1, search, val, viewMode) }

  const closeCreate = () => {
    setShowCreate(false)
    setCreateForm({ quotationId: '', assignedInstallers: [], preparedBy: [], notes: '' })
    setQuotationPreview(null)
    setCreateError('')
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    setCreateError('')
    if (!createForm.quotationId) {
      setCreateError('Quotation ID is required.')
      return
    }
    try {
      const result = await apiPost('/job-orders', token, {
        quotationId: Number(createForm.quotationId),
        assignedInstallers: createForm.assignedInstallers,
        preparedBy: createForm.preparedBy,
        notes: createForm.notes,
      })
      closeCreate()
      await load(1, search, filterStatus)
      pushToast('success', `Job Order ${result.job_order_no} created successfully!`)
      // Auto-open detail of the new job order
      const detail = await apiGet(`/job-orders/${result.id}`, token)
      setViewItem(detail)
    } catch (e) {
      setCreateError(e.message)
    }
  }

  const handleStatusChange = (id, status) => {
    setConfirmCfg({
      isOpen: true,
      title: `Set Status: ${status}`,
      message: `Mark this Job Order as "${status}"?`,
      onConfirm: async () => {
        try {
          const result = await apiPatch(`/job-orders/${id}/status`, token, { status })
          await load(page, search, filterStatus)
          if (viewItem?.id === id) setViewItem((p) => ({ ...p, status }))
          setConfirmCfg((p) => ({ ...p, isOpen: false }))
          pushToast('update', `Job Order advanced to ${status}.`)
          if (result?.appointmentSynced) {
            pushToast('update', `Scheduling also updated: ${result.appointmentSynced.from} → ${result.appointmentSynced.to}.`)
          }
        } catch (e) {
          setConfirmCfg((p) => ({ ...p, isOpen: false }))
          // Payment guard — open conditional release modal
          if (e.requiresOverride || e.hasOwnProperty('outstanding_balance')) {
            const jo = jobOrders.find(j => j.id === id) || viewItem
            setForceReleaseJO({
              isOpen: true,
              jobOrder: jo || { id },
              totalAmount: Number(e.total_amount || 0),
              totalPaid: Number(e.total_paid || 0),
              balance: Number(e.outstanding_balance || 0),
              reason: '',
            })
          } else {
            setError(e.message)
          }
        }
      },
    })
  }

  // ── Cancel flow ───────────────────────────────────────────────────────────
  const handleCancelClick = (jo) => {
    if (!['Admin', 'Manager'].includes(user?.role)) return
    if (JO_TERMINAL.has(jo.status)) return
    const blockReason = getCancelBlockReason(jo.status, jo.payment_status)
    if (blockReason) {
      setCancelWarn({ isOpen: true, message: blockReason })
      return
    }
    setCancelModal({ isOpen: true, jo, reason: '', saving: false })
  }

  const handleCancelConfirm = async () => {
    if (!cancelModal.reason.trim()) {
      pushToast('warning', 'Please enter a cancellation reason before proceeding.')
      return
    }
    setCancelModal((p) => ({ ...p, saving: true }))
    try {
      const result = await apiPatch(`/job-orders/${cancelModal.jo.id}/status`, token, {
        status: 'Cancelled',
        cancelReason: cancelModal.reason.trim(),
      })
      await load(page, search, filterStatus)
      if (viewItem?.id === cancelModal.jo.id) setViewItem((p) => ({ ...p, status: 'Cancelled' }))
      setCancelModal({ isOpen: false, jo: null, reason: '', saving: false })
      pushToast('warning', `Job Order ${formatJoNumber(cancelModal.jo)} cancelled.${cancelModal.jo?.quotation_id ? ' Linked scheduling and quotation also cancelled.' : ''
        }`)
      if (result?.appointmentSynced) {
        pushToast('update', `Scheduling also updated: ${result.appointmentSynced.from} \u2192 ${result.appointmentSynced.to}.`)
      }
    } catch (e) {
      setCancelModal((p) => ({ ...p, saving: false }))
      pushToast('error', e.message || 'Failed to cancel job order.')
    }
  }

  const handleDeleteClick = (jo) => {
    setDeleteModal({ isOpen: true, jo, saving: false })
  }

  const handleDeleteConfirm = async () => {
    setDeleteModal((p) => ({ ...p, saving: true }))
    try {
      await apiDelete(`/job-orders/${deleteModal.jo.id}`, token)
      // Deleted job orders belong in History
      setViewMode('history')
      await load(1, search, filterStatus, 'history')
      if (viewItem?.id === deleteModal.jo.id) setViewItem(null)
      setDeleteModal({ isOpen: false, jo: null, saving: false })
      pushToast('warning', `Job Order ${formatJoNumber(deleteModal.jo)} deleted.${deleteModal.jo.quotation_id ? ' Linked scheduling and quotation also cancelled.' : ''
        }`)
    } catch (e) {
      setDeleteModal((p) => ({ ...p, saving: false }))
      pushToast('error', e.message || 'Failed to delete job order.')
    }
  }

  const handleView = async (id) => {
    try {
      const res = await apiGet(`/job-orders/${id}`, token)
      setViewItem(res)
      setEditInstallers(res.assigned_installers || [])
      setEditPreparedBy(res.prepared_by || [])
    } catch (e) {
      pushToast('error', e.message || 'Failed to load details')
    }
  }

  const handleSaveInstallers = async () => {
    if (!viewItem) return
    setSavingInstallers(true)
    try {
      const updated = await apiPatch(`/job-orders/${viewItem.id}`, token, {
        assignedInstallers: editInstallers,
        preparedBy: editPreparedBy,
        notes: viewItem.notes,
      })
      const data = updated.data || updated
      setViewItem((p) => ({
        ...p,
        assigned_installers: data.assigned_installers || data.assignedInstallers || data.installers || p.assigned_installers,
        prepared_by: data.prepared_by || data.preparedBy || data.prepared_by_names || p.prepared_by
      }))
      await load(page, search, filterStatus)
      pushToast('success', 'Installers saved.')
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setSavingInstallers(false)
    }
  }

  const handlePrint = (jo) => {
    const statusColors = {
      pending: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
      'in progress': { bg: '#f3f4f6', color: '#374151', dot: '#6b7280' },
      'for qa': { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' },
      completed: { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
      released: { bg: '#d1fae5', color: '#065f46', dot: '#059669' },
      cancelled: { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    }
    const st = statusColors[(jo.status || '').toLowerCase()] || { bg: '#f3f4f6', color: '#374151', dot: '#9ca3af' }

    // Helper to safely get array data from various field names and formats
    const getPrintArray = (obj, fields) => {
      if (!obj) return [];
      for (const f of fields) {
        let val = obj[f];
        if (val === undefined || val === null) continue;

        // Handle array
        if (Array.isArray(val)) {
          if (val.length === 0) continue;
          return val.map(item => (typeof item === 'object' && item !== null) ? (item.name || item.label || JSON.stringify(item)) : String(item));
        }

        // Handle stringified JSON or plain string
        if (typeof val === 'string') {
          val = val.trim();
          if (!val) continue;
          if (val.startsWith('[')) {
            try {
              const parsed = JSON.parse(val);
              if (Array.isArray(parsed)) {
                if (parsed.length === 0) continue;
                return parsed.map(item => (typeof item === 'object' && item !== null) ? (item.name || item.label || JSON.stringify(item)) : String(item));
              }
            } catch (e) { /* fall through */ }
          }
          return [val];
        }
      }
      return [];
    };

    const serviceRows = (jo.services || []).map((s) => {
      const notes = materialsNotesByCode[normalizeServiceCode(s?.code)]
      const clean = String(notes || '').trim()
      return `
      <tr>
        <td>
          <span class="svc-name">${escapeHtml(s.name)}</span>
          ${s.group ? `<span class="svc-group">${escapeHtml(s.group)}</span>` : ''}
          ${clean ? `<span class="svc-group">Materials: ${escapeHtml(clean)}</span>` : ''}
        </td>
        <td style="text-align:right;font-weight:600;color:#111">${s.qty}</td>
      </tr>`
    }).join('')

    const installers = getPrintArray(jo, ['assigned_installers', 'assignedInstallers', 'installers']);
    const installerList = installers.length
      ? installers.map((n) => `<span class="tag"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${n}</span>`).join(' ')
      : '<em style="color:#aaa;font-size:12px">None assigned</em>';

    const pBy = getPrintArray(jo, ['prepared_by', 'preparedBy', 'prepared_by_names']);
    const preparedByList = pBy.length
      ? pBy.map((n) => `<span class="tag"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>${n}</span>`).join(' ')
      : '<em style="color:#aaa;font-size:12px">None assigned</em>';

    // For print, shift dates and standardize times as requested
    const printStartDate = jo.schedule_start ? new Date(jo.schedule_start) : null
    if (printStartDate) {
      printStartDate.setDate(printStartDate.getDate() + 1)
      printStartDate.setHours(8, 0, 0, 0) // All starts at 8:00 AM
    }

    let printEndDate = jo.schedule_end ? new Date(jo.schedule_end) : null
    if (printEndDate) {
      if (isPpfJob(jo.services)) {
        // PPF: Start + 4 days
        printEndDate = new Date(printStartDate)
        printEndDate.setDate(printStartDate.getDate() + 4)
      } else if (isCoatingJob(jo.services)) {
        // Coating: Start + 1 day
        printEndDate = new Date(printStartDate)
        printEndDate.setDate(printStartDate.getDate() + 1)
      } else if (isDetailingJob(jo.services) || isTintJob(jo.services)) {
        // Detailing / Tint: Start + 2 days (e.g. Mar 18 to Mar 20)
        printEndDate = new Date(printStartDate)
        printEndDate.setDate(printStartDate.getDate() + 2)
      } else {
        // Others: System End + 1 day
        printEndDate.setDate(printEndDate.getDate() + 1)
      }
      printEndDate.setHours(15, 0, 0, 0) // Consistent 3:00 PM end time for professional look
    }

    const schedStartPrint = printStartDate ? printStartDate.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
    const schedEndPrint = printEndDate ? printEndDate.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Job Order — ${escapeHtml(formatJoNumber(jo))}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #fff; padding: 36px 40px; max-width: 780px; margin: 0 auto; }

    /* ── Header ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 1.5px solid #e5e7eb; margin-bottom: 22px; }
    .brand-name { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .doc-right { text-align: right; }
    .doc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #6b7280; }
    .doc-number { font-size: 18px; font-weight: 800; color: #111; margin-top: 3px; }

    /* ── Meta row ── */
    .meta-row { display: flex; gap: 0; margin-bottom: 22px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .meta-item { flex: 1; padding: 12px 18px; border-right: 1px solid #e5e7eb; }
    .meta-item:last-child { border-right: none; }
    .meta-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #9ca3af; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #111; }
    .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    /* ── Info grid ── */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
    .info-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; position: relative; overflow: hidden; }
    .info-block::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #374151; }
    .info-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #374151; margin-bottom: 8px; }
    .info-name { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 5px; }
    .info-line { font-size: 12px; color: #4b5563; margin-bottom: 3px; }
    .info-schedule { font-size: 11px; color: #374151; margin-top: 6px; display: flex; align-items: center; gap: 5px; }

    /* ── Section title ── */
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.3px; color: #6b7280; margin: 22px 0 10px; display: flex; align-items: center; gap: 8px; }
    .section-title::before { content: ''; display: inline-block; width: 3px; height: 14px; background: #374151; border-radius: 2px; flex-shrink: 0; }

    /* ── Services table ── */
    .svc-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .svc-table th { background: #f9fafb; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; padding: 10px 14px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    .svc-table th:last-child { text-align: right; width: 60px; }
    .svc-table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    .svc-table tr:last-child td { border-bottom: none; }
    .svc-name { font-size: 13px; color: #111; font-weight: 500; display: block; }
    .svc-group { font-size: 11px; color: #9ca3af; display: block; margin-top: 2px; }

    /* ── Tags ── */
    .tag { display: inline-flex; align-items: center; background: #f3f4f6; color: #374151; padding: 4px 12px 4px 9px; border-radius: 20px; font-size: 12px; font-weight: 500; margin: 3px 4px 3px 0; border: 1px solid #d1d5db; }

    /* ── Notes ── */
    .notes-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; color: #374151; background: #fafafa; white-space: pre-wrap; font-size: 12.5px; line-height: 1.6; }

    /* ── Signatures ── */
    .sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; margin-top: 48px; }
    .sig-box { border-top: 1.5px solid #d1d5db; padding-top: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; text-align: center; }

    @media print { body { padding: 24px 28px; } }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand-name">MasterAuto</div>
      <div class="brand-sub">Automotive Services</div>
    </div>
    <div class="doc-right">
      <div class="doc-label">Job Order</div>
      <div class="doc-number">${formatJoNumber(jo)}</div>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-label">Quotation No.</div>
      <div class="meta-value">${jo.quotation_no || '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Start Date/Time</div>
      <div class="meta-value">${schedStartPrint || '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">End Date/Time</div>
      <div class="meta-value">${schedEndPrint || '—'}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Status</div>
      <span class="badge" style="background:${st.bg};color:${st.color}">
        <span class="badge-dot" style="background:${st.dot}"></span>
        ${jo.status}
      </span>
    </div>
  </div>

  <div class="grid">
    <div class="info-block">
      <div class="info-label">Customer</div>
      <div class="info-name">${jo.customer_name || '—'}</div>
      ${jo.customer_mobile ? `<div class="info-line">${jo.customer_mobile}</div>` : ''}
      ${jo.customer_email ? `<div class="info-line" style="color:#374151">${jo.customer_email}</div>` : ''}
      ${jo.customer_address ? `<div class="info-line">${jo.customer_address}</div>` : ''}
      ${printStartDate ? `<div class="info-schedule"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${printStartDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</div>` : ''}
    </div>
    <div class="info-block">
      <div class="info-label">Vehicle</div>
      <div class="info-name">${jo.plate_number || '—'}</div>
      <div class="info-line">${[jo.make, jo.model, jo.vehicle_year].filter(Boolean).join(' ')}</div>
      ${jo.color ? `<div class="info-line">Color: ${jo.color}</div>` : ''}
      ${jo.variant ? `<div class="info-line">Variant: ${jo.variant}</div>` : ''}
    </div>
  </div>

  <div class="section-title">Services</div>
  <table class="svc-table">
    <thead><tr><th>Service</th><th>Qty</th></tr></thead>
    <tbody>${serviceRows}</tbody>
  </table>

  <div class="section-title">Assigned Workers</div>
  <div style="padding: 4px 0 18px">${installerList}</div>

  ${jo.quotation_notes ? `<div class="section-title">Notes / Scope of Work</div><div class="notes-box" style="margin-bottom:16px">${jo.quotation_notes}</div>` : ''}
  ${jo.notes ? `<div class="section-title">Job Order Notes</div><div class="notes-box">${jo.notes}</div>` : ''}

  <div class="sig-row">
    <div class="sig-box">Prepared By <br/> <div style="padding-top: 8px">${preparedByList}</div></div>
  </div>

</body>
</html>`

    const win = window.open('', '_blank', 'width=860,height=750')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  const handlePrintRow = async (id) => {
    try {
      const jo = await apiGet(`/job-orders/${id}`, token)
      handlePrint(jo)
    } catch (e) {
      setError(e.message)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-grid">
      <SectionCard
        title="Job Orders"
        subtitle="Track active Job Orders linked to Approved Quotations."
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* ── Active / History tab switcher ── */}
          <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
            {[{ key: 'active', label: 'Active Job Orders' }, { key: 'history', label: 'History' }].map(({ key, label }) => {
              const isSelected = viewMode === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setViewMode(key)
                    setFilterStatus('')
                    setPage(1)
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

          {/* Toolbar */}
          <div className="module-toolbar">
            <input
              type="search"
              placeholder="Search JO no., quotation no., customer, plate…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {/* Status filter chips — only shown in Active tab */}
            {viewMode === 'active' && (
              <div className="toolbar-filters">
                {['', 'Pending', 'In Progress', 'For QA', 'Completed', 'Released'].map((s) => (
                  <button
                    key={s || 'all'}
                    type="button"
                    className={`filter-chip${filterStatus === s ? ' active' : ''}`}
                    onClick={() => handleFilterStatus(s)}
                  >
                    {s || 'All Active'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="form-error-text">{error}</p>}

          {/* Table */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingRight: 8 }}>
            <div className="table-wrapper">
              <div>
                <table className="data-table qo-table">
                  <colgroup>
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '17%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>JO No.</th>
                      <th>Branch</th>
                      <th>Quotation No.</th>
                      <th>Customer</th>
                      <th>Vehicle</th>
                      <th>Services</th>
                      <th>Assigned Workers</th>
                      <th>Status / Payment</th>
                      <th style={{ textAlign: 'center' }}>{viewMode === 'history' ? 'Closed At' : 'Date'}</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr><td colSpan={10} className="table-empty">Loading…</td></tr>
                    )}
                    {!loading && jobOrders.length === 0 && (
                      <tr>
                        <td colSpan={10} className="table-empty">
                          No job orders found. Create one from an <strong>Approved Quotation</strong>.
                        </td>
                      </tr>
                    )}
                    {!loading && jobOrders.map((jo) => (
                      <tr key={jo.id} style={{ cursor: 'pointer' }} onClick={() => handleView(jo.id)}>
                        <td>
                          <span className="td-ref">{formatJoNumber(jo)}</span>
                        </td>
                        <td>
                          <span className="td-sub">{displayJoBranch(jo)}</span>
                        </td>
                        <td>
                          <span className="td-ref">{jo.quotation_no}</span>
                        </td>
                        <td>
                          <span className="td-name">{jo.customer_name}</span>
                          <span className="td-sub">{jo.customer_mobile}</span>
                        </td>
                        <td>
                          <span className="td-name">{jo.plate_number}</span>
                          <span className="td-sub">{jo.make} {jo.model} {jo.vehicle_year}</span>
                        </td>
                        <td>
                          <span className="td-sub">{Array.isArray(jo.services) ? jo.services.length : 0} service(s)</span>
                        </td>
                        <td>
                          <div className="installer-tag-list">
                            {(jo.assigned_installers || []).length === 0
                              ? <span className="td-sub">—</span>
                              : (jo.assigned_installers || []).map((n) => (
                                <span key={n} className="installer-tag-sm">{n}</span>
                              ))
                            }
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                            <WorkflowStatusBadge status={jo.status} />
                            <PaymentStatusBadge status={jo.payment_status || 'UNPAID'} balance={jo.balance} showBalance={viewMode !== 'history'} />
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          {viewMode === 'history'
                            ? (jo.closed_at || jo.updated_at ? new Date(jo.closed_at || jo.updated_at).toLocaleDateString('en-PH') : '—')
                            : new Date(jo.created_at).toLocaleDateString('en-PH')
                          }
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row-actions">
                            {/* Sequential next-step advance button */}
                            {(() => {
                              const nextSt = getNextJoStatus(jo.status)
                              const isTerminal = JO_TERMINAL.has(jo.status)
                              const userRole = user?.role || ''

                              return (
                                <>
                                  {!isTerminal && nextSt && (() => {
                                    const isPaid = jo.payment_status === 'PAID' || jo.payment_status === 'SETTLED'
                                    const halfPayBlock = get50PctBlockReason(jo)
                                    const fullPayBlocked = nextSt === 'Released' && !isPaid
                                    const roleBlocked = !canAdvanceTo(nextSt, userRole)
                                    const isDisabled = roleBlocked || !!halfPayBlock || fullPayBlocked
                                    const tooltip = roleBlocked
                                      ? `Requires role: ${(JO_STAGE_ROLES[nextSt] || []).join(', ')}`
                                      : halfPayBlock
                                        ? halfPayBlock
                                        : fullPayBlocked
                                          ? 'Payment must be fully settled before releasing the vehicle'
                                          : `Advance to ${nextSt}`
                                    return (
                                      <button
                                        type="button"
                                        className="btn-approve"
                                        onClick={() => { if (!isDisabled) handleStatusChange(jo.id, nextSt) }}
                                        disabled={isDisabled}
                                        style={isDisabled && !roleBlocked ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                                        title={tooltip}
                                      >
                                        → {nextSt}
                                      </button>
                                    )
                                  })()}
                                  {!isTerminal && canCancel(jo.status, userRole) && (() => {
                                    const blockReason = getCancelBlockReason(jo.status, jo.payment_status)
                                    return (
                                      <button
                                        type="button"
                                        className="btn-icon action-danger"
                                        style={blockReason ? { opacity: 0.45, filter: 'grayscale(0.7)', cursor: 'pointer' } : {}}
                                        title={blockReason ?? 'Cancel this Job Order'}
                                        onClick={() => handleCancelClick(jo)}
                                      >
                                        <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
                                      </button>
                                    )
                                  })()}
                                  {jo.status === 'Pending' && (
                                    <button
                                      type="button"
                                      className="btn-icon action-danger"
                                      title={userRole !== 'SuperAdmin' ? 'Access restricted — SuperAdmin only' : 'Delete this Job Order (also cancels linked scheduling and quotation)'}
                                      disabled={userRole !== 'SuperAdmin'}
                                      style={{ opacity: userRole !== 'SuperAdmin' ? 0.45 : 0.75, cursor: userRole !== 'SuperAdmin' ? 'not-allowed' : undefined }}
                                      onClick={() => handleDeleteClick(jo)}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                                    </button>
                                  )}
                                  {(() => {
                                    const pe = getPrintEligibility(jo, requirePaymentBeforePrint)
                                    return (
                                      <button
                                        type="button"
                                        className="btn-icon action-print"
                                        title={pe.eligible ? 'Print JO' : pe.label}
                                        disabled={!pe.eligible}
                                        style={!pe.eligible ? { opacity: 0.35, cursor: 'not-allowed' } : {}}
                                        onClick={() => { if (pe.eligible) handlePrintRow(jo.id) }}
                                      >
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                                      </button>
                                    )
                                  })()}
                                </>
                              )
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <PaginationBar
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                onPageChange={(p) => { setPage(p); load(p, search, filterStatus, viewMode) }}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Create Job Order Modal ────────────────────────────────────────── */}
      <Modal isOpen={showCreate} onClose={closeCreate} title="Create Job Order" wide>
        <form className="entity-form qo-form" onSubmit={handleCreateSubmit}>
          {createError && (
            <div className="wizard-error"><span className="wizard-error-icon">⚠</span> {createError}</div>
          )}

          {/* Quotation summary card */}
          {quotationPreview && (
            <div className="jo-quotation-card">
              <div className="jo-qc-row">
                <div className="jo-qc-field">
                  <span>Quotation No.</span>
                  <strong>{quotationPreview.quotation_no}</strong>
                </div>
                <div className="jo-qc-field">
                  <span>Status</span>
                  <span className="status-badge badge-success">Approved</span>
                </div>
                <div className="jo-qc-field">
                  <span>Total Amount</span>
                  <strong className="qo-total-amount">{formatCurrency(quotationPreview.total_amount)}</strong>
                </div>
              </div>
              <div className="jo-qc-row">
                <div className="jo-qc-field">
                  <span>Customer</span>
                  <strong>{quotationPreview.customer_name}</strong>
                </div>
                <div className="jo-qc-field">
                  <span>Vehicle</span>
                  <strong>{quotationPreview.plate_number} — {quotationPreview.make} {quotationPreview.model}</strong>
                </div>
              </div>

              {/* Services from quotation */}
              {Array.isArray(quotationPreview.services) && quotationPreview.services.length > 0 && (
                <div className="jo-qc-services">
                  <span>Services:</span>
                  <div className="jo-qc-service-tags">
                    {quotationPreview.services.map((s, i) => (
                      <span key={i} className="installer-tag-sm">{s.name}</span>
                    ))}
                  </div>
                  {(() => {
                    const lines = quotationPreview.services
                      .map((s) => {
                        const notes = materialsNotesByCode[normalizeServiceCode(s?.code)]
                        const clean = String(notes || '').trim()
                        if (!clean) return null
                        return `${s.name}: ${clean}`
                      })
                      .filter(Boolean)

                    if (lines.length === 0) return null
                    return (
                      <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'rgba(189,200,218,0.75)', whiteSpace: 'pre-wrap' }}>
                        <div style={{ fontWeight: 700, color: 'rgba(189,200,218,0.85)', marginBottom: 4 }}>Materials Notes (client-visible)</div>
                        {lines.join('\n')}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Assigned Workers and Prepared By */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="full-width">
            <div className="form-group">
              <label>Assign Workers</label>
              <InstallerPicker
                selected={createForm.assignedInstallers}
                onChange={(list) => setCreateForm((p) => ({ ...p, assignedInstallers: list }))}
                presets={workerPresets}
              />
            </div>
            <div className="form-group">
              <label>Prepared By</label>
              <InstallerPicker
                selected={createForm.preparedBy}
                onChange={(list) => setCreateForm((p) => ({ ...p, preparedBy: list }))}
                presets={preparedByPresets}
                limit={1}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="form-group full-width">
            <label>Notes / Instructions</label>
            <textarea
              placeholder="Special instructions, damage notes, customer requests…"
              value={createForm.notes}
              onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="form-actions full-width" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={closeCreate}>Cancel</button>
            <button type="submit" className="btn-primary">Create Job Order</button>
          </div>
        </form>
      </Modal>

      {/* ── Job Order Detail Modal ────────────────────────────────────────── */}
      <Modal isOpen={!!viewItem} onClose={() => setViewItem(null)} title={`Job Order — ${formatJoNumber(viewItem)}`} wide>
        {viewItem && (
          <div className="qo-detail">
            {/* Header strip */}
            <div className="qo-detail-strip">
              <div className="qo-strip-cell">
                <span className="qo-strip-label">JO No.</span>
                <span className="qo-strip-value mono">{formatJoNumber(viewItem)}</span>
              </div>
              {viewItem.quotation_no && (
                <>
                  <div className="qo-strip-divider" />
                  <div className="qo-strip-cell">
                    <span className="qo-strip-label">Quotation</span>
                    <span className="qo-strip-value mono">{viewItem.quotation_no}</span>
                  </div>
                </>
              )}
              <div className="qo-strip-divider" />
              <div className="qo-strip-cell">
                <span className="qo-strip-label">Start Date/Time</span>
                <span className="qo-strip-value">
                  {viewItem.schedule_start
                    ? new Date(viewItem.schedule_start).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : '—'}
                </span>
              </div>
              <div className="qo-strip-divider" />
              <div className="qo-strip-cell">
                <span className="qo-strip-label">Status</span>
                <WorkflowStatusBadge status={viewItem.status} />
              </div>
            </div>

            {/* Workflow Progress Stepper */}
            {viewItem.status !== 'Cancelled' && (
              <WorkflowStepper
                steps={JO_STATUS_ORDER}
                current={viewItem.status}
                cancelled={viewItem.status === 'Cancelled'}
              />
            )}

            {viewItem.status === 'Cancelled' && (
              <div style={{ padding: '8px 0 4px', color: '#ef4444', fontWeight: 600, fontSize: '0.85rem' }}>
                ✕ This Job Order was cancelled.
              </div>
            )}

            {/* Customer / Vehicle */}
            <div className="qo-detail-grid">
              <div className="qo-info-block">
                <div className="qo-info-block-header">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  <span>Customer</span>
                </div>
                <p className="qo-info-name">{viewItem.customer_name}</p>
                {viewItem.customer_mobile && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.38 2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z" /></svg>
                    <span>{viewItem.customer_mobile}</span>
                  </div>
                )}
                {viewItem.customer_email && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                    <span>{viewItem.customer_email}</span>
                  </div>
                )}
                {viewItem.customer_address && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                    <span>{viewItem.customer_address}</span>
                  </div>
                )}
              </div>
              <div className="qo-info-block">
                <div className="qo-info-block-header">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 5v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                  <span>Vehicle</span>
                </div>
                <p className="qo-info-name">{viewItem.plate_number}</p>
                <div className="qo-info-row">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="10" rx="2" /><line x1="7" y1="12" x2="7" y2="12" /><line x1="12" y1="12" x2="17" y2="12" /></svg>
                  <span>{[viewItem.make, viewItem.model].filter(Boolean).join(' ')}</span>
                </div>
                {viewItem.vehicle_year && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span>Year {viewItem.vehicle_year}</span>
                  </div>
                )}
                {viewItem.color && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
                    <span>{viewItem.color}</span>
                  </div>
                )}
                {viewItem.variant && (
                  <div className="qo-info-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    <span>{viewItem.variant}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Services */}
            <div className="qo-services-section">
              <div className="qo-services-header">
                <span>Services</span>
                {(viewItem.services || []).length > 0 && (
                  <span className="qo-services-count">{(viewItem.services || []).length}</span>
                )}
              </div>
              <table className="qo-svc-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th className="qo-svc-center">Qty</th>
                    <th className="qo-svc-center">Unit Price</th>
                    <th className="qo-svc-total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewItem.services || []).map((s, i) => (
                    <tr key={i}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                        {s.group && <span className="sle-service-group">{s.group}</span>}
                        {(() => {
                          const notes = materialsNotesByCode[normalizeServiceCode(s?.code)]
                          const clean = String(notes || '').trim()
                          return clean ? <span className="sle-service-group">Materials: {clean}</span> : null
                        })()}
                      </td>
                      <td className="qo-svc-center">{s.qty}</td>
                      <td className="qo-svc-center">{formatCurrency(s.unitPrice)}</td>
                      <td className="qo-svc-total">{formatCurrency(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {viewItem.quotation_amount && (
                <div className="qo-total-block">
                  <div className="qo-total-block-inner">
                    <span className="qo-total-block-label">Quotation Total</span>
                    <span className="qo-total-block-amount">{formatCurrency(viewItem.quotation_amount)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Assigned Workers & Prepared By — editable */}
            <div className="qo-services-section">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <h4>Assigned Workers</h4>
                  <InstallerPicker
                    selected={editInstallers || []}
                    onChange={setEditInstallers}
                    presets={workerPresets}
                  />
                </div>
                <div>
                  <h4>Prepared By</h4>
                  <InstallerPicker
                    selected={editPreparedBy || []}
                    onChange={setEditPreparedBy}
                    presets={preparedByPresets}
                    limit={1}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleSaveInstallers}
                  disabled={savingInstallers}
                >
                  {savingInstallers ? 'Saving…' : 'Save Details'}
                </button>
              </div>
            </div>

            {viewItem.notes && (
              <div className="qo-notes">
                <h4>Notes</h4>
                <p>{viewItem.notes}</p>
              </div>
            )}

            {/* Status Actions — sequential workflow buttons */}
            <div className="qo-detail-actions">
              <div className="jo-actions-left">
                {(() => {
                  const pe = getPrintEligibility(viewItem, requirePaymentBeforePrint)
                  const badgeColor = pe.status === 'unpaid' ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5' }
                    : pe.status === 'partial' ? { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.4)', text: '#fde047' }
                      : pe.status === 'paid' ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', text: '#86efac' }
                        : null
                  return (
                    <>
                      {badgeColor && (
                        <span style={{
                          fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px',
                          borderRadius: '20px', border: `1px solid ${badgeColor.border}`,
                          background: badgeColor.bg, color: badgeColor.text, letterSpacing: '0.01em',
                          whiteSpace: 'nowrap',
                        }}>
                          {pe.label}{pe.pct != null ? ` (${Math.floor(pe.pct)}%)` : ''}
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn-print"
                        disabled={!pe.eligible}
                        title={pe.label}
                        style={!pe.eligible ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                        onClick={() => { if (pe.eligible) handlePrint(viewItem) }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                        Print JO
                      </button>
                    </>
                  )
                })()}
              </div>
              <div className="jo-actions-right">
                {(() => {
                  const nextSt = getNextJoStatus(viewItem.status)
                  const isTerminal = JO_TERMINAL.has(viewItem.status)
                  const userRole = user?.role || ''
                  return (
                    <>
                      {!isTerminal && canCancel(viewItem.status, userRole) && (() => {
                        const blockReason = getCancelBlockReason(viewItem.status, viewItem.payment_status)
                        return (
                          <button
                            type="button"
                            className="btn-icon action-danger"
                            style={blockReason ? { opacity: 0.45, filter: 'grayscale(0.7)', cursor: 'pointer' } : {}}
                            title={blockReason ?? 'Cancel this Job Order'}
                            onClick={() => handleCancelClick(viewItem)}
                          >
                            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" /></svg>
                          </button>
                        )
                      })()}
                      {viewItem.status === 'Pending' && (
                        <button
                          type="button"
                          className="btn-icon action-danger"
                          style={{ background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.4)', opacity: userRole !== 'SuperAdmin' ? 0.45 : 1, cursor: userRole !== 'SuperAdmin' ? 'not-allowed' : undefined }}
                          title={userRole !== 'SuperAdmin' ? 'Access restricted — SuperAdmin only' : 'Delete this Job Order (also cancels linked scheduling and quotation)'}
                          disabled={userRole !== 'SuperAdmin'}
                          onClick={() => handleDeleteClick(viewItem)}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      )}
                      {!isTerminal && nextSt && (() => {
                        const isPaid = viewItem.payment_status === 'PAID' || viewItem.payment_status === 'SETTLED'
                        const halfPayBlock = get50PctBlockReason(viewItem)
                        const fullPayBlocked = nextSt === 'Released' && !isPaid
                        const roleBlocked = !canAdvanceTo(nextSt, userRole)
                        const isDisabled = roleBlocked || !!halfPayBlock || fullPayBlocked
                        const tooltip = roleBlocked
                          ? `Your role (${userRole}) cannot advance to "${nextSt}". Required: ${(JO_STAGE_ROLES[nextSt] || []).join(', ')}`
                          : halfPayBlock
                            ? halfPayBlock
                            : fullPayBlocked
                              ? 'Payment must be fully settled before releasing the vehicle'
                              : undefined
                        return (
                          <button
                            type="button"
                            className="btn-approve"
                            onClick={() => { if (!isDisabled) handleStatusChange(viewItem.id, nextSt) }}
                            disabled={isDisabled}
                            title={tooltip}
                            style={isDisabled && !roleBlocked ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                          >
                            ✓ Advance to: {nextSt}
                          </button>
                        )
                      })()}
                      {isTerminal && (
                        <span style={{ color: 'rgba(189,200,218,0.5)', fontSize: '0.85rem' }}>
                          Job Order is {viewItem.status} — no further workflow actions.
                        </span>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm */}
      <ConfirmModal
        isOpen={confirmCfg.isOpen}
        title={confirmCfg.title}
        message={confirmCfg.message}
        onConfirm={confirmCfg.onConfirm}
        onCancel={() => setConfirmCfg((p) => ({ ...p, isOpen: false }))}
      />

      {/* ── Cancel Job Order Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={cancelModal.isOpen}
        onClose={() => setCancelModal({ isOpen: false, jo: null, reason: '', saving: false })}
        title="Cancel Job Order"
      >
        <div style={{ padding: '8px 0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '14px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '16px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#fca5a5', fontSize: '0.9rem' }}>
                You are about to cancel Job Order {formatJoNumber(cancelModal.jo)}
              </p>
              <p style={{ margin: 0, color: 'rgba(200,210,225,0.7)', fontSize: '0.83rem', lineHeight: 1.5 }}>
                This action is irreversible and will be recorded in the audit trail.
              </p>
            </div>
          </div>

          {/* Cascade effects */}
          <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 14px', marginBottom: '18px' }}>
            <div style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>This will also:</div>
            <ul style={{ margin: 0, paddingLeft: '16px', color: 'rgba(189,200,218,0.8)', fontSize: '0.83rem', lineHeight: 1.9 }}>
              <li>Cancel the linked <strong style={{ color: '#f0f3f8' }}>Scheduling</strong> booking</li>
              {cancelModal.jo?.quotation_id && (
                <li>Cancel the linked <strong style={{ color: '#f0f3f8' }}>Quotation</strong> — removing it from Payments &amp; POS</li>
              )}
            </ul>
          </div>

          <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(200,210,230,0.85)' }}>
            Cancellation Reason <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px', resize: 'vertical',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-primary)', fontSize: '0.875rem', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            placeholder="Enter the reason for cancellation (required)…"
            value={cancelModal.reason}
            onChange={(e) => setCancelModal((p) => ({ ...p, reason: e.target.value }))}
          />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCancelModal({ isOpen: false, jo: null, reason: '', saving: false })}
              disabled={cancelModal.saving}
            >
              Keep Job Order
            </button>
            <button
              type="button"
              className="btn-reject"
              onClick={handleCancelConfirm}
              disabled={cancelModal.saving || !cancelModal.reason.trim()}
              style={!cancelModal.reason.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              {cancelModal.saving ? 'Cancelling…' : '✕ Confirm Cancellation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Job Order Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => !deleteModal.saving && setDeleteModal({ isOpen: false, jo: null, saving: false })}
        title="Delete Job Order"
      >
        <div style={{ padding: '8px 0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '14px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#fca5a5', fontSize: '0.9rem' }}>
                Permanently delete Job Order {formatJoNumber(deleteModal.jo)}?
              </p>
              <p style={{ margin: 0, color: 'rgba(200,210,225,0.7)', fontSize: '0.83rem', lineHeight: 1.5 }}>
                This will permanently remove the record. This cannot be undone.
              </p>
            </div>
          </div>

          <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>This will also:</div>
            <ul style={{ margin: 0, paddingLeft: '16px', color: 'rgba(189,200,218,0.8)', fontSize: '0.83rem', lineHeight: 1.9 }}>
              <li>Cancel the linked <strong style={{ color: '#f0f3f8' }}>Scheduling</strong> booking</li>
              {deleteModal.jo?.quotation_id && (
                <li>Cancel the linked <strong style={{ color: '#f0f3f8' }}>Quotation</strong> — removing it from Payments &amp; POS</li>
              )}
            </ul>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setDeleteModal({ isOpen: false, jo: null, saving: false })}
              disabled={deleteModal.saving}
            >
              Keep Job Order
            </button>
            <button
              type="button"
              className="btn-reject"
              onClick={handleDeleteConfirm}
              disabled={deleteModal.saving}
            >
              {deleteModal.saving ? 'Deleting…' : '🗑 Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Cancel Blocked Warning Modal ──────────────────────────────────── */}
      <Modal
        isOpen={cancelWarn.isOpen}
        onClose={() => setCancelWarn({ isOpen: false, message: '' })}
        title="Cannot Cancel Job Order"
      >
        <div style={{ padding: '8px 0 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '14px',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: '10px', padding: '16px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ margin: 0, color: 'rgba(210,220,235,0.85)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              {cancelWarn.message}
            </p>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: '0.82rem', color: 'rgba(180,190,210,0.55)', textAlign: 'center' }}>
            Please contact an <strong style={{ color: 'rgba(200,210,230,0.7)' }}>Admin</strong> if an exception is required.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setCancelWarn({ isOpen: false, message: '' })}
            >
              Understood
            </button>
          </div>
        </div>
      </Modal>

      {/* Conditional Release Modal */}
      <Modal
        isOpen={forceReleaseJO.isOpen}
        onClose={() => setForceReleaseJO(p => ({ ...p, isOpen: false, reason: '' }))}
        title="⚠ Conditional Release — Manager Approval Required"
      >
        <div style={{ padding: '8px 0 16px' }}>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: '6px' }}>Job Order has an outstanding balance</div>
            <div style={{ color: 'rgba(189,200,218,0.75)', fontSize: '0.82rem' }}>
              Releasing will mark the quotation as <strong style={{ color: '#f97316' }}>WITH BALANCE</strong>. The outstanding amount will appear in financial reports.
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(189,200,218,0.5)', marginBottom: '12px' }}>Financial Summary</div>
            {[
              { label: 'Total Amount', value: forceReleaseJO.totalAmount, color: '#c7d4f0' },
              { label: 'Total Paid', value: forceReleaseJO.totalPaid, color: '#10b981' },
              { label: 'Outstanding Balance', value: forceReleaseJO.balance, color: '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'rgba(189,200,218,0.7)', fontSize: '0.875rem' }}>{label}</span>
                <strong style={{ color, fontSize: '0.95rem' }}>₱{Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'rgba(189,200,218,0.7)', fontSize: '0.85rem', marginBottom: '8px' }}>
              Reason for Conditional Release <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={3}
              style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', color: '#f0f3f8', resize: 'vertical', fontSize: '0.9rem', boxSizing: 'border-box' }}
              placeholder="e.g. Customer committed to settle balance by next visit..."
              value={forceReleaseJO.reason}
              onChange={(e) => setForceReleaseJO(p => ({ ...p, reason: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={() => setForceReleaseJO(p => ({ ...p, isOpen: false, reason: '' }))}>
              Cancel
            </button>
            <button
              type="button" className="btn-primary"
              style={{ background: 'rgba(239,68,68,0.2)', borderColor: '#ef4444', color: '#ef4444' }}
              disabled={!forceReleaseJO.reason.trim()}
              onClick={async () => {
                try {
                  await apiPost(`/job-orders/${forceReleaseJO.jobOrder.id}/force-release`, token, { overrideReason: forceReleaseJO.reason })
                  setForceReleaseJO({ isOpen: false, jobOrder: null, totalAmount: 0, totalPaid: 0, balance: 0, reason: '' })
                  await load(page, search, filterStatus)
                  if (viewItem?.id === forceReleaseJO.jobOrder?.id) setViewItem(p => ({ ...p, status: 'Released' }))
                } catch (e) {
                  setError(e.message || 'Conditional release failed')
                  setForceReleaseJO(p => ({ ...p, isOpen: false }))
                }
              }}
            >
              Approve Conditional Release
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
