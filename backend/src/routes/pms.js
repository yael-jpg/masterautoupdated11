const express = require('express')
const db = require('../config/db')
const env = require('../config/env')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const ConfigurationService = require('../services/configurationService')
const NotificationService = require('../services/notificationService')
const { sendPmsReminderEmail } = require('../services/mailer')
const { emitDataChanged } = require('../realtime/hub')

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

const PMS_TIER_LABEL_BY_KM = {
  5000: 'Basic PMS',
  10000: 'Standard PMS',
  20000: 'Advanced PMS',
  40000: 'Major PMS',
  50000: 'Premium PMS',
}

function getPmsTierLabel(kmValue) {
  const km = Number(kmValue)
  if (!Number.isFinite(km) || km <= 0) return 'Custom PMS'
  return PMS_TIER_LABEL_BY_KM[km] || 'Custom PMS'
}

function formatPmsAutoName(kmValue) {
  const km = Number(kmValue)
  if (!Number.isFinite(km) || km <= 0) return ''
  return `${getPmsTierLabel(km)} - ${km.toLocaleString('en-US')} KM`
}

async function ensurePmsSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pms_packages (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      kilometer_interval INT,
      description TEXT,
      services JSONB NOT NULL DEFAULT '[]'::jsonb,
      estimated_price DECIMAL(10,2),
      price DECIMAL(10,2),
      mileage_interval INT,
      odometer_interval INT,
      interval_unit VARCHAR(20),
      interval_value INT,
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      is_deleted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    ALTER TABLE pms_packages
      ADD COLUMN IF NOT EXISTS kilometer_interval INT,
      ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS estimated_price DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS price DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS mileage_interval INT,
      ADD COLUMN IF NOT EXISTS odometer_interval INT,
      ADD COLUMN IF NOT EXISTS interval_unit VARCHAR(20),
      ADD COLUMN IF NOT EXISTS interval_value INT,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active',
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  `)

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pms_packages' AND column_name = 'mileage_interval'
      ) THEN
        EXECUTE 'UPDATE pms_packages SET kilometer_interval = mileage_interval WHERE kilometer_interval IS NULL AND mileage_interval IS NOT NULL';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pms_packages' AND column_name = 'odometer_interval'
      ) THEN
        EXECUTE 'UPDATE pms_packages SET kilometer_interval = odometer_interval WHERE kilometer_interval IS NULL AND odometer_interval IS NOT NULL';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pms_packages' AND column_name = 'interval_value'
      ) THEN
        EXECUTE 'UPDATE pms_packages SET kilometer_interval = interval_value WHERE kilometer_interval IS NULL AND interval_value IS NOT NULL';
      END IF;
    END $$;
  `)

  await db.query(`UPDATE pms_packages SET mileage_interval = kilometer_interval WHERE mileage_interval IS NULL AND kilometer_interval IS NOT NULL`)
  await db.query(`UPDATE pms_packages SET odometer_interval = kilometer_interval WHERE odometer_interval IS NULL AND kilometer_interval IS NOT NULL`)
  await db.query(`UPDATE pms_packages SET interval_value = kilometer_interval WHERE interval_value IS NULL AND kilometer_interval IS NOT NULL`)
  await db.query(`UPDATE pms_packages SET price = estimated_price WHERE price IS NULL AND estimated_price IS NOT NULL`)
  await db.query(`UPDATE pms_packages SET estimated_price = price WHERE estimated_price IS NULL AND price IS NOT NULL`)

  // One-time, idempotent cleanup: normalize legacy auto-generated names to tier-based labels.
  await db.query(`
    UPDATE pms_packages
    SET name =
      CASE kilometer_interval
        WHEN 5000 THEN 'Basic PMS'
        WHEN 10000 THEN 'Standard PMS'
        WHEN 20000 THEN 'Advanced PMS'
        WHEN 40000 THEN 'Major PMS'
        WHEN 50000 THEN 'Premium PMS'
        ELSE 'Custom PMS'
      END || ' - ' || TO_CHAR(kilometer_interval, 'FM999,999,999') || ' KM'
    WHERE kilometer_interval IS NOT NULL
      AND (
        name IS NULL
        OR BTRIM(name) = ''
        OR name ~* '(kilometer\\s*pms|km\\s*pms)$'
      )
  `)
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

router.get(
  '/requests',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    const statusParam = String(req.query?.status || '').trim().toLowerCase()
    const where = ["a.notes ILIKE '%[PORTAL PMS AVAIL REQUEST]%' "]
    const params = []

    if (statusParam) {
      params.push(statusParam)
      where.push(`LOWER(COALESCE(a.status, '')) = $${params.length}`)
    } else {
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

router.post(
  '/requests/:appointmentId/approve',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    const appointmentId = Number(req.params.appointmentId)
    if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ message: 'Invalid appointment id.' })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      const { rows: apptRows } = await client.query(
        `SELECT id, status, notes, customer_id, vehicle_id, quotation_id
         FROM appointments
         WHERE id = $1
         FOR UPDATE`,
        [appointmentId],
      )

      if (!apptRows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ message: 'PMS request appointment not found.' })
      }

      const appt = apptRows[0]
      const notes = String(appt.notes || '')
      if (!notes.includes('[PORTAL PMS AVAIL REQUEST]')) {
        await client.query('ROLLBACK')
        return res.status(400).json({ message: 'Appointment is not a PMS request.' })
      }

      await client.query(
        `UPDATE appointments
         SET status = 'In Progress'
         WHERE id = $1`,
        [appointmentId],
      )

      await client.query('COMMIT')

      emitDataChanged({ scope: 'appointments', action: 'pms_request_approved', id: appointmentId, customerId: appt.customer_id })

      await NotificationService.create({
        role: 'client',
        userId: appt.customer_id,
        title: 'PMS Request Update',
        message: 'Your PMS request has been approved and is now in progress.',
        payload: {
          type: 'pms-request',
          action: 'approved',
          appointment_id: appointmentId,
          quotation_id: appt.quotation_id || null,
        },
      }).catch(() => {})

      return res.json({
        message: 'PMS request approved and moved to Service Tracking (In Progress).',
        appointmentId,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

router.get(
  '/tracking',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await notifyPmsServiceReminders()

    const { rows } = await db.query(
      `SELECT
         a.id,
         a.customer_id,
         a.vehicle_id,
         a.schedule_start AS due_date,
         a.status,
         a.notes,
         a.created_at,
         c.full_name AS customer_name,
         c.mobile AS customer_mobile,
         v.plate_number,
         TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) AS vehicle_name,
         COALESCE(sv.name, SUBSTRING(a.notes FROM 'Package:\\s*([^\\n\\r]+)'), 'PMS Service') AS package_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       LEFT JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN services sv ON sv.id = a.service_id
       WHERE a.notes ILIKE '%[PORTAL PMS AVAIL REQUEST]%'
         AND LOWER(COALESCE(a.status, '')) <> 'requested'
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 500`,
    )

    return res.json(rows)
  }),
)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await ensurePmsSchema()
    const statusParam = String(req.query?.status || '').trim().toLowerCase()
    const shouldFilterStatus = statusParam.length > 0
    const statusValue = statusParam === 'active' ? 'Active' : statusParam === 'inactive' ? 'Inactive' : null

    if (shouldFilterStatus && !statusValue) {
      return res.status(400).json({ message: 'Invalid status filter. Use status=active or status=inactive.' })
    }

    const where = ['COALESCE(is_deleted, false) = false']
    const params = []
    if (statusValue) {
      params.push(statusValue)
      where.push(`status = $${params.length}`)
    }

    const { rows } = await db.query(
      `SELECT id,
              name,
              kilometer_interval,
              description,
              services,
              estimated_price,
              status,
              created_at,
              updated_at
       FROM pms_packages
       WHERE ${where.join(' AND ')}
       ORDER BY kilometer_interval ASC, id ASC`,
      params,
    )
    return res.json(rows)
  }),
)

router.post(
  '/',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensurePmsSchema()
    const { name, kilometer_interval, description, services, estimated_price, status } = req.body || {}

    const cleanInterval = Number(kilometer_interval)
    const cleanName = String(name || '').trim()
    const autoName = formatPmsAutoName(cleanInterval)
    const finalName = cleanName || autoName
    const cleanStatus = normalizeStatus(status)
    const cleanServices = normalizeServices(services)

    let cleanPrice = null
    if (estimated_price !== undefined && estimated_price !== null && String(estimated_price).trim() !== '') {
      cleanPrice = Number(estimated_price)
      if (!Number.isFinite(cleanPrice) || cleanPrice < 0) {
        return res.status(400).json({ message: 'Estimated Price must be a valid non-negative number.' })
      }
    }

    if (!finalName || !Number.isFinite(cleanInterval) || cleanInterval <= 0) {
      return res.status(400).json({ message: 'Package Name and Kilometer Interval are required.' })
    }

    const duplicate = await db.query(
      `SELECT id FROM pms_packages
       WHERE kilometer_interval = $1
         AND COALESCE(is_deleted, false) = false
       LIMIT 1`,
      [cleanInterval],
    )
    if (duplicate.rows.length) {
      return res.status(409).json({ message: 'A PMS package with this kilometer interval already exists.' })
    }

    const { rows } = await db.query(
      `INSERT INTO pms_packages (
         name,
         kilometer_interval,
         description,
         services,
         estimated_price,
         price,
         mileage_interval,
         odometer_interval,
         status
       )
       VALUES ($1, $2, $3, $4::jsonb, $5, $5, $2, $2, $6)
       RETURNING id,
                 name,
                 kilometer_interval,
                 description,
                 services,
                 estimated_price,
                 status,
                 created_at,
                 updated_at`,
      [
        finalName,
        cleanInterval,
        description ? String(description).trim() : null,
        JSON.stringify(cleanServices),
        cleanPrice,
        cleanStatus,
      ],
    )

    emitDataChanged({ scope: 'pms', action: 'create', id: rows[0].id })
    await NotificationService.create({
      role: 'client',
      title: 'New PMS Package',
      message: `Admin added ${rows[0].name}`,
      payload: { type: 'pms', action: 'create', id: rows[0].id },
    }).catch(() => {})

    return res.status(201).json(rows[0])
  }),
)

router.put(
  '/:id',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensurePmsSchema()
    const { id } = req.params
    const { name, kilometer_interval, description, services, estimated_price, status } = req.body || {}

    const cleanInterval = Number(kilometer_interval)
    const cleanName = String(name || '').trim()
    const autoName = formatPmsAutoName(cleanInterval)
    const finalName = cleanName || autoName
    const cleanStatus = normalizeStatus(status)
    const cleanServices = normalizeServices(services)

    let cleanPrice = null
    if (estimated_price !== undefined && estimated_price !== null && String(estimated_price).trim() !== '') {
      cleanPrice = Number(estimated_price)
      if (!Number.isFinite(cleanPrice) || cleanPrice < 0) {
        return res.status(400).json({ message: 'Estimated Price must be a valid non-negative number.' })
      }
    }

    if (!finalName || !Number.isFinite(cleanInterval) || cleanInterval <= 0) {
      return res.status(400).json({ message: 'Package Name and Kilometer Interval are required.' })
    }

    const duplicate = await db.query(
      `SELECT id FROM pms_packages
       WHERE kilometer_interval = $1
         AND id <> $2
         AND COALESCE(is_deleted, false) = false
       LIMIT 1`,
      [cleanInterval, id],
    )
    if (duplicate.rows.length) {
      return res.status(409).json({ message: 'A PMS package with this kilometer interval already exists.' })
    }

    const { rows } = await db.query(
      `UPDATE pms_packages
       SET name = $1,
           kilometer_interval = $2,
           description = $3,
           services = $4::jsonb,
           estimated_price = $5,
         price = $5,
         mileage_interval = $2,
         odometer_interval = $2,
           status = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
         AND COALESCE(is_deleted, false) = false
       RETURNING id,
                 name,
                 kilometer_interval,
                 description,
                 services,
                 estimated_price,
                 status,
                 created_at,
                 updated_at`,
      [
        finalName,
        cleanInterval,
        description ? String(description).trim() : null,
        JSON.stringify(cleanServices),
        cleanPrice,
        cleanStatus,
        id,
      ],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'PMS package not found' })
    }

    emitDataChanged({ scope: 'pms', action: 'update', id: rows[0].id })
    await NotificationService.create({
      role: 'client',
      title: 'PMS Package Updated',
      message: `Admin updated ${rows[0].name}`,
      payload: { type: 'pms', action: 'update', id: rows[0].id },
    }).catch(() => {})

    return res.json(rows[0])
  }),
)

router.delete(
  '/:id',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    await ensurePmsSchema()
    const { id } = req.params
    const { rows: existing } = await db.query(
      `SELECT id, name FROM pms_packages WHERE id = $1 AND COALESCE(is_deleted, false) = false`,
      [id],
    )
    const { rowCount } = await db.query(
      `UPDATE pms_packages
       SET is_deleted = true,
           status = 'Inactive',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND COALESCE(is_deleted, false) = false`,
      [id],
    )

    if (!rowCount) {
      return res.status(404).json({ message: 'PMS package not found' })
    }

    emitDataChanged({ scope: 'pms', action: 'delete', id: Number(id) || null })
    await NotificationService.create({
      role: 'client',
      title: 'PMS Package Removed',
      message: `Admin removed ${existing[0]?.name || 'a PMS package'}`,
      payload: { type: 'pms', action: 'delete', id: Number(id) || null },
    }).catch(() => {})

    return res.status(204).send()
  }),
)

module.exports = router
