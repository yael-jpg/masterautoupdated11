import React, { useEffect, useMemo, useState } from 'react'
import { portalGet, portalPost } from '../../api/portalClient'
import './PortalPackageAvailModal.css'

function toLocalInputValue(date) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getDefaultScheduleStart() {
  const d = new Date()
  d.setSeconds(0, 0)
  return toLocalInputValue(d)
}

function computeSubscriptionEndDate(scheduleStart, durationValue, frequency) {
  if (!scheduleStart) return null
  const start = new Date(scheduleStart)
  if (Number.isNaN(start.getTime())) return null

  const normalizedFrequency = String(frequency || '').trim().toLowerCase()
  const end = new Date(start)

  if (normalizedFrequency === 'weekly') {
    end.setDate(end.getDate() + 7)
    return end
  }
  if (normalizedFrequency === 'annual') {
    end.setFullYear(end.getFullYear() + 1)
    return end
  }
  if (normalizedFrequency === 'monthly') {
    end.setMonth(end.getMonth() + 1)
    return end
  }

  const rawDuration = String(durationValue || '').trim().toLowerCase()
  if (!rawDuration) return null
  if (rawDuration.includes('weekly')) {
    end.setDate(end.getDate() + 7)
    return end
  }
  if (rawDuration.includes('annual') || rawDuration.includes('year')) {
    end.setFullYear(end.getFullYear() + 1)
    return end
  }
  if (rawDuration.includes('monthly')) {
    end.setMonth(end.getMonth() + 1)
    return end
  }

  const monthMatch = rawDuration.match(/(\d+)\s*month/)
  if (monthMatch) {
    end.setMonth(end.getMonth() + Math.max(Number(monthMatch[1]) || 1, 1))
    return end
  }

  const dayMatch = rawDuration.match(/(\d+)\s*day/)
  if (dayMatch) {
    end.setDate(end.getDate() + Math.max(Number(dayMatch[1]) || 1, 1))
    return end
  }

  return null
}

function formatFrequencyLabel(frequency) {
  const raw = String(frequency || '').trim().toLowerCase()
  if (raw === 'weekly') return 'Weekly'
  if (raw === 'annual') return 'Annual'
  return 'Monthly'
}

export function PortalPackageAvailModal({
  open,
  onClose,
  packageItem,
  packageType = 'Package',
  onSubmitted,
}) {
  const [vehicles, setVehicles] = useState([])
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [minScheduleStart, setMinScheduleStart] = useState(getDefaultScheduleStart())
  const [form, setForm] = useState({
    vehicleId: '',
    scheduleStart: getDefaultScheduleStart(),
    notes: '',
  })

  useEffect(() => {
    if (!open) return
    let stopped = false

    setError('')
    setSubmitting(false)
    setLoadingVehicles(true)
    setMinScheduleStart(getDefaultScheduleStart())
    setForm({
      vehicleId: '',
      scheduleStart: getDefaultScheduleStart(),
      notes: '',
    })

    portalGet('/vehicles')
      .then((rows) => {
        if (stopped) return
        const list = Array.isArray(rows) ? rows : []
        setVehicles(list)
        if (list.length === 1) {
          setForm((prev) => ({ ...prev, vehicleId: String(list[0].id) }))
        }
      })
      .catch((err) => {
        if (stopped) return
        setError(err?.message || 'Failed to load vehicles.')
        setVehicles([])
      })
      .finally(() => {
        if (!stopped) setLoadingVehicles(false)
      })

    return () => {
      stopped = true
    }
  }, [open, packageItem?.id])

  useEffect(() => {
    if (!open) return
    const tick = () => {
      const nowValue = getDefaultScheduleStart()
      setMinScheduleStart(nowValue)
      setForm((prev) => {
        if (!prev.scheduleStart) return { ...prev, scheduleStart: nowValue }
        const selected = new Date(prev.scheduleStart)
        const minDate = new Date(nowValue)
        if (Number.isNaN(selected.getTime()) || selected < minDate) {
          return { ...prev, scheduleStart: nowValue }
        }
        return prev
      })
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [open])

  const title = useMemo(() => {
    if (!packageItem?.name) return `Avail ${packageType}`
    return `Avail ${packageType}: ${packageItem.name}`
  }, [packageItem?.name, packageType])

  const subscriptionEndDate = useMemo(() => {
    if (String(packageType || '').toLowerCase() !== 'subscription') return null
    return computeSubscriptionEndDate(form.scheduleStart, packageItem?.duration, packageItem?.selectedFrequency)
  }, [packageType, form.scheduleStart, packageItem?.duration, packageItem?.selectedFrequency])

  if (!open) return null

  const submit = async () => {
    setError('')

    if (!form.vehicleId) {
      setError('Please choose a vehicle.')
      return
    }

    if (!form.scheduleStart) {
      setError('Please set your preferred schedule.')
      return
    }

    const scheduleDate = new Date(form.scheduleStart)
    if (Number.isNaN(scheduleDate.getTime())) {
      setError('Preferred schedule is invalid.')
      return
    }

    const requestNotes = [
      `[PORTAL ${String(packageType || '').toUpperCase()} AVAIL REQUEST]`,
      packageItem?.id ? `Package ID: ${packageItem.id}` : null,
      packageItem?.name ? `Package: ${packageItem.name}` : null,
      packageItem?.selectedFrequency ? `Frequency: ${formatFrequencyLabel(packageItem.selectedFrequency)}` : null,
      packageItem?.selectedPrice != null ? `Selected price: ₱${Number(packageItem.selectedPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
      subscriptionEndDate ? `Subscription end: ${subscriptionEndDate.toLocaleString('en-PH')}` : null,
      form.notes ? String(form.notes).trim() : null,
    ].filter(Boolean).join('\n')

    try {
      setSubmitting(true)
      const response = await portalPost('/appointments/book', {
        vehicleId: Number(form.vehicleId),
        scheduleStart: scheduleDate.toISOString(),
        notes: requestNotes,
      })
      onSubmitted?.(response)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Failed to submit request.')
    } finally {
      setSubmitting(false)
    }
  }

  const packageDescription = String(packageItem?.description || '').trim()

  return (
    <div
      className="portal-package-avail-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 8, 16, 0.72)',
        backdropFilter: 'blur(2px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="portal-package-avail-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 14,
          border: '1px solid var(--border-secondary)',
          background: 'linear-gradient(180deg, rgba(18,21,31,0.98) 0%, rgba(10,12,19,0.98) 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          padding: 20,
        }}
      >
        <div className="portal-package-avail-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20, lineHeight: 1.2 }}>{title}</h3>
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              Submit this request directly from the client portal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              border: '1px solid var(--border-secondary)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-secondary)',
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="portal-package-avail-summary" style={{ marginBottom: 14, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{packageItem?.name || 'Selected package'}</div>
          {packageItem?.duration && (
            <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 12 }}>
              Duration: {packageItem.duration}
            </div>
          )}
          {String(packageType || '').toLowerCase() === 'subscription' && (
            <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 12 }}>
              Frequency: {formatFrequencyLabel(packageItem?.selectedFrequency)}
              {packageItem?.selectedPrice != null
                ? ` • ₱${Number(packageItem.selectedPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : ''}
            </div>
          )}
          <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
            {packageDescription || 'No description provided.'}
          </div>
        </div>

        <div className="portal-package-avail-form" style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Vehicle</span>
            <select
              value={form.vehicleId}
              disabled={loadingVehicles || submitting}
              onChange={(e) => setForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
              style={{
                minHeight: 38,
                borderRadius: 8,
                border: '1px solid var(--border-secondary)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                padding: '8px 10px',
              }}
            >
              <option value="">Select vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {`${v.plate_number || 'No plate'} - ${v.make || ''} ${v.model || ''} ${v.variant || ''}`.trim()}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Preferred Schedule</span>
            <input
              type="datetime-local"
              value={form.scheduleStart}
              disabled={submitting}
              min={minScheduleStart}
              onChange={(e) => setForm((prev) => ({ ...prev, scheduleStart: e.target.value }))}
              style={{
                minHeight: 38,
                borderRadius: 8,
                border: '1px solid var(--border-secondary)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                padding: '8px 10px',
              }}
            />
          </label>

          {subscriptionEndDate && (
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>End Date</span>
              <input
                type="text"
                value={subscriptionEndDate.toLocaleString('en-PH', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                readOnly
                style={{
                  minHeight: 38,
                  borderRadius: 8,
                  border: '1px solid var(--border-secondary)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text-primary)',
                  padding: '8px 10px',
                }}
              />
            </label>
          )}

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Notes (optional)</span>
            <textarea
              value={form.notes}
              disabled={submitting}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Tell us any preferences or concerns..."
              rows={3}
              style={{
                borderRadius: 8,
                border: '1px solid var(--border-secondary)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-primary)',
                padding: '10px 12px',
                resize: 'vertical',
              }}
            />
          </label>

          {error && (
            <div className="portal-package-avail-error" style={{ color: '#f87171', fontSize: 12 }}>{error}</div>
          )}
        </div>

        <div className="portal-package-avail-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              minHeight: 36,
              borderRadius: 8,
              border: '1px solid var(--border-secondary)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || loadingVehicles}
            className="btn-primary"
            style={{ minHeight: 36, padding: '8px 14px', borderRadius: 8 }}
          >
            {submitting ? 'Submitting...' : `Avail ${packageType}`}
          </button>
        </div>
      </div>
    </div>
  )
}
