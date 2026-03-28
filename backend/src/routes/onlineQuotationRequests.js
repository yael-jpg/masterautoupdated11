const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// GET /api/online-quotation-requests
// List all requests with pagination and search
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || '1', 10))
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)))
    const offset = (page - 1) * limit
    const search = req.query.search ? `%${req.query.search}%` : null
    const status = req.query.status || null

    let query = `
      SELECT oqr.*, 
             s.code      AS service_code,
             s.name      AS service_name,
             s.category  AS service_category,
             s.base_price AS service_base_price
      FROM online_quotation_requests oqr
      LEFT JOIN services s ON s.id = oqr.service_id
      WHERE 1=1`
    const params = []

    // Default behavior: treat Archived as history and hide it unless explicitly requested.
    if (!status) {
      query += " AND COALESCE(LOWER(oqr.status), '') <> 'archived'"
    }

    if (status) {
      params.push(status)
      query += ` AND oqr.status = $${params.length}`
    }

    if (search) {
      params.push(search)
      query += ` AND (oqr.full_name ILIKE $${params.length} OR oqr.mobile ILIKE $${params.length} OR oqr.email ILIKE $${params.length} OR oqr.vehicle_plate ILIKE $${params.length})`
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)

    const { rows } = await db.query(query, params)

    // Count total
    let countQuery = 'SELECT COUNT(*) FROM online_quotation_requests WHERE 1=1'
    const countParams = []

    if (!status) {
      countQuery += " AND COALESCE(LOWER(status), '') <> 'archived'"
    }
    if (status) {
      countParams.push(status)
      countQuery += ' AND status = $1'
    }
    if (search) {
      countParams.push(search)
      countQuery += ` AND (full_name ILIKE $${countParams.length} OR mobile ILIKE $${countParams.length} OR email ILIKE $${countParams.length} OR vehicle_plate ILIKE $${countParams.length})`
    }
    const { rows: countRows } = await db.query(countQuery, countParams)
    const total = parseInt(countRows[0].count, 10)

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

// GET /api/online-quotation-requests/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rows } = await db.query(
      `SELECT oqr.*, 
              s.code AS service_code,
              s.name AS service_name,
              s.category AS service_category,
              s.base_price AS service_base_price
       FROM online_quotation_requests oqr
       LEFT JOIN services s ON s.id = oqr.service_id
       WHERE oqr.id = $1`,
      [id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Request not found' })
    res.json(rows[0])
  }),
)

// PATCH /api/online-quotation-requests/:id/status
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { status } = req.body
    if (!status) return res.status(400).json({ message: 'Status is required' })

    const { rows } = await db.query(
      'UPDATE online_quotation_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Request not found' })
    res.json(rows[0])
  }),
)

// DELETE /api/online-quotation-requests/:id
router.delete(
  '/:id',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rowCount } = await db.query('DELETE FROM online_quotation_requests WHERE id = $1', [id])
    if (!rowCount) return res.status(404).json({ message: 'Request not found' })
    res.json({ message: 'Request deleted' })
  }),
)

module.exports = router
