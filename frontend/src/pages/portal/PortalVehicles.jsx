import { useEffect, useState } from 'react'
import { portalGet, portalPost } from '../../api/portalClient'
import { pushToast } from '../../api/client'
import { Modal } from '../../components/Modal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { SearchableSelect } from '../../components/SearchableSelect'
import { onVehicleMakesUpdated } from '../../utils/events'

function OwnerSelect({ me }) {
  const label = me?.full_name || me?.fullName || 'My Account'
  const description = [me?.mobile, me?.email].filter(Boolean).join(' · ')
  return (
    <div className="form-group full-width">
      <label className="vf-label">Customer <span className="vf-required">*</span></label>
      <SearchableSelect
        placeholder="Customer"
        value={String(me?.id ?? 'me')}
        onChange={() => {}}
        required
        options={[{ value: String(me?.id ?? 'me'), label, description }]}
        disabled
      />
    </div>
  )
}

function VehicleDetail({ vehicleId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    portalGet(`/vehicles/${vehicleId}/detail`)
      .then(setData)
      .catch((err) => {
        console.error('Vehicle detail fetch error:', err)
        setData({ photos: [], serviceRecords: [], error: err.message })
      })
      .finally(() => setLoading(false))
  }, [vehicleId])

  if (loading) {
    return (
      <div className="portal-vd-state">
        Loading details…
      </div>
    )
  }

  const {
    plate_number,
    make,
    model,
    year,
    variant,
    color,
    odometer,
    conduction_sticker,
    vin_chassis,
    error: detailError,
  } = data || {}

  if (detailError) {
    return (
      <div className="portal-vd-error">
        Could not load vehicle details. Please try again.
      </div>
    )
  }

  return (
    <div className="portal-vehicle-detail-panel">
      <div className="portal-vd-section-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
        </svg>
        Vehicle Details
      </div>

      <div className="portal-info-box portal-info-box--row">
        {plate_number && (
          <div className="portal-info-item">
            <span className="portal-info-label">Plate:</span>
            <span className="portal-info-value">{plate_number}</span>
          </div>
        )}
        {(year || make || model) && (
          <div className="portal-info-item">
            <span className="portal-info-label">Vehicle:</span>
            <span className="portal-info-value">{[year, make, model].filter(Boolean).join(' ')}</span>
          </div>
        )}
        {variant && (
          <div className="portal-info-item">
            <span className="portal-info-label">Variant:</span>
            <span className="portal-info-value">{variant}</span>
          </div>
        )}
        {color && (
          <div className="portal-info-item">
            <span className="portal-info-label">Color:</span>
            <span className="portal-info-value">{color}</span>
          </div>
        )}
        {odometer != null && (
          <div className="portal-info-item">
            <span className="portal-info-label">Odometer:</span>
            <span className="portal-info-value">{Number(odometer).toLocaleString()} km</span>
          </div>
        )}
        {conduction_sticker && (
          <div className="portal-info-item">
            <span className="portal-info-label">Conduction:</span>
            <span className="portal-info-value">{conduction_sticker}</span>
          </div>
        )}
        {vin_chassis && (
          <div className="portal-info-item">
            <span className="portal-info-label">VIN/Chassis:</span>
            <span className="portal-info-value">{vin_chassis}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PortalVehicleRegisterModal({
  isOpen,
  onClose,
  onCreated,
  me,
  makes,
}) {
  const [error, setError] = useState('')
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} })
  const [models, setModels] = useState([])
  const [variants, setVariants] = useState([])
  const [localMakes, setLocalMakes] = useState([])
  const [form, setForm] = useState({
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

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setConfirmConfig((p) => ({ ...p, isOpen: false }))
    setModels([])
    setVariants([])

    const unsafeNames = [/^all(\b|$)/i, /^all vehicles?/i]
    const safeMakes = (Array.isArray(makes) ? makes : []).filter((m) => m?.name && !unsafeNames.some((rx) => rx.test(m.name)))
    setLocalMakes(safeMakes)

    setForm({
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
  }, [isOpen, makes])

  // If parent did not load makes yet, fetch when opening modal.
  useEffect(() => {
    if (!isOpen) return
    if (localMakes.length) return
    portalGet('/vehicle-makes')
      .then((data) => {
        const unsafeNames = [/^all(\b|$)/i, /^all vehicles?/i]
        const safeMakes = (Array.isArray(data) ? data : []).filter((m) => m?.name && !unsafeNames.some((rx) => rx.test(m.name)))
        setLocalMakes(safeMakes)
      })
      .catch(() => {})
  }, [isOpen, localMakes.length])

  useEffect(() => {
    if (!isOpen) return
    const off = onVehicleMakesUpdated(() => {
      portalGet('/vehicle-makes')
        .then((data) => {
          const unsafeNames = [/^all(\b|$)/i, /^all vehicles?/i]
          const safeMakes = (Array.isArray(data) ? data : []).filter((m) => m?.name && !unsafeNames.some((rx) => rx.test(m.name)))
          setLocalMakes(safeMakes)
        })
        .catch(() => {})
    })
    return off
  }, [isOpen])

  // Load models when make changes
  useEffect(() => {
    if (!isOpen) return
    if (!form.make || form.make === 'Other') {
      setModels([])
      setVariants([])
      return
    }
    const makeName = String(form.make || '').trim()
    const makeObj = localMakes.find((m) => String(m.name || '').trim().toLowerCase() === makeName.toLowerCase())
    if (!makeObj) { setModels([]); setVariants([]); return }
    let cancelled = false
    const makeId = makeObj.id
    portalGet(`/vehicle-makes/${makeId}/models`)
      .then((data) => {
        if (cancelled) return
        const stillSelected = localMakes
          .find((m) => String(m.name || '').trim().toLowerCase() === String(form.make || '').trim().toLowerCase())
          ?.id === makeId
        if (!stillSelected) return
        setModels(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (cancelled) return
        setModels([])
      })
    setVariants([])
    return () => {
      cancelled = true
    }
  }, [isOpen, form.make, localMakes])

  // Load variants when model changes
  useEffect(() => {
    if (!isOpen) return
    if (!form.model || form._customModel) {
      setVariants([])
      return
    }
    const modelNameNormalized = String(form.model || '').trim().toLowerCase()
    const modelObj = models.find((m) => String(m.name || '').trim().toLowerCase() === modelNameNormalized)
    if (!modelObj) { setVariants([]); return }
    let cancelled = false
    const modelId = modelObj.id
    const modelName = form.model
    portalGet(`/vehicle-makes/models/${modelId}/variants`)
      .then((data) => {
        if (cancelled) return
        const stillSelected =
          String(form.model || '').trim().toLowerCase() === String(modelName || '').trim().toLowerCase() &&
          models.some(
            (m) => m.id === modelId && String(m.name || '').trim().toLowerCase() === String(modelName || '').trim().toLowerCase()
          )
        if (!stillSelected) return
        setVariants(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (cancelled) return
        setVariants([])
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, form.model, form._customModel, models])

  const makeOptions = (() => {
    const base = localMakes.map((m) => ({ value: m.name, label: m.name, category: m.category || 'Other' }))
    // Staff/admin modal supports selecting "Other" for custom make; ensure it exists even
    // if the database doesn't have an explicit "Other" make row.
    if (!base.some((o) => o.value === 'Other')) {
      base.push({ value: 'Other', label: 'Other (type manually)', category: 'Other' })
    }
    return base
  })()

  const submitVehicle = async (payload) => {
    const rawMake = String(payload.make || '').trim()
    const matchedMake = localMakes.find((m) => String(m?.name || '').trim().toLowerCase() === rawMake.toLowerCase())
    const explicitOther = rawMake.toLowerCase() === 'other'
    const resolvedMake = matchedMake ? matchedMake.name : 'Other'
    const resolvedCustomMake = explicitOther
      ? String(payload.customMake || '').trim()
      : (matchedMake ? '' : rawMake)

    await portalPost('/vehicles', {
      ...payload,
      make: resolvedMake,
      customMake: resolvedMake === 'Other' ? resolvedCustomMake : null,
    })
    pushToast('success', 'Vehicle registered successfully')
    await onCreated?.()
    onClose?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (form.odometer === '' || form.odometer === null || form.odometer === undefined || Number.isNaN(Number(form.odometer))) {
      setError('Odometer reading is required.')
      return
    }
    try {
      const payload = {
        ...form,
        year: Number(form.year),
        odometer: Number(form.odometer),
      }
      delete payload._customModel
      delete payload._customVariant
      await submitVehicle(payload)
      setError('')
    } catch (submitError) {
      if (submitError.duplicate && !submitError.sameCustomer) {
        setConfirmConfig({
          isOpen: true,
          title: 'Duplicate Plate Detected',
          message: submitError.message || 'This plate number already exists. Continue anyway?',
          onConfirm: async () => {
            try {
              const forcePayload = {
                ...form,
                year: Number(form.year),
                odometer: Number(form.odometer),
                forceCreate: true,
              }
              delete forcePayload._customModel
              delete forcePayload._customVariant
              await submitVehicle(forcePayload)
              setConfirmConfig((p) => ({ ...p, isOpen: false }))
              setError('')
            } catch (forceError) {
              setError(forceError.message)
              setConfirmConfig((p) => ({ ...p, isOpen: false }))
            }
          },
        })
      } else {
        setError(submitError.message)
      }
    }
  }

  if (!isOpen) return null

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Register Vehicle"
      >
        <form className="entity-form vehicle-form" onSubmit={handleSubmit}>
          {/* ── Owner ─────────────────────────────────────── */}
          <div className="vf-section-divider full-width">
            <span className="vf-section-icon">👤</span>
            <span className="vf-section-label">Owner</span>
            <span className="vf-section-line" />
          </div>

            <OwnerSelect me={me} />

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
            <label className="vf-label">Conduction Sticker <span className="vf-optional">(Optional)</span></label>
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
            <label className="vf-label">VIN / Chassis Number <span className="vf-optional">(Optional)</span></label>
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
              options={makeOptions}
              value={form.make}
              onChange={(val) =>
                setForm((prev) => ({
                  ...prev,
                  make: String(val || '').trim(),
                  model: '',
                  customMake: String(val || '').trim().toLowerCase() === 'other' ? prev.customMake : '',
                  variant: '',
                  _customModel: false,
                  _customVariant: false,
                }))}
              placeholder="Search brand…"
              required
              grouped
              allowCustomValue
              customValueText={(q) => `Use "${q}" as custom make`}
            />
          </div>

          <div className="form-group">
            <label className="vf-label">Model <span className="vf-required">*</span></label>
            {!form.make ? (
              <input
                placeholder="Select a make first"
                value={form.model}
                onChange={() => {}}
                disabled
              />
            ) : models.length > 0 && !form._customModel ? (
              <SearchableSelect
                options={[
                  ...models.map((m) => ({ value: m.name, label: m.name })),
                  { value: '__custom__', label: 'Other (type manually)' },
                ]}
                value={form.model}
                onChange={(val) => {
                  if (val === '__custom__') {
                    setForm((prev) => ({ ...prev, model: '', _customModel: true, variant: '', _customVariant: false }))
                  } else {
                    setForm((prev) => ({ ...prev, model: String(val || '').trim(), _customModel: false, variant: '', _customVariant: false }))
                  }
                }}
                placeholder="Search model…"
                required
                allowCustomValue
              />
            ) : (
              <>
                <input
                  placeholder={form.make ? 'Enter model name' : 'Select a make first'}
                  value={form.model}
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                  required
                  disabled={!form.make}
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
                value={form.variant}
                onChange={(val) => {
                  if (val === '__custom__') {
                    setForm((prev) => ({ ...prev, variant: '', _customVariant: true }))
                  } else {
                    setForm((prev) => ({ ...prev, variant: val, _customVariant: false }))
                  }
                }}
                placeholder={form.model ? 'Search variant…' : 'Select a model first'}
                disabled={!form.model}
                allowCustomValue
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

          {error ? (
            <div className="full-width vf-inline-error">
              {error}
            </div>
          ) : null}

          {/* ── Actions ───────────────────────────────────── */}
          <div className="vf-form-actions full-width">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary vf-submit">
              + Save Vehicle
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  )
}

export function PortalVehicles({ onBook }) {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailVehicleId, setDetailVehicleId] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [makes, setMakes] = useState([])
  const [me, setMe] = useState(null)

  useEffect(() => {
    let stopped = false

    const loadInitial = async () => {
      setLoading(true)
      try {
        const [v, meData, makesData] = await Promise.all([
          portalGet('/vehicles'),
          portalGet('/me').catch(() => null),
          portalGet('/vehicle-makes').catch(() => []),
        ])
        if (stopped) return
        setVehicles(Array.isArray(v) ? v : [])
        setMe(meData)
        // Filter out placeholder makes like 'All' or 'All Vehicles'
        const unsafeNames = [/^all(\b|$)/i, /^all vehicles?/i]
        const safeMakes = (Array.isArray(makesData) ? makesData : []).filter(m => m?.name && !unsafeNames.some(rx => rx.test(m.name)))
        setMakes(safeMakes)
      } catch (_) {
        // Silent
      } finally {
        if (!stopped) setLoading(false)
      }
    }

    const pollList = async () => {
      // Avoid disrupting modal workflows; still keep list fresh in background.
      if (showForm) return
      try {
        const list = await portalGet('/vehicles')
        if (stopped) return
        setVehicles(Array.isArray(list) ? list : [])
      } catch (_) {
        // Silent
      }
    } 

    loadInitial()

    const intervalMs = 10000
    const id = setInterval(() => pollList(), intervalMs)

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const refreshVehicles = async () => {
    const list = await portalGet('/vehicles')
    setVehicles(Array.isArray(list) ? list : [])
  }

  const openRegister = () => {
    setShowForm(true)
  }

  const handleCloseModal = () => {
    setShowForm(false)
  }

  const openDetails = (vehicleId) => setDetailVehicleId(vehicleId)
  const closeDetails = () => setDetailVehicleId(null)


  function renderContent() {
    if (loading) {
      return (
        <div className="portal-loading">
          Loading your vehicles…
        </div>
      )
    }

    return (
      <>
        <div className="portal-hero">
          <div className="portal-hero-row portal-hero-row--center">
            <div>
              <h2>My Vehicles</h2>
              <p>All vehicles registered under your account at MasterAuto.</p>
            </div>
            <button className="portal-action-btn" onClick={openRegister}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Register Vehicle
            </button>
          </div>
        </div>

        {vehicles.length === 0 ? (
          <div className="portal-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
              <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
            </svg>
            <p>No vehicles found on your account.</p>
            <p className="portal-empty-sub">Register your vehicle to start booking services.</p>
          </div>
        ) : (
          <div className="portal-vehicle-list">
            {vehicles.map((v) => {
              return (
                <div
                  key={v.id}
                  className="portal-vehicle-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetails(v.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openDetails(v.id)
                    }
                  }}
                >
                  {/* Card top row */}
                  <div className="portal-vehicle-card-top">
                    <div className="portal-vehicle-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                        <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
                      </svg>
                    </div>

                    <div className="portal-vehicle-main">
                      <div className="portal-vehicle-plate">{v.plate_number}</div>
                      <div className="portal-vehicle-name">{[v.year, v.make, v.model].filter(Boolean).join(' ')}</div>
                      <div className="portal-vehicle-details">
                        {v.variant && (
                          <div className="portal-vehicle-detail-item">
                            <span className="portal-vehicle-detail-label">Variant</span>
                            <span className="portal-vehicle-detail-value">{v.variant}</span>
                          </div>
                        )}
                        {v.color && (
                          <div className="portal-vehicle-detail-item">
                            <span className="portal-vehicle-detail-label">Color</span>
                            <span className="portal-vehicle-detail-value">{v.color}</span>
                          </div>
                        )}
                        {v.odometer != null && (
                          <div className="portal-vehicle-detail-item">
                            <span className="portal-vehicle-detail-label">Odometer</span>
                            <span className="portal-vehicle-detail-value">{Number(v.odometer).toLocaleString()} km</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="portal-vehicle-actions">
                    <button
                      className="portal-vehicle-book-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onBook?.()
                      }}
                    >
                      Book a Service →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {renderContent()}

      <Modal
        isOpen={detailVehicleId != null}
        onClose={closeDetails}
        title="Vehicle Details"
      >
        {detailVehicleId != null ? <VehicleDetail vehicleId={detailVehicleId} /> : null}
      </Modal>

      <PortalVehicleRegisterModal
        isOpen={showForm}
        onClose={handleCloseModal}
        onCreated={refreshVehicles}
        me={me}
        makes={makes}
      />
    </>
  )
}
