import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete, apiPut, pushToast, buildApiUrl } from '../api/client'
import './CampaignsModal.css'

export function CampaignsModal({ token, onClose, customerIds = [] }) {
  const [loading, setLoading] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [page, setPage] = useState(1)
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState(null)
  const [configDefaults, setConfigDefaults] = useState({})
  const [blastResult, setBlastResult] = useState(null)

  useEffect(() => {
    async function loadConfigDefaults() {
      let map = {}
      try {
        const arr = await apiGet('/config/category/email', token)
        for (const item of (Array.isArray(arr) ? arr : [])) {
          map[item.key] = item.value
        }
        setConfigDefaults(map)
      } catch (e) {}
      if (customerIds.length > 0) {
        setEditing({
          name:            map.default_campaign_name    || '',
          subject:         map.default_campaign_subject || '',
          content:         map.default_campaign_content || '',
          cta_label:       map.default_cta_label        || 'ENROLL NOW',
          cta_url:         map.default_cta_url          || '',
          sender_name:     map.default_sender_name      || '',
          sender_email:    map.default_sender_email     || '',
          audience:        'CUSTOM',
          customer_ids:    customerIds,
          default_schedule_timezone: map.default_schedule_timezone || 'Asia/Manila',
        })
        setShowEditor(true)
      }
    }
    loadConfigDefaults()
  }, [token, customerIds])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet('/email-campaigns', token, { page })
      setCampaigns(res.data || [])
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setLoading(false)
    }
  }, [token, page])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing({
      name:            configDefaults.default_campaign_name    || '',
      subject:         configDefaults.default_campaign_subject || '',
      content:         configDefaults.default_campaign_content || '',
      cta_label:       configDefaults.default_cta_label        || 'ENROLL NOW',
      cta_url:         configDefaults.default_cta_url          || '',
      sender_name:     configDefaults.default_sender_name      || '',
      sender_email:    configDefaults.default_sender_email     || '',
      audience:        customerIds.length > 0 ? 'CUSTOM' : (configDefaults.default_audience || 'ALL'),
      customer_ids:    customerIds.length > 0 ? customerIds : undefined,
      scheduled_at:    configDefaults.default_scheduled_at     || null,
      default_schedule_timezone: configDefaults.default_schedule_timezone || 'Asia/Manila',
    })
    setShowEditor(true)
  }

  async function handleSave(campaign) {
    try {
      const promoData = campaign._promoData || null
      const { _promoData, ...cleanCampaign } = campaign

      if (campaign.id) {
        await apiPatch(`/email-campaigns/${campaign.id}`, token, cleanCampaign)
        if (promoData) {
          await apiPost('/promo-codes', token, { ...promoData, campaign_id: campaign.id })
        }
        pushToast('success', 'Campaign updated')
      } else {
        const ids = Array.isArray(campaign.customer_ids) ? campaign.customer_ids : []
        if (customerIds.length > 0 && ids.length > 0) {
          const result = await apiPost('/customers/email-blast', token, {
            customerIds: ids,
            subject: cleanCampaign.subject,
            content: cleanCampaign.content,
            sender_name:  cleanCampaign.sender_name  || '',
            sender_email: cleanCampaign.sender_email || '',
            banner_image_url: cleanCampaign.banner_image_url,
            cta_label: cleanCampaign.cta_label,
            cta_url:   cleanCampaign.cta_url,
            sendNow: true,
            ...(promoData ? {
              promotion: {
                name:           promoData.description || promoData.code,
                promo_code:     promoData.code,
                discount_value: promoData.discount_type === 'percent'
                  ? `${promoData.discount_value}%`
                  : `₱${promoData.discount_value}`,
                expiry_date: promoData.expires_at
                  ? new Date(promoData.expires_at).toLocaleDateString('en-PH')
                  : '',
              },
            } : {}),
          })
          const r = result?.results || {}
          setBlastResult({ sent: r.sent || 0, failed: r.failed || 0, skipped: r.skipped || 0, firstError: r.firstError || null })
          if (r.sent > 0) {
            pushToast('success', `Blast Complete! ${r.sent} sent.`)
          } else if (r.firstError) {
            pushToast('error', `Error: ${r.firstError}`)
          }
        } else {
          const created = await apiPost('/email-campaigns', token, cleanCampaign)
          if (promoData && created?.id) {
            try {
              await apiPost('/promo-codes', token, { ...promoData, campaign_id: created.id })
            } catch (_) {}
          }
          pushToast('success', 'Campaign created')
        }
      }
      setShowEditor(false)
      setEditing(null)
      await load()
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this campaign?')) return
    try {
      await apiDelete(`/email-campaigns/${id}`, token)
      pushToast('success', 'Campaign deleted')
      await load()
    } catch (e) {
      pushToast('error', e.message)
    }
  }

  async function handleActivate(id) {
    if (!window.confirm('Activate this campaign and send emails now?')) return
    try {
      const result = await apiPost(`/email-campaigns/${id}/activate`, token, {})
      pushToast('success', result?.message || 'Campaign activated')
      await load()
    } catch (e) { pushToast('error', e.message) }
  }

  return (
    <div className="campaign-modal-backdrop">
      <div className="campaign-modal-shell">
        <div className="campaign-modal-header">
          <div className="campaign-modal-title">
            <h3>Email Campaigns</h3>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={onClose}>Close</button>
            <button className="btn-primary" onClick={openNew}>New Campaign</button>
          </div>
        </div>

        <div className={`campaign-modal-body${showEditor ? ' editor-mode' : ''}`}>
          {blastResult && (
            <div style={{
              background: blastResult.failed > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              border: `1px solid ${blastResult.failed > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
              borderRadius: 12, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16
            }}>
              <span style={{ fontSize: 24 }}>{blastResult.failed > 0 ? '⚠️' : '✅'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>Blast results summarized</div>
                <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: '#4ade80' }}>{blastResult.sent} delivered</span>
                  {blastResult.skipped > 0 && <span style={{ marginLeft: 12, color: '#fbbf24' }}>{blastResult.skipped} skipped</span>}
                  {blastResult.failed > 0 && <span style={{ marginLeft: 12, color: '#f87171' }}>{blastResult.failed} failed</span>}
                </div>
              </div>
              <button onClick={() => setBlastResult(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
          )}

          {!showEditor ? (
            <div className="campaigns-table-container">
              <table className="campaigns-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40 }}>Loading campaigns…</td></tr>}
                  {!loading && campaigns.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 40 }}>No campaigns found.</td></tr>}
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, color: '#fff' }}>{c.name}</td>
                      <td>{c.subject}</td>
                      <td>
                        <span className={`status-tag status-${(c.status || '').toLowerCase()}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString('en-PH') : '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button className="btn-link" onClick={() => { setEditing(c); setShowEditor(true) }}>Edit</button>
                          <button className="btn-link" onClick={() => handleActivate(c.id)}>Activate</button>
                          <button className="btn-link danger" style={{ color: '#ef4444' }} onClick={() => handleDelete(c.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CampaignEditor
              token={token}
              campaign={editing}
              onCancel={() => { setShowEditor(false); setEditing(null) }}
              onSave={handleSave}
              isBlast={customerIds.length > 0}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const TEMPLATES = {
  NONE: {
    subject: '',
    body: 'Hello {{customer_name}},\n\n',
    cta_label: 'ENROLL NOW',
  },
  PROMO: {
    subject: '🎉 Exclusive Offer: {{discount_value}} Off for You!',
    body: 'Hello {{customer_name}},\n\nWe value your business at Master Auto and want to treat you to something special. Use promo code <strong>{{promo_code}}</strong> on your next visit to enjoy a discount on our quality services!\n\nBest regards,\nMasterAuto Team',
    cta_label: 'Book Service Now',
  },
  REMINDER: {
    subject: '🔧 Maintenance Reminder for your {{vehicle}}',
    body: 'Hi {{customer_name}},\n\nIt is almost time for your vehicle\'s scheduled maintenance. Regular check-ups for your <strong>{{vehicle}}</strong> are key to keeping it safe and reliable for years to come.\n\nBest regards,\nMasterAuto Team',
    cta_label: 'Schedule a Check-up',
  },
  THANK_YOU: {
    subject: '🙏 Thank You for Choosing Master Auto',
    body: 'Dear {{customer_name}},\n\nThank you for trusting us with your <strong>{{vehicle}}</strong>. We hope you enjoyed our service! Your satisfaction is our top priority, and we look forward to serving you again.\n\nBest regards,\nMasterAuto Team',
    cta_label: 'See Our Services',
  }
}

function CampaignEditor({ token, campaign: initial, onCancel, onSave, isBlast }) {
  const [model, setModel] = useState({ ...initial })
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [estimate, setEstimate] = useState(null)
  const [defaults, setDefaults] = useState({})
  const [mode, setMode] = useState('simple') // 'simple' | 'advanced'
  const [uploading, setUploading] = useState(false)

  const getImageUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
    const base = apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase
    return `${base}${url}`
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    
    setUploading(true)
    const formData = new FormData()
    formData.append('banner', file)

    try {
      const { url: uploadUrl, headers } = buildApiUrl('/email-campaigns/upload-banner', token)
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers,
        body: formData
      })
      const data = await res.json()
      if (res.ok) {
        change('banner_image_url', data.fileUrl)
        pushToast('success', 'Banner uploaded')
      } else {
        pushToast('error', data.message || 'Upload failed')
      }
    } catch (err) {
      pushToast('error', err.message)
    } finally {
      setUploading(false)
    }
  }
  
  // Structured fields for Simple Mode (matching the picture)
  const [intro, setIntro] = useState('')
  const [reminders, setReminders] = useState('')
  const [closing, setClosing] = useState('')
  
  const [usePromo, setUsePromo]           = useState(false)
  const [promoCode, setPromoCode]         = useState('')
  const [promoDiscType, setPromoDiscType] = useState('percent')
  const [promoDiscVal, setPromoDiscVal]   = useState('')
  const [promoExpiry, setPromoExpiry]     = useState('')
  const [promoDesc, setPromoDesc]         = useState('')
  
  const introRef = useRef(null)
  const remindersRef = useRef(null)
  const closingRef = useRef(null)
  const advancedRef = useRef(null)
  
  const [lastRef, setLastRef] = useState('intro') // 'intro' | 'reminders' | 'closing'

  const normalizeTokenSpacing = useCallback((value) => {
    if (!value) return ''
    const token = '(?:customer_name|vehicle|promo_code|discount_value)'
    let out = String(value)
    out = out.replace(new RegExp(`([^\\s>\\(\\{\\[\\n])(\\{\\{\\s*${token}\\s*\\}\\})`, 'gi'), '$1 $2')
    out = out.replace(new RegExp(`(\\{\\{\\s*${token}\\s*\\}\\})([^\\s<\\)\\}\\],.!?:;\\n])`, 'gi'), '$1 $2')
    return out
  }, [])

  useEffect(() => {
    async function loadDefaults() {
      try {
        const arr = await apiGet('/config/category/email', token)
        const mapped = {}
        for (const item of (Array.isArray(arr) ? arr : [])) {
          mapped[item.key] = item.value
        }
        setDefaults(mapped)
      } catch (e) {}
    }
    loadDefaults()
  }, [token])

  useEffect(() => {
    const fresh = { ...initial }
    setModel(fresh)
    
    // Attempt to split content back to intro/reminders/closing for simple mode
    if (fresh.content) {
      if (!fresh.content.includes('<table') && !fresh.content.includes('<div')) {
        setMode('simple')
        // Basic split logic if we can detect the delimiter we use below
        if (fresh.content.includes('⚠️ Important Reminders:')) {
          const parts = fresh.content.split('<strong>⚠️ Important Reminders:</strong><ul>')
          let introPart = (parts[0] || '').replace(/<br\s*\/?>/gi, '\n').trim()
          // Remove the default greeting if it exists to keep the textarea clean
          introPart = introPart.replace(/^Hello \{\{customer_name\}\},(\n|<br\/?>)+/i, '')
          setIntro(introPart)
          const sub = parts[1] || ''
          const subParts = sub.split('</ul>')
          const listHtml = subParts[0] || ''
          const listEntries = listHtml.match(/<li>(.*?)<\/li>/gi)
          if (listEntries) {
            setReminders(listEntries.map(li => li.replace(/<\/?li>/gi, '').trim()).join('\n'))
          }
          setClosing((subParts[1] || '').replace(/<br\s*\/?>/gi, '\n').trim())
        } else {
          let introPart = fresh.content.replace(/<br\s*\/?>/gi, '\n')
          introPart = introPart.replace(/^Hello \{\{customer_name\}\},(\n|<br\/?>)+/i, '')
          setIntro(introPart)
        }
      } else {
        setMode('advanced')
      }
    }
  }, [initial])

  function change(k, v) { setModel((p) => ({ ...p, [k]: v })) }

  // Sync simple mode fields to model.content
  useEffect(() => {
    if (mode === 'simple') {
      const greetingHtml = 'Hello {{customer_name}},<br/><br/>'
      const introHtml = (intro || '').trim().replace(/\n/g, '<br/>')
      let remindersHtml = ''
      if (reminders && reminders.trim()) {
        const items = reminders.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        remindersHtml = `<br/><br/><strong>⚠️ Important Reminders:</strong><br/><ul style="margin: 10px 0; padding-left: 20px;">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
      }
      const closingHtml = closing ? `<br/><br/>${closing.trim().replace(/\n/g, '<br/>')}` : ''
      
      const compiled = `${greetingHtml}${introHtml}${remindersHtml}${closingHtml}`
      setModel(p => ({ ...p, content: compiled }))
    }
  }, [intro, reminders, closing, mode])

  useEffect(() => {
    let mounted = true
    const timer = setTimeout(async () => {
      try {
        const filters = {
          audience: model.audience || 'ALL',
          min_spend: model.min_spend || undefined,
          vehicle_type: model.vehicle_type || undefined,
          customer_ids: model.customer_ids || undefined,
        }
        const res = await apiPost('/email-campaigns/estimate', token, filters)
        if (mounted) setEstimate(res.count)
      } catch (e) {}
    }, 500)
    return () => { mounted = false; clearTimeout(timer) }
  }, [model.audience, model.min_spend, model.vehicle_type, model.customer_ids, token])

  function applyTemplate(tId) {
    const t = TEMPLATES[tId]
    if (!t) return
    change('subject', t.subject)
    change('cta_label', t.cta_label)
    setIntro(t.body)
    setReminders('')
    setClosing('Thank you for choosing MasterAuto!')
    setMode('simple')
    if (tId === 'PROMO') setUsePromo(true)
  }

  function getActiveState() {
    if (mode === 'advanced') return { ref: advancedRef.current, val: model.content || '', set: (v) => change('content', v) }
    if (lastRef === 'reminders') return { ref: remindersRef.current, val: reminders || '', set: setReminders }
    if (lastRef === 'closing') return { ref: closingRef.current, val: closing || '', set: setClosing }
    return { ref: introRef.current, val: intro || '', set: setIntro }
  }

  function insertVar(v) {
    const { ref: target, val: current, set: setVal } = getActiveState()
    if (!target) return
    const start = target.selectionStart
    const end   = target.selectionEnd

    const before = (current || '').slice(0, start)
    const after = (current || '').slice(end)
    const prevCh = before.length ? before[before.length - 1] : ''
    const nextCh = after.length ? after[0] : ''

    const boundaryBefore = new Set(['>', '(', '{', '[', '\n'])
    const boundaryAfter = new Set(['<', ')', '}', ']', ',', '.', '!', '?', ':', ';', '\n'])
    const needsLeadingSpace = prevCh && !/\s/.test(prevCh) && !boundaryBefore.has(prevCh)
    const needsTrailingSpace = nextCh && !/\s/.test(nextCh) && !boundaryAfter.has(nextCh)
    const insertText = `${needsLeadingSpace ? ' ' : ''}${v}${needsTrailingSpace ? ' ' : ''}`

    const next = before + insertText + after
    
    setVal(next)
    
    setTimeout(() => {
      target.focus()
      target.selectionStart = target.selectionEnd = start + insertText.length
    }, 0)
  }

  function applyFormat(tag) {
    const { ref: target, val: current, set: setVal } = getActiveState()
    if (!target) return
    const start = target.selectionStart
    const end   = target.selectionEnd
    const selected = (current || '').slice(start, end)
    const openTag = `<${tag}>`
    const closeTag = `</${tag}>`
    const next = (current || '').slice(0, start) + openTag + selected + closeTag + (current || '').slice(end)
    
    setVal(next)
    
    setTimeout(() => {
      target.focus()
      target.selectionStart = start + openTag.length
      target.selectionEnd = end + openTag.length
    }, 0)
  }

  async function saveDefaults() {
    setSavingDefaults(true)
    try {
      const updates = {
        default_sender_name: model.sender_name || defaults.default_sender_name || '',
        default_sender_email: model.sender_email || defaults.default_sender_email || '',
        default_campaign_content: model.content || defaults.default_campaign_content || '',
        default_cta_label: model.cta_label || defaults.default_cta_label || 'ENROLL NOW',
        throttle_batch_size: model.throttle_batch_size || defaults.throttle_batch_size || 200,
        throttle_delay_ms: model.throttle_delay_ms || defaults.throttle_delay_ms || 1000,
        default_schedule_timezone: model.default_schedule_timezone || defaults.default_schedule_timezone || 'Asia/Manila'
      }
      for (const [key, value] of Object.entries(updates)) {
        await apiPut(`/config/email/${key}`, token, { value: String(value) })
      }
      pushToast('success', 'Email defaults updated')
    } catch (e) {
      pushToast('error', e.message)
    } finally {
      setSavingDefaults(false)
    }
  }

  async function save() {
    if (!model.subject) return pushToast('error', 'Subject is required')
    if (!model.content) return pushToast('error', 'Content is required')
    
    const toSave = { ...model, content: normalizeTokenSpacing(model.content || '') }
    if (!toSave.name) toSave.name = `Campaign - ${new Date().toLocaleString()}`

    if (usePromo && promoCode.trim()) {
      toSave._promoData = {
        code:           promoCode.trim().toUpperCase(),
        discount_type:  promoDiscType,
        discount_value: Number(promoDiscVal) || 0,
        expires_at:     promoExpiry || null,
        description:    promoDesc || null,
      }
    }
    await onSave(toSave)
  }

  const renderPreview = () => {
    let html = normalizeTokenSpacing(model.content || '')
      .replace(/\{\{customer_name\}\}/gi, '<strong>Valued Client</strong>')
      .replace(/\{\{vehicle\}\}/gi, '<strong>Your Vehicle</strong>')
      .replace(/\{\{discount_value\}\}/gi, `<strong>${promoDiscType === 'percent' ? `${promoDiscVal}%` : `₱${promoDiscVal}`}</strong>`)

    const promoHtml = `<span style="background:#fefce8; padding:2px 6px; border:1px dashed #facc15; border-radius:4px; font-weight:700;">${usePromo ? promoCode : 'PROMO2026'}</span>`
    html = html.replace(/\{\{promo_code\}\}/gi, promoHtml)
    
    return { __html: html }
  }

  return (
    <div className="campaign-editor">
      <div className="campaign-editor-scroll">
      {/* ── Mode Toggle & Templates ── */}
      <div className="editor-section" style={{ background: '#1c2230', border: '1px solid #2d3748' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className={`btn-outline ${mode === 'simple' ? 'active' : ''}`} onClick={() => setMode('simple')} style={{ borderColor: mode === 'simple' ? '#4ade80' : '' }}>Simple Editor</button>
            <button className={`btn-outline ${mode === 'advanced' ? 'active' : ''}`} onClick={() => setMode('advanced')} style={{ borderColor: mode === 'advanced' ? '#4ade80' : '' }}>Advanced HTML</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Load Template:</span>
            <button className="btn-tag" onClick={() => applyTemplate('PROMO')}>Offer</button>
            <button className="btn-tag" onClick={() => applyTemplate('REMINDER')}>Reminder</button>
            <button className="btn-tag" onClick={() => applyTemplate('THANK_YOU')}>Thanks</button>
          </div>
        </div>
      </div>

      <div className="editor-section">
        <div className="editor-section-title"><span>📝</span> Campaign Info</div>
        <div className="editor-grid">
          <div className="campaign-field full-width">
            <label>Subject Line</label>
            <input className="campaign-input" value={model.subject || ''} onChange={(e) => change('subject', e.target.value)} placeholder="Wait! Here is {{discount_value}} Off…" />
          </div>
          <div className="campaign-field">
            <label>Sender Display Name</label>
            <input className="campaign-input" value={model.sender_name || ''} onChange={(e) => change('sender_name', e.target.value)} />
          </div>
          <div className="campaign-field">
            <label>Sender Address</label>
            <input className="campaign-input" value={model.sender_email || ''} onChange={(e) => change('sender_email', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="campaign-editor-layout">
        <div className="editor-form-panel">
          <div className="editor-section">
            <div className="editor-section-title"><span>📧</span> Content</div>
            <div className="campaign-field">
              <label>Campaign Name / Category</label>
              <input className="campaign-input" value={model.name || ''} onChange={(e) => change('name', e.target.value)} placeholder="e.g. Summer Special 2026" />
            </div>
            
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-tag" onClick={() => applyFormat('strong')} title="Bold"><strong>B</strong></button>
                  <button className="btn-tag" onClick={() => applyFormat('em')} title="Italic"><em>I</em></button>
                  <button className="btn-tag" onClick={() => applyFormat('u')} title="Underline"><u>U</u></button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Insert:</span>
                  <button className="btn-tag" onClick={() => insertVar('{{customer_name}}')}>Name</button>
                  <button className="btn-tag" onClick={() => insertVar('{{vehicle}}')}>Vehicle</button>
                  <button className="btn-tag" onClick={() => insertVar('{{discount_value}}')}>Value</button>
                </div>
              </div>
            </div>

            <div className="campaign-field" style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>PROMOTION BANNER IMAGE</label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                {model.banner_image_url ? (
                  <div style={{ position: 'relative' }}>
                    <img src={getImageUrl(model.banner_image_url)} alt="Banner" style={{ width: 120, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #2d3748' }} />
                    <button 
                      onClick={() => change('banner_image_url', null)}
                      style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >✕</button>
                  </div>
                ) : (
                  <div style={{ width: 120, height: 60, border: '2px dashed #2d3748', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <span style={{ fontSize: 20 }}>🖼️</span>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <input 
                    type="file" 
                    id="banner-upload" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    style={{ display: 'none' }} 
                  />
                  <label htmlFor="banner-upload" className="btn-outline" style={{ display: 'inline-block', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? 'Uploading...' : model.banner_image_url ? 'Change Banner' : 'Upload Banner'}
                  </label>
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Recommended: High resolution landscape image. Will be centered in the email.</p>
                </div>
              </div>
            </div>

            {mode === 'simple' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div className="campaign-field">
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>GREETING / INTRO MESSAGE</label>
                  <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600, margin: '8px 0' }}>Hello {"{{customer_name}}"},</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>The opening paragraph shown after the greeting prefix.</div>
                  <textarea 
                    ref={introRef}
                    className="campaign-textarea" 
                    value={intro} 
                    onFocus={() => setLastRef('intro')}
                    onChange={(e) => setIntro(e.target.value)} 
                    placeholder="e.g. Great news! Your service quotation has been APPROVED..." 
                    rows={4} 
                  />
                </div>

                <div className="campaign-field">
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>IMPORTANT REMINDERS (ONE PER LINE)</label>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, marginBottom: 8 }}>Each line becomes a bullet point in the "⚠️ Important Reminders" section.</div>
                  <textarea 
                    ref={remindersRef}
                    className="campaign-textarea" 
                    value={reminders} 
                    onFocus={() => setLastRef('reminders')}
                    onChange={(e) => setReminders(e.target.value)} 
                    placeholder="e.g. Please arrive on time..." 
                    rows={6} 
                  />
                </div>

                <div className="campaign-field">
                  <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>CLOSING MESSAGE</label>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, marginBottom: 8 }}>The final paragraph shown before the email signature.</div>
                  <textarea 
                    ref={closingRef}
                    className="campaign-textarea" 
                    value={closing} 
                    onFocus={() => setLastRef('closing')}
                    onChange={(e) => setClosing(e.target.value)} 
                    placeholder="e.g. Thank you for trusting MasterAuto!" 
                    rows={3} 
                  />
                </div>
              </div>
            ) : (
              <div className="campaign-field">
                <label>Raw HTML Editor</label>
                <textarea 
                  ref={advancedRef}
                  className="campaign-textarea" 
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                  value={model.content || ''} 
                  onChange={(e) => change('content', e.target.value)} 
                  rows={15} 
                />
              </div>
            )}
            
            <div className="editor-grid" style={{ marginTop: 20 }}>
              <div className="campaign-field">
                <label>CTA Button Text</label>
                <input className="campaign-input" value={model.cta_label || ''} onChange={(e) => change('cta_label', e.target.value)} />
              </div>
              <div className="campaign-field">
                <label>CTA Button URL</label>
                <input className="campaign-input" value={model.cta_url || ''} onChange={(e) => change('cta_url', e.target.value)} placeholder="https://…" />
              </div>
            </div>
          </div>

          <div className="editor-section">
            <div className="editor-section-title"><span>🎯</span> Audience Target</div>
            <div className="editor-grid">
              <div className="campaign-field">
                <label>Recipient Filter</label>
                <select className="campaign-select" value={model.audience || 'ALL'} onChange={(e) => change('audience', e.target.value)}>
                  <option value="ALL">All Active Customers</option>
                  <option value="FIRST_TIME">First-Time Customers</option>
                  <option value="INACTIVE">Inactive (No visits in 90 days)</option>
                  <option value="CUSTOM">Custom Select (CRM)</option>
                </select>
              </div>
              <div className="campaign-field">
                <label>Vehicle Filter</label>
                <input className="campaign-input" value={model.vehicle_type || ''} onChange={(e) => change('vehicle_type', e.target.value)} placeholder="SUV, Sedan…" />
              </div>
            </div>
            <div className="audience-summary">
              <span>👥</span> Estimated Reach: <span className="audience-count">{estimate === null ? 'calculating…' : `${estimate} recipients`}</span>
            </div>
          </div>
        </div>

        <div className="preview-panel">
          <div style={{ padding: '0 0 12px 0', borderBottom: '1px solid #1e293b', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Branded Preview</div>
            <span style={{ fontSize: 11, color: '#4ade80', background: 'rgba(74,222,128,0.1)', padding: '2px 8px', borderRadius: 4 }}>Premium Design Applied</span>
          </div>

          <div className="email-preview-container">
            <div style={{ background: '#1a56db', padding: '22px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <img
                  src="/images/logo.png"
                  alt="MasterAuto"
                  style={{ width: 40, height: 40, objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)', opacity: 0.95 }}
                />
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '-0.2px' }}>MasterAuto Special Update</div>
              </div>
              <div style={{ color: '#bfdbfe', fontSize: 12, marginTop: 4 }}>{model.subject || 'A message from our team'}</div>
            </div>
            <div style={{ background: '#fff', color: '#1e293b', padding: '32px 30px', fontSize: 15, lineHeight: 1.6 }}>
              {model.banner_image_url && (
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <img 
                    src={getImageUrl(model.banner_image_url)} 
                    alt="Promotion Banner" 
                    style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'block', margin: '0 auto' }} 
                  />
                </div>
              )}
              <div dangerouslySetInnerHTML={renderPreview()} />

              {model.cta_label && (
                <div style={{ textAlign: 'center', margin: '32px 0' }}>
                  <div style={{ background: '#1a56db', color: '#fff', padding: '12px 24px', borderRadius: 6, display: 'inline-block', fontWeight: 700, fontSize: 16 }}>
                    {model.cta_label}
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '32px 0' }} />
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>
                Thank you for being a valued customer of <strong>MasterAuto</strong>.<br/>
                <em>— The MasterAuto Team</em>
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 11, borderTop: '1px solid #e2e8f0' }}>
              © {new Date().getFullYear()} MasterAuto · All rights reserved
            </div>
          </div>
        </div>
      </div>

      </div>

      <div className="editor-footer">
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn-outline" onClick={saveDefaults} disabled={savingDefaults}>{savingDefaults ? 'Saving…' : 'Set as Default'}</button>
        <button className="btn-primary" onClick={save}>{model.id ? 'Save Changes' : isBlast ? 'Send Blast Now' : 'Create Campaign'}</button>
      </div>
    </div>
  )
}

export default CampaignsModal
