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

const BORDER = '1px solid rgba(255,255,255,0.09)'
const CARD   = { background: 'rgba(10,15,28,0.7)', borderRadius: '12px', border: BORDER, padding: '18px' }

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
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: '560px',
          background: '#0e0e0e',
          borderRadius: '18px',
          border: '1.5px solid rgba(255,255,255,0.12)',
          boxShadow: '0 0 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Resolve Overpayment"
      >
        {/* ── Danger Header ─────────────────────────────────────────────── */}
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}
        >
          <span style={{ fontSize: '2rem' }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#e2e8f0' }}>
              Overpayment Detected
            </div>
            <div style={{ fontSize: '0.82rem', color: 'rgba(189,200,218,0.65)', marginTop: '2px' }}>
              Invoice&nbsp;<strong style={{ color: '#c0c8d8' }}>{invoiceRef}</strong>
              &nbsp;· Please resolve before closing this transaction.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(189,200,218,0.5)', fontSize: '1.4rem', lineHeight: 1,
              padding: '4px',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '70vh' }}>
          {/* ── Overpaid Amount Callout ──────────────────────────────────── */}
          <div
            style={{
              ...CARD,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div>
              <div style={{ color: 'rgba(189,200,218,0.55)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Excess Amount to Resolve
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#c0c8d8', marginTop: '4px' }}>
                ₱{Number(overpaidAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <span style={{ fontSize: '2.4rem', opacity: 0.5 }}>⚠</span>
          </div>

          {/* ── Resolution Type Selector ─────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(189,200,218,0.55)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '10px' }}>
              Choose Resolution Action
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(RESOLUTION_CONFIG).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setResolution(key)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `1.5px solid ${resolution === key ? c.color : 'rgba(255,255,255,0.08)'}`,
                    background: resolution === key ? c.bg : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.4rem', minWidth: '28px', textAlign: 'center' }}>{c.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: resolution === key ? c.color : '#e2e8f0' }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(189,200,218,0.5)', marginTop: '2px' }}>
                      {c.desc}
                    </div>
                  </div>
                  {resolution === key && (
                    <span style={{ color: c.color, fontSize: '1.2rem', fontWeight: 800 }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Resolution-Specific Fields ───────────────────────────────── */}
          {resolution === 'REFUND' && (
            <div style={{ ...CARD, marginBottom: '16px', borderColor: 'rgba(239,68,68,0.3)' }}>
              <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: '0.85rem', marginBottom: '12px' }}>
                Refund Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'rgba(189,200,218,0.5)', display: 'block', marginBottom: '4px' }}>Refund Method *</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', background: 'var(--bg-input, #131313)', border: BORDER, borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem' }}
                  >
                    {METHODS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'rgba(189,200,218,0.5)', display: 'block', marginBottom: '4px' }}>Reference # (optional)</label>
                  <input
                    value={refundReference}
                    onChange={(e) => setRefundReference(e.target.value)}
                    placeholder="Slip / GCash Ref"
                    style={{ width: '100%', padding: '9px 10px', background: 'var(--bg-input, #131313)', border: BORDER, borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '10px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', fontSize: '0.78rem', color: '#fca5a5' }}>
                ₱{Number(overpaidAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} will be deducted from the {refundMethod} drawer and returned to the customer.
              </div>
            </div>
          )}

          {resolution === 'CREDIT' && (
            <div style={{ ...CARD, marginBottom: '16px', borderColor: 'rgba(255,255,255,0.10)' }}>
              <div style={{ fontWeight: 700, color: '#c0c8d8', fontSize: '0.85rem', marginBottom: '8px' }}>
                Store Credit Preview
              </div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(189,200,218,0.6)', lineHeight: 1.6 }}>
                ₱{Number(overpaidAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} will be added to the customer's wallet and automatically suggested on their next invoice.
              </div>
            </div>
          )}

          {resolution === 'TRANSFER' && (
            <div style={{ ...CARD, marginBottom: '16px', borderColor: 'rgba(245,158,11,0.3)' }}>
              <div style={{ fontWeight: 700, color: '#fcd34d', fontSize: '0.85rem', marginBottom: '10px' }}>
                Select Target Invoice
              </div>
              {unpaidSales.length === 0 ? (
                <div style={{ color: 'rgba(189,200,218,0.5)', fontSize: '0.82rem', padding: '12px 0' }}>
                  No eligible invoices found. All other invoices are either settled or overpaid.
                </div>
              ) : (
                <select
                  value={targetSaleId}
                  onChange={(e) => setTargetSaleId(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', background: 'var(--bg-input, #131313)', border: BORDER, borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem' }}
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

          {/* ── Notes ───────────────────────────────────────────────────── */}
          {resolution && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.75rem', color: 'rgba(189,200,218,0.5)', display: 'block', marginBottom: '4px' }}>Notes / Reason (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Add internal notes for audit trail..."
                style={{
                  width: '100%', padding: '10px', background: 'var(--bg-input, #131313)',
                  border: BORDER, borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem',
                  resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {/* ── Error ───────────────────────────────────────────────────── */}
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.82rem', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* ── Action Buttons ───────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 0',
                background: 'rgba(255,255,255,0.05)',
                border: BORDER, borderRadius: '10px',
                color: 'rgba(189,200,218,0.7)', fontWeight: 600, cursor: 'pointer',
                fontSize: '0.88rem',
              }}
            >
              Resolve Later
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              style={{
                flex: 2, padding: '12px 0',
                background: canSubmit && !loading
                  ? (cfg ? cfg.color : '#3a3a3a')
                  : 'rgba(100,100,120,0.3)',
                border: 'none', borderRadius: '10px',
                color: canSubmit && !loading ? '#fff' : 'rgba(255,255,255,0.3)',
                fontWeight: 700, cursor: canSubmit && !loading ? 'pointer' : 'not-allowed',
                fontSize: '0.92rem',
                transition: 'background 0.2s',
              }}
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
