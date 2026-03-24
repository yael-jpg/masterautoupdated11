const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { writeAuditLog } = require('../utils/auditLog')
const { requireRole } = require('../middleware/auth')
const {
  JOB_ORDER_WORKFLOW,
  APPOINTMENT_WORKFLOW,
  validateTransition,
  isTerminal,
  getNextStatus,
} = require('../utils/workflowEngine')
const emailNotificationService = require('../services/emailNotificationService')

const router = express.Router()

// ── Helpers ─────────────────────────────────────────────────────────────────

// Sync the linked appointment forward when a job order advances.
// For each JO status, define what the appointment SHOULD be at minimum.
// If the appointment is behind that target, advance it directly — no role check.
const JO_TO_APPT_TARGET = {
  'In Progress': 'In Progress',
  'For QA':      'For QA',
  'Completed':   'Ready for Release',
  'Released':    'Ready for Release',
  'Complete':    'Completed',           // terminal JO status → close the appointment
}
const APPT_STATUS_ORDER = [
  'Scheduled', 'Checked-In', 'In Progress', 'For QA',
  'Ready for Release', 'Paid', 'Released', 'Completed',
]

async function syncAppointmentFromJobOrder(jo, nextStatus, userId) {
  if (!jo.quotation_id || !JO_TO_APPT_TARGET[nextStatus]) return null
  try {
    const apptTarget     = JO_TO_APPT_TARGET[nextStatus]
    const { rows: apptRows } = await db.query(
      `SELECT id, status FROM appointments
       WHERE quotation_id = $1 AND status NOT IN ('Cancelled', 'Completed') LIMIT 1`,
      [jo.quotation_id],
    )
    if (!apptRows.length) return null
    const appt = apptRows[0]

    const currentApptIdx = APPT_STATUS_ORDER.indexOf(appt.status)
    const targetApptIdx  = APPT_STATUS_ORDER.indexOf(apptTarget)

    // Only advance if appointment is strictly behind the target
    if (currentApptIdx === -1 || targetApptIdx === -1 || currentApptIdx >= targetApptIdx) return null

    const tsCol = APPOINTMENT_WORKFLOW.timestampColumn[apptTarget]
    const sets  = ['status = $2']
    const vals  = [appt.id, apptTarget]
    let i = 3
    if (tsCol) { sets.push(`${tsCol} = $${i}`); vals.push(new Date()); i++ }

    await db.query(`UPDATE appointments SET ${sets.join(', ')} WHERE id = $1`, vals)
    await db.query(
      `INSERT INTO status_transitions
         (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
       VALUES ('appointment', $1, $2, $3, $4, NOW(), $5)`,
      [appt.id, appt.status, apptTarget, userId,
       `Auto-synced from Job Order ${jo.job_order_no} → ${nextStatus}`],
    ).catch(() => {})
    return { id: appt.id, from: appt.status, to: apptTarget }
  } catch (err) {
    console.error('[Appt sync] Failed to sync appointment status:', err.message)
    return null
  }
}

const JO_BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
function getJoBranchCode(bay) {
  if (!bay) return 'BR'
  return JO_BRANCH_CODES[(bay || '').toLowerCase().trim()] || bay.substring(0, 3).toUpperCase()
}

async function nextJobOrderNo(client, branchCode = 'BR') {
  const year = new Date().getFullYear()
  const yearShort = String(year).slice(-3)
  const prefix = `JO-${branchCode}-${yearShort}-`
  const { rows } = await client.query(
    `SELECT job_order_no FROM job_orders
     WHERE job_order_no LIKE $1
     ORDER BY job_order_no DESC LIMIT 1`,
    [`${prefix}%`],
  )
  const last = rows[0]?.job_order_no
  const seq = last ? parseInt(last.split('-')[3], 10) + 1 : 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}

// ── GET /job-orders ─────────────────────────────────────────────────────────

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim()
    // tab=active  → status != 'Complete'  (all live / in-flight job orders)
    // tab=history → status  = 'Complete'  (fully closed job orders)
    const tab    = String(req.query.tab || '').trim().toLowerCase()
    const page   = Math.max(Number(req.query.page  || 1), 1)
    const limit  = Math.min(Math.max(Number(req.query.limit || 10), 1), 100)
    const offset = (page - 1) * limit

    const conditions = []
    const values     = []
    let idx = 1

    if (search) {
      conditions.push(
        `(LOWER(jo.job_order_no) LIKE $${idx}
          OR LOWER(q.quotation_no) LIKE $${idx}
          OR LOWER(c.full_name)   LIKE $${idx}
          OR LOWER(v.plate_number) LIKE $${idx})`,
      )
      values.push(`%${search}%`)
      idx += 1
    }

    if (tab === 'history') {
      // History: fully-closed and cancelled records
      conditions.push(`jo.status IN ($${idx}, $${idx + 1}, $${idx + 2})`)
      values.push('Complete', 'Cancelled', 'Deleted')
      idx += 3
    } else if (tab === 'approval_history') {
      // Approval History: anything that has been approved (pending_at IS NOT NULL)
      // OR job orders pending approval but sufficiently paid (>= 50%)
      conditions.push(`(jo.pending_at IS NOT NULL OR (jo.status = 'Pending JO Approval' AND COALESCE(qps.total_paid, 0) >= (COALESCE(q.total_amount, 0) * 0.5) AND COALESCE(q.total_amount, 0) > 0))`)
    } else if (tab === 'active') {
      // Active: everything except Complete and Cancelled
      conditions.push(`jo.status NOT IN ($${idx}, $${idx + 1}, $${idx + 2})`)
      values.push('Complete', 'Cancelled', 'Deleted')
      idx += 3
      // Allow further status narrowing within the Active tab
      if (status) {
        if (status === 'Pending JO Approval') {
          // Dashboard primary tab: exclude those already 'paid' (they move to history)
          conditions.push(`jo.status = 'Pending JO Approval'`)
          conditions.push(`(COALESCE(qps.total_paid, 0) < (COALESCE(q.total_amount, 0) * 0.5) OR COALESCE(q.total_amount, 0) = 0)`)
        } else {
          conditions.push(`jo.status = $${idx}`)
          values.push(status)
          idx += 1
        }
      }
    } else if (status) {
      // Legacy: no tab, explicit status filter
      conditions.push(`jo.status = $${idx}`)
      values.push(status)
      idx += 1
    }

    const where    = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderBy  = tab === 'history'
      ? 'jo.closed_at DESC NULLS LAST, jo.created_at DESC'
      : tab === 'approval_history'
        ? 'jo.pending_at DESC NULLS LAST, jo.created_at DESC'
        : 'jo.created_at DESC'

    const { rows } = await db.query(
      `SELECT jo.*,
              q.quotation_no,
              q.total_amount  AS quotation_amount,
              q.notes         AS quotation_notes,
              q.status AS quotation_status,
              c.full_name     AS customer_name,
              c.mobile        AS customer_mobile,
              c.bay           AS customer_bay,
              v.plate_number,
              v.make, v.model, v.year AS vehicle_year, v.color,
              a.schedule_start, a.schedule_end, a.booking_source, a.status AS appointment_status,
              u.full_name     AS created_by_name,
              COALESCE(qps.payment_status,
                CASE WHEN a.down_payment_method IS NOT NULL AND a.down_payment_method != 'cash'
                          AND a.down_payment_amount > 0 THEN 'PARTIAL' END,
                'UNPAID')   AS payment_status,
              COALESCE(qps.total_paid,
                CASE WHEN a.down_payment_method != 'cash' THEN a.down_payment_amount ELSE 0 END,
                0)              AS total_paid,
              COALESCE(qps.outstanding_balance, q.total_amount, 0) AS balance
       FROM job_orders jo
       LEFT JOIN quotations q  ON q.id  = jo.quotation_id
       JOIN customers  c  ON c.id  = jo.customer_id
       JOIN vehicles   v  ON v.id  = jo.vehicle_id
       LEFT JOIN users u  ON u.id  = jo.created_by
       LEFT JOIN appointments a ON a.id = jo.schedule_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    )

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM job_orders jo
       LEFT JOIN quotations q ON q.id = jo.quotation_id
       JOIN customers  c ON c.id = jo.customer_id
       JOIN vehicles   v ON v.id = jo.vehicle_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       ${where}`,
      values,
    )

    const total      = countRows[0]?.total || 0
    const totalPages = Math.max(Math.ceil(total / limit), 1)

    res.json({ data: rows, pagination: { page, totalPages, total, limit } })
  }),
)

// ── GET /job-orders/:id ─────────────────────────────────────────────────────

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT jo.*,
              q.quotation_no,
              q.total_amount  AS quotation_amount,
              q.notes         AS quotation_notes,
              q.status        AS quotation_status,
              c.full_name     AS customer_name,
              c.mobile        AS customer_mobile,
              c.email         AS customer_email,
              c.address       AS customer_address,
              v.plate_number,
              v.make, v.model, v.year AS vehicle_year, v.color, v.variant,
              u.full_name     AS created_by_name,
              a.schedule_start,
              a.schedule_end,
              a.bay           AS schedule_bay,
              a.status        AS schedule_status,
              COALESCE(qps.payment_status,
                CASE WHEN a.down_payment_method IS NOT NULL AND a.down_payment_method != 'cash'
                          AND a.down_payment_amount > 0 THEN 'PARTIAL' END,
                'UNPAID')                                        AS payment_status,
              COALESCE(qps.total_paid,
                CASE WHEN a.down_payment_method != 'cash' THEN a.down_payment_amount ELSE 0 END,
                0)                                               AS total_paid,
              COALESCE(qps.outstanding_balance, q.total_amount, 0)  AS balance
       FROM job_orders jo
       LEFT JOIN quotations q ON q.id  = jo.quotation_id
       JOIN customers  c ON c.id  = jo.customer_id
       JOIN vehicles   v ON v.id  = jo.vehicle_id
       LEFT JOIN users u ON u.id  = jo.created_by
       LEFT JOIN appointments a ON a.id = jo.schedule_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       WHERE jo.id = $1`,
      [req.params.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Job Order not found' })
    res.json(rows[0])
  }),
)

// ── POST /job-orders ────────────────────────────────────────────────────────

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { quotationId, scheduleId, assignedInstallers, preparedBy, notes } = req.body

    if (!quotationId) {
      return res.status(400).json({ message: 'quotationId is required' })
    }

    // Enforce: only Approved quotations can generate a Job Order
    const { rows: qRows } = await db.query(
      'SELECT * FROM quotations WHERE id = $1',
      [quotationId],
    )
    if (!qRows.length) return res.status(404).json({ message: 'Quotation not found' })
    const quotation = qRows[0]

    if (quotation.status !== 'Approved') {
      return res.status(409).json({
        message: 'Job Orders can only be created from Approved quotations',
      })
    }

    // Prevent duplicate job orders for same quotation
    const { rows: existing } = await db.query(
      'SELECT id FROM job_orders WHERE quotation_id = $1 LIMIT 1',
      [quotationId],
    )
    if (existing.length) {
      return res.status(409).json({
        message: 'A Job Order already exists for this quotation',
        jobOrderId: existing[0].id,
      })
    }

    // Fetch customer's branch to include in job order number
    const { rows: custBayRows } = await db.query(
      `SELECT bay FROM customers WHERE id = $1`,
      [quotation.customer_id],
    )
    const joBranchCode = getJoBranchCode(custBayRows[0]?.bay)

    // Payment-Based Auto-Approval (Option B):
    // Check if the quotation has >= 50% payment recorded.
    const { rows: qpsRows } = await db.query(
      `SELECT total_paid, outstanding_balance FROM quotation_payment_summary WHERE quotation_id = $1`,
      [quotationId]
    )
    const qpsSummary = qpsRows[0] || { total_paid: 0, outstanding_balance: quotation.total_amount }
    const totalPaidOnQuotation = Number(qpsSummary.total_paid || 0)
    const totalAmountOnQuotation = Number(quotation.total_amount || 0)
    const paidPercentage = totalAmountOnQuotation > 0 ? (totalPaidOnQuotation / totalAmountOnQuotation) * 100 : 0

    // Auto-approve if 50% or more is paid
    const initialStatus = paidPercentage >= 50 ? 'Pending' : 'Pending JO Approval'
    const pendingAt = paidPercentage >= 50 ? new Date() : null

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')
      const jobOrderNo = await nextJobOrderNo(client, joBranchCode)

      const { rows } = await client.query(
        `INSERT INTO job_orders
           (job_order_no, quotation_id, schedule_id, customer_id, vehicle_id,
            services, assigned_installers, prepared_by, notes, status, created_by, pending_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          jobOrderNo,
          quotationId,
          scheduleId || null,
          quotation.customer_id,
          quotation.vehicle_id,
          JSON.stringify(quotation.services || []),
          JSON.stringify(assignedInstallers || []),
          JSON.stringify(preparedBy || []),
          notes || null,
          initialStatus,
          req.user?.id || null,
          pendingAt,
        ],
      )
      await client.query('COMMIT')

      await writeAuditLog({ userId: req.user?.id, action: 'CREATE', entity: 'job_order', entityId: rows[0].id, meta: {
        jobOrderNo,
        quotationId,
      } })
      res.status(201).json(rows[0])
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ── POST /job-orders/:id/transition ─────────────────────────────────────────
//  Primary workflow advancement endpoint.
//  Enforces: sequential order, role-based permissions, payment guard on Release,
//  automatic inventory deduction on Completed, commission calc on Released.

router.post(
  '/:id/transition',
  asyncHandler(async (req, res) => {
    const { status: nextStatus, cancelReason } = req.body
    const userRole = req.user?.role || ''

    if (!nextStatus) {
      return res.status(400).json({ message: 'status is required' })
    }

    // ── 1. Fetch current job order ──────────────────────────────────────────
    const { rows: joRows } = await db.query(
      `SELECT jo.*,
              q.total_amount   AS quotation_total,
              qps.payment_status,
              qps.total_paid,
              qps.outstanding_balance
       FROM job_orders jo
       LEFT JOIN quotations q   ON q.id  = jo.quotation_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       WHERE jo.id = $1`,
      [req.params.id],
    )
    if (!joRows.length) return res.status(404).json({ message: 'Job Order not found' })
    const jo = joRows[0]
    const currentStatus = jo.status

    // ── 2. Validate transition (sequential + role) ──────────────────────────
    let validation = validateTransition(currentStatus, nextStatus, JOB_ORDER_WORKFLOW, userRole)

    // Option B Bypass: allow Admin to advance to 'Pending' IF >= 50% paid
    if (!validation.valid && validation.httpStatus === 403 && nextStatus === 'Pending' && currentStatus === 'Pending JO Approval') {
      const totalAmount = Number(jo.quotation_total || 0)
      const totalPaid   = Number(jo.total_paid || 0)
      const paidPct     = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0
      
      if (paidPct >= 50) {
        validation = { valid: true }
      }
    }

    if (!validation.valid) {
      return res.status(validation.httpStatus || 400).json({ message: validation.message })
    }

    // ── 3b. Cancel guard: status + payment protection ───────────────────────
    if (nextStatus === 'Cancelled') {
      const CANCEL_BLOCKED_STATUSES = ['In Progress', 'For QA', 'Completed', 'Released']
      if (CANCEL_BLOCKED_STATUSES.includes(currentStatus)) {
        return res.status(400).json({
          message: `Cannot cancel a Job Order that is already "${currentStatus}". Only Pending jobs can be cancelled.`,
          cancelBlocked: true,
          blockReason: 'status',
        })
      }
      const PAID_STATUSES = ['PAID', 'PARTIALLY_PAID', 'SETTLED']
      if (PAID_STATUSES.includes(jo.payment_status)) {
        return res.status(400).json({
          message: `Cannot cancel — payment has been received (${jo.payment_status}). Please contact an administrator for exceptions.`,
          cancelBlocked: true,
          blockReason: 'payment',
          payment_status: jo.payment_status,
        })
      }
      if (!cancelReason || !cancelReason.trim()) {
        return res.status(400).json({ message: 'A cancellation reason is required.' })
      }
    }
    const now   = new Date()
    const tsCol = JOB_ORDER_WORKFLOW.timestampColumn[nextStatus]
    const updates = ['status = $2', 'previous_status = $3']
    const values  = [jo.id, nextStatus, currentStatus]
    let   idx     = 4

    if (tsCol) { updates.push(`${tsCol} = $${idx}`); values.push(now); idx++ }
    if (nextStatus === 'Cancelled' && cancelReason) {
      updates.push(`cancel_reason = $${idx}`);    values.push(cancelReason);    idx++
      updates.push(`cancelled_by  = $${idx}`);    values.push(req.user.id);     idx++
    }
    if (nextStatus === 'Completed') { updates.push(`completed_by = $${idx}`); values.push(req.user.id); idx++ }
    if (nextStatus === 'Released')  { updates.push(`released_by  = $${idx}`); values.push(req.user.id); idx++ }

    const client = await db.pool.connect()
    let updatedJo
    try {
      await client.query('BEGIN')

      const { rows } = await client.query(
        `UPDATE job_orders SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
        values,
      )
      updatedJo = rows[0]

      // Cascade: when JO is cancelled, also cancel linked appointment + quotation
      if (nextStatus === 'Cancelled' && jo.quotation_id) {
        const { rows: apptRows } = await client.query(
          `UPDATE appointments
             SET status = 'Cancelled', cancel_reason = $2
           WHERE quotation_id = $1
             AND status NOT IN ('Cancelled', 'Completed')
           RETURNING id, status AS prev_status`,
          [jo.quotation_id, cancelReason || `Job Order ${jo.job_order_no} cancelled`],
        )
        for (const appt of apptRows) {
          await client.query(
            `INSERT INTO status_transitions
               (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
             VALUES ('appointment', $1, $2, 'Cancelled', $3, NOW(), $4)`,
            [appt.id, appt.prev_status, req.user?.id,
             `Auto-cancelled — Job Order ${jo.job_order_no} cancelled`],
          )
        }
        await client.query(
          `UPDATE quotations SET status = 'Cancelled'
           WHERE id = $1 AND status NOT IN ('Cancelled', 'Completed')`,
          [jo.quotation_id],
        )
      }

      // ── 5a. Inventory deduction on Completed/Released (idempotent) ────────
      if (nextStatus === 'Completed' || nextStatus === 'Released') {
        const { rows: alreadyDeducted } = await client.query(
          `SELECT id FROM inventory_movements WHERE job_order_id = $1 AND movement_type = 'OUT' LIMIT 1`,
          [jo.id],
        )
        if (!alreadyDeducted.length) {
          const { rows: parts } = await client.query(
            `SELECT jop.item_id, jop.qty_used, ii.qty_on_hand
             FROM job_order_parts jop
             JOIN inventory_items ii ON ii.id = jop.item_id
             WHERE jop.job_order_id = $1`,
            [jo.id],
          )
          for (const part of parts) {
            const qtyBefore = Number(part.qty_on_hand)
            const qtyAfter  = Math.max(qtyBefore - Number(part.qty_used), 0)
            await client.query(`UPDATE inventory_items SET qty_on_hand = $1 WHERE id = $2`, [qtyAfter, part.item_id])
            await client.query(
              `INSERT INTO inventory_movements
                 (item_id, movement_type, qty, qty_before, qty_after, job_order_id, reference_note, created_by)
               VALUES ($1,'OUT',$2,$3,$4,$5,$6,$7)`,
              [part.item_id, Number(part.qty_used), qtyBefore, qtyAfter, jo.id,
               `Auto-deducted on Job Order ${jo.job_order_no} → ${nextStatus}`, req.user.id],
            )
          }
        }
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // ── 5b. Commission auto-calculation on Released ─────────────────────────
    if (nextStatus === 'Released' && updatedJo) {
      try {
        const installers = Array.isArray(updatedJo.assigned_installers) ? updatedJo.assigned_installers : []
        const services   = Array.isArray(updatedJo.services)            ? updatedJo.services            : []
        const { rows: qRows } = await db.query(
          `SELECT total_amount FROM quotations WHERE id = $1`,
          [updatedJo.quotation_id],
        )
        const quotationTotal = Number(qRows[0]?.total_amount || 0)
        for (const installerId of installers) {
          const { rows: rates } = await db.query(
            `SELECT * FROM installer_commission_rates WHERE user_id = $1 ORDER BY service_code NULLS LAST`,
            [installerId],
          )
          for (const svc of services) {
            const serviceCode = svc.code || null
            const rate = rates.find((r) => r.service_code === serviceCode) || rates.find((r) => !r.service_code)
            if (!rate) continue
            const laborValue       = Number(svc.price || svc.total || quotationTotal)
            const commissionAmount = rate.rate_type === 'fixed'
              ? Number(rate.rate_value)
              : Number(((laborValue * Number(rate.rate_value)) / 100).toFixed(2))
            await db.query(
              `INSERT INTO installer_commissions
                 (job_order_id, user_id, service_code, service_name, labor_value,
                  rate_type, rate_value, commission_amount, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'payable') ON CONFLICT DO NOTHING`,
              [updatedJo.id, installerId, serviceCode, svc.name || null,
               laborValue, rate.rate_type, rate.rate_value, commissionAmount],
            )
          }
        }
      } catch (commErr) {
        console.error('[commissions] auto-calc error:', commErr.message)
      }
    }

    // ── 6. Audit log + status_transitions ──────────────────────────────────
    await writeAuditLog({
      userId:   req.user?.id,
      action:   'JOB_ORDER_TRANSITION',
      entity:   'job_order',
      entityId: updatedJo.id,
      meta:     { from: currentStatus, to: nextStatus, cancelReason },
    })
    await db.query(
      `INSERT INTO status_transitions
         (entity_type, entity_id, from_status, to_status, changed_by, changed_at)
       VALUES ('job_order', $1, $2, $3, $4, NOW())`,
      [updatedJo.id, currentStatus, nextStatus, req.user?.id],
    ).catch((err) => console.error('[status_transitions] insert failed:', err.message))

    // ── 7. Sync linked appointment forward ──────────────────────────────────
    const appointmentSynced = await syncAppointmentFromJobOrder(updatedJo, nextStatus, req.user?.id)

    res.json({
      jobOrder:          updatedJo,
      transition:        { from: currentStatus, to: nextStatus },
      nextAllowedStatus: getNextStatus(nextStatus, JOB_ORDER_WORKFLOW),
      appointmentSynced,
    })

    // ── Fire "Work Started" email when job order → In Progress ─────────────
    if (nextStatus === 'In Progress') {
      emailNotificationService
        .notifyJobStarted(updatedJo.id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] job_started error:', err.message))
    }

    // ── Fire "Job Completed" email when job order → Completed ────────────
    if (nextStatus === 'Completed') {
      emailNotificationService
        .notifyJobCompleted(updatedJo.id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] job_completed error:', err.message))
    }
    // ── Fire "Vehicle Released" email when job order → Released
    if (nextStatus === 'Released') {
      emailNotificationService
        .notifyJobReleased(updatedJo.id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] job_released error:', err.message))
    }  }),
)

// ── POST /job-orders/:id/approve ─────────────────────────────────────────────
router.post(
  '/:id/approve',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT jo.*, q.total_amount 
       FROM job_orders jo 
       LEFT JOIN quotations q ON q.id = jo.quotation_id 
       WHERE jo.id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Job Order not found' })
    const jo = rows[0]

    if (jo.status !== 'Pending JO Approval') {
      return res.status(400).json({ message: 'Only Pending JO Approval can be approved here.' })
    }

    const client = await db.pool.connect()
    let updatedJo
    try {
      await client.query('BEGIN')
      const now = new Date()
      const { rows: updatedRows } = await client.query(
        `UPDATE job_orders 
         SET status = 'Pending', previous_status = $1, required_deposit_amount = NULL, pending_at = $2
         WHERE id = $3 RETURNING *`,
        [jo.status, now, jo.id]
      )
      updatedJo = updatedRows[0]
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    
    await writeAuditLog({ userId: req.user?.id, action: 'JOB_ORDER_APPROVED', entity: 'job_order', entityId: updatedJo.id, meta: { from: jo.status, to: 'Pending' } })
    res.json(updatedJo)
  })
)

// ── PATCH /job-orders/:id/status ─────────────────────────────────────────────
// Legacy endpoint — delegates to POST /:id/transition workflow logic.
// Kept for backward compatibility with existing frontend calls.
// NOW enforces sequential workflow + role permissions (was previously unguarded).

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status: nextStatus, cancelReason } = req.body
    const userRole = req.user?.role || ''

    if (!nextStatus) {
      return res.status(400).json({ message: 'status is required' })
    }

    // Fetch current state with financials
    const { rows: joRows } = await db.query(
      `SELECT jo.*,
              q.total_amount   AS quotation_total,
              qps.payment_status,
              qps.total_paid,
              qps.outstanding_balance
       FROM job_orders jo
       LEFT JOIN quotations q   ON q.id  = jo.quotation_id
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       WHERE jo.id = $1`,
      [req.params.id],
    )
    if (!joRows.length) return res.status(404).json({ message: 'Job Order not found' })
    const jo = joRows[0]
    const currentStatus = jo.status

    // Workflow validation (sequential + role)
    let validation = validateTransition(currentStatus, nextStatus, JOB_ORDER_WORKFLOW, userRole)

    // Option B Bypass: allow Admin to advance to 'Pending' IF >= 50% paid
    if (!validation.valid && validation.httpStatus === 403 && nextStatus === 'Pending' && currentStatus === 'Pending JO Approval') {
      const totalAmount = Number(jo.quotation_total || 0)
      const totalPaid   = Number(jo.total_paid || 0)
      const paidPct     = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0
      
      if (paidPct >= 50) {
        validation = { valid: true }
      }
    }

    if (!validation.valid) {
      return res.status(validation.httpStatus || 400).json({ message: validation.message })
    }

    // Cancel guard: status + payment protection
    if (nextStatus === 'Cancelled') {
      const CANCEL_BLOCKED_STATUSES = ['In Progress', 'For QA', 'Completed', 'Released']
      if (CANCEL_BLOCKED_STATUSES.includes(currentStatus)) {
        return res.status(400).json({
          message: `Cannot cancel a Job Order that is already "${currentStatus}". Only Pending jobs can be cancelled.`,
          cancelBlocked: true,
          blockReason: 'status',
        })
      }
      const PAID_STATUSES = ['PAID', 'PARTIALLY_PAID', 'SETTLED']
      if (PAID_STATUSES.includes(jo.payment_status)) {
        return res.status(400).json({
          message: `Cannot cancel — payment has been received (${jo.payment_status}). Please contact an administrator for exceptions.`,
          cancelBlocked: true,
          blockReason: 'payment',
          payment_status: jo.payment_status,
        })
      }
      if (!cancelReason || !cancelReason.trim()) {
        return res.status(400).json({ message: 'A cancellation reason is required.' })
      }
    }

    const now   = new Date()
    const tsCol = JOB_ORDER_WORKFLOW.timestampColumn[nextStatus]
    const sets  = ['status = $2', 'previous_status = $3']
    const vals  = [jo.id, nextStatus, currentStatus]
    let   i     = 4

    if (tsCol)                    { sets.push(`${tsCol} = $${i}`);    vals.push(now);          i++ }
    if (nextStatus === 'Cancelled' && cancelReason) {
      sets.push(`cancel_reason = $${i}`); vals.push(cancelReason); i++
      sets.push(`cancelled_by = $${i}`);  vals.push(req.user?.id); i++
    }
    if (nextStatus === 'Completed') { sets.push(`completed_by = $${i}`); vals.push(req.user?.id); i++ }
    if (nextStatus === 'Released')  { sets.push(`released_by  = $${i}`); vals.push(req.user?.id); i++ }

    const client = await db.pool.connect()
    let updatedJo
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `UPDATE job_orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        vals,
      )
      updatedJo = rows[0]

      // Cascade: when JO is cancelled, also cancel linked appointment + quotation
      if (nextStatus === 'Cancelled' && jo.quotation_id) {
        const { rows: apptRows } = await client.query(
          `UPDATE appointments
             SET status = 'Cancelled', cancel_reason = $2
           WHERE quotation_id = $1
             AND status NOT IN ('Cancelled', 'Completed')
           RETURNING id, status AS prev_status`,
          [jo.quotation_id, cancelReason || `Job Order ${jo.job_order_no} cancelled`],
        )
        for (const appt of apptRows) {
          await client.query(
            `INSERT INTO status_transitions
               (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
             VALUES ('appointment', $1, $2, 'Cancelled', $3, NOW(), $4)`,
            [appt.id, appt.prev_status, req.user?.id,
             `Auto-cancelled — Job Order ${jo.job_order_no} cancelled`],
          )
        }
        await client.query(
          `UPDATE quotations SET status = 'Cancelled'
           WHERE id = $1 AND status NOT IN ('Cancelled', 'Completed')`,
          [jo.quotation_id],
        )
      }

      // Inventory deduction (idempotent, triggers on Completed or Released)
      if (nextStatus === 'Completed' || nextStatus === 'Released') {
        const { rows: deducted } = await client.query(
          `SELECT id FROM inventory_movements WHERE job_order_id = $1 AND movement_type = 'OUT' LIMIT 1`,
          [jo.id],
        )
        if (!deducted.length) {
          const { rows: parts } = await client.query(
            `SELECT jop.item_id, jop.qty_used, ii.qty_on_hand
             FROM job_order_parts jop
             JOIN inventory_items ii ON ii.id = jop.item_id
             WHERE jop.job_order_id = $1`,
            [jo.id],
          )
          for (const part of parts) {
            const qtyBefore = Number(part.qty_on_hand)
            const qtyAfter  = Math.max(qtyBefore - Number(part.qty_used), 0)
            await client.query(`UPDATE inventory_items SET qty_on_hand = $1 WHERE id = $2`, [qtyAfter, part.item_id])
            await client.query(
              `INSERT INTO inventory_movements (item_id, movement_type, qty, qty_before, qty_after, job_order_id, reference_note, created_by)
               VALUES ($1,'OUT',$2,$3,$4,$5,$6,$7)`,
              [part.item_id, Number(part.qty_used), qtyBefore, qtyAfter, jo.id,
               `Auto-deducted on Job Order ${jo.job_order_no} → ${nextStatus}`, req.user?.id],
            )
          }
        }
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Commission calc on Released
    if (nextStatus === 'Released' && updatedJo) {
      try {
        const installers = Array.isArray(updatedJo.assigned_installers) ? updatedJo.assigned_installers : []
        const services   = Array.isArray(updatedJo.services)            ? updatedJo.services            : []
        const { rows: qRows } = await db.query(`SELECT total_amount FROM quotations WHERE id = $1`, [updatedJo.quotation_id])
        const quotationTotal = Number(qRows[0]?.total_amount || 0)
        for (const installerId of installers) {
          const { rows: rates } = await db.query(`SELECT * FROM installer_commission_rates WHERE user_id = $1 ORDER BY service_code NULLS LAST`, [installerId])
          for (const svc of services) {
            const serviceCode = svc.code || null
            const rate = rates.find((r) => r.service_code === serviceCode) || rates.find((r) => !r.service_code)
            if (!rate) continue
            const laborValue       = Number(svc.price || svc.total || quotationTotal)
            const commissionAmount = rate.rate_type === 'fixed'
              ? Number(rate.rate_value)
              : Number(((laborValue * Number(rate.rate_value)) / 100).toFixed(2))
            await db.query(
              `INSERT INTO installer_commissions (job_order_id, user_id, service_code, service_name, labor_value, rate_type, rate_value, commission_amount, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'payable') ON CONFLICT DO NOTHING`,
              [updatedJo.id, installerId, serviceCode, svc.name || null, laborValue, rate.rate_type, rate.rate_value, commissionAmount],
            )
          }
        }
      } catch (commErr) {
        console.error('[commissions] auto-calc error:', commErr.message)
      }
    }

    await writeAuditLog({ userId: req.user?.id, action: 'JOB_ORDER_TRANSITION', entity: 'job_order', entityId: updatedJo.id, meta: { from: currentStatus, to: nextStatus } })
    await db.query(
      `INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, changed_by, changed_at)
       VALUES ('job_order', $1, $2, $3, $4, NOW())`,
      [updatedJo.id, currentStatus, nextStatus, req.user?.id],
    ).catch((err) => console.error('[status_transitions] insert failed:', err.message))

    const appointmentSynced = await syncAppointmentFromJobOrder(updatedJo, nextStatus, req.user?.id)

    res.json({ ...updatedJo, appointmentSynced })

    // ── Fire "Work Started" email when job order → In Progress ─────────────
    // Non-blocking: email failure must never break the HTTP response.
    if (nextStatus === 'In Progress') {
      emailNotificationService
        .notifyJobStarted(updatedJo.id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] job_started (legacy) error:', err.message))
    }

    // ── Fire "Job Completed" email when job order → Completed
    if (nextStatus === 'Completed') {
      emailNotificationService
        .notifyJobCompleted(updatedJo.id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] job_completed (legacy) error:', err.message))
    }

    // ── Fire "Vehicle Released" email when job order → Released
    if (nextStatus === 'Released') {
      emailNotificationService
        .notifyJobReleased(updatedJo.id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] job_released (legacy) error:', err.message))
    }
  }),
)

// ── POST /job-orders/:id/force-release ────────────────────────────────────────

router.post(
  '/:id/force-release',
  asyncHandler(async (req, res) => {
    const userRole = req.user?.role || ''
    if (!['Admin', 'SuperAdmin'].includes(userRole)) {
      return res.status(403).json({ message: 'Only Managers and Admins can conditionally release a Job Order.' })
    }

    const { overrideReason } = req.body
    if (!overrideReason?.trim()) {
      return res.status(400).json({ message: 'overrideReason is required' })
    }

    const { rows: joRows } = await db.query(
      `SELECT jo.*,
              qps.payment_status, qps.total_amount, qps.total_paid, qps.outstanding_balance
       FROM job_orders jo
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       WHERE jo.id = $1`,
      [req.params.id],
    )
    if (!joRows.length) return res.status(404).json({ message: 'Job Order not found' })
    const jo = joRows[0]
    if (jo.status === 'Released') return res.status(400).json({ message: 'Job Order already released' })

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Release job order
      const { rows } = await client.query(
        `UPDATE job_orders SET status = 'Released' WHERE id = $1 RETURNING *`,
        [req.params.id],
      )

      // 2. Mark quotation WITH BALANCE
      if (jo.quotation_id) {
        await client.query(
          `UPDATE quotations SET status = 'WITH BALANCE' WHERE id = $1`,
          [jo.quotation_id],
        )
      }

      // 3. Log to conditional_releases
      const now = new Date()
      await client.query(
        `INSERT INTO conditional_releases
           (entity_type, entity_id, quotation_id, customer_id, approved_by, approved_at,
            reason, total_amount, total_paid, outstanding_balance)
         VALUES ('job_order', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          jo.id,
          jo.quotation_id || null,
          jo.customer_id,
          req.user.id,
          now,
          overrideReason,
          jo.total_amount || 0,
          jo.total_paid || 0,
          jo.outstanding_balance || 0,
        ],
      )

      await client.query('COMMIT')

      await writeAuditLog({
        userId: req.user.id,
        action: 'CONDITIONAL_RELEASE',
        entity: 'job_order',
        entityId: jo.id,
        meta: {
          overrideReason,
          paymentStatus: jo.payment_status,
          totalAmount: jo.total_amount,
          totalPaid: jo.total_paid,
          outstandingBalance: jo.outstanding_balance,
        },
      })

      await db.query(
        `INSERT INTO status_transitions
           (entity_type, entity_id, from_status, to_status, changed_by, changed_at,
            is_override, override_reason)
         VALUES ('job_order', $1, $2, 'Released', $3, NOW(), TRUE, $4)`,
        [jo.id, jo.status, req.user.id, overrideReason],
      ).catch((err) => console.error('[status_transitions] insert failed:', err.message))

      // Auto-calculate commissions (same as normal release)
      try {
        const installers = Array.isArray(jo.assigned_installers) ? jo.assigned_installers : []
        const services   = Array.isArray(jo.services)            ? jo.services            : []
        const { rows: qRows } = await db.query(`SELECT total_amount FROM quotations WHERE id = $1`, [jo.quotation_id])
        const quotationTotal = Number(qRows[0]?.total_amount || 0)
        for (const installerId of installers) {
          const { rows: rates } = await db.query(`SELECT * FROM installer_commission_rates WHERE user_id = $1 ORDER BY service_code NULLS LAST`, [installerId])
          for (const svc of services) {
            const serviceCode = svc.code || null
            const rate = rates.find(r => r.service_code === serviceCode) || rates.find(r => !r.service_code)
            if (!rate) continue
            const laborValue = Number(svc.price || svc.total || quotationTotal)
            const commissionAmount = rate.rate_type === 'fixed'
              ? Number(rate.rate_value)
              : Number(((laborValue * Number(rate.rate_value)) / 100).toFixed(2))
            await db.query(
              `INSERT INTO installer_commissions (job_order_id, user_id, service_code, service_name, labor_value, rate_type, rate_value, commission_amount, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'payable') ON CONFLICT DO NOTHING`,
              [jo.id, installerId, serviceCode, svc.name || null, laborValue, rate.rate_type, rate.rate_value, commissionAmount],
            )
          }
        }
      } catch (commErr) {
        console.error('[commissions] conditional-release auto-calc error:', commErr.message)
      }

      return res.json({
        jobOrder: rows[0],
        override: true,
        overrideReason,
        totalAmount: jo.total_amount,
        totalPaid: jo.total_paid,
        outstandingBalance: jo.outstanding_balance,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ── PATCH /job-orders/:id ───────────────────────────────────────────────────

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { assignedInstallers, preparedBy, notes } = req.body

    const preparedByJson = preparedBy === undefined ? null : JSON.stringify(preparedBy || [])

    const { rows } = await db.query(
      `UPDATE job_orders
       SET assigned_installers = $1,
           prepared_by = COALESCE($2::jsonb, prepared_by),
           notes = $3
       WHERE id = $4
       RETURNING *`,
      [
        JSON.stringify(assignedInstallers || []),
        preparedByJson,
        notes || null,
        req.params.id,
      ],
    )
    if (!rows.length) return res.status(404).json({ message: 'Job Order not found' })
    res.json(rows[0])

    // ── Re-send "Work Started" email when installers are updated on an In-Progress job
    // Uses resend:true so the email goes out with the updated technician list.
    if (rows[0].status === 'In Progress') {
      emailNotificationService
        .notifyJobStarted(rows[0].id, req.user?.id, { resend: true })
        .catch((err) => console.error('[EmailNotification] job_started (installer update) error:', err.message))
    }

    // ── Send "Technician Assigned" email when installers are saved on a Pending job
    // Always re-sends (clears old dedup record) so the customer gets the latest team.
    if (rows[0].status === 'Pending') {
      emailNotificationService
        .notifyTechnicianAssigned(rows[0].id, req.user?.id)
        .catch((err) => console.error('[EmailNotification] technician_assigned error:', err.message))
    }
  }),
)

// ── DELETE /job-orders/:id ─────────────────────────────────────────────────
// Soft-delete a Job Order (SuperAdmin only).
// Only Pending jobs may be deleted — all others must go through cancel/complete.
// Moves linked quotation to History status and marks job order as Deleted.
router.delete(
  '/:id',
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const userRole = req.user?.role || ''

    const { rows: joRows } = await db.query(
      `SELECT jo.*, qps.payment_status
       FROM job_orders jo
       LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = jo.quotation_id
       WHERE jo.id = $1`,
      [req.params.id],
    )
    if (!joRows.length) return res.status(404).json({ message: 'Job Order not found' })
    const jo = joRows[0]

    if (!['Pending', 'Cancelled'].includes(jo.status)) {
      return res.status(409).json({
        message: `Cannot delete a Job Order with status "${jo.status}". Only Pending or Cancelled jobs can be deleted.`,
      })
    }

    const PAID_STATUSES = ['PAID', 'PARTIALLY_PAID', 'SETTLED']
    if (PAID_STATUSES.includes(jo.payment_status)) {
      return res.status(409).json({
        message: `Cannot delete — payment has been received (${jo.payment_status}). Please contact an administrator for exceptions.`,
      })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // Cancel linked appointments and move quotation to History status
      if (jo.quotation_id) {
        const { rows: apptRows } = await client.query(
          `UPDATE appointments
             SET status = 'Cancelled',
                 cancel_reason = $2
           WHERE quotation_id = $1
             AND status NOT IN ('Cancelled', 'Completed')
           RETURNING id, status AS prev_status`,
          [jo.quotation_id, `Job Order ${jo.job_order_no} deleted`],
        )
        for (const appt of apptRows) {
          await client.query(
            `INSERT INTO status_transitions
               (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
             VALUES ('appointment', $1, $2, 'Cancelled', $3, NOW(), $4)`,
            [appt.id, appt.prev_status, req.user?.id,
             `Auto-cancelled — Job Order ${jo.job_order_no} deleted`],
          )
        }
        // Move quotation to History status
        await client.query(
          `UPDATE quotations SET status = 'History'
           WHERE id = $1`,
          [jo.quotation_id],
        )
        // Move associated payments to History status
        await client.query(
          `UPDATE payments SET status = 'History'
           WHERE quotation_id = $1`,
          [jo.quotation_id],
        )
      }

      // Mark the job order as Deleted (soft delete via status update)
      await client.query(
        `UPDATE job_orders SET status = 'Deleted' WHERE id = $1`,
        [jo.id],
      )

      await client.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'DELETE_JOB_ORDER', 'job_orders', $2, $3, NOW())`,
        [req.user?.id, jo.id,
         `Deleted Job Order ${jo.job_order_no} (was ${jo.status}) by ${req.user?.email || 'user'}`],
      ).catch(() => {})

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return res.status(204).send()
  }),
)

module.exports = router

