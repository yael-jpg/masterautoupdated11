import { useState } from 'react'

export function LoginPage({ onLogin, loading, error }) {
  // ── Staff form state ──────────────────────────────────────
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleStaffSubmit = async (e) => {
    e.preventDefault()
    await onLogin(email, password)
  }
  const tStaff = 0

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

            <p className="auth-kicker">Welcome Back</p>
            <h2>Sign in to MasterAuto</h2>
            <p className="auth-help">Enter your credentials to access the dashboard.</p>

            <form className="login-form" onSubmit={handleStaffSubmit}>
              <div className="field-group">
                <label htmlFor="email">Work Email</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  tabIndex={tStaff}
                />
              </div>

              <div className="field-group">
                <label htmlFor="password">Password</label>
                <div className="input-with-icon">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    tabIndex={tStaff}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={tStaff}
                  >
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
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
