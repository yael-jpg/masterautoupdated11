import { useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client'
import { Modal } from './Modal'
import './VehicleDetail.css'

export function VehicleDetail({ vehicle, token, onClose, onOwnerClick }) {
  const [serviceHistory, setServiceHistory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('info')
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [showPhotoForm, setShowPhotoForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [viewingPhoto, setViewingPhoto] = useState(null)

  const [recordForm, setRecordForm] = useState({
    serviceDate: new Date().toISOString().split('T')[0],
    serviceDescription: '',
    damageNotes: '',
    remarks: '',
    assignedStaffName: '',
    odometerReading: vehicle?.odometer || 0,
    saleId: '',
    status: 'pending',
  })

  const [photoForm, setPhotoForm] = useState({
    photoType: 'general',
    file: null,
    tag: '',
    saleId: '',
  })

  useEffect(() => {
    loadServiceHistory()
  }, [vehicle?.id, token])

  useEffect(() => {
    setActiveTab('info')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id])

  const loadServiceHistory = async () => {
    if (!vehicle?.id) return
    setLoading(true)
    try {
      const data = await apiGet(`/vehicles/${vehicle.id}/service-history`, token)
      setServiceHistory(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRecord = async (e) => {
    e.preventDefault()
    try {
      // Format the payload with proper types - only include fields that have values
      const payload = {
        serviceDate: new Date(recordForm.serviceDate).toISOString(), // Convert to full ISO8601
      }

      // Only add optional fields if they have values
      if (recordForm.serviceDescription?.trim()) {
        payload.serviceDescription = recordForm.serviceDescription.trim()
      }
      if (recordForm.damageNotes?.trim()) {
        payload.damageNotes = recordForm.damageNotes.trim()
      }
      if (recordForm.remarks?.trim()) {
        payload.remarks = recordForm.remarks.trim()
      }
      if (recordForm.assignedStaffName?.trim()) {
        payload.assignedStaffName = recordForm.assignedStaffName.trim()
      }
      if (recordForm.odometerReading && Number(recordForm.odometerReading) > 0) {
        payload.odometerReading = Number(recordForm.odometerReading)
      }
      if (recordForm.saleId && Number(recordForm.saleId) > 0) {
        payload.saleId = Number(recordForm.saleId)
      }
      if (recordForm.status) {
        payload.status = recordForm.status
      }

      if (editingRecord) {
        await apiPatch(
          `/vehicles/${vehicle.id}/service-records/${editingRecord.id}`,
          token,
          payload,
        )
      } else {
        await apiPost(`/vehicles/${vehicle.id}/service-records`, token, payload)
      }
      setShowRecordForm(false)
      setEditingRecord(null)
      setRecordForm({
        serviceDate: new Date().toISOString().split('T')[0],
        serviceDescription: '',
        damageNotes: '',
        remarks: '',
        assignedStaffName: '',
        odometerReading: vehicle?.odometer || 0,
        saleId: '',
        status: 'pending',
      })
      await loadServiceHistory()
      setError('')
    } catch (err) {
      setError(err.message)
      console.error('Error saving service record:', err)
    }
  }

  const handleEditRecord = (record) => {
    setEditingRecord(record)
    setRecordForm({
      serviceDate: record.service_date?.split('T')[0] || '',
      serviceDescription: record.service_description || '',
      damageNotes: record.damage_notes || '',
      remarks: record.remarks || '',
      assignedStaffName: record.assigned_staff_name || '',
      odometerReading: record.odometer_reading || 0,
      saleId: record.sale_id || '',
      status: record.status || 'pending',
    })
    setShowRecordForm(true)
  }

  const handleAddPhoto = async (e) => {
    e.preventDefault()
    try {
      if (!photoForm.file) {
        setError('Please select a photo file')
        return
      }

      // Create FormData for multipart upload
      const formData = new FormData()
      formData.append('photo', photoForm.file)
      formData.append('photoType', photoForm.photoType)
      if (photoForm.tag) {
        formData.append('tag', photoForm.tag)
      }
      if (photoForm.saleId) {
        formData.append('saleId', photoForm.saleId)
      }

      // Upload using fetch directly for FormData support
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')}/vehicles/${vehicle.id}/photos`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Upload failed')
      }

      setShowPhotoForm(false)
      setPhotoForm({
        photoType: 'general',
        file: null,
        tag: '',
        saleId: '',
      })
      await loadServiceHistory()
      setError('')
    } catch (err) {
      setError(err.message)
      console.error('Error uploading photo:', err)
    }
  }

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return
    try {
      await apiDelete(`/vehicles/${vehicle.id}/photos/${photoId}`, token)
      await loadServiceHistory()
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  const formatDate = (date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount || 0)
  }

  const getImageUrl = (fileUrl) => {
    if (!fileUrl) return ''
    // If it's already a full URL, return as-is
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      return fileUrl
    }
    // Otherwise, prepend the backend base URL
    const baseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
    const serverUrl = baseUrl.replace('/api', '')
    const fullUrl = `${serverUrl}${fileUrl}`
    console.log('Image URL:', { original: fileUrl, full: fullUrl })
    return fullUrl
  }

  if (loading) {
    return (
      <div className="vehicle-detail-loading">
        <p>Loading service history...</p>
      </div>
    )
  }

  return (
    <div className="vehicle-detail">
      <div className="vehicle-detail-header">
        <div className="vehicle-info">
          <h2>
            {vehicle.plate_number || '—'} - {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
          </h2>
          <div className="vehicle-meta">
            <span>Year: {vehicle.year || 'N/A'}</span>
            <span>Color: {vehicle.color || 'N/A'}</span>
            <span>Odometer: {vehicle.odometer || 0} km</span>
          </div>
          <button
            type="button"
            className="vehicle-customer"
            onClick={() => onOwnerClick && onOwnerClick(vehicle)}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: onOwnerClick ? 'pointer' : 'default',
              textAlign: 'left', font: 'inherit',
            }}
            title={onOwnerClick ? 'Click to view owner details' : undefined}
          >
            Owner: {vehicle.customer_name}
          </button>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="vehicle-detail-tabs">
        <button
          type="button"
          className={activeTab === 'info' ? 'active' : ''}
          onClick={() => setActiveTab('info')}
        >
          Vehicle Info
        </button>
        <button
          type="button"
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          Service History
        </button>
        <button
          type="button"
          className={activeTab === 'photos' ? 'active' : ''}
          onClick={() => setActiveTab('photos')}
        >
          Photos
        </button>
        <button
          type="button"
          className={activeTab === 'damage' ? 'active' : ''}
          onClick={() => setActiveTab('damage')}
        >
          Damage
        </button>
      </div>

      <div className="vehicle-detail-content">
        {activeTab === 'info' && (
          <div className="vehicle-info-tab">
            <h3>Vehicle Information</h3>
            <div className="vehicle-info-grid">
              <div className="vehicle-info-card">
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Plate Number</span>
                  <span className="vehicle-info-value">{vehicle.plate_number || '—'}</span>
                </div>
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Make</span>
                  <span className="vehicle-info-value">{vehicle.make || '—'}</span>
                </div>
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Model</span>
                  <span className="vehicle-info-value">{vehicle.model || '—'}</span>
                </div>
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Variant</span>
                  <span className="vehicle-info-value">{vehicle.variant || '—'}</span>
                </div>
              </div>

              <div className="vehicle-info-card">
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Year</span>
                  <span className="vehicle-info-value">{vehicle.year || '—'}</span>
                </div>
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Color</span>
                  <span className="vehicle-info-value">{vehicle.color || '—'}</span>
                </div>
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Odometer</span>
                  <span className="vehicle-info-value">{(vehicle.odometer || 0).toLocaleString('en-PH')} km</span>
                </div>
                <div className="vehicle-info-row">
                  <span className="vehicle-info-label">Body Type</span>
                  <span className="vehicle-info-value">{vehicle.body_type || vehicle.bodyType || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="service-history-tab">
            <h3>Complete Service History - Jobs, Dates, Packages & Staff</h3>
            {!serviceHistory?.salesHistory?.length ? (
              <p className="no-data">No service history found</p>
            ) : (
              <div className="service-timeline">
                {serviceHistory.salesHistory.map((sale) => (
                  <div key={sale.id} className="timeline-item">
                    <div className="timeline-marker" />
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <h4>{sale.service_package}</h4>
                        <span className="timeline-date">{formatDate(sale.service_date)}</span>
                      </div>
                      <div className="vh-details-grid">
                        <div className="vh-details-row">
                          <span className="vh-details-label">Reference</span>
                          <span className="vh-details-value">{sale.reference_no || '—'}</span>
                        </div>
                        <div className="vh-details-row">
                          <span className="vh-details-label">Type</span>
                          <span className="vh-details-value">{sale.doc_type || '—'}</span>
                        </div>
                        <div className="vh-details-row">
                          <span className="vh-details-label">Status</span>
                          <span className="vh-details-value">
                            <span className={`status-badge status-${String(sale.workflow_status || 'pending').toLowerCase().replace(/\s+/g, '-')}`}>
                              {sale.workflow_status || 'PENDING'}
                            </span>
                          </span>
                        </div>
                        <div className="vh-details-row">
                          <span className="vh-details-label">Amount</span>
                          <span className="vh-details-value">{formatCurrency(sale.total_amount)}</span>
                        </div>
                        <div className="vh-details-row">
                          <span className="vh-details-label">Staff</span>
                          <span className="vh-details-value">{sale.created_by_name || 'N/A'}</span>
                        </div>
                        {sale.add_ons && (
                          <div className="vh-details-row">
                            <span className="vh-details-label">Add-ons</span>
                            <span className="vh-details-value">
                              {typeof sale.add_ons === 'string'
                                ? sale.add_ons
                                : Array.isArray(sale.add_ons)
                                  ? sale.add_ons.filter(Boolean).join(', ')
                                  : JSON.stringify(sale.add_ons)}
                            </span>
                          </div>
                        )}
                        {sale.items && sale.items.length > 0 && (
                          <div className="service-items">
                            <strong>Items/Services:</strong>
                            <ul>
                              {sale.items.map((item, idx) => (
                                <li key={idx}>
                                  {item.item_name} - {item.item_type} (Qty: {item.qty}) -{' '}
                                  {formatCurrency(item.price)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'damage' && (
          <div className="service-records-tab">
            <div className="tab-header">
              <h3>Damage & Notes</h3>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditingRecord(null)
                  setShowRecordForm(true)
                }}
              >
                + Add Record
              </button>
            </div>

            {!serviceHistory?.serviceRecords?.length ? (
              <p className="no-data">No service records found</p>
            ) : (
              <div className="records-list">
                {serviceHistory.serviceRecords.map((record) => (
                  <div key={record.id} className={`record-card record-status-${record.status || 'pending'}`}>
                    <div className="record-header">
                      <div>
                        <h4>{formatDate(record.service_date)}</h4>
                        <span className={`status-badge status-${record.status || 'pending'}`}>
                          {record.status || 'pending'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {record.status !== 'completed' && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={async () => {
                              try {
                                await apiPatch(
                                  `/vehicles/${vehicle.id}/service-records/${record.id}`,
                                  token,
                                  { status: 'completed' }
                                )
                                await loadServiceHistory()
                              } catch (err) {
                                setError(err.message)
                              }
                            }}
                          >
                            ✓ Mark Done
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleEditRecord(record)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    <div className="record-content">
                      {record.service_description && (
                        <div className="record-section">
                          <strong>Service:</strong>
                          <p>{record.service_description}</p>
                        </div>
                      )}
                      {record.damage_notes && (
                        <div className="record-section damage-section">
                          <strong>⚠️ Damage Notes:</strong>
                          <p>{record.damage_notes}</p>
                        </div>
                      )}
                      {record.remarks && (
                        <div className="record-section">
                          <strong>Remarks:</strong>
                          <p>{record.remarks}</p>
                        </div>
                      )}
                      <div className="record-meta">
                        {record.assigned_staff_name && (
                          <span>Staff: {record.assigned_staff_name}</span>
                        )}
                        {record.odometer_reading && (
                          <span>Odometer: {record.odometer_reading} km</span>
                        )}
                        {record.created_by_name && (
                          <span>Recorded by: {record.created_by_name}</span>
                        )}
                        {record.status === 'completed' && record.completed_at && (
                          <span>✓ Completed: {formatDate(record.completed_at)}</span>
                        )}
                        {record.completed_by_name && (
                          <span>by {record.completed_by_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Modal
              isOpen={showRecordForm}
              onClose={() => {
                setShowRecordForm(false)
                setEditingRecord(null)
              }}
              title={editingRecord ? 'Edit Service Record' : 'Add Service Record'}
            >
              <form className="record-form" onSubmit={handleAddRecord}>
                <div className="form-group">
                  <label>Service Date</label>
                  <input
                    type="date"
                    value={recordForm.serviceDate}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, serviceDate: e.target.value }))
                    }
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label>Service Description</label>
                  <textarea
                    rows={3}
                    value={recordForm.serviceDescription}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, serviceDescription: e.target.value }))
                    }
                    placeholder="Describe the service performed: oil change, window replacement, detailing, etc..."
                  />
                </div>

                <div className="form-group full-width">
                  <label>Damage Notes</label>
                  <textarea
                    rows={3}
                    value={recordForm.damageNotes}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, damageNotes: e.target.value }))
                    }
                    placeholder="Document existing damage found: scratches, dents, broken parts, paint issues..."
                  />
                </div>

                <div className="form-group full-width">
                  <label>Remarks</label>
                  <textarea
                    rows={3}
                    value={recordForm.remarks}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, remarks: e.target.value }))
                    }
                    placeholder="Additional notes or observations..."
                  />
                </div>

                <div className="form-group">
                  <label>Assigned Staff</label>
                  <input
                    type="text"
                    value={recordForm.assignedStaffName}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, assignedStaffName: e.target.value }))
                    }
                    placeholder="Staff name"
                  />
                </div>

                <div className="form-group">
                  <label>Odometer Reading (km)</label>
                  <input
                    type="number"
                    value={recordForm.odometerReading}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, odometerReading: e.target.value }))
                    }
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={recordForm.status}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, status: e.target.value }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="in-progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="form-actions full-width">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowRecordForm(false)
                      setEditingRecord(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingRecord ? 'Update' : 'Save'} Record
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="photos-tab">
            <div className="tab-header">
              <h3>Photo Documentation - All Sides, Close-ups & Damage Tracking</h3>
              <button type="button" className="btn-primary" onClick={() => setShowPhotoForm(true)}>
                + Upload Photo
              </button>
            </div>

            <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#94a3b8' }}>
              <strong style={{ color: '#e2e8f0' }}>📸 Best Practices:</strong> Upload photos directly from your device.
              Capture before photos from all angles (front, back, sides, interior) and close-ups of any existing damage or issues.
              After service, document completed work with clear after photos.
            </div>

            {!serviceHistory?.photos?.length ? (
              <p className="no-data">No photos uploaded</p>
            ) : (
              <div className="photos-grid">
                {serviceHistory.photos.map((photo) => (
                  <div key={photo.id} className={`photo-card photo-type-${photo.photo_type}`}>
                    <div
                      className="photo-image"
                      onClick={() => setViewingPhoto(photo)}
                      style={{ cursor: 'pointer' }}
                      title="Click to view full size"
                    >
                      <img
                        src={getImageUrl(photo.file_url)}
                        alt={photo.tag || 'Vehicle photo'}
                        onError={(e) => {
                          console.error('Image load error:', photo.file_url)
                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage not found%3C/text%3E%3C/svg%3E'
                        }}
                      />
                    </div>
                    <div className="photo-info">
                      <div className="photo-tags">
                        <span className={`photo-type-badge type-${photo.photo_type}`}>
                          {photo.photo_type}
                        </span>
                        {photo.tag && <span className="photo-tag">{photo.tag}</span>}
                      </div>
                      <p className="photo-date">{formatDate(photo.created_at)}</p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setViewingPhoto(photo)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => handleDeletePhoto(photo.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Modal
              isOpen={showPhotoForm}
              onClose={() => setShowPhotoForm(false)}
              title="Upload Vehicle Photo"
            >
              <form className="photo-form" onSubmit={handleAddPhoto}>
                <div className="form-group">
                  <label>Photo Type</label>
                  <select
                    value={photoForm.photoType}
                    onChange={(e) =>
                      setPhotoForm((prev) => ({ ...prev, photoType: e.target.value }))
                    }
                    required
                  >
                    <option value="general">General</option>
                    <option value="before">Before Service (All sides + issue close-ups)</option>
                    <option value="after">After Service (Completed work)</option>
                    <option value="damage">Damage (Pre-existing issues)</option>
                  </select>
                </div>

                <div className="form-group full-width">
                  <label>Select Photo File</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={(e) =>
                      setPhotoForm((prev) => ({ ...prev, file: e.target.files[0] }))
                    }
                    required
                  />
                  <small className="form-hint">
                    Supported formats: JPEG, PNG, GIF, WebP (Max 10MB)
                  </small>
                  {photoForm.file && (
                    <div style={{ marginTop: '8px', color: '#10b981', fontSize: '13px' }}>
                      ✓ Selected: {photoForm.file.name} ({(photoForm.file.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Tag/Label</label>
                  <input
                    type="text"
                    value={photoForm.tag}
                    onChange={(e) => setPhotoForm((prev) => ({ ...prev, tag: e.target.value }))}
                    placeholder="e.g., Front bumper scratch, Left door dent, Rear windshield"
                  />
                </div>

                <div className="form-actions full-width">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowPhotoForm(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Upload Photo
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}
      </div>

      {error && <p className="detail-error">{error}</p>}

      {/* Photo Viewer Modal */}
      {viewingPhoto && (
        <Modal
          isOpen={!!viewingPhoto}
          onClose={() => setViewingPhoto(null)}
          title=""
          wide
        >
          <div className="photo-viewer">
            <div className="photo-viewer-header">
              <div>
                <h3>{viewingPhoto.tag || 'Vehicle Photo'}</h3>
                <div className="photo-viewer-meta">
                  <span className={`photo-type-badge type-${viewingPhoto.photo_type}`}>
                    {viewingPhoto.photo_type}
                  </span>
                  <span>{formatDate(viewingPhoto.created_at)}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => window.open(getImageUrl(viewingPhoto.file_url), '_blank')}
              >
                Open in New Tab
              </button>
            </div>
            <div className="photo-viewer-image">
              <img
                src={getImageUrl(viewingPhoto.file_url)}
                alt={viewingPhoto.tag || 'Vehicle photo'}
                onError={(e) => {
                  console.error('Image failed to load:', viewingPhoto.file_url)
                  console.log('Full URL:', getImageUrl(viewingPhoto.file_url))
                }}
              />
            </div>
            <div className="photo-viewer-footer">
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                File: {viewingPhoto.file_url}
              </p>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  handleDeletePhoto(viewingPhoto.id)
                  setViewingPhoto(null)
                }}
              >
                Delete Photo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
