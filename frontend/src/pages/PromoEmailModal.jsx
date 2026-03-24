import { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, pushToast } from '../api/client'

const ADDRESS = 'MasterAuto, 91, 12th Ave, Cubao, Quezon City'

const SERVICES = [
  'Oil Change & Engine Check',
  'Brake Inspection & Repair',
  'Tire Rotation & Alignment',
  'Battery & Electrical Check',
  'General Vehicle Maintenance',
]

/**
 * EmailPreview â€” renders a visual mock of the email that will be sent.
 * Accepts the same data the backend will receive so the preview is accurate.
 */
function EmailPreview({ discountLabel, promoCode, description, expiryText, bodyText }) {
  const logoSrc = `${window.location.origin}/images/logo.png`

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#1e293b', background: '#f0f4f8' }}>

      {/* â”€â”€ Header â”€â”€ */}
      <div style={{
        background: 'linear-gradient(135deg, #1a3a6b 0%, #2563eb 100%)',
        padding: '28px 24px 24px',
        textAlign: 'center',
      }}>
        <img
          src={logoSrc}
          alt="Master Auto"
          style={{ height: 52, marginBottom: 10, objectFit: 'contain' }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
        <div style={{ color: '#bfdbfe', fontSize: 13 }}>Your Trusted Auto Service Partner</div>
      </div>

      {/* â”€â”€ Promo banner â”€â”€ */}
      <div style={{
        background: '#fefce8',
        padding: '20px 24px 16px',
        textAlign: 'center',
        borderBottom: '3px dashed #fbbf24',
      }}>
        <div style={{
          display: 'inline-block',
          background: '#1d4ed8',
          color: '#fff',
          fontWeight: 900,
          fontSize: 22,
          padding: '8px 22px',
          borderRadius: 6,
          letterSpacing: 1,
          marginBottom: 8,
        }}>
          {discountLabel.toUpperCase()} AUTO SERVICES
        </div>
        <div style={{ color: '#92400e', fontSize: 14, fontWeight: 700 }}>
          Limited-Time Discount on Selected Services
        </div>
      </div>

      {/* â”€â”€ Body â”€â”€ */}
      <div style={{ background: '#ffffff', padding: '24px 28px' }}>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.7, color: '#374151' }}>
          {bodyText}
        </p>

        <p style={{ margin: '0 0 10px', fontSize: 14, color: '#374151', fontWeight: 600 }}>
          Our certified technicians are ready to help with:
        </p>
        <ul style={{ margin: '0 0 20px', paddingLeft: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 0' }}>
          {SERVICES.map((s) => (
            <li key={s} style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%',
                background: '#22c55e', color: '#fff', fontSize: 11, flexShrink: 0, fontWeight: 900,
              }}>•</span>
              {s}
            </li>
          ))}
        </ul>

        {/* â”€â”€ Promo code box â”€â”€ */}
        <div style={{
          border: '2px dashed #2563eb',
          borderRadius: 10,
          background: '#eff6ff',
          padding: '18px 20px',
          textAlign: 'center',
          margin: '0 0 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 1 }}>Your Promo Code</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1d4ed8', letterSpacing: 4, margin: '6px 0', fontFamily: 'monospace' }}>{promoCode}</div>
          {description && <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{description}</div>}
          {expiryText && <div style={{ fontSize: 12, color: '#64748b' }}>Valid until <strong>{expiryText}</strong></div>}
        </div>
      </div>

      {/* â”€â”€ Book CTA â”€â”€ */}
      <div style={{ background: '#fefce8', padding: '20px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
          📅 Book Your Service Today
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
          Schedule your visit and let our experts take care of your vehicle.<br />
          Our team ensures quality service, reliable diagnostics, and trusted repairs.
        </p>
        {expiryText && (
          <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
            Offer valid <strong>until {expiryText}</strong>.
          </p>
        )}
        {/* ── Portal CTA ── */}
        <div style={{ marginTop: 14 }}>
          <a
            href={`${window.location.origin}/portal`}
            style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #1a3a6b, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              padding: '12px 28px',
              borderRadius: 8,
              textDecoration: 'none',
              letterSpacing: '0.03em',
            }}
          >
            🔑 Access My Portal
          </a>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
            Register or sign in to book your appointment online.
          </div>
        </div>
      </div>

      {/* ── Why Choose ── */}
      <div style={{ background: '#eff6ff', padding: '20px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', color: '#1e3a8a', marginBottom: 14 }}>
          📍 Why Choose Master Auto?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          {[
            'Experienced technicians',
            'Quality parts and service',
            'Fast and reliable diagnostics',
            'Customer-focused service',
          ].map((r) => (
            <div key={r} style={{ fontSize: 13, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: '#f59e0b', fontSize: 15, flexShrink: 0 }}>★</span> {r}
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ Location â”€â”€ */}
      <div style={{ background: '#ffffff', padding: '20px 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#b91c1c', marginBottom: 8 }}>
          📍 Visit or Book an Appointment
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
          Stop by our service center or contact us to schedule your vehicle service today.
        </p>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>Master Auto Service Center</div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{ADDRESS}</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Your trusted partner for safe and reliable driving.</div>
      </div>

      {/* â”€â”€ Footer â”€â”€ */}
      <div style={{ background: '#f1f5f9', padding: '14px 28px', borderTop: '1px solid #e2e8f0' }}>
        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.6, textAlign: 'center' }}>
          You are receiving this email because you are a valued Master Auto customer.<br />
          If you have questions or would like to schedule a service, please contact us.
        </p>
      </div>

    </div>
  )
}

/**
 * PromoEmailModal
 * Split layout: left = compose form, right = live email preview.
 * Supports sending to ALL clients or SELECT specific clients.
 */
export default function PromoEmailModal({ promo, token, onClose }) {
  const discountLabel =
    promo.discount_type === 'percent'
      ? `${Number(promo.discount_value)}% off`
      : `₱${Number(promo.discount_value).toLocaleString('en-PH')} off`

  const defaultSubject = `🎉 Special Promo from Master Auto — ${discountLabel} on All Services!`
  const defaultMessage =
    `Keep your vehicle running smoothly with professional care from Master Auto. ` +
    `For a limited time, enjoy ${discountLabel} on selected maintenance and repair services.`

  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [sending, setSending] = useState(false)
  const [result, setResult]   = useState(null)

  // ── Recipient mode ──────────────────────────────────────────────────────────
  const [mode, setMode]               = useState('ALL')   // 'ALL' | 'SELECT'
  const [customers, setCustomers]     = useState([])
  const [custLoading, setCustLoading] = useState(true)
  const [custError, setCustError]     = useState(null)
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(new Set()) // Set of customer ids (numbers)
  const searchRef = useRef(null)

  // Pre-load ALL customers (paginated) immediately on mount
  useEffect(() => {
    let cancelled = false
    setCustLoading(true)
    setCustError(null)
    ;(async () => {
      try {
        const all = []
        let page = 1
        while (true) {
          const res = await apiGet('/customers', token, { limit: 100, page })
          const rows = res.data || res || []
          all.push(...rows.filter((c) => c.email))
          const pagination = res.pagination
          if (!pagination || page >= pagination.totalPages || rows.length === 0) break
          page++
        }
        if (!cancelled) setCustomers(all)
      } catch (e) {
        if (!cancelled) setCustError(e.message)
      } finally {
        if (!cancelled) setCustLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  function toggleCustomer(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(visible) {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = visible.every((c) => next.has(c.id))
      visible.forEach((c) => allSelected ? next.delete(c.id) : next.add(c.id))
      return next
    })
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  })

  const expiryText = promo.expires_at
    ? new Date(promo.expires_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  async function handleSend() {
    const isSelect = mode === 'SELECT'
    if (isSelect && selected.size === 0) {
      pushToast('warning', 'Please select at least one client')
      return
    }
    const confirmMsg = isSelect
      ? `Send promo email to ${selected.size} selected client${selected.size !== 1 ? 's' : ''}?`
      : 'Send promo email to ALL clients? This cannot be undone.'
    if (!window.confirm(confirmMsg)) return

    setSending(true)
    setResult(null)
    try {
      const payload = {
        subject:  subject.trim(),
        message:  message.trim(),
        logoUrl:  `${window.location.origin}/images/logo.png`,
        ...(isSelect ? { customerIds: Array.from(selected) } : {}),
      }
      const res = await apiPost(`/promo-codes/${promo.id}/blast`, token, payload)
      setResult(res)
      if (res.sent > 0) {
        pushToast('success', `Promo email sent to ${res.sent} client${res.sent !== 1 ? 's' : ''}!`)
      } else if (res.skipped > 0) {
        pushToast('warning', `Emails skipped — SMTP may not be configured (${res.skipped} skipped)`)
      } else {
        pushToast('error', `Send failed for all ${res.failed} recipients`)
      }
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setSending(false)
    }
  }

  const recipientLabel = mode === 'ALL'
    ? 'Sending to all clients with email on file'
    : custLoading
      ? 'Loading clients…'
      : custError
        ? 'Failed to load clients'
        : selected.size === 0
          ? `${customers.length} client${customers.length !== 1 ? 's' : ''} available — select below`
          : `${selected.size} client${selected.size !== 1 ? 's' : ''} selected`

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100, alignItems: 'center', padding: '20px 0' }}>
      <div style={{
        display: 'flex',
        width: '96vw',
        maxWidth: 1080,
        height: '92vh',
        background: '#1a2236',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.55)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>

        {/* ══════════ LEFT — Compose Panel ══════════ */}
        <div style={{
          width: 400,
          minWidth: 360,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          background: '#131c2e',
          minHeight: 0,
        }}>

          {/* Header — fixed */}
          <div style={{
            padding: '16px 20px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', gap: 10,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 20 }}>📧</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#e2e8f0' }}>Send Promo Email</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>Compose and send promo to clients</div>
            </div>
          </div>

          {/* Promo pill — fixed */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{
              backgroundImage: `linear-gradient(135deg, rgba(30,58,138,0.92) 0%, rgba(37,99,235,0.88) 100%), url(/images/background.jpg)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: 10,
              padding: '12px 16px',
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 3 }}>
                {promo.code}
              </div>
              <div style={{ color: '#bfdbfe', fontSize: 13, fontWeight: 700, marginTop: 3 }}>
                {discountLabel} on all services
              </div>
              {promo.description && <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 2 }}>{promo.description}</div>}
              {expiryText && <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 4 }}>⏰ Valid until {expiryText}</div>}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

            {/* Mode switcher */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recipients</div>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3, gap: 3 }}>
                {[{ key: 'ALL', label: '👥 All Clients' }, { key: 'SELECT', label: '🎯 Select Clients' }].map(({ key, label }) => (
                  <button key={key} type="button"
                    onClick={() => { setMode(key); setResult(null) }}
                    disabled={sending || !!result}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 6, border: 'none',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                      background: mode === key ? '#2563eb' : 'transparent',
                      color: mode === key ? '#fff' : '#64748b',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Status badge */}
            <div style={{
              flexShrink: 0,
              background: custError ? 'rgba(239,68,68,0.1)' : (mode === 'SELECT' && selected.size === 0 && !custLoading) ? 'rgba(251,191,36,0.08)' : 'rgba(37,99,235,0.1)',
              border: `1px solid ${custError ? 'rgba(239,68,68,0.35)' : (mode === 'SELECT' && selected.size === 0 && !custLoading) ? 'rgba(251,191,36,0.3)' : 'rgba(37,99,235,0.25)'}`,
              borderRadius: 8, padding: '8px 12px', fontSize: 12,
              color: custError ? '#f87171' : (mode === 'SELECT' && selected.size === 0 && !custLoading) ? '#fbbf24' : '#93c5fd',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <span>{custError ? '⚠️' : (mode === 'SELECT' && selected.size === 0 && !custLoading) ? '⚠️' : '✓'}</span>
              <span>{recipientLabel}</span>
            </div>

            {/* Customer picker */}
            {mode === 'SELECT' && (
              <div style={{ flexShrink: 0, border: '2px solid #334155', borderRadius: 9, overflow: 'hidden', background: '#0d1526' }}>

                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: '#1a2744', borderBottom: '1px solid #334155' }}>
                  <span style={{ fontSize: 13 }}>🔍</span>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or email…"
                    disabled={sending || !!result || custLoading}
                    style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 12 }}
                  />
                  {search && <button type="button" onClick={() => setSearch('')}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>}
                </div>

                {/* Select all bar */}
                {!custLoading && !custError && filtered.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 12px', background: '#111827', borderBottom: '1px solid #1e293b' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{filtered.length} client{filtered.length !== 1 ? 's' : ''} with email</span>
                    <button type="button" onClick={() => toggleAll(filtered)} disabled={sending || !!result}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                      {filtered.every((c) => selected.has(c.id)) ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                )}

                {/* List */}
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {custLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>⏳ Loading clients…</div>
                  ) : custError ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#f87171', fontSize: 12 }}>⚠️ {custError}</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      {customers.length === 0 ? '📭 No clients with email on file' : '🔍 No results found'}
                    </div>
                  ) : filtered.map((c) => {
                    const checked = selected.has(c.id)
                    return (
                      <div key={c.id} onClick={() => !sending && !result && toggleCustomer(c.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                          cursor: 'pointer',
                          background: checked ? '#1e3a64' : '#0d1526',
                          borderBottom: '1px solid #1a2744',
                        }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${checked ? '#3b82f6' : '#475569'}`,
                          background: checked ? '#2563eb' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.full_name || '(no name)'}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.email}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Subject */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subject Line</label>
              <input
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject…" disabled={sending || !!result}
              />
            </div>

            {/* Message */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Intro Message
                <span style={{ fontWeight: 400, marginLeft: 6, color: '#475569', textTransform: 'none' }}>
                  (<code style={{ color: '#60a5fa' }}>{'{{customer_name}}'}</code> supported)
                </span>
              </label>
              <textarea rows={4}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '9px 12px', color: '#e2e8f0', fontSize: 13, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.6 }}
                value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="Promotional intro message…" disabled={sending || !!result}
              />
            </div>

            {/* Results */}
            {result && (
              <div style={{ flexShrink: 0, background: result.failed > 0 && result.sent === 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${result.failed > 0 && result.sent === 0 ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)'}`, borderRadius: 9, padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: result.sent > 0 ? '#4ade80' : '#f87171', marginBottom: 8 }}>
                  {result.sent > 0 ? '✅ Emails sent successfully!' : '⚠️ Blast completed'}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: '#4ade80' }}>✓ Sent: <strong>{result.sent}</strong></span>
                  {result.skipped > 0 && <span style={{ color: '#fbbf24' }}>⏭ Skipped: <strong>{result.skipped}</strong></span>}
                  {result.failed > 0 && <span style={{ color: '#f87171' }}>✗ Failed: <strong>{result.failed}</strong></span>}
                  <span style={{ color: '#475569' }}>Total: <strong>{result.total}</strong></span>
                </div>
                {result.skipped > 0 && result.sent === 0 && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>All skipped — check SMTP settings in Configuration.</div>
                )}
              </div>
            )}

          </div>

          {/* Action buttons — fixed */}
          <div style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 10 }}>
            {result ? (
              <button className="btn-primary" onClick={onClose} style={{ width: '100%' }}>Done</button>
            ) : (
              <>
                <button className="btn-secondary" onClick={onClose} disabled={sending} style={{ flex: 1 }}>Cancel</button>
                <button className="btn-primary" onClick={handleSend}
                  disabled={sending || !subject.trim() || !message.trim() || (mode === 'SELECT' && selected.size === 0)}
                  style={{ flex: 2 }}>
                  {sending ? '⏳ Sending…' : mode === 'SELECT'
                    ? `📤 Send to ${selected.size || 0} Client${selected.size !== 1 ? 's' : ''}`
                    : '📤 Send to All Clients'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ══════════ RIGHT — Email Preview Panel ══════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Preview header bar */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#1a2236', flexShrink: 0,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              Email Preview
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: '#64748b', fontSize: 20,
                cursor: 'pointer', lineHeight: 1, padding: '2px 6px', borderRadius: 6,
              }}
              title="Close"
            >×</button>
          </div>

          {/* Scrollable preview */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            background: '#e5e7eb',
            padding: '20px 16px',
          }}>
            <div style={{ maxWidth: 540, margin: '0 auto', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
              <EmailPreview
                discountLabel={discountLabel}
                promoCode={promo.code}
                description={promo.description}
                expiryText={expiryText}
                bodyText={message || defaultMessage}
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
