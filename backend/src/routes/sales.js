const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { requireRole } = require('../middleware/auth')
const { validateRequest } = require('../middleware/validateRequest')
const { sendReadyForReleaseEmail } = require('../services/mailer')

const router = express.Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim()
    const dateFrom = String(req.query.dateFrom || '').trim()
    const dateTo = String(req.query.dateTo || '').trim()
    const sortByInput = String(req.query.sortBy || 'createdAt').trim()
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100)
    const offset = (page - 1) * limit

    const sortByMap = {
      createdAt: 's.created_at',
      amount: 's.total_amount',
      status: 's.workflow_status',
      reference: 's.reference_no',
      customer: 'c.full_name',
    }
    const sortBy = sortByMap[sortByInput] || sortByMap.createdAt

    const conditions = []
    const values = []
    let index = 1

    if (search) {
      conditions.push(
        `(LOWER(s.reference_no) LIKE $${index}
          OR LOWER(COALESCE(s.service_package, '')) LIKE $${index}
          OR LOWER(COALESCE(c.full_name, '')) LIKE $${index}
          OR LOWER(COALESCE(v.plate_number, '')) LIKE $${index})`,
      )
      values.push(`%${search}%`)
      index += 1
    }

    if (status) {
      conditions.push(`s.workflow_status = $${index}`)
      values.push(status)
      index += 1
    }

    if (dateFrom) {
      conditions.push(`s.created_at >= $${index}::date`)
      values.push(dateFrom)
      index += 1
    }

    if (dateTo) {
      conditions.push(`s.created_at < ($${index}::date + INTERVAL '1 day')`)
      values.push(dateTo)
      index += 1
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await db.query(
      `SELECT s.*,
              c.full_name AS customer_name,
              v.plate_number,
              COALESCE(fs.total_paid, 0)::NUMERIC        AS total_paid,
              COALESCE(fs.outstanding_balance, s.total_amount)::NUMERIC AS outstanding_balance,
              COALESCE(fs.payment_status, 'UNPAID')      AS payment_status,
              COUNT(si.id)::int                          AS item_count,
              STRING_AGG(si.item_name, ' | '
                ORDER BY si.id)                         AS all_services
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       JOIN vehicles v ON v.id = s.vehicle_id
       LEFT JOIN sale_financial_summary fs ON fs.sale_id = s.id
       LEFT JOIN sale_items si ON si.sale_id = s.id
       ${whereClause}
       GROUP BY s.id, c.full_name, v.plate_number,
                fs.total_paid, fs.outstanding_balance, fs.payment_status
      ORDER BY ${sortBy} ${sortDir}
       LIMIT $${index}
       OFFSET $${index + 1}`,
      [...values, limit, offset],
    )

    const count = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       JOIN vehicles v ON v.id = s.vehicle_id
       ${whereClause}`,
      values,
    )

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: count.rows[0].total,
        totalPages: Math.max(Math.ceil(count.rows[0].total / limit), 1),
      },
    })
  }),
)

router.post(
  '/',
  body('docType').isIn(['Quotation', 'JobOrder', 'Invoice']).withMessage('Invalid docType'),
  body('customerId').isInt({ min: 1 }).withMessage('customerId is required'),
  body('vehicleId').isInt({ min: 1 }).withMessage('vehicleId is required'),
  body('servicePackage').isString().notEmpty().withMessage('servicePackage is required'),
  body('totalAmount').isFloat({ gt: 0 }).withMessage('totalAmount must be greater than zero'),
  body('workflowStatus').isString().notEmpty().withMessage('workflowStatus is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const {
      docType,
      customerId,
      vehicleId,
      servicePackage,
      addOns,
      discount,
      totalAmount,
      workflowStatus,
    } = req.body

    // Generate short reference number: Q-2026-1234
    const docTypePrefix = {
      Quotation: 'Q',
      JobOrder: 'J',
      Invoice: 'I',
    }
    const year = new Date().getFullYear()
    const randomNum = Math.floor(Math.random() * 9000) + 1000 // 4-digit number 1000-9999
    const referenceNo = `${docTypePrefix[docType]}-${year}-${randomNum}`

    const { rows } = await db.query(
      `INSERT INTO sales (
        reference_no, doc_type, customer_id, vehicle_id, service_package, add_ons, discount_amount,
        total_amount, workflow_status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        referenceNo,
        docType,
        customerId,
        vehicleId,
        servicePackage,
        addOns || null,
        discount || 0,
        totalAmount,
        workflowStatus,
        req.user.id,
      ],
    )

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_SALE',
      entity: 'sales',
      entityId: rows[0].id,
      meta: { referenceNo, docType },
    })

    res.status(201).json(rows[0])
  }),
)

router.patch(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  body('workflowStatus').optional().isString().notEmpty(),
  body('servicePackage').optional().isString().notEmpty(),
  body('totalAmount').optional().isFloat({ gt: 0 }),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { workflowStatus, servicePackage, totalAmount } = req.body

    const { rows: saleSnapshotRows } = await db.query(
      `SELECT s.workflow_status,
              s.reference_no,
              c.full_name AS customer_name,
              c.email AS customer_email,
              v.plate_number,
              v.make,
              v.model,
              v.year
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
       JOIN vehicles v ON v.id = s.vehicle_id
       WHERE s.id = $1`,
      [id],
    )

    if (!saleSnapshotRows.length) {
      return res.status(404).json({ message: 'Sale not found' })
    }

    const saleBeforeUpdate = saleSnapshotRows[0]

    // Block edits on locked invoices (Admin can override with force:true)
    if (saleBeforeUpdate.is_locked && req.body.force !== true && !req.user.roles?.includes('Admin')) {
      return res.status(423).json({
        message: 'This invoice is locked after payment. Contact an Admin to make changes.',
        locked: true,
      })
    }

    const { rows } = await db.query(
      `UPDATE sales
       SET workflow_status = COALESCE($1, workflow_status),
           service_package = COALESCE($2, service_package),
           total_amount = COALESCE($3, total_amount)
       WHERE id = $4
       RETURNING *`,
      [workflowStatus, servicePackage, totalAmount, id],
    )

    const updatedSale = rows[0]

    const isReadyForRelease =
      typeof workflowStatus === 'string' && workflowStatus.toLowerCase() === 'ready for release'
    const wasAlreadyReadyForRelease =
      String(saleBeforeUpdate.workflow_status || '').toLowerCase() === 'ready for release'

    if (isReadyForRelease && !wasAlreadyReadyForRelease && saleBeforeUpdate.customer_email) {
      try {
        await sendReadyForReleaseEmail({
          to: saleBeforeUpdate.customer_email,
          customerName: saleBeforeUpdate.customer_name,
          plateNumber: saleBeforeUpdate.plate_number,
          make: saleBeforeUpdate.make,
          model: saleBeforeUpdate.model,
          year: saleBeforeUpdate.year,
          referenceNo: saleBeforeUpdate.reference_no,
        })
      } catch (error) {
        console.error('Failed to send ready-for-release email:', error.message)
      }
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_SALE',
      entity: 'sales',
      entityId: Number(id),
      meta: { workflowStatus, servicePackage, totalAmount },
    })

    return res.json(updatedSale)
  }),
)

router.patch(
  '/:id/void',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  body('reason').optional().isString(),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { reason } = req.body

    const { rows: lockCheck } = await db.query('SELECT is_locked FROM sales WHERE id = $1', [id])
    if (lockCheck[0]?.is_locked) {
      return res.status(423).json({ message: 'Cannot void a locked/paid invoice.', locked: true })
    }

    const { rows } = await db.query(
      `UPDATE sales
       SET workflow_status = 'Voided'
       WHERE id = $1
       RETURNING *`,
      [id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Invoice not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'VOID_INVOICE',
      entity: 'sales',
      entityId: rows[0].id,
      meta: { reason: reason || 'No reason provided' },
    })

    return res.json(rows[0])
  }),
)

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rowCount } = await db.query('DELETE FROM sales WHERE id = $1', [id])

    if (!rowCount) {
      return res.status(404).json({ message: 'Sale not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'DELETE_SALE',
      entity: 'sales',
      entityId: Number(id),
    })

    return res.status(204).send()
  }),
)

/* Sale Items endpoints */

router.get(
  '/:id/items',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rows } = await db.query(
      `SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id ASC`,
      [id],
    )
    res.json(rows)
  }),
)

router.post(
  '/:id/items',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  body('itemName').isString().notEmpty().withMessage('itemName is required'),
  body('itemType').optional().isString(),
  body('qty').optional().isInt({ min: 1 }).withMessage('qty must be at least 1'),
  body('price').isFloat({ gt: 0 }).withMessage('price must be greater than zero'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { itemName, itemType, qty = 1, price } = req.body

    const { rows } = await db.query(
      `INSERT INTO sale_items (sale_id, item_name, item_type, qty, price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, itemName, itemType || null, qty, price],
    )

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_SALE_ITEM',
      entity: 'sale_items',
      entityId: rows[0].id,
      meta: { saleId: id, itemName },
    })

    res.status(201).json(rows[0])
  }),
)

router.patch(
  '/:id/items/:itemId',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  param('itemId').isInt({ min: 1 }).withMessage('Invalid item id'),
  body('itemName').optional().isString().notEmpty(),
  body('itemType').optional().isString(),
  body('qty').optional().isInt({ min: 1 }),
  body('price').optional().isFloat({ gt: 0 }),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id, itemId } = req.params

    const { rows: lockCheck } = await db.query('SELECT is_locked FROM sales WHERE id = $1', [id])
    if (lockCheck[0]?.is_locked && !req.user.roles?.includes('Admin')) {
      return res.status(423).json({ message: 'Invoice is locked. Cannot edit items.', locked: true })
    }
    const { itemName, itemType, qty, price } = req.body

    const { rows } = await db.query(
      `UPDATE sale_items
       SET item_name = COALESCE($1, item_name),
           item_type = COALESCE($2, item_type),
           qty = COALESCE($3, qty),
           price = COALESCE($4, price)
       WHERE id = $5 AND sale_id = $6
       RETURNING *`,
      [itemName, itemType, qty, price, itemId, id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Sale item not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'UPDATE_SALE_ITEM',
      entity: 'sale_items',
      entityId: Number(itemId),
      meta: { saleId: id },
    })

    res.json(rows[0])
  }),
)

router.delete(
  '/:id/items/:itemId',
  param('id').isInt({ min: 1 }).withMessage('Invalid sale id'),
  param('itemId').isInt({ min: 1 }).withMessage('Invalid item id'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { id, itemId } = req.params

    const { rows: lockCheck } = await db.query('SELECT is_locked FROM sales WHERE id = $1', [id])
    if (lockCheck[0]?.is_locked && !req.user.roles?.includes('Admin')) {
      return res.status(423).json({ message: 'Invoice is locked. Cannot delete items.', locked: true })
    }

    const { rowCount } = await db.query(
      `DELETE FROM sale_items WHERE id = $1 AND sale_id = $2`,
      [itemId, id],
    )

    if (!rowCount) {
      return res.status(404).json({ message: 'Sale item not found' })
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'DELETE_SALE_ITEM',
      entity: 'sale_items',
      entityId: Number(itemId),
      meta: { saleId: id },
    })

    res.status(204).send()
  }),
)

/* Reporting endpoints */

router.get(
  '/reports/summary',
  asyncHandler(async (req, res) => {
    const period = String(req.query.period || 'month').toLowerCase()
    const salesBaseFilter = `COALESCE(s.workflow_status, '') <> 'Voided'`
    const quotBaseFilter = `COALESCE(q.status, '') NOT IN ('Not Approved', 'Cancelled')`

    let salesDateFilter = ''
    let quotDateFilter = ''
    switch (period) {
      case 'day':
        salesDateFilter = `WHERE ${salesBaseFilter} AND DATE(s.created_at) = CURRENT_DATE`
        quotDateFilter  = `WHERE ${quotBaseFilter} AND DATE(q.created_at) = CURRENT_DATE`
        break
      case 'week':
        salesDateFilter = `WHERE ${salesBaseFilter} AND s.created_at >= CURRENT_DATE - INTERVAL '7 days'`
        quotDateFilter  = `WHERE ${quotBaseFilter} AND q.created_at >= CURRENT_DATE - INTERVAL '7 days'`
        break
      default:
        salesDateFilter = `WHERE ${salesBaseFilter} AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
        quotDateFilter  = `WHERE ${quotBaseFilter} AND DATE_TRUNC('month', q.created_at) = DATE_TRUNC('month', CURRENT_DATE)`
    }

    const { rows } = await db.query(
      `SELECT workflow_status,
              SUM(count)::BIGINT   AS count,
              SUM(total)::NUMERIC  AS total,
              AVG(average)::NUMERIC AS average
       FROM (
         -- Legacy sales
         SELECT workflow_status,
                COUNT(*)           AS count,
                SUM(total_amount)  AS total,
                AVG(total_amount)  AS average
         FROM sales s
         ${salesDateFilter}
         GROUP BY workflow_status

         UNION ALL

         -- Quotation-based transactions mapped to equivalent statuses
         SELECT
           CASE
             WHEN q.status = 'Pending'        THEN 'For Job Order'
             WHEN q.status = 'Not Approved'   THEN 'Not Approved'
             WHEN q.status = 'WITH BALANCE'   THEN 'With Balance'
             WHEN COALESCE(qps.payment_status,'UNPAID') = 'PAID'             THEN 'Completed/Released'
             WHEN COALESCE(qps.payment_status,'UNPAID') IN ('PARTIALLY_PAID','PARTIAL') THEN 'Partially Paid'
             ELSE 'In Progress'
           END                             AS workflow_status,
           COUNT(*)                        AS count,
           SUM(q.total_amount)             AS total,
           AVG(q.total_amount)             AS average
         FROM quotations q
         LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
         ${quotDateFilter}
         GROUP BY 1
       ) combined
       GROUP BY workflow_status
       ORDER BY workflow_status`,
    )

    const grand = await db.query(
      `SELECT SUM(cnt)::BIGINT          AS total_count,
              SUM(total)::NUMERIC       AS total_amount
       FROM (
         SELECT COUNT(*) AS cnt, SUM(total_amount) AS total FROM sales s ${salesDateFilter}
         UNION ALL
         SELECT COUNT(*) AS cnt, SUM(total_amount) AS total FROM quotations q ${quotDateFilter}
       ) t`,
    )

    res.json({
      period,
      byStatus: rows,
      summary: grand.rows[0],
    })
  }),
)

router.get(
  '/reports/by-type',
  asyncHandler(async (req, res) => {
    const dateFrom = String(req.query.dateFrom || '').trim()
    const dateTo   = String(req.query.dateTo   || '').trim()

    let salesFilter = ''
    let quotFilter  = ''
    let values = []

    if (dateFrom && dateTo) {
      salesFilter = `WHERE COALESCE(s.workflow_status, '') <> 'Voided' AND s.created_at >= $1::date AND s.created_at < ($2::date + INTERVAL '1 day')`
      quotFilter  = `WHERE COALESCE(q.status, '') NOT IN ('Not Approved', 'Cancelled') AND q.created_at >= $1::date AND q.created_at < ($2::date + INTERVAL '1 day')`
      values = [dateFrom, dateTo]
    } else {
      salesFilter = `WHERE COALESCE(s.workflow_status, '') <> 'Voided'`
      quotFilter  = `WHERE COALESCE(q.status, '') NOT IN ('Not Approved', 'Cancelled')`
    }

    const { rows } = await db.query(
      `SELECT service_type,
              SUM(count)::BIGINT         AS count,
              SUM(total)::NUMERIC        AS total,
              AVG(avg_amount)::NUMERIC   AS avg_amount
       FROM (
         -- Legacy sales: each sale is one service type
         SELECT COALESCE(s.service_package, 'Unspecified') AS service_type,
                COUNT(*)                 AS count,
                SUM(s.total_amount)      AS total,
                AVG(s.total_amount)      AS avg_amount
         FROM sales s
         ${salesFilter}
         GROUP BY s.service_package

         UNION ALL

         -- Quotation services: expand JSONB array, one row per service item
         SELECT COALESCE(svc->>'name', 'Unspecified') AS service_type,
                COUNT(*)                              AS count,
                SUM((svc->>'price')::NUMERIC)         AS total,
                AVG((svc->>'price')::NUMERIC)         AS avg_amount
         FROM quotations q,
              jsonb_array_elements(COALESCE(q.services::jsonb, '[]'::jsonb)) AS svc
         ${quotFilter}
         GROUP BY svc->>'name'
       ) combined
       GROUP BY service_type
       ORDER BY total DESC`,
      values,
    )

    res.json(rows)
  }),
)

router.get(
  '/reports/by-staff',
  asyncHandler(async (req, res) => {
    const dateFrom = String(req.query.dateFrom || '').trim()
    const dateTo   = String(req.query.dateTo   || '').trim()

    let salesFilter = ''
    let quotFilter  = ''
    let values = []

    if (dateFrom && dateTo) {
      salesFilter = `WHERE COALESCE(s.workflow_status, '') <> 'Voided' AND s.created_at >= $1::date AND s.created_at < ($2::date + INTERVAL '1 day')`
      quotFilter  = `WHERE COALESCE(q.status, '') NOT IN ('Not Approved', 'Cancelled') AND q.created_at >= $1::date AND q.created_at < ($2::date + INTERVAL '1 day')`
      values = [dateFrom, dateTo]
    } else {
      salesFilter = `WHERE COALESCE(s.workflow_status, '') <> 'Voided'`
      quotFilter  = `WHERE COALESCE(q.status, '') NOT IN ('Not Approved', 'Cancelled')`
    }

    const { rows } = await db.query(
      `SELECT staff_name,
              SUM(sales_count)::BIGINT  AS sales_count,
              SUM(total_sales)::NUMERIC AS total_sales
       FROM (
         SELECT COALESCE(u.full_name, 'Unassigned') AS staff_name,
                COUNT(s.id)             AS sales_count,
                SUM(s.total_amount)     AS total_sales
         FROM sales s
         LEFT JOIN users u ON u.id = s.created_by
         ${salesFilter}
         GROUP BY u.id, u.full_name

         UNION ALL

         SELECT COALESCE(u.full_name, 'Unassigned') AS staff_name,
                COUNT(q.id)             AS sales_count,
                SUM(q.total_amount)     AS total_sales
         FROM quotations q
         LEFT JOIN users u ON u.id = q.created_by
         ${quotFilter}
         GROUP BY u.id, u.full_name
       ) combined
       GROUP BY staff_name
       ORDER BY total_sales DESC`,
      values,
    )

    res.json(rows)
  }),
)

router.get(
  '/reports/outstanding',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, reference_no, doc_type, customer_name, vehicle_plate,
              total_amount, paid_amount, outstanding_balance,
              workflow_status, created_at, days_outstanding
       FROM (
         -- Legacy sales with outstanding balance
         SELECT s.id,
                s.reference_no,
                s.doc_type,
                c.full_name                                                  AS customer_name,
                v.plate_number                                               AS vehicle_plate,
                s.total_amount,
                COALESCE(SUM(p.amount), 0)::NUMERIC                         AS paid_amount,
                (s.total_amount - COALESCE(SUM(p.amount), 0))::NUMERIC      AS outstanding_balance,
                s.workflow_status,
                s.created_at,
                EXTRACT(DAY FROM CURRENT_TIMESTAMP - s.created_at)::INT     AS days_outstanding
         FROM sales s
         JOIN customers c ON c.id = s.customer_id
         JOIN vehicles  v ON v.id = s.vehicle_id
         LEFT JOIN payments p ON p.sale_id = s.id
         WHERE s.workflow_status IN ('Completed/Released', 'Partially Paid')
         GROUP BY s.id, c.id, v.id
         HAVING (s.total_amount - COALESCE(SUM(p.amount), 0)) > 0

         UNION ALL

         -- Quotation-based transactions with outstanding balance
         SELECT q.id,
                q.quotation_no                                               AS reference_no,
                'Quotation'                                                  AS doc_type,
                c.full_name                                                  AS customer_name,
                v.plate_number                                               AS vehicle_plate,
                q.total_amount,
                COALESCE(qps.total_paid, 0)::NUMERIC                        AS paid_amount,
                COALESCE(qps.outstanding_balance, q.total_amount)::NUMERIC  AS outstanding_balance,
                CONCAT('Quotation/', q.status)                              AS workflow_status,
                q.created_at,
                EXTRACT(DAY FROM CURRENT_TIMESTAMP - q.created_at)::INT     AS days_outstanding
         FROM quotations q
         JOIN customers c ON c.id = q.customer_id
         JOIN vehicles  v ON v.id = q.vehicle_id
         LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
         WHERE q.status = 'Approved'
           AND COALESCE(qps.payment_status, 'UNPAID') != 'PAID'
           AND COALESCE(qps.outstanding_balance, q.total_amount) > 0
       ) combined
       ORDER BY created_at ASC`,
    )

    res.json(rows)
  }),
)

module.exports = router

