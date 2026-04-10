const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')

const { uploadEmail } = require('../middleware/upload')

const router = express.Router()

let emailCampaignSchemaReady = false

async function ensureEmailCampaignSchemaCompat() {
  if (emailCampaignSchemaReady) return

  const { rows } = await db.query("SELECT to_regclass('public.email_campaigns') AS reg")
  if (!rows?.[0]?.reg) return

  await db.query('ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS banner_image_url TEXT')
  emailCampaignSchemaReady = true
}

router.use(
  asyncHandler(async (_req, _res, next) => {
    await ensureEmailCampaignSchemaCompat()
    next()
  }),
)

const VEHICLE_LABEL_SQL = `
  SELECT NULLIF(TRIM(CONCAT_WS(' ',
    COALESCE(NULLIF(vm.name, ''), NULLIF(to_jsonb(v) ->> 'make', ''), NULLIF(to_jsonb(v) ->> 'custom_make', '')),
    COALESCE(NULLIF(vmod.name, ''), NULLIF(to_jsonb(v) ->> 'model', ''), NULLIF(to_jsonb(v) ->> 'custom_model', ''))
  )), '')
  FROM vehicles v
  LEFT JOIN vehicle_makes vm ON vm.id = NULLIF(to_jsonb(v) ->> 'make_id', '')::int
  LEFT JOIN vehicle_models vmod ON vmod.id = NULLIF(to_jsonb(v) ->> 'model_id', '')::int
  WHERE v.customer_id = c.id
  ORDER BY v.id DESC
  LIMIT 1
`

// List campaigns with basic pagination
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200)
    const offset = (page - 1) * limit

    const { rows } = await db.query(
      `SELECT id, name, subject, status, scheduled_at, banner_image_url, created_at, updated_at
       FROM email_campaigns
       ORDER BY id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    const count = await db.query('SELECT COUNT(*)::int AS total FROM email_campaigns')

    res.json({ data: rows, pagination: { page, limit, total: count.rows[0].total } })
  }),
)

router.get(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid campaign id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rows } = await db.query('SELECT * FROM email_campaigns WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ message: 'Campaign not found' })
    const assets = await db.query('SELECT * FROM campaign_assets WHERE campaign_id = $1', [id])
    const audiences = await db.query('SELECT * FROM campaign_audiences WHERE campaign_id = $1', [id])
    res.json({ ...rows[0], assets: assets.rows, audiences: audiences.rows })
  }),
)

// Create campaign
router.post(
  '/',
  body('name').isString().notEmpty(),
  body('subject').isString().notEmpty().withMessage('Subject is required'),
  body('content').isString().notEmpty().withMessage('Email content is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const payload = req.body

    const { rows } = await db.query(
      `INSERT INTO email_campaigns (
        name, subject, preview_text, sender_name, sender_email, status, scheduled_at,
        content, content_plain, cta_label, cta_url, cta_color, cta_alignment, show_promo_code,
        auto_unsubscribe, include_company_address, throttle_batch_size, throttle_delay_ms, created_by,
        banner_image_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, $20)
      RETURNING *`,
      [
        payload.name,
        payload.subject,
        payload.preview_text || null,
        payload.sender_name || 'MasterAuto',
        payload.sender_email || 'noreply@example.com',
        payload.status || 'Draft',
        payload.scheduled_at || null,
        payload.content || null,
        payload.content_plain || null,
        payload.cta_label || 'ENROLL NOW',
        payload.cta_url || null,
        payload.cta_color || '#1a56db',
        payload.cta_alignment || 'center',
        !!payload.show_promo_code,
        payload.auto_unsubscribe !== undefined ? !!payload.auto_unsubscribe : true,
        payload.include_company_address !== undefined ? !!payload.include_company_address : true,
        Number(payload.throttle_batch_size || 100),
        Number(payload.throttle_delay_ms || 1000),
        req.user?.id || null,
        payload.banner_image_url || null,
      ],
    )

    await writeAuditLog({ userId: req.user?.id, action: 'CREATE_CAMPAIGN', entity: 'email_campaigns', entityId: rows[0].id })
    res.status(201).json(rows[0])
  }),
)

// Update campaign
router.patch(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid campaign id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const payload = req.body

    // Basic server-side validation rules
    if (payload.status && payload.status === 'Active') {
      if (!payload.subject) return res.status(400).json({ message: 'Subject is required to activate' })
      if (!payload.content) return res.status(400).json({ message: 'Email content is required to activate' })
      if (!payload.cta_label || !payload.cta_url) return res.status(400).json({ message: 'CTA label and URL are required to activate' })
    }

    if (payload.scheduled_at && new Date(payload.scheduled_at) < new Date()) {
      return res.status(400).json({ message: 'Schedule date cannot be in the past' })
    }

    // Build dynamic SET clause
    const keys = Object.keys(payload)
    if (!keys.length) return res.status(400).json({ message: 'No fields to update' })

    const sets = keys.map((k, i) => `${k} = $${i + 1}`)
    const values = keys.map((k) => payload[k])
    values.push(id)

    const { rows } = await db.query(`UPDATE email_campaigns SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)
    if (!rows.length) return res.status(404).json({ message: 'Campaign not found' })

    await writeAuditLog({ userId: req.user?.id, action: 'UPDATE_CAMPAIGN', entity: 'email_campaigns', entityId: Number(id) })
    res.json(rows[0])
  }),
)

// Delete campaign
router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid campaign id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rowCount } = await db.query('DELETE FROM email_campaigns WHERE id = $1', [id])
    if (!rowCount) return res.status(404).json({ message: 'Campaign not found' })
    await writeAuditLog({ userId: req.user?.id, action: 'DELETE_CAMPAIGN', entity: 'email_campaigns', entityId: Number(id) })
    res.status(204).send()
  }),
)

// Activate campaign — resolve recipients and send emails
router.post(
  '/:id/activate',
  param('id').isInt({ min: 1 }).withMessage('Invalid campaign id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rows } = await db.query('SELECT * FROM email_campaigns WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ message: 'Campaign not found' })
    const campaign = rows[0]

    if (!campaign.subject || !campaign.content) return res.status(400).json({ message: 'Subject and content required' })

    // Resolve queued recipients. If none exist, seed from all customers with an email.
    let recipients = (await db.query(
      `SELECT cr.id, cr.email, c.full_name AS customer_name,
              (${VEHICLE_LABEL_SQL}) AS vehicle_name
       FROM campaign_recipients cr
       LEFT JOIN customers c ON c.id = cr.customer_id
       WHERE cr.campaign_id = $1 AND cr.status = 'queued'`,
      [id],
    )).rows

    if (recipients.length === 0) {
      const { rows: allCustomers } = await db.query(
        `SELECT id, email FROM customers WHERE email IS NOT NULL AND email <> '' ORDER BY id`,
      )
      for (const c of allCustomers) {
        await db.query(
          `INSERT INTO campaign_recipients (campaign_id, customer_id, email, status, created_at)
           VALUES ($1, $2, $3, 'queued', NOW()) ON CONFLICT DO NOTHING`,
          [id, c.id, c.email],
        )
      }
      recipients = (await db.query(
        `SELECT cr.id, cr.email, c.full_name AS customer_name,
                (${VEHICLE_LABEL_SQL}) AS vehicle_name
         FROM campaign_recipients cr
         LEFT JOIN customers c ON c.id = cr.customer_id
         WHERE cr.campaign_id = $1 AND cr.status = 'queued'`,
        [id],
      )).rows
    }

    // Fetch promo code linked to this campaign (if any)
    const { rows: promoRows } = await db.query(
      `SELECT code FROM promo_codes
       WHERE campaign_id = $1 AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR uses_count < max_uses)
       LIMIT 1`,
      [id],
    )
    const linkedPromoCode = promoRows[0]?.code || ''

    const mailer = require('../services/mailer')
    const results = { sent: 0, failed: 0, skipped: 0, total: recipients.length }

    for (const r of recipients) {
      try {
        const customerName = r.customer_name || r.email
        const fromAddress = `${campaign.sender_name || 'MasterAuto'} <${campaign.sender_email || 'noreply@example.com'}>`
        
        const content = (campaign.content || '')
          .replace(/\{\{\s*customer_name\s*\}\}/gi, customerName)
          .replace(/\{\{\s*vehicle\s*\}\}/gi, r.vehicle_name || 'your vehicle')
          .replace(/\{\{\s*promo_code\s*\}\}/gi, linkedPromoCode)

        const sendRes = await mailer.sendCampaignEmail({
          to: r.email,
          subject: campaign.subject,
          content,
          ctaLabel: campaign.cta_label,
          ctaUrl: campaign.cta_url || '#',
          customerName: customerName,
          from: fromAddress,
          bannerImageUrl: campaign.banner_image_url
        })
        if (sendRes?.skipped) {
          results.skipped++
          await db.query(`UPDATE campaign_recipients SET status = 'skipped' WHERE id = $1`, [r.id])
        } else {
          results.sent++
          await db.query(`UPDATE campaign_recipients SET status = 'sent', sent_at = NOW() WHERE id = $1`, [r.id])
        }
      } catch (err) {
        results.failed++
        await db.query(
          `UPDATE campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2`,
          [String(err.message || err), r.id],
        )
      }
    }

    await db.query('UPDATE email_campaigns SET status = $1 WHERE id = $2', ['Active', id])
    await writeAuditLog({ userId: req.user?.id, action: 'ACTIVATE_CAMPAIGN', entity: 'email_campaigns', entityId: Number(id), meta: results })
    res.json({ message: `Campaign activated: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`, ...results })
  }),
)

// Preview send (send single test email) — placeholder
router.post(
  '/:id/preview',
  param('id').isInt({ min: 1 }).withMessage('Invalid campaign id'),
  body('to').isEmail().withMessage('Valid to email is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { to } = req.body
    const { rows } = await db.query('SELECT * FROM email_campaigns WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ message: 'Campaign not found' })

    // Use existing mailer to send a test email later — for now just log audit
    await writeAuditLog({ userId: req.user?.id, action: 'PREVIEW_CAMPAIGN', entity: 'email_campaigns', entityId: Number(id), meta: { to } })
    res.json({ message: 'Preview sent (placeholder)', to })
  }),
)

router.post(
  '/upload-banner',
  uploadEmail.single('banner'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }
    const fileUrl = `/uploads/campaigns/${req.file.filename}`
    res.json({ fileUrl })
  }),
)

// Estimate recipients based on audience filters
// POST /email-campaigns/estimate
router.post(
  '/estimate',
  asyncHandler(async (req, res) => {
    const filters = req.body || {}
    const params = []
    const where = []

    // Audience type
    const audience = String(filters.audience || 'ALL').toUpperCase()
    if (audience === 'FIRST_TIME') {
      // customers with no job orders yet
      where.push(`NOT EXISTS (SELECT 1 FROM job_orders jo WHERE jo.customer_id = c.id)`)
    } else if (audience === 'VIP') {
      // VIP by customer_type or by spend (min_spend)
      const vipParts = []
      vipParts.push("LOWER(c.customer_type) LIKE '%vip%'")
      if (filters.min_spend) {
        params.push(Number(filters.min_spend))
        vipParts.push(`(SELECT COALESCE(SUM(q.total_amount),0) FROM quotations q WHERE q.customer_id = c.id) >= $${params.length}`)
      }
      where.push(`(${vipParts.join(' OR ')})`)
    } else if (audience === 'INACTIVE') {
      // last transaction before given date
      const cutoffStr = filters.last_transaction_before || filters.cutoff_date
      if (cutoffStr) {
        const cutoff = new Date(cutoffStr)
        if (!isNaN(cutoff.getTime())) {
          params.push(cutoff.toISOString())
          where.push(`NOT EXISTS (SELECT 1 FROM quotations q WHERE q.customer_id = c.id AND q.created_at > $${params.length})`)
          where.push(`NOT EXISTS (SELECT 1 FROM job_orders jo WHERE jo.customer_id = c.id AND jo.created_at > $${params.length})`)
        }
      }
    } else if (audience === 'CUSTOM' && Array.isArray(filters.customer_ids) && filters.customer_ids.length) {
      const ids = filters.customer_ids.map((id) => Number(id)).filter(Boolean)
      if (ids.length === 0) return res.json({ count: 0 })
      const idxStart = params.length + 1
      ids.forEach((id) => params.push(id))
      where.push(`c.id IN (${ids.map((_, i) => `$${idxStart + i}`).join(',')})`)
    }

    // Vehicle type filter (match vehicles.make or make_id)
    if (filters.vehicle_type) {
      params.push(String(filters.vehicle_type))
      where.push(`EXISTS (SELECT 1 FROM vehicles v WHERE v.customer_id = c.id AND (v.make ILIKE $${params.length} OR CAST(v.make_id AS TEXT) = $${params.length}))`)
    }

    // Minimum spend filter
    if (filters.min_spend) {
      params.push(Number(filters.min_spend))
      where.push(`(SELECT COALESCE(SUM(q.total_amount),0) FROM quotations q WHERE q.customer_id = c.id) >= $${params.length}`)
    }

    // Registration date range
    if (filters.registered_from) {
      const from = new Date(filters.registered_from)
      if (!isNaN(from.getTime())) {
        params.push(from.toISOString())
        where.push(`c.created_at >= $${params.length}`)
      }
    }
    if (filters.registered_to) {
      const to = new Date(filters.registered_to)
      if (!isNaN(to.getTime())) {
        params.push(to.toISOString())
        where.push(`c.created_at <= $${params.length}`)
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `SELECT COUNT(DISTINCT c.id) AS count FROM customers c ${whereClause}`

    const { rows } = await db.query(sql, params)
    const count = rows[0] ? Number(rows[0].count) : 0

    res.json({ count, sql, params })
  }),
)

module.exports = router

