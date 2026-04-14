/**
 * /api/portal/subscriptions/* — Customer subscription routes
 */

const express = require('express')
const { asyncHandler } = require('../utils/asyncHandler')
const db = require('../config/db')
const env = require('../config/env')
const ConfigurationService = require('../services/configurationService')
const NotificationService = require('../services/notificationService')
const { sendSubscriptionReminderEmail } = require('../services/mailer')

const router = express.Router()
let recordsSchemaReady = false
let subscriptionEmailConfigReady = false

async function ensureSubscriptionEmailConfigDefaults() {
  if (subscriptionEmailConfigReady) return

  await ConfigurationService.ensureDefaults([
    {
      category: 'subscription_email',
      key: 'enabled',
      value: 'true',
      dataType: 'boolean',
      description: 'Enable automatic subscription reminder emails.',
    },
    {
      category: 'subscription_email',
      key: 'subject',
      value: '',
      dataType: 'string',
      description: 'Custom subject for subscription reminder emails. Supports {status}, {plate_number}, {package_name}, {end_date}.',
    },
  ]).catch(() => {})

  subscriptionEmailConfigReady = true
}

async function ensureSubscriptionRecordsSchema() {
  if (recordsSchemaReady) return

  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_service_id INT')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS package_id INT')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_name TEXT')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS monthly_revenue DECIMAL(10,2)')

  await db.query('UPDATE subscriptions SET package_id = subscription_service_id WHERE package_id IS NULL AND subscription_service_id IS NOT NULL')
  await db.query('UPDATE subscriptions SET subscription_service_id = package_id WHERE subscription_service_id IS NULL AND package_id IS NOT NULL')
  await db.query(
    `UPDATE subscriptions s
     SET subscription_name = sp.name
     FROM subscription_packages sp
     WHERE s.subscription_name IS NULL
       AND sp.id = COALESCE(s.package_id, s.subscription_service_id)`,
  )
  await db.query('UPDATE subscriptions SET price = monthly_revenue WHERE price IS NULL AND monthly_revenue IS NOT NULL')
  await db.query('UPDATE subscriptions SET monthly_revenue = price WHERE monthly_revenue IS NULL AND price IS NOT NULL')

  recordsSchemaReady = true
}

async function syncExpiredSubscriptions() {
  await db.query(
    `UPDATE subscriptions
     SET status = 'Expiring Soon'
     WHERE COALESCE(status, 'Active') = 'Active'
       AND end_date IS NOT NULL
       AND end_date >= CURRENT_TIMESTAMP
       AND end_date <= (CURRENT_TIMESTAMP + INTERVAL '5 days')`,
  )

  await db.query(
    `UPDATE subscriptions
     SET status = 'Active'
     WHERE status = 'Expiring Soon'
       AND (end_date IS NULL OR end_date > (CURRENT_TIMESTAMP + INTERVAL '5 days'))`,
  )

  await db.query(
    `UPDATE subscriptions
     SET status = 'Expired'
     WHERE COALESCE(status, 'Active') IN ('Active', 'Expiring Soon')
       AND end_date IS NOT NULL
       AND end_date < CURRENT_TIMESTAMP`,
  )
}

async function notificationExists({ role, userId = null, subscriptionId, endDateKey, notificationType }) {
  const { rows } = await db.query(
    `SELECT 1
     FROM notifications
     WHERE role = $1
       AND ((user_id IS NULL AND $2::int IS NULL) OR user_id = $2)
       AND COALESCE(payload->>'type', '') = $3
       AND COALESCE(payload->>'subscription_id', '') = $4
       AND COALESCE(payload->>'end_date', '') = $5
     LIMIT 1`,
    [role, userId, notificationType, String(subscriptionId), endDateKey],
  )
  return rows.length > 0
}

async function notifyByWindow({
  customerId,
  where,
  notificationType,
  adminTitle,
  adminMessage,
  clientTitle,
  clientMessage,
  emailReminderType,
  subscriptionEmailEnabled,
  subscriptionEmailSubject,
}) {
  const params = [customerId]
  const whereParts = Array.isArray(where) ? [...where] : []

  const { rows } = await db.query(
    `SELECT
       s.id,
       s.customer_id,
       s.end_date,
       c.full_name AS customer_name,
       c.email AS customer_email,
       COALESCE(sp.name, s.subscription_name, 'Subscription') AS package_name,
       COALESCE(v.plate_number, 'N/A') AS plate_number
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN vehicles v ON v.id = s.vehicle_id
     LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.package_id, s.subscription_service_id)
     WHERE s.customer_id = $1
       AND ${whereParts.join(' AND ')}`,
    params,
  )

  for (const row of rows) {
    const endDate = row.end_date ? new Date(row.end_date) : null
    const endDateText = endDate && !Number.isNaN(endDate.getTime())
      ? endDate.toLocaleDateString('en-PH')
      : 'soon'
    const endDateKey = endDate ? endDate.toISOString().slice(0, 10) : 'unknown'

    const payload = {
      type: notificationType,
      subscription_id: row.id,
      customer_id: row.customer_id,
      package_name: row.package_name,
      plate_number: row.plate_number,
      end_date: endDateKey,
    }

    const adminExists = await notificationExists({
      role: 'admin',
      userId: null,
      subscriptionId: row.id,
      endDateKey,
      notificationType,
    })

    if (!adminExists) {
      await NotificationService.create({
        role: 'admin',
        title: adminTitle,
        message: adminMessage({ row, endDateText }),
        payload,
      }).catch(() => {})
    }

    const clientExists = await notificationExists({
      role: 'client',
      userId: row.customer_id,
      subscriptionId: row.id,
      endDateKey,
      notificationType,
    })

    if (!clientExists) {
      await NotificationService.create({
        role: 'client',
        userId: row.customer_id,
        title: clientTitle,
        message: clientMessage({ row, endDateText }),
        payload,
      }).catch(() => {})

      if (subscriptionEmailEnabled) {
        await sendSubscriptionReminderEmail({
          to: row.customer_email,
          customerName: row.customer_name,
          packageName: row.package_name,
          plateNumber: row.plate_number,
          endDate,
          reminderType: emailReminderType,
          ctaUrl: env.portalUrl || undefined,
          configSubject: subscriptionEmailSubject || undefined,
        }).catch(() => {})
      }
    }
  }
}

async function notifyExpiringSubscriptions({ customerId }) {
  if (!customerId) return

  await ensureSubscriptionRecordsSchema()
  await NotificationService.ensureTable()
  await ensureSubscriptionEmailConfigDefaults()

  const [cfgEnabled, cfgSubject] = await Promise.all([
    ConfigurationService.get('subscription_email', 'enabled').catch(() => null),
    ConfigurationService.get('subscription_email', 'subject').catch(() => null),
  ])
  const subscriptionEmailEnabled = String(cfgEnabled).toLowerCase() !== 'false'

  await notifyByWindow({
    customerId,
    where: [
      "COALESCE(s.status, 'Active') IN ('Active', 'Expiring Soon')",
      's.end_date IS NOT NULL',
      's.end_date >= CURRENT_TIMESTAMP',
      "s.end_date <= (CURRENT_TIMESTAMP + INTERVAL '5 days')",
    ],
    notificationType: 'subscription-expiring-5-days',
    adminTitle: 'Subscription Expiring Soon',
    adminMessage: ({ row, endDateText }) => `${row.customer_name}'s subscription (${row.package_name}, ${row.plate_number}) expires on ${endDateText}.`,
    clientTitle: 'Subscription Reminder',
    clientMessage: ({ row, endDateText }) => `Your subscription (${row.package_name}, ${row.plate_number}) will expire on ${endDateText}.`,
    emailReminderType: 'expiring',
    subscriptionEmailEnabled,
    subscriptionEmailSubject: cfgSubject,
  })

  await notifyByWindow({
    customerId,
    where: [
      "COALESCE(s.status, 'Active') = 'Expired'",
      's.end_date IS NOT NULL',
      's.end_date < CURRENT_TIMESTAMP',
    ],
    notificationType: 'subscription-expired',
    adminTitle: 'Subscription Expired',
    adminMessage: ({ row, endDateText }) => `${row.customer_name}'s subscription (${row.package_name}, ${row.plate_number}) expired on ${endDateText}.`,
    clientTitle: 'Subscription Expired',
    clientMessage: ({ row, endDateText }) => `Your subscription (${row.package_name}, ${row.plate_number}) expired on ${endDateText}.`,
    emailReminderType: 'expired',
    subscriptionEmailEnabled,
    subscriptionEmailSubject: cfgSubject,
  })
}

// GET /api/portal/subscriptions/stats - Get subscription stats
router.get('/stats', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  await ensureSubscriptionRecordsSchema()
  await syncExpiredSubscriptions()
  await notifyExpiringSubscriptions({ customerId })

  const query = `
    SELECT 
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN s.status = 'Active' THEN 1 ELSE 0 END), 0) as active,
      COALESCE(SUM(CASE WHEN s.status = 'Expiring Soon' THEN 1 ELSE 0 END), 0) as expiring_soon,
      COALESCE(SUM(CASE WHEN s.status = 'Expired' THEN 1 ELSE 0 END), 0) as expired,
      COALESCE(SUM(CASE WHEN s.status = 'Cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
      COALESCE(SUM(s.price), 0) as total_revenue
    FROM subscriptions s
    WHERE s.customer_id = $1
  `

  const results = await db.query(query, [customerId])
  res.json(results.rows[0] || {})
}))

// GET /api/portal/subscriptions - Get all subscriptions for customer
router.get('/', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  await ensureSubscriptionRecordsSchema()
  await syncExpiredSubscriptions()
  await notifyExpiringSubscriptions({ customerId })

  const query = `
    SELECT 
      s.id,
      s.customer_id,
      s.vehicle_id,
      COALESCE(s.package_id, s.subscription_service_id) as package_id,
      s.status,
      s.start_date,
      s.end_date,
      s.price as monthly_revenue,
      s.created_at,
      COALESCE(sp.name, s.subscription_name) as package_name,
      sp.description as package_description,
      COALESCE(sp.price, s.price) as package_price,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant
    FROM subscriptions s
    LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.package_id, s.subscription_service_id)
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.customer_id = $1
    ORDER BY s.created_at DESC
  `

  const subs = await db.query(query, [customerId])
  res.json(subs.rows || [])
}))

// PUT /api/portal/subscriptions/:id/cancel - Cancel a customer's active subscription
router.put('/:id/cancel', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  const id = Number(req.params.id)
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'Invalid subscription id.' })

  const { rows } = await db.query(
    `UPDATE subscriptions
     SET status = 'Cancelled',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND customer_id = $2
       AND COALESCE(status, 'Active') IN ('Active', 'Expiring Soon')
     RETURNING id, status, customer_id`,
    [id, customerId],
  )

  if (!rows.length) {
    const { rows: existingRows } = await db.query(
      'SELECT id, status FROM subscriptions WHERE id = $1 AND customer_id = $2 LIMIT 1',
      [id, customerId],
    )

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Subscription not found.' })
    }

    return res.status(409).json({
      message: `Subscription is already ${existingRows[0].status || 'inactive'} and cannot be cancelled.`,
    })
  }

  return res.json({ message: 'Subscription cancelled successfully.', subscription: rows[0] })
}))

// GET /api/portal/subscriptions/:id - Get specific subscription
router.get('/:id', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  const { id } = req.params
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  await ensureSubscriptionRecordsSchema()
  await syncExpiredSubscriptions()
  await notifyExpiringSubscriptions({ customerId })

  const query = `
    SELECT 
      s.*,
      COALESCE(sp.name, s.subscription_name) as package_name,
      sp.description as package_description,
      COALESCE(sp.price, s.price) as package_price,
      NULL::INT as mileage_interval,
      NULL::INT as months_interval,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant
    FROM subscriptions s
    LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.package_id, s.subscription_service_id)
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.id = $1 AND s.customer_id = $2
  `

  const results = await db.query(query, [id, customerId])
  if (!results.rows || results.rows.length === 0) {
    return res.status(404).json({ error: 'Subscription not found' })
  }

  res.json(results.rows[0])
}))

module.exports = router
