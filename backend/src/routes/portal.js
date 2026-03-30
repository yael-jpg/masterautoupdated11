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
const { sendPortalBookingRequestEmail, sendRawEmail } = require('../services/mailer')
const { buildQuotationRequestStaffEmail } = require('../services/emailTemplates')

const googleClient = new OAuth2Client(env.googleClientId)

const router = express.Router()

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
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
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

    const token = jwt.sign({ customerId }, env.jwtSecret, { expiresIn: '30d' })
    return res.json({
      token,
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
    const email = String(req.body.email || '').trim().toLowerCase()
    const mobile = String(req.body.mobile || '').trim()
    const password = String(req.body.password || '')

    // Reject if a portal account with this mobile already exists
    const dup = await db.query(
      'SELECT id FROM customers WHERE mobile = $1 AND portal_password_hash IS NOT NULL',
      [mobile],
    )
    if (dup.rows.length > 0) {
      return res
        .status(409)
        .json({ message: 'An account with this mobile already exists. Please log in.' })
    }

    // Reject if a portal account with this email already exists
    const dupEmail = await db.query(
      'SELECT id FROM customers WHERE email = $1 AND portal_password_hash IS NOT NULL',
      [email],
    )
    if (dupEmail.rows.length > 0) {
      return res
        .status(409)
        .json({ message: 'An account with this email already exists. Please log in.' })
    }

    const hash = await bcrypt.hash(password, 10)

    // If admin already created a customer record with this mobile, attach to it;
    // otherwise create a new customer record.
    const existing = await db.query('SELECT id FROM customers WHERE mobile = $1', [mobile])
    let customerId
    if (existing.rows.length > 0) {
      customerId = existing.rows[0].id
      await db.query(
        `UPDATE customers
         SET portal_password_hash = $1,
             full_name = $2,
             email = $3,
             lead_source = COALESCE(NULLIF(lead_source, ''), 'Portal')
         WHERE id = $4`,
        [hash, fullName, email, customerId],
      )
    } else {
      const ins = await db.query(
        `INSERT INTO customers (full_name, mobile, email, portal_password_hash, customer_type, lead_source, created_at)
         VALUES ($1, $2, $3, $4, 'Walk-in', 'Portal', NOW())
         RETURNING id`,
        [fullName, mobile, email, hash],
      )
      customerId = ins.rows[0].id
    }

    const hasCols = await ensurePortalEmailVerificationColumnsExist()
    if (!hasCols) {
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
      const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: '30d' })
      return res.json({
        token,
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

    const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: '30d' })
    return res.json({
      token,
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
  '/auth/login',
  body('identifier').trim().notEmpty().withMessage('Mobile or email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const identifier = String(req.body.identifier || '').trim()
    const password = String(req.body.password || '')

    const result = await db.query(
      `SELECT id, full_name, mobile, email, portal_password_hash, portal_email_verified_at
       FROM customers
       WHERE (mobile = $1 OR LOWER(email) = LOWER($1)) AND portal_password_hash IS NOT NULL`,
      [identifier],
    )
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

    // Require email verification for email-based accounts.
    if (!customer.portal_email_verified_at) {
      return res.status(403).json({
        message: 'Please verify your email address before logging in.',
        requiresEmailVerification: true,
        email: customer.email,
      })
    }

    const token = jwt.sign({ customerId: customer.id }, env.jwtSecret, { expiresIn: '30d' })
    return res.json({
      token,
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
      extraClause = ', portal_password_hash = $8'
      params.push(hash)
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
           AND jo.status NOT IN ('Completed','Closed','Cancelled','Deleted')`,
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

    // Portal booking should NOT immediately create a Scheduling appointment.
    // Instead, create a Quotation so it reflects in admin Quotations and portal.

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
    let resolvedService = null
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
      const finalBranch = requestedBranch || resolvedBay

      const quotationNo = await nextQuotationNo(client, getBranchCode(finalBranch))

      const scheduleLabel = dt(scheduleStart)
      const endLabel = dt(scheduleEnd)
      const dpAmt = Number(downPaymentAmount || 0)
      const dpMethod = downPaymentMethod ? String(downPaymentMethod) : null
      const dpRef = downPaymentRef ? String(downPaymentRef) : null
      const sizeKey = vehicleSize ? String(vehicleSize).trim() : null

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
      const finalNotes = noteParts.join('\n')

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
          await sendPortalBookingRequestEmail({
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
          }).catch(() => {})
        }

        // Admin/staff notification (email) for portal quotation requests
        try {
          const businessEmail = await ConfigurationService.get('business', 'business_email')
          if (businessEmail) {
            const staffTemplate = buildQuotationRequestStaffEmail({
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
            })

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

    return res.status(201).json({
      id: createdQuotation?.id,
      quotationNo: createdQuotation?.quotation_no,
      message: 'Booking request submitted. A quotation has been created for approval.',
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
    const r = await db.query(
      `SELECT id, make, model, year, plate_number, conduction_sticker,
              color, variant, odometer
       FROM vehicles
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [req.customerId],
    )
    return res.json(r.rows)
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
    const { rows } = await db.query(
      `SELECT id, name, fuel_type, transmission, is_active
       FROM vehicle_variants
       WHERE model_id = $1 AND is_active = TRUE
       ORDER BY name`,
      [modelId],
    )
    return res.json(rows)
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
       WHERE id = $1 AND customer_id = $2`,
      [req.params.id, req.customerId],
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
    const r = await db.query(
      `SELECT id, code, name, category, base_price, description, materials_notes
       FROM services
       WHERE is_active = TRUE
       ORDER BY category, name`,
    )
    return res.json(r.rows)
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
         v.make, v.model, v.year, v.plate_number,
         a.status                 AS appointment_status,
         a.schedule_start, a.schedule_end, a.bay, a.installer_team
       FROM job_orders jo
       JOIN quotations  q ON q.id = jo.quotation_id
       JOIN vehicles    v ON v.id = jo.vehicle_id
       LEFT JOIN appointments a ON a.id = jo.schedule_id
       WHERE (jo.customer_id = $1 OR v.customer_id = $1)
         AND jo.status != 'Deleted'
       ORDER BY jo.created_at DESC`,
      [req.customerId],
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
       WHERE (q.customer_id = $1 OR v.customer_id = $1)
         AND q.status NOT IN ('Cancelled')
       ORDER BY q.created_at DESC`,
      [req.customerId],
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
       WHERE (COALESCE(q.customer_id, s.customer_id) = $1 OR v.customer_id = $1)
       ORDER BY p.created_at DESC`,
      [req.customerId],
    )
    return res.json(r.rows)
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
          .map((n) => String(n).trim().toLowerCase())
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

module.exports = router
