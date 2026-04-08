import React, { useEffect, useState } from 'react'
import { getPortalToken, portalGet } from '../../api/portalClient'
import { onPackagesUpdated } from '../../utils/events'

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
const API_BASE_URL = String(RAW_API_BASE || '').replace(/\/+$/, '')

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

function formatServices(services) {
  if (!Array.isArray(services) || services.length === 0) return 'No inclusions listed'
  const names = services
    .map((item) => {
      if (item && typeof item === 'object') return String(item.name || '').trim()
      return String(item || '').trim()
    })
    .filter(Boolean)
  return names.length ? names.join(', ') : 'No inclusions listed'
}

export function PortalPMS({ customer, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [tracking, setTracking] = useState([])
  const [packages, setPackages] = useState([])
  const [activeTab, setActiveTab] = useState('packages')
  const [loading, setLoading] = useState(true)
  const [packageLoading, setPackageLoading] = useState(true)
  const [packageError, setPackageError] = useState('')

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
          portalGet('/pms/subscriptions'),
          portalGet('/pms/tracking'),
        ])
        const packageRows = await fetchMainApi('/pms?status=active')
        if (stopped) return
        setStats(st)
        setSubscriptions(Array.isArray(subs) ? subs : [])
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
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Preventive Maintenance Service</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Keep your vehicles in top condition with scheduled maintenance</p>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
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
          onClick={() => setActiveTab('subscriptions')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'subscriptions' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'subscriptions' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'subscriptions' ? '600' : '400',
          }}
        >
          My Subscriptions ({subscriptions.length})
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {packages.map((pkg) => {
              const km = Number(pkg.kilometer_interval || pkg.mileage_interval || 0)
              const priceRaw = pkg.estimated_price ?? pkg.price
              const price = Number(priceRaw)
              const priceLabel = Number.isFinite(price)
                ? `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'

              return (
                <div key={pkg.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>{pkg.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', minHeight: 36 }}>{pkg.description || 'No description provided.'}</div>
                  <div style={{ display: 'grid', gap: 6, marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>KM Interval:</strong> {Number.isFinite(km) && km > 0 ? km.toLocaleString('en-US') : '—'}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Included Services:</strong> {formatServices(pkg.services)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#d0d8e8' }}>{priceLabel}</div>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ minHeight: 34, padding: '7px 14px', borderRadius: 8 }}
                      onClick={() => {
                        try {
                          localStorage.setItem('ma_portal_selected_package', JSON.stringify({
                            id: pkg.id,
                            type: 'pms',
                            name: pkg.name,
                            kilometer_interval: Number.isFinite(km) ? km : null,
                          }))
                        } catch {
                          // ignore localStorage failures
                        }
                        onNavigate?.('book')
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
                  <div key={t.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t.plate_number}</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{t.package_name}</div>
                      </div>
                      <div style={{ padding: '4px 8px', backgroundColor: statusColor[t.status], borderRadius: '12px', fontSize: '11px', fontWeight: '600', color: '#fff' }}>
                        {t.status}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                      Due: {new Date(t.due_date).toLocaleDateString()}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : activeTab === 'subscriptions' ? (
        <div>
          {subscriptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No PMS subscriptions</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {subscriptions.map(sub => (
                <div key={sub.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{sub.plate_number}</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px' }}>{sub.package_name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    <div>Total Services: {sub.total_services || 0}</div>
                    <div>Completed: {sub.completed_services || 0}</div>
                    <div>Due: {sub.due_services || 0}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ flex: 1, padding: '8px', background: 'var(--accent-primary)', color: 'var(--text-primary)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                      View Details
                    </button>
                  </div>
                </div>
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
                <div key={t.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t.plate_number}</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>{t.package_name}</div>
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
