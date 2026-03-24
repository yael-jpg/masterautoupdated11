import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { portalPost, setPortalSession } from '../api/portalClient'

export function LoginPage({ onLogin, loading, error }) {
  // ── Staff form state ──────────────────────────────────────
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ── Slide view: 'staff' | 'portal' | 'register' ──────────
  const [view, setView] = useState('staff')

  // ── Portal login state ────────────────────────────────────
  const [portalId, setPortalId]         = useState('')
  const [portalPw, setPortalPw]         = useState('')
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError]   = useState('')

  // ── Register state ────────────────────────────────────────
  const [regName, setRegName]           = useState('')
  const [regMobile, setRegMobile]       = useState('')
  const [regEmail, setRegEmail]         = useState('')
  const [regPw, setRegPw]               = useState('')
  const [regConfirm, setRegConfirm]     = useState('')
  const [regLoading, setRegLoading]     = useState(false)
  const [regError, setRegError]         = useState('')

  // Track offset: staff=0, portal=-33.33%, register=-66.66%
  const trackOffset = view === 'staff' ? '0%' : view === 'portal' ? '-33.333%' : '-66.666%'

  const slideTo = (v) => {
    setPortalError('')
    setRegError('')
    setView(v)
  }

  const handleStaffSubmit = async (e) => {
    e.preventDefault()
    await onLogin(email, password)
  }

  const handlePortalLogin = async (e) => {
    e.preventDefault()
    setPortalError('')
    setPortalLoading(true)
    try {
      const result = await portalPost('/auth/login', { identifier: portalId, password: portalPw })
      setPortalSession(result.token, result.customer)
      window.location.href = '/portal'
    } catch (err) {
      setPortalError(err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setRegError('')
    if (regPw !== regConfirm) { setRegError('Passwords do not match.'); return }
    if (regPw.length < 6)     { setRegError('Password must be at least 6 characters.'); return }
    setRegLoading(true)
    try {
      const result = await portalPost('/auth/register', {
        fullName: regName,
        email:    regEmail || undefined,
        mobile:   regMobile,
        password: regPw,
      })
      setPortalSession(result.token, result.customer)
      window.location.href = '/portal'
    } catch (err) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
    }
  }

  const handleGoogleCredential = async (credentialResponse) => {
    setPortalError('')
    setPortalLoading(true)
    try {
      const result = await portalPost('/auth/google', { credential: credentialResponse.credential })
      setPortalSession(result.token, result.customer)
      window.location.href = '/portal'
    } catch (err) {
      setPortalError(err.message)
    } finally {
      setPortalLoading(false)
    }
  }

  // tabIndex helpers
  const tStaff    = view === 'staff'    ? 0 : -1
  const tPortal   = view === 'portal'   ? 0 : -1
  const tRegister = view === 'register' ? 0 : -1

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
            <p className="brand-subtitle">Management System</p>
          </div>
          <div className="brand-content">
            <h1>Precision. Control. Performance.</h1>
            <p>
              Secure access for administrators, operations, and service managers.
              Keep your automotive workflows in sync from a single control center.
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

            {/* ── Sliding track (3 panels) ── */}
            <div className="auth-slide-outer">
              <div
                className="auth-slide-track auth-slide-track--3"
                style={{ transform: `translateX(${trackOffset})` }}
              >

                {/* ══ Panel 1 — Staff ══ */}
                <div className="auth-slide-panel">
                  <p className="auth-kicker">Welcome Back</p>
                  <h2>Sign in to MasterAuto</h2>
                  <p className="auth-help">Enter your credentials to access the dashboard.</p>

                  <form className="login-form" onSubmit={handleStaffSubmit}>
                    <div className="field-group">
                      <label htmlFor="email">Work Email</label>
                      <input id="email" type="email" name="email" value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email" required tabIndex={tStaff} />
                    </div>

                    <div className="field-group">
                      <label htmlFor="password">Password</label>
                      <div className="input-with-icon">
                        <input id="password" type={showPassword ? 'text' : 'password'} name="password"
                          value={password} onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password" required tabIndex={tStaff} />
                        <button type="button" className="password-toggle"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          tabIndex={tStaff}>
                          {showPassword ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="auth-meta-row">
                      <span>Protected session • encrypted access</span>
                    </div>

                    {error ? <p className="form-error">{error}</p> : null}

                    <button type="submit" disabled={loading} className="btn-submit" tabIndex={tStaff}>
                      {loading ? 'Signing In...' : 'Sign In'}
                    </button>

                    <div className="auth-portal-divider"><span>Not staff?</span></div>
                    <button type="button" className="auth-portal-link" onClick={() => slideTo('portal')} tabIndex={tStaff}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      Sign in to Client Portal
                    </button>
                  </form>
                </div>

                {/* ══ Panel 2 — Portal Login ══ */}
                <div className="auth-slide-panel">
                  <button type="button" className="auth-back-btn" onClick={() => slideTo('staff')} tabIndex={tPortal}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    Staff Login
                  </button>

                  <p className="auth-kicker" style={{ marginTop: 8 }}>Client Area</p>
                  <h2>Sign in to Client Portal</h2>
                  <p className="auth-help">Access your vehicle records and appointments.</p>

                  <form className="login-form" onSubmit={handlePortalLogin}>
                    <div className="field-group">
                      <label htmlFor="portal-id">Email or Mobile Number</label>
                      <input id="portal-id" type="text" value={portalId}
                        onChange={(e) => setPortalId(e.target.value)}
                        placeholder="you@email.com or 09XXXXXXXXX"
                        required tabIndex={tPortal} />
                    </div>

                    <div className="field-group">
                      <label htmlFor="portal-pw">Password</label>
                      <input id="portal-pw" type="password" value={portalPw}
                        onChange={(e) => setPortalPw(e.target.value)}
                        placeholder="Enter your password"
                        required tabIndex={tPortal} />
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
                        theme="filled_black" shape="rectangular" size="large"
                        text="continue_with" width="320"
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

                {/* ══ Panel 3 — Register ══ */}
                <div className="auth-slide-panel">
                  <button type="button" className="auth-back-btn" onClick={() => slideTo('portal')} tabIndex={tRegister}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    Sign In
                  </button>

                  <p className="auth-kicker" style={{ marginTop: 8 }}>New Client</p>
                  <h2>Create Your Account</h2>
                  <p className="auth-help">Register to access the client portal.</p>

                  <form className="login-form" onSubmit={handleRegister}>
                    <div className="field-group">
                      <label htmlFor="reg-name">Full Name</label>
                      <input id="reg-name" type="text" value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Juan dela Cruz"
                        required tabIndex={tRegister} />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-mobile">
                        Mobile Number <span style={{ color: 'rgba(189,200,218,0.35)', fontWeight: 400 }}>(required)</span>
                      </label>
                      <input id="reg-mobile" type="tel" value={regMobile}
                        onChange={(e) => setRegMobile(e.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="09XXXXXXXXX" maxLength={11} inputMode="numeric"
                        required tabIndex={tRegister} />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-email">
                        Email Address <span style={{ color: 'rgba(189,200,218,0.35)', fontWeight: 400 }}>(optional)</span>
                      </label>
                      <input id="reg-email" type="email" value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="you@email.com"
                        tabIndex={tRegister} />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-pw">Password</label>
                      <input id="reg-pw" type="password" value={regPw}
                        onChange={(e) => setRegPw(e.target.value)}
                        placeholder="Minimum 6 characters"
                        required tabIndex={tRegister} />
                    </div>

                    <div className="field-group">
                      <label htmlFor="reg-confirm">Confirm Password</label>
                      <input id="reg-confirm" type="password" value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                        placeholder="Re-enter your password"
                        required tabIndex={tRegister} />
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
                        theme="filled_black" shape="rectangular" size="large"
                        text="continue_with" width="320"
                      />
                    </div>
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
