const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { QUOTATION_WORKFLOW, validateTransition } = require('../utils/workflowEngine')
const emailNotificationService = require('../services/emailNotificationService')
const mailer = require('../services/mailer')
const { requireRole } = require('../middleware/auth')

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────

let _hasQuotationPaymentSummaryView
async function hasQuotationPaymentSummaryView() {
  if (typeof _hasQuotationPaymentSummaryView === 'boolean') return _hasQuotationPaymentSummaryView
  try {
    const { rows } = await db.query(
      `SELECT 1
       FROM information_schema.views
       WHERE table_schema = 'public'
         AND table_name = 'quotation_payment_summary'
       LIMIT 1`,
    )
    _hasQuotationPaymentSummaryView = rows.length > 0
  } catch {
    _hasQuotationPaymentSummaryView = false
  }
  return _hasQuotationPaymentSummaryView
}

let _quotationsHasBayColumn
async function quotationsHasBayColumn() {
  if (typeof _quotationsHasBayColumn === 'boolean') return _quotationsHasBayColumn

  try {
    const { rows } = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'quotations'
         AND column_name = 'bay'
       LIMIT 1`,
    )
    _quotationsHasBayColumn = rows.length > 0
  } catch {
    // If introspection fails for any reason, default to safest behavior
    _quotationsHasBayColumn = false
  }
  return _quotationsHasBayColumn
}

let _quotationVatSchemaReady = false
async function ensureQuotationVatSchema() {
  if (_quotationVatSchemaReady) return
  await db.query(`
    ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS apply_vat BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0
  `)
  _quotationVatSchemaReady = true
}

const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
function getBranchCode(bay) {
  if (!bay) return 'BR'
  return BRANCH_CODES[(bay || '').toLowerCase().trim()] || bay.substring(0, 3).toUpperCase()
}

async function nextQuotationNo(client, branchCode = 'BR') {
  const year = new Date().getFullYear()
  const yearShort = String(year).slice(-3)
  const prefix = `QT-${branchCode}-${yearShort}-`
  const { rows } = await client.query(
    `SELECT quotation_no FROM quotations
     WHERE quotation_no LIKE $1
     ORDER BY quotation_no DESC LIMIT 1`,
    [`${prefix}%`],
  )
  const last = rows[0]?.quotation_no
  const seq = last ? parseInt(last.split('-')[3], 10) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// ── GET /quotations ─────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await ensureQuotationVatSchema()
    const usePaymentSummary = await hasQuotationPaymentSummaryView()

    const search   = String(req.query.search || '').trim().toLowerCase()
    const status   = String(req.query.status || '').trim()
    const tab      = req.query.tab ? String(req.query.tab).trim() : null // 'active' | 'history' | null (no filter)
    // bookable=1 → exclude quotations that already have an active (non-cancelled, non-completed)
    // appointment so only unscheduled quotations appear in the new-booking dropdown.
    const bookable = req.query.bookable === '1' || req.query.bookable === 'true'
    const page     = Math.max(Number(req.query.page  || 1), 1)
    const limit    = Math.min(Math.max(Number(req.query.limit || 10), 1), 100)
    const offset   = (page - 1) * limit

    const conditions = []
    const values     = []
    let idx = 1

    if (search) {
      conditions.push(
        `(LOWER(q.quotation_no) LIKE $${idx}
          OR LOWER(c.full_name) LIKE $${idx}
          OR LOWER(v.plate_number) LIKE $${idx}
          OR EXISTS (SELECT 1 FROM job_orders jo WHERE jo.quotation_id = q.id AND LOWER(jo.job_order_no) LIKE $${idx}))`,
      )
      values.push(`%${search}%`)
      idx += 1
    }

    // Tab-based filtering — only applied when tab is explicitly passed and not in bookable mode
    if (tab && !bookable) {
      if (tab === 'history') {
        // History: Not Approved, Cancelled — OR Approved that already has an appointment (scheduled)
        conditions.push(`(
          q.status IN ('Not Approved', 'Cancelled')
          OR (
            q.status = 'Approved'
            AND EXISTS (SELECT 1 FROM appointments a WHERE a.quotation_id = q.id)
          )
        )`)
      } else if (tab === 'active') {
        // Active: Draft, Pending, Sent — OR Approved that has NOT yet been scheduled
        conditions.push(`(
          q.status IN ('Draft', 'Pending', 'Sent')
          OR (
            q.status = 'Approved'
            AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.quotation_id = q.id)
          )
        )`)
      }
    }

    if (status) {
      conditions.push(`q.status = $${idx}`)
      values.push(status)
      idx += 1
    }

    if (bookable) {
      // Exclude quotations that already have ANY appointment (active, completed, or cancelled).
      // A quotation that has ever been scheduled is considered "used" and should not
      // appear in the new-booking dropdown.
      conditions.push(
        `NOT EXISTS (
           SELECT 1 FROM appointments a
           WHERE a.quotation_id = q.id
         )`,
      )
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const paymentJoin = usePaymentSummary
      ? 'LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id'
      : `LEFT JOIN (
           SELECT quotation_id, SUM(amount) AS total_paid
           FROM payments
           WHERE quotation_id IS NOT NULL
           GROUP BY quotation_id
         ) qpay ON qpay.quotation_id = q.id`

    const paymentSelect = usePaymentSummary
      ? `COALESCE(qps.total_paid, 0)::NUMERIC            AS total_paid,
              COALESCE(qps.outstanding_balance, q.total_amount)::NUMERIC AS outstanding_balance,
              COALESCE(qps.payment_status, 'UNPAID')          AS payment_status`
      : `COALESCE(qpay.total_paid, 0)::NUMERIC AS total_paid,
              GREATEST(q.total_amount - COALESCE(qpay.total_paid, 0), 0)::NUMERIC AS outstanding_balance,
              CASE
                WHEN COALESCE(qpay.total_paid, 0) <= 0 THEN 'UNPAID'
                WHEN COALESCE(qpay.total_paid, 0) > q.total_amount THEN 'OVERPAID'
                WHEN COALESCE(qpay.total_paid, 0) >= q.total_amount THEN 'PAID'
                ELSE 'PARTIALLY_PAID'
              END AS payment_status`

    const { rows } = await db.query(
      `SELECT q.*,
              c.full_name   AS customer_name,
              c.mobile      AS customer_mobile,
              c.bay         AS customer_bay,
              v.plate_number,
              v.make, v.model, v.year AS vehicle_year, v.color,
              u.full_name   AS created_by_name,
              (SELECT COUNT(*) FROM job_orders jo WHERE jo.quotation_id = q.id)::int AS job_order_count,
              (SELECT status FROM job_orders jo WHERE jo.quotation_id = q.id ORDER BY id DESC LIMIT 1) AS job_order_status,
              (SELECT job_order_no FROM job_orders jo WHERE jo.quotation_id = q.id ORDER BY id DESC LIMIT 1) AS job_order_no,
              (SELECT COUNT(*) FROM appointments  a  WHERE a.quotation_id  = q.id)::int AS appointment_count,
              ${paymentSelect}
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN vehicles  v ON v.id = q.vehicle_id
       LEFT JOIN users u ON u.id = q.created_by
       ${paymentJoin}
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    )

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN vehicles  v ON v.id = q.vehicle_id
       ${where}`,
      values,
    )

    const total      = countRows[0]?.total || 0
    const totalPages = Math.max(Math.ceil(total / limit), 1)

    res.json({ data: rows, pagination: { page, totalPages, total, limit } })
  }),
)

// ── GET /quotations/:id ─────────────────────────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await ensureQuotationVatSchema()
    const { rows } = await db.query(
      `SELECT q.*,
              c.full_name   AS customer_name,
              c.mobile      AS customer_mobile,
              c.email       AS customer_email,
              c.address     AS customer_address,
              c.bay         AS customer_bay,
              v.plate_number,
              v.make, v.model, v.year AS vehicle_year, v.color, v.variant,
              u.full_name   AS created_by_name
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       JOIN vehicles  v ON v.id = q.vehicle_id
       LEFT JOIN users u ON u.id = q.created_by
       WHERE q.id = $1`,
      [req.params.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Quotation not found' })
    res.json(rows[0])
  }),
)

// ── GET /quotations/customer-balance-check ──────────────────────────────────
// Returns any WITH BALANCE quotations for a customer (unpaid balance check)

router.get(
  '/customer-balance-check',
  asyncHandler(async (req, res) => {
    const { customerId } = req.query
    if (!customerId) return res.status(400).json({ message: 'customerId is required' })

    const usePaymentSummary = await hasQuotationPaymentSummaryView()
    const { rows } = usePaymentSummary
      ? await db.query(
          `SELECT q.id, q.quotation_no, q.status,
                  qps.outstanding_balance, qps.total_amount, qps.total_paid, qps.payment_status
           FROM quotations q
           JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
           WHERE q.customer_id = $1
             AND q.status = 'WITH BALANCE'
             AND qps.outstanding_balance > 0`,
          [customerId],
        )
      : await db.query(
          `SELECT q.id, q.quotation_no, q.status,
                  GREATEST(q.total_amount - COALESCE(p.total_paid, 0), 0)::NUMERIC AS outstanding_balance,
                  q.total_amount,
                  COALESCE(p.total_paid, 0)::NUMERIC AS total_paid,
                  CASE
                    WHEN COALESCE(p.total_paid, 0) <= 0 THEN 'UNPAID'
                    WHEN COALESCE(p.total_paid, 0) > q.total_amount THEN 'OVERPAID'
                    WHEN COALESCE(p.total_paid, 0) >= q.total_amount THEN 'PAID'
                    ELSE 'PARTIALLY_PAID'
                  END AS payment_status
           FROM quotations q
           LEFT JOIN (
             SELECT quotation_id, SUM(amount) AS total_paid
             FROM payments
             WHERE quotation_id IS NOT NULL
             GROUP BY quotation_id
           ) p ON p.quotation_id = q.id
           WHERE q.customer_id = $1
             AND q.status = 'WITH BALANCE'
             AND GREATEST(q.total_amount - COALESCE(p.total_paid, 0), 0) > 0`,
          [customerId],
        )
    res.json({ hasBalance: rows.length > 0, balances: rows })
  }),
)

// ── POST /quotations ────────────────────────────────────────────────────────

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await ensureQuotationVatSchema()
    const { customerId, vehicleId, services, notes, totalAmount, overrideBalance, vehicleSize, coatingProcess, promoCode, bay, applyVat, vatRate, vatAmount } = req.body

    if (!customerId || !vehicleId) {
      return res.status(400).json({ message: 'Customer and vehicle are required' })
    }

    // Ensure quotation is always tied to the vehicle's owner.
    // This prevents portal/admin mismatches when a staff user accidentally picks
    // a vehicle that belongs to a different customer.
    const { rows: vehicleRows } = await db.query(
      'SELECT id, customer_id FROM vehicles WHERE id = $1',
      [vehicleId],
    )
    if (!vehicleRows.length) {
      return res.status(404).json({ message: 'Vehicle not found' })
    }
    const effectiveCustomerId = vehicleRows[0].customer_id

    // Balance guard: block new quotation if customer has unpaid WITH BALANCE quotations
    // Admin can bypass with overrideBalance: true
    const userRole = req.user?.role_name || ''
    if (!overrideBalance) {
      const usePaymentSummary = await hasQuotationPaymentSummaryView()
      const balRows = usePaymentSummary
        ? (
            await db.query(
              `SELECT q.id, q.quotation_no, qps.outstanding_balance
               FROM quotations q
               JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
               WHERE q.customer_id = $1
                 AND q.status = 'WITH BALANCE'
                 AND qps.outstanding_balance > 0`,
              [effectiveCustomerId],
            )
          ).rows
        : (
            await db.query(
              `SELECT q.id, q.quotation_no,
                      GREATEST(q.total_amount - COALESCE(p.total_paid, 0), 0)::NUMERIC AS outstanding_balance
               FROM quotations q
               LEFT JOIN (
                 SELECT quotation_id, SUM(amount) AS total_paid
                 FROM payments
                 WHERE quotation_id IS NOT NULL
                 GROUP BY quotation_id
               ) p ON p.quotation_id = q.id
               WHERE q.customer_id = $1
                 AND q.status = 'WITH BALANCE'
                 AND GREATEST(q.total_amount - COALESCE(p.total_paid, 0), 0) > 0`,
              [effectiveCustomerId],
            )
          ).rows

      if (balRows.length > 0) {
        const total = balRows.reduce((s, r) => s + Number(r.outstanding_balance), 0)
        return res.status(409).json({
          message: `Customer has ${balRows.length} unpaid balance(s) totalling ₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Settle or get Admin override.`,
          hasUnpaidBalance: true,
          balances: balRows,
          totalOutstanding: total,
          canOverride: ['Admin', 'SuperAdmin'].includes(userRole),
        })
      }
    }

    // Promo code validation
    let appliedPromoCode = null
    let discountAmount = 0
    let promo = null
    if (promoCode) {
      const { rows: promoRows } = await db.query(
        `SELECT * FROM promo_codes WHERE UPPER(code) = UPPER($1)`,
        [promoCode],
      )
      promo = promoRows[0]
      if (!promo) return res.status(400).json({ message: 'Promo code not found.' })
      if (!promo.is_active) return res.status(400).json({ message: 'Promo code is no longer active.' })
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ message: 'Promo code has expired.' })
      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) return res.status(400).json({ message: 'Promo code has reached its maximum uses.' })

      const baseTotal = Number(totalAmount) || 0
      discountAmount = promo.discount_type === 'percent'
        ? Math.min((Number(promo.discount_value) / 100) * baseTotal, baseTotal)
        : Math.min(Number(promo.discount_value), baseTotal)
      discountAmount = Math.round(discountAmount * 100) / 100
      appliedPromoCode = promo.code
    }

    // Use the explicitly selected bay (branch) from the form; fall back to customer's profile bay
    let resolvedBay = bay || null
    if (!resolvedBay) {
      const { rows: custBayRows } = await db.query(
        `SELECT bay FROM customers WHERE id = $1`,
        [effectiveCustomerId],
      )
      resolvedBay = custBayRows[0]?.bay || null
    }
    const branchCode = getBranchCode(resolvedBay)

    const applyVatFlag = !!applyVat
    const normalizedVatRate = applyVatFlag ? 12 : 0
    const normalizedVatAmount = applyVatFlag ? Math.max(Number(vatAmount) || 0, 0) : 0

    const hasBayColumn = await quotationsHasBayColumn()

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      const quotationNo = await nextQuotationNo(client, branchCode)

      const finalTotal = Math.max((Number(totalAmount) || 0) - discountAmount, 0)

      const insertColumns = [
        'quotation_no',
        'customer_id',
        'vehicle_id',
        'services',
        'notes',
        'total_amount',
        'created_by',
        'vehicle_size',
        'coating_process',
        'promo_code',
        'discount_amount',
        'apply_vat',
        'vat_rate',
        'vat_amount',
      ]
      const insertValues = [
        quotationNo,
        effectiveCustomerId,
        vehicleId,
        JSON.stringify(services || []),
        notes || null,
        finalTotal,
        req.user?.id || null,
        vehicleSize || 'medium',
        coatingProcess || null,
        appliedPromoCode,
        discountAmount,
        applyVatFlag,
        normalizedVatRate,
        normalizedVatAmount,
      ]
      if (hasBayColumn) {
        insertColumns.push('bay')
        insertValues.push(resolvedBay || null)
      }

      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(',')
      const { rows } = await client.query(
        `INSERT INTO quotations (${insertColumns.join(', ')})
         VALUES (${placeholders})
         RETURNING *`,
        insertValues,
      )

      // Increment promo code uses_count
      if (appliedPromoCode) {
        await client.query(
          `UPDATE promo_codes SET uses_count = uses_count + 1 WHERE UPPER(code) = UPPER($1)`,
          [appliedPromoCode],
        )
      }

      await client.query('COMMIT')

      await writeAuditLog({ userId: req.user?.id, action: 'CREATE', entity: 'quotation', entityId: rows[0].id, meta: { quotationNo } })
      res.status(201).json(rows[0])

      // Non-blocking: send promo confirmation email to customer
      if (appliedPromoCode && promo) {
        ;(async () => {
          try {
            const { rows: custRows } = await db.query(
              'SELECT full_name, email FROM customers WHERE id = $1',
              [effectiveCustomerId],
            )
            const customer = custRows[0]
            if (!customer?.email) return

            const discountLabel =
              promo.discount_type === 'percent'
                ? `${promo.discount_value}% off`
                : `₱${Number(promo.discount_value).toLocaleString('en-PH', { minimumFractionDigits: 2 })} off`

            const servicesHtml = (services || [])
              .map(
                (s) =>
                  `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">${s.name || s.service_name || ''}</td>` +
                  `<td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right">₱${Number(s.total || s.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>`,
              )
              .join('')

            const baseTotal = Number(totalAmount) || 0

            const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc">
<div style="font-family:sans-serif;max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <div style="background:#059669;padding:28px 32px">
    <h1 style="margin:0;color:#fff;font-size:22px">Promo Code Applied!</h1>
    <p style="margin:6px 0 0;color:#d1fae5;font-size:14px">Your discount has been confirmed</p>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#374151;margin:0 0 16px">Hi <strong>${customer.full_name}</strong>,</p>
    <p style="color:#374151;margin:0 0 20px">Your promo code <strong style="color:#059669;font-size:1.05em">${appliedPromoCode}</strong> has been successfully applied to your quotation <strong>${rows[0].quotation_no}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left;font-size:13px;color:#64748b">Service</th><th style="padding:8px;text-align:right;font-size:13px;color:#64748b">Amount</th></tr></thead>
      <tbody>${servicesHtml}</tbody>
      <tfoot>
        <tr><td style="padding:10px 0 4px;color:#64748b">Subtotal</td><td style="padding:10px 0 4px;text-align:right;color:#374151">₱${baseTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
        <tr><td style="padding:4px 0;color:#059669">Discount (${discountLabel})</td><td style="padding:4px 0;text-align:right;color:#059669;font-weight:700">− ₱${Number(discountAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
        <tr style="border-top:2px solid #e2e8f0"><td style="padding:10px 0;font-weight:700;font-size:1.05em">Total</td><td style="padding:10px 0;text-align:right;font-weight:700;font-size:1.15em;color:#1a202c">₱${Number(finalTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>
      </tfoot>
    </table>
    <p style="color:#64748b;font-size:13px;margin:0">Please present this email or your quotation number when you visit us. Your discount will be honored upon service completion.</p>
  </div>
  <div style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:12px;color:#94a3b8">MasterAuto — Thank you for choosing us!</div>
</div>
</body></html>`

            await mailer.sendRawEmail({
              to: customer.email,
              subject: `Promo Code ${appliedPromoCode} Applied — ${rows[0].quotation_no}`,
              html,
              text: `Hi ${customer.full_name}, your promo code ${appliedPromoCode} (${discountLabel}) has been applied to quotation ${rows[0].quotation_no}. Discount: ₱${Number(discountAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Final total: ₱${Number(finalTotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`,
            })
          } catch (emailErr) {
            console.error('[PromoEmail] Failed to send promo confirmation email:', emailErr.message)
          }
        })()
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ── PATCH /quotations/:id/status ────────────────────────────────────────────

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body
    const allowed = ['Draft', 'Sent', 'Pending', 'Approved', 'Not Approved', 'WITH BALANCE']
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${allowed.join(', ')}` })
    }

    // Fetch current quotation to validate transition
    const { rows: current } = await db.query('SELECT * FROM quotations WHERE id = $1', [req.params.id])
    if (!current.length) return res.status(404).json({ message: 'Quotation not found' })
    const quot = current[0]

    // Idempotent: setting the same status should succeed.
    if (String(quot.status) === String(status)) {
      return res.json(quot)
    }

    // Void path: moving a quotation to Not Approved is allowed even if the
    // quotation is currently in a terminal status, but only when there is no
    // active Job Order linked to it.
    if (status === 'Not Approved') {
      const { rows: jos } = await db.query(
        `SELECT id, job_order_no
         FROM job_orders
         WHERE quotation_id = $1
           AND COALESCE(status, '') NOT IN ('Deleted', 'Cancelled', 'Canceled')
         LIMIT 1`,
        [req.params.id],
      )
      if (jos.length) {
        return res.status(409).json({
          message: 'This quotation cannot be modified or deleted because it has a linked Job Order. Remove the Job Order first.',
        })
      }
    }

    // Block mutations on terminal statuses unless it's a special path
    if (QUOTATION_WORKFLOW.terminalStatuses.has(quot.status) && status !== 'Draft' && status !== 'Pending' && status !== 'Not Approved') {
      return res.status(409).json({ message: `Quotation is already in a terminal status (${quot.status}) and cannot be changed.` })
    }

    // When approving, lock the quotation
    const isApproving = status === 'Approved'
    let extraSets = ''
    let extraParams = []

    if (isApproving) {
      extraSets = ', is_locked = TRUE, locked_at = NOW(), locked_by = $3'
      extraParams = [req.user?.id || null]
    } else if (status === 'Sent' && !quot.sent_at) {
      extraSets = ', sent_at = NOW()'
    }

    const { rows } = await db.query(
      `UPDATE quotations SET status = $1${extraSets} WHERE id = $2 RETURNING *`,
      [status, req.params.id, ...extraParams],
    )
    if (!rows.length) return res.status(404).json({ message: 'Quotation not found' })

    await writeAuditLog({ userId: req.user?.id, action: 'UPDATE_STATUS', entity: 'quotation', entityId: rows[0].id, meta: { status, locked: isApproving } })
    res.json(rows[0])

    // ── Fire "Service Confirmation" email when quotation is Approved ─────────
    // Non-blocking: email failure must never break the HTTP response.
    if (isApproving) {
      emailNotificationService
        .sendEmail('quotation_approved', req.user?.id, { quotationId: rows[0].id })
        .catch((err) => console.error('[EmailNotification] quotation_approved error:', err.message))
    }

    // ── Clear email dedup when reset to Pending/Draft so re-approval re-sends ─
    if (status === 'Pending' || status === 'Draft') {
      db.query(
        "DELETE FROM email_notifications WHERE event_type = 'quotation_approved' AND entity_id = $1",
        [rows[0].id],
      ).catch(() => {})
    }
  }),
)

// ── POST /quotations/:id/send ─────────────────────────────────────────────────
// Advances quotation from Draft (or legacy Pending) → Sent.
// Records sent_at timestamp and audit log.

router.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const { rows: existing } = await db.query('SELECT * FROM quotations WHERE id = $1', [req.params.id])
    if (!existing.length) return res.status(404).json({ message: 'Quotation not found' })
    const quot = existing[0]

    const sendableStatuses = ['Draft', 'Pending'] // Pending = legacy Draft
    if (!sendableStatuses.includes(quot.status)) {
      return res.status(409).json({
        message: `Cannot send quotation: current status is "${quot.status}". Only Draft quotations can be sent.`,
      })
    }

    const { rows } = await db.query(
      `UPDATE quotations SET status = 'Sent', sent_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id],
    )

    await writeAuditLog({ userId: req.user?.id, action: 'SEND', entity: 'quotation', entityId: rows[0].id, meta: { from: quot.status, to: 'Sent', sentAt: rows[0].sent_at } })
    res.json(rows[0])
  }),
)

// ── POST /quotations/:id/unlock ───────────────────────────────────────────────
// Admin-only: override the approval lock (e.g. to amend an approved quotation)

router.post(
  '/:id/unlock',
  asyncHandler(async (req, res) => {
    if (!req.user || req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can override the approval lock' })
    }
    const { confirm } = req.body
    if (!confirm) {
      return res.status(400).json({ message: 'Send { "confirm": true } to confirm the lock override' })
    }

    const { rows } = await db.query(
      `UPDATE quotations
       SET is_locked = FALSE,
           lock_override_by = $1,
           lock_override_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.user.id, req.params.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Quotation not found' })

    await writeAuditLog({ userId: req.user.id, action: 'OVERRIDE_LOCK', entity: 'quotation', entityId: rows[0].id, meta: { overriddenBy: req.user.id } })
    res.json({ message: 'Quotation lock removed', quotation: rows[0] })
  }),
)

// ── PATCH /quotations/:id ───────────────────────────────────────────────────

router.patch(
  '/:id',  requireRole('SuperAdmin'),  asyncHandler(async (req, res) => {
    await ensureQuotationVatSchema()
    const { services, notes, totalAmount, vehicleSize, coatingProcess, promoCode, bay, applyVat, vatRate, vatAmount } = req.body

    const { rows: existing } = await db.query(
      'SELECT * FROM quotations WHERE id = $1',
      [req.params.id],
    )
    if (!existing.length) return res.status(404).json({ message: 'Quotation not found' })
    if (existing[0].status === 'Approved') {
      return res.status(409).json({ message: 'Approved quotations cannot be edited' })
    }
    if (existing[0].is_locked) {
      return res.status(423).json({ message: 'Quotation is locked. Use /unlock to remove the lock before editing.' })
    }

    // Promo code validation (only if promo code changed)
    const cur = existing[0]
    let appliedPromoCode = cur.promo_code
    let discountAmount = Number(cur.discount_amount) || 0

    if (promoCode !== undefined) {
      if (!promoCode) {
        // Clear promo code
        appliedPromoCode = null
        discountAmount = 0
      } else {
        const { rows: promoRows } = await db.query(
          `SELECT * FROM promo_codes WHERE UPPER(code) = UPPER($1)`,
          [promoCode],
        )
        const promo = promoRows[0]
        if (!promo) return res.status(400).json({ message: 'Promo code not found.' })
        if (!promo.is_active) return res.status(400).json({ message: 'Promo code is no longer active.' })
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ message: 'Promo code has expired.' })
        if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) return res.status(400).json({ message: 'Promo code has reached its maximum uses.' })

        const baseTotal = Number(totalAmount) || 0
        discountAmount = promo.discount_type === 'percent'
          ? Math.min((Number(promo.discount_value) / 100) * baseTotal, baseTotal)
          : Math.min(Number(promo.discount_value), baseTotal)
        discountAmount = Math.round(discountAmount * 100) / 100
        appliedPromoCode = promo.code

        // Increment uses_count only if this is a new promo code (not the same already stored)
        if (cur.promo_code?.toUpperCase() !== promo.code.toUpperCase()) {
          await db.query(
            `UPDATE promo_codes SET uses_count = uses_count + 1 WHERE UPPER(code) = UPPER($1)`,
            [promo.code],
          )
        }
      }
    }

    const finalTotal = Math.max((Number(totalAmount) || 0) - discountAmount, 0)
    const nextApplyVat = (applyVat === undefined || applyVat === null) ? !!cur.apply_vat : !!applyVat
    const nextVatRate = nextApplyVat ? 12 : 0
    const nextVatAmount = nextApplyVat ? Math.max(Number(vatAmount) || 0, 0) : 0

    const hasBayColumn = await quotationsHasBayColumn()

    const setClauses = [
      'services = $1',
      'notes = $2',
      'total_amount = $3',
      'vehicle_size = $4',
      'coating_process = $5',
      'promo_code = $6',
      'discount_amount = $7',
      'apply_vat = $8',
      'vat_rate = $9',
      'vat_amount = $10',
    ]
    const params = [
      JSON.stringify(services || []),
      notes || null,
      finalTotal,
      vehicleSize || 'medium',
      coatingProcess || null,
      appliedPromoCode,
      discountAmount,
      nextApplyVat,
      nextVatRate,
      nextVatAmount,
    ]

    if (hasBayColumn) {
      setClauses.push(`bay = COALESCE($${params.length + 1}, bay)`)
      params.push(bay || null)
    }

    params.push(req.params.id)
    const whereIdx = params.length

    const { rows } = await db.query(
      `UPDATE quotations
       SET ${setClauses.join(', ')}
       WHERE id = $${whereIdx}
       RETURNING *`,
      params,
    )
    res.json(rows[0])
  }),
)

// ── DELETE /quotations/:id ──────────────────────────────────────────────────

router.delete(
  '/:id',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      'SELECT * FROM quotations WHERE id = $1',
      [req.params.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Quotation not found' })

    // Block delete if any ACTIVE appointment references this quotation.
    const { rows: activeAppts } = await db.query(
      `SELECT id
       FROM appointments
       WHERE quotation_id = $1
         AND COALESCE(status, '') NOT IN ('Deleted', 'Cancelled', 'Canceled')
       LIMIT 1`,
      [req.params.id],
    )
    if (activeAppts.length) {
      return res.status(409).json({
        message: 'Cannot delete this quotation — an appointment is linked to it. Remove or cancel the appointment first.',
      })
    }

    // Block delete if any ACTIVE job order references this quotation (regardless of quotation status)
    const { rows: activeJos } = await db.query(
      `SELECT id, job_order_no
       FROM job_orders
       WHERE quotation_id = $1
         AND COALESCE(status, '') NOT IN ('Deleted', 'Cancelled', 'Canceled')
       LIMIT 1`,
      [req.params.id],
    )
    if (activeJos.length) {
      return res.status(409).json({
        message: `Cannot delete this quotation — Job Order ${activeJos[0].job_order_no} is linked to it. Remove the Job Order first.`,
      })
    }

    // Unlink inactive appointments so we don't leave stale references.
    await db.query(
      `UPDATE appointments
       SET quotation_id = NULL
       WHERE quotation_id = $1
         AND COALESCE(status, '') IN ('Deleted', 'Cancelled', 'Canceled')`,
      [req.params.id],
    )

    // If only inactive JOs remain linked, unlink them so we don't leave stale references.
    await db.query(
      `UPDATE job_orders
       SET quotation_id = NULL
       WHERE quotation_id = $1
         AND COALESCE(status, '') IN ('Deleted', 'Cancelled', 'Canceled')`,
      [req.params.id],
    )
    await db.query('DELETE FROM quotations WHERE id = $1', [req.params.id])
    res.status(204).send()
  }),
)

module.exports = router

