const express = require('express')
const { body } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { validateRequest } = require('../middleware/validateRequest')

const router = express.Router()

// GET /vehicle-makes  — list all active makes, grouped by category, sorted
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, category, is_active, sort_order
       FROM vehicle_makes
       WHERE is_active = TRUE
       ORDER BY sort_order, name`,
    )
    res.json(rows)
  }),
)

// GET /vehicle-makes/:makeId/models  — models for a specific make
router.get(
  '/:makeId/models',
  asyncHandler(async (req, res) => {
    const { makeId } = req.params
    // Basic validation: ensure makeId looks like a number
    if (!makeId || Number.isNaN(Number(makeId))) {
      return res.status(400).json({ message: 'Invalid make id' })
    }
    // Verify the make exists
    const makeCheck = await db.query('SELECT id, name FROM vehicle_makes WHERE id = $1', [makeId])
    if (makeCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle make not found' })
    }
    try {
      // Some deployments may have an older schema without year_from/year_to.
      // Query information_schema to detect available columns and adapt the
      // SELECT list so the endpoint stays compatible.
      const cols = await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicle_models' AND column_name IN ('year_from','year_to','is_active')"
      )
      const colNames = cols.rows.map((r) => r.column_name)
      const hasYearFrom = colNames.includes('year_from')
      const hasYearTo = colNames.includes('year_to')
      const hasIsActive = colNames.includes('is_active')
      const selectFields = ['id', 'name']
      if (hasYearFrom) selectFields.push('year_from')
      if (hasYearTo) selectFields.push('year_to')
      if (hasIsActive) selectFields.push('is_active')

      const whereClause = hasIsActive ? 'WHERE make_id = $1 AND is_active = TRUE' : 'WHERE make_id = $1'
      const { rows } = await db.query(
        `SELECT ${selectFields.join(', ')}
         FROM vehicle_models
         ${whereClause}
         ORDER BY name`,
        [makeId],
      )
      return res.json(rows)
    } catch (err) {
      // If anything goes wrong (DB permissions, schema access, etc.),
      // fall back to a safe select that only requests the guaranteed columns.
      console.error('Error fetching vehicle models for make', makeId, err)
      const fallbackWhere = "WHERE make_id = $1"
      const { rows } = await db.query(
        `SELECT id, name
         FROM vehicle_models
         ${fallbackWhere}
         ORDER BY name`,
        [makeId],
      )
      return res.json(rows)
    }
  }),
)

// GET /vehicle-makes/models/:modelId/variants  — variants for a specific model
router.get(
  '/models/:modelId/variants',
  asyncHandler(async (req, res) => {
    const { modelId } = req.params
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
      console.error('Error fetching vehicle variants for model', modelId, err)
      const { rows } = await db.query(
        `SELECT id, name, fuel_type, transmission
         FROM vehicle_variants
         WHERE model_id = $1
         ORDER BY name`,
        [modelId],
      )
      return res.json(rows)
    }
  }),
)

// GET /vehicle-makes/variants/:variantId/years  — year models for a specific variant
router.get(
  '/variants/:variantId/years',
  asyncHandler(async (req, res) => {
    const { variantId } = req.params
    if (!variantId || Number.isNaN(Number(variantId))) {
      return res.status(400).json({ message: 'Invalid variant id' })
    }
    const { rows } = await db.query(
      `SELECT id, year_model
       FROM vehicle_years
       WHERE variant_id = $1 AND is_active = TRUE
       ORDER BY year_model DESC`,
      [variantId],
    )
    res.json(rows)
  }),
)

// ─── Admin endpoints (Admin/Manager only) ────────────────────────────────

// GET /vehicle-makes/admin  — ALL makes including inactive, for Settings
router.get(
  '/admin',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, category, country_origin, sort_order, is_active
       FROM vehicle_makes
       ORDER BY sort_order, name`,
    )
    res.json(rows)
  }),
)

// POST /vehicle-makes  — create a new make (SuperAdmin only)
router.post(
  '/',
  requireRole('SuperAdmin'),
  body('name').trim().notEmpty().withMessage('Make name is required'),
  body('category').trim().optional(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { name, category } = req.body
    const existing = await db.query('SELECT id FROM vehicle_makes WHERE LOWER(name) = LOWER($1)', [name])
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: `Make "${name}" already exists` })
    }
    const maxSort = await db.query('SELECT COALESCE(MAX(sort_order), 100) + 1 AS next FROM vehicle_makes')
    const { rows } = await db.query(
      `INSERT INTO vehicle_makes (name, category, sort_order, is_active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id, name, category, country_origin, sort_order, is_active`,
      [name, category || null, maxSort.rows[0].next],
    )
    res.status(201).json(rows[0])
  }),
)

// PATCH /vehicle-makes/:id  — toggle active or update make (SuperAdmin only)
router.patch(
  '/:id',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { is_active, name, category, sort_order } = req.body

    const existing = await db.query('SELECT * FROM vehicle_makes WHERE id = $1', [id])
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Make not found' })
    }

    const current = existing.rows[0]
    const { rows } = await db.query(
      `UPDATE vehicle_makes
       SET is_active   = $1,
           name        = $2,
           category    = $3,
           sort_order  = $4
       WHERE id = $5
       RETURNING id, name, category, sort_order, is_active`,
      [
        is_active   !== undefined ? is_active   : current.is_active,
        name        !== undefined ? name        : current.name,
        category    !== undefined ? category    : current.category,
        sort_order  !== undefined ? sort_order  : current.sort_order,
        id,
      ],
    )
    res.json(rows[0])
  }),
)

module.exports = router

