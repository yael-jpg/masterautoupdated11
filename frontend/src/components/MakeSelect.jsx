import React, { useState, useMemo } from 'react'
import { VEHICLE_MAKES } from '../data/vehicleMakes'
import './MakeSelect.css'

export default function MakeSelect({ value, onChange, onCustomChange, placeholder = 'Select make…' }) {
  const [query, setQuery] = useState('')
  const [showOther, setShowOther] = useState(false)

  const grouped = useMemo(() => {
    const map = {}
    VEHICLE_MAKES.forEach((m) => {
      map[m.category] = map[m.category] || []
      map[m.category].push(m)
    })
    return map
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return VEHICLE_MAKES
    return VEHICLE_MAKES.filter((m) => m.name.toLowerCase().includes(q))
  }, [query])

  function handleSelect(make) {
    if (make.name === 'Other (Specify)') {
      setShowOther(true)
      onChange(null)
      onCustomChange('')
    } else {
      setShowOther(false)
      onChange(make.name)
      onCustomChange(null)
    }
  }

  return (
    <div className="make-select">
      <div className="make-select-search">
        <input
          type="text"
          className="make-select-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search vehicle makes"
        />
      </div>

      <div className="make-select-list" role="listbox">
        {Object.keys(grouped).map((cat) => (
          <div key={cat} className="make-select-group">
            <div className="make-select-group-title">{cat}</div>
            {grouped[cat]
              .filter((m) => filtered.includes(m))
              .map((m) => (
                <button key={m.name} type="button" className="make-select-item" onClick={() => handleSelect(m)}>
                  <span className="make-select-name">{m.name}</span>
                </button>
              ))}
          </div>
        ))}
      </div>

      {showOther && (
        <div className="make-select-other">
          <label className="settings-field-label">Specify make</label>
          <input
            type="text"
            className="settings-input"
            placeholder="Enter custom make"
            onChange={(e) => onCustomChange(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
