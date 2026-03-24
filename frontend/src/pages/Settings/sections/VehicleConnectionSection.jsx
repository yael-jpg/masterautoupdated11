import React, { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiDelete, pushToast } from '../../../api/client'
import './VehicleConnectionSection.css'

/**
 * Vehicle Connection Settings Section
 * Manages vehicle-to-service and vehicle-to-customer relationships
 */
export function VehicleConnectionSection({ token, user }) {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    vehicleId: '',
    customerId: '',
    notes: '',
  })
  const [vehicles, setVehicles] = useState([])
  const [customers, setCustomers] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load vehicle connections
  useEffect(() => {
    loadConnections()
  }, [])

  // Load vehicles and customers for form
  useEffect(() => {
    if (showForm) {
      loadVehicles()
      loadCustomers()
    }
  }, [showForm])

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiGet('/vehicle-connections', token)
      setConnections(Array.isArray(data) ? data : data?.data || [])
    } catch (err) {
      setError(err.message)
      pushToast('error', 'Failed to load vehicle connections')
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadVehicles = useCallback(async () => {
    try {
      const data = await apiGet('/vehicles', token)
      setVehicles(Array.isArray(data) ? data : data?.data || [])
    } catch (err) {
      console.error('Failed to load vehicles:', err)
      pushToast('error', 'Failed to load vehicles')
    }
  }, [token])

  const loadCustomers = useCallback(async () => {
    try {
      const data = await apiGet('/customers', token)
      setCustomers(Array.isArray(data) ? data : data?.data || [])
    } catch (err) {
      console.error('Failed to load customers:', err)
      pushToast('error', 'Failed to load customers')
    }
  }, [token])

  const handleAddConnection = async (e) => {
    e.preventDefault()

    if (!formData.vehicleId || !formData.customerId) {
      pushToast('error', 'Please select both vehicle and customer')
      return
    }

    try {
      setIsSubmitting(true)
      await apiPost('/vehicle-connections', token, {
        vehicle_id: parseInt(formData.vehicleId),
        customer_id: parseInt(formData.customerId),
        notes: formData.notes || null,
      })
      pushToast('success', 'Vehicle connection created successfully')
      setFormData({ vehicleId: '', customerId: '', notes: '' })
      setShowForm(false)
      loadConnections()
    } catch (err) {
      pushToast('error', err.message || 'Failed to create connection')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConnection = async (id) => {
    if (!window.confirm('Are you sure you want to remove this vehicle connection?')) {
      return
    }

    try {
      await apiDelete(`/vehicle-connections/${id}`, token)
      pushToast('success', 'Vehicle connection removed successfully')
      loadConnections()
    } catch (err) {
      pushToast('error', err.message || 'Failed to delete connection')
    }
  }

  const getVehicleName = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    return vehicle ? `${vehicle.make} ${vehicle.model}` : `Vehicle #${vehicleId}`
  }

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId)
    return customer ? customer.name : `Customer #${customerId}`
  }

  if (loading) {
    return <div className="section-loading">Loading vehicle connections...</div>
  }

  return (
    <div className="section-content">
      <div className="section-header">
        <h3>🔗 Vehicle Connections</h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? '✕ Cancel' : '➕ Add Connection'}
        </button>
      </div>

      {error && <div className="error-message">⚠️ {error}</div>}

      {showForm && (
        <form onSubmit={handleAddConnection} className="connection-form">
          <div className="form-group">
            <label>Vehicle</label>
            <select
              value={formData.vehicleId}
              onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
              className="form-input"
              required
            >
              <option value="">-- Select Vehicle --</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plate_number || 'No plate'})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Customer</label>
            <select
              value={formData.customerId}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
              className="form-input"
              required
            >
              <option value="">-- Select Customer --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="form-input"
              placeholder="Add any notes about this connection..."
              rows="3"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? '⏳ Creating...' : '✓ Create Connection'}
          </button>
        </form>
      )}

      {connections.length === 0 ? (
        <div className="empty-state">
          <p>No vehicle connections configured yet.</p>
          <p className="hint">Click "Add Connection" to link vehicles to customers.</p>
        </div>
      ) : (
        <div className="connections-list">
          {connections.map(conn => (
            <div key={conn.id} className="connection-item">
              <div className="connection-info">
                <div className="connection-vehicle">
                  🚗 {getVehicleName(conn.vehicle_id)}
                </div>
                <div className="connection-customer">
                  👤 {getCustomerName(conn.customer_id)}
                </div>
                {conn.notes && (
                  <div className="connection-notes">
                    📝 {conn.notes}
                  </div>
                )}
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteConnection(conn.id)}
              >
                🗑️ Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
