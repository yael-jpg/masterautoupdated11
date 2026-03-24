const path = require('path')
const dotenv = require('dotenv')

// Load .env from current working directory first (e.g., when running inside backend),
// otherwise fall back to backend/.env so tools invoked from repo root still pick up backend DB creds.
const projectEnv = path.resolve(process.cwd(), '.env')
const backendEnv = path.resolve(__dirname, '../../.env')

const loaded = dotenv.config({ path: projectEnv })
if (!loaded.parsed) {
  // attempt to load backend/.env
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

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  dbUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: Number(process.env.DB_PORT || 5432),
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  dbName: process.env.DB_NAME || 'masterauto',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpTlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',
  smtpReplyTo: process.env.SMTP_REPLY_TO || '',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
}

module.exports = env
