const express = require('express')
const { body, param, query } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')

const router = express.Router()

// ── GET /inventory ─────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const category = String(req.query.category || '').trim()
    const stockStatus = String(req.query.stockStatus || '').trim()
    const page  = Math.max(Number(req.query.page  || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200)
    const offset = (page - 1) * limit

    const conditions = ['i.is_active = TRUE']
    const values = []
    let idx = 1

    if (search) {
      conditions.push(`(LOWER(i.sku) LIKE $${idx} OR LOWER(i.name) LIKE $${idx} OR LOWER(i.supplier_ref) LIKE $${idx})`)
      values.push(`%${search}%`)
      idx++
    }
    if (category) {
      conditions.push(`i.category = $${idx}`)
      values.push(category)
      idx++
    }
    if (stockStatus === 'LOW_STOCK') {
      conditions.push(`i.qty_on_hand <= i.qty_minimum`)
    } else if (stockStatus === 'OUT_OF_STOCK') {
      conditions.push(`i.qty_on_hand <= 0`)
    } else if (stockStatus === 'IN_STOCK') {
      conditions.push(`i.qty_on_hand > i.qty_minimum`)
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const { rows } = await db.query(
      `SELECT i.*,
              CASE
                WHEN i.qty_on_hand <= 0             THEN 'OUT_OF_STOCK'
                WHEN i.qty_on_hand <= i.qty_minimum THEN 'LOW_STOCK'
                ELSE 'IN_STOCK'
              END AS stock_status
       FROM inventory_items i
       ${where}
       ORDER BY i.name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    )

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM inventory_items i ${where}`,
      values,
    )

    res.json({
      data: rows,
      pagination: { page, limit, total: countRows[0].total, totalPages: Math.max(Math.ceil(countRows[0].total / limit), 1) },
    })
  }),
)

// ── GET /inventory/low-stock ───────────────────────────────────────────────
router.get(
  '/low-stock',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT *, CASE WHEN qty_on_hand <= 0 THEN 'OUT_OF_STOCK' ELSE 'LOW_STOCK' END AS stock_status
       FROM inventory_items
       WHERE qty_on_hand <= qty_minimum AND is_active = TRUE
       ORDER BY qty_on_hand ASC`,
    )
    res.json(rows)
  }),
)

// ── GET /inventory/categories ─────────────────────────────────────────────
router.get(
  '/categories',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT DISTINCT category FROM inventory_items WHERE category IS NOT NULL AND is_active = TRUE ORDER BY category`,
    )
    res.json(rows.map(r => r.category))
  }),
)

// ── GET /inventory/releases ───────────────────────────────────────────────
router.get(
  '/releases',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200)
    const offset = (page - 1) * limit

    const { rows } = await db.query(
      `SELECT m.*, i.name as item_name, i.category as item_category, jo.job_order_no
       FROM inventory_movements m
       JOIN inventory_items i ON m.item_id = i.id
       LEFT JOIN job_orders jo ON m.job_order_id = jo.id
       WHERE m.movement_type = 'OUT'
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM inventory_movements WHERE movement_type = 'OUT'`
    )

    res.json({
      data: rows,
      pagination: { 
        page, 
        limit, 
        total: countRows[0].total, 
        totalPages: Math.max(Math.ceil(countRows[0].total / limit), 1) 
      }
    })
  })
)

// ── GET /inventory/adds ───────────────────────────────────────────────────
router.get(
  '/adds',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200)
    const offset = (page - 1) * limit

    const { rows } = await db.query(
      `SELECT m.*, i.name as item_name, i.category as item_category
       FROM inventory_movements m
       JOIN inventory_items i ON m.item_id = i.id
       WHERE m.movement_type = 'IN'
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM inventory_movements WHERE movement_type = 'IN'`
    )

    res.json({
      data: rows,
      pagination: { 
        page, 
        limit, 
        total: countRows[0].total, 
        totalPages: Math.max(Math.ceil(countRows[0].total / limit), 1) 
      }
    })
  })
)

// ── GET /inventory/:id ─────────────────────────────────────────────────────
router.get(
  '/:id',
  param('id').isInt({ min: 1 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT i.*,
              CASE WHEN i.qty_on_hand <= 0 THEN 'OUT_OF_STOCK'
                   WHEN i.qty_on_hand <= i.qty_minimum THEN 'LOW_STOCK'
                   ELSE 'IN_STOCK' END AS stock_status,
              json_agg(m ORDER BY m.created_at DESC) FILTER (WHERE m.id IS NOT NULL) AS movements
       FROM inventory_items i
       LEFT JOIN (
         SELECT m.*, jo.job_order_no
         FROM inventory_movements m
         LEFT JOIN job_orders jo ON m.job_order_id = jo.id
       ) m ON m.item_id = i.id
       WHERE i.id = $1
       GROUP BY i.id`,
      [req.params.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Item not found' })
    res.json(rows[0])
  }),
)

// ── POST /inventory ────────────────────────────────────────────────────────
router.post(
  '/',
  body('name').isString().notEmpty(),
  body('qtyOnHand').isFloat({ min: 0 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { 
      sku, 
      name, 
      category, 
      description, 
      unit, 
      costPrice = 0, 
      sellPrice = 0, 
      qtyOnHand, 
      qtyMinimum = 5, 
      supplierRef,
      beginningInventory,
      inventoryDate,
      startingDate
    } = req.body

    const finalSku = sku || `SKU-${Date.now().toString().slice(-8)}`

    const { rows } = await db.query(
      `INSERT INTO inventory_items (
        sku, name, category, description, unit, 
        cost_price, sell_price, qty_on_hand, qty_minimum, 
        supplier_ref, created_by, beginning_inventory, inventory_date, starting_date
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        finalSku, 
        name, 
        category || null, 
        description || null, 
        unit || 'pcs', 
        costPrice, 
        sellPrice, 
        qtyOnHand, 
        qtyMinimum, 
        supplierRef || null, 
        req.user.id,
        beginningInventory || qtyOnHand || 0,
        inventoryDate || null,
        startingDate || null
      ],
    )

    // Record opening stock movement if qty > 0
    if (Number(qtyOnHand) > 0) {
      await db.query(
        `INSERT INTO inventory_movements (item_id, movement_type, qty, qty_before, qty_after, reference_note, created_by)
         VALUES ($1,'IN',$2,0,$3,'Opening stock',$4)`,
        [rows[0].id, qtyOnHand, qtyOnHand, req.user.id],
      )
    }

    await writeAuditLog({ userId: req.user.id, action: 'CREATE', entity: 'inventory_item', entityId: rows[0].id, meta: { sku: finalSku, name } })
    res.status(201).json(rows[0])
  }),
)

// ── PATCH /inventory/:id ───────────────────────────────────────────────────
router.patch(
  '/:id',
  param('id').isInt({ min: 1 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { 
      name, category, description, unit, costPrice, sellPrice, 
      qtyMinimum, supplierRef, isActive, beginningInventory, inventoryDate, startingDate 
    } = req.body
    
    const { rows: existing } = await db.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id])
    if (!existing.length) return res.status(404).json({ message: 'Item not found' })

    const { rows } = await db.query(
      `UPDATE inventory_items
       SET name                = COALESCE($1, name),
           category            = COALESCE($2, category),
           description         = COALESCE($3, description),
           unit                = COALESCE($4, unit),
           cost_price          = COALESCE($5, cost_price),
           sell_price          = COALESCE($6, sell_price),
           qty_minimum         = COALESCE($7, qty_minimum),
           supplier_ref        = COALESCE($8, supplier_ref),
           is_active           = COALESCE($9, is_active),
           beginning_inventory = COALESCE($10, beginning_inventory),
           inventory_date     = COALESCE($11, inventory_date),
           starting_date       = COALESCE($12, starting_date)
       WHERE id = $13
       RETURNING *`,
      [
        name, category, description, unit, costPrice, sellPrice, 
        qtyMinimum, supplierRef, isActive, beginningInventory, inventoryDate, startingDate, req.params.id
      ],
    )

    await writeAuditLog({ userId: req.user.id, action: 'UPDATE', entity: 'inventory_item', entityId: rows[0].id, meta: req.body })
    res.json(rows[0])
  }),
)

// ── POST /inventory/:id/adjust ─────────────────────────────────────────────
// Manual stock adjustment (receive, remove, audit correction)
router.post(
  '/:id/adjust',
  param('id').isInt({ min: 1 }),
  body('movementType').isIn(['IN', 'OUT', 'ADJUST']),
  body('qty').isFloat({ min: 0 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { movementType, qty, referenceNote, note } = req.body
    const { rows: existing } = await db.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id])
    if (!existing.length) return res.status(404).json({ message: 'Item not found' })

    const item = existing[0]
    const qtyBefore = Number(item.qty_on_hand)
    let qtyAfter
    if (movementType === 'ADJUST') {
      qtyAfter = Number(qty)
    } else if (movementType === 'OUT') {
      qtyAfter = qtyBefore - Number(qty)
    } else {
      qtyAfter = qtyBefore + Number(qty)
    }

    if (qtyAfter < 0) {
      return res.status(400).json({ message: `Insufficient stock. Current: ${qtyBefore}, requested OUT: ${qty}` })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE inventory_items SET qty_on_hand = $1 WHERE id = $2`, [qtyAfter, item.id])
      const { rows: mvtRows } = await client.query(
        `INSERT INTO inventory_movements (item_id, movement_type, qty, qty_before, qty_after, reference_note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [item.id, movementType, qty, qtyBefore, qtyAfter, referenceNote || note || null, req.user.id],
      )
      await client.query('COMMIT')

      await writeAuditLog({ userId: req.user.id, action: 'STOCK_ADJUST', entity: 'inventory_item', entityId: item.id, meta: { movementType, qty, qtyBefore, qtyAfter } })

      const lowStockAlert = qtyAfter <= Number(item.qty_minimum)
      res.json({ item: { ...item, qty_on_hand: qtyAfter }, movement: mvtRows[0], lowStockAlert })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ── POST /inventory/:id/deduct-from-job ────────────────────────────────────
// Auto-deduct when Job Order is completed
router.post(
  '/:id/deduct-from-job',
  param('id').isInt({ min: 1 }),
  body('jobOrderId').isInt({ min: 1 }),
  body('qtyUsed').isFloat({ gt: 0 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { jobOrderId, qtyUsed } = req.body
    const { rows: existing } = await db.query('SELECT * FROM inventory_items WHERE id = $1', [req.params.id])
    if (!existing.length) return res.status(404).json({ message: 'Item not found' })

    const item = existing[0]
    const qtyBefore = Number(item.qty_on_hand)
    const qtyAfter = qtyBefore - Number(qtyUsed)
    if (qtyAfter < 0) {
      return res.status(400).json({ message: `Insufficient stock for ${item.name}. Available: ${qtyBefore}` })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`UPDATE inventory_items SET qty_on_hand = $1 WHERE id = $2`, [qtyAfter, item.id])
      await client.query(
        `INSERT INTO inventory_movements (item_id, movement_type, qty, qty_before, qty_after, job_order_id, reference_note, created_by)
         VALUES ($1,'OUT',$2,$3,$4,$5,'Job Order deduction',$6)`,
        [item.id, qtyUsed, qtyBefore, qtyAfter, jobOrderId, req.user.id],
      )
      await client.query(
        `INSERT INTO job_order_parts (job_order_id, item_id, qty_used, cost_price_snap, sell_price_snap)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [jobOrderId, item.id, qtyUsed, item.cost_price, item.sell_price],
      )
      await client.query('COMMIT')
      res.json({ item: { ...item, qty_on_hand: qtyAfter }, lowStockAlert: qtyAfter <= Number(item.qty_minimum) })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ── DELETE /inventory/:id ──────────────────────────────────────────────────
router.delete(
  '/:id',
  param('id').isInt({ min: 1 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(`UPDATE inventory_items SET is_active = FALSE WHERE id = $1`, [req.params.id])
    if (!rowCount) return res.status(404).json({ message: 'Item not found' })
    res.status(204).send()
  }),
)

module.exports = router

