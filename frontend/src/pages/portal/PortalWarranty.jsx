import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'

export function PortalWarranty() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const rows = await portalGet('/warranty')
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

  const filtered = records.filter((r) => {
    if (filter === 'active') return r.warranty_status === 'Active'
    if (filter === 'expired') return r.warranty_status === 'Expired'
    return true
  })

  const activeCount = records.filter((r) => r.warranty_status === 'Active').length

  if (loading) {
    return <div className="portal-loading">Loading…</div>
  }

  return (
    <>
      <div className="portal-hero">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Warranty Tracker</h2>
            <p>Monitor your 1-year service warranties. Stay protected.</p>
          </div>
          {activeCount > 0 && (
            <div style={{
              background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.28)',
              borderRadius: 12, padding: '10px 18px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                {activeCount}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(52,211,153,0.70)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Active
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="portal-tabs" style={{ marginBottom: 20 }}>
        {['all', 'active', 'expired'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`portal-tab-btn portal-tab-btn--sm ${filter === f ? 'active' : ''}`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="portal-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <p>No warranty records found</p>
        </div>
      ) : (
        filtered.map((r) => {
          const isActive = r.warranty_status === 'Active'
          const daysRemaining = isActive ? Number(r.days_remaining) : 0
          const progressPct = Math.min(100, (daysRemaining / 365) * 100)

          return (
            <div key={r.id} className={`portal-warranty-card ${isActive ? 'active' : 'expired'}`}>
              {/* Top row: status pill + reference */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div className={`portal-warranty-pill ${isActive ? 'active' : 'expired'}`} style={{ margin: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {r.warranty_status}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.reference_no && (
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'rgba(200,200,200,0.50)', fontFamily: 'monospace' }}>
                      {r.reference_no}
                    </span>
                  )}
                  {r.workflow_status && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20,
                      background: 'rgba(200,200,200,0.08)', border: '1px solid rgba(200,200,200,0.18)',
                      color: 'rgba(200,200,200,0.65)',
                    }}>
                      {r.workflow_status}
                    </span>
                  )}
                </div>
              </div>

              <div className="portal-warranty-title">
                {r.service_description || 'Service Warranty'}
              </div>
              <div className="portal-warranty-meta">
                {r.plate_number} · {r.year} {r.make} {r.model}
                {r.odometer_reading ? ` · ${Number(r.odometer_reading).toLocaleString()} km` : ''}
              </div>

              <div className="portal-warranty-expiry" style={{ marginTop: 6 }}>
                Service: <strong style={{ color: 'rgba(189,200,218,0.75)' }}>{new Date(r.service_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</strong>
                &ensp;·&ensp;
                Expires: <strong>{new Date(r.warranty_expiry).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</strong>
                {isActive && daysRemaining > 0 && (
                  <span style={{ color: 'rgba(52,211,153,0.70)', marginLeft: 8, fontSize: 11 }}>
                    ({daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left)
                  </span>
                )}
              </div>

              {/* Amount */}
              {r.total_amount && (
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(200,200,200,0.80)', marginTop: 6 }}>
                  ₱{Number(r.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </div>
              )}

              {isActive && (
                <div className="portal-progress-bar">
                  <div className="portal-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              )}

              {/* View Details toggle */}
              <button
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className="portal-details-toggle"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: expandedId === r.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {expandedId === r.id ? 'Hide Details' : 'View Details'}
              </button>

              {/* Expanded panel */}
              {expandedId === r.id && (
                <div className="portal-details-panel">
                  {([
                    r.reference_no && ['Reference', r.reference_no],
                    ['Vehicle', `${r.plate_number} · ${r.year} ${r.make} ${r.model}`],
                    ['Service Date', new Date(r.service_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
                    ['Warranty Until', new Date(r.warranty_expiry).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
                    isActive && daysRemaining > 0 && ['Days Remaining', `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`],
                    r.total_amount && ['Amount', `₱${Number(r.total_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`],
                    r.workflow_status && ['Status', r.workflow_status],
                    r.odometer_reading && ['Odometer', `${Number(r.odometer_reading).toLocaleString()} km`],
                  ].filter(Boolean)).map(([label, value]) => (
                    <div key={label} className="portal-details-row">
                      <span className="portal-details-label">{label}</span>
                      <span className="portal-details-value">{value}</span>
                    </div>
                  ))}
                  {r.remarks && (
                    <div className="portal-details-remark">
                      📝 {r.remarks}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      <div className="portal-footnote">
        * Warranty coverage is 1 year from service date. Contact the shop to verify specific warranty terms.
      </div>
    </>
  )
}
