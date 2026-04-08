const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const NotificationService = require('../services/notificationService')
const { emitDataChanged } = require('../realtime/hub')

const router = express.Router()

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
    const autoName = Number.isFinite(cleanInterval) && cleanInterval > 0
      ? `${cleanInterval.toLocaleString('en-US')} KM PMS`
      : ''
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
    const autoName = Number.isFinite(cleanInterval) && cleanInterval > 0
      ? `${cleanInterval.toLocaleString('en-US')} KM PMS`
      : ''
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
