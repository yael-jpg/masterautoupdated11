const path = require('path')
const dotenv = require('dotenv')

// Snapshot of environment variables before dotenv loads any .env file.
// This lets us distinguish between values provided by the runtime (Docker/host)
// and values coming from a checked-in .env file.
const baseEnv = { ...process.env }
const hasExplicitDbFields = Boolean(
  baseEnv.DB_HOST ||
    baseEnv.DB_NAME ||
    baseEnv.DB_USER ||
    baseEnv.DB_PASSWORD ||
    baseEnv.DB_PORT,
)
const hasExplicitDbUrl = Boolean(baseEnv.DATABASE_URL)

// Load .env from current working directory first (e.g., when running inside backend),
// otherwise fall back to backend/.env so tools invoked from repo root still pick up backend DB creds.
const projectEnv = path.resolve(process.cwd(), '.env')
const backendEnv = path.resolve(__dirname, '../../.env')

const loaded = dotenv.config({ path: projectEnv })
if (!loaded.parsed) {
  // attempt to load backend/.env so tools invoked from repo root still pick up settings
  // (dotenv will not overwrite explicitly-set environment variables).
  dotenv.config({ path: backendEnv })
}

// If some vars are still missing (e.g., when running from repo root), merge backend/.env values
// without overwriting any explicit environment variables.
try {
  const fs = require('fs')
  if (fs.existsSync(backendEnv)) {
    const parsed = dotenv.parse(fs.readFileSync(backendEnv))
    Object.keys(parsed).forEach((k) => {
      if (!process.env[k]) process.env[k] = parsed[k]
    })
  }
} catch (e) {
  // ignore parsing errors — we'll fall back to defaults below
}

// If the runtime explicitly provided DB_* fields (e.g., docker-compose) and it did NOT
// explicitly provide DATABASE_URL, ensure we don't accidentally pick up a DATABASE_URL
// from a local .env file.
if (hasExplicitDbFields && !hasExplicitDbUrl) {
  delete process.env.DATABASE_URL
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  dbUrl: process.env.DATABASE_URL || '',
  dbSslRejectUnauthorized:
    process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: Number(process.env.DB_PORT || 5432),
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  dbName: process.env.DB_NAME || 'masterauto',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // Email provider
  emailProvider: String(process.env.EMAIL_PROVIDER || '').toLowerCase(),
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || '',
  resendReplyTo: process.env.RESEND_REPLY_TO || '',

  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpTlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',
  smtpReplyTo: process.env.SMTP_REPLY_TO || '',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
  // Full URL to the client portal login page (e.g., https://app.example.com/portal)
  portalUrl: process.env.PORTAL_URL || '',
}

module.exports = env
