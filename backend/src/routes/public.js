/**
 * /api/public/* — Public endpoints used by the guest online quotation page.
 *
 * These are intentionally unauthenticated and should only expose safe, read-only
 * data required to browse services and vehicle make/model lists.
 */

const express = require('express')
const crypto = require('crypto')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const ConfigurationService = require('../services/configurationService')
const NotificationService = require('../services/notificationService')
const mailer = require('../services/mailer')
const {
  buildQuotationRequestReceivedEmail,
  buildQuotationRequestStaffEmail,
} = require('../services/emailTemplates')
const { emitToRole, emitToLandingVisitor } = require('../realtime/hub')

const router = express.Router()

const PUBLIC_CACHE_TTL_MS = 60000
const publicEndpointCache = new Map()

function getPublicCache(key) {
  const entry = publicEndpointCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    publicEndpointCache.delete(key)
    return null
  }
  return entry.value
}

function setPublicCache(key, value) {
  publicEndpointCache.set(key, {
    value,
    expiresAt: Date.now() + PUBLIC_CACHE_TTL_MS,
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
function getBranchCode(bay) {
  if (!bay) return 'BR'
  const raw = String(bay || '').toLowerCase().trim()
  return BRANCH_CODES[raw] || String(bay || '').substring(0, 3).toUpperCase()
}

function normalizePlate(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeMobile(raw) {
  return String(raw || '').replace(/\D/g, '')
}

function makeTempPlate() {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `TMP${stamp}${rand}`
}

function normalizePackageCode(prefix, id) {
  return `${prefix}-${String(id || '').trim()}`
}

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

function generateVisitorToken() {
  return crypto.randomBytes(24).toString('base64url')
}

function normalizeVisitorToken(raw) {
  const token = String(raw || '').trim()
  if (!token) return ''
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(token)) return ''
  return token
}

function mapLandingChatMessage(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    senderLabel: row.sender_label,
    message: row.message,
    isAuto: row.is_auto,
    createdAt: row.created_at,
  }
}

function parseBooleanish(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'true') return true
  if (text === 'false') return false
  return fallback
}

function safeJsonObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '{}'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // ignore parse errors
  }
  return fallback
}

function safeJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '[]'))
    if (Array.isArray(parsed)) return parsed
  } catch {
    // ignore parse errors
  }
  return fallback
}

function parseMaybeJson(value) {
  if (value == null) return value
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeServiceCode(raw) {
  return String(raw || '').trim().replace(/^CAT-/i, '').toLowerCase()
}

function normalizeServiceBaseName(raw) {
  const text = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const idx = text.lastIndexOf(' - ')
  return idx > -1 ? text.slice(0, idx).trim() : text
}

function fillTemplate(template, context = {}) {
  let text = String(template || '')
  Object.entries(context).forEach(([k, v]) => {
    text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'gi'), String(v ?? ''))
  })
  return text
}

function detectIntent(message, rules) {
  const input = String(message || '').toLowerCase()
  let bestIntent = null
  let bestScore = 0

  for (const rule of rules) {
    const intent = String(rule?.intent || '').trim()
    const keywords = Array.isArray(rule?.keywords) ? rule.keywords : []
    if (!intent || keywords.length === 0) continue

    let score = 0
    for (const kw of keywords) {
      const needle = String(kw || '').trim().toLowerCase()
      if (!needle) continue
      if (input.includes(needle)) score += 1
    }

    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
    }
  }

  return bestIntent
}

async function buildLandingAutoReply({ visitorName, message }) {
  const name = String(visitorName || '').trim() || 'Guest'

  const [
    autoReplyEnabled,
    autoReplyTemplate,
    mlIntentEnabled,
    mlIntentRulesRaw,
    mlIntentRepliesRaw,
  ] = await Promise.all([
    ConfigurationService.get('landing_chat', 'auto_reply_enabled').catch(() => null),
    ConfigurationService.get('landing_chat', 'auto_reply_template').catch(() => null),
    ConfigurationService.get('landing_chat', 'ml_intent_enabled').catch(() => null),
    ConfigurationService.get('landing_chat', 'ml_intent_rules').catch(() => null),
    ConfigurationService.get('landing_chat', 'ml_intent_replies').catch(() => null),
  ])

  if (!parseBooleanish(autoReplyEnabled, true)) {
    return null
  }

  const fallbackTemplate =
    String(autoReplyTemplate || '').trim() ||
    'Thank you, {{name}}. Your message has been received and queued. A SuperAdmin will assist you as soon as possible.'

  const defaultRules = [
    { intent: 'pricing', keywords: ['price', 'cost', 'how much', 'rate', 'discount'] },
    { intent: 'booking', keywords: ['book', 'schedule', 'appointment', 'slot', 'available'] },
    { intent: 'location', keywords: ['where', 'location', 'address', 'branch', 'map'] },
    { intent: 'services', keywords: ['service', 'ppf', 'ceramic', 'tint', 'detailing', 'package'] },
    { intent: 'status', keywords: ['status', 'update', 'progress', 'follow up', 'follow-up'] },
  ]

  const defaultReplies = {
    pricing: 'Thanks {{name}}. For pricing, our team will provide a quotation based on your vehicle and preferred service.',
    booking: 'Thanks {{name}}. For booking requests, please share your preferred date/time and vehicle details.',
    location: 'Thanks {{name}}. Our team will send the exact branch/location details shortly.',
    services: 'Thanks {{name}}. We offer PPF, ceramic coating, tint, detailing, and seat cover packages.',
    status: 'Thanks {{name}}. We have logged your request and SuperAdmin will send an update soon.',
    fallback: fallbackTemplate,
  }

  if (!parseBooleanish(mlIntentEnabled, true)) {
    return fillTemplate(fallbackTemplate, { name })
  }

  const rules = safeJsonArray(mlIntentRulesRaw, defaultRules)
  const replies = { ...defaultReplies, ...safeJsonObject(mlIntentRepliesRaw, {}) }

  const intent = detectIntent(message, rules)
  const selected = intent && replies[intent] ? replies[intent] : replies.fallback

  return fillTemplate(selected, { name, intent: intent || 'fallback' })
}

async function getLandingWelcomeMessage() {
  const fallback =
    'Hello! Thank you for contacting Master Auto. Please share your concern and our assistant will acknowledge it first, then a SuperAdmin will respond shortly.'

  const configured = await ConfigurationService.get('landing_chat', 'welcome_message').catch(() => null)
  const text = String(configured || '').trim()
  return text || fallback
}

async function upsertLandingChatThread({ visitorToken, visitorName }) {
  const safeName = String(visitorName || '').trim().slice(0, 120) || null
  const normalizedToken = normalizeVisitorToken(visitorToken)

  if (normalizedToken) {
    const existingResult = await db.query(
      `SELECT id, visitor_token, visitor_name, status, created_at, updated_at, last_message_at
       FROM landing_chat_threads
       WHERE visitor_token = $1
       LIMIT 1`,
      [normalizedToken],
    )

    if (existingResult.rows.length) {
      const existing = existingResult.rows[0]

      if (String(existing.status || '').toLowerCase() === 'open') {
        const updated = await db.query(
          `UPDATE landing_chat_threads
           SET visitor_name = COALESCE(NULLIF($2, ''), visitor_name),
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, visitor_token, visitor_name, status, created_at, updated_at, last_message_at`,
          [existing.id, safeName],
        )
        return updated.rows[0]
      }

      const freshToken = generateVisitorToken()
      const fresh = await db.query(
        `INSERT INTO landing_chat_threads (visitor_token, visitor_name, status, last_message_at, created_at, updated_at)
         VALUES ($1, $2, 'open', NOW(), NOW(), NOW())
         RETURNING id, visitor_token, visitor_name, status, created_at, updated_at, last_message_at`,
        [freshToken, safeName || existing.visitor_name || null],
      )
      return fresh.rows[0]
    }
  }

  const token = normalizedToken || generateVisitorToken()
  const { rows } = await db.query(
    `INSERT INTO landing_chat_threads (visitor_token, visitor_name, status, last_message_at, created_at, updated_at)
     VALUES ($1, $2, 'open', NOW(), NOW(), NOW())
     RETURNING id, visitor_token, visitor_name, status, created_at, updated_at, last_message_at`,
    [token, safeName],
  )

  return rows[0]
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
  const seq = last ? parseInt(last.split('-')[3], 10) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// GET /api/public/services — active services list
router.get(
  '/services',
  asyncHandler(async (_req, res) => {
    // 1. Fetch base services from DB
    const { rows: baseRows } = await db.query(
      `SELECT id, code, name, category, base_price, description, materials_notes
       FROM services
       WHERE COALESCE(is_active, TRUE) = TRUE`,
    )

    // 2. Fetch overrides & custom services from configuration
    const overrides = parseMaybeJson(await ConfigurationService.get('quotations', 'service_name_overrides'))
    const customSvcs = parseMaybeJson(await ConfigurationService.get('quotations', 'custom_services'))
    const deletedServiceCodes = parseMaybeJson(await ConfigurationService.get('quotations', 'deleted_service_codes'))
    const deletedCodeSet = new Set(
      Array.isArray(deletedServiceCodes)
        ? deletedServiceCodes.map((c) => normalizeServiceCode(c)).filter(Boolean)
        : [],
    )

    // 2b. Fetch active package offerings for guest quotation service list
    const [subscriptionPkgRows, pmsPkgRows] = await Promise.all([
      db
        .query(
          `SELECT id, name, description, price
           FROM subscription_packages
           WHERE status = 'Active'
           ORDER BY created_at DESC, id DESC`,
        )
        .then((r) => r.rows)
        .catch(() => []),
      db
        .query(
          `SELECT id,
                  name,
                  description,
                  COALESCE(price, estimated_price) AS price
           FROM pms_packages
           WHERE COALESCE(is_deleted, false) = false
             AND status = 'Active'
           ORDER BY kilometer_interval ASC, id ASC`,
        )
        .then((r) => r.rows)
        .catch(() => []),
    ])

    // 3. Map base services with overrides (match on normalized code)
    const ovMap = {}
    if (overrides && typeof overrides === 'object') {
      // Normalize all override keys to lowercase and stripped
      Object.keys(overrides).forEach((k) => {
        const normK = String(k || '').replace(/^CAT-/i, '').toLowerCase()
        ovMap[normK] = overrides[k]
      })
    }
    
    let services = baseRows.map((s) => {
      const catCode = String(s.code || '').replace(/^CAT-/i, '').toLowerCase()
      const overName = ovMap[catCode] || ovMap[s.code]
      return overName ? { ...s, name: overName } : s
    }).filter((s) => {
      const code = normalizeServiceCode(s.code)
      const baseName = normalizeServiceBaseName(s.name)
      if (deletedCodeSet.has(code)) return false
      if (baseName === 'ppf full body') return false
      return true
    })

    // 4. Merge custom services (if active)
    if (Array.isArray(customSvcs)) {
      customSvcs.forEach((cs) => {
        if (cs.enabled !== false) {
          const rows = expandCustomServiceRows(cs).filter((row) => {
            const code = normalizeServiceCode(row.code)
            const baseName = normalizeServiceBaseName(row.name)
            if (deletedCodeSet.has(code)) return false
            if (baseName === 'ppf full body') return false
            return true
          })
          services.push(...rows)
        }
      })
    }

    // 5. Merge subscription/pms packages as selectable guest quotation services
    if (Array.isArray(subscriptionPkgRows)) {
      subscriptionPkgRows.forEach((pkg) => {
        services.push({
          id: `subscription-${pkg.id}`,
          code: normalizePackageCode('SUBS-PKG', pkg.id),
          name: String(pkg.name || '').trim() || 'Subscription Package',
          category: 'Subscription Services',
          base_price: Number(pkg.price || 0),
          description: pkg.description || '',
          materials_notes: null,
        })
      })
    }

    if (Array.isArray(pmsPkgRows)) {
      pmsPkgRows.forEach((pkg) => {
        services.push({
          id: `pms-${pkg.id}`,
          code: normalizePackageCode('PMS-PKG', pkg.id),
          name: String(pkg.name || '').trim() || 'PMS Package',
          category: 'PMS Services',
          base_price: Number(pkg.price || 0),
          description: pkg.description || '',
          materials_notes: null,
        })
      })
    }

    // 6. Sort by category (ASC), then name (ASC)
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

// GET /api/public/branch-locations — configured branches list for guest quotation dropdown
router.get(
  '/branch-locations',
  asyncHandler(async (_req, res) => {
    const cached = getPublicCache('public:branch-locations')
    if (cached) {
      return res.json(cached)
    }

    // Stored under booking.branch_locations as JSON array (migration 043)
    let value = await ConfigurationService.get('booking', 'branch_locations')

    if (typeof value === 'string') {
      const s = value.trim()
      if (s) {
        try {
          value = JSON.parse(s)
        } catch {
          // Fallback: allow newline/comma separated
          value = s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean)
        }
      }
    }

    if (!Array.isArray(value)) {
      const fallback = ['Cubao', 'Manila']
      setPublicCache('public:branch-locations', fallback)
      return res.json(fallback)
    }

    const cleaned = value
      .map((x) => String(x || '').trim())
      .filter(Boolean)

    const payload = cleaned.length ? cleaned : ['Cubao', 'Manila']
    setPublicCache('public:branch-locations', payload)
    return res.json(payload)
  }),
)

// POST /api/public/quotation-requests — guest online quotation request
// Creates a real quotation row (status Pending) so it appears in staff Quotations page.
router.post(
  '/quotation-requests',
  asyncHandler(async (req, res) => {
    const {
      fullName,
      mobile,
      email,
      branch,
      vehicleMake,
      vehicleModel,
      vehicleSize,
      serviceId,
      preferredDate,
      endDate,
      notes,
      unitPrice,
      vehiclePlate,
    } = req.body || {}

    const cleanName = String(fullName || '').trim()
    const cleanMobile = normalizeMobile(mobile)
    const cleanEmail = String(email || '').trim() || null
    const cleanBranch = String(branch || '').trim() || null
    const cleanMake = String(vehicleMake || '').trim()
    const cleanModel = String(vehicleModel || '').trim()
    const cleanSize = String(vehicleSize || 'medium').trim()

    if (!cleanName) return res.status(400).json({ message: 'Full name is required' })
    if (!cleanMobile) return res.status(400).json({ message: 'Mobile number is required' })
    if (cleanMobile.length !== 11) return res.status(400).json({ message: 'Mobile number must contain exactly 11 digits' })
    if (!cleanMake) return res.status(400).json({ message: 'Vehicle make is required' })

    // Resolve service (optional)
    let selectedService = null
    if (serviceId) {
      const sid = String(serviceId || '').trim()
      if (!isNaN(serviceId)) {
        // Search by numeric ID
        const { rows } = await db.query(
          `SELECT id, code, name, category, base_price, description, is_active
           FROM services
           WHERE id = $1`,
          [Number(serviceId)],
        )
        if (rows.length && (rows[0].is_active === undefined || rows[0].is_active === true)) {
          selectedService = rows[0]
        }
      } else if (/^SUBS-PKG-\d+$/i.test(sid)) {
        const pkgId = Number(sid.split('-').pop())
        const { rows } = await db.query(
          `SELECT id, name, description, price
           FROM subscription_packages
           WHERE id = $1
             AND status = 'Active'`,
          [pkgId],
        )
        if (rows.length) {
          selectedService = {
            id: null,
            code: sid.toUpperCase(),
            name: rows[0].name,
            category: 'Subscription Services',
            base_price: Number(rows[0].price || 0),
            description: rows[0].description,
            is_active: true,
          }
        }
      } else if (/^PMS-PKG-\d+$/i.test(sid)) {
        const pkgId = Number(sid.split('-').pop())
        const { rows } = await db.query(
          `SELECT id,
                  name,
                  description,
                  COALESCE(price, estimated_price) AS price
           FROM pms_packages
           WHERE id = $1
             AND COALESCE(is_deleted, false) = false
             AND status = 'Active'`,
          [pkgId],
        )
        if (rows.length) {
          selectedService = {
            id: null,
            code: sid.toUpperCase(),
            name: rows[0].name,
            category: 'PMS Services',
            base_price: Number(rows[0].price || 0),
            description: rows[0].description,
            is_active: true,
          }
        }
      } else {
        // Search by code (e.g. 'ppf-basic' or 'CAT-PPF-BASIC')
        const normalizedCode = String(serviceId).startsWith('CAT-') ? serviceId.toUpperCase() : ('CAT-' + serviceId).toUpperCase()
        const { rows } = await db.query(
          `SELECT id, code, name, category, base_price, description, is_active
           FROM services
           WHERE code = $1`,
          [normalizedCode],
        )
        if (rows.length && (rows[0].is_active === undefined || rows[0].is_active === true)) {
          selectedService = rows[0]
        }
      }
    }

    // Build stored notes (guest notes only) and email notes (include schedule context)
    const dt = (iso) => {
      if (!iso) return null
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return null
      return d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    const preferredLabel = dt(preferredDate)
    const endLabel = dt(endDate)
    const storedNotesParts = [
      !selectedService && serviceId ? `Requested service code: ${serviceId}` : null,
      notes ? String(notes).trim() : null,
    ].filter(Boolean)
    const storedNotes = storedNotesParts.join('\n').trim() || null

    const emailNotesParts = [
      preferredLabel ? `Preferred start: ${preferredLabel}` : null,
      endLabel ? `Estimated end: ${endLabel}` : null,
      notes ? String(notes).trim() : null,
      !selectedService && serviceId ? `Requested service code: ${serviceId}` : null,
    ].filter(Boolean)
    const emailNotes = emailNotesParts.join('\n').trim() || null

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: requestRows } = await client.query(
        `INSERT INTO online_quotation_requests (
          branch, full_name, mobile, email, 
          vehicle_make, vehicle_model, vehicle_plate, vehicle_size,
          service_id, unit_price, preferred_date, end_date, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'New')
        RETURNING id`,
        [
          cleanBranch, cleanName, cleanMobile, cleanEmail,
          cleanMake, cleanModel, vehiclePlate || null, cleanSize,
          selectedService?.id || null, Number(unitPrice || 0), preferredDate || null, endDate || null, storedNotes
        ],
      )

      await client.query('COMMIT')
      const requestId = requestRows[0].id

      res.status(201).json({
        message: 'Quotation request submitted successfully. Our team will contact you soon.',
        requestId,
      })

      // Non-blocking emails
      ;(async () => {
        try {
          const businessEmail = await ConfigurationService.get('business', 'business_email')
          const staffTemplate = buildQuotationRequestStaffEmail({
            quotationNo: `ONLINE-#${requestId}`,
            branch: cleanBranch,
            customerName: cleanName,
            mobile: cleanMobile,
            email: cleanEmail,
            make: cleanMake,
            model: cleanModel,
            vehicleSize: cleanSize,
            serviceName: selectedService?.name,
            notes: emailNotes,
          })

          if (businessEmail) {
            await mailer.sendRawEmail({
              to: businessEmail,
              subject: `[New Online Request] ${cleanName} - ${cleanMake}`,
              text: staffTemplate.text,
              html: staffTemplate.html,
            })
          }

          if (cleanEmail) {
            const customerTemplate = buildQuotationRequestReceivedEmail({
              customerName: cleanName,
              quotationNo: `ONLINE-#${requestId}`,
              branch: cleanBranch,
              mobile: cleanMobile,
              email: cleanEmail,
              make: cleanMake,
              model: cleanModel,
              vehicleSize: cleanSize,
              serviceName: selectedService?.name,
              notes: emailNotes,
            })
            await mailer.sendRawEmail({
              to: cleanEmail,
              subject: `Request Received: ${cleanName}`,
              text: customerTemplate.text,
              html: customerTemplate.html,
            })
          }
        } catch (emailErr) {
          console.error('[PublicQuotationRequest] email failed:', emailErr.message)
        }
      })()
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// GET /api/public/price-config — quotations.service_prices overrides
router.get(
  '/price-config',
  asyncHandler(async (_req, res) => {
    // Expected shape: { [catalogCode]: { [sizeKey]: price } }
    // Example: { "ppf-basic": { "small": 12345 } }
    let value = await ConfigurationService.get('quotations', 'service_prices')

    // Backward compatibility: if stored as string, try parse JSON.
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        value = null
      }
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return res.json({})
    }
    return res.json(value)
  }),
)

// GET /api/public/vehicle-makes — list all active makes
router.get(
  '/vehicle-makes',
  asyncHandler(async (_req, res) => {
    try {
      const { rows } = await db.query(
        `SELECT id, name, category, is_active, sort_order
         FROM vehicle_makes
         WHERE is_active = TRUE
         ORDER BY sort_order, name`,
      )
      return res.json(rows)
    } catch (err) {
      // Some deployments may not have vehicle_makes tables. Return empty list.
      console.error('Public vehicle-makes unavailable:', err.message)
      return res.json([])
    }
  }),
)

// GET /api/public/vehicle-makes/:makeId/models — models for a specific make
router.get(
  '/vehicle-makes/:makeId/models',
  asyncHandler(async (req, res) => {
    const { makeId } = req.params
    if (!makeId || Number.isNaN(Number(makeId))) {
      return res.status(400).json({ message: 'Invalid make id' })
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

      const whereClause = hasIsActive
        ? 'WHERE make_id = $1 AND is_active = TRUE'
        : 'WHERE make_id = $1'

      const { rows } = await db.query(
        `SELECT ${selectFields.join(', ')}
         FROM vehicle_models
         ${whereClause}
         ORDER BY name`,
        [makeId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Public vehicle models unavailable:', err.message)
      return res.json([])
    }
  }),
)

// GET /api/public/vehicle-makes/models/:modelId/variants
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
      console.error('Public variants unavailable:', err.message)
      return res.json([])
    }
  }),
)

// GET /api/public/vehicle-makes/variants/:variantId/years
router.get(
  '/vehicle-makes/variants/:variantId/years',
  asyncHandler(async (req, res) => {
    const { variantId } = req.params
    if (!variantId || Number.isNaN(Number(variantId))) {
      return res.status(400).json({ message: 'Invalid variant id' })
    }
    try {
      const { rows } = await db.query(
        `SELECT id, year_model
         FROM vehicle_years
         WHERE variant_id = $1 AND is_active = TRUE
         ORDER BY year_model DESC`,
        [variantId],
      )
      return res.json(rows)
    } catch (err) {
      console.error('Public years unavailable:', err.message)
      return res.json([])
    }
  }),
)

router.post(
  '/chat/thread',
  asyncHandler(async (req, res) => {
    const visitorName = String(req.body?.visitorName || '').trim()
    const visitorToken = String(req.body?.visitorToken || '').trim()

    const thread = await upsertLandingChatThread({ visitorToken, visitorName })

    const { rows } = await db.query(
      `SELECT id, thread_id, sender_type, sender_label, message, is_auto, created_at
       FROM landing_chat_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 200`,
      [thread.id],
    )

    const welcomeMessage = await getLandingWelcomeMessage()

    return res.json({
      thread: {
        id: thread.id,
        visitorToken: thread.visitor_token,
        visitorName: thread.visitor_name || 'Guest',
        status: thread.status,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
        lastMessageAt: thread.last_message_at,
      },
      welcomeMessage,
      messages: rows.map(mapLandingChatMessage),
    })
  }),
)

router.get(
  '/chat/thread/:visitorToken/messages',
  asyncHandler(async (req, res) => {
    const visitorToken = normalizeVisitorToken(req.params.visitorToken)
    if (!visitorToken) {
      return res.status(400).json({ message: 'Invalid visitor token' })
    }

    const threadResult = await db.query(
      `SELECT id, visitor_name, visitor_token, status, created_at, updated_at, last_message_at
       FROM landing_chat_threads
       WHERE visitor_token = $1`,
      [visitorToken],
    )

    if (!threadResult.rows.length) {
      return res.status(404).json({ message: 'Chat thread not found' })
    }

    const thread = threadResult.rows[0]
    const { rows } = await db.query(
      `SELECT id, thread_id, sender_type, sender_label, message, is_auto, created_at
       FROM landing_chat_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 300`,
      [thread.id],
    )

    const welcomeMessage = await getLandingWelcomeMessage()

    return res.json({
      thread: {
        id: thread.id,
        visitorToken: thread.visitor_token,
        visitorName: thread.visitor_name || 'Guest',
        status: thread.status,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
        lastMessageAt: thread.last_message_at,
      },
      welcomeMessage,
      messages: rows.map(mapLandingChatMessage),
    })
  }),
)

router.post(
  '/chat/thread/:visitorToken/messages',
  asyncHandler(async (req, res) => {
    const visitorToken = normalizeVisitorToken(req.params.visitorToken)
    if (!visitorToken) {
      return res.status(400).json({ message: 'Invalid visitor token' })
    }

    const message = String(req.body?.message || '').trim()
    if (!message) {
      return res.status(400).json({ message: 'Message is required' })
    }

    const visitorName = String(req.body?.visitorName || '').trim()
    const thread = await upsertLandingChatThread({ visitorToken, visitorName })

    const senderLabel = String(visitorName || thread.visitor_name || 'Guest').trim().slice(0, 120) || 'Guest'
    const autoText = await buildLandingAutoReply({ visitorName: senderLabel, message })

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      const visitorInsert = await client.query(
        `INSERT INTO landing_chat_messages (thread_id, sender_type, sender_label, message, is_auto)
         VALUES ($1, 'visitor', $2, $3, FALSE)
         RETURNING id, thread_id, sender_type, sender_label, message, is_auto, created_at`,
        [thread.id, senderLabel, message],
      )

      let autoMessageRow = null
      if (autoText) {
        const autoInsert = await client.query(
          `INSERT INTO landing_chat_messages (thread_id, sender_type, sender_label, message, is_auto)
           VALUES ($1, 'system', 'Auto Assistant', $2, TRUE)
           RETURNING id, thread_id, sender_type, sender_label, message, is_auto, created_at`,
          [thread.id, autoText],
        )
        autoMessageRow = autoInsert.rows[0]
      }

      await client.query(
        `UPDATE landing_chat_threads
         SET visitor_name = COALESCE($2, visitor_name),
             status = 'open',
             last_message_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [thread.id, senderLabel],
      )

      await client.query('COMMIT')

      const newMessages = [
        mapLandingChatMessage(visitorInsert.rows[0]),
        ...(autoMessageRow ? [mapLandingChatMessage(autoMessageRow)] : []),
      ]

      // Push a real-time notification to admin/superadmin notification center.
      try {
        await NotificationService.create({
          role: 'admin',
          title: 'New Landing Chat Message',
          message: `${senderLabel}: ${message.length > 120 ? `${message.slice(0, 120)}...` : message}`,
          payload: {
            type: 'landing-chat',
            thread_id: thread.id,
            visitor_token: thread.visitor_token,
            visitor_name: senderLabel,
            source: 'visitor',
            preview: message,
          },
        })
      } catch (notifyErr) {
        console.error('Landing chat notification create failed:', notifyErr?.message || notifyErr)
      }

      emitToRole('admin', 'landing-chat:thread-updated', {
        threadId: thread.id,
        visitorToken: thread.visitor_token,
        visitorName: senderLabel,
        source: 'visitor',
        at: new Date().toISOString(),
      })

      emitToLandingVisitor(thread.visitor_token, 'landing-chat:new-message', {
        threadId: thread.id,
        visitorToken: thread.visitor_token,
        messages: newMessages,
      })

      return res.status(201).json({
        message: 'Message sent',
        thread: {
          id: thread.id,
          visitorToken: thread.visitor_token,
          visitorName: senderLabel,
          status: 'open',
        },
        newMessages,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

module.exports = router
