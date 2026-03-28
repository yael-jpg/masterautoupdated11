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

export function PortalServiceHistory() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

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

  const filtered = vehicleFilter
    ? records.filter((r) => String(r.vehicle_id) === vehicleFilter)
    : records

  if (loading) {
    return <div style={{ color: 'rgba(189,200,218,0.45)', padding: 48, textAlign: 'center', fontSize: 13 }}>Loading…</div>
  }

  return (
    <>
      <div className="portal-hero">
        <h2>Service History</h2>
        <p>Complete record of all services performed on your vehicles.</p>
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

      {filtered.length === 0 ? (
        <div className="portal-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
          </svg>
          <p>No service records found</p>
        </div>
      ) : (
        <div className="portal-timeline">
          {filtered.map((r) => (
            <div key={r.id} className="portal-timeline-item">
              <div className="portal-timeline-dot" />
              <div className="portal-timeline-card" style={{ cursor: 'default' }}>
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

                {/* View Details toggle */}
                <button
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  style={{
                    marginTop: 12, background: 'none', border: 'none', padding: 0,
                    color: 'rgba(200,200,200,0.55)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
                    alignItems: 'center', gap: 5, letterSpacing: '0.03em',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(200,200,200,0.90)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(200,200,200,0.55)')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: expandedId === r.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {expandedId === r.id ? 'Hide Details' : 'View Details'}
                </button>

                {/* Expanded panel */}
                {expandedId === r.id && (
                  <div style={{
                    marginTop: 14, paddingTop: 14,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Detail rows */}
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

                    {/* Line items */}
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
                    {r.damage_notes && (
                      <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.65)', paddingTop: 2 }}>
                        ⚠ {r.damage_notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
