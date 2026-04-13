/**
 * /api/portal/* — Customer self-service portal routes
 *
 * Public endpoints (no auth):
 *   POST /auth/register
 *   POST /auth/login
 *
 * Protected endpoints (require portal JWT):
 *   GET  /me
 *   PUT  /me
 *   GET  /dashboard/stats
 *   GET  /appointments
 *   POST /appointments/book
 *   GET  /vehicles
 *   GET  /vehicles/:id/detail
 *   GET  /services
 *   GET  /job-orders
 *   GET  /payments
 *   GET  /service-history
 *   GET  /warranty
 */

const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { OAuth2Client } = require('google-auth-library')
const { body, param } = require('express-validator')
const db = require('../config/db')
const env = require('../config/env')
const { asyncHandler } = require('../utils/asyncHandler')
const { validateRequest } = require('../middleware/validateRequest')
const { normalizePlate, validatePlateFormat, isSuspiciousPlate } = require('../utils/plateValidator')
const ConfigurationService = require('../services/configurationService')
const NotificationService = require('../services/notificationService')
const { sendPortalBookingRequestEmail, sendPortalSubscriptionRequestEmail, sendPortalPmsRequestEmail, sendRawEmail } = require('../services/mailer')
const { buildQuotationRequestStaffEmail, buildSubscriptionRequestStaffEmail, buildPmsRequestStaffEmail } = require('../services/emailTemplates')
const { emitDataChanged } = require('../realtime/hub')
const { randomB64url, deriveVerifierFromPassword, computeProof, timingSafeEqualB64url } = require('../utils/hashedLogin')
const { normalizeEmail, normalizeMobileDigits, normalizeMobileForStorage } = require('../utils/customerIdentity')

const googleClient = new OAuth2Client(env.googleClientId)

const VEHICLE_SIZE_LABELS = {
  'small-bike': 'Small Bike',
  'big-bike': 'Big Bike',
  'x-small': 'X Small',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  'x-large': 'X Large',
  'xx-large': 'XX Large',
}

function normalizeSizeKey(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/\s+/g, '-')
  if (VEHICLE_SIZE_LABELS[key]) return key
  if (key === 'xs') return 'x-small'
  if (key === 's') return 'small'
  if (key === 'm') return 'medium'
  if (key === 'l') return 'large'
  if (key === 'xl') return 'x-large'
  if (key === 'xxl') return 'xx-large'
  return ''
}

function expandCustomServiceRows(customService) {
  const code = String(customService?.code || '').trim().toLowerCase()
  const name = String(customService?.name || '').trim()
  const category = String(customService?.group || '').trim() || 'Other Services'
  const description = String(customService?.description || '').trim()
  const sizePrices = customService?.sizePrices && typeof customService.sizePrices === 'object'
    ? customService.sizePrices
    : {}

  if (!code || !name) return []

  const rows = []
  for (const [rawKey, rawPrice] of Object.entries(sizePrices)) {
    const sizeKey = normalizeSizeKey(rawKey)
    const label = VEHICLE_SIZE_LABELS[sizeKey]
    const price = Number(rawPrice || 0)
    if (!sizeKey || !label || !(price > 0)) continue
    rows.push({
      id: `custom-${code}-${sizeKey}`,
      code,
      name: `${name} - ${label}`,
      category,
      base_price: price,
      description,
      materials_notes: null,
    })
  }

  if (rows.length) return rows

  return [
    {
      id: `custom-${code}`,
      code,
      name,
      category,
      base_price: Number(customService?.base_price || 0),
      description,
      materials_notes: null,
    },
  ]
}

const SIZE_KEY_BY_LABEL = Object.entries(VEHICLE_SIZE_LABELS).reduce((acc, [key, label]) => {
  acc[String(label || '').trim().toLowerCase()] = key
  return acc
}, {})

const SIZE_LABEL_BY_KEY = VEHICLE_SIZE_LABELS

const CATEGORY_ALIASES = {
  ppf: 'PPF Services',
  'ppf services': 'PPF Services',
  detailing: 'Detailing Services',
  'detailing services': 'Detailing Services',
  'ceramic coating': 'Coating Services',
  'coating services': 'Coating Services',
  'car wash services': 'Car Wash Services',
  'other services': 'Other Services',
}

function normalizeServiceCode(raw) {
  return String(raw || '').trim().replace(/^CAT-/i, '').toLowerCase()
}

function normalizeCategoryName(raw) {
  const key = String(raw || '').trim().toLowerCase()
  return CATEGORY_ALIASES[key] || String(raw || '').trim() || 'Other Services'
}

function extractSizeKeyFromServiceName(name) {
  const text = String(name || '').trim()
  const idx = text.lastIndexOf(' - ')
  if (idx < 0) return null
  const suffix = text.slice(idx + 3).trim().toLowerCase()
  return SIZE_KEY_BY_LABEL[suffix] || null
}

function resolveServiceOverridePrice(priceOverridesMap, serviceCode, serviceName) {
  const code = normalizeServiceCode(serviceCode)
  if (!code) return null

  const entry = priceOverridesMap?.[code]
  if (entry === undefined || entry === null) return null

  if (typeof entry === 'number' || typeof entry === 'string') {
    const value = Number(entry)
    return Number.isFinite(value) ? value : null
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null

  const sizeKey = extractSizeKeyFromServiceName(serviceName)
  if (sizeKey && entry[sizeKey] !== undefined && entry[sizeKey] !== null && entry[sizeKey] !== '') {
    const value = Number(entry[sizeKey])
    return Number.isFinite(value) ? value : null
  }

  return null
}

function normalizedPriceVariants(overrideEntry) {
  if (!overrideEntry || typeof overrideEntry !== 'object' || Array.isArray(overrideEntry)) return []

  const variants = []
  Object.entries(overrideEntry).forEach(([rawKey, rawValue]) => {
    const key = normalizeSizeKey(rawKey)
    const label = SIZE_LABEL_BY_KEY[key]
    const amount = Number(rawValue)
    if (!key || !label || !Number.isFinite(amount)) return
    variants.push({ key, label, amount })
  })

  return variants
}

const router = express.Router()

let portalHashedColsChecked = false
let portalHashedColsAvailable = false

async function ensurePortalHashedLoginColumnsExist() {
  if (portalHashedColsChecked) return portalHashedColsAvailable
  portalHashedColsChecked = true
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customers'
         AND column_name IN ('portal_password_salt','portal_password_verifier','portal_password_verifier_iters')`,
    )
    portalHashedColsAvailable = Number(r.rows?.[0]?.cnt || 0) === 3
    return portalHashedColsAvailable
  } catch {
    portalHashedColsAvailable = false
    return false
  }
}

const clampMinutes = (v, { min = 1, max = 525600, fallback = 43200 } = {}) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

async function getPortalJwtTtlMinutes() {
  try {
    return clampMinutes(await ConfigurationService.get('system', 'portal_session_token_ttl_minutes'), { fallback: 43200 })
  } catch {
    return 43200
  }
}

async function getHashedLoginIters() {
  try {
    return clampMinutes(await ConfigurationService.get('system', 'hashed_login_pbkdf2_iters'), { min: 10000, max: 600000, fallback: 150000 })
  } catch {
    return 150000
  }
}

async function isForceHashedPortalLogin() {
  // Deprecated: forcing hashed-only login can lock out portal accounts that haven't been upgraded yet.
  // We still support hashed login when the verifier exists, but we never force it.
  return false
}

// In-memory replay protection for challenge tokens (best-effort; per-process).
const usedPortalChallengeJtis = new Map() // jti -> expiresAtMs
function markPortalUsed(jti, expiresAtMs) {
  usedPortalChallengeJtis.set(jti, expiresAtMs)
  const now = Date.now()
  for (const [k, v] of usedPortalChallengeJtis.entries()) {
    if (v <= now) usedPortalChallengeJtis.delete(k)
  }
}

function portalWasUsed(jti) {
  const v = usedPortalChallengeJtis.get(jti)
  if (!v) return false
  if (v <= Date.now()) {
    usedPortalChallengeJtis.delete(jti)
    return false
  }
  return true
}

function generateOtpCode() {
  const n = crypto.randomInt(0, 1000000)
  return String(n).padStart(6, '0')
}

async function ensurePortalEmailVerificationColumnsExist() {
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customers'
         AND column_name IN (
           'portal_email_verified_at',
           'portal_email_verification_code_hash',
           'portal_email_verification_expires_at'
         )`,
    )
    return Number(r.rows?.[0]?.cnt || 0) === 3
  } catch (_e) {
    return false
  }
}

// ─── Portal JWT middleware ────────────────────────────────────────────────────

function requirePortalAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' })
  }
  const tokenStr = auth.slice(7)
  try {
    const decoded = jwt.verify(tokenStr, env.jwtSecret)
    if (!decoded.customerId) {
      return res.status(401).json({ message: 'Invalid portal token' })
    }
    req.customerId = decoded.customerId
    return next()
  } catch (error) {
    if (error && error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please sign in again.', code: 'SESSION_EXPIRED' })
    }
    return res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' })
  }
}

async function resolveLinkedCustomerIds(primaryCustomerId) {
  // Some deployments end up with duplicate customer rows for the same person
  // (e.g., portal-created customer and a staff-created walk-in), but with the
  // same email/mobile. For portal display/notifications, treat those as the
  // same identity so records reflect without manual merging.
  try {
    const me = await db.query('SELECT id, email, mobile FROM customers WHERE id = $1', [primaryCustomerId])
    if (!me.rows.length) return [primaryCustomerId]
    const email = String(me.rows[0].email || '').trim().toLowerCase()
    const mobile = String(me.rows[0].mobile || '').trim()

    if (!email && !mobile) return [primaryCustomerId]

    const clauses = []
    const params = []
    if (email) {
      params.push(email)
      clauses.push(`LOWER(email) = $${params.length}`)
    }
    if (mobile) {
      params.push(mobile)
      clauses.push(`mobile = $${params.length}`)
    }

    const r = await db.query(
      `SELECT id
       FROM customers
       WHERE ${clauses.join(' OR ')}
       ORDER BY id ASC`,
      params,
    )
    const ids = r.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
    return ids.length ? ids : [primaryCustomerId]
  } catch (_e) {
    return [primaryCustomerId]
  }
}

// ─── POST /auth/google ────────────────────────────────────────────────
router.post(
  '/auth/google',
  asyncHandler(async (req, res) => {
    const { credential } = req.body
    if (!credential) return res.status(400).json({ message: 'Google credential required.' })
    if (!env.googleClientId || env.googleClientId === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
      return res.status(501).json({ message: 'Google login is not configured on this server.' })
    }

    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: env.googleClientId,
      })
      payload = ticket.getPayload()
    } catch {
      return res.status(401).json({ message: 'Invalid Google credential.' })
    }

    const { email, name, sub: googleSub } = payload
    if (!email) return res.status(400).json({ message: 'Google account has no email.' })

    // Google is used as a sign-in helper for existing portal users.
    // If the customer does not yet have portal access, direct them to create an account first.
    const r = await db.query(
      'SELECT id, full_name, email, portal_password_hash FROM customers WHERE email = $1 LIMIT 1',
      [email],
    )

    if (r.rows.length === 0 || !r.rows[0].portal_password_hash) {
      return res.status(404).json({ message: 'No portal account found. Please create an account.' })
    }

    const customerId = r.rows[0].id
    const fullName = r.rows[0].full_name

    const ttlMinutes = await getPortalJwtTtlMinutes()
    const token = jwt.sign({ customerId }, env.jwtSecret, { expiresIn: ttlMinutes * 60 })
    const tokenPayload = jwt.decode(token)
    return res.json({
      token,
      tokenTtlMinutes: ttlMinutes,
      tokenExp: tokenPayload?.exp || null,
      customer: { id: customerId, name: fullName, email },
    })
  }),
)

// ─── POST /auth/register ─────────────────────────────────────────────────────

router.post(
  '/auth/register',
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().notEmpty().withMessage('Email address is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const mailer = require('../services/mailer')
    const fullName = String(req.body.fullName || '').trim()
    const email = normalizeEmail(req.body.email)
    const mobileForStorage = normalizeMobileForStorage(req.body.mobile)
    const mobileDigits = normalizeMobileDigits(req.body.mobile)
    const password = String(req.body.password || '')

    if (!email) {
      return res.status(400).json({ message: 'Valid email address is required' })
    }
    if (!mobileDigits) {
      return res.status(400).json({ message: 'Valid mobile number is required' })
    }

    // Locate an existing customer by normalized mobile (digits-only)
    const existingByMobile = await db.query(
      "SELECT id, email, portal_password_hash FROM customers WHERE regexp_replace(mobile, '\\D', '', 'g') = $1 ORDER BY id ASC LIMIT 1",
      [mobileDigits],
    )

    // Locate an existing customer by normalized email (case-insensitive)
    const existingByEmail = await db.query(
      'SELECT id, mobile, portal_password_hash FROM customers WHERE LOWER(TRIM(email)) = $1 ORDER BY id ASC LIMIT 1',
      [email],
    )

    // If the email exists and belongs to a different customer than the mobile match, reject.
    if (existingByEmail.rows.length && existingByMobile.rows.length) {
      const emailId = Number(existingByEmail.rows[0].id)
      const mobileId = Number(existingByMobile.rows[0].id)
      if (emailId && mobileId && emailId !== mobileId) {
        return res.status(409).json({ message: 'This email is already used by another customer.' })
      }
    }

    // If an email match exists (even without portal), and there's no mobile match, reject.
    if (existingByEmail.rows.length && !existingByMobile.rows.length) {
      return res.status(409).json({ message: 'This email is already used by another customer.' })
    }

    // If a mobile match exists and is already portal-enabled, reject.
    if (existingByMobile.rows.length && existingByMobile.rows[0].portal_password_hash) {
      return res.status(409).json({ message: 'An account with this mobile already exists. Please log in.' })
    }

    // If a mobile match exists but has a different non-empty email, reject (prevents hijacking).
    if (existingByMobile.rows.length) {
      const existingEmail = normalizeEmail(existingByMobile.rows[0].email)
      if (existingEmail && existingEmail !== email) {
        return res.status(409).json({ message: 'This mobile is already linked to a different email. Please contact support.' })
      }
    }

    const hash = await bcrypt.hash(password, 10)
    const hasHashedCols = await ensurePortalHashedLoginColumnsExist()
    const iters = hasHashedCols ? await getHashedLoginIters() : null
    const salt = hasHashedCols ? randomB64url(16) : null
    const verifier = hasHashedCols ? deriveVerifierFromPassword({ password, saltB64url: salt, iterations: iters }) : null

    // If admin already created a customer record with this mobile, attach to it;
    // otherwise create a new customer record.
    const existing = existingByMobile
    let customerId
    if (existing.rows.length > 0) {
      customerId = existing.rows[0].id
      if (hasHashedCols) {
        await db.query(
          `UPDATE customers
           SET portal_password_hash = $1,
               portal_password_salt = $2,
               portal_password_verifier = $3,
               portal_password_verifier_iters = $4,
               full_name = $5,
               email = $6,
               lead_source = COALESCE(NULLIF(lead_source, ''), 'Portal')
           WHERE id = $7`,
          [hash, salt, verifier, iters, fullName, email, customerId],
        )
      } else {
        await db.query(
          `UPDATE customers
           SET portal_password_hash = $1,
               full_name = $2,
               email = $3,
               lead_source = COALESCE(NULLIF(lead_source, ''), 'Portal')
           WHERE id = $4`,
          [hash, fullName, email, customerId],
        )
      }
    } else {
      const ins = hasHashedCols
        ? await db.query(
          `INSERT INTO customers (
             full_name,
             mobile,
             email,
             portal_password_hash,
             portal_password_salt,
             portal_password_verifier,
             portal_password_verifier_iters,
             customer_type,
             lead_source,
             created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Walk-in', 'Portal', NOW())
           RETURNING id`,
          [fullName, mobileForStorage, email, hash, salt, verifier, iters],
        )
        : await db.query(
          `INSERT INTO customers (full_name, mobile, email, portal_password_hash, customer_type, lead_source, created_at)
           VALUES ($1, $2, $3, $4, 'Walk-in', 'Portal', NOW())
           RETURNING id`,
          [fullName, mobileForStorage, email, hash],
        )
      customerId = ins.rows[0].id
    }

    const hasEmailCols = await ensurePortalEmailVerificationColumnsExist()
    if (!hasEmailCols) {
      return res.status(503).json({
        message:
          'Email verification is not available on this server yet. Please apply migration: backend/sql/migrations/066_portal_email_verification.sql',
      })
    }

    if (!mailer.isEmailConfigured || !mailer.isEmailConfigured()) {
      return res.status(503).json({
        message: 'Email service is not configured. Please contact support.',
      })
    }

    const otpCode = generateOtpCode()
    const otpHash = await bcrypt.hash(otpCode, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await db.query(
      `UPDATE customers
       SET portal_email_verified_at = NULL,
           portal_email_verification_code_hash = $1,
           portal_email_verification_expires_at = $2
       WHERE id = $3`,
      [otpHash, expiresAt, customerId],
    )

    const sendRes = await mailer.sendPortalEmailVerificationEmail({
      to: email,
      customerName: fullName,
      otpCode,
      expiresMinutes: 10,
    })
    if (sendRes && sendRes.skipped) {
      return res.status(503).json({ message: 'Email service is not configured. Please contact support.' })
    }

    return res.status(201).json({
      requiresEmailVerification: true,
      email,
      message: 'Verification code sent. Please check your email to verify your account.',
    })
  }),
)

// ─── POST /auth/verify-email ────────────────────────────────────────────────

router.post(
  '/auth/verify-email',
  body('email').trim().notEmpty().withMessage('Email address is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  body('code').trim().isLength({ min: 4 }).withMessage('Verification code is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase()
    const code = String(req.body.code || '').trim()

    const hasCols = await ensurePortalEmailVerificationColumnsExist()
    if (!hasCols) {
      return res.status(503).json({
        message:
          'Email verification is not available on this server yet. Please apply migration: backend/sql/migrations/066_portal_email_verification.sql',
      })
    }

    const r = await db.query(
      `SELECT id, full_name, mobile, email,
              portal_email_verified_at,
              portal_email_verification_code_hash,
              portal_email_verification_expires_at
       FROM customers
       WHERE LOWER(email) = LOWER($1) AND portal_password_hash IS NOT NULL
       LIMIT 1`,
      [email],
    )
    const customer = r.rows?.[0]
    if (!customer) return res.status(404).json({ message: 'No portal account found for this email.' })

    if (customer.portal_email_verified_at) {
      const ttlMinutes = await getPortalJwtTtlMinutes()
      const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: ttlMinutes * 60 })
      const tokenPayload = jwt.decode(token)
      return res.json({
        token,
        tokenTtlMinutes: ttlMinutes,
        tokenExp: tokenPayload?.exp || null,
        customer: {
          id: customer.id,
          name: customer.full_name,
          mobile: customer.mobile,
          email: customer.email,
        },
      })
    }

    if (!customer.portal_email_verification_code_hash || !customer.portal_email_verification_expires_at) {
      return res.status(400).json({ message: 'No verification code is active. Please request a new code.' })
    }

    const expiresAt = new Date(customer.portal_email_verification_expires_at)
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code expired. Please request a new code.' })
    }

    const ok = await bcrypt.compare(code, customer.portal_email_verification_code_hash)
    if (!ok) return res.status(400).json({ message: 'Invalid verification code.' })

    await db.query(
      `UPDATE customers
       SET portal_email_verified_at = NOW(),
           portal_email_verification_code_hash = NULL,
           portal_email_verification_expires_at = NULL
       WHERE id = $1`,
      [customer.id],
    )

    const ttlMinutes = await getPortalJwtTtlMinutes()
    const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: ttlMinutes * 60 })
    const tokenPayload = jwt.decode(token)
    return res.json({
      token,
      tokenTtlMinutes: ttlMinutes,
      tokenExp: tokenPayload?.exp || null,
      customer: {
        id: customer.id,
        name: customer.full_name,
        mobile: customer.mobile,
        email: customer.email,
      },
    })
  }),
)

// ─── POST /auth/resend-verification ─────────────────────────────────────────

router.post(
  '/auth/resend-verification',
  body('email').trim().notEmpty().withMessage('Email address is required'),
  body('email').isEmail().withMessage('Valid email address is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const mailer = require('../services/mailer')
    const email = String(req.body.email || '').trim().toLowerCase()

    const hasCols = await ensurePortalEmailVerificationColumnsExist()
    if (!hasCols) {
      return res.status(503).json({
        message:
          'Email verification is not available on this server yet. Please apply migration: backend/sql/migrations/066_portal_email_verification.sql',
      })
    }

    if (!mailer.isEmailConfigured || !mailer.isEmailConfigured()) {
      return res.status(503).json({ message: 'Email service is not configured. Please contact support.' })
    }

    const r = await db.query(
      `SELECT id, full_name, email, portal_email_verified_at
       FROM customers
       WHERE LOWER(email) = LOWER($1) AND portal_password_hash IS NOT NULL
       LIMIT 1`,
      [email],
    )
    const customer = r.rows?.[0]
    if (!customer) return res.status(404).json({ message: 'No portal account found for this email.' })

    if (customer.portal_email_verified_at) {
      return res.json({ ok: true, message: 'Email already verified.' })
    }

    const otpCode = generateOtpCode()
    const otpHash = await bcrypt.hash(otpCode, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await db.query(
      `UPDATE customers
       SET portal_email_verification_code_hash = $1,
           portal_email_verification_expires_at = $2
       WHERE id = $3`,
      [otpHash, expiresAt, customer.id],
    )

    const sendRes = await mailer.sendPortalEmailVerificationEmail({
      to: customer.email,
      customerName: customer.full_name,
      otpCode,
      expiresMinutes: 10,
    })
    if (sendRes && sendRes.skipped) {
      return res.status(503).json({ message: 'Email service is not configured. Please contact support.' })
    }

    return res.json({ ok: true, message: 'Verification code sent.' })
  }),
)

// ─── POST /auth/login ────────────────────────────────────────────────────────

router.post(
  '/auth/login/challenge',
  body('identifier').trim().notEmpty().withMessage('Mobile or email is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const identifier = String(req.body.identifier || '').trim()
    const forceHashed = await isForceHashedPortalLogin()
    const itersFallback = await getHashedLoginIters()

    const hasCols = await ensurePortalHashedLoginColumnsExist()
    if (!hasCols) {
      return res.json({ mode: 'plain' })
    }

    let result
    try {
      result = await db.query(
        `SELECT id, portal_password_salt, portal_password_verifier, portal_password_verifier_iters
         FROM customers
         WHERE (mobile = $1 OR LOWER(email) = LOWER($1)) AND portal_password_hash IS NOT NULL
         LIMIT 1`,
        [identifier],
      )
    } catch {
      return res.json({ mode: 'plain' })
    }
    const customer = result.rows?.[0]
    const hasVerifier = Boolean(customer?.portal_password_verifier && customer?.portal_password_salt && customer?.portal_password_verifier_iters)

    if (!hasVerifier) {
      if (forceHashed && customer) {
        return res.status(409).json({
          code: 'MISSING_VERIFIER',
          message: 'Hashed login is required but this portal account is not upgraded yet. Please disable force_hashed_portal_login temporarily to upgrade, or reset the password.',
        })
      }
      return res.json({ mode: 'plain' })
    }

    const nonce = randomB64url(32)
    const jti = randomB64url(16)
    const challengeToken = jwt.sign(
      { typ: 'portal_login_challenge', identifier, nonce, jti },
      env.jwtSecret,
      { expiresIn: 120 },
    )

    return res.json({
      mode: 'verifier',
      salt: customer.portal_password_salt,
      iters: Number(customer.portal_password_verifier_iters) || itersFallback,
      nonce,
      challengeToken,
    })
  }),
)

router.post(
  '/auth/login/response',
  body('identifier').trim().notEmpty().withMessage('Mobile or email is required'),
  body('challengeToken').notEmpty().withMessage('challengeToken is required'),
  body('proof').notEmpty().withMessage('proof is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
        const hasCols = await ensurePortalHashedLoginColumnsExist()
        if (!hasCols) {
          return res.status(409).json({ code: 'MISSING_VERIFIER', message: 'Hashed portal login is not available on this server yet. Please apply migration: backend/sql/migrations/068_hashed_login_verifier.sql' })
        }
    const identifier = String(req.body.identifier || '').trim()
    const challengeToken = String(req.body.challengeToken || '')
    const proof = String(req.body.proof || '')

    let payload
    try {
      payload = jwt.verify(challengeToken, env.jwtSecret)
    } catch {
      return res.status(401).json({ message: 'Invalid or expired challenge.' })
    }

    if (payload?.typ !== 'portal_login_challenge' || String(payload?.identifier || '') !== identifier) {
      return res.status(401).json({ message: 'Invalid challenge.' })
    }

    const jti = String(payload?.jti || '')
    if (!jti) return res.status(401).json({ message: 'Invalid challenge.' })
    if (portalWasUsed(jti)) return res.status(401).json({ message: 'Challenge already used.' })

    const result = await db.query(
      `SELECT id, full_name, mobile, email,
              portal_password_verifier, portal_password_salt, portal_password_verifier_iters,
              portal_email_verified_at
       FROM customers
       WHERE (mobile = $1 OR LOWER(email) = LOWER($1)) AND portal_password_hash IS NOT NULL
       LIMIT 1`,
      [identifier],
    )
    const customer = result.rows?.[0]
    if (!customer || !customer.portal_password_verifier) {
      return res.status(401).json({ message: 'Invalid credentials or no portal account found.' })
    }

    const expected = computeProof({ verifierB64url: customer.portal_password_verifier, nonce: String(payload.nonce || '') })
    const ok = timingSafeEqualB64url(expected, proof)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 120000
    markPortalUsed(jti, expMs)

    if (!customer.portal_email_verified_at) {
      return res.status(403).json({
        message: 'Please verify your email address before logging in.',
        requiresEmailVerification: true,
        email: customer.email,
      })
    }

    const ttlMinutes = await getPortalJwtTtlMinutes()
    const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: ttlMinutes * 60 })
    const tokenPayload = jwt.decode(token)
    return res.json({
      token,
      tokenTtlMinutes: ttlMinutes,
      tokenExp: tokenPayload?.exp || null,
      customer: {
        id: customer.id,
        name: customer.full_name,
        mobile: customer.mobile,
        email: customer.email,
      },
    })
  }),
)

router.post(
  '/auth/login',
  body('identifier').trim().notEmpty().withMessage('Mobile or email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const identifier = String(req.body.identifier || '').trim()
    const password = String(req.body.password || '')

    const hasCols = await ensurePortalHashedLoginColumnsExist()

    let result
    if (hasCols) {
      try {
        result = await db.query(
          `SELECT id, full_name, mobile, email,
                  portal_password_hash,
                  portal_password_salt, portal_password_verifier, portal_password_verifier_iters,
                  portal_email_verified_at
           FROM customers
           WHERE (mobile = $1 OR LOWER(email) = LOWER($1)) AND portal_password_hash IS NOT NULL`,
          [identifier],
        )
      } catch {
        // Fallback below
      }
    }
    if (!result) {
      result = await db.query(
        `SELECT id, full_name, mobile, email, portal_password_hash, portal_email_verified_at
         FROM customers
         WHERE (mobile = $1 OR LOWER(email) = LOWER($1)) AND portal_password_hash IS NOT NULL`,
        [identifier],
      )
    }
    const customer = result.rows[0]
    if (!customer) {
      return res
        .status(401)
        .json({ message: 'Invalid credentials or no portal account found.' })
    }

    const isValid = await bcrypt.compare(password, customer.portal_password_hash)
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    // If verifier isn't set yet, upgrade it now (so the next login can be hashed-in-browser).
    if (hasCols && (!customer.portal_password_verifier || !customer.portal_password_salt || !customer.portal_password_verifier_iters)) {
      try {
        const iters = await getHashedLoginIters()
        const salt = randomB64url(16)
        const verifier = deriveVerifierFromPassword({ password, saltB64url: salt, iterations: iters })
        await db.query(
          `UPDATE customers
           SET portal_password_salt = $1,
               portal_password_verifier = $2,
               portal_password_verifier_iters = $3
           WHERE id = $4`,
          [salt, verifier, iters, customer.id],
        )
      } catch {
        // Ignore upgrade failures; keep normal login working.
      }
    }

    // Require email verification for email-based accounts.
    if (!customer.portal_email_verified_at) {
      return res.status(403).json({
        message: 'Please verify your email address before logging in.',
        requiresEmailVerification: true,
        email: customer.email,
      })
    }

    const ttlMinutes = await getPortalJwtTtlMinutes()
    const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: ttlMinutes * 60 })
    const tokenPayload = jwt.decode(token)
    return res.json({
      token,
      tokenTtlMinutes: ttlMinutes,
      tokenExp: tokenPayload?.exp || null,
      customer: {
        id: customer.id,
        name: customer.full_name,
        mobile: customer.mobile,
        email: customer.email,
      },
    })
  }),
)

// ─── All routes below require portal auth ────────────────────────────────────

router.use(requirePortalAuth)

// Resolve linked customer IDs for portal listings (email/mobile match)
router.use(
  asyncHandler(async (req, _res, next) => {
    req.customerIds = await resolveLinkedCustomerIds(req.customerId)
    return next()
  }),
)

// ─── GET /me ────────────────────────────────────────────────────────────────

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const r = await db.query(
      'SELECT id, full_name, mobile, email, address, lead_source, preferred_contact_method FROM customers WHERE id = $1',
      [req.customerId],
    )
    if (!r.rows.length) return res.status(404).json({ message: 'Customer not found' })
    return res.json(r.rows[0])
  }),
)

// ─── PUT /me ────────────────────────────────────────────────────────────────

router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const {
      full_name,
      email,
      mobile,
      address,
      lead_source,
      preferred_contact_method,
      current_password,
      new_password,
    } = req.body

    const leadSource = String(lead_source || '').trim()
    const preferredContactMethod = 'Email'
    if (!leadSource) {
      return res.status(400).json({ message: 'Lead Source is required.' })
    }

    const r = await db.query(
      'SELECT portal_password_hash FROM customers WHERE id = $1',
      [req.customerId],
    )
    if (!r.rows.length) return res.status(404).json({ message: 'Customer not found' })

    let extraClause = ''
    const params = [
      full_name,
      email || null,
      mobile,
      address || null,
      leadSource,
      preferredContactMethod,
      req.customerId,
    ]

    if (new_password) {
      const isValid = await bcrypt.compare(current_password || '', r.rows[0].portal_password_hash)
      if (!isValid) return res.status(400).json({ message: 'Current password is incorrect.' })
      const hash = await bcrypt.hash(new_password, 10)
      const iters = await getHashedLoginIters()
      const salt = randomB64url(16)
      const verifier = deriveVerifierFromPassword({ password: new_password, saltB64url: salt, iterations: iters })
      extraClause = ', portal_password_hash = $8, portal_password_salt = $9, portal_password_verifier = $10, portal_password_verifier_iters = $11'
      params.push(hash, salt, verifier, iters)
    }

    const updated = await db.query(
      `UPDATE customers
       SET full_name = COALESCE($1, full_name),
           email     = $2,
           mobile    = COALESCE($3, mobile),
           address   = $4,
           lead_source = $5,
           preferred_contact_method = $6
           ${extraClause}
       WHERE id = $7
       RETURNING id, full_name, mobile, email, address, lead_source, preferred_contact_method`,
      params,
    )
    return res.json({ customer: updated.rows[0] })
  }),
)

// ─── GET /dashboard/stats ────────────────────────────────────────────────────

router.get(
  '/dashboard/stats',
  asyncHandler(async (req, res) => {
    const [apptR, jobsR, spendR] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status IN (
                  'Scheduled','Confirmed','Checked-in','In progress',
                  'In Progress','QA','Ready for release'
                )) AS upcoming
         FROM appointments WHERE customer_id = $1`,
        [req.customerId],
      ),
      db.query(
        `SELECT COUNT(*) AS active
         FROM job_orders jo
         WHERE jo.customer_id = $1
           AND jo.status NOT IN ('Complete','Completed','Released','Closed','Cancelled','Deleted')`,
        [req.customerId],
      ),
      db.query(
        `SELECT COALESCE(SUM(p.amount), 0) AS total_spend
         FROM payments p
         LEFT JOIN quotations q ON q.id = p.quotation_id
         LEFT JOIN sales s      ON s.id = p.sale_id
         WHERE COALESCE(q.customer_id, s.customer_id) = $1`,
        [req.customerId],
      ),
    ])

    return res.json({
      totalAppointments: Number(apptR.rows[0].total),
      upcomingAppointments: Number(apptR.rows[0].upcoming),
      activeJobs: Number(jobsR.rows[0].active),
      totalSpend: Number(spendR.rows[0].total_spend),
    })
  }),
)

// ─── GET /appointments ───────────────────────────────────────────────────────

router.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const { rows: cancelReqCols } = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'appointments'
         AND column_name = 'cancel_request_status'
       LIMIT 1`,
    )
    const hasCancelRequest = !!cancelReqCols.length

    const cancelReqSelect = hasCancelRequest
      ? `a.cancel_request_status, a.cancel_request_action, a.cancel_request_reason,
              a.cancel_requested_at, a.cancel_request_resolved_at`
      : `NULL::text AS cancel_request_status,
              NULL::text AS cancel_request_action,
              NULL::text AS cancel_request_reason,
              NULL::timestamp AS cancel_requested_at,
              NULL::timestamp AS cancel_request_resolved_at`

    const r = await db.query(
      `SELECT a.id, a.status, a.schedule_start, a.schedule_end,
              a.bay, a.installer_team, a.notes, a.created_at,
              a.down_payment_amount, a.down_payment_method, a.down_payment_ref,
              ${cancelReqSelect},
              v.make, v.model, v.year, v.plate_number, v.color,
              s.name AS service_name, s.category AS service_category,
              jo.id              AS job_order_id,
              jo.job_order_no    AS job_order_no,
              q.total_amount     AS total_amount,
              COALESCE(qps.total_paid, 0) AS paid_amount
       FROM appointments a
       JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN job_orders jo ON jo.schedule_id = a.id AND jo.status != 'Deleted'
       LEFT JOIN quotations q ON q.id = jo.quotation_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       WHERE a.customer_id = $1
       ORDER BY a.schedule_start DESC`,
      [req.customerId],
    )
    return res.json(r.rows)
  }),
)

// ─── POST /appointments/book ─────────────────────────────────────────────────

router.post(
  '/appointments/book',
  asyncHandler(async (req, res) => {
    const { vehicleId, branch, vehicleSize, serviceId, serviceUnitPrice, scheduleStart, scheduleEnd, notes,
            downPaymentAmount, downPaymentMethod, downPaymentRef } = req.body

    if (!vehicleId || !scheduleStart) {
      return res.status(400).json({ message: 'Vehicle and schedule start are required.' })
    }

    // Verify vehicle belongs to this customer
    const v = await db.query(
      'SELECT id FROM vehicles WHERE id = $1 AND customer_id = $2',
      [vehicleId, req.customerId],
    )
    if (!v.rows.length) return res.status(403).json({ message: 'Vehicle not found.' })

    // Create a Quotation for the portal request, and also create a Scheduling
    // Appointment in status 'Requested' so admin/staff can review/approve in Scheduling.

    const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
    function getBranchCode(bay) {
      if (!bay) return 'BR'
      return BRANCH_CODES[String(bay || '').toLowerCase().trim()] || String(bay).substring(0, 3).toUpperCase()
    }

    async function nextQuotationNo(client, branchCode = 'BR') {
      const year = new Date().getFullYear()
      const yearShort = String(year).slice(-3)
      const prefix = `QT-${branchCode}-${yearShort}-`
      const { rows } = await client.query(
        `SELECT quotation_no FROM quotations
         WHERE quotation_no LIKE $1
         ORDER BY quotation_no DESC LIMIT 1`,
        [`${prefix}%`],
      )
      const last = rows[0]?.quotation_no
      const seq = last ? parseInt(String(last).split('-')[3], 10) + 1 : 1
      return `${prefix}${String(seq).padStart(4, '0')}`
    }

    const dt = (iso) => {
      if (!iso) return null
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    const client = await db.pool.connect()
    let createdQuotation
    let createdAppointment
    let resolvedService = null
    let finalBranch = null
    let sizeKey = null
    let finalNotes = ''
    let isSubscriptionAvailRequest = false
    let isPmsAvailRequest = false
    try {
      await client.query('BEGIN')

      // Resolve service details (optional)
      if (serviceId) {
        const { rows: svcRows } = await client.query(
          `SELECT id, name, category, base_price
           FROM services
           WHERE id = $1`,
          [serviceId],
        )
        if (svcRows[0]) resolvedService = svcRows[0]
      }

      // Resolve customer branch/bay (optional)
      const { rows: custRows } = await client.query(
        `SELECT bay
         FROM customers
         WHERE id = $1`,
        [req.customerId],
      )
      const resolvedBay = custRows[0]?.bay || null

      const requestedBranch = String(branch || '').trim() || null
      finalBranch = requestedBranch || resolvedBay

      const quotationNo = await nextQuotationNo(client, getBranchCode(finalBranch))

      const scheduleLabel = dt(scheduleStart)
      const endLabel = dt(scheduleEnd)
      const dpAmt = Number(downPaymentAmount || 0)
      const dpMethod = downPaymentMethod ? String(downPaymentMethod) : null
      const dpRef = downPaymentRef ? String(downPaymentRef) : null
      sizeKey = vehicleSize ? String(vehicleSize).trim() : null

      const reqUnitPrice = Number(serviceUnitPrice)
      const resolvedUnitPrice = (Number.isFinite(reqUnitPrice) && reqUnitPrice > 0)
        ? reqUnitPrice
        : (resolvedService ? Number(resolvedService.base_price || 0) : 0)

      const noteParts = [
        '[PORTAL BOOKING REQUEST]',
        scheduleLabel ? `Preferred start: ${scheduleLabel}` : null,
        endLabel ? `Estimated end: ${endLabel}` : null,
        resolvedService ? `Requested service: ${resolvedService.name}` : null,
        sizeKey ? `Vehicle size: ${sizeKey}` : null,
        dpMethod ? `Down payment method: ${dpMethod}` : null,
        (dpMethod && dpMethod !== 'cash' && dpAmt > 0) ? `Down payment: ₱${dpAmt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : null,
        (dpMethod && dpMethod !== 'cash' && dpRef) ? `Reference: ${dpRef}` : null,
        (dpMethod === 'cash') ? 'Down payment: Pay on arrival (cash)' : null,
        notes ? String(notes).trim() : null,
      ].filter(Boolean)
      finalNotes = noteParts.join('\n')
      isSubscriptionAvailRequest = finalNotes.includes('[PORTAL SUBSCRIPTION AVAIL REQUEST]')
      isPmsAvailRequest = finalNotes.includes('[PORTAL PMS AVAIL REQUEST]')

      const totalAmount = resolvedService ? resolvedUnitPrice : 0
      const servicesJson = resolvedService
        ? [{ id: resolvedService.id, name: resolvedService.name, unitPrice: totalAmount, qty: 1 }]
        : []

      const { rows: bayCols } = await client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'quotations'
           AND column_name = 'bay'
         LIMIT 1`,
      )
      const hasBay = !!bayCols.length

      const insertSql = hasBay
        ? `INSERT INTO quotations
             (quotation_no, customer_id, vehicle_id, services, notes, total_amount, created_by, status, bay)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, quotation_no, status, created_at`
        : `INSERT INTO quotations
             (quotation_no, customer_id, vehicle_id, services, notes, total_amount, created_by, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, quotation_no, status, created_at`

      const insertParams = hasBay
        ? [quotationNo, req.customerId, vehicleId, JSON.stringify(servicesJson), finalNotes, totalAmount, null, 'Pending', finalBranch]
        : [quotationNo, req.customerId, vehicleId, JSON.stringify(servicesJson), finalNotes, totalAmount, null, 'Pending']

      const { rows: qRows } = await client.query(insertSql, insertParams)
      createdQuotation = qRows[0]

      // Create a matching appointment request so it appears in Scheduling
      try {
        const { rows: apptCols } = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'appointments'
             AND column_name IN ('booking_source')`,
        )
        const hasBookingSource = apptCols.some((r) => r.column_name === 'booking_source')

        const apptInsertSql = hasBookingSource
          ? `INSERT INTO appointments (
               customer_id, vehicle_id, service_id, schedule_start, schedule_end,
               bay, installer_team, status, notification_channel, sale_id, quotation_id, notes, booking_source
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING id, status, created_at`
          : `INSERT INTO appointments (
               customer_id, vehicle_id, service_id, schedule_start, schedule_end,
               bay, installer_team, status, notification_channel, sale_id, quotation_id, notes
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING id, status, created_at`

        const apptParams = hasBookingSource
          ? [
              req.customerId,
              vehicleId,
              resolvedService?.id || serviceId || null,
              scheduleStart,
              scheduleEnd || null,
              finalBranch,
              null,
              'Requested',
              'SMS',
              null,
              createdQuotation?.id || null,
              String(finalNotes || '').trim() || null,
              'portal',
            ]
          : [
              req.customerId,
              vehicleId,
              resolvedService?.id || serviceId || null,
              scheduleStart,
              scheduleEnd || null,
              finalBranch,
              null,
              'Requested',
              'SMS',
              null,
              createdQuotation?.id || null,
              String(finalNotes || '').trim() || null,
            ]

        const { rows: apptRows } = await client.query(apptInsertSql, apptParams)
        createdAppointment = apptRows[0]
      } catch (err) {
        // Best-effort: quotation creation should still succeed.
        // But log so we can diagnose why Scheduling didn't get a row.
        console.error('[portal] failed to create appointment for booking request', {
          error: err?.message,
          customerId: req.customerId,
          vehicleId,
          quotationId: createdQuotation?.id,
        })
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // ── Send quotation-request-received email (best-effort; never blocks the response) ──
    try {
      const [cfgEnabled] = await Promise.all([
        ConfigurationService.get('booking_email', 'enabled'),
      ]).catch(() => [null])

      if (String(cfgEnabled) !== 'false') {
        const { rows: detail } = await db.query(
          `SELECT c.full_name AS customer_name,
                  c.mobile   AS customer_mobile,
                  c.email    AS customer_email,
                  v.plate_number, v.make, v.model, v.year, v.color,
                  sv.name    AS service_name
           FROM customers c
           JOIN vehicles  v ON v.customer_id = c.id
           LEFT JOIN services sv ON sv.id = $3
           WHERE c.id = $1 AND v.id = $2
           LIMIT 1`,
          [req.customerId, vehicleId, serviceId || null],
        )

        if (detail[0]?.customer_email) {
          const commonEmailPayload = {
            to:            detail[0].customer_email,
            customerName:  detail[0].customer_name,
            plateNumber:   detail[0].plate_number,
            make:          detail[0].make,
            model:         detail[0].model,
            vehicleYear:   detail[0].year,
            color:         detail[0].color,
            preferredStart: scheduleStart,
            preferredEnd:   scheduleEnd || null,
            serviceName:    resolvedService?.name || detail[0].service_name,
            referenceNo:    createdQuotation?.quotation_no || null,
            notes:          String(finalNotes || '').trim() || null,
          }

          if (isSubscriptionAvailRequest) {
            await sendPortalSubscriptionRequestEmail(commonEmailPayload).catch(() => {})
          } else if (isPmsAvailRequest) {
            await sendPortalPmsRequestEmail(commonEmailPayload).catch(() => {})
          } else {
            await sendPortalBookingRequestEmail(commonEmailPayload).catch(() => {})
          }
        }

        // Admin/staff notification (email) for portal quotation requests
        try {
          const businessEmail = await ConfigurationService.get('business', 'business_email')
          if (businessEmail) {
            const staffPayload = {
              quotationNo: createdQuotation?.quotation_no || null,
              branch: finalBranch,
              customerName: detail[0]?.customer_name,
              mobile: detail[0]?.customer_mobile,
              email: detail[0]?.customer_email,
              make: detail[0]?.make,
              model: detail[0]?.model,
              vehicleSize: sizeKey,
              serviceName: resolvedService?.name || detail[0]?.service_name,
              notes: String(finalNotes || '').trim() || null,
            }

            const staffTemplate = isSubscriptionAvailRequest
              ? buildSubscriptionRequestStaffEmail(staffPayload)
              : isPmsAvailRequest
                ? buildPmsRequestStaffEmail(staffPayload)
                : buildQuotationRequestStaffEmail(staffPayload)

            await sendRawEmail({
              to: businessEmail,
              subject: staffTemplate.subject,
              html: staffTemplate.html,
              text: staffTemplate.text,
            })
          }
        } catch (_) {
          // Silent
        }
      }
    } catch (_) {
      // ignore email failures
    }

    emitDataChanged({
      scope: 'appointments',
      action: 'portal_request',
      appointmentId: createdAppointment?.id || null,
      quotationId: createdQuotation?.id || null,
      customerId: req.customerId,
    })

    await NotificationService.create({
      role: 'admin',
      title: isSubscriptionAvailRequest ? 'New Subscription Request' : isPmsAvailRequest ? 'New PMS Request' : 'New Booking Request',
      message: isSubscriptionAvailRequest
        ? `Client submitted a subscription request (${createdQuotation?.quotation_no || 'new quotation'}).`
        : isPmsAvailRequest
          ? `Client submitted a PMS request (${createdQuotation?.quotation_no || 'new quotation'}).`
          : `Client submitted a booking request (${createdQuotation?.quotation_no || 'new quotation'}).`,
      payload: {
        type: isSubscriptionAvailRequest ? 'subscription-request' : isPmsAvailRequest ? 'pms-request' : 'booking-request',
        quotation_id: createdQuotation?.id || null,
        appointment_id: createdAppointment?.id || null,
        customer_id: req.customerId,
      },
    }).catch(() => {})

    await NotificationService.create({
      role: 'client',
      userId: req.customerId,
      title: isSubscriptionAvailRequest ? 'Subscription Request Submitted' : isPmsAvailRequest ? 'PMS Request Submitted' : 'Booking Request Submitted',
      message: isSubscriptionAvailRequest
        ? 'Your subscription request was sent to admin for approval.'
        : isPmsAvailRequest
          ? 'Your PMS request was sent to admin for approval.'
          : 'Your booking request was sent to admin for approval.',
      payload: {
        type: isSubscriptionAvailRequest ? 'subscription-request' : isPmsAvailRequest ? 'pms-request' : 'booking-request',
        quotation_id: createdQuotation?.id || null,
        appointment_id: createdAppointment?.id || null,
      },
    }).catch(() => {})

    return res.status(201).json({
      id: createdQuotation?.id,
      appointmentId: createdAppointment?.id || null,
      quotationNo: createdQuotation?.quotation_no,
      message: isSubscriptionAvailRequest
        ? 'Subscription request submitted. A quotation has been created for approval.'
        : isPmsAvailRequest
          ? 'PMS request submitted. A quotation has been created for approval.'
        : 'Booking request submitted. A quotation has been created for approval.',
    })
  }),
)

// ─── POST /appointments/:id/cancel ──────────────────────────────────────────
// Customer-initiated cancellation.
// Policy: allow only when the appointment belongs to the customer, is still in a
// schedulable state, and has no recorded payments (including non-cash portal down payment).

router.post(
  '/appointments/:id/cancel',
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const appointmentId = Number(req.params.id)
    const action = req.body?.action ? String(req.body.action).trim().toLowerCase() : null
    const cancelReason = req.body?.cancelReason ? String(req.body.cancelReason).trim() : ''

    // Guard: ensure cancellation-request schema is applied
    const { rows: colRows } = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'appointments'
         AND column_name = 'cancel_request_status'
       LIMIT 1`,
    )
    if (!colRows.length) {
      return res.status(503).json({
        message: 'Portal cancellation-request workflow is not available on this server yet. Please apply migration: backend/sql/migrations/063_portal_cancellation_requests.sql',
      })
    }

    const { rows: apptRows } = await db.query(
      `SELECT id, customer_id, status,
              quotation_id, sale_id,
              down_payment_amount, down_payment_method
       FROM appointments
       WHERE id = $1 AND customer_id = $2`,
      [appointmentId, req.customerId],
    )

    if (!apptRows.length) {
      return res.status(404).json({ message: 'Appointment not found.' })
    }

    const appt = apptRows[0]

    if (appt.status === 'Cancelled') return res.status(409).json({ message: 'Appointment is already cancelled.' })
    if (appt.status === 'Completed' || appt.status === 'Released' || appt.status === 'Paid') {
      return res.status(409).json({ message: `Appointment cannot be cancelled in status: ${appt.status}.` })
    }
    if (appt.status !== 'Scheduled' && appt.status !== 'Confirmed') {
      return res.status(409).json({ message: `Appointment cannot be cancelled in status: ${appt.status}.` })
    }

    // Determine if any payment exists (including non-cash portal down payment)
    let totalPaid = 0
    const dpPaid = (appt.down_payment_method && appt.down_payment_method !== 'cash' && Number(appt.down_payment_amount || 0) > 0)
      ? Number(appt.down_payment_amount || 0)
      : 0
    totalPaid += dpPaid

    // Resolve a quotation_id (prefer appointment.quotation_id; fallback via job order)
    let quotationId = appt.quotation_id
    if (!quotationId) {
      const { rows: jo } = await db.query(
        `SELECT quotation_id
         FROM job_orders
         WHERE schedule_id = $1 AND status != 'Deleted' AND quotation_id IS NOT NULL
         ORDER BY id DESC
         LIMIT 1`,
        [appt.id],
      )
      quotationId = jo[0]?.quotation_id || null
    }

    if (quotationId) {
      const { rows: qps } = await db.query(
        'SELECT total_paid FROM quotation_payment_summary WHERE quotation_id = $1',
        [quotationId],
      )
      if (qps[0]) totalPaid += Number(qps[0].total_paid || 0)
    } else if (appt.sale_id) {
      const { rows: fs } = await db.query(
        'SELECT total_paid FROM sale_financial_summary WHERE sale_id = $1',
        [appt.sale_id],
      )
      if (fs[0]) totalPaid += Number(fs[0].total_paid || 0)
    }

    if (totalPaid > 0 && action !== 'refund' && action !== 'credit') {
      return res.status(400).json({
        message: 'This booking has a payment on file. Please choose refund or credit to proceed.',
        requiresAction: true,
        total_paid: totalPaid,
      })
    }

    // If already pending, avoid duplicate requests
    const { rows: pendingRows } = await db.query(
      `SELECT cancel_request_status
       FROM appointments
       WHERE id = $1 AND customer_id = $2`,
      [appointmentId, req.customerId],
    )
    const existingStatus = String(pendingRows[0]?.cancel_request_status || '')
    if (existingStatus.toUpperCase() === 'PENDING') {
      return res.status(409).json({ message: 'Cancellation request is already pending approval.' })
    }

    const reasonText = (() => {
      if (totalPaid > 0) {
        const base = action === 'refund'
          ? `portal refund requested — ₱${Number(totalPaid).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
          : `portal credit requested — ₱${Number(totalPaid).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        return cancelReason ? `${base} — ${cancelReason}` : base
      }
      const base = 'portal cancellation requested'
      return cancelReason ? `${base} — ${cancelReason}` : base
    })()

    const { rows: updated } = await db.query(
      `UPDATE appointments
       SET cancel_request_status = 'PENDING',
           cancel_request_action = $3,
           cancel_request_reason = $4,
           cancel_requested_at   = NOW(),
           cancel_request_resolved_at = NULL,
           cancel_request_resolved_by = NULL
       WHERE id = $1 AND customer_id = $2
       RETURNING id, status, cancel_request_status, cancel_request_action, cancel_request_reason, cancel_requested_at`,
      [appointmentId, req.customerId, totalPaid > 0 ? action : 'cancel', reasonText],
    )

    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
       VALUES (NULL, 'PORTAL_CANCEL_REQUEST', 'appointments', $1, $2, NOW())`,
      [appointmentId, `Customer #${req.customerId} — ${reasonText}`],
    ).catch(() => {})

    return res.json({ success: true, request: updated[0], total_paid: totalPaid })
  }),
)

// ─── GET /vehicles ───────────────────────────────────────────────────────────

router.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    try {
      const cols = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vehicles'",
      )
      const colNames = new Set(cols.rows.map((r) => r.column_name))

      const pick = (name) => (colNames.has(name) ? name : null)
      const selectFields = [
        'id',
        pick('created_at'),
        pick('make'),
        pick('model'),
        pick('year'),
        pick('plate_number'),
        pick('conduction_sticker'),
        pick('color'),
        pick('variant'),
        pick('odometer'),
      ].filter(Boolean)

      const hasCreatedAt = colNames.has('created_at')
      const orderBy = hasCreatedAt ? 'created_at DESC' : 'id DESC'

      const r = await db.query(
        `SELECT ${selectFields.join(', ')}
         FROM vehicles
         WHERE customer_id = ANY($1::int[])
         ORDER BY ${orderBy}`,
        [req.customerIds || [req.customerId]],
      )
      return res.json(r.rows)
    } catch (err) {
      console.error('Portal vehicles query failed:', err.message || err)
      const r = await db.query(
        `SELECT id, make, model, year, plate_number
         FROM vehicles
         WHERE customer_id = ANY($1::int[])
         ORDER BY id DESC`,
        [req.customerIds || [req.customerId]],
      )
      return res.json(r.rows)
    }
  }),
)

// ─── GET /vehicle-makes ─────────────────────────────────────────────────────
// Read-only lookup for portal vehicle registration dropdowns.
router.get(
  '/vehicle-makes',
  asyncHandler(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, category, is_active, sort_order
       FROM vehicle_makes
       WHERE is_active = TRUE
       ORDER BY sort_order, name`,
    )
    return res.json(rows)
  }),
)

// ─── GET /vehicle-makes/:makeId/models ──────────────────────────────────────
router.get(
  '/vehicle-makes/:makeId/models',
  asyncHandler(async (req, res) => {
    const { makeId } = req.params
    if (!makeId || Number.isNaN(Number(makeId))) {
      return res.status(400).json({ message: 'Invalid make id' })
    }
    const makeCheck = await db.query('SELECT id FROM vehicle_makes WHERE id = $1', [makeId])
    if (makeCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle make not found' })
    }

    try {
      const cols = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicle_models' AND column_name IN ('year_from','year_to','is_active')",
      )
      const colNames = cols.rows.map((r) => r.column_name)
      const hasYearFrom = colNames.includes('year_from')
      const hasYearTo = colNames.includes('year_to')
      const hasIsActive = colNames.includes('is_active')

      const selectFields = ['id', 'name']
      if (hasYearFrom) selectFields.push('year_from')
      if (hasYearTo) selectFields.push('year_to')
      if (hasIsActive) selectFields.push('is_active')

      const whereClause = hasIsActive ? 'WHERE make_id = $1 AND is_active = TRUE' : 'WHERE make_id = $1'
      const { rows } = await db.query(
        `SELECT ${selectFields.join(', ')}
         FROM vehicle_models
         ${whereClause}
         ORDER BY name`,
        [makeId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Portal vehicle models fetch failed:', err.message || err)
      const { rows } = await db.query(
        `SELECT id, name
         FROM vehicle_models
         WHERE make_id = $1
         ORDER BY name`,
        [makeId],
      )
      return res.json(rows)
    }
  }),
)

// ─── GET /vehicle-makes/models/:modelId/variants ────────────────────────────
router.get(
  '/vehicle-makes/models/:modelId/variants',
  asyncHandler(async (req, res) => {
    const { modelId } = req.params
    if (!modelId || Number.isNaN(Number(modelId))) {
      return res.status(400).json({ message: 'Invalid model id' })
    }
    try {
      const cols = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicle_variants' AND column_name IN ('is_active')",
      )
      const hasIsActive = cols.rows.some((r) => r.column_name === 'is_active')
      const whereClause = hasIsActive
        ? 'WHERE model_id = $1 AND is_active = TRUE'
        : 'WHERE model_id = $1'
      const selectFields = ['id', 'name', 'fuel_type', 'transmission']
      if (hasIsActive) selectFields.push('is_active')

      const { rows } = await db.query(
        `SELECT ${selectFields.join(', ')}
         FROM vehicle_variants
         ${whereClause}
         ORDER BY name`,
        [modelId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Portal variants query failed:', err.message || err)
      const { rows } = await db.query(
        `SELECT id, name, fuel_type, transmission
         FROM vehicle_variants
         WHERE model_id = $1
         ORDER BY name`,
        [modelId],
      )
      return res.json(rows)
    }
  }),
)

// ─── GET /vehicle-makes/variants/:variantId/years ───────────────────────────
router.get(
  '/vehicle-makes/variants/:variantId/years',
  asyncHandler(async (req, res) => {
    const { variantId } = req.params
    if (!variantId || Number.isNaN(Number(variantId))) {
      return res.status(400).json({ message: 'Invalid variant id' })
    }
    const { rows } = await db.query(
      `SELECT id, year_model
       FROM vehicle_years
       WHERE variant_id = $1 AND is_active = TRUE
       ORDER BY year_model DESC`,
      [variantId],
    )
    return res.json(rows)
  }),
)

// ─── POST /vehicles ─────────────────────────────────────────────────────────
// Portal vehicle registration (customer creates a vehicle under their account)
router.post(
  '/vehicles',
  body('plateNumber').isString().notEmpty().withMessage('plateNumber is required'),
  body('make').isString().notEmpty().withMessage('make is required'),
  body('model').isString().notEmpty().withMessage('model is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const customerId = req.customerId
    const {
      conductionSticker,
      vinChassis,
      make,
      model,
      year,
      variant,
      color,
      odometer,
      forceCreate,
      customMake,
      bodyType,
    } = req.body

    const plateNumber = normalizePlate(req.body.plateNumber)

    // Make resolution using the same logic as /api/vehicles
    const makeTrimmed = (make || '').trim()
    const { rows: makeRows } = await db.query(
      'SELECT id, name FROM vehicle_makes WHERE LOWER(name) = LOWER($1) AND is_active = TRUE',
      [makeTrimmed],
    )

    let resolvedMake = null
    let currentCustomMake = customMake
    if (makeRows.length) {
      resolvedMake = makeRows[0].name
    } else {
      const { rows: otherRows } = await db.query(
        "SELECT id, name FROM vehicle_makes WHERE LOWER(name) = 'other' AND is_active = TRUE",
      )
      if (otherRows.length) {
        resolvedMake = otherRows[0].name
        currentCustomMake = makeTrimmed
      } else {
        return res.status(400).json({ message: `Invalid vehicle make: "${makeTrimmed}". Please select from the list.` })
      }
    }

    const isOther = resolvedMake === 'Other'
    if (isOther && !currentCustomMake?.trim()) {
      return res.status(400).json({ message: 'Please specify the vehicle make when selecting "Other".' })
    }
    const finalMake = isOther ? currentCustomMake.trim() : resolvedMake
    const finalCustomMake = isOther ? currentCustomMake.trim() : null

    // Plate format rules consistent with staff vehicle registration
    const isTemporary = !!conductionSticker
    if (!isTemporary) {
      const { valid, errors: plateErrors } = validatePlateFormat(plateNumber)
      if (!valid) {
        return res.status(400).json({ message: plateErrors[0] || 'Invalid plate format.', plateErrors })
      }
    } else {
      if (!/^[A-Z0-9]{3,10}$/.test(plateNumber)) {
        return res.status(400).json({ message: 'Temporary plate must be 3-10 uppercase alphanumeric characters.' })
      }
    }

    const suspicious = isSuspiciousPlate(plateNumber)

    // Duplicate plate check
    const { rows: existing } = await db.query(
      'SELECT id, customer_id, plate_number FROM vehicles WHERE plate_number = $1',
      [plateNumber],
    )

    if (existing.length) {
      const sameCustomer = existing.some((v) => Number(v.customer_id) === Number(customerId))
      if (sameCustomer) {
        return res.status(409).json({
          message: 'This plate number is already registered to your account.',
          duplicate: true,
          sameCustomer: true,
        })
      }
      if (!forceCreate) {
        return res.status(409).json({
          message: 'This plate number already exists in the system. Please confirm if this is a returning vehicle.',
          duplicate: true,
          sameCustomer: false,
          existingCustomerId: existing[0].customer_id,
        })
      }
    }

    const { rows } = await db.query(
      `INSERT INTO vehicles (
        customer_id, plate_number, conduction_sticker, vin_chassis,
        make, model, year, variant, color, odometer, is_suspicious, custom_make, body_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id, make, model, year, plate_number, conduction_sticker, color, variant, odometer, created_at`,
      [
        customerId,
        plateNumber,
        conductionSticker || null,
        vinChassis || null,
        finalMake,
        (model || '').trim(),
        year ? Number(year) : null,
        variant || null,
        color || null,
        odometer !== undefined && odometer !== null && odometer !== '' ? Number(odometer) : null,
        suspicious,
        finalCustomMake,
        bodyType || null,
      ],
    )

    emitDataChanged({ scope: 'vehicles', action: 'portal_create', id: rows[0].id, customerId })
    await NotificationService.create({
      role: 'admin',
      title: 'Client Registered Vehicle',
      message: `Client added vehicle ${rows[0].plate_number}`,
      payload: { type: 'vehicle', action: 'portal_create', vehicle_id: rows[0].id, customer_id: customerId },
    }).catch(() => {})

    await NotificationService.create({
      role: 'client',
      userId: customerId,
      title: 'Vehicle Registered',
      message: `${rows[0].plate_number} was added to your account.`,
      payload: { type: 'vehicle', action: 'create', vehicle_id: rows[0].id },
    }).catch(() => {})

    return res.status(201).json({
      ...rows[0],
      warning: suspicious ? 'Plate flagged as suspicious — admin verification recommended.' : undefined,
    })
  }),
)

// ─── GET /vehicles/:id/detail ────────────────────────────────────────────────

router.get(
  '/vehicles/:id/detail',
  asyncHandler(async (req, res) => {
    const v = await db.query(
      `SELECT id, make, model, year, plate_number, conduction_sticker,
              vin_chassis, color, variant, odometer
       FROM vehicles
       WHERE id = $1 AND customer_id = ANY($2::int[])`,
      [req.params.id, req.customerIds || [req.customerId]],
    )
    if (!v.rows.length) return res.status(404).json({ message: 'Vehicle not found.' })

    const vehicle = v.rows[0]

    const [svcR, photosR] = await Promise.all([
      db.query(
        `SELECT vsr.id, vsr.service_date, vsr.service_description, vsr.odometer_reading,
                vsr.damage_notes, vsr.remarks, vsr.assigned_staff_name
         FROM vehicle_service_records vsr
         WHERE vsr.vehicle_id = $1
         ORDER BY vsr.service_date DESC`,
        [vehicle.id],
      ),
      db.query(
        `SELECT id, photo_type, tag, file_url, created_at
         FROM vehicle_photos
         WHERE vehicle_id = $1
         ORDER BY created_at DESC`,
        [vehicle.id],
      ),
    ])

    return res.json({
      ...vehicle,
      serviceRecords: svcR.rows,
      photos: photosR.rows,
    })
  }),
)

// ─── GET /services ───────────────────────────────────────────────────────────

router.get(
  '/services',
  asyncHandler(async (req, res) => {
    // 1. Fetch base services from DB
    const { rows: baseRows } = await db.query(
      `SELECT id, code, name, category, base_price, description, materials_notes
       FROM services
       WHERE COALESCE(is_active, TRUE) = TRUE`,
    )

    // 2. Fetch overrides & custom services from configuration
    const overrides = await ConfigurationService.get('quotations', 'service_name_overrides')
    let priceOverrides = await ConfigurationService.get('quotations', 'service_prices')
    const customSvcs = await ConfigurationService.get('quotations', 'custom_services')

    if (typeof priceOverrides === 'string') {
      try {
        priceOverrides = JSON.parse(priceOverrides)
      } catch {
        priceOverrides = null
      }
    }

    const priceMap = {}
    if (priceOverrides && typeof priceOverrides === 'object' && !Array.isArray(priceOverrides)) {
      Object.entries(priceOverrides).forEach(([k, v]) => {
        priceMap[normalizeServiceCode(k)] = v
      })
    }

    // 3. Map base services with overrides (match on normalized code)
    const ovMap = {}
    if (overrides && typeof overrides === 'object') {
      // Normalize all override keys to lowercase and stripped
      Object.keys(overrides).forEach((k) => {
        const normK = String(k || '').replace(/^CAT-/i, '').toLowerCase()
        ovMap[normK] = overrides[k]
      })
    }
    
    const expandedServices = []

    baseRows.forEach((s) => {
      const catCode = String(s.code || '').replace(/^CAT-/i, '').toLowerCase()
      const overName = ovMap[catCode] || ovMap[s.code]
      const resolvedName = overName || s.name
      const normalizedCategory = normalizeCategoryName(s.category)
      const code = normalizeServiceCode(s.code)
      const entry = priceMap?.[code]

      const baseRow = {
        ...s,
        category: normalizedCategory,
        ...(overName ? { name: overName } : {}),
      }

      const hasExplicitSizeInName = Boolean(extractSizeKeyFromServiceName(resolvedName))
      const variants = normalizedPriceVariants(entry)

      if (!hasExplicitSizeInName && variants.length > 0) {
        variants.forEach((v) => {
          expandedServices.push({
            ...baseRow,
            id: `${s.id}-${v.key}`,
            name: `${resolvedName} - ${v.label}`,
            base_price: v.amount,
          })
        })
        return
      }

      const overPrice = resolveServiceOverridePrice(priceMap, s.code, resolvedName)
      expandedServices.push({
        ...baseRow,
        ...(overPrice !== null ? { base_price: overPrice } : {}),
      })
    })

    let services = expandedServices

    // 4. Merge custom services (if active)
    if (Array.isArray(customSvcs)) {
      customSvcs.forEach((cs) => {
        if (cs.enabled !== false) {
          const rows = expandCustomServiceRows(cs).map((row) => ({
            ...row,
            category: normalizeCategoryName(row.category),
          }))
          services.push(...rows)
        }
      })
    }

    services = services.map((s) => {
      const overPrice = resolveServiceOverridePrice(priceMap, s.code, s.name)
      return overPrice !== null ? { ...s, base_price: overPrice } : s
    })

    // 5. Sort by category (ASC), then name (ASC)
    services.sort((a, b) => {
      const catA = String(a.category || '').toLowerCase()
      const catB = String(b.category || '').toLowerCase()
      if (catA < catB) return -1
      if (catA > catB) return 1
      const nameA = String(a.name || '').toLowerCase()
      const nameB = String(b.name || '').toLowerCase()
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return 0
    })

    return res.json(services)
  }),
)

// ─── GET /job-orders ────────────────────────────────────────────────────────

router.get(
  '/job-orders',
  asyncHandler(async (req, res) => {
    // Job orders (approved quotations converted to work orders)
    const joR = await db.query(
      `SELECT
         jo.id, jo.job_order_no   AS reference_no,
         jo.status                AS workflow_status,
         jo.created_at, jo.closed_at,
         'JobOrder'               AS doc_type,
         q.quotation_no,
         q.services               AS services_json,
         q.total_amount,
         q.status                 AS quotation_approval_status,
         (POSITION('[PORTAL BOOKING REQUEST]' IN COALESCE(q.notes, '')) > 0) AS is_portal_request,
         (POSITION('[PORTAL SUBSCRIPTION AVAIL REQUEST]' IN COALESCE(q.notes, '')) > 0) AS is_subscription_request,
         v.make, v.model, v.year, v.plate_number,
         a.status                 AS appointment_status,
         a.schedule_start, a.schedule_end, a.bay, a.installer_team
       FROM job_orders jo
       JOIN quotations  q ON q.id = jo.quotation_id
       JOIN vehicles    v ON v.id = jo.vehicle_id
       LEFT JOIN appointments a ON a.id = jo.schedule_id
       WHERE (jo.customer_id = ANY($1::int[]) OR v.customer_id = ANY($1::int[]))
         AND jo.status != 'Deleted'
       ORDER BY jo.created_at DESC`,
      [req.customerIds || [req.customerId]],
    )

    // ALL quotations for this customer (including ones converted to JOs)
    const qR = await db.query(
      `SELECT
         q.id,
         q.quotation_no           AS reference_no,
         q.status                 AS quotation_approval_status,
         q.created_at,
         q.notes,
         'Quotation'              AS doc_type,
         q.services               AS services_json,
         q.total_amount,
         (POSITION('[PORTAL BOOKING REQUEST]' IN COALESCE(q.notes, '')) > 0) AS is_portal_request,
         (POSITION('[PORTAL SUBSCRIPTION AVAIL REQUEST]' IN COALESCE(q.notes, '')) > 0) AS is_subscription_request,
         NULL::text               AS workflow_status,
         NULL::text               AS appointment_status,
         NULL::timestamp          AS schedule_start,
         NULL::timestamp          AS schedule_end,
         NULL::text               AS bay,
         NULL::text               AS installer_team,
         v.make, v.model, v.year, v.plate_number,
         jo2.job_order_no         AS linked_job_order_no
       FROM quotations q
       JOIN vehicles v ON v.id = q.vehicle_id
       LEFT JOIN LATERAL (
         SELECT jo3.job_order_no
         FROM job_orders jo3
         WHERE jo3.quotation_id = q.id AND jo3.status != 'Deleted'
         ORDER BY jo3.created_at ASC
         LIMIT 1
       ) jo2 ON true
       WHERE (q.customer_id = ANY($1::int[]) OR v.customer_id = ANY($1::int[]))
         AND q.status NOT IN ('Cancelled')
       ORDER BY q.created_at DESC`,
      [req.customerIds || [req.customerId]],
    )

    // Normalize JSONB services → items [{name, code, group, price, qty}]
    const normalize = (rows) =>
      rows.map((r) => {
        const svcs = Array.isArray(r.services_json) ? r.services_json : []
        const items = svcs.map((s) => ({
          name:  s.name || s.service_name || '—',
          code:  s.code || null,
          group: s.group || s.category || null,
          price: Number(s.unitPrice || s.unit_price || s.price || s.total || 0),
          qty:   Number(s.qty || 1),
        }))
        const service_package = svcs.map((s) => s.name).filter(Boolean).join(', ') || '—'
        const { services_json, ...rest } = r
        return { ...rest, items, service_package }
      })

    return res.json([...normalize(joR.rows), ...normalize(qR.rows)])
  }),
)

// ─── GET /payments ───────────────────────────────────────────────────────────

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const customerIds = req.customerIds || [req.customerId]

    try {
      const r = await db.query(
        `SELECT p.id, p.amount, p.payment_type, p.reference_no,
                p.is_deposit, p.created_at,
                COALESCE(q.quotation_no, s.reference_no)   AS sale_reference_no,
                CASE
                  WHEN p.quotation_id IS NOT NULL THEN
                    (SELECT string_agg(svc->>'name', ', ')
                     FROM jsonb_array_elements(q.services) AS svc)
                  ELSE s.service_package
                END                                        AS service_package,
                COALESCE(q.total_amount, s.total_amount)   AS total_amount,
                v.make, v.model, v.plate_number,
                COALESCE(
                  qps.total_paid,
                  (SELECT COALESCE(SUM(p2.amount),0) FROM payments p2 WHERE p2.sale_id = p.sale_id)
                ) AS paid_total
         FROM payments p
         LEFT JOIN quotations q   ON q.id = p.quotation_id
         LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = p.quotation_id
         LEFT JOIN sales s        ON s.id = p.sale_id
         JOIN  vehicles v         ON v.id = COALESCE(q.vehicle_id, s.vehicle_id)
         WHERE (COALESCE(q.customer_id, s.customer_id) = ANY($1::int[]) OR v.customer_id = ANY($1::int[]))
         ORDER BY p.created_at DESC`,
        [customerIds],
      )
      return res.json(r.rows)
    } catch (e) {
      const msg = String(e && e.message ? e.message : '')
      const isMissingView = e && e.code === '42P01' && msg.includes('quotation_payment_summary')
      if (!isMissingView) throw e

      const r = await db.query(
        `SELECT p.id, p.amount, p.payment_type, p.reference_no,
                p.is_deposit, p.created_at,
                COALESCE(q.quotation_no, s.reference_no)   AS sale_reference_no,
                CASE
                  WHEN p.quotation_id IS NOT NULL THEN
                    (SELECT string_agg(svc->>'name', ', ')
                     FROM jsonb_array_elements(q.services) AS svc)
                  ELSE s.service_package
                END                                        AS service_package,
                COALESCE(q.total_amount, s.total_amount)   AS total_amount,
                v.make, v.model, v.plate_number,
                CASE
                  WHEN p.quotation_id IS NOT NULL THEN
                    (SELECT COALESCE(SUM(p3.amount),0) FROM payments p3 WHERE p3.quotation_id = p.quotation_id)
                  ELSE
                    (SELECT COALESCE(SUM(p2.amount),0) FROM payments p2 WHERE p2.sale_id = p.sale_id)
                END AS paid_total
         FROM payments p
         LEFT JOIN quotations q   ON q.id = p.quotation_id
         LEFT JOIN sales s        ON s.id = p.sale_id
         JOIN  vehicles v         ON v.id = COALESCE(q.vehicle_id, s.vehicle_id)
         WHERE (COALESCE(q.customer_id, s.customer_id) = ANY($1::int[]) OR v.customer_id = ANY($1::int[]))
         ORDER BY p.created_at DESC`,
        [customerIds],
      )
      return res.json(r.rows)
    }
  }),
)

// ─── GET /service-history ────────────────────────────────────────────────────

router.get(
  '/service-history',
  asyncHandler(async (req, res) => {
    let r
    try {
      r = await db.query(
        `SELECT
           jo.id,
           jo.job_order_no              AS reference_no,
           'Job Order'                  AS doc_type,
           jo.status                    AS workflow_status,
           jo.created_at                AS service_date,
           jo.created_at,
           q.quotation_no,
           q.coating_process,
           q.total_amount,
           q.services                   AS services_json,
           v.id                         AS vehicle_id,
           v.make, v.model, v.plate_number, v.year
         FROM job_orders jo
         JOIN quotations q ON q.id = jo.quotation_id
         JOIN vehicles   v ON v.id = jo.vehicle_id
         WHERE jo.customer_id = $1
           AND jo.status != 'Deleted'
         ORDER BY jo.created_at DESC`,
        [req.customerId],
      )
    } catch (e) {
      const msg = String(e && e.message ? e.message : '')
      const isMissing = e && e.code === '42703' && msg.includes('coating_process')
      if (!isMissing) throw e
      r = await db.query(
        `SELECT
           jo.id,
           jo.job_order_no              AS reference_no,
           'Job Order'                  AS doc_type,
           jo.status                    AS workflow_status,
           jo.created_at                AS service_date,
           jo.created_at,
           q.quotation_no,
           NULL                         AS coating_process,
           q.total_amount,
           q.services                   AS services_json,
           v.id                         AS vehicle_id,
           v.make, v.model, v.plate_number, v.year
         FROM job_orders jo
         JOIN quotations q ON q.id = jo.quotation_id
         JOIN vehicles   v ON v.id = jo.vehicle_id
         WHERE jo.customer_id = $1
           AND jo.status != 'Deleted'
         ORDER BY jo.created_at DESC`,
        [req.customerId],
      )
    }

    const allServicesFlat = r.rows.flatMap((row) => (Array.isArray(row.services_json) ? row.services_json : []))
    const allCodes = Array.from(
      new Set(
        allServicesFlat
          .map((svc) => (svc && typeof svc === 'object' ? svc.code : null))
          .filter(Boolean),
      ),
    )
    const allNames = Array.from(
      new Set(
        allServicesFlat
          .map((svc) => (svc && typeof svc === 'object' ? svc.name : null))
          .filter(Boolean)
          .map((name) => String(name).trim().toLowerCase())
          .filter(Boolean),
      ),
    )

    const materialsNotesByCode = new Map()
    const materialsNotesByName = new Map()
    if (allCodes.length > 0) {
      const svcRes = await db.query(
        `SELECT code, materials_notes
         FROM services
         WHERE code = ANY($1::text[])`,
        [allCodes],
      )
      for (const row of svcRes.rows) {
        materialsNotesByCode.set(row.code, row.materials_notes || null)
      }
    }

    if (allNames.length > 0) {
      const svcRes = await db.query(
        `SELECT name, materials_notes
         FROM services
         WHERE lower(name) = ANY($1::text[])`,
        [allNames],
      )
      for (const row of svcRes.rows) {
        const key = String(row.name || '').trim().toLowerCase()
        if (!key) continue
        if (!materialsNotesByName.has(key)) {
          materialsNotesByName.set(key, row.materials_notes || null)
        }
      }
    }

    const records = r.rows.map((row) => {
      const svcs = Array.isArray(row.services_json) ? row.services_json : []
      const service_description = svcs.map((s) => s.name).filter(Boolean).join(', ') || 'Service'
      const items = svcs.map((s) => ({
        name: s.name || '—',
        code: s.code || null,
        group: s.group || s.category || null,
        price: Number(s.unitPrice || s.total || 0),
        qty: Number(s.qty || 1),
        materials_notes:
          (s.materials_notes ?? s.materialsNotes ?? null) ||
          (s.code ? (materialsNotesByCode.get(s.code) || null) : null) ||
          (s.name ? (materialsNotesByName.get(String(s.name).trim().toLowerCase()) || null) : null),
      }))

      const materials_notes = Array.from(
        new Set(
          items
            .map((it) => (it && it.materials_notes ? String(it.materials_notes).trim() : ''))
            .filter(Boolean),
        ),
      ).join('\n') || null

      const { services_json, ...rest } = row
      return { ...rest, service_description, items, materials_notes }
    })
    return res.json(records)
  }),
)

// ─── GET /warranty ───────────────────────────────────────────────────────────

router.get(
  '/warranty',
  asyncHandler(async (req, res) => {
    const r = await db.query(
      `SELECT
         jo.id,
         jo.job_order_no              AS reference_no,
         jo.status                    AS workflow_status,
         jo.created_at                AS service_date,
         jo.created_at + INTERVAL '1 year' AS warranty_expiry,
         CASE WHEN jo.created_at + INTERVAL '1 year' > NOW()
              THEN 'Active' ELSE 'Expired' END AS warranty_status,
         GREATEST(0, EXTRACT(DAY FROM (jo.created_at + INTERVAL '1 year' - NOW())))::INT AS days_remaining,
         q.total_amount,
         q.services                   AS services_json,
         v.make, v.model, v.plate_number, v.year, v.color
       FROM job_orders jo
       JOIN quotations q ON q.id = jo.quotation_id
       JOIN vehicles   v ON v.id = jo.vehicle_id
       WHERE jo.customer_id = $1
         AND jo.status != 'Deleted'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(q.services) AS svc
           WHERE LOWER(svc->>'name') LIKE ANY(ARRAY[
             '%ceramic%','%graphene%','%ppf%','%paint protection%','%tint%'
           ])
         )
       ORDER BY jo.created_at DESC`,
      [req.customerId],
    )

    const records = r.rows.map((row) => {
      const svcs = Array.isArray(row.services_json) ? row.services_json : []
      const service_description = svcs.map((s) => s.name).filter(Boolean).join(', ') || 'Service'
      const { services_json, ...rest } = row
      return { ...rest, service_description }
    })
    return res.json(records)
  }),
)

// ────── Subscriptions & PMS Routes ──────────────────────────────────────────

const portalSubscriptionsRoutes = require('./portalSubscriptions')
const portalPMSRoutes = require('./portalPMS')

router.use('/subscriptions', portalSubscriptionsRoutes)
router.use('/pms', portalPMSRoutes)

module.exports = router
