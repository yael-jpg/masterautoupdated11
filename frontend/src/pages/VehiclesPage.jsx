import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { DataTable } from '../components/DataTable'
import { PaginationBar } from '../components/PaginationBar'
import { SectionCard } from '../components/SectionCard'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { VehicleDetail } from '../components/VehicleDetail'
import { SearchableSelect } from '../components/SearchableSelect'

export function VehiclesPage({ token, user, preselectedCustomerId, onPreselectedConsumed, onAfterVehicleSave }) {
  const isSuperAdmin = user?.role === 'SuperAdmin'
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState(new Set())
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 })
  const [customers, setCustomers] = useState([])
  const [error, setError] = useState('')
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } })
  const [viewingVehicle, setViewingVehicle] = useState(null)
  const [viewingOwner, setViewingOwner] = useState(null)
  const [makes, setMakes] = useState([])        // { id, name, category }
  const [models, setModels] = useState([])       // { id, name } for selected make
  const [variants, setVariants] = useState([])   // { id, name } for selected model
  const [vehicleCategories, setVehicleCategories] = useState([]) // from settings

  const [form, setForm] = useState({
    customerId: '',
    plateNumber: '',
    conductionSticker: '',
    vinChassis: '',
    make: '',
    customMake: '',
    model: '',
    year: new Date().getFullYear(),
    variant: '',
    color: '',
    odometer: 0,
    bodyType: '',
  })

  // Close modal helper
  const handleCloseModal = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({
      customerId: customers.length ? customers[0].id : '',
      plateNumber: '',
      conductionSticker: '',
      vinChassis: '',
      make: '',
      customMake: '',
      model: '',
      year: new Date().getFullYear(),
      variant: '',
      color: '',
      odometer: 0,
      bodyType: '',
      _customModel: false,
      _customVariant: false,
    })
  }

  const loadData = async (nextPage = page, nextSearch = search) => {
    const [vehicleResult, customerResult, makesResult] = await Promise.all([
      apiGet('/vehicles', token, {
        page: nextPage,
        limit: pagination.limit,
        search: nextSearch,
      }),
      apiGet('/customers', token, { page: 1, limit: 100 }),
      apiGet('/vehicle-makes', token),
    ])
    const vehicles = vehicleResult.data
    const customerList = customerResult.data || customerResult
    setPagination(vehicleResult.pagination)
    setPage(vehicleResult.pagination.page)
    // Filter out placeholder makes like 'All' or 'All Vehicles' that should
    // not appear in the Register Vehicle make dropdown.
    const unsafeNames = [/^all(\b|$)/i, /^all vehicles?/i]
    const safeMakes = (Array.isArray(makesResult) ? makesResult : []).filter(m => {
      if (!m || !m.name) return false
      return !unsafeNames.some((rx) => rx.test(m.name))
    })
    setMakes(safeMakes)

    setRows(
      vehicles.map((vehicle) => {
        const plateLabel = (() => {
          let badge = ''
          if (vehicle.plate_verified) badge = ' ✓'
          else if (vehicle.is_suspicious) badge = ' ⚠'
          return vehicle.plate_number + badge
        })()
        return {
          key: `vehicle-${vehicle.id}`,
          cells: [
            plateLabel,
            vehicle.conduction_sticker || '-',
            `${vehicle.make} ${vehicle.model} ${vehicle.year || ''}`,
            vehicle.color || '-',
            vehicle.odometer || 0,
            vehicle.customer_name || '—',
          ],
          raw: vehicle,
        }
      }),
    )
    setCustomers(customerList)
    setSelectedKeys(new Set())
    if (!form.customerId && customerList.length) {
      setForm((prev) => ({ ...prev, customerId: customerList[0].id }))
    }
  }

  const handleEdit = (vehicle) => {
    setEditingId(vehicle.id)
    setForm({
      customerId: vehicle.customer_id,
      plateNumber: vehicle.plate_number,
      conductionSticker: vehicle.conduction_sticker || '',
      vinChassis: vehicle.vin_chassis || '',
      make: vehicle.custom_make ? 'Other' : vehicle.make,
      customMake: vehicle.custom_make || '',
      model: vehicle.model,
      year: vehicle.year || new Date().getFullYear(),
      variant: vehicle.variant || '',
      color: vehicle.color || '',
      odometer: vehicle.odometer || 0,
      bodyType: vehicle.body_type || '',
      _customModel: false,
    })
    setShowForm(true)
  }

  const handleDelete = (id) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Vehicle',
      message: 'Are you sure you want to delete this vehicle? This will also affect linked service history.',
      onConfirm: async () => {
        try {
          await apiDelete(`/vehicles/${id}`, token)
          await loadData()
          setConfirmConfig((p) => ({ ...p, isOpen: false }))
          setError('')
          pushToast('success', 'Vehicle deleted successfully.')
        } catch (deleteError) {
          setError(deleteError.message)
        }
      },
    })
  }

  // Build display rows at render time so setViewingVehicle is always a fresh reference
  const visibleRows = rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell, i) => {
      // Make the Customer column (index 5) a clickable button
      if (i === 5) {
        return (
          <button
            key="customer-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setViewingVehicle(row.raw)
            }}
            style={{
              background: 'none', border: 'none', padding: 0, margin: 0,
              color: '#38bdf8', fontWeight: 600, cursor: 'pointer',
              textAlign: 'left', font: 'inherit', fontSize: 'inherit',
              textDecoration: 'underline', textDecorationColor: 'rgba(56,189,248,0.4)',
              textUnderlineOffset: '3px',
            }}
          >
            {cell}
          </button>
        )
      }
      return cell
    }),
  }))

  const handleToggleRow = (row, checked) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(row.key)
      } else {
        next.delete(row.key)
      }
      return next
    })
  }

  const handleToggleAll = (checked, visible) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      visible.forEach((row) => {
        if (checked) {
          next.add(row.key)
        } else {
          next.delete(row.key)
        }
      })
      return next
    })
  }

  const handleBulkDelete = () => {
    if (!selectedKeys.size) return

    setConfirmConfig({
      isOpen: true,
      title: 'Delete Selected',
      message: `Are you sure you want to delete ${selectedKeys.size} vehicles?`,
      onConfirm: async () => {
        try {
          const selectedIds = rows
            .filter((row) => selectedKeys.has(row.key))
            .map((row) => row.raw.id)
          await Promise.all(selectedIds.map((id) => apiDelete(`/vehicles/${id}`, token)))
          await loadData()
          setConfirmConfig((p) => ({ ...p, isOpen: false }))
          setSelectedKeys(new Set())
          setError('')
          pushToast('success', `${selectedIds.length} vehicles deleted.`)
        } catch (bulkError) {
          setError(bulkError.message)
        }
      },
    })
  }

  useEffect(() => {
    loadData(1, search).catch((loadError) => setError(loadError.message))
  }, [token, search])

  // Load vehicle categories from config settings
  useEffect(() => {
    apiGet('/config', token)
      .then((resp) => {
        const data = resp.data || resp || {}
        const entries = data.vehicle || []
        const entry = (Array.isArray(entries) ? entries : Object.entries(entries || {}).map(([k, v]) => ({ key: k, value: v.value }))).find((e) => e.key === 'default_categories')
        if (entry) {
          try { setVehicleCategories(JSON.parse(entry.value || '[]')) } catch { /* ignore */ }
        }
      })
      .catch(() => { })
  }, [token])

  // Load models when make changes
  useEffect(() => {
    if (!form.make || form.make === 'Other') {
      setModels([])
      setVariants([])
      return
    }
    const makeObj = makes.find((m) => m.name === form.make)
    if (!makeObj) { setModels([]); setVariants([]); return }
    apiGet(`/vehicle-makes/${makeObj.id}/models`, token)
      .then((data) => setModels(Array.isArray(data) ? data : []))
      .catch(() => setModels([]))
    setVariants([])
  }, [form.make, makes, token])

  // Load variants when model changes
  useEffect(() => {
    if (!form.model || form._customModel) {
      setVariants([])
      return
    }
    const modelObj = models.find((m) => m.name === form.model)
    if (!modelObj) { setVariants([]); return }
    apiGet(`/vehicle-makes/models/${modelObj.id}/variants`, token)
      .then((data) => setVariants(Array.isArray(data) ? data : []))
      .catch(() => setVariants([]))
  }, [form.model, form._customModel, models, token])

  // Auto-open register form when redirected from CRM "Add Customer"
  useEffect(() => {
    if (preselectedCustomerId && customers.length > 0) {
      setForm((prev) => ({ ...prev, customerId: preselectedCustomerId }))
      setEditingId(null)
      setShowForm(true)
      if (onPreselectedConsumed) onPreselectedConsumed()
    }
  }, [preselectedCustomerId, customers])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (form.odometer === '' || form.odometer === null || form.odometer === undefined || Number.isNaN(Number(form.odometer))) {
      setError('Odometer reading is required.')
      return
    }
    let result
    try {
      const payload = {
        ...form,
        customerId: Number(form.customerId),
        year: Number(form.year),
        odometer: Number(form.odometer),
      }
      delete payload._customModel   // internal UI state, don't send
      delete payload._customVariant  // internal UI state, don't send
      if (editingId) {
        result = await apiPatch(`/vehicles/${editingId}`, token, payload)
      } else {
        result = await apiPost('/vehicles', token, payload)
      }
      if (result?.warning) {
        setError(result.warning)
      } else {
        setError('')
      }
      handleCloseModal()
      await loadData(page, search)
      try {
        const created = result && (result.data || result) ? (result.data || result) : result
        if (!editingId) {
          pushToast('success', 'Vehicle registered successfully!')
          if (onAfterVehicleSave && created && created.id) onAfterVehicleSave(created)
        } else {
          pushToast('success', 'Vehicle updated successfully.')
        }
      } catch (e) {
        // swallow callback errors
      }
    } catch (submitError) {
      // Handle duplicate plate warning (409) — ask user to confirm
      if (submitError.duplicate && !submitError.sameCustomer) {
        setConfirmConfig({
          isOpen: true,
          title: 'Duplicate Plate Detected',
          message: submitError.message || 'This plate number already exists. Continue anyway?',
          onConfirm: async () => {
            try {
              const forcePayload = {
                ...form,
                customerId: Number(form.customerId),
                year: Number(form.year),
                odometer: Number(form.odometer),
                forceCreate: true,
              }
              delete forcePayload._customModel
              delete forcePayload._customVariant
              if (editingId) {
                result = await apiPatch(`/vehicles/${editingId}`, token, forcePayload)
              } else {
                result = await apiPost('/vehicles', token, forcePayload)
              }
              handleCloseModal()
              await loadData(page, search)
              try {
                const created = result && (result.data || result) ? (result.data || result) : result
                if (!editingId && onAfterVehicleSave && created && created.id) onAfterVehicleSave(created)
              } catch (e) {
                // ignore
              }
              setError('')
            } catch (forceError) {
              setError(forceError.message)
            }
          },
        })
      } else {
        setError(submitError.message)
      }
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Vehicle Profile & Service History"
        subtitle="Complete documentation: all-angle photos, damage tracking, service records with jobs, packages, dates & assigned staff"
        actionLabel={showForm ? 'Cancel adding' : '+ Register vehicle'}
        onActionClick={() => setShowForm(!showForm)}
      >
        <div className="module-toolbar">
          <input
            type="search"
            placeholder="Search plate, make, model, color..."
            value={search}
            onChange={(event) => {
              setPage(1)
              setSearch(event.target.value)
            }}
          />
          <button
            type="button"
            className="btn-danger"
            onClick={handleBulkDelete}
            disabled={!isSuperAdmin || !selectedKeys.size}
            title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : undefined}
            style={{ display: 'inline-block', cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
          >
            Delete Selected ({selectedKeys.size})
          </button>
          <button type="button" className="btn-secondary" onClick={() => setSelectedKeys(new Set())}>
            Clear Selection
          </button>
        </div>

        <DataTable
          headers={['Plate #', 'Conduction', 'Make/Model/Year', 'Color', 'Odometer', 'Customer']}
          rows={visibleRows}
          selectable
          selectedKeys={selectedKeys}
          onToggleRow={handleToggleRow}
          onToggleAll={handleToggleAll}
          onRowClick={(raw) => setViewingVehicle(raw)}
          rowActions={(vehicle) => (
            <div className="row-actions">
              <button
                type="button"
                className="btn-icon"
                onClick={() => setViewingVehicle(vehicle)}
                title="View Details"
                aria-label="View Details"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => handleEdit(vehicle)}
                disabled={!isSuperAdmin}
                title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : 'Edit'}
                aria-label="Edit"
                style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                type="button"
                className="btn-icon action-danger"
                onClick={() => handleDelete(vehicle.id)}
                disabled={!isSuperAdmin}
                title={!isSuperAdmin ? 'Access restricted — SuperAdmin only' : 'Delete'}
                aria-label="Delete"
                style={{ cursor: !isSuperAdmin ? 'not-allowed' : undefined, opacity: !isSuperAdmin ? 0.45 : 1 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        />

        <PaginationBar
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={(nextPage) => loadData(nextPage, search).catch((e) => setError(e.message))}
        />

        <Modal
          isOpen={showForm}
          onClose={handleCloseModal}
          title={editingId ? 'Edit Vehicle' : 'Register Vehicle'}
        >
          <form className="entity-form vehicle-form" onSubmit={handleSubmit}>

            {/* ── Owner ─────────────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">👤</span>
              <span className="vf-section-label">Owner</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group full-width">
              <label className="vf-label">Customer <span className="vf-required">*</span></label>
              <SearchableSelect
                placeholder="Search customer…"
                value={String(form.customerId ?? '')}
                onChange={(val) => setForm((prev) => ({ ...prev, customerId: val }))}
                required
                options={customers.map((c) => ({
                  value: String(c.id),
                  label: c.full_name,
                  description: [c.mobile, c.email].filter(Boolean).join(' · '),
                }))}
              />
            </div>

            {/* ── Identification ────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">🪪</span>
              <span className="vf-section-label">Identification</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Plate Number <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">🔢</span>
                <input
                  className="vf-has-icon"
                  placeholder="ABC 1234"
                  value={form.plateNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, plateNumber: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">Conduction Sticker <span style={{ fontWeight: 400, color: '#888', fontSize: '0.85em' }}>(Optional)</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📋</span>
                <input
                  className="vf-has-icon"
                  placeholder="CS-123456"
                  value={form.conductionSticker}
                  onChange={(event) => setForm((prev) => ({ ...prev, conductionSticker: event.target.value }))}
                />
              </div>
            </div>

            <div className="form-group full-width">
              <label className="vf-label">VIN / Chassis Number <span style={{ fontWeight: 400, color: '#888', fontSize: '0.85em' }}>(Optional)</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">🔑</span>
                <input
                  className="vf-has-icon"
                  placeholder="e.g. 1HGBH41JXMN109186"
                  value={form.vinChassis}
                  onChange={(event) => setForm((prev) => ({ ...prev, vinChassis: event.target.value }))}
                />
              </div>
            </div>

            {/* ── Vehicle Specs ─────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">🚗</span>
              <span className="vf-section-label">Vehicle Specs</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Make <span className="vf-required">*</span></label>
              <SearchableSelect
                options={makes.map((m) => ({ value: m.name, label: m.name, category: m.category || 'Other' }))}
                value={form.make}
                onChange={(val) => setForm((prev) => ({ ...prev, make: val, model: '', customMake: '', variant: '', _customModel: false, _customVariant: false }))}
                placeholder="Search brand…"
                required
                grouped
              />
            </div>

            <div className="form-group">
              <label className="vf-label">Model <span className="vf-required">*</span></label>
              {models.length > 0 && !form._customModel ? (
                <SearchableSelect
                  options={[
                    ...models.map((m) => ({ value: m.name, label: m.name })),
                    { value: '__custom__', label: 'Other (type manually)' },
                  ]}
                  value={models.some((m) => m.name === form.model) ? form.model : ''}
                  onChange={(val) => {
                    if (val === '__custom__') {
                      setForm((prev) => ({ ...prev, model: '', _customModel: true, variant: '', _customVariant: false }))
                    } else {
                      setForm((prev) => ({ ...prev, model: val, _customModel: false, variant: '', _customVariant: false }))
                    }
                  }}
                  placeholder="Search model…"
                  required
                />
              ) : (
                <>
                  <input
                    placeholder="Enter model name"
                    value={form.model}
                    onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                    required
                  />
                  {models.length > 0 && (
                    <button type="button" className="vf-back-link"
                      onClick={() => setForm((prev) => ({ ...prev, model: '', _customModel: false }))}>
                      ← Back to model list
                    </button>
                  )}
                </>
              )}
            </div>

            {form.make === 'Other' && (
              <div className="form-group">
                <label className="vf-label">Specify Make <span className="vf-required">*</span></label>
                <input
                  placeholder="Enter brand name"
                  value={form.customMake}
                  onChange={(event) => setForm((prev) => ({ ...prev, customMake: event.target.value }))}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label className="vf-label">Variant</label>
              {variants.length > 0 && !form._customVariant ? (
                <SearchableSelect
                  options={[
                    ...variants.map((v) => ({ value: v.name, label: v.name })),
                    { value: '__custom__', label: 'Other (type manually)' },
                  ]}
                  value={variants.some((v) => v.name === form.variant) ? form.variant : ''}
                  onChange={(val) => {
                    if (val === '__custom__') {
                      setForm((prev) => ({ ...prev, variant: '', _customVariant: true }))
                    } else {
                      setForm((prev) => ({ ...prev, variant: val, _customVariant: false }))
                    }
                  }}
                  placeholder={form.model ? 'Search variant…' : 'Select a model first'}
                  disabled={!form.model}
                />
              ) : (
                <>
                  <input
                    placeholder={
                      !form.make ? 'Select a make first' :
                        !form.model ? 'Select a model first' :
                          'e.g. 1.3 E MT'
                    }
                    value={form.variant}
                    onChange={(event) => setForm((prev) => ({ ...prev, variant: event.target.value }))}
                    disabled={!form.make || !form.model}
                  />
                  {variants.length > 0 && (
                    <button type="button" className="vf-back-link"
                      onClick={() => setForm((prev) => ({ ...prev, variant: '', _customVariant: false }))}>
                      ← Back to variant list
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="form-group">
              <label className="vf-label">Year Model <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📅</span>
                <input
                  className="vf-has-icon"
                  type="number"
                  placeholder="2024"
                  value={form.year}
                  onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
                  required
                />
              </div>
            </div>

            {vehicleCategories.length > 0 && (
              <div className="form-group">
                <label className="vf-label">Body Type</label>
                <select
                  value={form.bodyType}
                  onChange={(event) => setForm((prev) => ({ ...prev, bodyType: event.target.value }))}
                >
                  <option value="">— Select category —</option>
                  {vehicleCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Details ───────────────────────────────────── */}
            <div className="vf-section-divider full-width">
              <span className="vf-section-icon">🎨</span>
              <span className="vf-section-label">Details</span>
              <span className="vf-section-line" />
            </div>

            <div className="form-group">
              <label className="vf-label">Color</label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">🎨</span>
                <input
                  className="vf-has-icon"
                  placeholder="e.g. Pearl White"
                  value={form.color}
                  onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="vf-label">Odometer (km) <span className="vf-required">*</span></label>
              <div className="vf-input-wrap">
                <span className="vf-input-icon">📍</span>
                <input
                  className="vf-has-icon"
                  type="number"
                  placeholder="0"
                  value={form.odometer}
                  onChange={(event) => setForm((prev) => ({ ...prev, odometer: event.target.value }))}
                />
              </div>
            </div>

            {/* ── Actions ───────────────────────────────────── */}
            <div className="vf-form-actions full-width">
              <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button type="submit" className="btn-primary vf-submit">
                {editingId ? '✓ Update Vehicle' : '+ Save Vehicle'}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
        {error ? <p className="page-error">{error}</p> : null}
      </SectionCard>

      {viewingVehicle && (
        <Modal
          isOpen={!!viewingVehicle}
          onClose={() => setViewingVehicle(null)}
          title=""
          wide
        >
          <VehicleDetail
            vehicle={viewingVehicle}
            token={token}
            onClose={() => setViewingVehicle(null)}
            onOwnerClick={(v) => {
              const owner = customers.find(c => String(c.id) === String(v.customer_id))
              setViewingOwner(owner || { full_name: v.customer_name, id: v.customer_id })
            }}
          />
        </Modal>
      )}

      {/* ── Owner Detail Modal ── */}
      {viewingOwner && (
        <Modal
          isOpen={!!viewingOwner}
          onClose={() => setViewingOwner(null)}
          title="Owner Details"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Avatar + Name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0 20px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', fontWeight: 700, color: '#94a3b8', flexShrink: 0,
              }}>
                {(viewingOwner.full_name || '?').trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>{viewingOwner.full_name || '—'}</div>
                {viewingOwner.customer_type && (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99,
                    background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                    color: '#38bdf8',
                  }}>{viewingOwner.customer_type}</span>
                )}
              </div>
            </div>

            {/* Detail rows */}
            {[
              {
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.38 2 2 0 0 1 3.56 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z" /></svg>,
                label: 'Mobile', value: viewingOwner.mobile,
              },
              {
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
                label: 'Email', value: viewingOwner.email,
              },
              {
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
                label: 'Address', value: viewingOwner.address,
              },
              {
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
                label: 'Preferred Contact', value: viewingOwner.preferred_contact_method,
              },
              {
                icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
                label: 'Lead Source', value: viewingOwner.lead_source,
              },
            ].filter(r => r.value).map(({ icon, label, value }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', padding: '9px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 12, fontSize: '0.875rem',
              }}>
                <div style={{ width: '38%', display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(160,168,184,0.8)', fontWeight: 500, flexShrink: 0 }}>
                  <span style={{ opacity: 0.7, display: 'flex', alignItems: 'center' }}>{icon}</span>
                  <span>{label}</span>
                </div>
                <div style={{ flex: 1, color: 'var(--text-primary)' }}>{value}</div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn-secondary" onClick={() => setViewingOwner(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      <section className="quick-panels">
        <article>
          <h3>📸 Photo Capture & Storage</h3>
          <p>Before photos: all sides + close-ups of issues. After photos: completed work. Damage & remarks photo tagging with custom labels.</p>
        </article>
        <article>
          <h3>📋 Full Service History</h3>
          <p>Complete timeline per vehicle: jobs done, service dates, packages used, assigned staff, damage notes, remarks, and odometer readings.</p>
        </article>
        <article>
          <h3>🔍 Organized Documentation</h3>
          <p>Tagged photos linked to specific service transactions. Visual proof of pre-existing damage and quality work delivered.</p>
        </article>
      </section>
    </div>
  )
}
