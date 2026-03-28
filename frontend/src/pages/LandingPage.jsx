import { useEffect, useRef, useState } from 'react'
import '../LandingPage.css'

const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'
const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
const API_BASE = (() => {
  const trimmed = String(RAW_API_BASE || '').replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
})()
const PORTAL_BASE = `${API_BASE}/portal`

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

const FEATURED = [
  {
    id: 'ppf',
    name: 'Paint Protection Film',
    short: 'Paint Protection Film (PPF) is a transparent and durable film applied to your vehicle’s painted surfaces to protect it from scratches, rock chips, stains, and environmental damage. This high-quality protective layer helps maintain the original paint while keeping your car looking brand new. PPF also has self-healing properties that allow minor scratches to disappear with heat, ensuring long-lasting protection and shine.',
    image: '/images/ppf.png',
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
    image: '/images/graphene.png',
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
    image: '/images/window.png',
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
    image: '/images/detailing.png',
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
    image: '/images/seatcover.png',
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

function AuthModal({ prefillService, onClose }) {
  const [tab, setTab] = useState('register')
  const [reg, setReg] = useState({ fullName: '', email: '', mobile: '', address: '', password: '' })
  const [login, setLogin] = useState({ identifier: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const setR = (k, v) => { setReg(p => ({ ...p, [k]: v })); setError('') }
  const setL = (k, v) => { setLogin(p => ({ ...p, [k]: v })); setError('') }

  async function handleRegister(e) {
    e.preventDefault()
    if (!reg.fullName || !reg.mobile || !reg.password) return setError('Full name, mobile, and password are required.')
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
              <div className="lp-field"><label>Email</label><input type="email" value={reg.email} onChange={e => setR('email', e.target.value)} placeholder="juan@email.com" /></div>
              <div className="lp-field"><label>Address</label><input value={reg.address} onChange={e => setR('address', e.target.value)} placeholder="Street, Barangay, City" /></div>
              <div className="lp-field"><label>Password *</label><input type="password" value={reg.password} onChange={e => setR('password', e.target.value)} placeholder="Min. 6 characters" /></div>
              {error && <p className="lp-modal-err">{error}</p>}
              <button type="submit" className="lp-modal-submit" disabled={loading}>{loading ? 'Creating Account…' : 'Register & Continue to Portal'}</button>
              <p className="lp-modal-hint">You will be redirected to book your appointment and pay online.</p>
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
          Online Quotation
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        </button>
      </div>
    </div>
  )
}

export function LandingPage() {
  const [modal, setModal] = useState(null)
  const [fanActive, setFanActive] = useState(null)
  const [hiwActive, setHiwActive] = useState(null)
  const servicesRef = useRef(null)
  const fanRef = useRef(null)
  const hiwRef = useRef(null)

  const scrollTo = r => r?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // Reset active panels when clicking outside
  useEffect(() => {
    const handle = e => {
      if (fanRef.current && !fanRef.current.contains(e.target)) setFanActive(null)
      if (hiwRef.current && !hiwRef.current.contains(e.target)) setHiwActive(null)
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
          <p className="lp-hero-eye">Professional Auto Care</p>
          <h1 className="lp-hero-h1">
            Premium Ceramic Coating,<br />
            Paint Protection Film,<br />
            and Advanced Auto Coating
          </h1>
          <div className="lp-hero-btns">
            <button className="lp-btn-o" onClick={() => window.location.href = '/guest'}>Online Quotation</button>
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
          <p className="lp-eyebrow light">Simple Process</p>
          <h2 className="lp-how-h2">How It Works</h2>
          <div className="lp-rule light" />
        </div>
        <div ref={hiwRef} className={`lp-hiw-panels${hiwActive !== null ? ' has-active' : ''}`}>
          {[
            {
              n: '01', t: 'Register',
              d: 'Create your free account with just your mobile number in seconds.',
              image: '/images/register.png',
            },
            {
              n: '02', t: 'Book a Service',
              d: 'Browse our services, pick your package, choose a date and pay online.',
              image: '/images/bookservice.png',
            },
            {
              n: '03', t: 'Drop Off & Enjoy',
              d: 'Bring your car in and let our experts deliver a showroom-quality finish.',
              image: '/images/drop.png',
            },
          ].map((s, i) => (
            <div
              key={s.n}
              className={`lp-hiw-panel${hiwActive === i ? ' is-active' : ''}`}
              style={{ '--i': i }}
              onClick={() => setHiwActive(hiwActive === i ? null : i)}
            >
              <div className="lp-hiw-bg" style={{ backgroundImage: `url(${s.image})` }} />
              <div className="lp-hiw-dim" />
              <div className="lp-hiw-content">
                <span className="lp-hiw-num">{s.n}</span>
                <h3 className="lp-hiw-title">{s.t}</h3>
                <p className="lp-hiw-desc">{s.d}</p>
              </div>
            </div>
          ))}
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
              <a href="/login">Staff Login</a>
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
    </div>
  )
}