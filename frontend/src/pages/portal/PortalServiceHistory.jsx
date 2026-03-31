import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'
import {
  CoatingProcess,
  DetailingProcess,
  GenericServiceProcess,
  PPFProcess,
  isCoating,
  isDetailing,
  isPPF,
} from '../../components/ServiceProcess'

const PHOTO_TYPES = ['before', 'after', 'damage', 'general']
const TYPE_LABEL = { before: 'Before', after: 'After', damage: 'Damage', general: 'General' }

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
const API_BASE = String(RAW_API_BASE || '').replace(/\/+$/, '')
const SERVER_BASE = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE

function resolvePhotoUrl(fileUrl) {
  const u = String(fileUrl || '')
  if (!u) return ''
  if (/^(https?:)?\/\//i.test(u) || /^data:|^blob:/i.test(u)) return u
  if (u.startsWith('/')) return `${SERVER_BASE}${u}`
  return `${SERVER_BASE}/${u}`
}

function LightboxModal({ photo, onClose }) {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div onClick={onClose} className="portal-lightbox-overlay">
      <div onClick={(e) => e.stopPropagation()} className="portal-lightbox-panel">
        <img
          src={resolvePhotoUrl(photo.file_url)}
          alt={photo.tag || photo.photo_type}
          className="portal-lightbox-image"
        />
        <div className="portal-lightbox-meta">
          <span className="portal-lightbox-pill">
            {TYPE_LABEL[photo.photo_type] || photo.photo_type}
          </span>
          {photo.tag && <span className="portal-lightbox-tag">{photo.tag}</span>}
          {photo.created_at && (
            <span className="portal-lightbox-date">
              {new Date(photo.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
        <button onClick={onClose} className="portal-lightbox-close">×</button>
      </div>
    </div>
  )
}

export function PortalServiceHistory() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [vehicleFilter, setVehicleFilter] = useState('')

  const [expandedRecordId, setExpandedRecordId] = useState(null)

  const [mainTab, setMainTab] = useState('service')
  const [photoTab, setPhotoTab] = useState('all')
  const [lightbox, setLightbox] = useState(null)
  const [vehicleDetailCache, setVehicleDetailCache] = useState({})

  const ensureVehicleDetail = async (vehicleId) => {
    if (!vehicleId) return

    let shouldFetch = false
    setVehicleDetailCache((prev) => {
      const existing = prev[vehicleId]
      if (existing?.loading || existing?.data) return prev
      shouldFetch = true
      return {
        ...prev,
        [vehicleId]: { loading: true, data: null, error: null },
      }
    })

    if (!shouldFetch) return

    try {
      const detail = await portalGet(`/vehicles/${vehicleId}/detail`)
      setVehicleDetailCache((prev) => ({
        ...prev,
        [vehicleId]: { loading: false, data: detail, error: null },
      }))
    } catch (err) {
      setVehicleDetailCache((prev) => ({
        ...prev,
        [vehicleId]: { loading: false, data: null, error: err?.message || 'Failed to load details' },
      }))
    }
  }

  useEffect(() => {
    setPhotoTab('all')
    setLightbox(null)
    setExpandedRecordId(null)
  }, [mainTab, vehicleFilter])

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const rows = await portalGet('/service-history')
        if (stopped) return
        setRecords(Array.isArray(rows) ? rows : [])
      } catch (_) {
        // Silent
      } finally {
        if (!stopped && isInitial) setLoading(false)
      }
    }

    load(true)

    const intervalMs = 15000
    const id = setInterval(() => load(false), intervalMs)

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  // Unique vehicles for filter
  const vehicles = [...new Map(records.map((r) => [r.vehicle_id, r])).values()]

  const selectedVehicleId = vehicleFilter || (vehicles.length === 1 ? String(vehicles[0]?.vehicle_id || '') : '')

  const filtered = vehicleFilter
    ? records.filter((r) => String(r.vehicle_id) === vehicleFilter)
    : records

  useEffect(() => {
    if (mainTab !== 'photos' && mainTab !== 'damages') return
    if (!selectedVehicleId) return
    ensureVehicleDetail(selectedVehicleId)
  }, [mainTab, selectedVehicleId])

  if (loading) {
    return <div style={{ color: 'rgba(189,200,218,0.45)', padding: 48, textAlign: 'center', fontSize: 13 }}>Loading…</div>
  }

  return (
    <>
      <div className="portal-hero">
        <h2>Service History</h2>
        <p>Complete record of all services performed on your vehicles.</p>
      </div>

      <div className="portal-vd-tabs" style={{ marginBottom: 14 }}>
        {[
          { key: 'service', label: 'Service Records' },
          { key: 'photos', label: 'Photos' },
          { key: 'damages', label: 'Damages' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMainTab(t.key)}
            className={`portal-vd-tab${mainTab === t.key ? ' portal-vd-tab--active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vehicle filter */}
      {vehicles.length > 1 && (
        <div className="portal-filter-row">
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="portal-control"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.vehicle_id} value={v.vehicle_id}>
                {v.plate_number} — {v.year} {v.make} {v.model}
              </option>
            ))}
          </select>
        </div>
      )}

      {mainTab === 'service' && (
        filtered.length === 0 ? (
          <div className="portal-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
            </svg>
            <p>No service records found</p>
          </div>
        ) : (
          <div className="portal-timeline">
            {filtered.map((r) => (
              <div key={r.id} className="portal-timeline-item">
                <div className="portal-timeline-dot" />
                <div
                  className="portal-timeline-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedRecordId((prev) => (prev === r.id ? null : r.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setExpandedRecordId((prev) => (prev === r.id ? null : r.id))
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                    <div className="portal-timeline-date">
                      {new Date(r.service_date).toLocaleDateString('en-PH', {
                        weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </div>
                    {r.reference_no && (
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(200,200,200,0.55)', fontFamily: 'monospace' }}>
                        {r.reference_no}
                      </span>
                    )}
                  </div>

                  <div className="portal-timeline-title">{r.service_description || 'Service Record'}</div>
                  <div className="portal-timeline-meta" style={{ marginTop: 4 }}>
                    {r.plate_number} · {r.year} {r.make} {r.model}
                    {r.odometer_reading ? ` · ${Number(r.odometer_reading).toLocaleString()} km` : ''}
                  </div>

                  {/* Status + amount row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    {r.workflow_status && (
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', padding: '3px 10px', borderRadius: 20,
                        background: 'rgba(200,200,200,0.08)',
                        border: '1px solid rgba(200,200,200,0.20)',
                        color: 'rgba(200,200,200,0.75)',
                      }}>
                        {r.workflow_status}
                      </span>
                    )}
                    {r.doc_type && (
                      <span style={{ fontSize: 11, color: 'rgba(189,200,218,0.40)' }}>{r.doc_type}</span>
                    )}
                    {r.total_amount && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(200,200,200,0.80)', marginLeft: 'auto' }}>
                        ₱{Number(r.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  {/* Expanded details (click card) */}
                  {expandedRecordId === r.id && (
                    <div style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      cursor: 'default',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    >
                      {([
                        r.assigned_staff_name && ['Technician', r.assigned_staff_name],
                        r.odometer_reading && ['Odometer', `${Number(r.odometer_reading).toLocaleString()} km`],
                        r.doc_type && ['Document Type', r.doc_type],
                        r.total_amount && ['Total Amount', `₱${Number(r.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`],
                      ].filter(Boolean)).map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                          <span style={{ color: 'rgba(189,200,218,0.45)', minWidth: 120, flexShrink: 0 }}>{label}</span>
                          <span style={{ color: '#e2e8f2', fontWeight: 500 }}>{value}</span>
                        </div>
                      ))}

                      {(() => {
                        const configuredProcess = r.coating_process || r.process
                        const primaryServiceName =
                          (Array.isArray(r.items) && r.items[0]?.name) ||
                          r.service_description ||
                          ''

                        const showTimeline = !configuredProcess
                        const isPpf = isPPF(primaryServiceName)
                        const isCoat = isCoating(primaryServiceName)
                        const isDet = isDetailing(primaryServiceName)

                        if (!configuredProcess && !showTimeline) return null

                        return (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(200,200,200,0.45)', marginBottom: 8 }}>
                              Process
                            </div>

                            {configuredProcess && (
                              <div style={{
                                padding: '10px 12px',
                                background: 'rgba(255,255,255,0.025)',
                                borderRadius: 8,
                                color: 'rgba(226,232,242,0.88)',
                                fontSize: 13,
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                              }}>
                                {configuredProcess}
                              </div>
                            )}

                            {!configuredProcess && (
                              <div style={{ marginTop: 2 }}>
                                {isPpf ? (
                                  <PPFProcess />
                                ) : isCoat ? (
                                  <CoatingProcess />
                                ) : isDet ? (
                                  <DetailingProcess />
                                ) : (
                                  <GenericServiceProcess serviceName={primaryServiceName} />
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {Array.isArray(r.items) && r.items.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(200,200,200,0.45)', marginBottom: 8 }}>
                            Services / Items
                          </div>
                          {r.items.map((item, i) => (
                            <div key={i} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '8px 12px', background: 'rgba(255,255,255,0.025)',
                              borderRadius: 8, marginBottom: 5, gap: 12,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: 'rgba(226,232,242,0.85)' }}>{item.name}</div>
                              </div>
                              {item.qty && item.qty > 1 && (
                                <span style={{ fontSize: 11, color: 'rgba(189,200,218,0.45)', flexShrink: 0 }}>×{item.qty}</span>
                              )}
                              {item.price && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(200,200,200,0.70)', flexShrink: 0, fontFamily: 'monospace' }}>
                                  ₱{Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {r.materials_notes && String(r.materials_notes).trim() && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(200,200,200,0.45)', marginBottom: 8 }}>
                            Materials Notes
                          </div>
                          <div style={{
                            padding: '10px 12px',
                            background: 'rgba(255,255,255,0.025)',
                            borderRadius: 8,
                            color: 'rgba(226,232,242,0.82)',
                            fontSize: 13,
                            lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                          }}>
                            {String(r.materials_notes).trim()}
                          </div>
                        </div>
                      )}

                      {r.remarks && (
                        <div style={{ fontSize: 12, color: 'rgba(189,200,218,0.55)', fontStyle: 'italic', paddingTop: 4 }}>
                          📝 {r.remarks}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {mainTab === 'photos' && (
        !selectedVehicleId ? (
          <div className="portal-empty">
            <p>Select a vehicle to view photos.</p>
          </div>
        ) : (() => {
          const vd = vehicleDetailCache[selectedVehicleId]
          const details = vd?.data
          const photos = Array.isArray(details?.photos) ? details.photos : []
          const availablePhotoTabs = ['all', ...PHOTO_TYPES.filter((t) => photos.some((p) => p.photo_type === t))]
          const filteredPhotos = photoTab === 'all' ? photos : photos.filter((p) => p.photo_type === photoTab)

          return (
            <div style={{
              marginTop: 12,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div className="portal-vd-section-title" style={{ marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Photos
                <span className="portal-vd-count">{vd?.loading ? '…' : photos.length}</span>
              </div>

              {vd?.loading ? (
                <p className="portal-vd-empty">Loading photos…</p>
              ) : vd?.error ? (
                <p className="portal-vd-empty">Could not load photos.</p>
              ) : photos.length === 0 ? (
                <p className="portal-vd-empty">No photos uploaded yet.</p>
              ) : (
                <>
                  <div className="portal-vd-tabs">
                    {availablePhotoTabs.map((t) => (
                      <button
                        key={t}
                        onClick={() => setPhotoTab(t)}
                        className={`portal-vd-tab${photoTab === t ? ' portal-vd-tab--active' : ''}`}
                        type="button"
                      >
                        {t === 'all'
                          ? `All (${photos.length})`
                          : `${TYPE_LABEL[t]} (${photos.filter((p) => p.photo_type === t).length})`}
                      </button>
                    ))}
                  </div>

                  <div className="portal-photo-grid">
                    {filteredPhotos.map((photo) => {
                      const badgeType = PHOTO_TYPES.includes(photo.photo_type) ? photo.photo_type : 'general'
                      return (
                        <div
                          key={photo.id}
                          className="portal-photo-thumb"
                          onClick={() => setLightbox(photo)}
                        >
                          <img
                            src={resolvePhotoUrl(photo.file_url)}
                            alt={photo.tag || photo.photo_type}
                            loading="lazy"
                          />
                          <span className={`portal-photo-type-badge portal-photo-type-badge--${badgeType}`}>
                            {TYPE_LABEL[photo.photo_type] || photo.photo_type}
                          </span>
                          {photo.tag && <div className="portal-photo-tag">{photo.tag}</div>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })()
      )}

      {mainTab === 'damages' && (
        !selectedVehicleId ? (
          <div className="portal-empty">
            <p>Select a vehicle to view damages.</p>
          </div>
        ) : (() => {
          const vd = vehicleDetailCache[selectedVehicleId]
          const details = vd?.data
          const serviceRecords = Array.isArray(details?.serviceRecords) ? details.serviceRecords : []
          const damageOnly = serviceRecords.filter((sr) => sr.damage_notes)

          return (
            <div style={{
              marginTop: 12,
              paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div className="portal-vd-section-title" style={{ marginBottom: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Damages
                <span className="portal-vd-count">{vd?.loading ? '…' : damageOnly.length}</span>
                {!vd?.loading && damageOnly.length > 0 && (
                  <span className="portal-vd-damage-pill">{damageOnly.length} damage</span>
                )}
              </div>

              {vd?.loading ? (
                <p className="portal-vd-empty">Loading damages…</p>
              ) : vd?.error ? (
                <p className="portal-vd-empty">Could not load damages.</p>
              ) : damageOnly.length === 0 ? (
                <p className="portal-vd-empty">No damage records found.</p>
              ) : (
                <div className="portal-vd-records-list">
                  {damageOnly.map((sr) => (
                    <div key={sr.id} className="portal-damage-record">
                      <div className="portal-damage-header">
                        <span className="portal-damage-date">
                          {new Date(sr.service_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {sr.assigned_staff_name && (
                          <span className="portal-damage-staff">By {sr.assigned_staff_name}</span>
                        )}
                        {sr.odometer_reading != null && (
                          <span className="portal-damage-odo">{Number(sr.odometer_reading).toLocaleString()} km</span>
                        )}
                      </div>
                      {sr.service_description && (
                        <div className="portal-damage-service">{sr.service_description}</div>
                      )}
                      {sr.damage_notes && (
                        <div className="portal-damage-notes">
                          <span className="portal-damage-notes-label">⚠ Damage noted:</span>
                          {sr.damage_notes}
                        </div>
                      )}
                      {sr.remarks && (
                        <div className="portal-damage-remarks">Remarks: {sr.remarks}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()
      )}

      {lightbox && <LightboxModal photo={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}
