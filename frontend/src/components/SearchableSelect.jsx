import { useEffect, useRef, useState } from 'react'

/**
 * SearchableSelect — a premium autocomplete dropdown.
 *
 * Props:
 *   options      – [{ value, label, category? }]
 *   value        – current selected value (string)
 *   onChange      – (value: string) => void
 *   placeholder  – input placeholder text
 *   disabled     – boolean
 *   required     – boolean
 *   grouped      – if true, group options by `category`
 */
export function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Search…',
  disabled = false,
  required = false,
  grouped = false,
  allowCustomValue = false,
  customValueText = (q) => `Use "${q}"`,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [highlightFromKeyboard, setHighlightFromKeyboard] = useState(false)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  // Support single or multi-select: if `value` is an array treat as multi
  const isMulti = Array.isArray(value)
  // Derive display label from current value
  const selectedOption = isMulti ? null : options.find((o) => o.value === value)
  const displayLabel = isMulti
    ? (value.length > 0 ? `${value.length} service${value.length !== 1 ? 's' : ''} selected` : '')
    : (selectedOption?.label || (value ? String(value) : ''))

  // Filter options
  const q = query.toLowerCase()
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.category || '').toLowerCase().includes(q))
    : options

  // Group if requested
  const groups = grouped
    ? [...new Set(filtered.map((o) => o.category || 'Other'))].map((cat) => ({
        category: cat,
        items: filtered.filter((o) => (o.category || 'Other') === cat),
      }))
    : [{ category: null, items: filtered }]

  // Flat list for keyboard nav
  const flatFiltered = groups.flatMap((g) => g.items)

  const queryTrimmed = String(query || '').trim()
  const canUseCustomValue = allowCustomValue && !disabled && !isMulti && queryTrimmed.length > 0
  const hasExactMatch = canUseCustomValue
    ? flatFiltered.some((o) => String(o.value).toLowerCase() === queryTrimmed.toLowerCase() || String(o.label).toLowerCase() === queryTrimmed.toLowerCase())
    : false
  const showCustomValueOption = canUseCustomValue && !hasExactMatch

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        if (showCustomValueOption && (!value || String(value).trim() === '')) {
          onChange(queryTrimmed)
        }
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onChange, queryTrimmed, showCustomValueOption, value])

  // Scroll highlighted into view — only for keyboard navigation, not mouse hover
  useEffect(() => {
    if (highlightFromKeyboard && highlightIdx >= 0 && listRef.current) {
      const el = listRef.current.children[highlightIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIdx, highlightFromKeyboard])

  function handleSelect(optionValue) {
    if (isMulti) {
      // toggle in array
      const current = Array.isArray(value) ? [...value] : []
      const idx = current.indexOf(optionValue)
      if (idx === -1) current.push(optionValue)
      else current.splice(idx, 1)
      onChange(current)
      // keep dropdown open for multi-select
      setQuery('')
      setHighlightIdx(-1)
      return
    }
    onChange(optionValue)
    setOpen(false)
    setQuery('')
    setHighlightIdx(-1)
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightFromKeyboard(true)
      setHighlightIdx((i) => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightFromKeyboard(true)
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && flatFiltered[highlightIdx]) {
        handleSelect(flatFiltered[highlightIdx].value)
      } else if (showCustomValueOption) {
        handleSelect(queryTrimmed)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className={`searchable-select${open ? ' open' : ''}`} ref={wrapRef}>
      <div
        className="searchable-select-trigger"
        onClick={() => {
          if (!disabled) {
            setOpen(true)
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0)
          }
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            className="searchable-select-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setHighlightFromKeyboard(false)
              setHighlightIdx(allowCustomValue ? -1 : 0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={false}
            onFocus={(e) => e.target.focus({ preventScroll: true })}
          />
        ) : (
          <span className={`searchable-select-value${!value ? ' placeholder' : ''}`}>
            {displayLabel || placeholder}
          </span>
        )}
        <svg className="searchable-select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div className="searchable-select-dropdown">
          {showCustomValueOption && (
            <div
              className={`searchable-select-option${highlightIdx === 0 && highlightFromKeyboard ? ' highlighted' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(queryTrimmed)
              }}
              onMouseEnter={() => {
                setHighlightFromKeyboard(false)
                setHighlightIdx(-1)
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 600 }}>{customValueText(queryTrimmed)}</div>
                  <div style={{ fontSize: '0.82rem', color: 'rgba(189,200,218,0.55)', marginTop: '2px' }}>Not in the list</div>
                </div>
              </div>
            </div>
          )}

          {flatFiltered.length === 0 && !showCustomValueOption ? (
            <div className="searchable-select-empty">No matches found</div>
          ) : grouped ? (
            <div ref={listRef}>
              {groups.filter((g) => g.items.length > 0).map((group) => (
                <div key={group.category}>
                  <div className="searchable-select-group-label">{group.category}</div>
                  {group.items.map((opt) => {
                    const flatIdx = flatFiltered.indexOf(opt)
                    const isSelected = isMulti ? (Array.isArray(value) && value.includes(opt.value)) : (opt.value === value)
                    return (
                      <div
                        key={opt.value}
                        className={`searchable-select-option${isSelected ? ' selected' : ''}${flatIdx === highlightIdx ? ' highlighted' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleSelect(opt.value)
                        }}
                        onMouseEnter={() => {
                            setHighlightFromKeyboard(false)
                            setHighlightIdx(flatIdx)
                          }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontWeight: 600 }}>{opt.label}</div>
                            {opt.description ? <div style={{ fontSize: '0.82rem', color: 'rgba(189,200,218,0.55)', marginTop: '2px' }}>{opt.description}</div> : null}
                          </div>
                          {opt.badge ? (
                            <span className="service-badge">{opt.badge}</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              {/* Footer for multi-select: show count and Clear all */}
              {isMulti && (
                <div className="searchable-select-footer">
                  <div className="footer-left">{(Array.isArray(value) ? value.length : 0)} service{(Array.isArray(value) && value.length) !== 1 ? 's' : ''} selected</div>
                  <button type="button" className="btn-link" onMouseDown={(e) => { e.preventDefault(); onChange([]) }}>Clear all</button>
                </div>
              )}
            </div>
          ) : (
            <div ref={listRef}>
              {flatFiltered.map((opt, idx) => (
                <div
                  key={opt.value}
                  className={`searchable-select-option${opt.value === value ? ' selected' : ''}${idx === highlightIdx ? ' highlighted' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(opt.value)
                  }}
                  onMouseEnter={() => {
                    setHighlightFromKeyboard(false)
                    setHighlightIdx(idx)
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontWeight: 600 }}>{opt.label}</div>
                      {opt.description ? <div style={{ fontSize: '0.82rem', color: 'rgba(189,200,218,0.55)', marginTop: '2px' }}>{opt.description}</div> : null}
                    </div>
                    {opt.badge ? (
                      <span className="service-badge">{opt.badge}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hidden native input for form required validation */}
      {required && (
        <input
          tabIndex={-1}
          value={value}
          required
          onChange={() => {}}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}
