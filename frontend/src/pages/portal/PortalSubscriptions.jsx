import React, { useEffect, useMemo, useState } from 'react'
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

export function PortalSubscriptions({ customer, onNavigate }) {
  const [subscriptions, setSubscriptions] = useState([])
  const [packages, setPackages] = useState([])
  const [stats, setStats] = useState(null)
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
        const [subs, st] = await Promise.all([
          portalGet('/subscriptions'),
          portalGet('/subscriptions/stats'),
        ])
        const packageRows = await fetchMainApi('/subscriptions?status=active')
        if (stopped) return
        setSubscriptions(Array.isArray(subs) ? subs : [])
        setStats(st)
        setPackages(Array.isArray(packageRows) ? packageRows : [])
        setPackageError('')
      } catch (err) {
        console.error('Failed to load subscriptions:', err)
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

  const filteredSubs = subscriptions.filter((s) => {
    if (activeTab === 'active') return s.status === 'Active'
    if (activeTab === 'expiring') return s.status === 'Expiring Soon'
    if (activeTab === 'expired') return s.status === 'Expired'
    if (activeTab === 'cancelled') return s.status === 'Cancelled'
    return true
  })

  const statusColor = {
    Active: '#10b981',
    'Expiring Soon': '#f59e0b',
    Expired: '#ef4444',
    Cancelled: '#ef4444',
  }

  const asNumber = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }

  const packageCards = useMemo(() => {
    return packages.map((pkg) => ({
      ...pkg,
      priceLabel: `₱${asNumber(pkg.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      servicesLabel: formatServices(pkg.services),
    }))
  }, [packages])

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>My Subscriptions</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Manage your active subscriptions and service packages</p>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Active</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{stats.active || 0}</div>
          </div>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Expiring Soon</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.expiring_soon || 0}</div>
          </div>
          <div style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Monthly Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3b82f6' }}>₱{asNumber(stats.total_revenue).toFixed(2)}</div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-secondary)' }}>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'active' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'active' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'active' ? '600' : '400',
          }}
        >
          Active ({subscriptions.filter(s => s.status === 'Active').length})
        </button>
        <button
          onClick={() => setActiveTab('expiring')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'expiring' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'expiring' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'expiring' ? '600' : '400',
          }}
        >
          Expiring ({subscriptions.filter(s => s.status === 'Expiring Soon').length})
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'expired' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'expired' ? '2px solid var(--text-primary)' : 'none',
            padding: '12px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === 'expired' ? '600' : '400',
          }}
        >
          Expired ({subscriptions.filter(s => s.status === 'Expired').length})
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

      {activeTab === 'packages' ? (
        packageLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading packages...</div>
        ) : packageError ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>{packageError}</div>
        ) : packageCards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No available packages yet</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {packageCards.map((pkg) => (
              <div key={pkg.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>{pkg.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', minHeight: 36 }}>{pkg.description || 'No description provided.'}</div>
                <div style={{ display: 'grid', gap: 6, marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Duration:</strong> {pkg.duration || '—'}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Included Services:</strong> {pkg.servicesLabel}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#d0d8e8' }}>{pkg.priceLabel}</div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ minHeight: 34, padding: '7px 14px', borderRadius: 8 }}
                    onClick={() => {
                      try {
                        localStorage.setItem('ma_portal_selected_package', JSON.stringify({
                          id: pkg.id,
                          type: 'subscription',
                          name: pkg.name,
                          duration: pkg.duration || null,
                        }))
                      } catch {
                        // ignore localStorage failures
                      }
                      onNavigate?.('book')
                    }}
                  >
                    Subscribe
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading subscriptions...</div>
      ) : filteredSubs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No subscriptions in this category</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredSubs.map(sub => (
            <div key={sub.id} style={{ padding: '16px', border: '1px solid var(--border-secondary)', borderRadius: '8px', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sub.package_name}</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{sub.plate_number}</div>
                </div>
                <div style={{ padding: '4px 8px', backgroundColor: statusColor[sub.status], borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: '#fff' }}>
                  {sub.status}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <div>Start: {new Date(sub.start_date).toLocaleDateString()}</div>
                <div>End: {new Date(sub.end_date).toLocaleDateString()}</div>
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                ₱{asNumber(sub.package_price).toFixed(2)}/month
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
