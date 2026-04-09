import React, { useEffect, useState } from 'react'
import { getPortalToken, portalGet } from '../../api/portalClient'
import { onPackagesUpdated } from '../../utils/events'
import { PortalPackageAvailModal } from './PortalPackageAvailModal'
import './PortalPMS.css'

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
const API_BASE_URL = String(RAW_API_BASE || '').replace(/\/+$/, '')

const PMS_TIER_LABEL_BY_KM = {
  5000: 'Basic PMS',
  10000: 'Standard PMS',
  20000: 'Advanced PMS',
  40000: 'Major PMS',
  50000: 'Premium PMS',
}

async function fetchMainApi(path) {
  const token = getPortalToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    cache: 'no-store',
    headers,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const message = data.message || data.error || 'Request failed'
    throw new Error(message)
  }

  if (res.status === 204) return []
  return res.json().catch(() => ([]))
}

function getPmsTierLabel(kmValue) {
  const km = Number(kmValue)
  if (!Number.isFinite(km) || km <= 0) return 'Custom PMS'
  return PMS_TIER_LABEL_BY_KM[km] || 'Custom PMS'
}

function parseKmFromLabel(label) {
  const text = String(label || '')
  const m = text.match(/(\d[\d,]*)\s*(km|kilometer)/i)
  if (!m) return null
  const n = Number(String(m[1]).replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function toPmsDisplayName(rawName, kmValue) {
  const name = String(rawName || '').trim()
  const kmExplicit = Number(kmValue)
  const km = Number.isFinite(kmExplicit) && kmExplicit > 0 ? kmExplicit : parseKmFromLabel(name)
  if (!Number.isFinite(km) || km <= 0) return name || 'PMS Package'

  const legacyNamePattern = /(kilometer\s*pms|km\s*pms)$/i
  if (!name || legacyNamePattern.test(name)) {
    return `${getPmsTierLabel(km)} - ${km.toLocaleString('en-US')} KM`
  }
  return name
}

export function PortalPMS({ customer, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [tracking, setTracking] = useState([])
  const [packages, setPackages] = useState([])
  const [activeTab, setActiveTab] = useState('packages')
  const [loading, setLoading] = useState(true)
  const [packageLoading, setPackageLoading] = useState(true)
  const [packageError, setPackageError] = useState('')
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [showAvailModal, setShowAvailModal] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [expandedServicesByPackage, setExpandedServicesByPackage] = useState({})

  useEffect(() => {
    let stopped = false

    const load = async (initial = false) => {
      try {
        if (initial) {
          setLoading(true)
          setPackageLoading(true)
          setPackageError('')
        }
        const [st, subs, trk] = await Promise.all([
          portalGet('/pms/stats'),
          Promise.resolve([]),
          portalGet('/pms/tracking'),
        ])
        const packageRows = await fetchMainApi('/pms?status=active')
        if (stopped) return
        setStats(st)
        setTracking(Array.isArray(trk) ? trk : [])
        setPackages(Array.isArray(packageRows) ? packageRows : [])
        setPackageError('')
      } catch (err) {
        console.error('Failed to load PMS data:', err)
        if (!stopped) setPackageError(err.message || 'Failed to load packages')
      } finally {
        if (!stopped) {
          if (initial) setLoading(false)
          setPackageLoading(false)
        }
      }
    }

    load(true)

    const intervalMs = 15000
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(false)
    }, intervalMs)

    const unsubPackages = onPackagesUpdated(() => {
      load(false)
    })

    const onFocus = () => load(false)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearInterval(id)
      unsubPackages()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const statusColor = {
    Due: '#f59e0b',
    'In Progress': '#3b82f6',
    Completed: '#10b981',
  }

  return (
    <div className="portal-pms-page" style={{ padding: '20px' }}>
      <div className="portal-pms-header" style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Preventive Maintenance Service</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Keep your vehicles in top condition with scheduled maintenance</p>
      </div>

      {requestMessage && (
        <div className="portal-pms-request-msg" style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.10)', color: '#8ee5b8', fontSize: 13 }}>
          {requestMessage}
        </div>
      )}

      {stats && (
        <div className="portal-pms-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Due Services</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.due_count || 0}</div>
          </div>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>In Progress</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>{stats.in_progress_count || 0}</div>
          </div>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Completed</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{stats.completed_count || 0}</div>
          </div>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Due This Week</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>{stats.due_this_week || 0}</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-secondary)' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'overview' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'overview' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'overview' ? '600' : '400',
          }}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('tracking')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'tracking' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'tracking' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'tracking' ? '600' : '400',
          }}
        >
          Service Tracking ({tracking.length})
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'packages' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'packages' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'packages' ? '600' : '400',
          }}
        >
          Packages ({packages.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading PMS data...</div>
      ) : activeTab === 'packages' ? (
        packageLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading packages...</div>
        ) : packageError ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>{packageError}</div>
        ) : packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No available packages yet</div>
        ) : (
          <div className="portal-pms-packages-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {packages.map((pkg) => {
              const km = Number(pkg.kilometer_interval || pkg.mileage_interval || 0)
              const displayName = toPmsDisplayName(pkg.name, km)
              const priceRaw = pkg.estimated_price ?? pkg.price
              const price = Number(priceRaw)
              const priceLabel = Number.isFinite(price)
                ? `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'
              const serviceNames = Array.isArray(pkg.services)
                ? pkg.services
                    .map((s) => (s && typeof s === 'object' ? String(s.name || '').trim() : String(s || '').trim()))
                    .filter(Boolean)
                : []
              const previewServices = serviceNames.slice(0, 3)
              const hiddenServices = serviceNames.slice(3)
              const hiddenServicesCount = Math.max(serviceNames.length - previewServices.length, 0)
              const isServicesExpanded = Boolean(expandedServicesByPackage[pkg.id])

              return (
                <div
                  key={pkg.id}
                  style={{
                    padding: '16px',
                    border: '1px solid var(--border-secondary)',
                    borderRadius: '12px',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                    display: 'grid',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1.25 }}>{displayName}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.14)', borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      {Number.isFinite(km) && km > 0 ? `${km.toLocaleString('en-US')} KM` : 'Custom'}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', minHeight: 36, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {pkg.description || 'No description provided.'}
                  </div>

                  <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, background: 'rgba(0,0,0,0.2)', padding: '10px 11px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                      Included Services {serviceNames.length > 0 ? `(${serviceNames.length})` : ''}
                    </div>
                    {previewServices.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-secondary)', display: 'grid', gap: 6 }}>
                        {previewServices.map((name) => (
                          <li key={name} style={{ fontSize: 12.5, lineHeight: 1.35 }}>{name}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>No inclusions listed.</div>
                    )}
                    {hiddenServicesCount > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpandedServicesByPackage((prev) => ({ ...prev, [pkg.id]: !prev[pkg.id] }))}
                          style={{
                            marginTop: 8,
                            background: isServicesExpanded ? 'rgba(59,130,246,0.16)' : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${isServicesExpanded ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.14)'}`,
                            color: isServicesExpanded ? '#93c5fd' : '#c0c8d8',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '5px 10px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isServicesExpanded ? 'Hide extra services' : `View +${hiddenServicesCount} more services`}
                        </button>

                        {isServicesExpanded && (
                          <ul
                            className="portal-pms-hidden-scroll"
                            style={{
                              margin: '9px 0 0',
                              padding: '8px 0 0 16px',
                              color: 'var(--text-secondary)',
                              display: 'grid',
                              gap: 6,
                              borderTop: '1px dashed rgba(255,255,255,0.14)',
                              maxHeight: 172,
                              overflowY: 'auto',
                            }}
                          >
                            {hiddenServices.map((name, idx) => (
                              <li key={`${pkg.id}-extra-${idx}`} style={{ fontSize: 12.5, lineHeight: 1.35, paddingRight: 4 }}>{name}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#d0d8e8' }}>{priceLabel}</div>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ minHeight: 36, padding: '7px 14px', borderRadius: 9 }}
                      onClick={() => {
                        setRequestMessage('')
                        setSelectedPackage({
                          id: pkg.id,
                          name: displayName,
                          description: pkg.description,
                        })
                        setShowAvailModal(true)
                      }}
                    >
                      Book PMS
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : activeTab === 'overview' ? (
        <div>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>Upcoming Maintenance</h3>
          {tracking.filter(t => t.status === 'Due').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No upcoming maintenance</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {tracking
                .filter(t => t.status === 'Due')
                .slice(0, 5)
                .map(t => (
                  (() => {
                    const displayName = toPmsDisplayName(
                      t.package_name,
                      t.kilometer_interval || t.package_kilometer_interval || t.interval_value,
                    )
                    return (
                  <div key={t.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t.plate_number}</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{displayName}</div>
                      </div>
                      <div style={{ padding: '4px 8px', backgroundColor: statusColor[t.status], borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                        {t.status}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      Due: {new Date(t.due_date).toLocaleDateString()}
                    </div>
                  </div>
                    )
                  })()
                ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {tracking.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No service tracking records</div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {tracking.map(t => (
                (() => {
                  const displayName = toPmsDisplayName(
                    t.package_name,
                    t.kilometer_interval || t.package_kilometer_interval || t.interval_value,
                  )
                  return (
                <div key={t.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t.plate_number}</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{displayName}</div>
                    </div>
                    <div style={{ padding: '4px 8px', backgroundColor: statusColor[t.status], borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                      {t.status}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div>Due: {new Date(t.due_date).toLocaleDateString()}</div>
                    {t.completed_date && <div>Completed: {new Date(t.completed_date).toLocaleDateString()}</div>}
                    {t.notes && <div style={{ marginTop: '6px', fontStyle: 'italic' }}>Notes: {t.notes}</div>}
                  </div>
                </div>
                  )
                })()
              ))}
            </div>
          )}
        </div>
      )}

      <PortalPackageAvailModal
        open={showAvailModal}
        onClose={() => setShowAvailModal(false)}
        packageItem={selectedPackage}
        packageType="PMS"
        onSubmitted={() => {
          setRequestMessage('PMS request submitted successfully. Our team will review and confirm your schedule soon.')
        }}
      />
    </div>
  )
}
