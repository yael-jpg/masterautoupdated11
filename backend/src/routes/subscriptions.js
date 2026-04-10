const express = require('express')
const db = require('../config/db')
const env = require('../config/env')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const NotificationService = require('../services/notificationService')
const { sendSubscriptionConfirmationEmail } = require('../services/mailer')
const { emitDataChanged } = require('../realtime/hub')

const router = express.Router()

let pricingSchemaReady = false
let recordsSchemaReady = false

async function ensureSubscriptionPricingSchema() {
  if (pricingSchemaReady) return
  await db.query('ALTER TABLE subscription_packages ADD COLUMN IF NOT EXISTS price_by_frequency JSONB')
  pricingSchemaReady = true
}

async function ensureSubscriptionRecordsSchema() {
  if (recordsSchemaReady) return

  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_service_id INT')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS package_id INT')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS subscription_name TEXT')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS monthly_revenue DECIMAL(10,2)')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS frequency VARCHAR(20)')
  await db.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')

  await db.query(
    `UPDATE subscriptions s
     SET subscription_service_id = s.package_id
     WHERE s.subscription_service_id IS NULL
       AND s.package_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM subscription_services ss
         WHERE ss.id = s.package_id
       )`,
  )
  await db.query('UPDATE subscriptions SET package_id = subscription_service_id WHERE package_id IS NULL AND subscription_service_id IS NOT NULL')
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
     SET status = 'Expired'
     WHERE COALESCE(status, 'Active') IN ('Active', 'Expiring Soon')
       AND end_date IS NOT NULL
       AND end_date < CURRENT_TIMESTAMP`,
  )
}

async function notificationExists({ role, userId = null, subscriptionId, endDateKey }) {
  const { rows } = await db.query(
    `SELECT 1
     FROM notifications
     WHERE role = $1
       AND ((user_id IS NULL AND $2::int IS NULL) OR user_id = $2)
       AND COALESCE(payload->>'type', '') = 'subscription-expiring-5-days'
       AND COALESCE(payload->>'subscription_id', '') = $3
       AND COALESCE(payload->>'end_date', '') = $4
     LIMIT 1`,
    [role, userId, String(subscriptionId), endDateKey],
  )
  return rows.length > 0
}

async function notifyExpiringSubscriptions({ customerId = null } = {}) {
  await NotificationService.ensureTable()

  const params = []
  const where = [
    "COALESCE(s.status, 'Active') IN ('Active', 'Expiring Soon')",
    's.end_date IS NOT NULL',
    's.end_date >= CURRENT_TIMESTAMP',
    "s.end_date < (CURRENT_TIMESTAMP + INTERVAL '5 days')",
  ]

  if (customerId) {
    params.push(customerId)
    where.push(`s.customer_id = $${params.length}`)
  }

  const { rows } = await db.query(
    `SELECT
       s.id,
       s.customer_id,
       s.end_date,
       c.full_name AS customer_name,
       COALESCE(sp.name, s.subscription_name, 'Subscription') AS package_name,
       COALESCE(v.plate_number, 'N/A') AS plate_number
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN vehicles v ON v.id = s.vehicle_id
     LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.package_id, s.subscription_service_id)
     WHERE ${where.join(' AND ')}`,
    params,
  )

  for (const row of rows) {
    const endDate = row.end_date ? new Date(row.end_date) : null
    const endDateText = endDate && !Number.isNaN(endDate.getTime())
      ? endDate.toLocaleDateString('en-PH')
      : 'soon'
    const endDateKey = endDate ? endDate.toISOString().slice(0, 10) : 'unknown'

    const payload = {
      type: 'subscription-expiring-5-days',
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
    })

    if (!adminExists) {
      await NotificationService.create({
        role: 'admin',
        title: 'Subscription Expiring Soon',
        message: `${row.customer_name}'s subscription (${row.package_name}, ${row.plate_number}) expires on ${endDateText}.`,
        payload,
      }).catch(() => {})
    }

    const clientExists = await notificationExists({
      role: 'client',
      userId: row.customer_id,
      subscriptionId: row.id,
      endDateKey,
    })

    if (!clientExists) {
      await NotificationService.create({
        role: 'client',
        userId: row.customer_id,
        title: 'Subscription Reminder',
        message: `Your subscription (${row.package_name}, ${row.plate_number}) will expire on ${endDateText}.`,
        payload,
      }).catch(() => {})
    }
  }
}

function parseRequestPackageId(notes = '') {
  const m = String(notes || '').match(/Package\s*ID\s*:\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

function parseRequestFrequency(notes = '') {
  const m = String(notes || '').match(/Frequency\s*:\s*([^\n\r]+)/i)
  const raw = (m ? m[1] : '').trim().toLowerCase()
  if (raw === 'weekly') return 'Weekly'
  if (raw === 'annual' || raw === 'yearly') return 'Annual'
  return 'Monthly'
}

function parseRequestSelectedPrice(notes = '') {
  const m = String(notes || '').match(/Selected\s*price\s*:\s*₱?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i)
  if (!m) return null
  const n = Number(String(m[1]).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseRequestEndDate(notes = '') {
  const m = String(notes || '').match(/Subscription\s*end\s*:\s*([^\n\r]+)/i)
  if (!m) return null
  const d = new Date(m[1].trim())
  return Number.isNaN(d.getTime()) ? null : d
}

function computeEndDate(startDate, frequency) {
  const d = new Date(startDate)
  if (Number.isNaN(d.getTime())) return null
  const f = String(frequency || 'Monthly').toLowerCase()
  if (f === 'weekly') d.setDate(d.getDate() + 7)
  else if (f === 'annual') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

function parseFrequencyPrices(input = {}, fallbackPrice = 0) {
  const source = input && typeof input === 'object' ? input : {}

  const normalize = (value, fallback = null) => {
    if (value === undefined || value === null || value === '') return fallback
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const monthly = normalize(source.monthly, normalize(fallbackPrice, 0))
  return {
    weekly: normalize(source.weekly, 0),
    monthly: monthly == null ? 0 : monthly,
    annual: normalize(source.annual, 0),
  }
}

function coerceFrequencyPricesForWrite(input = {}) {
  const parsed = parseFrequencyPrices(input, 0)
  if (parsed.weekly == null || parsed.monthly == null || parsed.annual == null) return null
  return parsed
}

function formatPackageRow(row) {
  const frequencies = parseFrequencyPrices(row?.price_by_frequency, row?.price)
  return {
    ...row,
    price: frequencies.monthly,
    price_by_frequency: frequencies,
  }
}

function normalizeServices(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (item && typeof item === 'object') {
        return {
          id: Number(item.id) || null,
          name: String(item.name || '').trim(),
        }
      }
      const name = String(item || '').trim()
      return name ? { id: null, name } : null
    })
    .filter((item) => item && item.name)
}

function normalizeStatus(value) {
  if (value === false || String(value).toLowerCase() === 'inactive') return 'Inactive'
  return 'Active'
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await ensureSubscriptionPricingSchema()
    const statusParam = String(req.query?.status || '').trim().toLowerCase()
    const shouldFilterStatus = statusParam.length > 0
    const statusValue = statusParam === 'active' ? 'Active' : statusParam === 'inactive' ? 'Inactive' : null

    if (shouldFilterStatus && !statusValue) {
      return res.status(400).json({ message: 'Invalid status filter. Use status=active or status=inactive.' })
    }

    const where = []
    const params = []
    if (statusValue) {
      params.push(statusValue)
      where.push(`status = $${params.length}`)
    }

    const { rows } = await db.query(
      `SELECT id, name, description, price, price_by_frequency, duration, services, status, created_at
       FROM subscription_packages
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC`,
      params,
    )
    return res.json((rows || []).map(formatPackageRow))
  }),
)

router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const statusParam = String(req.query?.status || '').trim().toLowerCase()
    const where = ["a.notes ILIKE '%[PORTAL SUBSCRIPTION AVAIL REQUEST]%' "]
    const params = []

    if (statusParam) {
      params.push(statusParam)
      where.push(`LOWER(COALESCE(a.status, '')) = $${params.length}`)
    } else {
      // Default queue view: only pending portal requests.
      where.push(`LOWER(COALESCE(a.status, '')) = 'requested'`)
    }

    const { rows } = await db.query(
      `SELECT
         a.id AS appointment_id,
         a.status,
         a.schedule_start,
         a.schedule_end,
         a.created_at AS requested_at,
         a.notes,
         q.id AS quotation_id,
         q.quotation_no,
         c.id AS customer_id,
         c.full_name AS customer_name,
         c.mobile AS customer_mobile,
         v.id AS vehicle_id,
         v.plate_number,
         TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) AS vehicle_name
       FROM appointments a
       LEFT JOIN quotations q ON q.id = a.quotation_id
       JOIN customers c ON c.id = a.customer_id
       LEFT JOIN vehicles v ON v.id = a.vehicle_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 500`,
      params,
    )

    return res.json(rows)
  }),
)

router.get(
  '/entries',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensureSubscriptionRecordsSchema()
    await syncExpiredSubscriptions()
    await notifyExpiringSubscriptions()

    const statusParam = String(req.query?.status || '').trim().toLowerCase()
    const allowed = new Set(['active', 'expiring soon', 'expired', 'cancelled'])
    const where = ['1=1']
    const params = []

    if (statusParam) {
      if (!allowed.has(statusParam)) {
        return res.status(400).json({ message: 'Invalid status filter.' })
      }
      params.push(statusParam)
      where.push(`LOWER(COALESCE(s.status, '')) = $${params.length}`)
    }

    const { rows } = await db.query(
      `SELECT
         s.id,
         s.customer_id,
         s.vehicle_id,
         COALESCE(s.subscription_service_id, s.package_id) AS package_id,
         COALESCE(s.status, 'Active') AS status,
         s.start_date,
         s.end_date,
         COALESCE(s.price, s.monthly_revenue, 0) AS monthly_revenue,
         COALESCE(s.frequency, 'Monthly') AS frequency,
         s.created_at,
         c.full_name AS customer_name,
         c.mobile AS customer_mobile,
         v.plate_number,
         TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) AS vehicle_name,
         sp.name AS package_name
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       LEFT JOIN vehicles v ON v.id = s.vehicle_id
       LEFT JOIN subscription_packages sp ON sp.id = COALESCE(s.subscription_service_id, s.package_id)
       WHERE ${where.join(' AND ')}
       ORDER BY s.created_at DESC, s.id DESC`,
      params,
    )

    return res.json(rows)
  }),
)

router.post(
  '/requests/:appointmentId/approve',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensureSubscriptionRecordsSchema()
    await ensureSubscriptionPricingSchema()

    const appointmentId = Number(req.params.appointmentId)
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ message: 'Invalid appointment id.' })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: apptRows } = await client.query(
        `SELECT a.id, a.status, a.schedule_start, a.notes, a.customer_id, a.vehicle_id,
          a.quotation_id
         FROM appointments a
         WHERE a.id = $1
         FOR UPDATE`,
        [appointmentId],
      )

      if (!apptRows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ message: 'Subscription request appointment not found.' })
      }

      const appt = apptRows[0]
      let quotationNo = null
      if (appt.quotation_id) {
        const { rows: qRows } = await client.query(
          `SELECT quotation_no FROM quotations WHERE id = $1 LIMIT 1`,
          [appt.quotation_id],
        )
        quotationNo = qRows[0]?.quotation_no || null
      }
      const notes = String(appt.notes || '')
      if (!notes.includes('[PORTAL SUBSCRIPTION AVAIL REQUEST]')) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Appointment is not a subscription request.' })
      }

      const packageId = parseRequestPackageId(notes)
      if (!packageId) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Package ID is missing from request notes.' })
      }

      const { rows: packageRows } = await client.query(
        `SELECT id, name, price, price_by_frequency, status
         FROM subscription_packages
         WHERE id = $1
         LIMIT 1`,
        [packageId],
      )
      if (!packageRows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ message: 'Subscription package not found.' })
      }

      const pkg = packageRows[0]
      const packageStatus = String(pkg.status || 'Active')
      if (packageStatus !== 'Active') {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: 'Selected subscription package is not active.' })
      }

      const frequency = parseRequestFrequency(notes)
      const parsedPrice = parseRequestSelectedPrice(notes)
      const prices = parseFrequencyPrices(pkg.price_by_frequency, pkg.price)
      const fallbackPrice = frequency === 'Weekly'
        ? prices.weekly
        : frequency === 'Annual'
          ? prices.annual
          : prices.monthly
      const finalPrice = Number.isFinite(parsedPrice) ? parsedPrice : Number(fallbackPrice || 0)

      const startDate = appt.schedule_start ? new Date(appt.schedule_start) : new Date()
      const parsedEndDate = parseRequestEndDate(notes)
      const computedEndDate = parsedEndDate || computeEndDate(startDate, frequency)

      if (!computedEndDate || Number.isNaN(computedEndDate.getTime())) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Unable to compute subscription end date.' })
      }

      const { rows: duplicateRows } = await client.query(
        `SELECT id
         FROM subscriptions
         WHERE customer_id = $1
           AND vehicle_id = $2
           AND COALESCE(subscription_service_id, package_id) = $3
           AND COALESCE(status, 'Active') IN ('Active', 'Expiring Soon')
         LIMIT 1`,
        [appt.customer_id, appt.vehicle_id, packageId],
      )
      if (duplicateRows.length) {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: 'An active subscription already exists for this package and vehicle.' })
      }

      // Legacy schema may enforce FK on subscription_service_id to subscription_services.
      // Prefer package_id for portal package approvals and only set service_id when it exists.
      const { rows: legacyServiceRows } = await client.query(
        `SELECT id
         FROM subscription_services
         WHERE id = $1
         LIMIT 1`,
        [packageId],
      )
      const legacyServiceId = legacyServiceRows[0]?.id || null

      const { rows: createdRows } = await client.query(
        `INSERT INTO subscriptions (
           customer_id,
           vehicle_id,
           subscription_type,
           subscription_name,
           subscription_service_id,
           package_id,
           status,
           start_date,
           end_date,
           price,
           monthly_revenue,
           frequency,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'Active', $7::timestamp, $8::timestamp, $9, $9, $10, CURRENT_TIMESTAMP)
         RETURNING id, customer_id, vehicle_id, subscription_service_id, package_id, status, start_date, end_date, price, frequency, created_at`,
        [
          appt.customer_id,
          appt.vehicle_id,
          'Subscription',
          pkg.name,
          legacyServiceId,
          packageId,
          startDate.toISOString(),
          computedEndDate.toISOString(),
          finalPrice,
          frequency,
        ],
      )

      await client.query(
        `UPDATE appointments
         SET status = 'Confirmed'
         WHERE id = $1`,
        [appointmentId],
      )

      await client.query('COMMIT')

      const created = createdRows[0]

      emitDataChanged({ scope: 'subscriptions', action: 'approved', id: created.id, customerId: created.customer_id })
      emitDataChanged({ scope: 'appointments', action: 'subscription_request_approved', id: appointmentId, customerId: created.customer_id })

      await NotificationService.create({
        role: 'client',
        userId: created.customer_id,
        title: 'Subscription Update',
        message: `Your subscription request has been approved and is now active (${pkg.name}).`,
        payload: {
          type: 'subscription-request',
          action: 'approved',
          subscription_id: created.id,
          package_id: packageId,
          appointment_id: appointmentId,
          quotation_id: appt.quotation_id || null,
          quotation_no: quotationNo,
        },
      }).catch(() => {})

      const { rows: customerRows } = await db.query(
        `SELECT full_name, email
         FROM customers
         WHERE id = $1
         LIMIT 1`,
        [created.customer_id],
      )
      const customer = customerRows[0] || {}

      const { rows: vehicleRows } = await db.query(
        `SELECT plate_number
         FROM vehicles
         WHERE id = $1
         LIMIT 1`,
        [created.vehicle_id],
      )
      const vehicle = vehicleRows[0] || {}

      await sendSubscriptionConfirmationEmail({
        to: customer.email,
        customerName: customer.full_name,
        packageName: pkg.name,
        frequency,
        startDate: created.start_date,
        endDate: created.end_date,
        amount: created.price,
        plateNumber: vehicle.plate_number,
        ctaUrl: env.portalUrl || undefined,
      }).catch(() => {})

      return res.json({
        message: 'Subscription request approved and moved to Active subscriptions.',
        subscription: {
          ...created,
          customer_name: null,
          customer_mobile: null,
          plate_number: null,
          vehicle_name: null,
          package_name: pkg.name,
          monthly_revenue: created.price,
        },
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

router.post(
  '/',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensureSubscriptionPricingSchema()
    const { name, description, price, price_by_frequency, duration, services, status } = req.body || {}

    const cleanName = String(name || '').trim()
    const cleanDuration = String(duration || '').trim()
    const cleanFrequencyPrices = coerceFrequencyPricesForWrite(price_by_frequency)
    const cleanPrice = Number(cleanFrequencyPrices?.monthly ?? price)
    const cleanStatus = normalizeStatus(status)
    const cleanServices = normalizeServices(services)

    if (!cleanName || !cleanDuration || !Number.isFinite(cleanPrice) || cleanPrice < 0 || !cleanFrequencyPrices) {
      return res.status(400).json({ message: 'Package Name, Duration, and valid weekly/monthly/annual prices are required.' })
    }

    const { rows } = await db.query(
      `INSERT INTO subscription_packages (name, description, price, price_by_frequency, duration, services, status)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
       RETURNING id, name, description, price, price_by_frequency, duration, services, status, created_at`,
      [
        cleanName,
        description ? String(description).trim() : null,
        cleanPrice,
        JSON.stringify(cleanFrequencyPrices),
        cleanDuration,
        JSON.stringify(cleanServices),
        cleanStatus,
      ],
    )

    const row = formatPackageRow(rows[0])
    emitDataChanged({ scope: 'subscriptions', action: 'create', id: rows[0].id })
    await NotificationService.create({
      role: 'client',
      title: 'New Subscription Package',
      message: `Admin added ${row.name}`,
      payload: { type: 'subscription', action: 'create', id: row.id },
    }).catch(() => {})

    return res.status(201).json(row)
  }),
)

router.put(
  '/:id',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensureSubscriptionPricingSchema()
    const { id } = req.params
    const { name, description, price, price_by_frequency, duration, services, status } = req.body || {}

    const cleanName = String(name || '').trim()
    const cleanDuration = String(duration || '').trim()
    const cleanFrequencyPrices = coerceFrequencyPricesForWrite(price_by_frequency)
    const cleanPrice = Number(cleanFrequencyPrices?.monthly ?? price)
    const cleanStatus = normalizeStatus(status)
    const cleanServices = normalizeServices(services)

    if (!cleanName || !cleanDuration || !Number.isFinite(cleanPrice) || cleanPrice < 0 || !cleanFrequencyPrices) {
      return res.status(400).json({ message: 'Package Name, Duration, and valid weekly/monthly/annual prices are required.' })
    }

    const { rows } = await db.query(
      `UPDATE subscription_packages
       SET name = $1,
           description = $2,
           price = $3,
           price_by_frequency = $4::jsonb,
           duration = $5,
           services = $6::jsonb,
           status = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING id, name, description, price, price_by_frequency, duration, services, status, created_at`,
      [
        cleanName,
        description ? String(description).trim() : null,
        cleanPrice,
        JSON.stringify(cleanFrequencyPrices),
        cleanDuration,
        JSON.stringify(cleanServices),
        cleanStatus,
        id,
      ],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Subscription package not found' })
    }

    const row = formatPackageRow(rows[0])
    emitDataChanged({ scope: 'subscriptions', action: 'update', id: row.id })
    await NotificationService.create({
      role: 'client',
      title: 'Subscription Package Updated',
      message: `Admin updated ${row.name}`,
      payload: { type: 'subscription', action: 'update', id: row.id },
    }).catch(() => {})

    return res.json(row)
  }),
)

router.delete(
  '/:id',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rows: existing } = await db.query('SELECT id, name FROM subscription_packages WHERE id = $1', [id])
    const { rowCount } = await db.query('DELETE FROM subscription_packages WHERE id = $1', [id])

    if (!rowCount) {
      return res.status(404).json({ message: 'Subscription package not found' })
    }

    emitDataChanged({ scope: 'subscriptions', action: 'delete', id: Number(id) || null })
    await NotificationService.create({
      role: 'client',
      title: 'Subscription Package Removed',
      message: `Admin removed ${existing[0]?.name || 'a subscription package'}`,
      payload: { type: 'subscription', action: 'delete', id: Number(id) || null },
    }).catch(() => {})

    return res.status(204).send()
  }),
)

module.exports = router
