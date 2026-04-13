import { useEffect, useRef, useState } from 'react'
import '../LandingPage.css'
import { createLandingVisitorRealtimeClient } from '../utils/realtime'

const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'
const RAW_API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
const API_BASE = (() => {
  const trimmed = String(RAW_API_BASE || '').replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
})()
const PORTAL_BASE = `${API_BASE}/portal`
const PUBLIC_BASE = `${API_BASE}/public`
const LANDING_CHAT_TOKEN_KEY = 'ma_landing_chat_token'

async function portalFetch(path, body) {
  const res = await fetch(`${PORTAL_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `Error ${res.status}`)
  return json
}

async function publicChatFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${PUBLIC_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `Error ${res.status}`)
  return json
}

const FEATURED = [
  {
    id: 'ppf',
    name: 'Paint Protection Film',
    short: 'Paint Protection Film (PPF) is a transparent and durable film applied to your vehicle’s painted surfaces to protect it from scratches, rock chips, stains, and environmental damage. This high-quality protective layer helps maintain the original paint while keeping your car looking brand new. PPF also has self-healing properties that allow minor scratches to disappear with heat, ensuring long-lasting protection and shine.',
    image: '/images/ppf.avif',
    tag: 'Self-Healing Shield',
    details: [
      { label: 'Coverage', value: 'Partial or Full Body' },
      { label: 'Self-Healing', value: 'Minutes in heat' },
      { label: 'Film Thickness', value: '8 mil TPU' },
      { label: 'Warranty', value: '10 Years' },
    ],
    bullets: [
      'Virtually invisible protection layer on paint',
      'Self-heals minor swirl marks and light scratches',
      'Resistant to road debris, bugs and tar',
      'Preserves resale value of your vehicle',
    ],
  },
  {
    id: 'ceramic',
    name: 'Graphene Ceramic Coating',
    short: 'Graphene Ceramic Coating is an advanced protective layer that bonds with your car’s paint, creating a strong shield against dirt, UV rays, chemicals, and water spots. It enhances the gloss and depth of your vehicle’s finish while providing hydrophobic properties that repel water and contaminants. This coating helps keep your car cleaner for longer and makes maintenance easier.',
    image: '/images/graphene.avif',
    tag: 'Nano-Ceramic Gloss',
    details: [
      { label: 'Hardness', value: '9H Ceramic' },
      { label: 'Hydrophobic', value: 'Contact angle >110°' },
      { label: 'Brands', value: 'Gtechniq, Gyeon, CARPRO' },
      { label: 'Warranty', value: '25 Years' },
    ],
    bullets: [
      'Creates a permanent glass-like coating on paint',
      'Extreme water beading and easy cleaning',
      'Chemical and UV resistant finish',
      'Enhances and deepens paint color and gloss',
    ],
  },
  {
    id: 'tint',
    name: 'Window Tinting',
    short: 'Window Tinting improves both the appearance and comfort of your vehicle by applying a high-quality tinted film to the windows. It reduces heat, blocks harmful UV rays, and increases privacy while enhancing the car’s sleek look. Window tinting also helps protect your interior from fading and improves driving comfort by reducing glare from the sun.',
    image: '/images/window.avif',
    tag: 'UV & Heat Protection',
    details: [
      { label: 'UV Ray Rejection', value: 'Up to 99%' },
      { label: 'Heat Rejection', value: 'Up to 78%' },
      { label: 'Film Brands', value: 'LLumar, 3M, SunTek' },
      { label: 'Warranty', value: 'Lifetime' },
    ],
    bullets: [
      'Reduces interior heat and glare significantly',
      'Protects upholstery and dashboard from fading',
      'Available in multiple shades and tint levels',
      'Safe for all vehicle types including hybrids',
    ],
  },
  {
    id: 'detailing',
    name: 'Interior & Exterior Detailing',
    short: 'Interior and Exterior Detailing is a complete cleaning and restoration process that brings your vehicle back to its best condition. The service includes deep cleaning of the interior such as seats, carpets, and dashboard, as well as thorough exterior washing, polishing, and paint enhancement. Detailing removes dirt, stains, and contaminants while restoring the shine and cleanliness of your vehicle.',
    image: '/images/detailing.avif',
    tag: 'Deep Clean',
    details: [
      { label: 'Interior', value: 'Full Deep Clean' },
      { label: 'Exterior', value: 'Clay + Polish' },
      { label: 'Engine Bay', value: 'Available' },
      { label: 'Duration', value: '4–8 Hours' },
    ],
    bullets: [
      'Complete interior vacuum and shampooing',
      'Exterior clay bar and paint decontamination',
      'Trim dressing and glass polishing',
      'Odor elimination treatment',
    ],
  },
  {
    id: 'seat',
    name: 'Seat Cover',
    short: 'Seat Cover Installation enhances your vehicle’s interior by adding stylish, comfortable, and protective seat covers. High-quality materials such as leather or premium fabric are installed to protect the original seats from wear, stains, and damage. This service improves the overall look of the interior while increasing comfort and preserving the value of your vehicle.',
    image: '/images/seatcover.avif',
    tag: 'Interior Upgrade',
    details: [
      { label: 'Material', value: 'Leather / Neoprene' },
      { label: 'Fit', value: 'Custom per vehicle' },
      { label: 'Colors', value: 'Full palette' },
      { label: 'Install', value: 'Same day' },
    ],
    bullets: [
      'Protects OEM seats from wear and stains',
      'Precision cut and stitched for your model',
      'Breathable and easy-to-clean materials',
      'Includes headrest and armrest covers',
    ],
  },
]

function formatChatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function VideoGalleryModal({ src, onClose }) {
  const videoRef = useRef(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = e => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const node = videoRef.current
    if (!node) return
    let cancelled = false

    const attemptPlay = () => {
      if (cancelled) return
      try {
        node.load?.()
      } catch {
        // ignore
      }
      node.play?.().catch(() => {})
    }

    const rafId = requestAnimationFrame(() => {
      attemptPlay()
      setTimeout(attemptPlay, 120)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [src])

  return (
    <div className="lp-vg-overlay" role="dialog" aria-modal="true">
      <div className="lp-vg-backdrop" onClick={onClose} />
      <div className="lp-vg-modal" onClick={e => e.stopPropagation()}>
        <button className="lp-modal-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        {loadError && (
          <div className="lp-vg-error">
            <div className="lp-vg-error-title">Video failed to load</div>
            <div className="lp-vg-error-sub">
              <a href={src} target="_blank" rel="noreferrer">Open video in new tab</a>
            </div>
          </div>
        )}
        <video
          key={src}
          ref={videoRef}
          className="lp-vg-player"
          src={src}
          controls
          autoPlay
          muted
          playsInline
          preload="metadata"
          onError={() => setLoadError(true)}
          onLoadedData={() => setLoadError(false)}
        />
      </div>
    </div>
  )
}

function AuthModal({ prefillService, onClose }) {
  const [tab, setTab] = useState('register')
  const [reg, setReg] = useState({ fullName: '', email: '', mobile: '', address: '', password: '' })
  const [login, setLogin] = useState({ identifier: '', password: '' })
  const [verify, setVerify] = useState({ email: '', code: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const setR = (k, v) => { setReg(p => ({ ...p, [k]: v })); setError(''); setNotice('') }
  const setL = (k, v) => { setLogin(p => ({ ...p, [k]: v })); setError(''); setNotice('') }
  const setV = (k, v) => { setVerify(p => ({ ...p, [k]: v })); setError(''); setNotice('') }

  async function handleRegister(e) {
    e.preventDefault()
    if (!reg.fullName || !reg.mobile || !reg.email || !reg.password) return setError('Full name, mobile, email, and password are required.')
    if (reg.password.length < 6) return setError('Password must be at least 6 characters.')
    try {
      setLoading(true)
      const d = await portalFetch('/auth/register', {
        fullName: reg.fullName,
        email: reg.email,
        mobile: reg.mobile,
        address: reg.address,
        password: reg.password,
      })
      if (d?.requiresEmailVerification) {
        setVerify({ email: d.email || reg.email, code: '' })
        setTab('verify')
        setNotice(d.message || 'Verification code sent. Please check your email.')
        return
      }

      // Backwards-compat fallback
      localStorage.setItem('ma_portal_token', d.token)
      localStorage.setItem('ma_portal_customer', JSON.stringify(d.customer))
      window.location.href = '/portal'
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!login.identifier || !login.password) return setError('Email/mobile and password are required.')
    try {
      setLoading(true)
      const d = await portalFetch('/auth/login', { identifier: login.identifier, password: login.password })
      localStorage.setItem('ma_portal_token', d.token)
      localStorage.setItem('ma_portal_customer', JSON.stringify(d.customer))
      window.location.href = '/portal'
    } catch (err) {
      if (err?.requiresEmailVerification && err?.email) {
        setVerify({ email: err.email, code: '' })
        setTab('verify')
        setNotice('Please enter the verification code sent to your email.')
      } else {
        setError(err.message)
      }
    }
    finally { setLoading(false) }
  }

  async function handleVerify(e) {
    e.preventDefault()
    if (!verify.email || !verify.code) return setError('Email and verification code are required.')
    try {
      setLoading(true)
      const d = await portalFetch('/auth/verify-email', { email: verify.email, code: verify.code })
      localStorage.setItem('ma_portal_token', d.token)
      localStorage.setItem('ma_portal_customer', JSON.stringify(d.customer))
      window.location.href = '/portal'
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function handleResend() {
    if (!verify.email) return setError('Email is required.')
    try {
      setLoading(true)
      const d = await portalFetch('/auth/resend-verification', { email: verify.email })
      setNotice(d?.message || 'Verification code sent.')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="lp-overlay" onClick={onClose}>
      <div className="lp-modal" onClick={e => e.stopPropagation()}>
        <button className="lp-modal-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Header banner */}
        <div className="lp-modal-head">
          <div className="lp-modal-logo" aria-hidden="true">
            <img src="/images/logo.png" alt="" />
          </div>
          <p className="lp-modal-title">
            {prefillService ? 'Book a Service' : tab === 'register' ? 'Create Account' : 'Welcome Back'}
          </p>
          <p className="lp-modal-sub">
            {prefillService
              ? prefillService.name
              : tab === 'register'
                ? 'Register to book appointments and pay online'
                : 'Sign in to access your Customer Portal'}
          </p>
        </div>

        {/* Body */}
        <div className="lp-modal-body">
          <div className="lp-modal-tabs">
            <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError('') }}>Create Account</button>
            <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError('') }}>Sign In</button>
          </div>
          {tab === 'register' ? (
            <form onSubmit={handleRegister}>
              <div className="lp-field"><label>Full Name *</label><input value={reg.fullName} onChange={e => setR('fullName', e.target.value)} placeholder="Juan dela Cruz" autoFocus /></div>
              <div className="lp-field"><label>Mobile Number *</label><input value={reg.mobile} onChange={e => setR('mobile', e.target.value)} placeholder="09171234567" /></div>
              <div className="lp-field"><label>Email *</label><input type="email" value={reg.email} onChange={e => setR('email', e.target.value)} placeholder="juan@email.com" required /></div>
              <div className="lp-field"><label>Address</label><input value={reg.address} onChange={e => setR('address', e.target.value)} placeholder="Street, Barangay, City" /></div>
              <div className="lp-field"><label>Password *</label><input type="password" value={reg.password} onChange={e => setR('password', e.target.value)} placeholder="Min. 6 characters" /></div>
              {error && <p className="lp-modal-err">{error}</p>}
              <button type="submit" className="lp-modal-submit" disabled={loading}>{loading ? 'Creating Account…' : 'Register & Continue to Portal'}</button>
              <p className="lp-modal-hint">You will be redirected to book your appointment and pay online.</p>
            </form>
          ) : tab === 'verify' ? (
            <form onSubmit={handleVerify}>
              <div className="lp-field"><label>Email *</label><input type="email" value={verify.email} onChange={e => setV('email', e.target.value)} placeholder="juan@email.com" required autoFocus /></div>
              <div className="lp-field"><label>Verification Code *</label><input value={verify.code} onChange={e => setV('code', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric" maxLength={6} required /></div>
              {notice && <p className="lp-modal-hint">{notice}</p>}
              {error && <p className="lp-modal-err">{error}</p>}
              <button type="submit" className="lp-modal-submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify & Continue'}</button>
              <p className="lp-modal-hint">
                Didn’t receive a code?{' '}
                <button type="button" className="auth-link" onClick={handleResend} disabled={loading}>Resend</button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <div className="lp-field"><label>Email or Mobile</label><input value={login.identifier} onChange={e => setL('identifier', e.target.value)} placeholder="Email or mobile number" autoFocus /></div>
              <div className="lp-field"><label>Password</label><input type="password" value={login.password} onChange={e => setL('password', e.target.value)} placeholder="Your password" /></div>
              {error && <p className="lp-modal-err">{error}</p>}
              <button type="submit" className="lp-modal-submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In to Portal'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function FanPanel({ svc, index, isActive, hasActive, onActivate }) {
  return (
    <div
      className={`lp-fan-panel${isActive ? ' is-active' : ''}`}
      onClick={() => onActivate(isActive ? null : index)}
    >
      <div className="lp-fan-bg" style={{ backgroundImage: `url(${svc.image})` }} />
      <div className="lp-fan-dim" />
      <div className="lp-fan-num">{String(index + 1).padStart(2, '0')}</div>
      <div className="lp-fan-title-wrap">
        <h3 className="lp-fan-title">{svc.name}</h3>
      </div>
      <div className="lp-fan-foot">
        <p className="lp-fan-short">{svc.short}</p>
        <button className="lp-fan-book" onClick={e => { e.stopPropagation(); window.location.href = '/guest' }}>
          Request Quotation
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
    </div>
  )
}

function LandingChatWidget() {
  const defaultWelcomeMessage =
    'Hello! Thank you for contacting Master Auto. Please share your concern and our assistant will acknowledge it first, then a SuperAdmin will respond shortly.'
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [threadNotice, setThreadNotice] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState(defaultWelcomeMessage)
  const [visitorToken, setVisitorToken] = useState(() => {
    try {
      return localStorage.getItem(LANDING_CHAT_TOKEN_KEY) || ''
    } catch {
      return ''
    }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const hydrateThread = async ({ token, name, forceFresh = false } = {}) => {
    setIsLoading(true)
    setChatError('')
    try {
      const priorToken = String(token || visitorToken || '')
      const data = await publicChatFetch('/chat/thread', {
        method: 'POST',
        body: {
          visitorToken: forceFresh ? undefined : token || visitorToken || undefined,
          visitorName: String(name || displayName || '').trim() || undefined,
        },
      })

      const nextToken = String(data?.thread?.visitorToken || '')
      const nextStatus = String(data?.thread?.status || '').toLowerCase()
      const nextWelcome = String(data?.welcomeMessage || '').trim() || defaultWelcomeMessage

      setWelcomeMessage(nextWelcome)

      if (nextStatus === 'closed' && !forceFresh) {
        setMessages([])
        setVisitorToken('')
        try {
          localStorage.removeItem(LANDING_CHAT_TOKEN_KEY)
        } catch {
          // ignore storage failures
        }
        setThreadNotice('Previous conversation was closed. A new chat has started.')
        await hydrateThread({ name, forceFresh: true })
        return
      }

      if (nextToken) {
        setVisitorToken(nextToken)
        try {
          localStorage.setItem(LANDING_CHAT_TOKEN_KEY, nextToken)
        } catch {
          // ignore storage failures
        }
      }

      if (!forceFresh && priorToken && nextToken && priorToken !== nextToken) {
        setThreadNotice('Previous conversation was closed. A new chat has started.')
      } else {
        setThreadNotice('')
      }

      const list = Array.isArray(data?.messages) ? data.messages : []
      setMessages(list)
    } catch (err) {
      setChatError(err.message || 'Failed to load chat')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    hydrateThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !visitorToken) return

    const timer = setInterval(async () => {
      try {
        const data = await publicChatFetch(`/chat/thread/${visitorToken}/messages`)
        const status = String(data?.thread?.status || '').toLowerCase()
        const nextWelcome = String(data?.welcomeMessage || '').trim() || defaultWelcomeMessage
        setWelcomeMessage(nextWelcome)
        if (status === 'closed') {
          setMessages([])
          setVisitorToken('')
          try {
            localStorage.removeItem(LANDING_CHAT_TOKEN_KEY)
          } catch {
            // ignore storage failures
          }
          setThreadNotice('Previous conversation was closed. A new chat has started.')
          await hydrateThread({ forceFresh: true })
          return
        }
        const list = Array.isArray(data?.messages) ? data.messages : []
        setMessages(list)
      } catch {
        // ignore polling errors to avoid noisy UI
      }
    }, 5000)

    return () => clearInterval(timer)
  }, [open, visitorToken])

  useEffect(() => {
    if (!open || !visitorToken) return

    const socket = createLandingVisitorRealtimeClient(visitorToken)
    if (!socket) return undefined

    const onNewMessage = (payload) => {
      const list = Array.isArray(payload?.messages) ? payload.messages : []
      if (!list.length) return
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const merged = [...prev]
        list.forEach((m) => {
          if (!existing.has(m.id)) merged.push(m)
        })
        return merged
      })
    }

    socket.on('landing-chat:new-message', onNewMessage)

    return () => {
      socket.off('landing-chat:new-message', onNewMessage)
      socket.disconnect()
    }
  }, [open, visitorToken])

  const submitMessage = async () => {
    const clean = String(draft || '').trim()
    if (!clean) return
    if (isSending) return

    setIsSending(true)
    setChatError('')
    try {
      let token = visitorToken
      if (!token) {
        const created = await publicChatFetch('/chat/thread', {
          method: 'POST',
          body: {
            visitorToken: undefined,
            visitorName: String(displayName || '').trim() || undefined,
          },
        })
        token = String(created?.thread?.visitorToken || '')
        if (token) {
          setVisitorToken(token)
          try {
            localStorage.setItem(LANDING_CHAT_TOKEN_KEY, token)
          } catch {
            // ignore
          }
        }
      }

      if (!token) throw new Error('Failed to initialize chat thread')

      const sent = await publicChatFetch(`/chat/thread/${token}/messages`, {
        method: 'POST',
        body: {
          message: clean,
          visitorName: String(displayName || '').trim() || undefined,
        },
      })

      const resolvedToken = String(sent?.thread?.visitorToken || token || '')
      if (resolvedToken && resolvedToken !== visitorToken) {
        setVisitorToken(resolvedToken)
        try {
          localStorage.setItem(LANDING_CHAT_TOKEN_KEY, resolvedToken)
        } catch {
          // ignore
        }

        if (token && resolvedToken !== token) {
          setThreadNotice('Previous conversation was closed. A new chat has started.')
        }
      }

      setDraft('')

      // Use immediate POST response to avoid surfacing transient token/fetch issues.
      const newMessages = Array.isArray(sent?.newMessages) ? sent.newMessages : []
      if (newMessages.length) {
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id))
          const merged = [...prev]
          newMessages.forEach((m) => {
            if (!existing.has(m.id)) merged.push(m)
          })
          return merged
        })
      }

      try {
        const data = await publicChatFetch(`/chat/thread/${resolvedToken}/messages`)
        const list = Array.isArray(data?.messages) ? data.messages : []
        setMessages(list)
      } catch {
        // Ignore follow-up fetch errors; realtime/polling will reconcile messages.
      }
    } catch (err) {
      setChatError(err.message || 'Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={`lp-chat${open ? ' is-open' : ''}`}>
      {open ? (
        <button
          type="button"
          className="lp-chat-backdrop"
          onClick={() => setOpen(false)}
          aria-label="Close chat panel"
        />
      ) : null}

      {open && (
        <div className="lp-chat-panel" role="dialog" aria-label="Landing page chat">
          <div className="lp-chat-head">
            <div>
              <p className="lp-chat-title">Chat Support</p>
            </div>
            <button type="button" className="lp-chat-close" onClick={() => setOpen(false)} aria-label="Close chat">x</button>
          </div>

          <label className="lp-chat-name-wrap">
            <span>Your name</span>
            <input
              className="lp-chat-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Guest"
            />
          </label>

          <div className="lp-chat-messages">
            {threadNotice ? (
              <article className="lp-chat-msg is-notice">
                <p>{threadNotice}</p>
                <time>{formatChatTime(Date.now())}</time>
              </article>
            ) : null}
            {isLoading && messages.length === 0 ? <p className="lp-chat-loading">Loading chat...</p> : null}
            {!isLoading && messages.length === 0 ? (
              <article className="lp-chat-msg is-system">
                <p>{welcomeMessage}</p>
                <time>{formatChatTime(Date.now())}</time>
              </article>
            ) : null}
            {messages.map((message) => {
              const sender = message.senderType === 'visitor' ? 'user' : 'system'
              return (
                <article key={message.id} className={`lp-chat-msg ${sender === 'user' ? 'is-user' : 'is-system'}`}>
                  <p>{message.message}</p>
                  <time>{formatChatTime(message.createdAt)}</time>
                </article>
              )
            })}
          </div>

          {chatError ? <p className="lp-chat-error">{chatError}</p> : null}

          <div className="lp-chat-compose">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message..."
              rows={2}
            />
            <button type="button" onClick={submitMessage} disabled={isSending || !String(draft || '').trim()}>
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="lp-chat-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close chat support' : 'Open chat support'}
        title={open ? 'Close chat' : 'Open chat'}
      >
        <span className="lp-chat-trigger-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
            <path d="M4.5 3A2.5 2.5 0 0 0 2 5.5v10A2.5 2.5 0 0 0 4.5 18H6v3a1 1 0 0 0 1.7.7L11.4 18h8.1A2.5 2.5 0 0 0 22 15.5v-10A2.5 2.5 0 0 0 19.5 3h-15z" />
          </svg>
        </span>
      </button>
    </div>
  )
}

export function LandingPage() {
  const [modal, setModal] = useState(null)
  const [fanActive, setFanActive] = useState(null)
  const [videoModalSrc, setVideoModalSrc] = useState(null)
  const servicesRef = useRef(null)
  const fanRef = useRef(null)

  const publicUrl = (path) => {
    const base = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '/')
    return `${base}${String(path || '').replace(/^\/+/, '')}`
  }

  const scrollTo = r => r?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Reset active panels when clicking outside
  useEffect(() => {
    const handle = e => {
      if (fanRef.current && !fanRef.current.contains(e.target)) setFanActive(null)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [])

  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="lp-hero-img" style={{ backgroundImage: 'url(/images/background.jpg)' }} />
        <div className="lp-hero-dim" />

        <div className="lp-hero-body">
          <div className="lp-hero-mark" aria-hidden="true">
            <img src="/images/logo-letter.png" alt="" />
          </div>
          <p className="lp-hero-eye">Professional Auto Care</p>
          <h1 className="lp-hero-h1">
            Paint Protection Film,<br />
            Premium Coatings<br />
            Window Tint, and Wash-over
          </h1>
          <div className="lp-hero-btns">
            <button className="lp-btn-o" onClick={() => window.location.href = '/guest'}>Request Quotation</button>
          </div>
        </div>

        {/* Bottom nav bar */}
        <div className="lp-hero-nav">
          {/* Login/Sign In entry removed */}
        </div>
      </section>

      <section className="lp-services" ref={servicesRef}>
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <p className="lp-eyebrow">What We Offer</p>
            <h2>Master Auto Services</h2>
            <div className="lp-rule" />
          </div>
          {/* ── 5-panel fan strip ── */}
          <div ref={fanRef} className={`lp-fan-grid${fanActive !== null ? ' has-active' : ''}`}>
            {FEATURED.map((svc, i) => (
              <FanPanel
                key={svc.id}
                svc={svc}
                index={i}
                isActive={fanActive === i}
                hasActive={fanActive !== null}
                onActivate={setFanActive}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="lp-how">
        <div className="lp-how-head">
          <p className="lp-eyebrow light">Video Gallery</p>
          <h2 className="lp-how-h2">Video Gallery</h2>
          <div className="lp-rule light" />
        </div>
        <div className="lp-vg-panels">
          {[
            {
              n: '01',
              t: 'Register',
              video: publicUrl('videos/video1.mp4'),
            },
            {
              n: '02',
              t: 'Book a Service',
              video: publicUrl('videos/video2.mp4'),
            },
            {
              n: '03',
              t: 'Drop Off & Enjoy',
              video: publicUrl('videos/video3.mp4'),
            },
            {
              n: '04',
              t: 'Video',
              video: publicUrl('videos/video4.mp4'),
            },
            {
              n: '05',
              t: 'Video',
              video: publicUrl('videos/video5.mp4'),
            },
          ].map((s, i) => (
            <a
              key={s.n}
              className="lp-vg-reel"
              href={s.video}
              aria-label={`Open video: ${s.t}`}
              onClick={e => {
                e.preventDefault()
                setVideoModalSrc(s.video)
              }}
            >
              <video
                className="lp-vg-video"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
              >
                <source src={s.video} type="video/mp4" />
              </video>
            </a>
          ))}
        </div>
      </section>

      {videoModalSrc && <VideoGalleryModal src={videoModalSrc} onClose={() => setVideoModalSrc(null)} />}

      <section className="lp-packages">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <p className="lp-eyebrow">Vehicle Care Services</p>
            <h2>Subscriptions &amp; Preventive Maintenance</h2>
            <div className="lp-rule" />
          </div>

          <div className="lp-packages-grid">
            <article className="lp-package-card">
              <h3>MasterAuto Subscription</h3>
              <p>
                Maintain your vehicle&apos;s flawless finish year-round by availing of our premium subscription packages.
                Membership guarantees priority booking, structured maintenance intervals, and exclusive rates.
              </p>
              <button
                type="button"
                className="lp-package-btn"
                onClick={() => {
                  try {
                    localStorage.setItem('ma_portal_landing_intent', 'subscription')
                  } catch {
                    // ignore localStorage failures
                  }
                  window.location.href = '/guest?tab=quote&intent=subscription'
                }}
              >
                Avail Subscription
              </button>
            </article>

            <article className="lp-package-card">
              <h3>Preventive Maintenance System (PMS)</h3>
              <p>
                Take control over your automotive investments through our digital Preventive Maintenance System (PMS).
                Avail our PMS packages to review service history, track active plans, and request detailing services.
              </p>
              <button
                type="button"
                className="lp-package-btn"
                onClick={() => {
                  try {
                    localStorage.setItem('ma_portal_landing_intent', 'pms')
                  } catch {
                    // ignore localStorage failures
                  }
                  window.location.href = '/guest?tab=quote&intent=pms'
                }}
              >
                Avail PMS
              </button>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-why">
        <div className="lp-wrap">
          <div className="lp-sec-head">
            <p className="lp-eyebrow">Our Standards</p>
            <h2>Why Choose Us</h2>
            <div className="lp-rule" />
          </div>

          <div className="lp-why-grid">
            <div className="lp-why-item">
              <h3>Process-driven workmanship</h3>
              <p>Each service follows clear preparation and installation steps to deliver consistent results—no rushed shortcuts.</p>
            </div>
            <div className="lp-why-item">
              <h3>Premium materials</h3>
              <p>We use proven films, coatings, and tint systems and match the right package to your vehicle’s needs and use case.</p>
            </div>
            <div className="lp-why-item">
              <h3>Clean, careful installation</h3>
              <p>Detail-focused work, protected surfaces, and precise finishing—because small edges and alignment matter.</p>
            </div>
            <div className="lp-why-item">
              <h3>Clear updates & aftercare</h3>
              <p>Transparent recommendations and practical maintenance guidance so your protection lasts and looks its best.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-cta-bg" style={{ backgroundImage: 'url(/images/howitworks.png)' }} />
        <div className="lp-cta-dim" />
        <div className="lp-wrap lp-cta-body">
          <h2>Ready to protect your vehicle?</h2>
          <p>
            Master Auto delivers premium vehicle protection and appearance services—including
            ceramic coating, paint protection film (PPF), window tinting, and detailing—performed
            with skilled workmanship and quality materials.
          </p>
          <div className="lp-cta-btns">
            <button className="lp-btn-w" onClick={() => { window.location.href = '/portal/login?view=register' }}>
              Create Account
            </button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <div className="lp-footer-brand">
            <h4>About Us</h4>
            <p>
              MasterAuto is a vehicle care studio focused on long-term paint protection,
              clean installations, and consistent workmanship.
            </p>
            <p>
              We specialize in ceramic coating, paint protection film, and window tinting
              using premium materials, controlled process steps, and detail-oriented service.
            </p>
          </div>
          <div className="lp-footer-cols">
            <div className="lp-fcol">
              <h4>Services</h4>
              <button onClick={() => scrollTo(servicesRef)}>Window Tinting</button>
              <button onClick={() => scrollTo(servicesRef)}>Paint Protection Film</button>
              <button onClick={() => scrollTo(servicesRef)}>Ceramic Coating</button>
            </div>
            <div className="lp-fcol">
              <h4>Contact</h4>
              <a href="tel:09158026193">0915 802 6193</a>
              <a href="mailto:masterauto.ph@gmail.com">masterauto.ph@gmail.com</a>
            </div>
            <div className="lp-fcol">
              <h4>Location</h4>
              <a
                href="https://www.google.com/maps/search/?api=1&query=91%2012th%20Avenue%20Cubao%2C%20Quezon%20City%2C%20Philippines"
                target="_blank"
                rel="noreferrer"
              >
                91 12th Avenue Cubao, Quezon City, Philippines
              </a>
              <span>Quezon City, Philippines - Cubao, Philippines</span>
            </div>
            <div className="lp-fcol">
              <h4>Social</h4>
              <a
                href="https://www.facebook.com/share/18XsssMxut/?mibextid=wwXIfr"
                target="_blank"
                rel="noreferrer"
              >
                Facebook
              </a>
              <a
                href="https://www.instagram.com/masterautoph?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
                target="_blank"
                rel="noreferrer"
              >
                Instagram
              </a>
            </div>
            <div className="lp-fcol">
              <h4>Access</h4>
              <button onClick={() => { window.location.href = '/portal/login' }}>Create Account</button>
            </div>
          </div>
        </div>
        <div className="lp-footer-bar">
          <div className="lp-wrap">
            {String.fromCharCode(169)} {new Date().getFullYear()} MasterAuto. All rights reserved.
          </div>
        </div>
      </footer>

      {modal !== null && (
        <AuthModal prefillService={modal?.name ? modal : null} onClose={() => setModal(null)} />
      )}

      <LandingChatWidget />
    </div>
  )
}