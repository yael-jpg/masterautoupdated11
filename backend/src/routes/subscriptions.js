const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const NotificationService = require('../services/notificationService')
const { emitDataChanged } = require('../realtime/hub')

const router = express.Router()

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
      `SELECT id, name, description, price, duration, services, status, created_at
       FROM subscription_packages
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC, id DESC`,
      params,
    )
    return res.json(rows)
  }),
)

router.post(
  '/',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    const { name, description, price, duration, services, status } = req.body || {}

    const cleanName = String(name || '').trim()
    const cleanDuration = String(duration || '').trim()
    const cleanPrice = Number(price)
    const cleanStatus = normalizeStatus(status)
    const cleanServices = normalizeServices(services)

    if (!cleanName || !cleanDuration || !Number.isFinite(cleanPrice) || cleanPrice < 0) {
      return res.status(400).json({ message: 'Package Name, Price, and Duration are required.' })
    }

    const { rows } = await db.query(
      `INSERT INTO subscription_packages (name, description, price, duration, services, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, name, description, price, duration, services, status, created_at`,
      [
        cleanName,
        description ? String(description).trim() : null,
        cleanPrice,
        cleanDuration,
        JSON.stringify(cleanServices),
        cleanStatus,
      ],
    )

    emitDataChanged({ scope: 'subscriptions', action: 'create', id: rows[0].id })
    await NotificationService.create({
      role: 'client',
      title: 'New Subscription Package',
      message: `Admin added ${rows[0].name}`,
      payload: { type: 'subscription', action: 'create', id: rows[0].id },
    }).catch(() => {})

    return res.status(201).json(rows[0])
  }),
)

router.put(
  '/:id',
  requireRole('SuperAdmin', 'Admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { name, description, price, duration, services, status } = req.body || {}

    const cleanName = String(name || '').trim()
    const cleanDuration = String(duration || '').trim()
    const cleanPrice = Number(price)
    const cleanStatus = normalizeStatus(status)
    const cleanServices = normalizeServices(services)

    if (!cleanName || !cleanDuration || !Number.isFinite(cleanPrice) || cleanPrice < 0) {
      return res.status(400).json({ message: 'Package Name, Price, and Duration are required.' })
    }

    const { rows } = await db.query(
      `UPDATE subscription_packages
       SET name = $1,
           description = $2,
           price = $3,
           duration = $4,
           services = $5::jsonb,
           status = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, name, description, price, duration, services, status, created_at`,
      [
        cleanName,
        description ? String(description).trim() : null,
        cleanPrice,
        cleanDuration,
        JSON.stringify(cleanServices),
        cleanStatus,
        id,
      ],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Subscription package not found' })
    }

    emitDataChanged({ scope: 'subscriptions', action: 'update', id: rows[0].id })
    await NotificationService.create({
      role: 'client',
      title: 'Subscription Package Updated',
      message: `Admin updated ${rows[0].name}`,
      payload: { type: 'subscription', action: 'update', id: rows[0].id },
    }).catch(() => {})

    return res.json(rows[0])
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
