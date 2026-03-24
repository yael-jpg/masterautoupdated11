const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, code, name, category, base_price, description, materials_notes, is_active
       FROM services
       ORDER BY name ASC`,
    )
    res.json(rows)
  }),
)

router.post(
  '/',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { code, name, category, basePrice, description, materialsNotes } = req.body
    const { rows } = await db.query(
      `INSERT INTO services (code, name, category, base_price, description, materials_notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [code, name, category, basePrice, description, materialsNotes || null],
    )
    res.status(201).json(rows[0])
  }),
)

router.patch(
  '/:id',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { description, materialsNotes } = req.body || {}

    const sets = []
    const values = []
    let idx = 1

    if (description !== undefined) {
      sets.push(`description = $${idx++}`)
      values.push(description ? String(description) : null)
    }
    if (materialsNotes !== undefined) {
      sets.push(`materials_notes = $${idx++}`)
      values.push(materialsNotes ? String(materialsNotes) : null)
    }

    if (!sets.length) {
      return res.status(400).json({ message: 'No fields to update.' })
    }

    values.push(id)
    const { rows } = await db.query(
      `UPDATE services
       SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values,
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Service not found' })
    }

    return res.json(rows[0])
  }),
)

router.patch(
  '/:id/price',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { basePrice } = req.body

    const { rows } = await db.query(
      `UPDATE services
       SET base_price = $1
       WHERE id = $2
       RETURNING *`,
      [basePrice, id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Service not found' })
    }

    return res.json(rows[0])
  }),
)

module.exports = router

