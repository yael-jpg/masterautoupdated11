/**
 * /api/portal/pms/* — Customer PMS (Preventive Maintenance Service) routes
 */

const express = require('express')
const { asyncHandler } = require('../utils/asyncHandler')
const db = require('../config/db')
const env = require('../config/env')
const ConfigurationService = require('../services/configurationService')
const NotificationService = require('../services/notificationService')
const { sendPmsReminderEmail } = require('../services/mailer')

const router = express.Router()
let pmsEmailConfigReady = false

async function ensurePmsEmailConfigDefaults() {
  if (pmsEmailConfigReady) return

  await ConfigurationService.ensureDefaults([
    {
      category: 'pms_email',
      key: 'enabled',
      value: 'true',
      dataType: 'boolean',
      description: 'Enable automatic PMS reminder emails.',
    },
    {
      category: 'pms_email',
      key: 'subject',
      value: '',
      dataType: 'string',
      description: 'Custom subject for PMS reminder emails. Supports {plate_number}, {package_name}, {kilometer_interval}.',
    },
    {
      category: 'pms_email',
      key: 'greeting',
      value: '',
      dataType: 'string',
      description: 'Custom opening message for PMS reminder emails. Supports {plate_number}, {package_name}, {kilometer_interval}.',
    },
  ]).catch(() => {})

  pmsEmailConfigReady = true
}

async function pmsReminderExists({ role, userId = null, appointmentId, dueDateKey, reason }) {
  const { rows } = await db.query(
    `SELECT 1
     FROM notifications
     WHERE role = $1
       AND ((user_id IS NULL AND $2::int IS NULL) OR user_id = $2)
       AND COALESCE(payload->>'type', '') = 'pms-service-reminder'
       AND COALESCE(payload->>'appointment_id', '') = $3
       AND COALESCE(payload->>'due_date', '') = $4
       AND COALESCE(payload->>'reason', '') = $5
     LIMIT 1`,
    [role, userId, String(appointmentId), dueDateKey, reason],
  )
  return rows.length > 0
}

async function notifyPmsServiceReminders({ customerId = null } = {}) {
  await NotificationService.ensureTable()
  await ensurePmsEmailConfigDefaults()

  const [cfgEnabled, cfgSubject, cfgGreeting] = await Promise.all([
    ConfigurationService.get('pms_email', 'enabled').catch(() => null),
    ConfigurationService.get('pms_email', 'subject').catch(() => null),
    ConfigurationService.get('pms_email', 'greeting').catch(() => null),
  ])
  const pmsEmailEnabled = String(cfgEnabled).toLowerCase() !== 'false'

  const params = []
  const where = [
    "a.notes ILIKE '%[PORTAL PMS AVAIL REQUEST]%'",
    "LOWER(COALESCE(a.status, '')) = 'completed'",
  ]

  if (customerId) {
    params.push(customerId)
    where.push(`a.customer_id = $${params.length}`)
  }

  const { rows } = await db.query(
    `SELECT
       a.id,
       a.customer_id,
       a.vehicle_id,
       c.full_name AS customer_name,
      c.email AS customer_email,
       COALESCE(v.plate_number, 'N/A') AS plate_number,
       COALESCE(v.odometer, 0) AS vehicle_odometer,
       COALESCE(
         sv.name,
         NULLIF(BTRIM(SUBSTRING(a.notes FROM 'Package:\\s*([^\\n\\r]+)')), ''),
         'PMS Service'
       ) AS package_name,
       COALESCE(pp.kilometer_interval, pp.odometer_interval, pp.mileage_interval, pp.interval_value) AS kilometer_interval,
       vsr_last.odometer_reading AS last_service_odometer,
       COALESCE(a.schedule_end, a.schedule_start, a.created_at) AS completed_at
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     LEFT JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN services sv ON sv.id = a.service_id
     LEFT JOIN LATERAL (
       SELECT vsr.odometer_reading
       FROM vehicle_service_records vsr
       WHERE vsr.vehicle_id = a.vehicle_id
         AND vsr.odometer_reading IS NOT NULL
         AND vsr.service_date <= COALESCE(a.schedule_end, a.schedule_start, a.created_at)
       ORDER BY vsr.service_date DESC
       LIMIT 1
     ) vsr_last ON TRUE
     LEFT JOIN pms_packages pp
       ON LOWER(BTRIM(pp.name)) = LOWER(BTRIM(COALESCE(sv.name, SUBSTRING(a.notes FROM 'Package:\\s*([^\\n\\r]+)'))))
      AND COALESCE(pp.is_deleted, false) = false
     WHERE ${where.join(' AND ')}`,
    params,
  )

  for (const row of rows) {
    const completedAt = row.completed_at ? new Date(row.completed_at) : null
    if (!completedAt || Number.isNaN(completedAt.getTime())) continue

    const timeDueAt = new Date(completedAt)
    timeDueAt.setMonth(timeDueAt.getMonth() + 6)

    const kmInterval = Number(row.kilometer_interval)
    const currentOdometer = Number(row.vehicle_odometer)
    const lastServiceOdometer = Number(row.last_service_odometer)

    const dueByTime = timeDueAt <= new Date()
    const dueByMileage = Number.isFinite(kmInterval) && kmInterval > 0 && Number.isFinite(currentOdometer)
      && (
        (Number.isFinite(lastServiceOdometer) && (currentOdometer - lastServiceOdometer) >= kmInterval)
        || (!Number.isFinite(lastServiceOdometer) && currentOdometer >= kmInterval)
      )

    if (!dueByTime && !dueByMileage) continue

    const reason = dueByMileage ? 'km_or_time' : 'time'
    const dueDateKey = timeDueAt.toISOString().slice(0, 10)
    const dueDateText = timeDueAt.toLocaleDateString('en-PH')

    const mileageLine = dueByMileage && Number.isFinite(kmInterval) && kmInterval > 0
      ? ` Vehicle mileage is ${currentOdometer.toLocaleString('en-US')} km (target ${kmInterval.toLocaleString('en-US')} km${Number.isFinite(lastServiceOdometer) ? ` since last reading ${lastServiceOdometer.toLocaleString('en-US')} km` : ''}).`
      : ''

    const payload = {
      type: 'pms-service-reminder',
      appointment_id: row.id,
      customer_id: row.customer_id,
      vehicle_id: row.vehicle_id,
      package_name: row.package_name,
      plate_number: row.plate_number,
      due_date: dueDateKey,
      reason,
      kilometer_interval: Number.isFinite(kmInterval) && kmInterval > 0 ? kmInterval : null,
      last_service_odometer: Number.isFinite(lastServiceOdometer) ? lastServiceOdometer : null,
      current_odometer: Number.isFinite(currentOdometer) ? currentOdometer : null,
    }

    const adminExists = await pmsReminderExists({
      role: 'admin',
      userId: null,
      appointmentId: row.id,
      dueDateKey,
      reason,
    })

    if (!adminExists) {
      await NotificationService.create({
        role: 'admin',
        title: 'PMS Service Reminder',
        message: `${row.customer_name}'s vehicle (${row.plate_number}) is due for PMS follow-up after 6 months (due ${dueDateText}).${mileageLine}`,
        payload,
      }).catch(() => {})
    }

    const clientExists = await pmsReminderExists({
      role: 'client',
      userId: row.customer_id,
      appointmentId: row.id,
      dueDateKey,
      reason,
    })

    if (!clientExists) {
      await NotificationService.create({
        role: 'client',
        userId: row.customer_id,
        title: 'PMS Reminder',
        message: `Your vehicle (${row.plate_number}) is due for your next PMS service. Your last PMS reached the 6-month interval on ${dueDateText}.${mileageLine}`,
        payload,
      }).catch(() => {})

      if (pmsEmailEnabled) {
        await sendPmsReminderEmail({
          to: row.customer_email,
          customerName: row.customer_name,
          packageName: row.package_name,
          plateNumber: row.plate_number,
          dueDate: timeDueAt,
          reason,
          kilometerInterval: Number.isFinite(kmInterval) && kmInterval > 0 ? kmInterval : null,
          currentOdometer: Number.isFinite(currentOdometer) ? currentOdometer : null,
          lastServiceOdometer: Number.isFinite(lastServiceOdometer) ? lastServiceOdometer : null,
          ctaUrl: env.portalUrl || undefined,
          configSubject: cfgSubject || undefined,
          configGreeting: cfgGreeting || undefined,
        }).catch(() => {})
      }
    }
  }
}

// GET /api/portal/pms/packages - Get all available PMS packages
router.get('/packages', asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      id,
      name,
      description,
      price,
      odometer_interval as mileage_interval,
      CASE WHEN LOWER(COALESCE(interval_unit, '')) IN ('month', 'months') THEN interval_value ELSE NULL END as months_interval,
      created_at
    FROM pms_packages
    ORDER BY name ASC
  `

  const packages = await db.query(query, [])
  res.json(packages.rows || [])
}))

// GET /api/portal/pms/tracking - Get PMS service tracking for customer
router.get('/tracking', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  await notifyPmsServiceReminders({ customerId })

  const query = `
    SELECT 
      a.id,
      NULL::INT as subscription_id,
      COALESCE(a.status, 'Due') as status,
      a.schedule_start as due_date,
      CASE WHEN COALESCE(a.status, '') = 'Completed' THEN a.schedule_end ELSE NULL END as completed_date,
      a.notes,
      a.created_at,
      a.vehicle_id,
      NULL::INT as package_id,
      COALESCE(sv.name, SUBSTRING(a.notes FROM 'Package:\\s*([^\\n\\r]+)'), 'PMS Service') as package_name,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant
    FROM appointments a
    LEFT JOIN services sv ON sv.id = a.service_id
    LEFT JOIN vehicles v ON v.id = a.vehicle_id
    WHERE a.customer_id = $1
      AND a.notes ILIKE '%[PORTAL PMS AVAIL REQUEST]%'
      AND LOWER(COALESCE(a.status, '')) <> 'requested'
      AND LOWER(COALESCE(a.status, '')) <> 'cancelled'
    ORDER BY a.schedule_start ASC, a.created_at ASC
  `

  const tracking = await db.query(query, [customerId])
  res.json(tracking.rows || [])
}))

// GET /api/portal/pms/stats - Get PMS stats for customer
router.get('/stats', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  await notifyPmsServiceReminders({ customerId })

  const query = `
    SELECT 
      COALESCE(SUM(CASE WHEN COALESCE(a.status, '') = 'Due' THEN 1 ELSE 0 END), 0) as due_count,
      COALESCE(SUM(CASE WHEN COALESCE(a.status, '') = 'In Progress' THEN 1 ELSE 0 END), 0) as in_progress_count,
      COALESCE(SUM(CASE WHEN COALESCE(a.status, '') = 'Completed' THEN 1 ELSE 0 END), 0) as completed_count,
      COALESCE(SUM(CASE WHEN COALESCE(a.status, '') = 'Due' AND a.schedule_start <= CURRENT_DATE + INTERVAL '7 days' THEN 1 ELSE 0 END), 0) as due_this_week
    FROM appointments a
    WHERE a.customer_id = $1
      AND a.notes ILIKE '%[PORTAL PMS AVAIL REQUEST]%'
      AND LOWER(COALESCE(a.status, '')) <> 'requested'
      AND LOWER(COALESCE(a.status, '')) <> 'cancelled'
  `

  const results = await db.query(query, [customerId])
  res.json(results.rows[0] || {})
}))

// GET /api/portal/pms/subscriptions - Get customer's PMS subscriptions
router.get('/subscriptions', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      s.id,
      s.vehicle_id,
      s.subscription_service_id as package_id,
      s.status,
      s.start_date,
      s.end_date,
      pp.name as package_name,
      pp.description as package_description,
      pp.price as package_price,
      pp.odometer_interval as mileage_interval,
      CASE WHEN LOWER(COALESCE(pp.interval_unit, '')) IN ('month', 'months') THEN pp.interval_value ELSE NULL END as months_interval,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant,
      COUNT(pst.id) as total_services,
      COALESCE(SUM(CASE WHEN pst.status = 'Completed' THEN 1 ELSE 0 END), 0) as completed_services,
      COALESCE(SUM(CASE WHEN pst.status = 'Due' THEN 1 ELSE 0 END), 0) as due_services
    FROM subscriptions s
    LEFT JOIN pms_packages pp ON s.subscription_service_id = pp.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    LEFT JOIN pms_service_tracking pst ON s.id = pst.subscription_id
    WHERE s.customer_id = $1
    GROUP BY s.id, pp.name, pp.description, pp.price, pp.odometer_interval, pp.interval_unit, pp.interval_value, v.plate_number, v.make, v.model, v.variant
    ORDER BY s.created_at DESC
  `

  const subs = await db.query(query, [customerId])
  res.json(subs.rows || [])
}))

module.exports = router
