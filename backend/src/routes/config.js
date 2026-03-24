const express = require('express')
const { body, param, validationResult } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { validateRequest } = require('../middleware/validateRequest')

const router = express.Router()

// ── All config routes require SuperAdmin ────────────────────────────────────
router.use(requireRole('SuperAdmin'))

// ─────────────────────────────────────────────────────────────────────────
// GET /config
// Returns all settings grouped by category
// ─────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, category, key, value, label, description, value_type,
              updated_by, updated_at
       FROM system_config
       ORDER BY category, key`,
    )

    // Group by category
    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push(row)
    }

    res.json(grouped)
  }),
)

// ─────────────────────────────────────────────────────────────────────────
// GET /config/category/:category
// Returns settings for a single category
// ─────────────────────────────────────────────────────────────────────────
router.get(
  '/category/:category',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, category, key, value, label, description, value_type,
              updated_by, updated_at
       FROM system_config
       WHERE category = $1
       ORDER BY key`,
      [req.params.category],
    )
    res.json(rows)
  }),
)

// ─────────────────────────────────────────────────────────────────────────
// PUT /config
// Batch update: body = { updates: [ { category, key, value }, ... ] }
// SuperAdmin only
// ─────────────────────────────────────────────────────────────────────────
router.put(
  '/',
  requireRole('SuperAdmin'),
  body('updates').isArray({ min: 1 }).withMessage('updates must be a non-empty array'),
  body('updates.*.category').trim().notEmpty().withMessage('Each update must have a category'),
  body('updates.*.key').trim().notEmpty().withMessage('Each update must have a key'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { updates } = req.body
    const userId = req.user?.id
    const ipAddress = req.ip || req.connection?.remoteAddress || null

    // Fetch user name for log
    const userRow = await db.query('SELECT full_name FROM users WHERE id = $1', [userId])
    const changedByName = userRow.rows[0]?.full_name || 'Unknown'

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      const results = []
      for (const update of updates) {
        const { category, key, value } = update

        // Validate category whitelist to prevent injection via category field
        const VALID_CATEGORIES = ['general', 'business', 'vehicle', 'booking', 'payment', 'sales']
        if (!VALID_CATEGORIES.includes(category)) {
          await client.query('ROLLBACK')
          return res.status(400).json({ message: `Invalid category: ${category}` })
        }

        // Fetch the existing row
        const existing = await client.query(
          'SELECT id, value, value_type, label FROM system_config WHERE category = $1 AND key = $2',
          [category, key],
        )

        if (existing.rows.length === 0) {
          await client.query('ROLLBACK')
          return res.status(404).json({ message: `Config key not found: ${category}.${key}` })
        }

        const old = existing.rows[0]

        // Server-side type validation
        const typeError = validateConfigValue(value, old.value_type, old.label || key)
        if (typeError) {
          await client.query('ROLLBACK')
          return res.status(400).json({ message: typeError })
        }

        // Update the config entry
        await client.query(
          `UPDATE system_config
           SET value = $1, updated_by = $2, updated_at = NOW()
           WHERE category = $3 AND key = $4`,
          [value, userId, category, key],
        )

        // Write change log
        await client.query(
          `INSERT INTO config_change_logs
             (category, config_key, old_value, new_value, changed_by, changed_by_name, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [category, key, old.value, value, userId, changedByName, ipAddress],
        )

        results.push({ category, key, updated: true })
      }

      await client.query('COMMIT')
      res.json({ message: 'Settings saved successfully', results })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ─────────────────────────────────────────────────────────────────────────
// POST /config/reset/:category
// Resets a category to seed defaults (SuperAdmin only)
// ─────────────────────────────────────────────────────────────────────────
router.post(
  '/reset/:category',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { category } = req.params
    const VALID_CATEGORIES = ['general', 'business', 'vehicle', 'booking', 'payment', 'sales']
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' })
    }

    const defaults = DEFAULT_VALUES[category]
    if (!defaults) {
      return res.status(400).json({ message: 'No defaults defined for this category' })
    }

    const userId = req.user?.id
    const userRow = await db.query('SELECT full_name FROM users WHERE id = $1', [userId])
    const changedByName = userRow.rows[0]?.full_name || 'Unknown'
    const ipAddress = req.ip || req.connection?.remoteAddress || null

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      for (const [key, defaultValue] of Object.entries(defaults)) {
        const existing = await client.query(
          'SELECT id, value FROM system_config WHERE category = $1 AND key = $2',
          [category, key],
        )

        if (existing.rows.length > 0) {
          const oldValue = existing.rows[0].value
          await client.query(
            `UPDATE system_config
             SET value = $1, updated_by = $2, updated_at = NOW()
             WHERE category = $3 AND key = $4`,
            [defaultValue, userId, category, key],
          )
          await client.query(
            `INSERT INTO config_change_logs
               (category, config_key, old_value, new_value, changed_by, changed_by_name, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [category, key, oldValue, defaultValue, userId, changedByName, ipAddress],
          )
        }
      }

      await client.query('COMMIT')
      res.json({ message: `${category} settings reset to defaults` })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ─────────────────────────────────────────────────────────────────────────
// GET /config/logs
// Returns configuration change logs (Admin only)
// ─────────────────────────────────────────────────────────────────────────
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const page  = Math.max(1, parseInt(req.query.page  || '1',  10))
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10))
    const offset = (page - 1) * limit

    const { rows } = await db.query(
      `SELECT l.id, l.category, l.config_key, l.old_value, l.new_value,
              l.changed_by_name, l.ip_address, l.changed_at
       FROM config_change_logs l
       ORDER BY l.changed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    const countRow = await db.query('SELECT COUNT(*) AS total FROM config_change_logs')
    const total = parseInt(countRow.rows[0].total, 10)

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  }),
)

// ─── Helpers ─────────────────────────────────────────────────────────────

function validateConfigValue(value, valueType, label) {
  if (value === null || value === undefined || value === '') return null // empty is allowed

  switch (valueType) {
    case 'boolean':
      if (value !== 'true' && value !== 'false') {
        return `${label}: must be "true" or "false"`
      }
      break
    case 'integer': {
      const n = parseInt(value, 10)
      if (isNaN(n) || String(n) !== String(value)) {
        return `${label}: must be a whole number`
      }
      if (n < 0) return `${label}: must be 0 or greater`
      break
    }
    case 'float': {
      const f = parseFloat(value)
      if (isNaN(f)) return `${label}: must be a number`
      if (f < 0) return `${label}: must be 0 or greater`
      break
    }
    case 'json':
      try { JSON.parse(value) } catch {
        return `${label}: must be valid JSON`
      }
      break
    default:
      break // string – no additional validation
  }
  return null
}

// Default reset values per category
const DEFAULT_VALUES = {
  general: {
    system_name: 'Master Auto',
    currency: 'PHP',
    timezone: 'Asia/Manila',
    date_format: 'MM/DD/YYYY',
  },
  business: {
    business_name: 'Master Auto',
    address: '',
    contact_number: '',
    email: '',
    tax_rate: '12',
  },
  vehicle: {
    plate_validation_enabled: 'true',
    default_categories: '["Sedan","SUV","Pickup","Van","Hatchback","Motorcycle","Truck","Bus"]',
  },
  booking: {
    allow_cancel_partial_payment: 'true',
    auto_complete_when_paid: 'true',
    allow_edit_after_approval: 'false',
    enable_guest_booking: 'false',
    auto_cancel_unpaid_hours: '24',
  },
  payment: {
    enable_partial_payments: 'true',
    min_downpayment_percent: '30',
    accepted_methods: '["Cash","GCash","Bank Transfer","Check","Credit Card"]',
    refund_rules: 'Refunds are processed within 3–5 business days after approval.',
  },
  sales: {
    include_archived_in_reports: 'false',
    daily_sales_behavior: 'invoice_date',
    default_pricing_rule: 'standard',
  },
}

module.exports = router

