import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete, pushToast } from '../api/client'
import { WorkflowStatusBadge } from '../components/WorkflowStatusBadge'
import { PaginationBar } from '../components/PaginationBar'
import { ConfirmModal } from '../components/ConfirmModal'

const DEFAULT_CATEGORIES = ['All']

function todayISODate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nowLocalDateTimeInputValue() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  return `${y}-${m}-${day}T${hh}:${mm}`
}

function localISODateFromDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  return `${y}-${m}-${day}`
}

function dateOnlyToInputValue(value) {
  if (!value) return ''
  if (value instanceof Date) return localISODateFromDate(value)
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return localISODateFromDate(d)
  return ''
}

function formatDateOnlyDisplay(value, locale = 'en-PH') {
  const dateOnly = dateOnlyToInputValue(value)
  if (!dateOnly) return '—'
  const [y, m, d] = dateOnly.split('-').map(Number)
  const local = new Date(y, (m || 1) - 1, d || 1)
  return local.toLocaleDateString(locale, { timeZone: 'Asia/Manila' })
}

function formatDateTimePH(value, locale = 'en-PH') {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, { timeZone: 'Asia/Manila' })
}

function parseReleaseNote(note) {
  const result = { to: '', requestedBy: '' }
  if (!note) return result
  const parts = String(note).split('|').map(p => p.trim()).filter(Boolean)
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower.startsWith('to:')) result.to = part.slice(3).trim()
    if (lower.startsWith('requested by:')) result.requestedBy = part.slice('requested by:'.length).trim()
  }
  return result
}

const emptyForm = {
  name: '',
  category: '',
  beginningInventory: '',
  qtyMinimum: 5,
  date: todayISODate(),
  createDateTime: nowLocalDateTimeInputValue(),
  addQty: '',
}

export function InventoryPage({ token }) {
  const [items, setItems]               = useState([])
  const [pagination, setPagination]     = useState({ page: 1, totalPages: 1, total: 0 })
  const [search, setSearch]             = useState('')
  const [category, setCategory]         = useState('All')
  const [stockFilter, setStockFilter]   = useState('all')
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [outOfStockCount, setOutOfStockCount] = useState(0)
  const [inStockCount, setInStockCount] = useState(0)

  const [activeTab, setActiveTab] = useState('inventory')

  const [releases, setReleases] = useState([])
  const [releasesPagination, setReleasesPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [releasesPage, setReleasesPage] = useState(1)
  const [releasesLoading, setReleasesLoading] = useState(false)

  const [adds, setAdds] = useState([])
  const [addsPagination, setAddsPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [addsPage, setAddsPage] = useState(1)
  const [addsLoading, setAddsLoading] = useState(false)

  // Modals
  const [showForm, setShowForm]         = useState(false)
  const [editItem, setEditItem]         = useState(null)
  const [form, setForm]                 = useState(emptyForm)
  const [formLoading, setFormLoading]   = useState(false)

  const [autoNowCreate, setAutoNowCreate] = useState(true)

  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustItem, setAdjustItem] = useState(null)
  const [adjustForm, setAdjustForm] = useState({ releaseQty: '', addQty: '', movementDateTime: nowLocalDateTimeInputValue(), to: '', toOther: '', requestedBy: '' })
  const [adjustLoading, setAdjustLoading] = useState(false)
  const [autoNowAdjust, setAutoNowAdjust] = useState(true)

  const [defaultMinQty, setDefaultMinQty] = useState(5)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [detailItem, setDetailItem]     = useState(null)

  const [branchLocations, setBranchLocations] = useState(['BGC'])

  const [categories, setCategories] = useState(['All'])
  const [settingsCategories, setSettingsCategories] = useState([])

  const headers = { Authorization: `Bearer ${token}` } // kept for reference; using api helpers below


  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (search) params.set('search', search)
      if (category !== 'All') params.set('category', category)
      if (stockFilter !== 'all') params.set('stockStatus', stockFilter)
      const data = await apiGet(`/inventory?${params}`, token)
      setItems(data.data || [])
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 })

      // Compute stat card values from returned data (full dataset stats loaded separately)
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, category, stockFilter, token])

  // Load summary stats once
  const loadStats = useCallback(async () => {
    try {
      const all = await apiGet(`/inventory?limit=1000`, token)
      const rows = all.data || []
      setLowStockCount(rows.filter(r => r.stock_status === 'LOW_STOCK').length)
      setOutOfStockCount(rows.filter(r => r.stock_status === 'OUT_OF_STOCK').length)
      setInStockCount(rows.filter(r => r.stock_status === 'IN_STOCK').length)
    } catch { /* silent */ }
  }, [token])

  const loadReleases = useCallback(async () => {
    setReleasesLoading(true)
    try {
      const params = new URLSearchParams({ page: releasesPage, limit: 20 })
      const data = await apiGet(`/inventory/releases?${params}`, token)
      setReleases(data.data || [])
      setReleasesPagination(data.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setReleasesLoading(false)
    }
  }, [releasesPage, token])

  const loadAdds = useCallback(async () => {
    setAddsLoading(true)
    try {
      const params = new URLSearchParams({ page: addsPage, limit: 20 })
      const data = await apiGet(`/inventory/adds?${params}`, token)
      setAdds(data.data || [])
      setAddsPagination(data.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setAddsLoading(false)
    }
  }, [addsPage, token])

  useEffect(() => { if (activeTab === 'inventory') load() }, [activeTab, load])
  useEffect(() => { if (activeTab === 'inventory') loadStats() }, [activeTab, loadStats])
  useEffect(() => { if (activeTab === 'releases') loadReleases() }, [activeTab, loadReleases])
  useEffect(() => { if (activeTab === 'adds') loadAdds() }, [activeTab, loadAdds])

  // 1. Categories and default rules from settings
  useEffect(() => {
    apiGet('/config/category/inventory', token)
      .then((arr) => {
        const entries = Array.isArray(arr) ? arr : []
        
        // Settings Categories
        const catEntry = entries.find((e) => e.key === 'inventory_categories')
        if (catEntry?.value) {
          try {
            const parsed = typeof catEntry.value === 'string' ? JSON.parse(catEntry.value) : catEntry.value
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSettingsCategories(parsed)
            }
          } catch {}
        }

        // Default Min Qty
        const minQtyEntry = entries.find((e) => e.key === 'default_qty_minimum')
        if (minQtyEntry && minQtyEntry.value !== undefined) {
          const val = Number(minQtyEntry.value)
          if (!Number.isNaN(val)) setDefaultMinQty(val)
        }
      })
      .catch(() => {})
  }, [token])

  // 2. Load categories used in DB to merge with settings
  useEffect(() => {
    apiGet('/inventory/categories', token)
      .then((arr) => {
        const server = Array.isArray(arr) ? arr : []
        const cleaned = server.map(s => String(s || '').trim()).filter(Boolean)
        
        const merged = ['All']
        // Add settings categories first
        settingsCategories.forEach(c => {
          if (!merged.includes(c)) merged.push(c)
        })
        // Add categories found in DB (that might be missing from settings)
        cleaned.forEach(c => {
          if (c !== 'All' && !merged.includes(c)) merged.push(c)
        })
        setCategories(merged)
      })
      .catch(() => {
        const merged = ['All', ...settingsCategories]
        setCategories(merged)
      })
  }, [token, settingsCategories])

  // ── Form ──────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditItem(null)
    const initialCategory = settingsCategories.length > 0 ? settingsCategories[0] : ''
    setForm({ 
      ...emptyForm, 
      category: initialCategory,
      qtyMinimum: defaultMinQty, 
      date: todayISODate(), 
      createDateTime: nowLocalDateTimeInputValue() 
    })
    setAutoNowCreate(true)
    setShowForm(true)
  }

  // Real-time DateTime for Create Inventory (stops when user edits)
  useEffect(() => {
    if (!showForm || editItem) return
    if (!autoNowCreate) return
    const id = setInterval(() => {
      setForm(f => ({ ...f, createDateTime: nowLocalDateTimeInputValue() }))
    }, 1000)
    return () => clearInterval(id)
  }, [showForm, editItem, autoNowCreate])

  function openEdit(item) {
    setEditItem(item)
    const rawCategory = item.category || ''
    setForm({
      name: item.name || '',
      category: rawCategory || (settingsCategories[0] || ''),
      date: item.inventory_date ? dateOnlyToInputValue(item.inventory_date) : (item.created_at ? localISODateFromDate(new Date(item.created_at)) : todayISODate()),
      addQty: '',
    })
    setShowForm(true)
  }

  async function submitForm(e) {
    e.preventDefault()
    setFormLoading(true)
    try {
      const finalCategory = form.category

      const addQty = Number(form.addQty)
      const shouldAdd = editItem && Number.isFinite(addQty) && addQty > 0

      const payload = editItem
        ? {
            name: form.name,
            category: finalCategory,
            inventoryDate: form.date || null,
          }
        : {
            sku: form.sku || null,
            name: form.name,
            category: finalCategory,
            beginningInventory: Number(form.beginningInventory) || 0,
            qtyOnHand: Number(form.beginningInventory) || 0,
            qtyMinimum: Number(form.qtyMinimum) || 5,
            inventoryDate: form.createDateTime ? String(form.createDateTime).slice(0, 10) : null,
            startingDate: form.createDateTime || null,
          }
      if (editItem) {
        await apiPatch(`/inventory/${editItem.id}`, token, payload)

        if (shouldAdd) {
          await apiPost(`/inventory/${editItem.id}/adjust`, token, {
            movementType: 'IN',
            qty: addQty,
            referenceNote: 'Edit: add',
          })
        }
        pushToast('edit', `${form.name} updated`)
      } else {
        await apiPost('/inventory', token, payload)
        pushToast('add', `${form.name} added to inventory`)
      }
      setShowForm(false)
      load()
      loadStats()
    } catch (e) {
      if (Array.isArray(e.errors) && e.errors.length > 0) {
        const details = e.errors
          .slice(0, 4)
          .map(er => `${er.field}: ${er.message}`)
          .join(' · ')
        pushToast('error', `${e.message}${details ? ` — ${details}` : ''}`)
      } else {
        pushToast('error', e.message)
      }
    } finally {
      setFormLoading(false)
    }
  }

  // ── Add / Release ───────────────────────────────────────────────────────
  function openAdjust(item) {
    setAdjustItem(item)
    setAdjustForm({ releaseQty: '', addQty: '', movementDateTime: nowLocalDateTimeInputValue(), to: '', toOther: '', requestedBy: '' })
    setAutoNowAdjust(true)
    setShowAdjust(true)
  }

  function openAdd(item) {
    openAdjust(item)
  }

  function openRelease(item) {
    openAdjust(item)
  }

  // Real-time DateTime (auto updates while modal is open, until user edits)
  useEffect(() => {
    if (!showAdjust || !autoNowAdjust) return
    const id = setInterval(() => {
      setAdjustForm(f => ({ ...f, movementDateTime: nowLocalDateTimeInputValue() }))
    }, 1000)
    return () => clearInterval(id)
  }, [showAdjust, autoNowAdjust])

  async function submitAdjust(e) {
    e.preventDefault()
    setAdjustLoading(true)
    try {
      const releaseQty = Number(adjustForm.releaseQty)
      const addQty = Number(adjustForm.addQty)

      const safeReleaseQty = Number.isFinite(releaseQty) ? releaseQty : 0
      const safeAddQty = Number.isFinite(addQty) ? addQty : 0

      if (!(safeReleaseQty > 0 || safeAddQty > 0)) {
        pushToast('error', 'Please enter a Release or Add quantity.')
        return
      }

      const movementDate = adjustForm.movementDateTime
        ? new Date(adjustForm.movementDateTime).toISOString()
        : null

      const toValue = (adjustForm.to === 'Other')
        ? String(adjustForm.toOther || '').trim()
        : String(adjustForm.to || '').trim()

      const noteParts = [
        safeReleaseQty > 0 ? `Release: ${safeReleaseQty}` : null,
        safeAddQty > 0 ? `Add: ${safeAddQty}` : null,
        toValue ? `To: ${toValue}` : null,
        adjustForm.requestedBy ? `Requested by: ${adjustForm.requestedBy}` : null,
      ].filter(Boolean)
      const referenceNote = noteParts.length ? noteParts.join(' | ') : null

      let lastResult = null
      let outResult = null

      if (safeReleaseQty > 0) {
        outResult = await apiPost(`/inventory/${adjustItem.id}/adjust`, token, {
          movementType: 'OUT',
          qty: safeReleaseQty,
          referenceNote,
          movementDate,
        })
        lastResult = outResult
      }

      if (safeAddQty > 0) {
        const inResult = await apiPost(`/inventory/${adjustItem.id}/adjust`, token, {
          movementType: 'IN',
          qty: safeAddQty,
          referenceNote,
          movementDate,
        })
        lastResult = inResult
      }

      pushToast('update', `Saved. New qty: ${lastResult?.item?.qty_on_hand}`)
      if (outResult?.lowStockAlert) pushToast('warning', `${outResult.item.name} is at low stock level!`)

      setShowAdjust(false)
      load()
      loadStats()
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setAdjustLoading(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function confirmDelete() {
    try {
      await apiDelete(`/inventory/${deleteTarget.id}`, token)
      pushToast('delete', `${deleteTarget.name} removed from inventory`)
      setDeleteTarget(null)
      load()
      loadStats()
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  // ── Detail ────────────────────────────────────────────────────────────────
  async function openDetail(item) {
    try {
      const data = await apiGet(`/inventory/${item.id}`, token)
      setDetailItem(data)
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="inv-container">

      {/* Tabs */}
      <div className="inv-tabs">
        <button type="button" className={`inv-tab-btn${activeTab === 'inventory' ? ' active' : ''}`} onClick={() => setActiveTab('inventory')}>Inventory</button>
        <button type="button" className={`inv-tab-btn${activeTab === 'releases' ? ' active' : ''}`} onClick={() => setActiveTab('releases')}>Releases</button>
        <button type="button" className={`inv-tab-btn${activeTab === 'adds' ? ' active' : ''}`} onClick={() => setActiveTab('adds')}>Adds</button>
      </div>

      {activeTab === 'releases' ? (
        <>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  {['Date Time', 'Product Name', 'Category', 'Qty', 'To', 'JO No.', 'Request by'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {releasesLoading ? (
                  <tr><td colSpan={6} className="inv-empty">Loading…</td></tr>
                ) : releases.length === 0 ? (
                  <tr><td colSpan={6} className="inv-empty">No release transactions found.</td></tr>
                ) : releases.map(r => {
                  const meta = parseReleaseNote(r.note)
                  return (
                    <tr key={r.id}>
                      <td>{formatDateTimePH(r.created_at, 'en-PH')}</td>
                      <td style={{ fontWeight: 600 }}>{r.item_name}</td>
                      <td>{r.item_category || '—'}</td>
                      <td style={{ fontWeight: 800 }}>{r.qty}</td>
                      <td>{meta.to || '—'}</td>
                      <td>{r.job_order_no || '—'}</td>
                      <td>{meta.requestedBy || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar page={releasesPagination.page} totalPages={releasesPagination.totalPages} onPageChange={p => setReleasesPage(p)} />
        </>
      ) : activeTab === 'adds' ? (
        <>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  {['Date Time', 'Product Name', 'Category', 'Qty', 'Note'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {addsLoading ? (
                  <tr><td colSpan={5} className="inv-empty">Loading…</td></tr>
                ) : adds.length === 0 ? (
                  <tr><td colSpan={5} className="inv-empty">No add transactions found.</td></tr>
                ) : adds.map(a => (
                  <tr key={a.id}>
                    <td>{formatDateTimePH(a.created_at, 'en-PH')}</td>
                    <td style={{ fontWeight: 600, color: '#dde4f0' }}>{a.item_name}</td>
                    <td>{a.item_category || '—'}</td>
                    <td style={{ fontWeight: 800, color: '#e2e8f0' }}>{a.qty}</td>
                    <td>{a.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={addsPagination.page} totalPages={addsPagination.totalPages} onPageChange={p => setAddsPage(p)} />
        </>
      ) : (
        <>

      {/* KPI Strip */}
      <div className="inv-kpi-strip">
        <div className="inv-kpi-card" data-accent="blue" style={{ cursor: 'pointer' }} onClick={() => setStockFilter('all')}>
          <div className="inv-kpi-icon" style={{ background: 'rgba(91,124,247,0.12)', color: '#7c9fff' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="7" height="7"/><rect x="15" y="3" width="7" height="7"/>
              <rect x="15" y="14" width="7" height="7"/><rect x="2" y="14" width="7" height="7"/>
            </svg>
          </div>
          <div className="inv-kpi-body">
            <span className="inv-kpi-label">Total SKUs</span>
            <strong className="inv-kpi-value">{pagination.total}</strong>
          </div>
          <span className="inv-kpi-pill blue">View</span>
        </div>

        <div className="inv-kpi-card" data-accent="green" style={{ cursor: 'pointer' }} onClick={() => setStockFilter('IN_STOCK')}>
          <div className="inv-kpi-icon" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div className="inv-kpi-body">
            <span className="inv-kpi-label">Stocks</span>
            <strong className="inv-kpi-value" style={{ color: '#34d399' }}>{inStockCount}</strong>
          </div>
          <span className="inv-kpi-pill green">View</span>
        </div>

        <div className="inv-kpi-card" data-accent="amber" style={{ cursor: 'pointer' }} onClick={() => setStockFilter('LOW_STOCK')}>
          <div className="inv-kpi-icon" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="inv-kpi-body">
            <span className="inv-kpi-label">Low Stock</span>
            <strong className="inv-kpi-value" style={{ color: lowStockCount > 0 ? '#fbbf24' : undefined }}>{lowStockCount}</strong>
          </div>
          {lowStockCount > 0 && <span className="inv-kpi-pill amber">View</span>}
        </div>

        <div className="inv-kpi-card" data-accent="red" style={{ cursor: 'pointer' }} onClick={() => setStockFilter('OUT_OF_STOCK')}>
          <div className="inv-kpi-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div className="inv-kpi-body">
            <span className="inv-kpi-label">Out of Stock</span>
            <strong className="inv-kpi-value" style={{ color: outOfStockCount > 0 ? '#f87171' : undefined }}>{outOfStockCount}</strong>
          </div>
          <span className="inv-kpi-pill red">View</span>
        </div>
      </div>

      {/* Low-stock banner */}
      {lowStockCount > 0 && (
        <div className="inv-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {lowStockCount} item{lowStockCount !== 1 ? 's are' : ' is'} running low on stock. 
          <button className="inv-banner-link" onClick={() => setStockFilter('LOW_STOCK')}>View low-stock items</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="sp-toolbar">
        <input
          type="search"
          placeholder="Search SKU, name, supplier…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={stockFilter} onChange={e => { setStockFilter(e.target.value); setPage(1) }}>
          <option value="all">All Stock</option>
          <option value="IN_STOCK">In Stock</option>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>
        <button className="inv-add-btn" onClick={openCreate}>+ Add Item</button>
      </div>

      {/* Table */}
      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              {['Product Name', 'Category', 'Beginning Inventory', 'Date', 'Actions'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="inv-empty">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="inv-empty">No inventory items found.</td></tr>
            ) : items.map(item => (
              <tr key={item.id}>
                <td>
                  <button className="inv-td-name-btn" onClick={() => openDetail(item)}>{item.name}</button>
                </td>
                <td>{item.category}</td>
                <td style={{ fontWeight: 700, color: '#e2e8f0' }}>{item.qty_on_hand ?? 0}</td>
                <td>{item.inventory_date ? formatDateOnlyDisplay(item.inventory_date, 'en-PH') : (item.created_at ? new Date(item.created_at).toLocaleDateString('en-PH') : '—')}</td>
                <td>
                  <div className="inv-action-btns">
                    <ActionBtn label="Add/Release" color="#7c9fff" onClick={() => openAdjust(item)} />
                    <ActionBtn label="Edit"   color="#a0a8b8" onClick={() => openEdit(item)} />
                    <ActionBtn label="Delete" color="#ef4444" onClick={() => setDeleteTarget(item)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationBar page={pagination.page} totalPages={pagination.totalPages} onPageChange={p => setPage(p)} />

        </>
      )}

      {/* ── Item Form Modal ─────────────────────────────────────────── */}
      {showForm && (
        <ModalOverlay onClose={() => setShowForm(false)}>
          <h3 className="inv-modal-title">{editItem ? 'Edit Inventory' : 'Create Inventory'}</h3>
          <form onSubmit={submitForm} className="inv-form-grid">
            <InvField label="Product Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
            <div className="inv-field">
              <label className="inv-label">Category</label>
              <select
                className="inv-select"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {categories.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {!editItem && (
              <>
                <InvField
                  label="Beginning Inventory *"
                  type="number"
                  value={form.beginningInventory}
                  onChange={v => setForm(f => ({ ...f, beginningInventory: v }))}
                  required
                  min="0"
                />
                <InvField
                  label="Inventory Date / Start Time"
                  type="datetime-local"
                  value={form.createDateTime}
                  onChange={v => { setAutoNowCreate(false); setForm(f => ({ ...f, createDateTime: v })) }}
                />
              </>
            )}

            {editItem && (
              <>
                <InvField label="Inventory Date" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
                <InvField
                  label="Quantity to Add"
                  type="number"
                  value={form.addQty}
                  onChange={v => setForm(f => ({ ...f, addQty: v }))}
                  min="0"
                  full
                />
              </>
            )}
            <div className="inv-modal-actions" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="inv-cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="inv-submit-btn" disabled={formLoading}>{formLoading ? 'Saving…' : editItem ? 'Save Changes' : 'Create'}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ── Adjust Stock Modal (Add/Release combined) ─────────────── */}
      {showAdjust && adjustItem && (
        <ModalOverlay onClose={() => setShowAdjust(false)}>
          <h3 className="inv-modal-title">Adjust Inventory</h3>
          <p className="inv-modal-sub">{adjustItem.name} — Current: <strong style={{ color: '#e2e8f0' }}>{adjustItem.qty_on_hand}</strong> {adjustItem.unit}</p>
          <form onSubmit={submitAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InvField
              label="Number of Release *"
              type="number"
              value={adjustForm.releaseQty}
              onChange={v => setAdjustForm(f => ({ ...f, releaseQty: v }))}
              required
              min="0"
            />

            <div className="inv-field">
              <label className="inv-label">Add</label>
              <input
                type="number"
                value={adjustForm.addQty}
                onChange={e => setAdjustForm(f => ({ ...f, addQty: e.target.value }))}
                min="0"
                className="inv-input"
                placeholder="0"
              />
            </div>

            <InvField
              label="Start Date Time"
              type="datetime-local"
              value={adjustForm.movementDateTime}
              onChange={v => { setAutoNowAdjust(false); setAdjustForm(f => ({ ...f, movementDateTime: v })) }}
              full
            />

            <div className="inv-field">
              <label className="inv-label">To</label>
              <select
                className="inv-select"
                value={adjustForm.to}
                onChange={e => {
                  const next = e.target.value
                  setAdjustForm(f => ({ ...f, to: next, toOther: next === 'Other' ? f.toOther : '' }))
                }}
              >
                <option value="">— Select —</option>
                {branchLocations.map(b => <option key={b} value={b}>{b}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            {adjustForm.to === 'Other' && (
              <InvField
                label="Other (To) *"
                value={adjustForm.toOther}
                onChange={v => setAdjustForm(f => ({ ...f, toOther: v }))}
                required
                full
              />
            )}
            <InvField
              label="Request by"
              value={adjustForm.requestedBy}
              onChange={v => setAdjustForm(f => ({ ...f, requestedBy: v }))}
            />

            <div className="inv-modal-actions">
              <button type="button" className="inv-cancel-btn" onClick={() => setShowAdjust(false)}>Cancel</button>
              <button type="submit" className="inv-submit-btn" disabled={adjustLoading}>{adjustLoading ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ── Detail / Movement History Modal ────────────────────────── */}
      {detailItem && (
        <ModalOverlay onClose={() => setDetailItem(null)} wide>
          <h3 className="inv-modal-title">{detailItem.name}</h3>
          <p className="inv-modal-sub">SKU: {detailItem.sku || 'N/A'} · {detailItem.category} · Supplier: {detailItem.supplier_ref || 'N/A'}</p>
          <div className="inv-detail-stats">
            {[
              ['Beginning Inventory', detailItem.qty_on_hand ?? 0],
              ['Qty On Hand', detailItem.qty_on_hand],
              ['Min Qty',     detailItem.qty_minimum],
              ['Date', detailItem.inventory_date ? formatDateOnlyDisplay(detailItem.inventory_date, 'en-PH') : (detailItem.created_at ? new Date(detailItem.created_at).toLocaleDateString('en-PH') : '—')],
            ].map(([k, v]) => (
              <div key={k} className="inv-detail-stat">
                <div className="inv-detail-stat-label">{k}</div>
                <div className="inv-detail-stat-value">{v}</div>
              </div>
            ))}
          </div>
          <h4 className="inv-section-title">Movement History</h4>
          <div className="inv-movement-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  {['Date', 'Type', 'Qty', 'Before', 'After', 'Job Order', 'Note'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!detailItem.movements || detailItem.movements.length === 0) ? (
                  <tr><td colSpan={7} className="inv-empty">No movements recorded.</td></tr>
                ) : detailItem.movements.map((m, i) => (
                  <tr key={i}>
                    <td>{m.created_at ? new Date(m.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '—'}</td>
                    <td><WorkflowStatusBadge status={m.movement_type} /></td>
                    <td style={{ fontWeight: 700, color: '#e2e8f0' }}>{m.qty}</td>
                    <td>{m.qty_before}</td>
                    <td>{m.qty_after}</td>
                    <td>{m.job_order_no || '—'}</td>
                    <td>{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inv-modal-actions">
            <button className="inv-cancel-btn" onClick={() => setDetailItem(null)}>Close</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirm ──────────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmModal
          isOpen={!!deleteTarget}
          title="Delete Item"
          message={`Delete "${deleteTarget.name}" from inventory? This cannot be undone.`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function ActionBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} className="inv-action-btn" style={{ color, borderColor: `${color}55` }}>
      {label}
    </button>
  )
}

function ModalOverlay({ children, onClose, wide }) {
  return (
    <div className="inv-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`inv-modal-box${wide ? ' wide' : ''}`}>
        {children}
      </div>
    </div>
  )
}

function InvField({ label, value, onChange, type = 'text', required, placeholder, disabled, min, full }) {
  return (
    <div className={`inv-field${full ? ' full' : ''}`}>
      <label className="inv-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        className="inv-input"
      />
    </div>
  )
}
