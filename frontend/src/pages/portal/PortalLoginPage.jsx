import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { portalPost, setPortalSession } from '../../api/portalClient'

function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt || '').split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function PortalLoginPage({ onLogin }) {
  // Slide view: 'portal' | 'register' | 'verify'
  const [view, setView] = useState('portal')

  // Portal login state
  const [portalId, setPortalId] = useState('')
  const [portalPw, setPortalPw] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')

  // Register state
  const [regName, setRegName] = useState('')
  const [regMobile, setRegMobile] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPw, setRegPw] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')

  // Verify email (OTP)
  const [verifyEmail, setVerifyEmail] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState('')
  const [verifyNotice, setVerifyNotice] = useState('')

  const trackOffset = view === 'portal' ? '0%' : view === 'register' ? '-33.333%' : '-66.666%'

  const slideTo = (v) => {
    setPortalError('')
    setRegError('')
    setVerifyError('')
    setVerifyNotice('')
    setView(v)
  }

  const handlePortalLogin = async (e) => {
    e.preventDefault()
    setPortalError('')
    setPortalLoading(true)
    try {
      const result = await portalPost('/auth/login', { identifier: portalId, password: portalPw })
      setPortalSession(result.token, result.customer)
      onLogin(result.token, result.customer)
    } catch (err) {
      if (err?.requiresEmailVerification && err?.email) {
        setVerifyEmail(String(err.email || '').trim())
        setVerifyCode('')
        slideTo('verify')
        setVerifyNotice('Please enter the verification code sent to your email.')
      } else {
        setPortalError(err.message)
      }
    } finally {
      setPortalLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setRegError('')
    if (!regEmail.trim()) { setRegError('Email address is required.'); return }
    if (regPw !== regConfirm) { setRegError('Passwords do not match.'); return }
    if (regPw.length < 6) { setRegError('Password must be at least 6 characters.'); return }

    setRegLoading(true)
    try {
      const result = await portalPost('/auth/register', {
        fullName: regName,
        email: regEmail.trim(),
        mobile: regMobile,
        password: regPw,
      })

      if (result?.requiresEmailVerification) {
        setVerifyEmail(String(result.email || regEmail).trim())
        setVerifyCode('')
        slideTo('verify')
        setVerifyNotice(result?.message || 'Verification code sent. Please check your email.')
      } else {
        // Backwards-compat fallback
        setPortalSession(result.token, result.customer)
        onLogin(result.token, result.customer)
      }
    } catch (err) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
    }
  }

  const handleVerifyEmail = async (e) => {
    e.preventDefault()
    setVerifyError('')
    setVerifyNotice('')
    const email = String(verifyEmail || '').trim()
    const code = String(verifyCode || '').trim()
    if (!email) { setVerifyError('Email address is required.'); return }
    if (!code) { setVerifyError('Verification code is required.'); return }

    setVerifyLoading(true)
    try {
      const result = await portalPost('/auth/verify-email', { email, code })
      setPortalSession(result.token, result.customer)
      onLogin(result.token, result.customer)
    } catch (err) {
      setVerifyError(err.message)
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleResendCode = async () => {
    setVerifyError('')
    setVerifyNotice('')
    const email = String(verifyEmail || '').trim()
    if (!email) { setVerifyError('Email address is required.'); return }
    setVerifyLoading(true)
    try {
      const result = await portalPost('/auth/resend-verification', { email })
      setVerifyNotice(result?.message || 'Verification code sent.')
    } catch (err) {
      setVerifyError(err.message)
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleGoogleCredential = async (credentialResponse) => {
    setPortalError('')
    setPortalLoading(true)
    try {
      const result = await portalPost('/auth/google', { credential: credentialResponse.credential })
      setPortalSession(result.token, result.customer)
      onLogin(result.token, result.customer)
    } catch (err) {
      const msg = String(err?.message || '')
      if (/no\s+portal\s+account\s+found/i.test(msg) || /create\s+an\s+account/i.test(msg)) {
        const payload = decodeJwtPayload(credentialResponse?.credential)
        if (payload?.name && !regName) setRegName(payload.name)
        if (payload?.email && !regEmail) setRegEmail(payload.email)
        slideTo('register')
        setPortalError('')
      } else {
        setPortalError(msg || 'Google sign-in failed. Please try again.')
      }
    } finally {
      setPortalLoading(false)
    }
  }

  // tabIndex helpers
  const tPortal = view === 'portal' ? 0 : -1
  const tRegister = view === 'register' ? 0 : -1
  const tVerify = view === 'verify' ? 0 : -1

  return (
    <main className="auth-page">
      <div className="auth-ambient" aria-hidden="true">
        <span className="ambient-orb orb-one" />
        <span className="ambient-orb orb-two" />
      </div>

      <section className="auth-shell">
        <div className="auth-brand-panel" aria-hidden="true">
          <div className="brand-top">
            <img src="/images/logo.png" className="brand-logo" alt="MasterAuto logo" />
            <p className="brand-subtitle">Client Portal</p>
          </div>
          <div className="brand-content">
            <h1>Your Service. Your Records. Anytime.</h1>
            <p>
              Sign in to view job status, service history, receipts, and appointments — all in one place.
            </p>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-panel-shine" aria-hidden="true" />
          <div className="auth-mobile-brand" aria-hidden="true">
            <img src="/images/logo.png" alt="MasterAuto" className="auth-mobile-logo" />
          </div>

          <div className="auth-card">
            <div className="auth-card-rim" aria-hidden="true" />

            <div className="auth-slide-outer">
              <div className="auth-slide-track auth-slide-track--3" style={{ transform: `translateX(${trackOffset})` }}>

                {/* ══ Panel 1 — Portal Login ══ */}
                <div className="auth-slide-panel">
                  <p className="auth-kicker">Client Area</p>
                  <h2>Sign in to Client Portal</h2>
                  <p className="auth-help">Access your vehicle records and appointments.</p>

                  <form className="login-form" onSubmit={handlePortalLogin}>
                    <div className="field-group">
                      <label htmlFor="portal-id">Email or Mobile Number</label>
                      <input
                        id="portal-id"
                        type="text"
                        value={portalId}
                        onChange={(e) => setPortalId(e.target.value)}
                        placeholder="you@email.com or 09XXXXXXXXX"
                        required
                        tabIndex={tPortal}
                      />
                    </div>

                    <div className="field-group">
                      <label htmlFor="portal-pw">Password</label>
                      <input
                        id="portal-pw"
                        type="password"
                        value={portalPw}
                        onChange={(e) => setPortalPw(e.target.value)}
                        placeholder="Enter your password"
                        required
                        tabIndex={tPortal}
                      />
                    </div>

                    {portalError ? <p className="form-error">{portalError}</p> : null}

                    <button type="submit" disabled={portalLoading} className="btn-submit" tabIndex={tPortal}>
                      {portalLoading ? 'Signing In...' : 'Sign In'}
                    </button>

                    <div className="auth-portal-divider"><span>or</span></div>

                    <div className="auth-google-wrap">
                      <GoogleLogin
                        onSuccess={handleGoogleCredential}
                        onError={() => setPortalError('Google sign-in failed. Please try again.')}
                        theme="filled_black"
                        locale="en"
                        shape="rectangular"
                        size="large"
                        text="continue_with"
                      />
                    </div>

                    <p className="auth-portal-register-hint">
                      No account yet?{' '}
                      <button type="button" className="auth-link" onClick={() => slideTo('register')} tabIndex={tPortal}>
                        Create account →
                      </button>
                    </p>
                  </form>
                </div>

                {/* ══ Panel 2 — Register ══ */}
                <div className="auth-slide-panel">
                  <button type="button" className="auth-back-btn" onClick={() => slideTo('portal')} tabIndex={tRegister}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Sign In
                  </button>

                  <p className="auth-kicker" style={{ marginTop: 8 }}>New Client</p>
                  <h2>Create Your Account</h2>
                  <p className="auth-help">Register to access the client portal.</p>

                  <form className="login-form" onSubmit={handleRegister}>
                    <div className="field-group">
                      <label htmlFor="reg-name">Full Name</label>
                      <input
                        id="reg-name"
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Juan dela Cruz"
                        required
                        tabIndex={tRegister}
                      />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-mobile">
                        Mobile Number <span style={{ color: 'rgba(189, 200, 218, 0.35)', fontWeight: 400 }}>(required)</span>
                      </label>
                      <input
                        id="reg-mobile"
                        type="tel"
                        value={regMobile}
                        onChange={(e) => setRegMobile(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="09XXXXXXXXX"
                        maxLength={11}
                        inputMode="numeric"
                        required
                        tabIndex={tRegister}
                      />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-email">
                        Email Address <span style={{ color: 'rgba(189, 200, 218, 0.35)', fontWeight: 400 }}>(required)</span>
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="you@email.com"
                        required
                        tabIndex={tRegister}
                      />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-pw">Password</label>
                      <input
                        id="reg-pw"
                        type="password"
                        value={regPw}
                        onChange={(e) => setRegPw(e.target.value)}
                        placeholder="Minimum 6 characters"
                        required
                        tabIndex={tRegister}
                      />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-confirm">Confirm Password</label>
                      <input
                        id="reg-confirm"
                        type="password"
                        value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                        placeholder="Re-enter your password"
                        required
                        tabIndex={tRegister}
                      />
                    </div>

                    {regError ? <p className="form-error">{regError}</p> : null}

                    <button type="submit" disabled={regLoading} className="btn-submit" tabIndex={tRegister}>
                      {regLoading ? 'Creating account…' : 'Create Account'}
                    </button>

                    <div className="auth-portal-divider"><span>or</span></div>

                    <div className="auth-google-wrap">
                      <GoogleLogin
                        onSuccess={handleGoogleCredential}
                        onError={() => setRegError('Google sign-in failed. Please try again.')}
                        theme="filled_black"
                        shape="rectangular"
                        size="large"
                        text="continue_with"
                      />
                    </div>
                  </form>
                </div>

                {/* ══ Panel 3 — Verify Email (OTP) ══ */}
                <div className="auth-slide-panel">
                  <button type="button" className="auth-back-btn" onClick={() => slideTo('register')} tabIndex={tVerify}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Back
                  </button>

                  <p className="auth-kicker" style={{ marginTop: 8 }}>Email Verification</p>
                  <h2>Enter Verification Code</h2>
                  <p className="auth-help">We sent a code to <strong>{verifyEmail || regEmail}</strong>.</p>

                  <form className="login-form" onSubmit={handleVerifyEmail}>
                    <div className="field-group">
                      <label htmlFor="verify-email">Email Address</label>
                      <input
                        id="verify-email"
                        type="email"
                        value={verifyEmail}
                        onChange={(e) => setVerifyEmail(e.target.value)}
                        placeholder="you@email.com"
                        required
                        tabIndex={tVerify}
                      />
                    </div>

                    <div className="field-group">
                      <label htmlFor="verify-code">Verification Code</label>
                      <input
                        id="verify-code"
                        type="text"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        tabIndex={tVerify}
                      />
                    </div>

                    {verifyNotice ? <p className="auth-help" style={{ marginTop: 8 }}>{verifyNotice}</p> : null}
                    {verifyError ? <p className="form-error">{verifyError}</p> : null}

                    <button type="submit" disabled={verifyLoading} className="btn-submit" tabIndex={tVerify}>
                      {verifyLoading ? 'Verifying…' : 'Verify & Continue'}
                    </button>

                    <p className="auth-portal-register-hint" style={{ marginTop: 14 }}>
                      Didn’t receive a code?{' '}
                      <button type="button" className="auth-link" onClick={handleResendCode} disabled={verifyLoading} tabIndex={tVerify}>
                        Resend code
                      </button>
                    </p>
                  </form>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
