/**
 * Overpayment Detection & Resolution Routes
 *
 * GET  /overpayments                       – list all unresolved OVERPAID sales
 * GET  /overpayments/summary               – daily report figures
 * GET  /overpayments/check-session         – block cashier close if unresolved exist
 * GET  /overpayments/credits/:customerId   – customer credit wallet balance
 * POST /overpayments/:saleId/resolve       – resolve with REFUND | CREDIT | TRANSFER
 * POST /overpayments/credits/:customerId/apply  – manually apply credit to an invoice
 */

const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')

const router = express.Router()

// ─── GET / — alias for unresolved overpayments (used by PaymentsPage banner) ──
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT
         fs.sale_id,
         fs.reference_no,
         fs.total_amount,
         fs.total_paid,
         fs.overpaid_amount,
         fs.payment_status,
         fs.overpayment_resolved,
         c.full_name  AS customer_name,
         c.id         AS customer_id,
         c.mobile     AS customer_mobile,
         s.created_at AS sale_date
       FROM sale_financial_summary fs
       JOIN sales s ON s.id = fs.sale_id
       JOIN customers c ON c.id = s.customer_id
       WHERE fs.payment_status = 'OVERPAID'
         AND fs.overpayment_resolved = FALSE
       ORDER BY s.created_at DESC`,
    )
    res.json(rows)
  }),
)

// ─── List Unresolved Overpayments ─────────────────────────────────────────────
router.get(
  '/unresolved-overpayments',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT
         fs.sale_id,
         fs.reference_no,
         fs.total_amount,
         fs.total_paid,
         fs.overpaid_amount,
         fs.payment_status,
         fs.overpayment_resolved,
         c.full_name  AS customer_name,
         c.id         AS customer_id,
         c.mobile     AS customer_mobile,
         s.created_at AS sale_date
       FROM sale_financial_summary fs
       JOIN sales s ON s.id = fs.sale_id
       JOIN customers c ON c.id = s.customer_id
       WHERE fs.payment_status = 'OVERPAID'
         AND fs.overpayment_resolved = FALSE
       ORDER BY s.created_at DESC`,
    )
    res.json(rows)
  }),
)

// ─── Daily Overpayment Summary (for reports) ──────────────────────────────────
router.get(
  '/summary',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0]

    const [overpaid, refunds, creditsCreated, creditsUsed] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(overpaid_amount),0)::NUMERIC AS total
         FROM sale_financial_summary fs
         JOIN sales s ON s.id = fs.sale_id
         WHERE fs.payment_status = 'OVERPAID'
           AND s.created_at::date = $1`,
        [date],
      ),
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::NUMERIC AS total
         FROM refunds
         WHERE created_at::date = $1`,
        [date],
      ),
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0)::NUMERIC AS total
         FROM customer_credits
         WHERE created_at::date = $1`,
        [date],
      ),
      db.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_applied),0)::NUMERIC AS total
         FROM customer_credit_usage
         WHERE applied_at::date = $1`,
        [date],
      ),
    ])

    res.json({
      date,
      overpayments_collected: {
        count: overpaid.rows[0].count,
        total: overpaid.rows[0].total,
      },
      refunds_issued: {
        count: refunds.rows[0].count,
        total: refunds.rows[0].total,
      },
      credits_created: {
        count: creditsCreated.rows[0].count,
        total: creditsCreated.rows[0].total,
      },
      credits_used: {
        count: creditsUsed.rows[0].count,
        total: creditsUsed.rows[0].total,
      },
    })
  }),
)

// ─── Cashier Session Guard ─────────────────────────────────────────────────────
router.get(
  '/check-session',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS unresolved_count
       FROM sale_financial_summary fs
       WHERE fs.payment_status = 'OVERPAID'
         AND fs.overpayment_resolved = FALSE`,
    )
    const count = rows[0].unresolved_count
    res.json({
      can_close_session: count === 0,
      unresolved_count: count,
      message:
        count > 0
          ? `Cannot close cashier session: ${count} unresolved overpayment(s) require action.`
          : 'Session may be closed.',
    })
  }),
)

// ─── Customer Credit Wallet ────────────────────────────────────────────────────
router.get(
  '/credits/:customerId',
  param('customerId').isInt({ min: 1 }),
  validateRequest,
  requireRole('SuperAdmin', 'Admin', 'Manager', 'Cashier'),
  asyncHandler(async (req, res) => {
    const { customerId } = req.params

    const { rows: credits } = await db.query(
      `SELECT
         cc.*,
         s.reference_no AS source_invoice,
         u.full_name    AS created_by_name
       FROM customer_credits cc
       LEFT JOIN sales s ON s.id = cc.sale_id
       LEFT JOIN users u ON u.id = cc.created_by
       WHERE cc.customer_id = $1
       ORDER BY cc.created_at DESC`,
      [customerId],
    )

    const available = credits.reduce(
      (sum, c) => sum + Number(c.amount) - Number(c.amount_used),
      0,
    )

    res.json({ credits, available_balance: Number(available.toFixed(2)) })
  }),
)

// ─── Resolve Overpayment ──────────────────────────────────────────────────────
router.post(
  '/:saleId/resolve',
  param('saleId').isInt({ min: 1 }),
  body('resolution_type')
    .isIn(['REFUND', 'CREDIT', 'TRANSFER'])
    .withMessage('resolution_type must be REFUND, CREDIT, or TRANSFER'),
  body('notes').optional().isString(),
  // REFUND fields
  body('refund_method').optional().isString(),
  body('refund_reference').optional().isString(),
  // TRANSFER fields
  body('target_sale_id').optional().isInt({ min: 1 }),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { saleId } = req.params
    const { resolution_type, notes, refund_method, refund_reference, target_sale_id } = req.body

    // ── Fetch current financial state ──────────────────────────────────────
    const { rows: finRows } = await db.query(
      `SELECT fs.*, c.full_name AS customer_name
       FROM sale_financial_summary fs
       JOIN sales s ON s.id = fs.sale_id
       JOIN customers c ON c.id = s.customer_id
       WHERE fs.sale_id = $1`,
      [saleId],
    )
    if (!finRows.length) return res.status(404).json({ message: 'Sale not found' })
    const fin = finRows[0]

    if (fin.payment_status !== 'OVERPAID') {
      return res.status(400).json({ message: 'Sale is not overpaid – no resolution needed.' })
    }
    if (fin.overpayment_resolved) {
      return res.status(409).json({ message: 'Overpayment for this sale is already resolved.' })
    }

    const overpaidAmt = Number(fin.overpaid_amount)
    if (overpaidAmt <= 0) {
      return res.status(400).json({ message: 'Computed overpaid amount is zero.' })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      let resolution = null
      let creditRecord = null

      // ── REFUND ──────────────────────────────────────────────────────────
      if (resolution_type === 'REFUND') {
        if (!refund_method) {
          await client.query('ROLLBACK')
          return res.status(400).json({ message: 'refund_method is required for REFUND resolution.' })
        }

        // 1. Insert resolution record (credit_id null for refunds)
        const { rows: rr } = await client.query(
          `INSERT INTO overpayment_resolutions
             (sale_id, overpaid_amount, resolution_type, refund_method, resolved_by, notes)
           VALUES ($1,$2,'REFUND',$3,$4,$5)
           RETURNING *`,
          [saleId, overpaidAmt, refund_method, req.user.id, notes || null],
        )
        resolution = rr[0]

        // 2. Insert refund record
        await client.query(
          `INSERT INTO refunds
             (sale_id, resolution_id, amount, refund_method, reference_no, issued_by, customer_name, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            saleId,
            resolution.id,
            overpaidAmt,
            refund_method,
            refund_reference || null,
            req.user.id,
            fin.customer_name,
            notes || null,
          ],
        )
      }

      // ── STORE CREDIT ─────────────────────────────────────────────────────
      else if (resolution_type === 'CREDIT') {
        // 1. Create customer credit balance
        const { rows: cr } = await client.query(
          `INSERT INTO customer_credits
             (customer_id, sale_id, amount, amount_used, notes, created_by)
           VALUES ($1,$2,$3,0,$4,$5)
           RETURNING *`,
          [fin.customer_id, saleId, overpaidAmt, notes || null, req.user.id],
        )
        creditRecord = cr[0]

        // 2. Insert resolution record
        const { rows: rr } = await client.query(
          `INSERT INTO overpayment_resolutions
             (sale_id, overpaid_amount, resolution_type, credit_id, resolved_by, notes)
           VALUES ($1,$2,'CREDIT',$3,$4,$5)
           RETURNING *`,
          [saleId, overpaidAmt, creditRecord.id, req.user.id, notes || null],
        )
        resolution = rr[0]
      }

      // ── TRANSFER TO ANOTHER INVOICE ───────────────────────────────────────
      else if (resolution_type === 'TRANSFER') {
        if (!target_sale_id) {
          await client.query('ROLLBACK')
          return res.status(400).json({ message: 'target_sale_id is required for TRANSFER resolution.' })
        }
        if (Number(target_sale_id) === Number(saleId)) {
          await client.query('ROLLBACK')
          return res.status(400).json({ message: 'target_sale_id must differ from the source sale.' })
        }

        // Validate target sale exists and is underpaid
        const { rows: targetRows } = await client.query(
          `SELECT fs.*, s.customer_id
           FROM sale_financial_summary fs
           JOIN sales s ON s.id = fs.sale_id
           WHERE fs.sale_id = $1`,
          [target_sale_id],
        )
        if (!targetRows.length) {
          await client.query('ROLLBACK')
          return res.status(404).json({ message: 'Target sale not found.' })
        }
        const target = targetRows[0]
        if (['SETTLED', 'OVERPAID'].includes(target.payment_status)) {
          await client.query('ROLLBACK')
          return res
            .status(400)
            .json({ message: 'Target sale is already settled or overpaid.' })
        }

        // Apply as a synthetic payment on the target invoice
        const applyAmount = Math.min(overpaidAmt, Number(target.outstanding_balance))
        await client.query(
          `INSERT INTO payments (sale_id, amount, payment_type, reference_no, received_by)
           VALUES ($1,$2,'Credit Transfer',$3,$4)`,
          [target_sale_id, applyAmount, `XFER from ${fin.reference_no}`, req.user.id],
        )

        // 2. Insert resolution record
        const { rows: rr } = await client.query(
          `INSERT INTO overpayment_resolutions
             (sale_id, overpaid_amount, resolution_type, target_sale_id, resolved_by, notes)
           VALUES ($1,$2,'TRANSFER',$3,$4,$5)
           RETURNING *`,
          [saleId, overpaidAmt, target_sale_id, req.user.id, notes || null],
        )
        resolution = rr[0]
      }

      await client.query('COMMIT')

      // ── Audit Log ─────────────────────────────────────────────────────────
      await writeAuditLog({
        userId: req.user.id,
        action: `OVERPAYMENT_${resolution_type}`,
        entity: 'overpayment_resolutions',
        entityId: resolution.id,
        meta: {
          saleId: Number(saleId),
          overpaidAmount: overpaidAmt,
          resolutionType: resolution_type,
          refundMethod: refund_method || null,
          targetSaleId: target_sale_id || null,
          creditId: creditRecord?.id || null,
          notes: notes || null,
          resolvedBy: req.user.full_name || req.user.email,
        },
      })

      // Return fresh financial state after resolution
      const { rows: freshFin } = await db.query(
        `SELECT * FROM sale_financial_summary WHERE sale_id = $1`,
        [saleId],
      )

      res.status(201).json({
        resolution,
        credit: creditRecord,
        updated_financial: freshFin[0] || null,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ─── Manual Credit Application ────────────────────────────────────────────────
router.post(
  '/credits/:customerId/apply',
  param('customerId').isInt({ min: 1 }),
  body('credit_id').isInt({ min: 1 }).withMessage('credit_id required'),
  body('target_sale_id').isInt({ min: 1 }).withMessage('target_sale_id required'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be > 0'),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { customerId } = req.params
    const { credit_id, target_sale_id, amount } = req.body

    // Validate credit ownership and available balance
    const { rows: cr } = await db.query(
      `SELECT *, (amount - amount_used)::NUMERIC AS available
       FROM customer_credits
       WHERE id = $1 AND customer_id = $2`,
      [credit_id, customerId],
    )
    if (!cr.length) return res.status(404).json({ message: 'Credit not found.' })
    const credit = cr[0]
    const available = Number(credit.available)
    if (available <= 0) return res.status(400).json({ message: 'No available credit balance.' })

    const applyAmt = Math.min(Number(amount), available)

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // Deduct from credit
      await client.query(
        `UPDATE customer_credits SET amount_used = amount_used + $1 WHERE id = $2`,
        [applyAmt, credit_id],
      )

      // Record usage
      await client.query(
        `INSERT INTO customer_credit_usage
           (credit_id, applied_to_sale_id, amount_applied, applied_by)
         VALUES ($1,$2,$3,$4)`,
        [credit_id, target_sale_id, applyAmt, req.user.id],
      )

      // Apply as synthetic payment on target invoice
      await client.query(
        `INSERT INTO payments (sale_id, amount, payment_type, reference_no, received_by)
         VALUES ($1,$2,'Store Credit','CREDIT-WALLET',$3)`,
        [target_sale_id, applyAmt, req.user.id],
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREDIT_APPLIED',
      entity: 'customer_credits',
      entityId: credit_id,
      meta: { customerId, targetSaleId: target_sale_id, amountApplied: applyAmt },
    })

    res.status(201).json({ applied: applyAmt, credit_id, target_sale_id })
  }),
)

module.exports = router

