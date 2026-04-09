const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')
const EmailService = require('../services/emailNotificationService')

const router = express.Router()

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const tab   = req.query.tab ? String(req.query.tab).trim() : null // 'active' | 'history'
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100)
    const offset = (page - 1) * limit

    const conditions = []
    const baseParams = []
    let idx = 1

    if (search) {
      conditions.push(
        `(LOWER(COALESCE(q.quotation_no, '')) LIKE $${idx}
            OR LOWER(COALESCE(p.payment_type, '')) LIKE $${idx}
            OR LOWER(COALESCE(p.reference_no, '')) LIKE $${idx}
            OR LOWER(c.full_name) LIKE $${idx})`
      )
      baseParams.push(`%${search}%`)
      idx++
    }

    if (tab === 'history') {
      // History: fully settled — only quotations with at least one payment AND fully paid
      conditions.push(`qps.payment_status IN ('PAID', 'SETTLED', 'OVERPAID')`)
    } else if (tab === 'active') {
      // Active: all Approved quotations not yet fully paid (including zero-payment / UNPAID)
      conditions.push(`q.status = 'Approved'`)
      conditions.push(`(qps.payment_status IS NULL OR qps.payment_status NOT IN ('PAID', 'SETTLED', 'OVERPAID'))`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const params = [...baseParams, limit, offset]
    const countParams = [...baseParams]

    // Use quotation-centric query (LEFT JOIN payments) so UNPAID quotations with no
    // payment rows still appear in the active tab.
    const { rows } = await db.query(
      `SELECT
              q.id                                                        AS sale_id,
              q.id                                                        AS quotation_id,
              q.quotation_no                                              AS sale_reference,
              q.total_amount                                              AS sale_total,
              q.customer_id,
              c.full_name                                                 AS customer_name,
              COALESCE(qps.total_paid, 0)                                AS sale_total_paid,
              COALESCE(qps.outstanding_balance, q.total_amount)          AS sale_outstanding,
              COALESCE(qps.payment_status, 'UNPAID')                     AS sale_payment_status,
              CASE
                WHEN jo_ref.job_order_no IS NULL THEN NULL
                WHEN jo_ref.job_order_no ~* '^JO-[0-9]{4}-[0-9]{4}$'
                  THEN 'JO-CBO-' || RIGHT(SPLIT_PART(jo_ref.job_order_no, '-', 2), 3) || '-' || SPLIT_PART(jo_ref.job_order_no, '-', 3)
                ELSE UPPER(jo_ref.job_order_no)
              END                                                        AS job_order_no,
              COALESCE(SUM(p.amount), 0)::NUMERIC                        AS amount,
              COUNT(p.id)::int                                            AS payment_count,
              COALESCE(STRING_AGG(DISTINCT p.payment_type, ', '
                ORDER BY p.payment_type), '')                            AS payment_methods,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',           p.id,
                    'amount',       p.amount,
                    'payment_type', p.payment_type,
                    'reference_no', p.reference_no,
                    'is_deposit',   p.is_deposit,
                    'created_at',   p.created_at
                  ) ORDER BY p.created_at
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'::json
              )                                                           AS payments,
              MAX(p.created_at)                                           AS created_at
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN payments p ON p.quotation_id = q.id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       LEFT JOIN LATERAL (
         SELECT jo.job_order_no
         FROM job_orders jo
         WHERE jo.quotation_id = q.id
         ORDER BY
           CASE WHEN jo.status IN ('Complete', 'Cancelled') THEN 1 ELSE 0 END,
           jo.created_at DESC,
           jo.id DESC
         LIMIT 1
       ) jo_ref ON TRUE
       ${whereClause}
       GROUP BY q.id, c.full_name, qps.total_paid, qps.outstanding_balance, qps.payment_status, jo_ref.job_order_no
       ORDER BY MAX(p.created_at) DESC NULLS LAST, q.created_at DESC
       LIMIT $${idx}
       OFFSET $${idx + 1}`,
      params,
    )

    const count = await db.query(
      `SELECT COUNT(DISTINCT q.id)::int AS total
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN payments p ON p.quotation_id = q.id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       ${whereClause}`,
      countParams,
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
  body('quotationId').isInt({ min: 1 }).withMessage('quotationId is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than zero'),
  body('paymentType').isString().notEmpty().withMessage('paymentType is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { quotationId, amount, paymentType, referenceNo, isDeposit } = req.body
    const enteredAmount = Number(amount)

    // Fetch quotation + current payment state
    const { rows: qRows } = await db.query(
      `SELECT q.id, q.total_amount, q.status,
              COALESCE(qps.total_paid, 0)::NUMERIC          AS total_paid,
              GREATEST(q.total_amount - COALESCE(qps.total_paid, 0), 0)::NUMERIC AS remaining_balance
       FROM quotations q
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       WHERE q.id = $1`,
      [quotationId],
    )
    if (!qRows.length) return res.status(404).json({ message: 'Quotation not found' })
    const quotation = qRows[0]

    if (quotation.status !== 'Approved') {
      return res.status(409).json({ message: 'Payments can only be recorded against Approved quotations' })
    }

    const remainingBalance = Number(quotation.remaining_balance)

    if (remainingBalance <= 0) {
      return res.status(400).json({
        message: 'Quotation is already fully paid. No further payments are accepted.',
        remaining_balance: 0,
      })
    }

    const appliedAmount = Math.min(enteredAmount, remainingBalance)
    const excessAmount  = Number((enteredAmount - appliedAmount).toFixed(2))
    const hasExcess     = excessAmount > 0

    const client = await db.pool.connect()
    let insertedPayment
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `INSERT INTO payments (quotation_id, amount, payment_type, reference_no, is_deposit, received_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [quotationId, appliedAmount, paymentType, referenceNo ?? null, Boolean(isDeposit), req.user.id],
      )
      insertedPayment = rows[0]

      // ── Auto-advance Job Order if 50% threshold met ───────────────────────
      const newTotalPaid = Number(quotation.total_paid) + appliedAmount
      const threshold    = Number(quotation.total_amount) * 0.5
      
      if (newTotalPaid >= threshold && threshold > 0) {
        await client.query(
          `UPDATE job_orders 
           SET status = 'Pending', 
               previous_status = status, 
               pending_at = NOW()
           WHERE quotation_id = $1 AND status = 'Pending JO Approval'`,
          [quotationId]
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE_PAYMENT',
      entity: 'payments',
      entityId: insertedPayment.id,
      meta: { quotationId: Number(quotationId), enteredAmount, appliedAmount, excessAmount, paymentType },
    })

    // ── Send Payment Receipt Email ──────────────────────────────────────────
    EmailService.safeFireAndForget('Payment Receipt', () => 
      EmailService.sendEmail('payment_completed', req.user.id, { paymentId: insertedPayment.id })
    )

    return res.status(201).json({
      ...insertedPayment,
      applied_amount:  appliedAmount,
      entered_amount:  enteredAmount,
      excess_amount:   excessAmount,
      overpayment: hasExcess
        ? {
            detected:        true,
            overpaid_amount: excessAmount,
            entered_amount:  enteredAmount,
            applied_amount:  appliedAmount,
            invoice_total:   Number(quotation.total_amount),
            payment_status:  'PAID',
            message: `\u20b1${appliedAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} applied. \u20b1${excessAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} excess detected.`,
          }
        : { detected: false },
    })
  }),
)


// NOTE: Payment STATUS is fully automatic — computed by the quotation_payment_summary
// database view and is NEVER stored or directly editable. This PATCH endpoint only
// corrects recording details (amount, type, reference) and requires Admin/Manager/Cashier.
// The computed status (Unpaid / Partially Paid / Paid / Overpaid) updates automatically.
router.patch(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid payment id'),
  body('amount').optional().isFloat({ gt: 0 }),
  body('paymentType').optional().isString().notEmpty(),
  body('referenceNo').optional().isString(),
  body('isDeposit').optional().isBoolean(),
  validateRequest,
  requireRole('SuperAdmin', 'Admin', 'Manager', 'Cashier'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { amount, paymentType, referenceNo, isDeposit } = req.body

    // Explicitly reject any attempt to set payment_status (it's computed, not stored)
    if ('paymentStatus' in req.body || 'payment_status' in req.body) {
      return res.status(400).json({
        message: 'payment_status is computed automatically and cannot be manually set.',
      })
    }

    const { rows: before } = await db.query('SELECT * FROM payments WHERE id = $1', [id])
    if (!before.length) return res.status(404).json({ message: 'Payment not found' })

    const { rows } = await db.query(
      `UPDATE payments
       SET amount = COALESCE($1, amount),
           payment_type = COALESCE($2, payment_type),
           reference_no = COALESCE($3, reference_no),
           is_deposit = COALESCE($4, is_deposit)
       WHERE id = $5
       RETURNING *`,
      [amount, paymentType, referenceNo, isDeposit, id],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Payment not found' })
    }

    const updatedPayment = rows[0]

    // ── Re-check 50% threshold on update ────────────────────────────────────
    const { rows: qAfter } = await db.query(
      `SELECT q.id, q.total_amount, COALESCE(qps.total_paid, 0)::NUMERIC AS total_paid
       FROM quotations q
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
       WHERE q.id = $1`,
      [updatedPayment.quotation_id],
    )
    if (qAfter.length) {
      const q = qAfter[0]
      if (Number(q.total_paid) >= (Number(q.total_amount) * 0.5) && Number(q.total_amount) > 0) {
        await db.query(
          `UPDATE job_orders 
           SET status = 'Pending', 
               previous_status = status, 
               pending_at = NOW()
           WHERE quotation_id = $1 AND status = 'Pending JO Approval'`,
          [q.id]
        )
      }
    }

    await writeAuditLog({
      userId:   req.user?.id,
      action:   'EDIT_PAYMENT',
      entity:   'payments',
      entityId: Number(id),
      meta: {
        before: { amount: before[0].amount, paymentType: before[0].payment_type },
        after:  { amount: rows[0].amount,   paymentType: rows[0].payment_type },
      },
    })

    // ── Resend Payment Receipt Email on update ──────────────────────────────
    EmailService.safeFireAndForget('Payment Receipt Update', () => 
      EmailService.sendEmail('payment_completed', req.user.id, { paymentId: updatedPayment.id, resend: true })
    )

    return res.json(rows[0])
  }),
)

router.delete(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid payment id'),
  validateRequest,
  requireRole('SuperAdmin', 'Admin', 'Manager', 'Cashier'),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { rowCount } = await db.query('DELETE FROM payments WHERE id = $1', [id])

    if (!rowCount) {
      return res.status(404).json({ message: 'Payment not found' })
    }

    return res.status(204).send()
  }),
)

// ─── GET /payments/portal ─────────────────────────────────────────────────────
// Returns portal (online) bookings that have a recorded down payment.
// Used by Payments & POS page to show pre-collected portal deposits.
router.get(
  '/portal',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const conditions = [`a.booking_source = 'portal'`, `a.down_payment_amount > 0`]
    const params = []
    let idx = 1

    if (search) {
      conditions.push(
        `(LOWER(c.full_name) LIKE $${idx} OR LOWER(v.plate_number) LIKE $${idx} OR LOWER(a.down_payment_ref) LIKE $${idx})`
      )
      params.push(`%${search}%`)
      idx++
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const { rows } = await db.query(
      `SELECT
              a.id                          AS appointment_id,
              CONCAT('PBK-', a.id)          AS reference,
              a.customer_id,
              a.quotation_id,
              c.full_name                   AS customer_name,
              v.plate_number,
              sv.name                       AS service_name,
              a.down_payment_amount,
              a.down_payment_method,
              a.down_payment_ref,
              a.down_payment_status,
              a.status                      AS appointment_status,
              a.schedule_start,
              a.created_at,
              qps.payment_status            AS quotation_payment_status,
              qps.total_paid,
              qps.outstanding_balance
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles  v ON v.id = a.vehicle_id
       LEFT JOIN services sv ON sv.id = a.service_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = a.quotation_id
       ${where}
       ORDER BY a.created_at DESC`,
      params,
    )

    return res.json(rows)
  }),
)

// ─── PATCH /payments/portal/:appointmentId ────────────────────────────────────
// Update down_payment_amount, down_payment_method, down_payment_ref for a portal booking.
router.patch(
  '/portal/:appointmentId',
  requireRole('SuperAdmin', 'Admin', 'Manager', 'Cashier'),
  [
    param('appointmentId').isInt({ min: 1 }),
    body('down_payment_amount').optional().isFloat({ min: 0 }),
    body('down_payment_method').optional().isString().trim(),
    body('down_payment_ref').optional().isString().trim(),
    body('down_payment_status').optional().isIn(['pending', 'collected']),
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.params
    const { down_payment_amount, down_payment_method, down_payment_ref, down_payment_status } = req.body

    const sets = []
    const params = []
    let idx = 1

    if (down_payment_amount  !== undefined) { sets.push(`down_payment_amount  = $${idx++}`); params.push(down_payment_amount) }
    if (down_payment_method  !== undefined) { sets.push(`down_payment_method  = $${idx++}`); params.push(down_payment_method) }
    if (down_payment_ref     !== undefined) { sets.push(`down_payment_ref     = $${idx++}`); params.push(down_payment_ref) }
    if (down_payment_status  !== undefined) { sets.push(`down_payment_status  = $${idx++}`); params.push(down_payment_status) }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })

    params.push(appointmentId)
    const { rows } = await db.query(
      `UPDATE appointments SET ${sets.join(', ')} WHERE id = $${idx} AND booking_source = 'portal' RETURNING id`,
      params,
    )
    if (!rows.length) return res.status(404).json({ error: 'Portal appointment not found' })

    await writeAuditLog({ userId: req.user?.id, action: 'UPDATE', entity: 'appointments', entityId: Number(appointmentId), meta: { down_payment_amount, down_payment_method, down_payment_ref, down_payment_status } })
    return res.json({ success: true })
  }),
)

module.exports = router

