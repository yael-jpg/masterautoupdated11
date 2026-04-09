/**
 * OverpaymentResolutionModal
 *
 * Rendered whenever payment_status === 'OVERPAID'.
 * Forces staff to pick one resolution before the transaction can close:
 *   REFUND   – return cash / digital to customer
 *   CREDIT   – save as store-credit wallet balance
 *   TRANSFER – move excess onto another unpaid invoice
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiPost } from '../api/client'
import './OverpaymentResolutionModal.css'

const METHODS = ['Cash', 'GCash/Maya', 'Credit Card', 'Bank Transfer']

const RESOLUTION_CONFIG = {
  REFUND: {
    label: 'Refund',
    icon: '↩',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.10)',
    border: 'rgba(239,68,68,0.32)',
    desc: 'Return excess money to the customer via cash or digital method.',
  },
  CREDIT: {
    label: 'Save as Store Credit',
    icon: '💳',
    color: '#a0a8b8',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.14)',
    desc: "Store the excess as a wallet balance on the customer's profile for future use.",
  },
  TRANSFER: {
    label: 'Apply to Another Invoice',
    icon: '⇄',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.32)',
    desc: 'Transfer the excess directly onto another unpaid/partially-paid invoice.',
  },
}

export function OverpaymentResolutionModal({
  isOpen,
  token,
  saleId,
  customerId,
  overpaidAmount,
  invoiceRef,
  onResolved,
  onClose,
}) {
  const [resolution, setResolution] = useState(null)         // 'REFUND' | 'CREDIT' | 'TRANSFER'
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [refundReference, setRefundReference] = useState('')
  const [targetSaleId, setTargetSaleId] = useState('')
  const [notes, setNotes] = useState('')
  const [unpaidSales, setUnpaidSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load unpaid/partial invoices for TRANSFER option
  useEffect(() => {
    if (!isOpen || !token) return
    apiGet('/sales', token, { page: 1, limit: 200 })
      .then((result) => {
        const all = result.data || result
        // Exclude the current sale; keep only UNPAID / WITH DEPOSIT ones
        const eligible = all.filter(
          (s) =>
            Number(s.id) !== Number(saleId) &&
            ['UNPAID', 'WITH DEPOSIT'].includes(s.payment_status),
        )
        setUnpaidSales(eligible)
      })
      .catch(() => {})
  }, [isOpen, token, saleId])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setResolution(null)
      setRefundMethod('Cash')
      setRefundReference('')
      setTargetSaleId('')
      setNotes('')
      setError('')
      setLoading(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const cfg = resolution ? RESOLUTION_CONFIG[resolution] : null

  const canSubmit =
    resolution === 'REFUND'
      ? !!refundMethod
      : resolution === 'TRANSFER'
        ? !!targetSaleId
        : resolution === 'CREDIT'
          ? true
          : false

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    try {
      const payload = {
        resolution_type: resolution,
        notes: notes.trim() || undefined,
        ...(resolution === 'REFUND' && {
          refund_method: refundMethod,
          refund_reference: refundReference || undefined,
        }),
        ...(resolution === 'TRANSFER' && { target_sale_id: Number(targetSaleId) }),
      }
      const result = await apiPost(`/overpayments/${saleId}/resolve`, token, payload)
      onResolved?.(result)
    } catch (err) {
      setError(err.message || 'Resolution failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="opr-overlay">
      <div
        className="opr-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Resolve Overpayment"
      >
        <div className="opr-header">
          <span className="opr-header-icon">⚠</span>
          <div className="opr-header-main">
            <div className="opr-header-title">Overpayment Detected</div>
            <div className="opr-header-sub">
              Invoice&nbsp;<strong>{invoiceRef}</strong>
              &nbsp;· Please resolve before closing this transaction.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="opr-close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="opr-body">
          <div className="opr-card opr-amount">
            <div>
              <div className="opr-amount-label">Excess Amount to Resolve</div>
              <div className="opr-amount-value">
                ₱{Number(overpaidAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span className="opr-amount-icon">⚠</span>
          </div>

          <div className="opr-section">
            <label className="opr-section-label">Choose Resolution Action</label>
            <div className="opr-resolution-list">
              {Object.entries(RESOLUTION_CONFIG).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setResolution(key)}
                  className={`opr-resolution-btn ${resolution === key ? 'is-active' : ''}`}
                  style={{ '--opr-active-color': c.color, '--opr-active-bg': c.bg }}
                >
                  <span className="opr-resolution-icon">{c.icon}</span>
                  <div className="opr-resolution-main">
                    <div className="opr-resolution-title">{c.label}</div>
                    <div className="opr-resolution-desc">{c.desc}</div>
                  </div>
                  {resolution === key && <span className="opr-resolution-check">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {resolution === 'REFUND' && (
            <div className="opr-card opr-detail-card is-refund">
              <div className="opr-detail-title is-refund">Refund Details</div>
              <div className="opr-grid-2">
                <div>
                  <label className="opr-field-label">Refund Method *</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="opr-select"
                  >
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="opr-field-label">Reference # (optional)</label>
                  <input
                    value={refundReference}
                    onChange={(e) => setRefundReference(e.target.value)}
                    placeholder="Slip / GCash Ref"
                    className="opr-input"
                  />
                </div>
              </div>
              <div className="opr-refund-note">
                ₱{Number(overpaidAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} will be deducted from the {refundMethod} drawer and returned to the customer.
              </div>
            </div>
          )}

          {resolution === 'CREDIT' && (
            <div className="opr-card opr-detail-card is-credit">
              <div className="opr-detail-title is-credit">Store Credit Preview</div>
              <div className="opr-credit-copy">
                ₱{Number(overpaidAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} will be added to the customer's wallet and automatically suggested on their next invoice.
              </div>
            </div>
          )}

          {resolution === 'TRANSFER' && (
            <div className="opr-card opr-detail-card is-transfer">
              <div className="opr-detail-title is-transfer">Select Target Invoice</div>
              {unpaidSales.length === 0 ? (
                <div className="opr-transfer-empty">
                  No eligible invoices found. All other invoices are either settled or overpaid.
                </div>
              ) : (
                <select
                  value={targetSaleId}
                  onChange={(e) => setTargetSaleId(e.target.value)}
                  className="opr-select"
                >
                  <option value="">— Select invoice —</option>
                  {unpaidSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.reference_no} · {s.customer_name || `Customer #${s.customer_id}`} · Balance ₱{Number(s.outstanding_balance ?? s.total_amount).toLocaleString()}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {resolution && (
            <div className="opr-notes">
              <label className="opr-field-label">Notes / Reason (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Add internal notes for audit trail..."
                className="opr-textarea"
              />
            </div>
          )}

          {error && <div className="opr-error">{error}</div>}

          <div className="opr-actions">
            <button
              type="button"
              onClick={onClose}
              className="opr-btn opr-btn-secondary"
            >
              Resolve Later
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className={`opr-btn opr-btn-primary ${canSubmit && !loading ? 'is-enabled' : 'is-disabled'}`}
              style={{ '--opr-submit-color': cfg ? cfg.color : '#3a3a3a' }}
            >
              {loading
                ? 'Processing…'
                : resolution
                  ? `Confirm ${RESOLUTION_CONFIG[resolution].label}`
                  : 'Select an action above'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
