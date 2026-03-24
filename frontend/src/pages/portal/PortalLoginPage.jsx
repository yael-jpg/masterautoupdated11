import { useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { portalPost, setPortalSession } from '../../api/portalClient'

export function PortalLoginPage({ onLogin }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'

  // Login state
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  // Register state
  const [regFullName, setRegFullName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regMobile, setRegMobile] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regSuccess, setRegSuccess] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleCredential = async (credentialResponse) => {
    setError('')
    setLoading(true)
    try {
      const result = await portalPost('/auth/google', { credential: credentialResponse.credential })
      setPortalSession(result.token, result.customer)
      onLogin(result.token, result.customer)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (m) => {
    setMode(m)
    setError('')
    setRegSuccess('')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await portalPost('/auth/login', { identifier, password })
      setPortalSession(result.token, result.customer)
      onLogin(result.token, result.customer)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setRegSuccess('')
    if (regPassword !== regConfirm) {
      setError('Passwords do not match.')
      return
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    try {
      const result = await portalPost('/auth/register', {
        fullName: regFullName,
        email: regEmail || undefined,
        mobile: regMobile,
        password: regPassword,
      })
      setPortalSession(result.token, result.customer)
      onLogin(result.token, result.customer)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-login-root">
      <div className="portal-login-ambient" aria-hidden="true">
        <span className="ambient-orb orb-one" />
        <span className="ambient-orb orb-two" />
      </div>
      <div className="portal-login-card">
        <div className="portal-login-brand">
          <img src="/images/logo.png" alt="MasterAuto" className="portal-login-logo" />
          <h1>Client Portal</h1>
          <p>MasterAuto — Your Vehicle, Your Records</p>
        </div>

        {/* Tab switcher */}
        <div className="portal-login-tabs">
          <button
            type="button"
            className={`portal-login-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`portal-login-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Register
          </button>
        </div>

        {error && <div className="portal-login-error">{error}</div>}
        {regSuccess && <div className="portal-login-success">{regSuccess}</div>}

        {/* ── Sliding forms track ── */}
        <div className="portal-forms-wrap">
          <div
            className="portal-forms-track"
            style={{ transform: mode === 'register' ? 'translateX(-50%)' : 'translateX(0)' }}
          >
            {/* ── LOGIN FORM ── */}
            <div className="portal-form-panel">
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label>Email or Mobile Number</label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@email.com or 09XX-XXX-XXXX"
                      autoFocus
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="portal-login-btn" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <div className="portal-login-or">
                  <span>or</span>
                </div>
                <div className="portal-google-wrap">
                  <GoogleLogin
                    onSuccess={handleGoogleCredential}
                    onError={() => setError('Google sign-in failed. Please try again.')}
                    theme="filled_black"
                    shape="rectangular"
                    size="large"
                    text="continue_with"
                    width="100%"
                  />
                </div>

                <p className="portal-login-hint">
                  First time here?{' '}
                  <button type="button" className="portal-login-link-btn" onClick={() => switchMode('register')}>
                    Create your account →
                  </button>
                </p>
              </form>
            </div>

            {/* ── REGISTER FORM ── */}
            <div className="portal-form-panel">
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label>Full Name</label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="Juan dela Cruz"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Mobile Number <span style={{ color: 'rgba(189,200,218,0.4)', fontWeight: 400 }}>(required)</span></label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                    </span>
                    <input
                      type="tel"
                      value={regMobile}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
                        setRegMobile(digits)
                      }}
                      placeholder="09XXXXXXXXX"
                      maxLength={11}
                      inputMode="numeric"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Email Address <span style={{ color: 'rgba(189,200,218,0.4)', fontWeight: 400 }}>(optional)</span></label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                      </svg>
                    </span>
                    <input
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="you@email.com"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Confirm Password</label>
                  <div className="portal-input-wrap">
                    <span className="portal-input-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                    <input
                      type="password"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="portal-login-btn" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>

                <div className="portal-login-or">
                  <span>or</span>
                </div>
                <div className="portal-google-wrap">
                  <GoogleLogin
                    onSuccess={handleGoogleCredential}
                    onError={() => setError('Google sign-in failed. Please try again.')}
                    theme="filled_black"
                    shape="rectangular"
                    size="large"
                    text="continue_with"
                    width="100%"
                  />
                </div>

                <p className="portal-login-hint">
                  Already registered?{' '}
                  <button type="button" className="portal-login-link-btn" onClick={() => switchMode('login')}>
                    Sign in →
                  </button>
                </p>
              </form>
            </div>
          </div>
        </div>

        <div className="portal-login-staff-link">
          Staff member?{' '}
          <button
            type="button"
            className="portal-login-link-btn"
            onClick={() => {
              // Clear any existing staff session so the login page is always shown
              localStorage.removeItem('masterauto_token')
              localStorage.removeItem('masterauto_user')
              window.location.href = '/'
            }}
          >
            Log in to the Staff Dashboard →
          </button>
        </div>
      </div>
    </div>
  )
}
