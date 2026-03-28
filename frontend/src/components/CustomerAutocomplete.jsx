/**
 * CustomerAutocomplete
 * Server-side searchable customer picker with debounce, vehicle count,
 * and "+ Add New Customer" inline creation.
 *
 * Props:
 *   value        – selected customer id (string/number)
 *   initialLabel – display name when value is pre-set (edit mode)
 *   onChange     – ({ id, full_name, mobile, vehicle_count }) => void
 *   onAddNew     – (newCustomer) => void  called after quick-creation
 *   token        – auth token
 *   disabled     – boolean
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { apiGet, apiPost } from '../api/client'
import { normalizeEmailClient } from '../utils/validationClient'
import './CustomerAutocomplete.css'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300
const LIMIT = 15

export function CustomerAutocomplete({
  value = '',
  initialLabel = '',
  onChange,
  onAddNew,
  token,
  disabled = false,
}) {
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState([])
  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(initialLabel || '')
  const [showAddForm, setShowAddForm]     = useState(false)

  // Quick-add form state
  const [newCust, setNewCust] = useState({ full_name: '', mobile: '', email: '' })
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const wrapRef   = useRef(null)
  const inputRef  = useRef(null)
  const timerRef  = useRef(null)

  // When value changes externally (edit mode pre-fill), update label
  useEffect(() => {
    if (!value) {
      setSelectedLabel('')
      return
    }
    if (initialLabel) {
      setSelectedLabel(initialLabel)
      return
    }
    // No label but value is set — fetch the customer name (e.g. preselected from CRM)
    let cancelled = false
    apiGet(`/customers/${value}`, token)
      .then((c) => {
        if (!cancelled && c?.full_name) {
          setSelectedLabel(`${c.full_name} — ${c.mobile || ''}`)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [value, initialLabel])

  // Close on outside click
  useEffect(() => {
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setShowAddForm(false)
        // If user typed but didn't pick, restore selected label
        if (value) setQuery('')
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [value])

  const doSearch = useCallback(async (q) => {
    if (q.length < MIN_CHARS) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const res = await apiGet('/customers', token, { search: q, limit: LIMIT, page: 1 })
      setResults(res.data || [])
      setOpen(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [token])

  function handleInput(e) {
    const q = e.target.value
    setQuery(q)
    // Clear selection if user edits
    if (value) {
      onChange(null)
      setSelectedLabel('')
    }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSearch(q), DEBOUNCE_MS)
  }

  function handleSelect(customer) {
    onChange(customer)
    setSelectedLabel(`${customer.full_name} — ${customer.mobile}`)
    setQuery('')
    setResults([])
    setOpen(false)
    setShowAddForm(false)
  }

  function handleClear() {
    onChange(null)
    setSelectedLabel('')
    setQuery('')
    setResults([])
    setOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Quick-add customer
  async function handleAddSubmit(e) {
    e.preventDefault()
    if (!newCust.full_name.trim()) { setAddError('Name is required'); return }
    if (!newCust.mobile.trim())    { setAddError('Mobile is required'); return }
    setAddLoading(true)
    setAddError('')
    try {
      const created = await apiPost('/customers', token, {
        fullName:    newCust.full_name.trim(),
        mobile:      newCust.mobile.trim(),
        email:       newCust.email.trim() || undefined,
        customerType: 'Individual',
      })
      const customer = { ...created, vehicle_count: 0 }
      handleSelect(customer)
      setNewCust({ full_name: '', mobile: '', email: '' })
      setShowAddForm(false)
      if (onAddNew) onAddNew(customer)
    } catch (err) {
      setAddError(err.message || 'Failed to create customer')
    } finally {
      setAddLoading(false)
    }
  }

  const isSelected = !!value && !!selectedLabel

  return (
    <div className="cac-wrap" ref={wrapRef}>
      {/* Input */}
      <div className={`cac-input-row ${disabled ? 'cac-disabled' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          className="cac-input"
          placeholder={isSelected ? '' : 'Type name or mobile…'}
          value={isSelected ? selectedLabel : query}
          onChange={handleInput}
          onFocus={() => {
            if (isSelected) return
            if (query.length >= MIN_CHARS) setOpen(true)
          }}
          disabled={disabled}
          autoComplete="off"
        />
        {loading && <span className="cac-spinner" />}
        {isSelected && !disabled && (
          <button type="button" className="cac-clear" onClick={handleClear} title="Clear selection">✕</button>
        )}
      </div>

      {/* Dropdown */}
      {open && !isSelected && (
        <div className="cac-dropdown">
          {results.length === 0 && !loading && (
            <div className="cac-empty">No customers found for "{query}"</div>
          )}

          {results.map((c) => (
            <div
              key={c.id}
              className="cac-option"
              onMouseDown={() => handleSelect(c)}
            >
              <span className="cac-opt-name">{c.full_name}</span>
              <span className="cac-opt-meta">
                <span>📱 {c.mobile}</span>
                {c.vehicle_count > 0 && (
                  <span>🚗 {c.vehicle_count} vehicle{c.vehicle_count !== 1 ? 's' : ''}</span>
                )}
              </span>
            </div>
          ))}

          {/* Add New Customer */}
          {!showAddForm && (
            <div
              className="cac-add-btn"
              onMouseDown={(e) => { e.preventDefault(); setShowAddForm(true); setOpen(false) }}
            >
              ➕ Add New Customer
            </div>
          )}
        </div>
      )}

      {/* Quick-add form */}
      {showAddForm && (
        <div className="cac-add-form">
          <div className="cac-add-title">New Customer</div>
          {addError && <div className="cac-add-error">{addError}</div>}
          <input
            className="cac-add-input"
            type="text"
            placeholder="Full Name *"
            value={newCust.full_name}
            onChange={(e) => setNewCust((p) => ({ ...p, full_name: e.target.value }))}
            autoFocus
          />
          <input
            className="cac-add-input"
            type="text"
            placeholder="Mobile Number *"
            value={newCust.mobile}
            onChange={(e) => setNewCust((p) => ({ ...p, mobile: e.target.value }))}
          />
          <input
            className="cac-add-input"
            type="email"
            placeholder="Email (optional)"
            value={newCust.email}
            onChange={(e) => setNewCust((p) => ({ ...p, email: normalizeEmailClient(e.target.value) }))}
          />
          <div className="cac-add-actions">
            <button
              type="button"
              className="cac-add-cancel"
              onClick={() => { setShowAddForm(false); setAddError(''); setNewCust({ full_name: '', mobile: '', email: '' }) }}
              disabled={addLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cac-add-save"
              onClick={handleAddSubmit}
              disabled={addLoading}
            >
              {addLoading ? 'Saving…' : 'Save & Select'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
