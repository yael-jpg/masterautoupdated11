const express = require('express')
const path = require('path')
const fs = require('fs')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')

// Pre-load logo buffer for CID inline attachment (works in Gmail, Outlook, etc.)
let LOGO_BUFFER = null
try {
  const logoPath = path.join(__dirname, '../../public/images/logo.png')
  LOGO_BUFFER = fs.readFileSync(logoPath)
} catch (_) {
  // logo file not found — will fall back to text
}

const router = express.Router()

// ── Helper: check promo code validity ───────────────────────────────────────

const getPromoCodeRow = async (code) => {
  const { rows } = await db.query(
    'SELECT * FROM promo_codes WHERE UPPER(code) = UPPER($1)',
    [code],
  )
  return rows[0] || null
}

// ── GET /promo-codes ─────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page  = Math.max(Number(req.query.page  || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200)
    const offset = (page - 1) * limit

    const { rows } = await db.query(
      `SELECT pc.*,
              ec.name AS campaign_name,
              u.full_name AS created_by_name
       FROM promo_codes pc
       LEFT JOIN email_campaigns ec ON ec.id = pc.campaign_id
       LEFT JOIN users u ON u.id = pc.created_by
       ORDER BY pc.id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    const { rows: countRows } = await db.query('SELECT COUNT(*)::int AS total FROM promo_codes')
    res.json({ data: rows, pagination: { page, limit, total: countRows[0].total } })
  }),
)

// ── GET /promo-codes/validate/:code ──────────────────────────────────────────
// Public-ish: used by quotation form to check if a code is valid and get discount

router.get(
  '/validate/:code',
  asyncHandler(async (req, res) => {
    const row = await getPromoCodeRow(req.params.code)

    if (!row) {
      return res.status(404).json({ valid: false, message: 'Promo code not found.' })
    }
    if (!row.is_active) {
      return res.status(400).json({ valid: false, message: 'This promo code is no longer active.' })
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, message: 'This promo code has expired.' })
    }
    if (row.max_uses !== null && row.uses_count >= row.max_uses) {
      return res.status(400).json({ valid: false, message: 'This promo code has reached its maximum uses.' })
    }

    res.json({
      valid: true,
      id: row.id,
      code: row.code,
      description: row.description,
      discount_type: row.discount_type,
      discount_value: Number(row.discount_value),
    })
  }),
)

// ── POST /promo-codes ────────────────────────────────────────────────────────

router.post(
  '/',
  [
    body('code').trim().notEmpty().withMessage('Code is required').isLength({ max: 50 }).withMessage('Code max 50 chars'),
    body('discount_type').isIn(['percent', 'fixed']).withMessage('discount_type must be percent or fixed'),
    body('discount_value').isFloat({ min: 0 }).withMessage('discount_value must be >= 0'),
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const {
      code,
      description,
      campaign_id,
      discount_type,
      discount_value,
      expires_at,
      max_uses,
    } = req.body

    const { rows } = await db.query(
      `INSERT INTO promo_codes
         (code, description, campaign_id, discount_type, discount_value, expires_at, max_uses, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        code.toUpperCase().trim(),
        description || null,
        campaign_id || null,
        discount_type,
        discount_value,
        expires_at || null,
        max_uses || null,
        req.user?.id || null,
      ],
    )

    await writeAuditLog({ userId: req.user?.id, action: 'CREATE', entity: 'promo_codes', entityId: rows[0].id, meta: { code: rows[0].code } })
    res.status(201).json(rows[0])
  }),
)

// ── PATCH /promo-codes/:id ───────────────────────────────────────────────────

router.patch(
  '/:id',
  param('id').isInt({ min: 1 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { description, campaign_id, discount_type, discount_value, expires_at, max_uses, is_active } = req.body

    const { rows: existing } = await db.query('SELECT * FROM promo_codes WHERE id = $1', [req.params.id])
    if (!existing.length) return res.status(404).json({ message: 'Promo code not found' })

    const cur = existing[0]
    const { rows } = await db.query(
      `UPDATE promo_codes
       SET description    = $1,
           campaign_id    = $2,
           discount_type  = $3,
           discount_value = $4,
           expires_at     = $5,
           max_uses       = $6,
           is_active      = $7,
           updated_at     = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        description    !== undefined ? description    : cur.description,
        campaign_id    !== undefined ? campaign_id    : cur.campaign_id,
        discount_type  !== undefined ? discount_type  : cur.discount_type,
        discount_value !== undefined ? discount_value : cur.discount_value,
        expires_at     !== undefined ? expires_at     : cur.expires_at,
        max_uses       !== undefined ? max_uses       : cur.max_uses,
        is_active      !== undefined ? is_active      : cur.is_active,
        req.params.id,
      ],
    )

    await writeAuditLog({ userId: req.user?.id, action: 'UPDATE', entity: 'promo_codes', entityId: rows[0].id, meta: { code: rows[0].code } })
    res.json(rows[0])
  }),
)

// ── DELETE /promo-codes/:id ──────────────────────────────────────────────────

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT id, code FROM promo_codes WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Promo code not found' })

    await db.query('DELETE FROM promo_codes WHERE id = $1', [req.params.id])
    await writeAuditLog({ userId: req.user?.id, action: 'DELETE', entity: 'promo_codes', entityId: rows[0].id, meta: { code: rows[0].code } })
    res.status(204).send()
  }),
)

// ── POST /promo-codes/:id/blast ──────────────────────────────────────────────
// Send a promotional email to all customers (or a specific list) using this promo code.
// Body: { subject?, message?, customerIds? }

router.post(
  '/:id/blast',
  param('id').isInt({ min: 1 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { rows: promoRows } = await db.query('SELECT * FROM promo_codes WHERE id = $1', [req.params.id])
    if (!promoRows.length) return res.status(404).json({ message: 'Promo code not found' })
    const promo = promoRows[0]

    if (!promo.is_active) return res.status(400).json({ message: 'Promo code is not active' })

    // Resolve recipients: use provided customerIds or fall back to all customers with email
    let customers
    if (Array.isArray(req.body.customerIds) && req.body.customerIds.length > 0) {
      const ids = req.body.customerIds.map(Number).filter(Boolean)
      const { rows } = await db.query(
        `SELECT id, full_name, email FROM customers WHERE id = ANY($1::int[]) AND email IS NOT NULL AND email <> ''`,
        [ids],
      )
      customers = rows
    } else {
      const { rows } = await db.query(
        `SELECT id, full_name, email FROM customers WHERE email IS NOT NULL AND email <> '' ORDER BY id`,
      )
      customers = rows
    }

    if (!customers.length) return res.status(422).json({ message: 'No customers with email addresses found' })

    const mailer = require('../services/mailer')
    const env    = require('../config/env')

    const ADDRESS = 'Unit 206, PMHA Building, V.Luna, Corner East Ave, Quezon City, 1100 Metro Manila'
    const SERVICES = [
      'Oil Change &amp; Engine Check',
      'Brake Inspection &amp; Repair',
      'Tire Rotation &amp; Alignment',
      'Battery &amp; Electrical Check',
      'General Vehicle Maintenance',
    ]

    const discountLabel =
      promo.discount_type === 'percent'
        ? `${Number(promo.discount_value)}% off`
        : `₱${Number(promo.discount_value).toLocaleString('en-PH')} off`

    const expiryLine = promo.expires_at
      ? new Date(promo.expires_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
      : ''

    const subject     = req.body.subject?.trim() || `🎉 Special Promo from Master Auto — ${discountLabel} on All Services!`
    const logoUrl     = req.body.logoUrl || ''
    const portalUrl   = logoUrl ? logoUrl.replace(/\/images\/logo\.png$/, '/portal') : '/portal'
    const customMessage = req.body.message?.trim() || ''

    const results = { sent: 0, failed: 0, skipped: 0, total: customers.length }

    for (const c of customers) {
      const name = c.full_name || 'Valued Client'
      const bodyHtml = (customMessage || `Keep your vehicle running smoothly with professional care from Master Auto. For a limited time, enjoy ${discountLabel} on selected maintenance and repair services.`)
        .replace(/\{\{customer_name\}\}/gi, name)

      const serviceRows = SERVICES.map((s) => `
        <tr>
          <td style="padding:5px 0;font-size:13px;color:#374151;">
            <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#22c55e;color:#fff;text-align:center;line-height:20px;font-size:11px;font-weight:900;margin-right:8px;vertical-align:middle;">✓</span>${s}
          </td>
        </tr>`).join('')

      const whyRows = [
        ['Experienced technicians', 'Quality parts and service'],
        ['Fast and reliable diagnostics', 'Customer-focused service'],
      ].map(([a, b]) => `
        <tr>
          <td style="padding:5px 8px;font-size:13px;color:#1e3a8a;width:50%;">★&nbsp;${a}</td>
          <td style="padding:5px 8px;font-size:13px;color:#1e3a8a;width:50%;">★&nbsp;${b}</td>
        </tr>`).join('')

      const logoTag = LOGO_BUFFER
        ? `<img src="cid:masterauto_logo" alt="Master Auto" style="height:54px;margin-bottom:8px;object-fit:contain;" /><br />`
        : `<span style="color:#ffffff;font-size:26px;font-weight:900;letter-spacing:0.5px;">Master Auto</span><br />`

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Master Auto Promo</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;">
  <tr><td align="center" style="padding:30px 12px;">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10);max-width:580px;">

      <!-- ── HEADER ── -->
      <tr>
        <td align="center" style="background:linear-gradient(135deg,#1a3a6b 0%,#2563eb 100%);padding:28px 24px 22px;">
          ${logoTag}
          <div style="color:#bfdbfe;font-size:13px;margin-top:2px;">Your Trusted Auto Service Partner</div>
        </td>
      </tr>

      <!-- ── PROMO BANNER ── -->
      <tr>
        <td align="center" style="background:#fefce8;padding:22px 24px 16px;border-bottom:3px dashed #fbbf24;">
          <div style="display:inline-block;background:#1d4ed8;color:#ffffff;font-size:20px;font-weight:900;padding:8px 24px;border-radius:6px;letter-spacing:1px;">
            ${discountLabel.toUpperCase()} AUTO SERVICES
          </div>
          <div style="color:#92400e;font-size:14px;font-weight:700;margin-top:8px;">Limited-Time Discount on Selected Services</div>
        </td>
      </tr>

      <!-- ── BODY ── -->
      <tr>
        <td style="padding:24px 32px 20px;">
          <p style="margin:0 0 14px;font-size:14px;color:#1e293b;">Hi <strong>${name}</strong>,</p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">${bodyHtml}</p>

          <p style="margin:0 0 10px;font-size:14px;color:#374151;font-weight:600;">Our certified technicians are ready to help with:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            ${serviceRows}
          </table>

          <!-- Promo code box -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="background:#eff6ff;border:2px dashed #2563eb;border-radius:10px;padding:18px 20px;">
                <div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:1px;">Your Promo Code</div>
                <div style="font-size:30px;font-weight:900;color:#1d4ed8;letter-spacing:5px;margin:8px 0;font-family:Courier New,monospace;">${promo.code}</div>
                ${promo.description ? `<div style="font-size:13px;color:#475569;margin-bottom:4px;">${promo.description}</div>` : ''}
                ${expiryLine ? `<div style="font-size:12px;color:#64748b;">Valid until <strong>${expiryLine}</strong></div>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- ── BOOK CTA ── -->
      <tr>
        <td align="center" style="background:#fefce8;padding:20px 28px;border-top:1px solid #fef08a;">
          <div style="font-size:17px;font-weight:800;color:#1e293b;margin-bottom:8px;">📅 Book Your Service Today</div>
          <p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.6;">
            Schedule your visit and let our experts take care of your vehicle.<br>
            Our team ensures quality service, reliable diagnostics, and trusted repairs.
          </p>
          ${expiryLine ? `<p style="margin:0;font-size:13px;color:#374151;">Offer valid <strong>until ${expiryLine}</strong>.</p>` : ''}
          <div style="margin-top:14px;">
            <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#1a3a6b,#2563eb);color:#ffffff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.03em;">🔑 Access My Portal</a>
            <div style="font-size:12px;color:#64748b;margin-top:6px;">Register or sign in to book your appointment online.</div>
          </div>
        </td>
      </tr>

      <!-- ── WHY CHOOSE ── -->
      <tr>
        <td style="background:#eff6ff;padding:20px 28px;">
          <div style="font-size:15px;font-weight:800;text-align:center;color:#1e3a8a;margin-bottom:12px;">📍 Why Choose Master Auto?</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${whyRows}
          </table>
        </td>
      </tr>

      <!-- ── LOCATION ── -->
      <tr>
        <td align="center" style="background:#ffffff;padding:20px 28px;">
          <div style="font-size:15px;font-weight:800;color:#b91c1c;margin-bottom:8px;">📍 Visit or Book an Appointment</div>
          <p style="margin:0 0 10px;font-size:13px;color:#475569;">Stop by our service center or contact us to schedule your vehicle service today.</p>
          <div style="font-weight:700;font-size:14px;color:#1e293b;">Master Auto Service Center</div>
          <div style="font-size:13px;color:#475569;margin-top:4px;">${ADDRESS}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">Your trusted partner for safe and reliable driving.</div>
        </td>
      </tr>

      <!-- ── FOOTER ── -->
      <tr>
        <td style="background:#f1f5f9;padding:16px 28px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;text-align:center;">
            You are receiving this email because you are a valued Master Auto customer.<br>
            If you have questions or would like to schedule a service, please contact us.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

      const text = [
        `Hi ${name},`,
        '',
        bodyHtml.replace(/<[^>]+>/g, ''),
        '',
        `PROMO CODE: ${promo.code}`,
        promo.description || '',
        expiryLine ? `Valid until: ${expiryLine}` : '',
        '',
        'Services: Oil Change, Brake Inspection, Tire Rotation, Battery Check, General Maintenance',
        '',
        'Book Your Service Today!',
        `Location: ${ADDRESS}`,
        '',
        'Thank you,\nMaster Auto Service Center',
      ].filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n')

      try {
        const sendRes = await mailer.sendRawEmail({
          to:      c.email,
          subject,
          html,
          text,
          from:    `Master Auto <${env.smtpUser || env.smtpFrom}>`,
          attachments: LOGO_BUFFER ? [{
            filename: 'logo.png',
            content:  LOGO_BUFFER,
            cid:      'masterauto_logo',
          }] : undefined,
        })
        if (sendRes?.skipped) {
          results.skipped++
        } else {
          results.sent++
        }
      } catch (err) {
        results.failed++
        console.error(`[PromoBlast] Failed to send to ${c.email}:`, err.message)
      }
    }

    await writeAuditLog({
      userId: req.user?.id,
      action: 'PROMO_EMAIL_BLAST',
      entity: 'promo_codes',
      entityId: promo.id,
      meta:   { code: promo.code, subject, ...results },
    })

    res.json({
      message: `Promo email blast complete: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`,
      ...results,
    })
  }),
)

module.exports = router
