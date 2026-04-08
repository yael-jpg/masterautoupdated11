import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './GuestPortalPage.css'
import { SERVICE_CATALOG, VEHICLE_SIZE_OPTIONS, getEffectivePrice } from '../data/serviceCatalog'
import { GenericServiceProcess, getServiceProcess, isCoating, isDetailing, isPPF } from '../components/ServiceProcess'
import { onConfigUpdated, onVehicleMakesUpdated } from '../utils/events'

const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'
const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
const API_BASE = (() => {
    const trimmed = String(RAW_API_BASE || '').replace(/\/+$/, '')
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
})()
const PUBLIC_BASE = `${API_BASE}/public`

function withTimeout(timeoutMs = 15000) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    return {
        signal: controller.signal,
        clear: () => clearTimeout(timeoutId),
    }
}

async function publicGet(path, { timeoutMs = 15000 } = {}) {
    const url = `${PUBLIC_BASE}${path}`
    const { signal, clear } = withTimeout(timeoutMs)
    try {
        const res = await fetch(url, { signal })
        // Handle empty responses safely
        const text = await res.text().catch(() => '')
        const json = text ? JSON.parse(text) : null
        if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
        return json
    } catch (e) {
        if (e?.name === 'AbortError') throw new Error('Request timed out')
        throw e
    } finally {
        clear()
    }
}

async function publicPost(path, body, { timeoutMs = 20000 } = {}) {
    const url = `${PUBLIC_BASE}${path}`
    const { signal, clear } = withTimeout(timeoutMs)
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        })
        const text = await res.text().catch(() => '')
        const json = text ? JSON.parse(text) : null
        if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
        return json
    } catch (e) {
        if (e?.name === 'AbortError') throw new Error('Request timed out')
        throw e
    } finally {
        clear()
    }
}

function fmt(price) {
    if (!price && price !== 0) return null
    return '₱' + Number(price).toLocaleString('en-PH', { minimumFractionDigits: 0 })
}
// Convert DB code (e.g. "CAT-PPF-BASIC") to catalog code ("ppf-basic")
function dbCodeToCatalogCode(dbCode) {
    if (!dbCode) return null
    return dbCode.replace(/^CAT-/i, '').toLowerCase()
}

// Get catalog entry for a DB service
function getCatalogEntry(dbCode) {
    const code = dbCodeToCatalogCode(dbCode)
    return code ? SERVICE_CATALOG.find(c => c.code === code) : null
}

// Get a single headline price for a service using catalog + overrides.
// For services with multiple size prices, show the highest listed price.
function catalogDisplayPrice(dbCode, overrides = {}) {
    const entry = getCatalogEntry(dbCode)
    if (!entry) return null
    const prices = VEHICLE_SIZE_OPTIONS
        .map(s => getEffectivePrice(entry.code, s.key, overrides))
        .filter(p => p > 0)
    if (!prices.length) return null
    const max = Math.max(...prices)
    return fmt(max)
}

// Get per-size price tiles for a catalog service
function catalogSizePrices(dbCode, overrides = {}) {
    const entry = getCatalogEntry(dbCode)
    if (!entry) return null
    return VEHICLE_SIZE_OPTIONS
        .map(s => ({ size: s.label, key: s.key, price: getEffectivePrice(entry.code, s.key, overrides) }))
        .filter(s => s.price > 0)
}

function getServicePriceForSize(service, vehicleSize, priceOverrides = {}) {
    const sizeKey = vehicleSize || 'medium'
    const catalogCode = dbCodeToCatalogCode(service?.code)
    const configuredPrice = catalogCode ? getEffectivePrice(catalogCode, sizeKey, priceOverrides) : 0
    if (Number(configuredPrice || 0) > 0) return Number(configuredPrice)
    const fallback = Number(service?.base_price || 0)
    return Number.isFinite(fallback) ? fallback : 0
}

const PHONE_COUNTRIES = [
    { code: '63',  flag: '\uD83C\uDDF5\uD83C\uDDED', name: 'Philippines',   local: v => v.startsWith('09') || (v.startsWith('9') && v.replace(/\D/g,'').length === 10) },
    { code: '1',   flag: '\uD83C\uDDFA\uD83C\uDDF8', name: 'US / Canada' },
    { code: '44',  flag: '\uD83C\uDDEC\uD83C\uDDE7', name: 'United Kingdom' },
    { code: '61',  flag: '\uD83C\uDDE6\uD83C\uDDFA', name: 'Australia' },
    { code: '81',  flag: '\uD83C\uDDEF\uD83C\uDDF5', name: 'Japan' },
    { code: '82',  flag: '\uD83C\uDDF0\uD83C\uDDF7', name: 'South Korea' },
    { code: '86',  flag: '\uD83C\uDDE8\uD83C\uDDF3', name: 'China' },
    { code: '65',  flag: '\uD83C\uDDF8\uD83C\uDDEC', name: 'Singapore' },
    { code: '60',  flag: '\uD83C\uDDF2\uD83C\uDDFE', name: 'Malaysia' },
    { code: '971', flag: '\uD83C\uDDE6\uD83C\uDDEA', name: 'UAE' },
    { code: '966', flag: '\uD83C\uDDF8\uD83C\uDDE6', name: 'Saudi Arabia' },
    { code: '39',  flag: '\uD83C\uDDEE\uD83C\uDDF9', name: 'Italy' },
    { code: '49',  flag: '\uD83C\uDDE9\uD83C\uDDEA', name: 'Germany' },
    { code: '33',  flag: '\uD83C\uDDEB\uD83C\uDDF7', name: 'France' },
]

function detectPhone(raw) {
    if (!raw || !raw.trim()) return null
    const digits = raw.replace(/\D/g, '')
    // Check Philippine local format first (09XX or 9XX with 10 digits)
    if (/^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits)) {
        return PHONE_COUNTRIES.find(c => c.code === '63')
    }
    // International: starts with +
    if (raw.trimStart().startsWith('+')) {
        // Try longer codes first (3-digit, then 2-digit, then 1-digit)
        for (const country of PHONE_COUNTRIES) {
            if (digits.startsWith(country.code)) return country
        }
        return { code: null, flag: '\uD83C\uDF10', name: 'International' }
    }
    // Starts with 63 (no +)
    if (digits.startsWith('63') && digits.length >= 11) {
        return PHONE_COUNTRIES.find(c => c.code === '63')
    }
    return null
}

function roundUpToQuarterHour(value) {
    const date = new Date(value)
    date.setSeconds(0, 0)
    const remainder = date.getMinutes() % 15
    if (remainder !== 0) {
        date.setMinutes(date.getMinutes() + (15 - remainder))
    }
    return date
}

function getQuotationMinDate() {
    const date = new Date()
    date.setHours(date.getHours() + 2)
    return roundUpToQuarterHour(date)
}

function getServiceScheduleProfile(service) {
    const serviceName = service?.name || ''

    if (isPPF(serviceName)) {
        return {
            totalDays: 7,
            completionHour: 15,
            releaseDays: 7,
            releaseHour: 15,
        }
    }

    if (isCoating(serviceName)) {
        return {
            totalDays: 3,
            completionHour: 17,
            releaseDays: 3,
            releaseHour: 17,
        }
    }

    if (isDetailing(serviceName) || String(service?.category || '').toLowerCase().includes('detail')) {
        return {
            totalDays: 4,
            completionHour: 17,
            releaseDays: 4,
            releaseHour: 17,
        }
    }

    const totalDays = Math.max(Number(service?.duration_days) || 1, 1)
    return {
        totalDays,
        completionHour: 15,
        releaseDays: totalDays,
        releaseHour: 15,
    }
}

function applyHour(date, hour) {
    const next = new Date(date)
    next.setHours(hour, 0, 0, 0)
    return next
}

function computeQuotationEndDate(preferredDate, scheduleProfile) {
    if (!preferredDate) return null
    const totalDays = Math.max(Number(scheduleProfile?.totalDays) || 1, 1)
    const endDate = new Date(preferredDate)
    endDate.setDate(endDate.getDate() + totalDays)
    return applyHour(endDate, scheduleProfile?.completionHour ?? 15)
}

function computeQuotationReleaseDate(preferredDate, scheduleProfile) {
    if (!preferredDate) return null
    const releaseDate = new Date(preferredDate)
    releaseDate.setDate(releaseDate.getDate() + Math.max(Number(scheduleProfile?.releaseDays) || 1, 1))
    return applyHour(releaseDate, scheduleProfile?.releaseHour ?? 15)
}

function formatPortalDateTime(value) {
    if (!value) return '—'
    return new Date(value).toLocaleString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}
// ─── CUSTOM SELECT ────────────────────────────────────────────────────────────
// GpServicePicker — Advanced Two-Panel Service Picker (from PortalBooking)
function GpServicePicker({ services, value, onChange, vehicleSize, priceOverrides, invalid = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panelStyle, setPanelStyle] = useState({})
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  const normalizedServices = services.map((s) => ({
    ...s,
    category: normalizePortalServiceCategory(s.category, s.name),
        })).filter((s) => isAllowedForCategory(s))

  const isServiceAvailableForSize = (svc) => {
        return getServicePriceForSize(svc, vehicleSize, priceOverrides) > 0
  }

  const qStr = query.toLowerCase()
  const filtered = normalizedServices.filter((s) => {
    const matchSearch = !qStr || s.name.toLowerCase().includes(qStr) || (s.category || '').toLowerCase().includes(qStr)
    return matchSearch && isServiceAvailableForSize(s)
  })

  // Group items for display
    const groups = Array.from(new Set(filtered.map(s => s.category))).map(cat => ({
    category: cat,
        items: filtered.filter(s => s.category === cat)
  }))

  const selected = normalizedServices.find((s) => String(s.id) === String(value) || s.code === value)

  const openPanel = () => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPanelStyle({ 
            position: 'fixed', 
            top: rect.bottom + 6, 
            left: rect.left, 
            width: rect.width,
            zIndex: 9999 
        })
      }
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    const handler = (e) => {
        if (
          triggerRef.current && !triggerRef.current.contains(e.target) &&
          panelRef.current && !panelRef.current.contains(e.target)
        ) setOpen(false)
      }
    document.addEventListener('mousedown', handler)
    return () => {
        window.removeEventListener('scroll', reposition, true)
        window.removeEventListener('resize', reposition)
        document.removeEventListener('mousedown', handler)
    }
  }, [open])

  const badgeFor = (s) => {
    const m = s.name.match(/(\d+)\s*Years?/i)
    return m ? `${m[1]}YR` : null
  }

  const pick = (svc) => {
    onChange(svc.code || svc.id)
    setOpen(false)
    setQuery('')
  }

  const panel = open &&
    createPortal(
      <div className="gp-svc-panel grouped" ref={panelRef} style={panelStyle}>
        <div className="gp-svc-list-scroll">
          {groups.length === 0 ? (
            <div className="gp-svc-empty">No matching services found</div>
          ) : (
            groups.map((g) => (
              <div key={g.category} className="gp-svc-dropdown-group">
                <div className="gp-svc-dropdown-group-label">{g.category}</div>
                {g.items.map((svc) => {
                  const isSelected = String(value) === String(svc.id) || value === svc.code
                  const badge = badgeFor(svc)
                  return (
                    <button
                      key={svc.code || svc.id}
                      type="button"
                      className={`gp-svc-item-btn${isSelected ? ' active' : ''}`}
                      onClick={() => pick(svc)}
                    >
                      <div className="gp-svc-item-texts">
                        <span className="gp-svc-item-name">{svc.name}</span>
                        <span className="gp-svc-item-desc">{svc.category}</span>
                      </div>
                      <div className="gp-svc-item-right">
                        {badge && <span className="gp-svc-item-badge">{badge}</span>}
                        {isSelected && (
                          <svg className="gp-svc-item-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        {value && (
          <div className="gp-svc-footer">
            <button type="button" className="gp-svc-clear-btn" onClick={() => { onChange(''); setOpen(false) }}>
              Clear Selection
            </button>
          </div>
        )}
      </div>,
      document.body,
    )

  return (
    <>
      <div
        ref={triggerRef}
        className={`gp-svc-trigger${open ? ' open' : ''}${invalid ? ' invalid' : ''}`}
        onClick={() => !open && openPanel()}
      >
        {open ? (
          <input
            ref={inputRef}
            className="gp-svc-trigger-input"
            type="text"
            placeholder="Search services…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : (
          <div className="gp-svc-trigger-value">
            {selected ? (
              <>
                <span className="gp-svc-trigger-cat-badge">{selected.category}</span>
                {selected.name}
              </>
            ) : (
              <span className="gp-svc-trigger-placeholder">— Choose a service —</span>
            )}
          </div>
        )}
        <svg className="gp-svc-trigger-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {panel}
    </>
  )
}

function normalizePortalServiceCategory(category, name) {
  const c = String(category || '').trim()
  const n = String(name || '').toLowerCase()
  if (!c || c === 'Other' || c === 'Other Services') {
    if (n.includes('detailing')) return 'Detailing Services'
    if (n.includes('ppf') || n.includes('film')) return 'PPF Services'
    if (n.includes('coating')) return 'Coating Services'
    if (n.includes('wash')) return 'Car Wash Services'
        return 'Other Services'
  }
  if (/^ppf$/i.test(c)) return 'PPF Services'
  if (/^ceramic\s*coating$/i.test(c)) return 'Coating Services'
  if (/^detailing$/i.test(c)) return 'Detailing Services'
    if (/^subscription/i.test(c)) return 'Subscription Services'
    if (/^pms/i.test(c)) return 'PMS Services'
  if (!c.toLowerCase().endsWith('services')) return `${c} Services`
  return c
}

function isAllowedForCategory(service) {
    const category = normalizePortalServiceCategory(service?.category, service?.name)
    const code = String(service?.code || '').toUpperCase()
    if (category === 'Subscription Services') return /^SUBS-PKG-\d+$/.test(code)
    if (category === 'PMS Services') return /^PMS-PKG-\d+$/.test(code)
    return true
}

// options: [{ value, label, sub? }]
function GpSelect({
    value,
    onChange,
    options,
    placeholder = '— Select —',
    disabled = false,
    searchable = false,
    invalid = false,
    grouped = false,
}) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const wrapRef = useRef(null)
    const searchRef = useRef(null)

    const selected = options.find(o => o.value === value)

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    // Auto-focus search on open
    useEffect(() => {
        if (open && searchable && searchRef.current) {
            setTimeout(() => searchRef.current?.focus(), 30)
        }
        if (!open) setQuery('')
    }, [open, searchable])

    const filtered = query
        ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()) || (o.group || '').toLowerCase().includes(query.toLowerCase()))
        : options

    const choose = (val) => {
        onChange(val)
        setOpen(false)
        setQuery('')
    }

    // Build grouped rendering
    const renderOptions = () => {
        if (filtered.length === 0) {
            return <div className="gp-sel-empty">No results</div>
        }

        if (grouped) {
            // Group options by their .group property, preserving order
            const groups = []
            const groupMap = {}
            filtered.forEach(o => {
                const g = o.group || 'Other'
                if (!groupMap[g]) {
                    groupMap[g] = []
                    groups.push(g)
                }
                groupMap[g].push(o)
            })

            return groups.map(g => (
                <div key={g}>
                    <div className="gp-sel-group-header">{g}</div>
                    {groupMap[g].map(o => (
                        <div
                            key={o.value}
                            className={`gp-sel-option${o.value === value ? ' selected' : ''}`}
                            onClick={() => choose(o.value)}
                        >
                            <span className="gp-sel-opt-label">{o.label}</span>
                            {o.sub && <span className="gp-sel-opt-sub">{o.sub}</span>}
                            {o.value === value && (
                                <svg className="gp-sel-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </div>
                    ))}
                </div>
            ))
        }

        return filtered.map(o => (
            <div
                key={o.value}
                className={`gp-sel-option${o.value === value ? ' selected' : ''}${o.isPlaceholder ? ' placeholder' : ''}`}
                onClick={() => choose(o.value)}
            >
                <span className="gp-sel-opt-label">{o.label}</span>
                {o.sub && <span className="gp-sel-opt-sub">{o.sub}</span>}
                {o.value === value && (
                    <svg className="gp-sel-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </div>
        ))
    }

    return (
        <div className={`gp-sel${open ? ' open' : ''}${disabled ? ' disabled' : ''}${invalid ? ' invalid' : ''}`} ref={wrapRef}>
            <button
                type="button"
                className="gp-sel-trigger"
                onClick={() => !disabled && setOpen(o => !o)}
                disabled={disabled}
                aria-invalid={invalid ? 'true' : 'false'}
            >
                {selected
                    ? <span className="gp-sel-value">{selected.label}{selected.sub && <span className="gp-sel-sub"> · {selected.sub}</span>}</span>
                    : <span className="gp-sel-placeholder">{placeholder}</span>
                }
                <svg className="gp-sel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {open && (
                <div className="gp-sel-panel">
                    {searchable && (
                        <div className="gp-sel-search-wrap">
                            <input
                                ref={searchRef}
                                className="gp-sel-search"
                                type="text"
                                placeholder="Search…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <div className="gp-sel-list">
                        {renderOptions()}
                    </div>
                </div>
            )}
        </div>
    )
}


const SIZE_ORDER = ['Small Bike', 'Big Bike', 'X Small', 'Small', 'Medium', 'Large', 'X Large', 'XX Large']

function parseName(name) {
    const idx = name.lastIndexOf(' - ')
    if (idx === -1) return { base: name, size: null }
    const size = name.slice(idx + 3)
    return SIZE_ORDER.includes(size) ? { base: name.slice(0, idx), size } : { base: name, size: null }
}

const TIER_COLORS = []  // legacy, kept for reference

function tierColor(_name) {
    return { text: '#c0c0c0', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.16)' }
}

function defaultServiceDescription(serviceName) {
    const n = String(serviceName || '').toLowerCase()
    if (!n) return 'Service details will be confirmed upon inspection. Request a quote to get recommendations and availability.'
    if (n.includes('ppf') || n.includes('paint protection film')) {
        return 'Paint protection film package designed to protect painted surfaces from chips, scratches, and stains.'
    }
    if (n.includes('ceramic') || n.includes('graphene')) {
        return 'Protective coating service that enhances gloss and helps repel water, dirt, and contaminants.'
    }
    if (n.includes('tint')) {
        return 'Window tint installation for heat and UV reduction, comfort, and privacy.'
    }
    if (n.includes('wash')) {
        return 'Car wash service for exterior cleaning and basic upkeep.'
    }
    if (n.includes('detail')) {
        return 'Detailing service for deeper cleaning and interior/exterior refresh.'
    }
    if (n.includes('engine')) {
        return 'Engine bay cleaning and detailing service.'
    }
    return 'Service details will be confirmed upon inspection. Request a quote to get recommendations and availability.'
}

function ServiceCard({ baseName, variants, description, materialsNotes, onRequestQuote, priceOverrides, vehicleSize }) {
    const [expanded, setExpanded] = useState(false)
    const sorted = [...variants].sort((a, b) => SIZE_ORDER.indexOf(a.size ?? '') - SIZE_ORDER.indexOf(b.size ?? ''))
    const representative = sorted[0] // use first variant's code for catalog lookup

    const chosenSizeKey = vehicleSize || 'medium'
    const chosenSizeLabel = VEHICLE_SIZE_OPTIONS.find(s => s.key === chosenSizeKey)?.label || null
    const representativeCatalog = getCatalogEntry(representative?.code)

    // Use catalog per-size prices if available, else fall back to DB base_price
    const catalogSizes = catalogSizePrices(representative?.code, priceOverrides)

    const chosenCatalogPrice = (() => {
        if (!representativeCatalog) return null
        const p = getEffectivePrice(representativeCatalog.code, chosenSizeKey, priceOverrides)
        return p > 0 ? p : null
    })()

    const chosenDbPrice = (() => {
        if (!chosenSizeLabel) return null
        const match = sorted.find(v => v.size === chosenSizeLabel)
        const p = match ? Number(match.base_price) : null
        return p && p > 0 ? p : null
    })()

    // Determine whether to show size tiles
    const hasCatalogSizes = catalogSizes && catalogSizes.length > 1
    const hasDbSizes = sorted.some(v => v.size)
    const hasSizes = hasCatalogSizes || hasDbSizes

    const toggleDetails = () => setExpanded(o => !o)

    const requestQuoteForBase = () => {
        const price = chosenCatalogPrice ?? chosenDbPrice ?? catalogSizes?.[0]?.price ?? sorted[0]?.base_price
        onRequestQuote({ name: baseName, price })
    }

    const onSummaryKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleDetails()
        }
    }

    // Size tiles: prefer catalog sizes, fall back to DB variants
    const sizeTiles = hasCatalogSizes
        ? catalogSizes.map(s => ({
            key: s.key,
            label: s.size,
            price: s.price,
            svcName: `${baseName} - ${s.size}`,
        }))
        : sorted.filter(v => v.size).map(v => ({
            key: v.id,
            label: v.size,
            price: Number(v.base_price),
            svcName: `${baseName} - ${v.size}`,
        }))

    return (
        <div className={`gp-svc-card${expanded ? ' expanded' : ''}`}>
            <div
                className="gp-svc-card-summary"
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={toggleDetails}
                onKeyDown={onSummaryKeyDown}
            >
                <div className="gp-svc-card-top">
                    <div className="gp-svc-card-name">{baseName}</div>
                    <div className="gp-svc-card-right">
                        <svg className={`gp-svc-card-chevron${expanded ? ' up' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>
                {description && <div className="gp-svc-card-desc">{description}</div>}
            </div>

            {expanded && (
                <div className="gp-svc-details" onClick={e => e.stopPropagation()}>
                    <div className="gp-svc-details-section">
                        <div className="gp-svc-details-kicker">Installation / Service Process</div>
                        <div className="gp-svc-details-sub">Process overview for: <strong>{baseName}</strong></div>

                        {getServiceProcess(baseName) || <GenericServiceProcess serviceName={baseName} />}
                    </div>

                    {!hasSizes && (
                        <div className="gp-svc-details-section">
                            <div className="gp-svc-details-kicker">Quote Request</div>
                            <button
                                type="button"
                                className="gp-svc-quote-btn"
                                onClick={requestQuoteForBase}
                            >
                                Request Quote for This Service
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {materialsNotes && (
                        <div className="gp-svc-details-section">
                            <div className="gp-svc-details-kicker">Materials / Products Used</div>
                            <div className="gp-svc-details-notes">{materialsNotes}</div>
                        </div>
                    )}

                    {hasSizes && (
                        <div className="gp-svc-details-section">
                            <div className="gp-svc-details-kicker">Sizes</div>
                            <div className="gp-svc-sizes-wrap">
                                {sizeTiles.map(t => (
                                    <div
                                        key={t.key}
                                        className="gp-svc-size-tile"
                                        onClick={() => onRequestQuote({ name: t.svcName, price: t.price })}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') onRequestQuote({ name: t.svcName, price: t.price })
                                        }}
                                    >
                                        <div className="gp-svc-size-name">{t.label}</div>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    className="gp-svc-quote-btn"
                                    onClick={() => onRequestQuote({ name: baseName, price: sizeTiles[0]?.price })}
                                >
                                    Request Quote for This Service
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
function ServicesTab({ onRequestQuote }) {
    const [services, setServices] = useState([])
    const [priceOverrides, setPriceOverrides] = useState({})
    const [materialsNotesByCode, setMaterialsNotesByCode] = useState({})
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('All')
    const [vehicleSize, setVehicleSize] = useState('medium')

    useEffect(() => {
        let cancelled = false
        setLoadError('')
        setLoading(true)

        const loadAll = () => {
            Promise.all([
                publicGet('/services', { timeoutMs: 15000 }).catch(() => []),
                publicGet('/price-config', { timeoutMs: 15000 }).catch(() => ({})),
            ])
                .then(([svcData, overrides]) => {
                    if (cancelled) return
                    setServices(Array.isArray(svcData) ? svcData : [])
                    setPriceOverrides(overrides && typeof overrides === 'object' ? overrides : {})

                    // Materials notes lookup
                    const notesMap = {}
                    if (Array.isArray(svcData)) {
                        for (const s of svcData) {
                            const key = String(s.code || '').toLowerCase()
                            if (key && s.materials_notes) notesMap[key] = s.materials_notes
                        }
                    }
                    setMaterialsNotesByCode(notesMap)
                })
                .finally(() => {
                    if (cancelled) return
                    setLoading(false)
                })
        }

        loadAll()
        return () => { cancelled = true }
    }, [])

    const fullCatalog = useMemo(() => {
        return services.map(s => ({
            ...s,
            category: normalizePortalServiceCategory(s.category, s.name),
            materialsNotes: s.materials_notes || ''
        })).filter(s => isAllowedForCategory(s))
    }, [services])

    const isBikeSize = vehicleSize === 'small-bike' || vehicleSize === 'big-bike'
    const sizeLabelForFilter = VEHICLE_SIZE_OPTIONS.find(s => s.key === vehicleSize)?.label || null

    const serviceSupportsSize = (svc) => {
        return getServicePriceForSize(svc, vehicleSize, priceOverrides) > 0
    }

    const servicesForSize = fullCatalog.filter(serviceSupportsSize)
    const categories = ['All', ...new Set(servicesForSize.map(s => normalizePortalServiceCategory(s.category, s.name)).filter(Boolean))]

    const availableVehicleSizes = useMemo(() => {
        const used = new Set()
        fullCatalog.forEach(svc => {
            VEHICLE_SIZE_OPTIONS.forEach(opt => {
                const price = getEffectivePrice(svc.code, opt.key, priceOverrides)
                if (price > 0) used.add(opt.key)
            })
        })
        const opts = VEHICLE_SIZE_OPTIONS.filter(o => used.has(o.key))
        return opts.length ? opts : VEHICLE_SIZE_OPTIONS
    }, [fullCatalog, priceOverrides])

    const filtered = servicesForSize.filter(s => {
        const cat = normalizePortalServiceCategory(s.category, s.name)
        const matchCat = category === 'All' || cat === category
        const q = search.toLowerCase()
        return matchCat && (!q || s.name.toLowerCase().includes(q) || (cat || '').toLowerCase().includes(q))
    })

    const groups = {}
    filtered.forEach(s => {
        const cat = normalizePortalServiceCategory(s.category, s.name)
        if (!groups[cat]) groups[cat] = { variants: [], description: '', materialsNotes: '' }

        const price = getServicePriceForSize(s, vehicleSize, priceOverrides)
        groups[cat].variants.push({
            id: s.code,
            code: s.code,
            name: s.name,
            base_price: price,
            size: vehicleSize,
            description: s.description || ''
        })
        if (s.materialsNotes) groups[cat].materialsNotes = s.materialsNotes
        if (s.description && !groups[cat].description) groups[cat].description = s.description
    })

    if (loading) return <div className="gp-loading">Loading services…</div>
    if (loadError) return <div className="gp-loading">{loadError}</div>

    return (
        <div className="gp-tab-content">
            <div className="gp-services-top">
                <div className="gp-search-wrap">
                    <svg className="gp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        className="gp-search"
                        type="text"
                        placeholder="Search services — e.g. ceramic, tint, detailing…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="gp-size-select-inline">
                    <GpSelect
                        value={vehicleSize}
                        onChange={v => setVehicleSize(v)}
                        options={availableVehicleSizes.map(s => ({ value: s.key, label: s.label }))}
                    />
                </div>
            </div>

            <div className="gp-cat-pills">
                {categories.map(cat => (
                    <button key={cat}
                        className={`gp-cat-pill${category === cat ? ' active' : ''}`}
                        onClick={() => setCategory(cat)}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {Object.keys(groups).length === 0 ? (
                <div className="gp-empty">
                    <p>No services found{search ? ` for "${search}"` : ''}.</p>
                </div>
            ) : (
                Object.entries(groups).map(([cat, { variants, description, materialsNotes }]) => (
                    <div key={cat} className="gp-cat-section">
                        <div className="gp-cat-label">{cat}</div>
                        <div className="gp-svc-grid-outer">
                            {variants.map(v => (
                                <ServiceCard
                                    key={v.code}
                                    baseName={v.name}
                                    variants={[v]}
                                    description={description || v.description}
                                    materialsNotes={materialsNotes}
                                    onRequestQuote={onRequestQuote}
                                    priceOverrides={priceOverrides}
                                    vehicleSize={vehicleSize}
                                />
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}

// ─── QUOTATION FORM ───────────────────────────────────────────────────────────
function QuotationTab({ prefillService }) {
    const [services, setServices] = useState([])
    const [priceOverrides, setPriceOverrides] = useState({})
    const [branches, setBranches] = useState(['Cubao', 'Manila'])
    const [makes, setMakes] = useState([])
    const [models, setModels] = useState([])
    const [vatRate, setVatRate] = useState(0)
    const [form, setForm] = useState({
        branch: '',
        customBranch: '',
        fullName: '',
        mobile: '',
        email: '',
        vehicleMake: '',
        vehicleModel: '',
        vehiclePlate: '',
        vehicleSize: 'medium',
        customMake: '',
        customModel: '',
        serviceId: '',
        preferredDate: null,
        endDate: null,
        notes: '',
    })
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [quotationNo, setQuotationNo] = useState('')
    const [error, setError] = useState('')
    const [endDateTouched, setEndDateTouched] = useState(false)
    const [attemptedSubmit, setAttemptedSubmit] = useState(false)

    const fullCatalog = useMemo(() => {
        return services.map(s => ({
            ...s,
            category: normalizePortalServiceCategory(s.category, s.name)
        })).filter(s => isAllowedForCategory(s))
    }, [services])

    const selectedService = form.serviceId ? fullCatalog.find(s => s.code === form.serviceId) : null
    const selectedServiceSchedule = useMemo(() => {
        return selectedService ? getServiceScheduleProfile({ code: 'CAT-' + selectedService.code.toUpperCase(), name: selectedService.name }) : null
    }, [selectedService])
    const releaseDate = useMemo(() => computeQuotationReleaseDate(form.preferredDate, selectedServiceSchedule), [form.preferredDate, selectedServiceSchedule])
    const minDate = useMemo(() => getQuotationMinDate(), [])

    const selectedServicePrice = (() => {
        if (!selectedService) return null
        const p = getServicePriceForSize(selectedService, form.vehicleSize, priceOverrides)
        return p > 0 ? p : null
    })()


    useEffect(() => {
        let cancelled = false

        const loadAll = () => {
            // Load services (publicly available)
            publicGet('/services')
                .then(data => { if (!cancelled) setServices(Array.isArray(data) ? data : []) })
                .catch(() => { })

            // Load pricing overrides (publicly available)
            publicGet('/price-config')
                .then(data => { if (!cancelled) setPriceOverrides(data && typeof data === 'object' ? data : {}) })
                .catch(() => { })

            // Load vehicle makes (publicly available)
            publicGet('/vehicle-makes')
                .then(data => { if (!cancelled) setMakes(Array.isArray(data) ? data : []) })
                .catch(() => { })

            // Load branch locations (connected to Settings > Bookings > Branches)
            publicGet('/branch-locations')
                .then(data => {
                    if (cancelled) return
                    if (Array.isArray(data) && data.length > 0) {
                        const cleaned = data.map(x => String(x || '').trim()).filter(Boolean)
                        if (cleaned.length) setBranches(cleaned)
                    }
                })
                .catch(() => { })

            // Load VAT rate if available (fallback to default 0)
            fetch(`${API_BASE}/config/display/frontend`)
                .then(r => r.json().catch(() => ({})))
                .then(json => {
                    if (cancelled) return
                    const n = Number(json?.data?.business?.taxVatRate)
                    if (Number.isFinite(n)) setVatRate(n)
                })
                .catch(() => { })
        }

        loadAll()

        const offCfg = onConfigUpdated((e) => {
            const cat = e?.detail?.category
            if (!cat || cat === 'quotations' || cat === 'booking' || cat === 'business') loadAll()
        })
        const offMakes = onVehicleMakesUpdated(() => loadAll())

        return () => {
            cancelled = true
            offCfg()
            offMakes()
        }
    }, [])

    // Load models when make changes
    useEffect(() => {
        if (!form.vehicleMake || form.vehicleMake === 'Other') {
            setModels([])
            return
        }
        const makeObj = makes.find(m => m.name === form.vehicleMake)
        if (!makeObj) { setModels([]); return }
        publicGet(`/vehicle-makes/${makeObj.id}/models`)
            .then(data => setModels(Array.isArray(data) ? data : []))
            .catch(() => setModels([]))
    }, [form.vehicleMake, makes])

    useEffect(() => {
        if (prefillService?.name) {
            const match = fullCatalog.find(s => s.name === prefillService.name)
            if (match) setForm(f => ({ ...f, serviceId: match.code }))
        }
    }, [prefillService, fullCatalog])

    useEffect(() => {
        if (!prefillService?.category || form.serviceId || !fullCatalog.length) return
        const targetCategory = String(prefillService.category || '').toLowerCase()
        const match = fullCatalog.find((s) => {
            const normalizedCategory = normalizePortalServiceCategory(s.category, s.name).toLowerCase()
            return normalizedCategory === targetCategory
        })
        if (match?.code) {
            setForm((f) => ({ ...f, serviceId: match.code }))
        }
    }, [prefillService, form.serviceId, fullCatalog])

    useEffect(() => {
        if (!form.preferredDate) {
            if (form.endDate) {
                setForm(f => ({ ...f, endDate: null }))
            }
            if (endDateTouched) setEndDateTouched(false)
            return
        }

        const computedEndDate = computeQuotationEndDate(form.preferredDate, selectedServiceSchedule)
        if (!computedEndDate) return

        if (!endDateTouched || !form.endDate) {
            setForm(f => {
                const currentEndDate = f.endDate
                if (currentEndDate && currentEndDate.getTime() === computedEndDate.getTime()) {
                    return f
                }
                return { ...f, endDate: computedEndDate }
            })
        }
    }, [
        endDateTouched,
        form.endDate,
        form.preferredDate,
        selectedServiceSchedule?.totalDays,
        selectedServiceSchedule?.completionHour,
    ])

    const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

    const handleMakeChange = v => {
        setForm(f => ({ ...f, vehicleMake: v, customMake: '', vehicleModel: '', customModel: '' }))
        setError('')
        setModels([])
    }

    const handleModelChange = v => {
        setForm(f => ({ ...f, vehicleModel: v, customModel: '' }))
        setError('')
    }

    const handleMobileChange = e => {
        // Strict local mobile format: digits only, max 11 characters.
        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 11)
        set('mobile', cleaned)
    }

    const handleSubmit = async e => {
        e.preventDefault()
        setAttemptedSubmit(true)
        const finalBranch = form.branch === 'Other' ? form.customBranch.trim() : form.branch.trim()
        const finalMake = form.vehicleMake === 'Other' ? form.customMake.trim() : form.vehicleMake.trim()
        const finalModel = form.vehicleModel === 'Other' ? form.customModel.trim() : form.vehicleModel.trim()
        if (!finalBranch) return setError('Branch is required.')
        if (!form.fullName.trim()) return setError('Full name is required.')
        if (!form.mobile.trim()) return setError('Mobile number is required.')
        const mobileDigits = form.mobile.replace(/\D/g, '')
        if (mobileDigits.length !== 11) return setError('Mobile number must contain exactly 11 digits.')
        if (!finalMake) return setError('Vehicle make is required.')
        if (form.endDate && form.preferredDate && form.endDate < form.preferredDate) {
            return setError('Estimated end date must be after the preferred date.')
        }
        setLoading(true)
        try {
            const resp = await publicPost('/quotation-requests', {
                branch: finalBranch,
                fullName: form.fullName,
                mobile: mobileDigits,
                email: form.email,
                vehicleMake: finalMake,
                vehicleModel: finalModel || null,
                vehiclePlate: form.vehiclePlate || null,
                vehicleSize: form.vehicleSize || 'medium',
                serviceId: form.serviceId || null,
                unitPrice: selectedServicePrice || 0,
                preferredDate: form.preferredDate ? form.preferredDate.toISOString() : null,
                endDate: form.endDate ? form.endDate.toISOString() : null,
                notes: form.notes,
            })
            const qNo = String(resp?.quotation?.quotation_no || '').trim()
            setQuotationNo(qNo)
            setSuccess(true)
        } catch (err) {
            setError(err.message || 'Failed to submit. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const BLANK_FORM = {
        branch: '',
        customBranch: '',
        fullName: '',
        mobile: '',
        email: '',
        vehicleMake: '',
        vehicleModel: '',
        vehiclePlate: '',
        vehicleSize: 'medium',
        customMake: '',
        customModel: '',
        serviceId: '',
        preferredDate: null,
        endDate: null,
        notes: '',
    }

    if (success) {
        const trimmedEmail = String(form.email || '').trim()
        const finalBranch = form.branch === 'Other' ? String(form.customBranch || '').trim() : String(form.branch || '').trim()
        return (
            <div className="gp-success">
                <div className="gp-success-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
                <h3>Quotation Request Sent!</h3>
                <p>Our team will prepare your estimate and reach out within 24 hours.</p>
                {quotationNo && (
                    <div className="gp-success-ref">
                        Reference: <strong>{quotationNo}</strong>
                        {finalBranch && <div className="gp-success-ref-sub">Branch: {finalBranch}</div>}
                        <div className="gp-success-ref-sub">Keep this reference for follow-ups.</div>
                    </div>
                )}
                {trimmedEmail ? (
                    <p>
                        We also sent a confirmation email to <strong>{trimmedEmail}</strong>.
                        Please check your inbox (and spam/junk folder).
                    </p>
                ) : (
                    <p>
                        No email address was provided. We’ll contact you using your mobile number.
                    </p>
                )}
                {(form.preferredDate || form.endDate) && (
                    <p>
                        {form.preferredDate ? `Preferred date: ${formatPortalDateTime(form.preferredDate)}` : 'Preferred date: —'}
                        <br />
                        {form.endDate ? `Estimated end date: ${formatPortalDateTime(form.endDate)}` : 'Estimated end date: —'}
                    </p>
                )}
                <button
                    className="gp-submit-btn"
                    style={{ maxWidth: 200, margin: '0 auto' }}
                    onClick={() => {
                        setSuccess(false)
                        setQuotationNo('')
                        setAttemptedSubmit(false)
                        setError('')
                        setForm(BLANK_FORM)
                        setModels([])
                        setEndDateTouched(false)
                    }}
                >
                    Submit Another
                </button>
            </div>
        )
    }

    const showModelDropdown = form.vehicleMake && form.vehicleMake !== 'Other' && models.length > 0
    const showCustomMake = form.vehicleMake === 'Other'
    const showCustomModel = form.vehicleModel === 'Other'

    const showCustomBranch = form.branch === 'Other'

    const mobileDigits = String(form.mobile || '').replace(/\D/g, '')
    const invalidBranch = attemptedSubmit && !String(form.branch || '').trim()
    const invalidCustomBranch = attemptedSubmit && showCustomBranch && !String(form.customBranch || '').trim()
    const invalidFullName = attemptedSubmit && !form.fullName.trim()
    const invalidMobile = attemptedSubmit && (!form.mobile.trim() || mobileDigits.length !== 11)
    const invalidMake = attemptedSubmit && !String(form.vehicleMake || '').trim()
    const invalidCustomMake = attemptedSubmit && showCustomMake && !String(form.customMake || '').trim()
    const invalidEndDate = attemptedSubmit && form.endDate && form.preferredDate && form.endDate < form.preferredDate
    const invalidServiceId = attemptedSubmit && !form.serviceId

    return (
        <div className="gp-tab-content">
            <div className="gp-quote-intro">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <div>
                    <div className="gp-quote-intro-title">Request a Quotation</div>
                    <div className="gp-quote-intro-sub">Share your details and preferred service. We’ll respond with an estimate.</div>
                </div>
            </div>

            {error && <div className="gp-error">{error}</div>}

            <form className="gp-form" onSubmit={handleSubmit}>
                <div className="gp-form-section-label">Contact Information</div>
                {/* Contact info */}
                <div className="gp-form-row">
                    <div className="gp-field">
                        <label>Branch <span className="gp-req">*</span></label>
                        <GpSelect
                            value={form.branch}
                            onChange={v => {
                                set('branch', v)
                                if (v !== 'Other') set('customBranch', '')
                            }}
                            placeholder="— Select Branch —"
                            searchable
                            invalid={invalidBranch}
                            options={[
                                ...branches.map((b) => ({ value: b, label: b })),
                                { value: 'Other', label: 'Other / Not listed' },
                            ]}
                        />
                    </div>
                    <div className="gp-field">
                        <label>Full Name <span className="gp-req">*</span></label>
                        <input
                            value={form.fullName}
                            onChange={e => set('fullName', e.target.value)}
                            placeholder="Juan dela Cruz"
                            className={invalidFullName ? 'gp-invalid' : ''}
                            aria-invalid={invalidFullName ? 'true' : 'false'}
                            autoFocus
                        />
                    </div>
                    <div className="gp-field">
                        <label>Mobile Number <span className="gp-req">*</span></label>
                        <input
                            value={form.mobile}
                            onChange={handleMobileChange}
                            placeholder="e.g. 09171234567"
                            inputMode="numeric"
                            maxLength={11}
                            className={invalidMobile ? 'gp-invalid' : ''}
                            aria-invalid={invalidMobile ? 'true' : 'false'}
                        />
                    </div>
                </div>
                {showCustomBranch && (
                    <div className="gp-field" style={{ gridColumn: '1 / -1' }}>
                        <label>Specify Branch <span className="gp-req">*</span></label>
                        <input
                            value={form.customBranch}
                            onChange={e => set('customBranch', e.target.value)}
                            placeholder="Enter branch name"
                            className={invalidCustomBranch ? 'gp-invalid' : ''}
                            aria-invalid={invalidCustomBranch ? 'true' : 'false'}
                        />
                    </div>
                )}
                <div className="gp-form-row">
                    <div className="gp-field">
                        <label>Email Address</label>
                        <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                            placeholder="juan@email.com" />
                        <div className="gp-field-hint">
                            If you provide your email, you’ll receive a confirmation message after submitting.
                        </div>
                    </div>
                </div>

                {/* Vehicle section */}
                <div className="gp-form-section-label">Vehicle Information</div>
                <div className="gp-form-row">
                    <div className="gp-field">
                        <label>Plate Number / Conduction <span className="gp-field-hint-inline">(optional)</span></label>
                        <input
                            value={form.vehiclePlate}
                            onChange={e => set('vehiclePlate', e.target.value.toUpperCase())}
                            placeholder="ABC 1234"
                            maxLength={8}
                        />
                    </div>
                    <div className="gp-field">
                        <label>Make <span className="gp-req">*</span></label>
                        <GpSelect
                            value={form.vehicleMake}
                            onChange={handleMakeChange}
                            placeholder="— Select Make —"
                            searchable
                            invalid={invalidMake}
                            options={[
                                ...makes.map(m => ({ value: m.name, label: m.name })),
                                { value: 'Other', label: 'Other / Not listed' },
                            ]}
                        />
                    </div>
                </div>
                <div className="gp-form-row">
                    <div className="gp-field">
                        <label>Model</label>
                        {showModelDropdown ? (
                            <GpSelect
                                value={form.vehicleModel}
                                onChange={handleModelChange}
                                placeholder="— Select Model —"
                                searchable
                                options={[
                                    ...models.map(m => ({ value: m.name, label: m.name })),
                                    { value: 'Other', label: 'Other / Not listed' },
                                ]}
                            />
                        ) : (
                            <input value={form.vehicleModel} onChange={e => set('vehicleModel', e.target.value)}
                                placeholder={form.vehicleMake ? 'Type model name' : 'Select make first'}
                                disabled={!form.vehicleMake} />
                        )}
                    </div>
                </div>
                {showCustomMake && (
                    <div className="gp-field">
                        <label>Specify Make <span className="gp-req">*</span></label>
                        <input
                            value={form.customMake}
                            onChange={e => set('customMake', e.target.value)}
                            placeholder="Enter vehicle make"
                            className={invalidCustomMake ? 'gp-invalid' : ''}
                            aria-invalid={invalidCustomMake ? 'true' : 'false'}
                        />
                    </div>
                )}
                {showCustomModel && (
                    <div className="gp-field">
                        <label>Specify Model</label>
                        <input value={form.customModel} onChange={e => set('customModel', e.target.value)}
                            placeholder="Enter vehicle model" />
                    </div>
                )}
                <div className="gp-form-section-label">Services</div>
                <div className="gp-form-row">
                    <div className="gp-field">
                        <label>Vehicle Size</label>
                        <GpSelect
                            value={form.vehicleSize}
                            onChange={v => set('vehicleSize', v)}
                            placeholder="— Select Size —"
                            options={VEHICLE_SIZE_OPTIONS.map(s => ({
                                value: s.key,
                                label: s.label,
                            }))}
                        />
                    </div>
                    <div className="gp-field">
                        <label>Services <span className="gp-req">*</span></label>
                      <GpServicePicker
                        services={fullCatalog}
                        value={form.serviceId}
                            onChange={v => {
                                setEndDateTouched(false)
                                set('serviceId', v)
                            }}
                            vehicleSize={form.vehicleSize}
                            priceOverrides={priceOverrides}
                            invalid={invalidServiceId}
                        />
                    </div>
                </div>
                <div className="gp-form-section-label">Preferred Schedule</div>
                <div className="gp-form-row">
                    <div className="gp-field">
                        <label>Preferred Date &amp; Time</label>
                        <div className="gp-datepicker-wrap">
                            <DatePicker
                                selected={form.preferredDate}
                                onChange={date => {
                                    setEndDateTouched(false)
                                    setForm(f => ({ ...f, preferredDate: date }))
                                    setError('')
                                }}
                                showTimeSelect
                                timeIntervals={15}
                                timeCaption="Time"
                                dateFormat="MMMM d, yyyy  h:mm aa"
                                placeholderText="Pick a preferred date and time…"
                                minDate={minDate}
                                minTime={
                                    form.preferredDate && form.preferredDate.toDateString() === minDate.toDateString()
                                        ? minDate
                                        : new Date(new Date().setHours(7, 0, 0, 0))
                                }
                                maxTime={new Date(new Date().setHours(18, 0, 0, 0))}
                                className="gp-datepicker-input"
                                calendarClassName="gp-datepicker-cal"
                                popperPlacement="bottom-start"
                            />
                        </div>
                        <div className="gp-field-hint">
                            Optional. Share your preferred drop-off time so the team can plan around it.
                        </div>
                    </div>
                    <div className="gp-field">
                        <label>Estimated End Date &amp; Time</label>
                        <div className="gp-datepicker-wrap">
                            <DatePicker
                                selected={form.endDate}
                                onChange={date => {
                                    setEndDateTouched(true)
                                    setForm(f => ({ ...f, endDate: date }))
                                    setError('')
                                }}
                                showTimeSelect
                                timeIntervals={15}
                                timeCaption="Time"
                                dateFormat="MMMM d, yyyy  h:mm aa"
                                placeholderText="Auto-filled from service duration"
                                minDate={form.preferredDate || minDate}
                                minTime={
                                    form.endDate && form.preferredDate && form.endDate.toDateString() === form.preferredDate.toDateString()
                                        ? form.preferredDate
                                        : new Date(new Date().setHours(7, 0, 0, 0))
                                }
                                maxTime={new Date(new Date().setHours(18, 0, 0, 0))}
                                className="gp-datepicker-input"
                                calendarClassName="gp-datepicker-cal"
                                popperPlacement="bottom-start"
                                disabled={!form.preferredDate}
                            />
                        </div>
                        <div className="gp-field-hint">
                            {form.preferredDate && selectedService
                                ? `Auto-filled from ${selectedService.name} (${selectedServiceSchedule.totalDays} day service window).`
                                : 'Pick a preferred date first. You can still adjust the estimated end date manually.'}
                        </div>
                        {releaseDate && (
                            <div className="gp-field-hint">
                                Estimated release date: {formatPortalDateTime(releaseDate)}
                            </div>
                        )}
                        {invalidEndDate && <div className="gp-field-hint gp-invalid-hint">Estimated end date must be after the preferred date.</div>}
                    </div>
                </div>
                <div className="gp-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Special Notes / Questions</label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                        placeholder="Any specific questions, concerns, or details about your vehicle…"
                        rows={4}
                    />
                </div>
                <div className="gp-form-actions">
                    <button type="submit" className="gp-submit-btn" disabled={loading}>
                        {loading ? 'Submitting…' : 'Request Quotation'}
                        {!loading && (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                            </svg>
                        )}
                    </button>
                    <p className="gp-form-note">
                        No account required · Response within 24 hours
                    </p>
                    <p className="gp-form-note">
                        Payment: Bank Transfer | <span className="blue-hl">Credit Card (+3%)</span>
                    </p>
                </div>
            </form>
        </div>
    )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export function GuestPortalPage() {
    const [tab, setTab] = useState('services')
    const [quotePrefill, setQuotePrefill] = useState(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const tabParam = String(params.get('tab') || '').toLowerCase()
        const intentParam = String(params.get('intent') || '').toLowerCase()

        let intent = intentParam
        if (!intent) {
            try {
                intent = String(localStorage.getItem('ma_portal_landing_intent') || '').toLowerCase()
            } catch {
                intent = ''
            }
        }

        if (tabParam === 'quote') {
            setTab('quote')
        }

        if (intent === 'subscription') {
            setQuotePrefill({ category: 'Subscription Services' })
        } else if (intent === 'pms') {
            setQuotePrefill({ category: 'PMS Services' })
        }

        if (intentParam || intent) {
            try {
                localStorage.removeItem('ma_portal_landing_intent')
            } catch {
                // ignore localStorage failures
            }
        }
    }, [])

    const handleRequestQuote = (svc) => {
        setQuotePrefill(svc)
        setTab('quote')
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <div className="gp-root">
            {/* Header */}
            <header className="gp-header">
                <a href="/" className="gp-back">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Home
                </a>
                <div className="gp-header-brand">
                    <img src="/images/logo.png" alt="MasterAuto" className="gp-logo" />
                </div>
            </header>

            {/* Hero */}
            <div className="gp-hero">
                <div className="gp-hero-bg" style={{ backgroundImage: 'url(/images/background.jpg)' }} />
                <div className="gp-hero-dim" />
                <div className="gp-hero-content">
                    <p className="gp-hero-eye">Guest Access</p>
                    <h1 className="gp-hero-h1">Browse Services &amp; Get a Quote</h1>
                    <p className="gp-hero-sub">No account needed. Explore our services and request a free estimate.</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="gp-tabs-wrap">
                <div className="gp-tabs">
                    <button
                        className={`gp-tab${tab === 'services' ? ' active' : ''}`}
                        onClick={() => setTab('services')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        Services
                    </button>
                    <button
                        className={`gp-tab${tab === 'quote' ? ' active' : ''}`}
                        onClick={() => setTab('quote')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Quotation
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="gp-body">
                {tab === 'services'
                    ? <ServicesTab onRequestQuote={handleRequestQuote} />
                    : <QuotationTab prefillService={quotePrefill} />
                }
            </div>

            {/* Footer nudge */}
            <div className="gp-footer-nudge">
                <p>Want a smoother experience? Book, track, and pay online with your portal account.</p>
                <div className="gp-footer-btns">
                    <a href="/portal" className="gp-footer-btn-secondary">Sign In</a>
                    <button className="gp-footer-btn-primary" onClick={() => window.location.href = '/portal'}>
                        Create Free Account
                    </button>
                </div>
            </div>
        </div>
    )
}
