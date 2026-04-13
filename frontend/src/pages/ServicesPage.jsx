import { useMemo, useState, useEffect, useCallback } from 'react'
import { SectionCard } from '../components/SectionCard'
import { apiGet, apiPatch, pushToast } from '../api/client'
import { onConfigUpdated } from '../utils/events'
import {
  SERVICE_CATALOG,
  VEHICLE_SIZE_OPTIONS,
  formatCurrency,
  getCatalogGroups,
  getEffectivePrice,
} from '../data/serviceCatalog'

/* ── Group meta ───────────────────────────────────────────────────────── */
const GROUP_META = {
  'PPF Services': {
    icon: '🛡️',
    color: '#e2e8f0',
    description: 'Paint Protection Film — durable urethane film applied directly to painted surfaces to shield against chips, scratches, and UV fading.',
  },
  'Car Wash Services': {
    icon: '🫧',
    color: '#e2e8f0',
    description: 'Professional vehicle washing from a quick rinse to a full premium foam bath, clay decontamination, and hand-dry finish.',
  },
  'Detailing Services': {
    icon: '✨',
    color: '#e2e8f0',
    description: 'Deep interior & exterior restoration — cleans, polishes, and protects every surface inside and out.',
  },
  'Coating Services': {
    icon: '💎',
    color: '#e2e8f0',
    description: 'Ceramic or graphene nano-coating that bonds to clear coat, delivering extreme hydrophobic protection and a glass-like gloss.',
  },
  'Other Services': {
    icon: '🔧',
    color: '#e2e8f0',
    description: 'Specialty add-ons including engine wash, headlight restoration, acid rain removal, and other targeted treatments.',
  },
}

/* ── Service process flow per group ──────────────────────────────────── */
const SERVICE_PROCESS = {
  'PPF Services': {
    tagline: 'Precision film wrapping by certified installers',
    steps: [
      { num: 1, icon: '🔍', title: 'Vehicle Inspection', desc: 'Full-body scan for scratches, swirl marks, and contaminants that may telegraph through the film.' },
      { num: 2, icon: '🫧', title: 'Surface Preparation', desc: 'Thorough wash, clay-bar decontamination, and panel wipe-down with IPA solution to ensure a clean bond surface.' },
      { num: 3, icon: '✂️', title: 'Film Cutting', desc: 'Precision-plotted patterns cut using digital templates matched to the vehicle make and model.' },
      { num: 4, icon: '🛡️', title: 'Film Application', desc: 'Wet-method installation onto each panel — film stretched and positioned, then squeegeed flat and edge-tucked.' },
      { num: 5, icon: '🌡️', title: 'Heat Forming', desc: 'Heat gun used to conform film around curves, edges, and bumper recesses for a seamless invisible finish.' },
      { num: 6, icon: '✅', title: 'Quality Inspection', desc: 'Each panel checked for lift edges, bubbles, and contamination. Client walkthrough before release.' },
    ],
    duration: '1–3 days depending on coverage area',
    warranty: 'Up to 7 years manufacturer warranty',
  },
  'Car Wash Services': {
    tagline: 'Spotless results — hand-finished every time',
    steps: [
      { num: 1, icon: '💧', title: 'Pre-Rinse', desc: 'High-pressure rinse removes loose dirt and debris from the entire exterior and wheel wells.' },
      { num: 2, icon: '🫧', title: 'Foam Bath', desc: 'pH-neutral snow foam applied and left to dwell, lifting surface contaminants safely before contact washing.' },
      { num: 3, icon: '🧤', title: 'Hand Wash', desc: 'Two-bucket safe wash method using professional-grade wash mitt on all exterior panels.' },
      { num: 4, icon: '🪨', title: 'Clay Bar (Premium+)', desc: 'Clay bar decontamination to remove embedded iron fallout and tar — included in Premium and Signature tiers.' },
      { num: 5, icon: '💨', title: 'Air Dry & Blow-out', desc: 'Compressed air clears water from mirrors, door jambs, badges, and trim gaps before towel drying.' },
      { num: 6, icon: '🪟', title: 'Window & Trim Wipe', desc: 'Glass cleaned streak-free; rubber and plastic trim dressed with protectant on Signature tier.' },
    ],
    duration: '45 min – 3 hrs',
    warranty: 'Satisfaction re-wash guarantee',
  },
  'Detailing Services': {
    tagline: 'Showroom finish — inside and out',
    steps: [
      { num: 1, icon: '📋', title: 'Condition Assessment', desc: 'Paint thickness gauge and light inspection to identify swirls, scratches, and oxidation level.' },
      { num: 2, icon: '🫧', title: 'Deep Exterior Clean', desc: 'Full decontamination wash, clay bar, and iron remover treatment before any paint correction.' },
      { num: 3, icon: '🏠', title: 'Interior Extraction', desc: 'Vacuum all surfaces, steam-clean vents and seams, shampoo carpets and fabric seats (Interior/Full Detail).' },
      { num: 4, icon: '⚙️', title: 'Paint Correction', desc: 'Single or multi-stage machine polish to remove swirls, water spots, and light scratches. Exterior and Full Detail.' },
      { num: 5, icon: '🛡️', title: 'Protection Layer', desc: 'Sealant or quick-coat applied to lock in the corrected finish and add UV and hydrophobic protection.' },
      { num: 6, icon: '✅', title: 'Final QC Walk', desc: 'Detail-by-detail inspection under LED lighting. Any touch-ups addressed before client handover.' },
    ],
    duration: 'Half day – full day',
    warranty: '30-day paint correction guarantee',
  },
  'Coating Services': {
    tagline: 'Nano-ceramic protection bonded at the molecular level',
    steps: [
      { num: 1, icon: '🔬', title: 'Paint Measurement', desc: 'Coating thickness readings across all panels to establish baseline and verify suitability.' },
      { num: 2, icon: '🫧', title: 'Full Decontamination', desc: 'Multi-stage wash, clay, and iron fallout removal to achieve a perfectly clean substrate.' },
      { num: 3, icon: '⚙️', title: 'Paint Correction', desc: 'Machine polishing to eliminate defects; coating will lock in the finish permanently.' },
      { num: 4, icon: '🩺', title: 'Panel Wipe', desc: 'Final IPA panel wipe removes all polish oils so the coating bonds directly to the clear coat.' },
      { num: 5, icon: '💎', title: 'Coating Application', desc: 'Ceramic or graphene coating applied panel-by-panel in controlled-environment bay using applicator block.' },
      { num: 6, icon: '⏳', title: 'Cure & Level Check', desc: 'Coating leveled with IR lamp, cured in clean bay for 12–24 hours before any moisture exposure.' },
      { num: 7, icon: '✅', title: 'Final Inspection', desc: 'Hydrophobic bead test and full light inspection. Client receives aftercare guide and warranty card.' },
    ],
    duration: '2–3 days',
    warranty: 'Ceramic: 3 yr | Graphene: 5 yr warranty',
  },
  'Other Services': {
    tagline: 'Targeted treatments for every paint and mechanical need',
    steps: [
      { num: 1, icon: '📋', title: 'Service Consultation', desc: 'Technician identifies issue (acid marks, oxidized lenses, water stains, etc.) and recommends the right treatment.' },
      { num: 2, icon: '🛁', title: 'Area Preparation', desc: 'Targeted cleaning and masking of adjacent areas to isolate the treatment zone.' },
      { num: 3, icon: '⚙️', title: 'Treatment Application', desc: 'Specialist product or technique applied — acid remover, headlight compound, enzyme cleaner, ArmorAll, etc.' },
      { num: 4, icon: '💧', title: 'Rinse & Neutralise', desc: 'Product residue fully removed and surface neutralized where required (acid rain, engine wash).' },
      { num: 5, icon: '✅', title: 'Result Verification', desc: 'Before-and-after comparison. Client confirms satisfaction before job is marked complete.' },
    ],
    duration: '30 min – 2 hrs per service',
    warranty: 'Result guarantee on all treatments',
  },
}

export function ServicesPage({ token }) {
  const [activeTab, setActiveTab] = useState('price')
  const [activeGroup, setActiveGroup] = useState(getCatalogGroups()[0])
  const [priceOverrides, setPriceOverrides] = useState({})
  const [serviceNameOverrides, setServiceNameOverrides] = useState({})
  const [customServices, setCustomServices] = useState([])

  const [dbServices, setDbServices] = useState([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbError, setDbError] = useState('')
  const [materialsDraft, setMaterialsDraft] = useState({})
  const [selectedMaterialsId, setSelectedMaterialsId] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const dbServicesSorted = useMemo(() => {
    return [...dbServices].sort((a, b) => {
      const cat = String(a.category || '').localeCompare(String(b.category || ''))
      if (cat !== 0) return cat
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [dbServices])

  const displayCatalog = useMemo(() => {
    const customRows = Array.isArray(customServices)
      ? customServices
          .filter((s) => s?.enabled !== false)
          .map((s) => ({
            code: String(s.code || '').trim().toLowerCase(),
            name: String(s.name || '').trim(),
            group: String(s.group || '').trim() || 'Other Services',
            sizePrices: s?.sizePrices && typeof s.sizePrices === 'object' ? s.sizePrices : {},
          }))
          .filter((s) => s.code && s.name)
      : []

    const staticCodes = new Set(SERVICE_CATALOG.map((s) => s.code))
    const dedupedCustom = customRows.filter((s) => !staticCodes.has(s.code))
    return [...SERVICE_CATALOG, ...dedupedCustom]
  }, [customServices])

  const groups = useMemo(
    () => Array.from(new Set(displayCatalog.map((service) => service.group))),
    [displayCatalog],
  )

  useEffect(() => {
    if (!groups.length) return
    if (!groups.includes(activeGroup)) setActiveGroup(groups[0])
  }, [groups, activeGroup])

  const getServicePrice = useCallback((service, sizeKey) => {
    const overrideValue = priceOverrides?.[service.code]?.[sizeKey]
    if (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') {
      return Number(overrideValue)
    }
    return Number(service?.sizePrices?.[sizeKey] || 0)
  }, [priceOverrides])

  const loadQuotationOverrides = useCallback(async () => {
    try {
      const entries = await apiGet('/config/category/quotations')
      const priceEntry = Array.isArray(entries)
        ? entries.find((e) => e.key === 'service_prices')
        : null
      if (priceEntry?.value) {
        try {
          const parsed =
            typeof priceEntry.value === 'string'
              ? JSON.parse(priceEntry.value)
              : priceEntry.value
          if (parsed && typeof parsed === 'object') setPriceOverrides(parsed)
        } catch {}
      }
      const nameEntry = Array.isArray(entries)
        ? entries.find((e) => e.key === 'service_name_overrides')
        : null
      if (nameEntry?.value) {
        try {
          const parsed = typeof nameEntry.value === 'string' ? JSON.parse(nameEntry.value) : nameEntry.value
          if (parsed && typeof parsed === 'object') setServiceNameOverrides(parsed)
        } catch {}
      }

      const customEntry = Array.isArray(entries)
        ? entries.find((e) => e.key === 'custom_services')
        : null
      if (customEntry?.value) {
        try {
          const parsed = typeof customEntry.value === 'string' ? JSON.parse(customEntry.value) : customEntry.value
          if (Array.isArray(parsed)) setCustomServices(parsed)
        } catch {}
      }
    } catch {
      // ignore
    }
  }, [])

  // Load configured price overrides from Configuration > Quotations > Service Pricing
  useEffect(() => {
    loadQuotationOverrides()
    const off = onConfigUpdated((e) => {
      const cat = e?.detail?.category
      if (!cat || cat === 'quotations') loadQuotationOverrides()
    })
    return off
  }, [loadQuotationOverrides])

  useEffect(() => {
    if (activeTab !== 'materials') return
    if (!token) {
      setDbError('Missing session token.')
      return
    }

    setDbLoading(true)
    setDbError('')
    apiGet('/services', token)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : []
        setDbServices(list)
        setSelectedMaterialsId((prev) => {
          if (prev && list.some((s) => String(s.id) === String(prev))) return prev
          return list.length ? String(list[0].id) : null
        })
        setMaterialsDraft((prev) => {
          const next = { ...prev }
          for (const svc of list) {
            const id = String(svc.id)
            if (next[id] === undefined) {
              next[id] = svc.materials_notes || ''
            }
          }
          return next
        })
      })
      .catch((err) => setDbError(err.message || 'Failed to load services'))
      .finally(() => setDbLoading(false))
  }, [activeTab, token])

  const saveMaterials = async (serviceId) => {
    if (!token) return
    const idStr = String(serviceId)
    setSavingId(idStr)
    setDbError('')
    try {
      const materialsNotes = materialsDraft[idStr] ?? ''
      const updated = await apiPatch(`/services/${serviceId}`, token, {
        materialsNotes: materialsNotes.trim() ? materialsNotes : null,
      })
      setDbServices((prev) => prev.map((s) => (Number(s.id) === Number(serviceId) ? updated : s)))
      pushToast('success', 'Materials notes saved.')
    } catch (err) {
      setDbError(err.message || 'Failed to save materials notes')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Services"
        subtitle="MasterAuto service offerings, pricing & process"
      >
        {/* ── Tab bar ─────────────────────────────────────────────── */}
        <div className="svc-tabs">
          <button
            className={`svc-tab${activeTab === 'price' ? ' active' : ''}`}
            onClick={() => setActiveTab('price')}
          >
            💰 Price List
          </button>
          <button
            className={`svc-tab${activeTab === 'process' ? ' active' : ''}`}
            onClick={() => setActiveTab('process')}
          >
            🔄 Service Process
          </button>
          <button
            className={`svc-tab${activeTab === 'materials' ? ' active' : ''}`}
            onClick={() => setActiveTab('materials')}
          >
            🧾 Materials Notes
          </button>
        </div>

        {/* ══ PRICE LIST TAB ══════════════════════════════════════ */}
        {activeTab === 'price' && (
          <div className="svc-price-wrapper">
            {groups.map((group) => {
              const meta = GROUP_META[group] || { icon: '📋', description: '' }
              const rows = displayCatalog.filter((s) => s.group === group)
              return (
                <div key={group} className="svc-group-block">
                  {/* Group header */}
                  <div className="svc-group-header">
                    <span className="svc-group-icon">{meta.icon}</span>
                    <div>
                      <div className="svc-group-title">{group}</div>
                      <div className="svc-group-desc">{meta.description}</div>
                    </div>
                  </div>

                  {/* Price table */}
                  <div className="svc-table-scroll">
                    <table className="svc-table">
                      <thead>
                        <tr>
                          <th className="svc-th-service">Service</th>
                          {VEHICLE_SIZE_OPTIONS.map((size) => (
                            <th key={size.key}>{size.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((service, idx) => (
                          <tr key={service.code} className={idx % 2 === 0 ? 'svc-row-even' : ''}>
                            <td className="svc-td-service">{serviceNameOverrides[service.code] || service.name}</td>
                            {VEHICLE_SIZE_OPTIONS.map((size) => {
                              const hasSize = service.sizePrices[size.key] !== undefined
                              if (!hasSize) {
                                return <td key={size.key} className="svc-td-dash">—</td>
                              }
                              const amount = getServicePrice(service, size.key)
                              const isOverridden =
                                priceOverrides?.[service.code]?.[size.key] !== undefined &&
                                Number(priceOverrides[service.code][size.key]) !== service.sizePrices[size.key]
                              return (
                                <td key={size.key} className="svc-td-price">
                                  <span className={isOverridden ? 'svc-price-custom' : ''}>
                                    {formatCurrency(amount)}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ══ SERVICE PROCESS TAB ═════════════════════════════════ */}
        {activeTab === 'process' && (
          <div className="svc-process-wrapper">
            {/* Group selector pills */}
            <div className="svc-group-pills">
              {groups.map((group) => {
                const meta = GROUP_META[group] || { icon: '📋' }
                return (
                  <button
                    key={group}
                    className={`svc-pill${activeGroup === group ? ' active' : ''}`}
                    onClick={() => setActiveGroup(group)}
                  >
                    <span>{meta.icon}</span>
                    <span>{group}</span>
                  </button>
                )
              })}
            </div>

            {/* Process detail */}
            {(() => {
              const proc = SERVICE_PROCESS[activeGroup]
              const meta = GROUP_META[activeGroup] || { icon: '📋', description: '' }
              if (!proc) return null
              return (
                <div className="svc-process-body">
                  {/* Hero banner */}
                  <div className="svc-process-banner">
                    <span className="svc-process-banner-icon">{meta.icon}</span>
                    <div>
                      <div className="svc-process-banner-title">{activeGroup}</div>
                      <div className="svc-process-banner-tagline">{proc.tagline}</div>
                    </div>
                    <div className="svc-process-banner-badges">
                      <span className="svc-badge">⏱ {proc.duration}</span>
                      <span className="svc-badge">🛡 {proc.warranty}</span>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="svc-steps">
                    {proc.steps.map((step, idx) => (
                      <div key={step.num} className="svc-step">
                        <div className="svc-step-left">
                          <div className="svc-step-num">{step.num}</div>
                          {idx < proc.steps.length - 1 && <div className="svc-step-connector" />}
                        </div>
                        <div className="svc-step-card">
                          <div className="svc-step-card-header">
                            <span className="svc-step-icon">{step.icon}</span>
                            <span className="svc-step-title">{step.title}</span>
                          </div>
                          <p className="svc-step-desc">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Services in this group */}
                  <div className="svc-process-services">
                    <div className="svc-process-services-label">Services in this category</div>
                    <div className="svc-process-services-list">
                      {SERVICE_CATALOG.filter((s) => s.group === activeGroup).map((s) => (
                        <div key={s.code} className="svc-process-service-chip">
                          <span className="svc-chip-dot" />
                          {serviceNameOverrides[s.code] || s.name}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ══ MATERIALS NOTES TAB ════════════════════════════════ */}
        {activeTab === 'materials' && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 10 }}>
              Add client-visible notes about products/materials used during installation.
            </div>

            {dbError && (
              <div className="form-error-banner full-width" style={{ marginBottom: 10 }}>
                {dbError}
              </div>
            )}

            {dbLoading ? (
              <div style={{ opacity: 0.75 }}>Loading services…</div>
            ) : (
              (() => {
                const selected = selectedMaterialsId
                  ? dbServicesSorted.find((s) => String(s.id) === String(selectedMaterialsId))
                  : null
                const selectedIdStr = selected ? String(selected.id) : null

                return (
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'stretch',
                    }}
                  >
                    {/* Left: service list (scrolls internally) */}
                    <div
                      style={{
                        width: 320,
                        minWidth: 260,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 12,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ padding: '10px 12px', fontSize: 12, opacity: 0.8 }}>
                        Select a service to edit
                      </div>
                      <div
                        className="svc-scroll-hidden"
                        style={{
                          maxHeight: '60vh',
                          overflowY: 'auto',
                          borderTop: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {dbServicesSorted.map((svc) => {
                          const idStr = String(svc.id)
                          const isActive = String(selectedMaterialsId) === idStr
                          return (
                            <button
                              key={svc.id}
                              type="button"
                              onClick={() => setSelectedMaterialsId(idStr)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '10px 12px',
                                border: 'none',
                                cursor: 'pointer',
                                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                                borderLeft: isActive ? '3px solid rgba(255,255,255,0.35)' : '3px solid transparent',
                                color: 'inherit',
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{serviceNameOverrides[svc.code] || svc.name}</div>
                              <div style={{ fontSize: 12, opacity: 0.75 }}>{svc.category}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Right: editor */}
                    <div
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 12,
                        padding: 12,
                        minWidth: 0,
                      }}
                    >
                      {!selected ? (
                        <div style={{ opacity: 0.75 }}>No service selected.</div>
                      ) : (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{serviceNameOverrides[selected.code] || selected.name}</div>
                              <div style={{ fontSize: 12, opacity: 0.75 }}>{selected.category}</div>
                            </div>
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={savingId === selectedIdStr}
                              onClick={() => saveMaterials(selected.id)}
                            >
                              {savingId === selectedIdStr ? 'Saving…' : 'Save'}
                            </button>
                          </div>

                          <textarea
                            value={materialsDraft[selectedIdStr] ?? ''}
                            onChange={(e) =>
                              setMaterialsDraft((p) => ({ ...p, [selectedIdStr]: e.target.value }))
                            }
                            rows={10}
                            style={{
                              width: '100%',
                              resize: 'vertical',
                              minHeight: 220,
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.10)',
                              borderRadius: 10,
                              color: '#e2e8f0',
                              padding: '10px 12px',
                              lineHeight: 1.4,
                            }}
                            placeholder="e.g., 3M film, IPA panel wipe, ceramic coating, microfiber towels…"
                          />
                        </>
                      )}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

