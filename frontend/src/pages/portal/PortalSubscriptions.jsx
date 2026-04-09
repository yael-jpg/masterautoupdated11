import React, { useEffect, useMemo, useState } from 'react'
import { getPortalToken, portalGet, portalPut } from '../../api/portalClient'
import { onPackagesUpdated } from '../../utils/events'
import { PortalPackageAvailModal } from './PortalPackageAvailModal'
import './PortalSubscriptions.css'

const RAW_API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
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
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [showAvailModal, setShowAvailModal] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [selectedFrequencyByPackage, setSelectedFrequencyByPackage] = useState({})
  const [selectedSubscription, setSelectedSubscription] = useState(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [busyCancelId, setBusyCancelId] = useState(null)

  const getDisplayStatus = (sub) => {
    const raw = String(sub?.status || '').trim()
    if (raw === 'Cancelled' || raw === 'Expired') return raw
    const endMs = new Date(sub?.end_date || 0).getTime()
    if (Number.isFinite(endMs) && endMs < Date.now()) return 'Expired'
    return raw || 'Active'
  }

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

  const subscriptionsWithDisplayStatus = useMemo(
    () => subscriptions.map((sub) => ({ ...sub, displayStatus: getDisplayStatus(sub) })),
    [subscriptions],
  )

  const statusCounts = useMemo(
    () => subscriptionsWithDisplayStatus.reduce((acc, sub) => {
      const key = sub.displayStatus
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, { Active: 0, 'Expiring Soon': 0, Expired: 0, Cancelled: 0 }),
    [subscriptionsWithDisplayStatus],
  )

  const filteredSubs = subscriptionsWithDisplayStatus.filter((s) => {
    if (activeTab === 'active') return s.displayStatus === 'Active'
    if (activeTab === 'expiring') return s.displayStatus === 'Expiring Soon'
    if (activeTab === 'expired') return s.displayStatus === 'Expired'
    if (activeTab === 'cancelled') return s.displayStatus === 'Cancelled'
    return true
  })

  const statusClass = {
    Active: 'is-active',
    'Expiring Soon': 'is-expiring',
    Expired: 'is-expired',
    Cancelled: 'is-cancelled',
  }

  const asNumber = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }

  const packageCards = useMemo(() => {
    const fmt = (v) => `₱${asNumber(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return packages.map((pkg) => ({
      ...pkg,
      frequencyPrices: {
        weekly: asNumber(pkg?.price_by_frequency?.weekly),
        monthly: asNumber(pkg?.price_by_frequency?.monthly ?? pkg?.price),
        annual: asNumber(pkg?.price_by_frequency?.annual),
      },
      priceLabel: fmt(pkg?.price_by_frequency?.monthly ?? pkg?.price),
      servicesLabel: formatServices(pkg.services),
    }))
  }, [packages])

  const getSelectedFrequency = (pkg) => selectedFrequencyByPackage[pkg.id] || 'monthly'

  const openSubscriptionModal = async (subId) => {
    setShowSubscriptionModal(true)
    setDetailsLoading(true)
    setDetailsError('')
    setSelectedSubscription(null)
    try {
      const data = await portalGet(`/subscriptions/${subId}`)
      setSelectedSubscription(data || null)
    } catch (err) {
      setDetailsError(err?.message || 'Failed to load subscription details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleCancelSubscription = async (sub) => {
    const subName = sub?.package_name || 'this subscription'
    const ok = window.confirm(`Cancel ${subName}? This action cannot be undone.`)
    if (!ok) return

    try {
      setBusyCancelId(sub.id)
      await portalPut(`/subscriptions/${sub.id}/cancel`, {})
      setSubscriptions((prev) => prev.map((item) => (item.id === sub.id ? { ...item, status: 'Cancelled' } : item)))
      setStats((prev) => {
        if (!prev) return prev
        const active = Math.max(0, Number(prev.active || 0) - (sub.status === 'Active' ? 1 : 0))
        const expiring = Math.max(0, Number(prev.expiring_soon || 0) - (sub.status === 'Expiring Soon' ? 1 : 0))
        const cancelled = Number(prev.cancelled || 0) + 1
        return { ...prev, active, expiring_soon: expiring, cancelled }
      })

      if (selectedSubscription?.id === sub.id) {
        setSelectedSubscription((prev) => (prev ? { ...prev, status: 'Cancelled' } : prev))
      }

      setRequestMessage('Subscription cancelled successfully.')
    } catch (err) {
      setRequestMessage(err?.message || 'Failed to cancel subscription.')
    } finally {
      setBusyCancelId(null)
    }
  }

  const subscriptionProgress = useMemo(() => {
    const startMs = new Date(selectedSubscription?.start_date || 0).getTime()
    const endMs = new Date(selectedSubscription?.end_date || 0).getTime()
    const now = Date.now()

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return { percent: 0, label: 'Duration unavailable' }
    }

    const elapsed = Math.min(Math.max(now - startMs, 0), endMs - startMs)
    const percent = Math.round((elapsed / (endMs - startMs)) * 100)
    return { percent, label: `${percent}% consumed` }
  }, [selectedSubscription])

  return (
    <div className="portal-subs-page">
      <div className="portal-subs-header">
        <h2 className="portal-subs-title">My Subscriptions</h2>
        <p className="portal-subs-subtitle">Manage your active subscriptions and service packages</p>
      </div>

      {requestMessage && (
        <div className="portal-subs-request-msg">
          {requestMessage}
        </div>
      )}

      {stats && (
        <div className="portal-subs-stats-grid">
          <div className="portal-subs-stat-card">
            <div className="portal-subs-stat-label">Active</div>
            <div className="portal-subs-stat-value is-active">{stats.active || 0}</div>
          </div>
          <div className="portal-subs-stat-card">
            <div className="portal-subs-stat-label">Expiring Soon</div>
            <div className="portal-subs-stat-value is-expiring">{statusCounts['Expiring Soon'] || 0}</div>
          </div>
          <div className="portal-subs-stat-card">
            <div className="portal-subs-stat-label">Expired</div>
            <div className="portal-subs-stat-value is-expired">{statusCounts.Expired || 0}</div>
          </div>
        </div>
      )}

      <div className="portal-subs-tabs">
        <button
          onClick={() => setActiveTab('active')}
          className={`portal-subs-tab-btn ${activeTab === 'active' ? 'is-active' : ''}`}
        >
          Active ({statusCounts.Active || 0})
        </button>
        <button
          onClick={() => setActiveTab('expiring')}
          className={`portal-subs-tab-btn ${activeTab === 'expiring' ? 'is-active' : ''}`}
        >
          Expiring ({statusCounts['Expiring Soon'] || 0})
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`portal-subs-tab-btn ${activeTab === 'expired' ? 'is-active' : ''}`}
        >
          Expired ({statusCounts.Expired || 0})
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`portal-subs-tab-btn ${activeTab === 'packages' ? 'is-active' : ''}`}
        >
          Packages ({packages.length})
        </button>
      </div>

      {activeTab === 'packages' ? (
        packageLoading ? (
          <div className="portal-subs-center-msg">Loading packages...</div>
        ) : packageError ? (
          <div className="portal-subs-center-msg is-error">{packageError}</div>
        ) : packageCards.length === 0 ? (
          <div className="portal-subs-center-msg">No available packages yet</div>
        ) : (
          <div className="portal-subs-packages-grid">
            {packageCards.map((pkg) => {
              const selectedFrequency = getSelectedFrequency(pkg)
              const selectedPrice = asNumber(pkg.frequencyPrices[selectedFrequency])
              const serviceNames = Array.isArray(pkg.services)
                ? pkg.services
                    .map((s) => (s && typeof s === 'object' ? String(s.name || '').trim() : String(s || '').trim()))
                    .filter(Boolean)
                : []
              const previewServices = serviceNames.slice(0, 3)
              const moreServicesCount = Math.max(serviceNames.length - previewServices.length, 0)

              return (
                <div
                  key={pkg.id}
                  className="portal-subs-package-card"
                >
                  <div className="portal-subs-package-head">
                    <div className="portal-subs-package-name">{pkg.name}</div>
                    <span className="portal-subs-duration-pill">
                      {pkg.duration || 'Subscription'}
                    </span>
                  </div>

                  <div className="portal-subs-package-description">
                    {pkg.description || 'No description provided.'}
                  </div>

                  <div className="portal-subs-package-controls">
                    <label className="portal-subs-frequency-label">
                      <span className="portal-subs-frequency-title">Frequency</span>
                      <select
                        className="portal-subs-frequency-select"
                        value={selectedFrequency}
                        onChange={(e) => setSelectedFrequencyByPackage((prev) => ({ ...prev, [pkg.id]: e.target.value }))}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </label>
                  </div>

                  <div className="portal-subs-services-box">
                    <div className="portal-subs-services-title">
                      Included Services {serviceNames.length > 0 ? `(${serviceNames.length})` : ''}
                    </div>
                    {previewServices.length > 0 ? (
                      <ul className="portal-subs-services-list">
                        {previewServices.map((name, idx) => (
                          <li key={`${pkg.id}-svc-${idx}`} className="portal-subs-services-item">{name}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="portal-subs-services-empty">No inclusions listed.</div>
                    )}
                    {moreServicesCount > 0 && (
                      <div className="portal-subs-services-more">+{moreServicesCount} more services</div>
                    )}
                  </div>

                  <div className="portal-subs-price-row">
                    <div className="portal-subs-price">
                      {`₱${selectedPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </div>
                    <button
                      type="button"
                      className="btn-primary portal-subs-subscribe-btn"
                      onClick={() => {
                        setRequestMessage('')
                        setSelectedPackage({
                          id: pkg.id,
                          name: pkg.name,
                          description: pkg.description,
                          duration: pkg.duration,
                          selectedFrequency,
                          selectedPrice,
                        })
                        setShowAvailModal(true)
                      }}
                    >
                      Subscribe
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : loading ? (
        <div className="portal-subs-center-msg">Loading subscriptions...</div>
      ) : filteredSubs.length === 0 ? (
        <div className="portal-subs-center-msg">No subscriptions in this category</div>
      ) : (
        <div className="portal-subs-active-grid">
          {filteredSubs.map(sub => (
            <div key={sub.id} className="portal-subs-active-card">
              <div className="portal-subs-active-head">
                <div>
                  <div className="portal-subs-active-package">{sub.package_name}</div>
                  <div className="portal-subs-active-plate">{sub.plate_number}</div>
                </div>
                <div className={`portal-subs-status-pill ${statusClass[sub.displayStatus] || 'is-cancelled'}`}>
                  {sub.displayStatus}
                </div>
              </div>
              <div className="portal-subs-active-dates">
                <div>Start: {new Date(sub.start_date).toLocaleDateString()}</div>
                <div>End: {new Date(sub.end_date).toLocaleDateString()}</div>
              </div>
              <div className="portal-subs-active-price">
                ₱{asNumber(sub.package_price).toFixed(2)}/month
              </div>
              <div className="portal-subs-active-actions">
                <button
                  type="button"
                  className="portal-subs-view-btn"
                  onClick={() => openSubscriptionModal(sub.id)}
                >
                  View
                </button>
                {(sub.displayStatus === 'Active' || sub.displayStatus === 'Expiring Soon') && (
                  <button
                    type="button"
                    className="portal-subs-cancel-btn"
                    disabled={busyCancelId === sub.id}
                    onClick={() => handleCancelSubscription(sub)}
                  >
                    {busyCancelId === sub.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showSubscriptionModal && (
        <div className="portal-subs-modal-overlay" onClick={() => setShowSubscriptionModal(false)}>
          <div className="portal-subs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="portal-subs-modal-head">
              <h3 className="portal-subs-modal-title">Subscription Details</h3>
              <button
                type="button"
                className="portal-subs-modal-close"
                onClick={() => setShowSubscriptionModal(false)}
              >
                Close
              </button>
            </div>

            {detailsLoading ? (
              <div className="portal-subs-center-msg">Loading details...</div>
            ) : detailsError ? (
              <div className="portal-subs-center-msg is-error">{detailsError}</div>
            ) : !selectedSubscription ? (
              <div className="portal-subs-center-msg">No subscription details found.</div>
            ) : (
              <div className="portal-subs-modal-content">
                <div className="portal-subs-modal-row"><span>Package</span><strong>{selectedSubscription.package_name || '-'}</strong></div>
                <div className="portal-subs-modal-row"><span>Status</span><strong>{selectedSubscription.status || '-'}</strong></div>
                <div className="portal-subs-modal-row"><span>Vehicle</span><strong>{selectedSubscription.plate_number || '-'}</strong></div>
                <div className="portal-subs-modal-row"><span>Start</span><strong>{selectedSubscription.start_date ? new Date(selectedSubscription.start_date).toLocaleDateString() : '-'}</strong></div>
                <div className="portal-subs-modal-row"><span>End</span><strong>{selectedSubscription.end_date ? new Date(selectedSubscription.end_date).toLocaleDateString() : '-'}</strong></div>
                <div className="portal-subs-modal-row"><span>Price</span><strong>₱{asNumber(selectedSubscription.package_price ?? selectedSubscription.price).toFixed(2)}</strong></div>

                <div className="portal-subs-progress-wrap">
                  <div className="portal-subs-progress-label">
                    <span>Subscription Progress</span>
                    <span>{subscriptionProgress.label}</span>
                  </div>
                  <div className="portal-subs-progress-track">
                    <div className="portal-subs-progress-fill" style={{ width: `${subscriptionProgress.percent}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <PortalPackageAvailModal
        open={showAvailModal}
        onClose={() => setShowAvailModal(false)}
        packageItem={selectedPackage}
        packageType="Subscription"
        onSubmitted={() => {
          setRequestMessage('Subscription request submitted successfully. Our team will review and contact you shortly.')
        }}
      />
    </div>
  )
}
