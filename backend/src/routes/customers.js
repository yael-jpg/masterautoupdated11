const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')
const { requireRole } = require('../middleware/auth')
const { normalizeEmail, normalizeMobileDigits, normalizeMobileForStorage } = require('../utils/customerIdentity')
const logger = require('../utils/logger')

const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const { URL } = require('url')

const router = express.Router()

let emailCampaignSchemaReady = false

async function ensureEmailCampaignSchemaCompat() {
  if (emailCampaignSchemaReady) return

  const { rows } = await db.query("SELECT to_regclass('public.email_campaigns') AS reg")
  if (!rows?.[0]?.reg) return

  await db.query('ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS banner_image_url TEXT')
  emailCampaignSchemaReady = true
}

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

const CUSTOMER_LIST_CACHE_TTL_MS = 15000
const customerListCache = new Map()

function buildCustomerListCacheKey({ search, portalOnly, page, limit }) {
  return JSON.stringify({ search, portalOnly, page, limit })
}

function getCachedCustomerList(cacheKey) {
  const hit = customerListCache.get(cacheKey)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    customerListCache.delete(cacheKey)
    return null
  }
  return hit.payload
}

function setCachedCustomerList(cacheKey, payload) {
  customerListCache.set(cacheKey, {
    expiresAt: Date.now() + CUSTOMER_LIST_CACHE_TTL_MS,
    payload,
  })
}

function invalidateCustomerListCache() {
  customerListCache.clear()
}

function generateTemporaryPortalPassword() {
  // Avoid ambiguous characters (0/O, 1/I/l)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const length = 10
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}

function firstForwardedValue(value) {
  if (!value) return ''
  return String(value).split(',')[0].trim()
}

function deriveExternalBaseUrl(req) {
  const origin = firstForwardedValue(req.get('origin'))
  if (origin && origin !== 'null') {
    try {
      const u = new URL(origin)
      if (u.protocol && u.host) return `${u.protocol}//${u.host}`
    } catch (_e) {
      // ignore invalid origin
    }
  }

  const referer = firstForwardedValue(req.get('referer'))
  if (referer) {
    try {
      const u = new URL(referer)
      if (u.protocol && u.host) return `${u.protocol}//${u.host}`
    } catch (_e) {
      // ignore invalid referer
    }
  }

  const proto = firstForwardedValue(req.get('x-forwarded-proto')) || req.protocol || 'http'
  const host = firstForwardedValue(req.get('x-forwarded-host')) || firstForwardedValue(req.get('host'))
  if (!host) return ''
  return `${proto}://${host}`
}

function resolvePortalLoginUrl(req, configuredPortalUrl) {
  const configured = String(configuredPortalUrl || '').trim()
  if (configured) {
    try {
      const u = new URL(configured)
      if (!u.pathname || u.pathname === '/') u.pathname = '/portal/login'
      return u.toString().replace(/\/$/, '')
    } catch (_e) {
      return configured
    }
  }

  const baseUrl = deriveExternalBaseUrl(req)
  if (!baseUrl) return ''
  return `${baseUrl.replace(/\/$/, '')}/portal/login`
}

// Simple Email Blast endpoint (frontend expects this route when triggering an email blast)
router.post(
  '/email-blast',
  asyncHandler(async (req, res) => {
    const { customerIds } = req.body || {}
    if (!Array.isArray(customerIds) || !customerIds.length) {
      return res.status(400).json({ message: 'customerIds array is required' })
    }

    // Defensive: ensure email_campaigns table exists (Postgres)
    try {
      const { rows: reg } = await db.query("SELECT to_regclass('public.email_campaigns') AS reg")
      if (!reg || !reg[0] || !reg[0].reg) {
        return res.status(503).json({
          message: 'Email Blasting database schema not applied. Run migrations: node src/utils/runSql.js sql/migrations/032_email_blasting.sql && node src/utils/runSql.js sql/migrations/034_email_config_settings.sql && node src/utils/runSql.js sql/migrations/035_email_blasting_features.sql'
        })
      }
    } catch (err) {
      // If the DB doesn't support to_regclass (older PG), fall back to information_schema check
      try {
        const { rows: info } = await db.query("SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_campaigns'")
        if (!info || !info[0] || Number(info[0].cnt) === 0) {
          return res.status(503).json({
            message: 'Email Blasting database schema not applied. Run migrations: node src/utils/runSql.js sql/migrations/032_email_blasting.sql && node src/utils/runSql.js sql/migrations/034_email_config_settings.sql && node src/utils/runSql.js sql/migrations/035_email_blasting_features.sql'
          })
        }
      } catch (err2) {
        // If even the fallback check fails, return a generic message
        return res.status(503).json({ message: 'Email Blasting schema appears unavailable. Please apply migrations.' })
      }
    }

    await ensureEmailCampaignSchemaCompat()

    // Integration: create a lightweight campaign using configured defaults and queue recipients
    const ConfigurationService = require('../services/configurationService')

    // Load email defaults from configuration
    const defaultSenderName = await ConfigurationService.get('email', 'default_sender_name') || 'MasterAuto'
    const defaultSenderEmail = await ConfigurationService.get('email', 'default_sender_email') || 'noreply@masterauto.com'
    const defaultCtaLabel = await ConfigurationService.get('email', 'default_cta_label') || 'ENROLL NOW'
    const autoUnsubscribe = await ConfigurationService.get('email', 'auto_unsubscribe') ?? true
    const includeCompanyAddress = await ConfigurationService.get('email', 'include_company_address') ?? true
    const throttleBatchSize = Number(await ConfigurationService.get('email', 'throttle_batch_size') || 200)
    const throttleDelayMs = Number(await ConfigurationService.get('email', 'throttle_delay_ms') || 1000)

    // Build a simple campaign record
    const campaignName = `One-off Blast - ${new Date().toISOString()}`
    const campaignSubject = req.body.subject || `Message from ${defaultSenderName}`
    // Allow frontend to override sender name/email per-blast
    const blastSenderName  = req.body.sender_name  || defaultSenderName
    const blastSenderEmail = req.body.sender_email || defaultSenderEmail
    const blastCtaLabel = req.body.cta_label || defaultCtaLabel
    const blastCtaUrl   = req.body.cta_url || '#'

    // Merge promotion details into content if provided
    const rawContent = req.body.content || ''
    const bannerImageUrl = req.body.banner_image_url || null
    const promotion = req.body.promotion || null // expected: { name, discount_value, promo_code, expiry_date }

    function replacePlaceholders(text, promo) {
      const p = promo || {}
      return String(text || '')
        .replace(/\{\{\s*promotion_name\s*\}\}/gi, p.name || '')
        .replace(/\{\{\s*discount_value\s*\}\}/gi, p.discount_value || '')
        .replace(/\{\{\s*promo_code\s*\}\}/gi, p.promo_code || '')
        .replace(/\{\{\s*expiry_date\s*\}\}/gi, p.expiry_date || '')
    }

    function replaceRecipientFields(text, recipient) {
      const packageName = recipient?.package_name || 'Subscription'
      const subscriptionStatus = recipient?.subscription_status || 'Active'
      return String(text || '')
        .replace(/\{\{\s*package_name\s*\}\}/gi, packageName)
        .replace(/\{\{\s*status\s*\}\}/gi, subscriptionStatus)
        .replace(/\{\s*package_name\s*\}/gi, packageName)
        .replace(/\{\s*status\s*\}/gi, subscriptionStatus)
    }

    let campaignContent = replacePlaceholders(rawContent, promotion)
    // If a promotion was provided but the content doesn't mention it, append a promotional block
    if (promotion) {
      const lower = (campaignContent || '').toLowerCase()
      if (!lower.includes((promotion.name || '').toLowerCase()) && !lower.includes((promotion.promo_code || '').toLowerCase())) {
        const promoHtml = `\n\n<strong>Special Promo: ${promotion.name || ''}</strong><br/>Get ${promotion.discount_value || ''} off. Use code <strong>${promotion.promo_code || ''}</strong> ${promotion.expiry_date ? `(until ${promotion.expiry_date})` : ''}. <br/><br/>Click <a href=\"${blastCtaUrl}\">${blastCtaLabel}</a> to avail.`
        const promoText = `\n\nSPECIAL PROMO: ${promotion.name || ''}\nGet ${promotion.discount_value || ''} off. Use code ${promotion.promo_code || ''} ${promotion.expiry_date ? `(until ${promotion.expiry_date})` : ''}. ${blastCtaLabel}: ${blastCtaUrl}`
        // Append both HTML and text-friendly promo content
        campaignContent = `${campaignContent || ''}${promoHtml}`
        // Note: text version uses same `campaignContent` since we send same for html/text currently
      }
    }

    const { rows: campRows } = await db.query(
      `INSERT INTO email_campaigns (name, subject, sender_name, sender_email, status, content, banner_image_url, cta_label, cta_url, auto_unsubscribe, include_company_address, throttle_batch_size, throttle_delay_ms, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [campaignName, campaignSubject, blastSenderName, blastSenderEmail, 'Active', campaignContent, bannerImageUrl, blastCtaLabel, blastCtaUrl, !!autoUnsubscribe, !!includeCompanyAddress, throttleBatchSize, throttleDelayMs, req.user?.id || null],
    )

    const campaign = campRows[0]

    // Insert recipients for each customer (email must exist)
    const ids = customerIds.map((id) => Number(id)).filter(Boolean)
    if (ids.length) {
      const { rows: customers } = await db.query(`SELECT id, email FROM customers WHERE id = ANY($1::int[])`, [ids])

      const now = new Date().toISOString()
      const insertValues = []
      const placeholders = []
      let idx = 1
      for (const c of customers) {
        if (!c.email) continue
        insertValues.push(c.id, c.email, campaign.id, 'queued', null, null, null, null, now)
        placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8})`)
        idx += 9
      }

      if (placeholders.length) {
        const sql = `INSERT INTO campaign_recipients (customer_id, email, campaign_id, status, error_message, sent_at, delivered_at, created_at, created_at) VALUES ${placeholders.join(',')}`
        // Note: created_at column appears twice to match param count in placeholder; we'll instead use explicit columns properly below
        // Simpler approach: insert rows one by one to avoid complex placeholder building
        for (const c of customers) {
          if (!c.email) continue
          await db.query(`INSERT INTO campaign_recipients (campaign_id, customer_id, email, status, created_at) VALUES ($1,$2,$3,'queued', NOW())`, [campaign.id, c.id, c.email])
        }
      }
    }

    // If the frontend requested immediate sending (sendNow: true), attempt to send synchronously.
    if (req.body.sendNow) {
      const mailer = require('../services/mailer')
      const env = require('../config/env')
      const sentResults = { sent: 0, failed: 0, skipped: 0, firstError: null }
      const recipientRows = (await db.query(
        `SELECT cr.id, cr.email, c.full_name AS customer_name,
                (${VEHICLE_LABEL_SQL}) AS vehicle_name,
                COALESCE(ls.package_name, 'Subscription') AS package_name,
                COALESCE(ls.subscription_status, 'Active') AS subscription_status
         FROM campaign_recipients cr
         LEFT JOIN customers c ON c.id = cr.customer_id
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(sp.name, s.subscription_name, 'Subscription') AS package_name,
             COALESCE(s.status, 'Active') AS subscription_status
           FROM subscriptions s
           LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.package_id, s.subscription_service_id)
           WHERE s.customer_id = c.id
           ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
           LIMIT 1
         ) ls ON TRUE
         WHERE cr.campaign_id = $1`,
        [campaign.id],
      )).rows
      if (!recipientRows.length) {
        return res.json({ message: 'No recipients found — customers may not have email addresses set', queued: false, campaignId: campaign.id, results: sentResults })
      }
      for (const c of recipientRows) {
        if (!c.email) continue
        try {
          // Personalise per-recipient
          const personalName = c.customer_name || c.email
          const vehicleName = c.vehicle_name || 'your vehicle'
          let personalHtml = replacePlaceholders(campaignContent || '', promotion)
            .replace(/\{\{\s*customer_name\s*\}\}/gi, personalName)
            .replace(/\{\{\s*vehicle\s*\}\}/gi, vehicleName)
          personalHtml = replaceRecipientFields(personalHtml, c)

          const personalSubject = replaceRecipientFields(
            String(campaignSubject || '').replace(/\{\{\s*customer_name\s*\}\}/gi, personalName).replace(/\{\{\s*vehicle\s*\}\}/gi, vehicleName),
            c,
          )
          
          const personalText = personalHtml.replace(/<[^>]+>/g, '')
          const displayName = blastSenderName || 'MasterAuto'
          const fromAddress = `${displayName} <${env.smtpUser || env.smtpFrom}>`
          
          const sendRes = await mailer.sendCampaignEmail({
            to: c.email,
            subject: personalSubject,
            content: personalHtml,
            ctaLabel: campaign.cta_label,
            ctaUrl: req.body.cta_url || campaign.cta_url || '#',
            customerName: personalName,
            from: fromAddress,
            bannerImageUrl: campaign.banner_image_url
          })
          if (sendRes && sendRes.skipped) {
            sentResults.skipped += 1
            await db.query(`UPDATE campaign_recipients SET status = $1 WHERE campaign_id = $2 AND id = $3`, ['skipped', campaign.id, c.id])
          } else {
            sentResults.sent += 1
            await db.query(`UPDATE campaign_recipients SET status = $1, sent_at = NOW() WHERE campaign_id = $2 AND id = $3`, ['sent', campaign.id, c.id])
          }
        } catch (err) {
          sentResults.failed += 1
          if (!sentResults.firstError) sentResults.firstError = String(err.message || err)
          await db.query(`UPDATE campaign_recipients SET status = $1, error_message = $2 WHERE campaign_id = $3 AND id = $4`, ['failed', String(err.message || err), campaign.id, c.id])
        }
      }
      await writeAuditLog({ userId: req.user?.id, action: 'EMAIL_BLAST_SENT_NOW', entity: 'email_campaigns', entityId: campaign.id, meta: sentResults })
      return res.json({ message: 'Email blast created and send attempted', queued: false, campaignId: campaign.id, results: sentResults })
    }

    // Non-blocking background sender: if SMTP is configured, attempt to send queued recipients
    try {
      const env = require('../config/env')
      const mailer = require('../services/mailer')
      if (mailer.isEmailConfigured && mailer.isEmailConfigured()) {
        // run in background without blocking response
        ;(async () => {
          try {
            const batchSize = throttleBatchSize || 200
            const delayMs = throttleDelayMs || 1000
            const recs = await db.query(
              `SELECT cr.id, cr.email, c.full_name AS customer_name,
                      (${VEHICLE_LABEL_SQL}) AS vehicle_name,
                      COALESCE(ls.package_name, 'Subscription') AS package_name,
                      COALESCE(ls.subscription_status, 'Active') AS subscription_status
               FROM campaign_recipients cr
               LEFT JOIN customers c ON c.id = cr.customer_id
               LEFT JOIN LATERAL (
                 SELECT
                   COALESCE(sp.name, s.subscription_name, 'Subscription') AS package_name,
                   COALESCE(s.status, 'Active') AS subscription_status
                 FROM subscriptions s
                 LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.package_id, s.subscription_service_id)
                 WHERE s.customer_id = c.id
                 ORDER BY COALESCE(s.updated_at, s.created_at) DESC, s.id DESC
                 LIMIT 1
               ) ls ON TRUE
               WHERE cr.campaign_id = $1 AND cr.status = 'queued'`,
              [campaign.id]
            )
            let sentCount = 0
            for (const r of recs.rows) {
              if (!r.email) {
                await db.query(`UPDATE campaign_recipients SET status = $1 WHERE id = $2`, ['skipped', r.id])
                continue
              }
              try {
                const personalName = r.customer_name || r.email
                const vehicleName = r.vehicle_name || 'your vehicle'
                let personalHtml = replacePlaceholders(campaignContent || '', promotion)
                  .replace(/\{\{\s*customer_name\s*\}\}/gi, personalName)
                  .replace(/\{\{\s*vehicle\s*\}\}/gi, vehicleName)
                personalHtml = replaceRecipientFields(personalHtml, r)

                const personalSubject = replaceRecipientFields(
                  String(campaignSubject || '').replace(/\{\{\s*customer_name\s*\}\}/gi, personalName).replace(/\{\{\s*vehicle\s*\}\}/gi, vehicleName),
                  r,
                )

                const res = await mailer.sendCampaignEmail({
                  to: r.email,
                  subject: personalSubject,
                  content: personalHtml,
                  ctaLabel: campaign.cta_label,
                  ctaUrl: campaign.cta_url || '#',
                  customerName: personalName,
                  from: `${blastSenderName || 'MasterAuto'} <${env.smtpUser || env.smtpFrom}>`,
                  bannerImageUrl: campaign.banner_image_url
                })
                if (res && res.skipped) {
                  await db.query(`UPDATE campaign_recipients SET status = $1 WHERE id = $2`, ['skipped', r.id])
                } else {
                  await db.query(`UPDATE campaign_recipients SET status = $1, sent_at = NOW() WHERE id = $2`, ['sent', r.id])
                }
              } catch (err) {
                await db.query(`UPDATE campaign_recipients SET status = $1, error_message = $2 WHERE id = $3`, ['failed', String(err.message || err), r.id])
              }
              sentCount++
              if (sentCount % batchSize === 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs))
              }
            }
            await writeAuditLog({ userId: req.user?.id, action: 'EMAIL_BLAST_BACKGROUND_SEND', entity: 'email_campaigns', entityId: campaign.id, meta: { sent: sentCount } })
          } catch (bgErr) {
            // Log background error (don't throw)
            logger.error('Background email send failed', { error: String(bgErr?.message || bgErr) })
          }
        })()
      }
    } catch (bgOuterErr) {
      logger.error('Failed to start background sender', { error: String(bgOuterErr?.message || bgOuterErr) })
    }

    await writeAuditLog({ userId: req.user?.id, action: 'EMAIL_BLAST_CREATED_CAMPAIGN', entity: 'email_campaigns', entityId: campaign.id, meta: { customerCount: customerIds.length } })

    return res.json({ message: 'Email blast created (recipients queued)', queued: true, campaignId: campaign.id, count: customerIds.length })
  }),
)

// Block or unblock a customer
router.patch(
  '/:id/block',
  param('id').isInt({ min: 1 }).withMessage('Invalid customer id'),
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { block } = req.body // boolean: true => block, false => unblock

    const { rows } = await db.query(
      `UPDATE customers SET is_blocked = $1 WHERE id = $2 RETURNING *`,
      [!!block, id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Customer not found' })

    invalidateCustomerListCache()

    await writeAuditLog({ userId: req.user?.id, action: block ? 'BLOCK_CUSTOMER' : 'UNBLOCK_CUSTOMER', entity: 'customers', entityId: Number(id) })
    res.json(rows[0])
  }),
)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const portalOnly = req.query.portal === 'true' || req.query.portal === '1'
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 200)
    const offset = (page - 1) * limit
    const cacheKey = buildCustomerListCacheKey({ search, portalOnly, page, limit })
    const cached = getCachedCustomerList(cacheKey)
    if (cached) {
      return res.json(cached)
    }

    // Build WHERE conditions
    const conditions = []
    if (portalOnly) conditions.push('c.portal_password_hash IS NOT NULL')
    if (search) {
      const idx = conditions.length + 1
      conditions.push(`(LOWER(c.full_name) LIKE $${idx}
            OR LOWER(COALESCE(c.email, '')) LIKE $${idx}
            OR LOWER(c.mobile) LIKE $${idx}
            OR LOWER(COALESCE(c.customer_type, '')) LIKE $${idx}
            OR LOWER(COALESCE(c.lead_source, '')) LIKE $${idx}
            OR EXISTS (SELECT 1 FROM quotations q WHERE q.customer_id = c.id AND LOWER(q.quotation_no) LIKE $${idx})
            OR EXISTS (SELECT 1 FROM job_orders jo JOIN quotations q2 ON q2.id = jo.quotation_id WHERE q2.customer_id = c.id AND LOWER(jo.job_order_no) LIKE $${idx}))`)
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const baseParams = search ? [`%${search}%`] : []
    const params = [...baseParams, limit, offset]
    const countParams = [...baseParams]
    const limitIdx = baseParams.length + 1
    const offsetIdx = baseParams.length + 2

    const { rows } = await db.query(
      `SELECT c.id, c.full_name, c.mobile, c.email, c.address,
              c.preferred_contact_method, c.customer_type, c.lead_source,
              c.bay, c.created_at,
              COALESCE(c.is_blocked, FALSE) AS is_blocked,
              (c.portal_password_hash IS NOT NULL) AS has_portal_account,
              COUNT(v.id)::int AS vehicle_count
       FROM customers c
       LEFT JOIN vehicles v ON v.customer_id = c.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.created_at DESC
       LIMIT $${limitIdx}
       OFFSET $${offsetIdx}`,
      params,
    )

    const count = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM customers c
       ${whereClause}`,
      countParams,
    )

    const responsePayload = {
      data: rows,
      pagination: {
        page,
        limit,
        total: count.rows[0].total,
        totalPages: Math.max(Math.ceil(count.rows[0].total / limit), 1),
      },
    }

    setCachedCustomerList(cacheKey, responsePayload)
    res.json(responsePayload)
  }),
)

// GET /customers/:id/payments — individual payment records for a customer
router.get(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ message: 'Invalid customer id' })
    }
    const { rows } = await db.query(
      `SELECT
         p.id,
         p.amount,
         p.payment_type,
         p.reference_no,
         p.is_deposit,
         p.created_at,
         q.quotation_no,
         q.total_amount                                      AS quotation_total,
         COALESCE(qps.payment_status, 'UNPAID')             AS payment_status,
         COALESCE(qps.total_paid, 0)::NUMERIC               AS total_paid,
         COALESCE(qps.outstanding_balance, q.total_amount)  AS outstanding_balance
       FROM payments p
       JOIN quotations q ON q.id = p.quotation_id
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       WHERE c.id = $1
       ORDER BY p.created_at DESC`,
      [id],
    )
    res.json({ data: rows })
  }),
)

// GET /customers/:id — single customer by id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ message: 'Invalid customer id' })
    }
    const { rows } = await db.query(
      `SELECT c.id, c.full_name, c.mobile, c.email, c.address,
              c.preferred_contact_method, c.customer_type, c.lead_source,
              c.bay, COALESCE(c.is_blocked, FALSE) AS is_blocked,
              COUNT(v.id)::int AS vehicle_count
       FROM customers c
       LEFT JOIN vehicles v ON v.customer_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Customer not found' })
    res.json(rows[0])
  }),
)

router.post(
  '/',
  body('fullName').isString().notEmpty().withMessage('fullName is required'),
  body('mobile').isString().notEmpty().withMessage('mobile is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('email must be a valid email address'),
  body('customerType').isString().notEmpty().withMessage('customerType is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const env = require('../config/env')
    const mailer = require('../services/mailer')

    const {
      fullName,
      mobile,
      email,
      address,
      preferredContactMethod,
      customerType,
      leadSource,
      bay,
    } = req.body

    const normalizedEmail = normalizeEmail(email)
    const normalizedMobileDigits = normalizeMobileDigits(mobile)
    const mobileForStorage = normalizeMobileForStorage(mobile)

    if (normalizedMobileDigits) {
      const dupMobile = await db.query(
        "SELECT id FROM customers WHERE regexp_replace(mobile, '\\D', '', 'g') = $1 LIMIT 1",
        [normalizedMobileDigits],
      )
      if (dupMobile.rows.length) {
        return res.status(409).json({ message: 'A customer with this mobile number already exists.' })
      }
    }

    if (normalizedEmail) {
      const dupEmail = await db.query(
        'SELECT id FROM customers WHERE LOWER(TRIM(email)) = $1 LIMIT 1',
        [normalizedEmail],
      )
      if (dupEmail.rows.length) {
        return res.status(409).json({ message: 'A customer with this email already exists.' })
      }
    }

    let rows
    try {
      ;({ rows } = await db.query(
        `INSERT INTO customers (
          full_name, mobile, email, address, preferred_contact_method, customer_type, lead_source, bay
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [fullName, mobileForStorage, normalizedEmail, address, preferredContactMethod, customerType, leadSource, bay || null],
      ))
    } catch (err) {
      if (String(err?.code) === '23505') {
        return res.status(409).json({ message: 'A customer with this email or mobile already exists.' })
      }
      throw err
    }

    // Walk-in: auto-provision portal access and email a temporary password
    const createdCustomer = rows[0]
    const normalizedEmailStr = String(normalizedEmail || '').trim()

    // Admin/Staff-created customer: auto-provision portal access when an email is provided.
    // Do not overwrite existing portal accounts.
    const shouldProvisionPortal = Boolean(req.user?.id) && Boolean(normalizedEmailStr)

    if (shouldProvisionPortal) {
      const temporaryPassword = generateTemporaryPortalPassword()
      const passwordHash = await bcrypt.hash(temporaryPassword, 10)

      // Only set if not already provisioned (do not overwrite existing portal accounts)
      const upd = await db.query(
        `UPDATE customers
         SET portal_password_hash = $1,
             portal_email_verified_at = COALESCE(portal_email_verified_at, NOW()),
             portal_email_verification_code_hash = NULL,
             portal_email_verification_expires_at = NULL
         WHERE id = $2 AND portal_password_hash IS NULL
         RETURNING id`,
        [passwordHash, createdCustomer.id],
      )

      if (upd.rows && upd.rows.length) {
        try {
          const portalLoginUrl = resolvePortalLoginUrl(req, env.portalUrl)
          const sendRes = await mailer.sendPortalAccessEmail({
            to: normalizedEmailStr,
            customerName: createdCustomer.full_name,
            loginEmail: normalizedEmailStr,
            loginMobile: createdCustomer.mobile,
            temporaryPassword,
            portalUrl: portalLoginUrl,
          })

          if (sendRes && sendRes.skipped) {
            throw new Error('Portal access email skipped (email not configured)')
          }

          await writeAuditLog({
            userId: req.user?.id,
            action: 'PORTAL_ACCESS_PROVISIONED',
            entity: 'customers',
            entityId: createdCustomer.id,
            meta: { email: normalizedEmailStr },
          })
        } catch (err) {
          // If we fail to send the password, clear the portal access so the customer can self-register later.
          await db.query(
            `UPDATE customers SET portal_password_hash = NULL WHERE id = $1 AND portal_password_hash = $2`,
            [createdCustomer.id, passwordHash],
          )

          await writeAuditLog({
            userId: req.user?.id,
            action: 'PORTAL_ACCESS_EMAIL_FAILED',
            entity: 'customers',
            entityId: createdCustomer.id,
            meta: { email: normalizedEmailStr, error: String(err.message || err) },
          })
        }
      }
    }

    await writeAuditLog({
      userId: req.user?.id,
      action: 'CREATE_CUSTOMER',
      entity: 'customers',
      entityId: rows[0].id,
      meta: { fullName },
    })

    invalidateCustomerListCache()

    res.status(201).json(rows[0])
  }),
)

router.patch(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid customer id'),
  body('fullName').isString().notEmpty().withMessage('fullName is required'),
  body('mobile').isString().notEmpty().withMessage('mobile is required'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('email must be a valid email address'),
  body('customerType').isString().notEmpty().withMessage('customerType is required'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const {
      fullName,
      mobile,
      email,
      address,
      preferredContactMethod,
      customerType,
      leadSource,
      bay,
    } = req.body

    const customerId = Number(id)
    const normalizedEmail = normalizeEmail(email)
    const normalizedMobileDigits = normalizeMobileDigits(mobile)
    const mobileForStorage = normalizeMobileForStorage(mobile)

    if (normalizedMobileDigits) {
      const dupMobile = await db.query(
        "SELECT id FROM customers WHERE id <> $1 AND regexp_replace(mobile, '\\D', '', 'g') = $2 LIMIT 1",
        [customerId, normalizedMobileDigits],
      )
      if (dupMobile.rows.length) {
        return res.status(409).json({ message: 'A customer with this mobile number already exists.' })
      }
    }

    if (normalizedEmail) {
      const dupEmail = await db.query(
        'SELECT id FROM customers WHERE id <> $1 AND LOWER(TRIM(email)) = $2 LIMIT 1',
        [customerId, normalizedEmail],
      )
      if (dupEmail.rows.length) {
        return res.status(409).json({ message: 'A customer with this email already exists.' })
      }
    }

    let rows
    try {
      ;({ rows } = await db.query(
        `UPDATE customers
         SET full_name = $1,
             mobile = $2,
             email = $3,
             address = $4,
             preferred_contact_method = $5,
             customer_type = $6,
             lead_source = $7,
             bay = $8
         WHERE id = $9
         RETURNING *`,
        [fullName, mobileForStorage, normalizedEmail, address, preferredContactMethod, customerType, leadSource, bay || null, id],
      ))
    } catch (err) {
      if (String(err?.code) === '23505') {
        return res.status(409).json({ message: 'A customer with this email or mobile already exists.' })
      }
      throw err
    }

    if (!rows.length) {
      return res.status(404).json({ message: 'Customer not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_CUSTOMER',
      entity: 'customers',
      entityId: Number(id),
      meta: { fullName },
    })

    invalidateCustomerListCache()

    return res.json(rows[0])
  }),
)

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid customer id'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params

    // Delete customer and dependent records in a transaction.
    // Rationale: Many tables reference customers without ON DELETE CASCADE (e.g. quotations/job_orders),
    // so a plain DELETE fails with FK violations and the UI appears to "do nothing".
    const customerId = Number(id)

    const safeDeleteByCustomerId = async (table) => {
      try {
        const del = await db.query(`DELETE FROM ${table} WHERE customer_id = $1`, [customerId])
        return del.rowCount
      } catch (err) {
        // table does not exist in this schema/environment
        if (String(err?.code) === '42P01' || String(err?.code) === '42703') return null
        throw err
      }
    }

    const safeDeleteWithQuery = async (sql, params = [customerId]) => {
      try {
        const del = await db.query(sql, params)
        return del.rowCount
      } catch (err) {
        // table does not exist in this schema/environment
        if (String(err?.code) === '42P01' || String(err?.code) === '42703') return null
        throw err
      }
    }

    const safeNullifyCustomerId = async (table) => {
      try {
        const upd = await db.query(`UPDATE ${table} SET customer_id = NULL WHERE customer_id = $1`, [customerId])
        return upd.rowCount
      } catch (err) {
        if (String(err?.code) === '42P01') return null
        if (String(err?.code) === '42703') return null
        throw err
      }
    }

    await db.query('BEGIN')
    try {
      // Keep logs but unlink from the deleted customer where the relationship is optional.
      await safeNullifyCustomerId('campaign_recipients')

      // Remove dependent payment rows that can block quotation/sales deletion on older schemas.
      await safeDeleteWithQuery(
        `DELETE FROM payments p
         USING quotations q
         WHERE p.quotation_id = q.id AND q.customer_id = $1`,
      )
      await safeDeleteWithQuery(
        `DELETE FROM payments p
         USING sales s
         WHERE p.sale_id = s.id AND s.customer_id = $1`,
      )

      // Remove common vehicle-linked dependents for schemas without ON DELETE CASCADE.
      await safeDeleteWithQuery(
        `DELETE FROM vehicle_service_records vsr
         USING vehicles v
         WHERE vsr.vehicle_id = v.id AND v.customer_id = $1`,
      )
      await safeDeleteWithQuery(
        `DELETE FROM vehicle_photos vp
         USING vehicles v
         WHERE vp.vehicle_id = v.id AND v.customer_id = $1`,
      )

      // Hard deletes (ordered to satisfy common FKs)
      await safeDeleteByCustomerId('job_orders')
      await safeDeleteByCustomerId('quotations')
      await safeDeleteByCustomerId('appointments')
      await safeDeleteByCustomerId('sales')
      await safeDeleteByCustomerId('vehicles')
      await safeDeleteByCustomerId('customer_notes')
      await safeDeleteByCustomerId('customer_documents')

      const { rowCount } = await db.query('DELETE FROM customers WHERE id = $1', [customerId])

      if (!rowCount) {
        await db.query('ROLLBACK')
        return res.status(404).json({ message: 'Customer not found' })
      }

      await writeAuditLog({
        userId: req.user.id,
        action: 'DELETE_CUSTOMER',
        entity: 'customers',
        entityId: customerId,
      })

      invalidateCustomerListCache()

      await db.query('COMMIT')
      return res.status(204).send()
    } catch (err) {
      await db.query('ROLLBACK')
      throw err
    }
  }),
)

module.exports = router

