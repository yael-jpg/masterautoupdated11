import React, { useState, useRef, useEffect } from 'react'
import useVehicleRegistration from '../../hooks/useVehicleRegistration'
import { pushToast } from '../../api/client'
import './VehicleInputForm.css'

/**
 * Vehicle Registration Form Component
 * Implements cascading dropdowns: Make → Model → Variant
 * Uses relational database structure with IDs instead of free text
 */
const VehicleInputForm = ({ onSubmit, initialData = {}, customerId }) => {
  // Use custom hook for vehicle registration logic
  const registration = useVehicleRegistration(initialData)

  // UI state
  const [searchInput, setSearchInput] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter makes based on search input
  const filteredMakes = registration.makes.filter(
    m => m.name.toLowerCase().includes(searchInput.toLowerCase())
  )

  // Handle make selection
  const handleMakeSelect = (makeId) => {
    registration.setSelectedMakeId(makeId)
    setSearchInput('')
    setIsDropdownOpen(false)
    registration.setErrors((prev) => ({ ...prev, make: '' }))
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validate form
    if (!registration.validateForm()) {
      return
    }

    if (!customerId) {
      registration.setErrors((prev) => ({
        ...prev,
        submit: 'Customer ID is required',
      }))
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(false)

    try {
      const formData = {
        customerId,
        ...registration.prepareFormData(),
      }

      if (onSubmit) {
        const result = await onSubmit(formData)
        if (result?.success ?? true) {
          setSubmitSuccess(true)
          registration.clearForm()
          setTimeout(() => setSubmitSuccess(false), 3000)
        }
      }
    } catch (error) {
      setSubmitError(error.message || 'Failed to submit form')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="vehicle-form">
      <div className="form-section">
        <h3>Vehicle Information</h3>

        {/* Loading State */}
        {registration.makeLoading && (
          <div className="loading-message">Loading vehicle makes...</div>
        )}

        {/* Error Messages */}
        {registration.makeError && (
          <div className="error-message">⚠️ {registration.makeError}</div>
        )}
        {submitError && <div className="error-message">⚠️ {submitError}</div>}
        {submitSuccess && (
          <div className="success-message">✅ Vehicle registered successfully!</div>
        )}

        {/* Vehicle Make Field */}
        <div className={`form-group ${registration.errors.make ? 'error' : ''}`}>
          <label className="form-label">
            Vehicle Make <span className="required">*</span>
          </label>
          {registration.makes && registration.makes.length > 0 ? (
            <div className="make-input-container">
              <select
                className="form-input"
                value={registration.selectedMakeId || (registration.customMake ? '__other__' : '')}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '__other__') {
                    registration.setSelectedMakeId(null)
                  } else {
                    registration.setSelectedMakeId(parseInt(v) || null)
                    registration.setCustomMake('')
                  }
                }}
              >
                <option value="">-- Select Make --</option>
                {registration.makes.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.category ? ` (${m.category})` : ''}</option>
                ))}
                <option value="__other__">Other (specify)</option>
              </select>
            </div>
          ) : (
            <div className="make-input-container" ref={dropdownRef}>
              <div className="make-search-wrapper">
                <input
                  type="text"
                  placeholder="Search make..."
                  value={isDropdownOpen ? searchInput : registration.selectedMake?.name || ''}
                  onChange={(e) => {
                    setSearchInput(e.target.value)
                    setIsDropdownOpen(true)
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="make-search-input"
                />
                <span className="search-icon">🔍</span>
              </div>

              {/* Dropdown List */}
              {isDropdownOpen && (
                <div className="make-dropdown-list">
                  {filteredMakes.length > 0 ? (
                    filteredMakes.map((make) => (
                      <div
                        key={make.id}
                        className={`make-option ${
                          registration.selectedMakeId === make.id ? 'selected' : ''
                        }`}
                        onClick={() => handleMakeSelect(make.id)}
                      >
                        <div className="make-option-content">
                          <div className="make-info">
                            <div className="make-name">{make.name}</div>
                            <div className="make-category">{make.category}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="make-option disabled">No matches found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {registration.selectedMakeId && registration.selectedMake && (
            <div className="selected-make-badge">
              <span>{registration.selectedMake.name}</span>
              <button
                type="button"
                className="clear-selection"
                onClick={() => {
                  registration.setSelectedMakeId(null)
                  setSearchInput('')
                }}
              >
                ✕
              </button>
            </div>
          )}

          {registration.errors.make && (
            <div className="error-message">{registration.errors.make}</div>
          )}
        </div>

        {/* Custom Make Field */}
        {!registration.selectedMakeId && (
          <div className={`form-group ${registration.errors.customMake ? 'error' : ''}`}>
            <label className="form-label">
              Specify Vehicle Brand <span className="required">*</span>
            </label>
            <div className="add-brand-row">
              <input
                type="text"
                value={registration.customMake}
                onChange={(e) => registration.setCustomMake(e.target.value)}
                placeholder="Enter brand name"
                className="form-input"
              />
              <button
                type="button"
                className="btn btn-secondary add-brand-btn"
                onClick={async () => {
                  if (!registration.customMake) return
                  try {
                    // createMake will select the new make
                    const newMake = await registration.createMake(registration.customMake)
                    pushToast('success', `Brand "${newMake.name}" added and selected`)
                  } catch (err) {
                    setSubmitError(err.message || 'Failed to add brand')
                  }
                }}
                disabled={registration.makeLoading || !registration.customMake}
              >
                {registration.makeLoading ? 'Adding…' : 'Add Brand'}
              </button>
            </div>
            {registration.errors.customMake && (
              <div className="error-message">{registration.errors.customMake}</div>
            )}
          </div>
        )}

        {/* Vehicle Model Field */}
        <div className={`form-group ${registration.errors.model ? 'error' : ''}`}>
          <label className="form-label">
            Vehicle Model <span className="required">*</span>
          </label>

          {registration.modelLoading && <div className="loading-message">Loading models...</div>}
          {registration.modelError && (
            <div className="error-message">⚠️ {registration.modelError}</div>
          )}

          {registration.models.length > 0 && registration.selectedMakeId ? (
            <select
              value={registration.selectedModelId || ''}
              onChange={(e) => registration.setSelectedModelId(parseInt(e.target.value) || null)}
              className="form-input"
            >
              <option value="">-- Select Model --</option>
              {registration.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.year_from ? `(${m.year_from}-${m.year_to || 'Present'})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={registration.customModel}
              onChange={(e) => registration.setCustomModel(e.target.value)}
              placeholder={registration.selectedMakeId ? 'No models available' : 'Select make first'}
              className="form-input"
              disabled={!registration.selectedMakeId}
            />
          )}

          {registration.errors.model && (
            <div className="error-message">{registration.errors.model}</div>
          )}
        </div>

        {/* Vehicle Variant Field (Optional) */}
        {registration.selectedModelId && (
          <div className="form-group">
            <label className="form-label">Vehicle Variant (Optional)</label>

            {registration.variantLoading && <div className="loading-message">Loading variants...</div>}
            {registration.variantError && (
              <div className="error-message">⚠️ {registration.variantError}</div>
            )}

            {registration.variants.length > 0 ? (
              <select
                value={registration.selectedVariantId || ''}
                onChange={(e) =>
                  registration.setSelectedVariantId(parseInt(e.target.value) || null)
                }
                className="form-input"
              >
                <option value="">-- Select Variant --</option>
                {registration.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.body_type ? `(${v.body_type}` : ''}
                    {v.fuel_type ? `, ${v.fuel_type}` : ''}
                    {v.transmission ? `, ${v.transmission})` : ')'}
                  </option>
                ))}
              </select>
            ) : (
              <div className="form-hint">No variants available for this model</div>
            )}
          </div>
        )}

        {/* Plate Number Field */}
        <div className={`form-group ${registration.errors.plateNumber ? 'error' : ''}`}>
          <label className="form-label">
            Plate Number <span className="required">*</span>
          </label>
          <div className="plate-input-wrapper">
            <input
              type="text"
              value={registration.plateNumber}
              onChange={(e) => {
                let value = e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '')
                registration.setPlateNumber(value)
              }}
              placeholder="XX1234XXX (e.g., AB1234ABC)"
              className="form-input plate-input"
              maxLength="15"
            />
            {registration.plateNumber && (
              <div className="plate-preview">{registration.plateNumber}</div>
            )}
          </div>
          <div className="form-helper">Format: 2 letters + 4 numbers + 3 letters</div>
          {registration.errors.plateNumber && (
            <div className="error-message">{registration.errors.plateNumber}</div>
          )}
        </div>

        {/* Two Column Row */}
        <div className="form-row">
          {/* Year Field */}
          <div className="form-group">
            <label className="form-label">Year</label>
            {registration.years && registration.years.length > 0 ? (
              <select
                value={registration.year || ''}
                onChange={(e) => registration.setYear(parseInt(e.target.value))}
                className="form-input"
                disabled={registration.yearLoading}
              >
                {registration.years.map((y) => (
                  <option key={y.id} value={y.year_model}>
                    {y.year_model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                value={registration.year || ''}
                onChange={(e) => registration.setYear(parseInt(e.target.value))}
                min="1950"
                max={new Date().getFullYear() + 1}
                placeholder="e.g., 2023"
                className="form-input"
              />
            )}
            {registration.errors.year && (
              <div className="error-message">{registration.errors.year}</div>
            )}
          </div>

          {/* Color Field */}
          <div className="form-group">
            <label className="form-label">Color</label>
            <input
              type="text"
              value={registration.color}
              onChange={(e) => registration.setColor(e.target.value)}
              placeholder="e.g., Black, White"
              className="form-input"
            />
          </div>
        </div>

        {/* Three Column Row */}
        <div className="form-row">
          {/* Body Type */}
          <div className="form-group">
            <label className="form-label">Body Type</label>
            <select
              value={registration.bodyType}
              onChange={(e) => registration.setBodyType(e.target.value)}
              className="form-input"
            >
              <option value="">-- Select --</option>
              <option value="Sedan">Sedan</option>
              <option value="SUV">SUV</option>
              <option value="Hatchback">Hatchback</option>
              <option value="Truck">Truck</option>
              <option value="Van">Van</option>
              <option value="Coupe">Coupe</option>
              <option value="Wagon">Wagon</option>
            </select>
          </div>

          {/* Fuel Type */}
          <div className="form-group">
            <label className="form-label">Fuel Type</label>
            <select
              value={registration.fuelType}
              onChange={(e) => registration.setFuelType(e.target.value)}
              className="form-input"
            >
              <option value="">-- Select --</option>
              <option value="Gasoline">Gasoline</option>
              <option value="Diesel">Diesel</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Electric">Electric</option>
              <option value="LPG">LPG</option>
            </select>
          </div>

          {/* Transmission */}
          <div className="form-group">
            <label className="form-label">Transmission</label>
            <select
              value={registration.transmission}
              onChange={(e) => registration.setTransmission(e.target.value)}
              className="form-input"
            >
              <option value="">-- Select --</option>
              <option value="Manual">Manual</option>
              <option value="Automatic">Automatic</option>
              <option value="CVT">CVT</option>
            </select>
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? '⏳ Saving...' : '💾 Save Vehicle'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              registration.clearForm()
              setSearchInput('')
              setIsDropdownOpen(false)
              setSubmitSuccess(false)
              setSubmitError(null)
            }}
          >
            🔄 Clear Form
          </button>
        </div>
      </div>
    </form>
  )
}

export default VehicleInputForm
