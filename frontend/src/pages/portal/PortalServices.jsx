import { useEffect, useState } from 'react'
import { portalGet } from '../../api/portalClient'
import { getServiceProcess } from '../../components/ServiceProcess'


const SIZE_ORDER = [
  'Small Bike', 'Big Bike',
  'X Small', 'Small', 'Medium', 'Large', 'X Large', 'XX Large',
]

const DEFAULT_SERVICE_SIZES = ['X Small', 'Small', 'Medium', 'Large', 'X Large', 'XX Large']


const CATEGORY_ICONS = {
  'Car Wash Services': (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l1-4h16l1 4"/><rect x="2" y="12" width="20" height="6" rx="2"/>
      <circle cx="7" cy="21" r="1"/><circle cx="17" cy="21" r="1"/>
    </svg>
  ),
  'Detailing Services': (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
  ),
  'Coating Services': (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  'Other Services': (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
}

const DEFAULT_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)


const NEUTRAL_TIER = {
  bg: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.16)',
  text: '#e2e8f2',
}

function getTierColor(baseName) {
  void baseName
  return NEUTRAL_TIER
}


function parseName(name) {
  const idx = name.lastIndexOf(' - ')
  if (idx === -1) return { base: name, size: null }
  const size = name.slice(idx + 3)
  return SIZE_ORDER.includes(size)
    ? { base: name.slice(0, idx), size }
    : { base: name, size: null }
}

function durLabel(mins) {
  if (!mins) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}


function ServiceGroup({ baseName, variants, description, materialsNotes, onBook }) {
  const [open, setOpen] = useState(false)
  const tc = getTierColor(baseName)

  const sorted = [...variants].sort(
    (a, b) => SIZE_ORDER.indexOf(a.size ?? '') - SIZE_ORDER.indexOf(b.size ?? ''),
  )
  const hasSizes = sorted.some((v) => v.size)
  const baseFallback = Number(sorted[0]?.base_price || 0)

  const sizeCardVariants = (() => {
    const bySize = new Map()
    sorted.forEach((v) => {
      if (v.size) bySize.set(v.size, v)
    })

    if (bySize.size === 0) {
      return DEFAULT_SERVICE_SIZES.map((sizeLabel) => ({
        ...sorted[0],
        size: sizeLabel,
        base_price: baseFallback,
        isFallback: true,
      }))
    }

    const merged = []
    DEFAULT_SERVICE_SIZES.forEach((sizeLabel) => {
      const found = bySize.get(sizeLabel)
      if (found) {
        merged.push({ ...found, isFallback: false })
      } else {
        merged.push({
          ...sorted[0],
          size: sizeLabel,
          base_price: baseFallback,
          isFallback: true,
        })
      }
    })
    return merged
  })()

  const sizeLabels = sizeCardVariants.map((v) => v.size).filter(Boolean)
  const maxPrice = Math.max(...sizeCardVariants.map((v) => Number(v.base_price)))
  const priceStr = `₱${maxPrice.toLocaleString()}`

  return (
    <div
      className={`portal-svc-group${open ? ' portal-svc-group--open' : ''}`}
      style={{
        '--tier-bg': tc.bg,
        '--tier-border': tc.border,
        '--tier-text': tc.text,
      }}
    >
      {}
      <div
        className="portal-svc-group-head"
        onClick={() => setOpen((o) => !o)}
      >
        {}
        <div className="portal-svc-group-accent" />

        {}
        <div className="portal-svc-group-main">
          <div className="portal-svc-group-name">
            {baseName}
          </div>
          {description && (
            <div className="portal-svc-group-desc">
              {description}
            </div>
          )}
          {sizeLabels.length > 0 && (
            <div className="portal-svc-group-size-row" aria-label="Available sizes">
              {sizeLabels.map((size) => (
                <span key={size} className="portal-svc-group-size-chip">
                  {size}
                </span>
              ))}
            </div>
          )}
        </div>

        {}
        <div className="portal-svc-group-right">
          <div className="portal-svc-group-price">
            {priceStr}
          </div>
          <div className="portal-svc-group-meta">
            {hasSizes && (
              <span className="portal-svc-group-sizes">
                {sorted.length} sizes
              </span>
            )}
            <span className="portal-svc-group-view">
              {open
                ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              }
              {open ? 'Close' : 'View'}
            </span>
          </div>
        </div>
      </div>

      {}
      {open && (
        <div
          className="portal-svc-group-body"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="portal-svc-size-grid">
            {sizeCardVariants.map((v, idx) => (
              <div
                key={`${v.id}-${v.size}-${idx}`}
                onClick={() => onBook && onBook(String(v.id))}
                className="portal-svc-size-card"
              >
                <div className="portal-svc-size-lbl">
                  {v.size}
                </div>
                <div className="portal-svc-size-price">
                  ₱{Number(v.base_price).toLocaleString()}
                </div>
                {v.default_duration_minutes && (
                  <div className="portal-svc-size-dur">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {durLabel(v.default_duration_minutes)}
                  </div>
                )}
                {v.isFallback && hasSizes && (
                  <div className="portal-svc-size-dur">Fallback price</div>
                )}
              </div>
            ))}
          </div>

          {getServiceProcess(baseName)}

          {materialsNotes && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6, letterSpacing: '0.04em' }}>
                MATERIALS / PRODUCTS USED
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.45 }}>
                {materialsNotes}
              </div>
            </div>
          )}

          <button
            onClick={() => onBook && onBook(String(sorted[0]?.id))}
            className="portal-svc-book-btn"
          >
            Request Schedule →
          </button>
        </div>
      )}
    </div>
  )
}

export function PortalServices({ onBook }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  useEffect(() => {
    let stopped = false

    const load = async (isInitial = false) => {
      if (isInitial) setLoading(true)
      try {
        const rows = await portalGet('/services')
        if (stopped) return
        setServices(Array.isArray(rows) ? rows : [])
      } catch (_) {
        // Silent
      } finally {
        if (!stopped && isInitial) setLoading(false)
      }
    }

    load(true)

    const intervalMs = 20000
    const id = setInterval(() => load(false), intervalMs)

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [])

  const categories = ['All', ...new Set(services.map((s) => s.category))]

  const filtered = services.filter((s) => {
    const matchCat = activeCategory === 'All' || s.category === activeCategory
    if (!matchCat) return false
    const q = search.toLowerCase()
    return (
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.materials_notes || '').toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    )
  })

  const structure = filtered.reduce((acc, svc) => {
    const { base, size } = parseName(svc.name)
    if (!acc[svc.category]) acc[svc.category] = {}
    if (!acc[svc.category][base]) {
      acc[svc.category][base] = { variants: [], description: null, materialsNotes: null }
    }
    acc[svc.category][base].variants.push({ ...svc, size })
    if (svc.description && !acc[svc.category][base].description) {
      acc[svc.category][base].description = svc.description
    }
    if (svc.materials_notes && !acc[svc.category][base].materialsNotes) {
      acc[svc.category][base].materialsNotes = svc.materials_notes
    }
    return acc
  }, {})

  const totalGroups = Object.values(structure).reduce(
    (n, g) => n + Object.keys(g).length,
    0,
  )

  if (loading) {
    return (
      <div className="portal-loading">
        Loading services…
      </div>
    )
  }

  return (
    <>
      {}
      <div className="portal-hero">
        <div className="portal-hero-row">
          <div>
            <h2>Services Menu</h2>
            <p className="portal-svc-hero-sub">
              {totalGroups} services · {Object.keys(structure).length} categories —{' '}
              <span className="portal-svc-hero-tip">tap any row to see sizes &amp; pricing</span>
            </p>
          </div>
          <button
            className="portal-action-btn"
            onClick={() => onBook && onBook()}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Request Schedule
          </button>
        </div>
      </div>

      {}
      <input
        type="text"
        placeholder="Search services — e.g. ceramic, detailing, wash, headlight…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="portal-control portal-control--full portal-search-input"
      />

      {}
      <div className="portal-svc-catbar">
        {categories.map((cat) => {
          const active = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`portal-svc-cat${active ? ' portal-svc-cat--active' : ''}`}
            >
              {cat !== 'All' && (
                <span className="portal-svc-cat-icon">
                  {CATEGORY_ICONS[cat] || DEFAULT_ICON}
                </span>
              )}
              {cat}
            </button>
          )
        })}
      </div>

      {}
      {Object.keys(structure).length === 0 ? (
        <div className="portal-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <p>No services found{search ? ` for "${search}"` : ''}.</p>
        </div>
      ) : (
        Object.entries(structure).map(([category, groups]) => (
          <div key={category} className="portal-svc-section">
            {}
            <div className="portal-svc-section-head">
              <span className="portal-svc-section-icon">
                {CATEGORY_ICONS[category] || DEFAULT_ICON}
              </span>
              <span className="portal-svc-section-name">
                {category}
              </span>
              <span className="portal-svc-section-count">
                {Object.keys(groups).length} service{Object.keys(groups).length !== 1 ? 's' : ''}
              </span>
            </div>

            {Object.entries(groups).map(([baseName, { variants, description, materialsNotes }]) => (
              <ServiceGroup
                key={baseName}
                baseName={baseName}
                variants={variants}
                description={description}
                materialsNotes={materialsNotes}
                onBook={onBook}
              />
            ))}
          </div>
        ))
      )}
    </>
  )
}

