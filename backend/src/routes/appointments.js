const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { validateRequest } = require('../middleware/validateRequest')
const emailNotificationService = require('../services/emailNotificationService')
const { writeAuditLog } = require('../utils/auditLog')
const { requireAuth, requireRole } = require('../middleware/auth')
const { sendReadyForReleaseEmail, sendReceiptEmail, sendCompletionEmail, sendCancellationEmail, sendBookingConfirmationEmail, sendQuotationApprovedScheduledEmail } = require('../services/mailer')
const ConfigurationService = require('../services/configurationService')
const {
  APPOINTMENT_WORKFLOW,
  JOB_ORDER_WORKFLOW,
  validateTransition,
  isTerminal,
} = require('../utils/workflowEngine')

const router = express.Router()

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

let _hasSaleFinancialSummaryView
async function hasSaleFinancialSummaryView() {
  if (typeof _hasSaleFinancialSummaryView === 'boolean') return _hasSaleFinancialSummaryView
  try {
    const { rows } = await db.query(
      `SELECT 1
       FROM information_schema.views
       WHERE table_schema = 'public'
         AND table_name = 'sale_financial_summary'
       LIMIT 1`,
    )
    _hasSaleFinancialSummaryView = rows.length > 0
  } catch {
    _hasSaleFinancialSummaryView = false
  }
  return _hasSaleFinancialSummaryView
}

// Derived from workflowEngine — kept as local aliases for backward compatibility
const STATUS_ORDER     = APPOINTMENT_WORKFLOW.statusOrder
const STATUS_TIMESTAMP = APPOINTMENT_WORKFLOW.timestampColumn

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const useQuotationPaymentSummary = await hasQuotationPaymentSummaryView()
    const useSaleFinancialSummary = await hasSaleFinancialSummaryView()

    const search = String(req.query.search || '').trim().toLowerCase()
    const status = String(req.query.status || '').trim()
    // tab=active  → all records where status != 'Completed' (live/working bookings)
    // tab=history → only records where status = 'Completed'
    // Omitting tab (or any other value) returns unfiltered results (existing callers unaffected)
    const tab = String(req.query.tab || '').trim().toLowerCase()
    const dateFrom = String(req.query.dateFrom || '').trim()
    const dateTo = String(req.query.dateTo || '').trim()
    // Default to newest-first so new bookings (including portal) show at the top
    const sortByInput = String(req.query.sortBy || 'createdAt').trim()
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    const page = Math.max(Number(req.query.page || 1), 1)
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100)
    const offset = (page - 1) * limit

    const sortByMap = {
      scheduleStart: 'a.schedule_start',
      status: 'a.status',
      customer: 'c.full_name',
      plate: 'v.plate_number',
      createdAt: 'a.created_at',
      completedAt: 'a.completed_at',
      cancelledAt: 'a.cancelled_at',
      cancelRequestedAt: 'a.cancel_requested_at',
    }

    const computeSort = (sortByKey) => {
      const sortBy = sortByMap[sortByKey] || sortByMap.scheduleStart
      const nullsClause = (sortByKey === 'completedAt' || sortByKey === 'cancelledAt' || sortByKey === 'cancelRequestedAt')
        ? (sortDir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST')
        : ''
      return { sortBy, nullsClause }
    }

    let { sortBy, nullsClause } = computeSort(sortByInput)

    const conditions = []
    const values = []
    let index = 1

    if (search) {
      conditions.push(
        `(LOWER(COALESCE(c.full_name, '')) LIKE $${index}
          OR LOWER(COALESCE(v.plate_number, '')) LIKE $${index}
          OR LOWER(COALESCE(a.bay, '')) LIKE $${index}
          OR LOWER(COALESCE(a.installer_team, '')) LIKE $${index})`,
      )
      values.push(`%${search}%`)
      index += 1
    }

    // Tab-based filtering (mutually exclusive with explicit status param)
    if (tab === 'history') {
      // History tab: Completed + Cancelled bookings
      conditions.push(`a.status IN ($${index}, $${index + 1})`)
      values.push('Completed', 'Cancelled')
      index += 2
    } else if (tab === 'active') {
      // Active tab: everything except Completed and Cancelled
      conditions.push(`a.status NOT IN ($${index}, $${index + 1})`)
      values.push('Completed', 'Cancelled')
      index += 2
      // Allow further narrowing by specific status within Active
      if (status) {
        conditions.push(`a.status = $${index}`)
        values.push(status)
        index += 1
      }
    } else if (status) {
      // Legacy: no tab, explicit status filter
      conditions.push(`a.status = $${index}`)
      values.push(status)
      index += 1
    }

    if (dateFrom) {
      conditions.push(`a.schedule_start >= $${index}::date`)
      values.push(dateFrom)
      index += 1
    }

    if (dateTo) {
      conditions.push(`a.schedule_start < ($${index}::date + INTERVAL '1 day')`)
      values.push(dateTo)
      index += 1
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const salesPaymentJoin = useSaleFinancialSummary
      ? 'LEFT JOIN sale_financial_summary fs ON fs.sale_id = s.id'
      : `LEFT JOIN (
           SELECT sale_id, SUM(amount) AS total_paid
           FROM payments
           WHERE sale_id IS NOT NULL
           GROUP BY sale_id
         ) spay ON spay.sale_id = a.sale_id`

    const salesPaymentStatusExpr = useSaleFinancialSummary
      ? 'fs.payment_status'
      : `CASE
           WHEN COALESCE(spay.total_paid, 0) <= 0 THEN 'UNPAID'
           WHEN COALESCE(spay.total_paid, 0) > s.total_amount THEN 'OVERPAID'
           WHEN COALESCE(spay.total_paid, 0) >= s.total_amount THEN 'PAID'
           ELSE 'PARTIALLY_PAID'
         END`

    const salesTotalPaidExpr = useSaleFinancialSummary ? 'fs.total_paid' : 'COALESCE(spay.total_paid, 0)'
    const salesOutstandingExpr = useSaleFinancialSummary
      ? 'fs.outstanding_balance'
      : 'GREATEST(s.total_amount - COALESCE(spay.total_paid, 0), 0)'

    const quotationPaymentJoin = useQuotationPaymentSummary
      ? 'LEFT JOIN quotation_payment_summary qfs ON qfs.quotation_id = a.quotation_id'
      : `LEFT JOIN (
           SELECT quotation_id, SUM(amount) AS total_paid
           FROM payments
           WHERE quotation_id IS NOT NULL
           GROUP BY quotation_id
         ) qpay ON qpay.quotation_id = a.quotation_id`

    const quotationPaymentStatusExpr = useQuotationPaymentSummary
      ? 'qfs.payment_status'
      : `CASE
           WHEN COALESCE(qpay.total_paid, 0) <= 0 THEN 'UNPAID'
           WHEN COALESCE(qpay.total_paid, 0) > q.total_amount THEN 'OVERPAID'
           WHEN COALESCE(qpay.total_paid, 0) >= q.total_amount THEN 'PAID'
           ELSE 'PARTIALLY_PAID'
         END`

    const quotationTotalPaidExpr = useQuotationPaymentSummary ? 'qfs.total_paid' : 'COALESCE(qpay.total_paid, 0)'
    const quotationOutstandingExpr = useQuotationPaymentSummary
      ? 'qfs.outstanding_balance'
      : 'GREATEST(q.total_amount - COALESCE(qpay.total_paid, 0), 0)'

    const groupByPaymentFields = [
      useSaleFinancialSummary ? 'fs.payment_status, fs.total_paid, fs.outstanding_balance' : 'spay.total_paid',
      useQuotationPaymentSummary ? 'qfs.payment_status, qfs.total_paid, qfs.outstanding_balance' : 'qpay.total_paid',
    ].join(', ')

    const buildListSql = () => (
      `SELECT a.*,
              c.full_name AS customer_name,
              v.plate_number,
              sv.name AS service_name,
              s.reference_no AS sale_reference,
              s.is_locked AS sale_locked,
              q.status AS quotation_status,
              COALESCE(${salesPaymentStatusExpr}, ${quotationPaymentStatusExpr},
                CASE WHEN a.down_payment_method IS NOT NULL AND a.down_payment_method != 'cash'
                          AND a.down_payment_amount > 0 THEN 'PARTIAL' END,
                'UNPAID')                                                     AS payment_status,
              COALESCE(${salesTotalPaidExpr}, ${quotationTotalPaidExpr},
                CASE WHEN a.down_payment_method IS NOT NULL AND a.down_payment_method != 'cash'
                          THEN a.down_payment_amount ELSE 0 END,
                0)::NUMERIC                                                   AS total_paid,
              COALESCE(${salesOutstandingExpr}, ${quotationOutstandingExpr},
                       s.total_amount, q.total_amount, 0)::NUMERIC           AS outstanding_balance,
              STRING_AGG(si.item_name, ' | '
                ORDER BY si.id)                                              AS all_services
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN services sv ON sv.id = a.service_id
       LEFT JOIN sales s ON s.id = a.sale_id
       ${salesPaymentJoin}
       LEFT JOIN sale_items si ON si.sale_id = a.sale_id
       LEFT JOIN quotations q ON q.id = a.quotation_id
       ${quotationPaymentJoin}
       ${whereClause}
       GROUP BY a.id, c.full_name, v.plate_number, sv.name,
                s.reference_no, s.is_locked, s.total_amount,
                ${groupByPaymentFields},
                q.total_amount, q.status
      ORDER BY ${sortBy} ${sortDir} ${nullsClause}, a.id DESC
       LIMIT $${index}
       OFFSET $${index + 1}`
    )

    let rows
    try {
      const resList = await db.query(buildListSql(), [...values, limit, offset])
      rows = resList.rows
    } catch (err) {
      // If schema migrations haven't been applied yet, the portal cancellation columns may not exist.
      // Instead of crashing the UI, fall back to a safe sort.
      const msg = String(err?.message || '')
      if (String(err?.code) === '42703' && sortByInput === 'cancelRequestedAt' && msg.includes('cancel_requested_at')) {
        ;({ sortBy, nullsClause } = computeSort('createdAt'))
        const resList = await db.query(buildListSql(), [...values, limit, offset])
        rows = resList.rows
      } else {
        throw err
      }
    }

    const count = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles v ON v.id = a.vehicle_id
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

// GET /appointments/:id — fetch a single appointment with common display fields
router.get(
  '/:id',
  requireAuth,
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const { rows } = await db.query(
      `SELECT a.*,
              c.full_name    AS customer_name,
              v.plate_number AS plate_number,
              sv.name        AS service_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles  v ON v.id = a.vehicle_id
       LEFT JOIN services sv ON sv.id = a.service_id
       WHERE a.id = $1
       LIMIT 1`,
      [id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Appointment not found' })
    return res.json(rows[0])
  }),
)

router.post(
  '/',
  body('customerId').isInt({ min: 1 }).withMessage('customerId is required'),
  body('vehicleId').isInt({ min: 1 }).withMessage('vehicleId is required'),
  // serviceId is optional when a saleId is provided — resolved automatically from the sale
  body('serviceId').optional({ nullable: true }).isInt({ min: 1 }),
  body('scheduleStart').isISO8601().withMessage('scheduleStart must be valid datetime'),
  body('status').optional().isString().notEmpty(),
  body('saleId').optional().isInt({ min: 1 }),
  body('quotationId').optional().isInt({ min: 1 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    let {
      customerId,
      vehicleId,
      serviceId,
      scheduleStart,
      scheduleEnd,
      bay,
      installerTeam,
      status = 'Scheduled',
      notificationChannel,
      saleId,
      quotationId,
      notes,
    } = req.body

    // Resolve service from quotation (preferred) or legacy sale
    if (!serviceId && quotationId) {
      const { rows: qRows } = await db.query(
        `SELECT services, sv.id AS linked_service_id
         FROM quotations q
         LEFT JOIN services sv
           ON sv.name = ANY(SELECT jsonb_array_elements(q.services::jsonb)->>'name')
         WHERE q.id = $1
         LIMIT 1`,
        [quotationId],
      )
      if (qRows.length && qRows[0].linked_service_id) {
        serviceId = qRows[0].linked_service_id
      }
    } else if (!serviceId && saleId) {
      const { rows: saleRows } = await db.query(
        `SELECT s.service_package,
                sv.id AS linked_service_id
         FROM sales s
         LEFT JOIN services sv
           ON LOWER(sv.name) = LOWER(s.service_package)
           OR LOWER(s.service_package) LIKE '%' || LOWER(sv.name) || '%'
         WHERE s.id = $1
         LIMIT 1`,
        [saleId],
      )
      if (saleRows.length && saleRows[0].linked_service_id) {
        serviceId = saleRows[0].linked_service_id
      }
    }

    const { rows } = await db.query(
      `INSERT INTO appointments (
        customer_id, vehicle_id, service_id, schedule_start, schedule_end,
        bay, installer_team, status, notification_channel, sale_id, quotation_id, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        customerId,
        vehicleId,
        serviceId,
        scheduleStart,
        scheduleEnd,
        bay,
        installerTeam,
        status,
        notificationChannel,
        quotationId ? null : (saleId || null),
        quotationId || null,
        notes || null,
      ],
    )

    const newAppt = rows[0]

    // ── Send booking-confirmation email (best-effort, never blocks the response) ──
    try {
      // 1. Read booking_email config from the settings DB
      const [cfgEnabled, cfgSubject, cfgGreeting, cfgReminders, cfgClosing] = await Promise.all([
        ConfigurationService.get('booking_email', 'enabled'),
        ConfigurationService.get('booking_email', 'subject'),
        ConfigurationService.get('booking_email', 'greeting'),
        ConfigurationService.get('booking_email', 'reminders'),
        ConfigurationService.get('booking_email', 'closing'),
      ]).catch(() => [null, null, null, null, null])

      // If admin explicitly disabled the booking email, skip quietly
      if (String(cfgEnabled) === 'false') {
        console.info('[BookingEmail] Disabled by configuration — skipping')
      } else {
        // 2. Fetch customer / vehicle / service details needed for the template
        const { rows: detail } = await db.query(
          `SELECT c.full_name AS customer_name,
                  c.email    AS customer_email,
                  v.plate_number, v.make, v.model, v.year, v.color,
                  sv.name    AS service_name,
                  COALESCE(q.quotation_no, s.reference_no) AS reference_no,
                  q.notes     AS quotation_notes,
                  q.created_by AS quotation_created_by
           FROM appointments a
           JOIN customers c ON c.id = a.customer_id
           JOIN vehicles  v ON v.id = a.vehicle_id
           LEFT JOIN services   sv ON sv.id = a.service_id
           LEFT JOIN quotations  q ON q.id  = a.quotation_id
           LEFT JOIN sales       s ON s.id  = a.sale_id
           WHERE a.id = $1`,
          [newAppt.id],
        )

        if (detail[0]?.customer_email) {
          const quotationNotes = String(detail[0].quotation_notes || '')
          const isPortalQuotation =
            newAppt.quotation_id &&
            quotationNotes.includes('[PORTAL BOOKING REQUEST]') &&
            (detail[0].quotation_created_by === null || detail[0].quotation_created_by === undefined)

          if (isPortalQuotation) {
            await sendQuotationApprovedScheduledEmail({
              to:            detail[0].customer_email,
              customerName:  detail[0].customer_name,
              plateNumber:   detail[0].plate_number,
              make:          detail[0].make,
              model:         detail[0].model,
              vehicleYear:   detail[0].year,
              color:         detail[0].color,
              scheduleStart: newAppt.schedule_start,
              scheduleEnd:   newAppt.schedule_end,
              bay:           newAppt.bay,
              installerTeam: newAppt.installer_team,
              serviceName:   detail[0].service_name,
              referenceNo:   detail[0].reference_no,
            }).catch(() => {})
          } else {
            await sendBookingConfirmationEmail({
              to:            detail[0].customer_email,
              customerName:  detail[0].customer_name,
              plateNumber:   detail[0].plate_number,
              make:          detail[0].make,
              model:         detail[0].model,
              vehicleYear:   detail[0].year,
              color:         detail[0].color,
              scheduleStart: newAppt.schedule_start,
              scheduleEnd:   newAppt.schedule_end,
              bay:           newAppt.bay,
              installerTeam: newAppt.installer_team,
              serviceName:   detail[0].service_name,
              referenceNo:   detail[0].reference_no,
              notes:         newAppt.notes,
              // Config overrides (undefined = use template defaults)
              configSubject:   cfgSubject   || undefined,
              configGreeting:  cfgGreeting  || undefined,
              configReminders: cfgReminders || undefined,
              configClosing:   cfgClosing   || undefined,
            }).catch(() => {})
          }
        }
      }
    } catch (_) { /* email failure must not block the response */ }

    res.status(201).json(newAppt)
  }),
)

router.patch(
  '/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('customerId').optional().isInt({ min: 1 }),
  body('vehicleId').optional().isInt({ min: 1 }),
  body('serviceId').optional().isInt({ min: 1 }),
  body('scheduleStart').optional().isISO8601(),
  body('scheduleEnd').optional({ nullable: true }).isISO8601(),
  body('status').optional().isString().notEmpty(),
  body('saleId').optional().isInt({ min: 1 }),
  body('quotationId').optional().isInt({ min: 1 }),
  body('notes').optional({ nullable: true }).isString(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const {
      customerId,
      vehicleId,
      serviceId,
      scheduleStart,
      scheduleEnd,
      bay,
      installerTeam,
      status,
      notificationChannel,
      saleId,
      quotationId,
      notes,
    } = req.body

    // For Completed bookings, only allow notes updates
    const { rows: currentRows } = await db.query(
      'SELECT status FROM appointments WHERE id = $1',
      [id],
    )
    if (!currentRows.length) {
      return res.status(404).json({ message: 'Appointment not found' })
    }
    const isCompleted = currentRows[0].status === 'Completed'

    const { rows } = await db.query(
      isCompleted
        ? `UPDATE appointments
             SET notes = COALESCE($1, notes)
           WHERE id = $2
           RETURNING *`
        : `UPDATE appointments
             SET customer_id = COALESCE($1, customer_id),
                 vehicle_id = COALESCE($2, vehicle_id),
                 service_id = COALESCE($3, service_id),
                 schedule_start = COALESCE($4, schedule_start),
                 schedule_end = COALESCE($5, schedule_end),
                 bay = COALESCE($6, bay),
                 installer_team = COALESCE($7, installer_team),
                 status = COALESCE($8, status),
                 notification_channel = COALESCE($9, notification_channel),
                 sale_id = COALESCE($10, sale_id),
                 quotation_id = COALESCE($11, quotation_id),
                 notes = COALESCE($12, notes)
             WHERE id = $13
             RETURNING *`,
      isCompleted
        ? [notes ?? null, id]
        : [
            customerId,
            vehicleId,
            serviceId,
            scheduleStart,
            scheduleEnd,
            bay,
            installerTeam,
            status,
            notificationChannel,
            saleId || null,
            quotationId || null,
            notes ?? null,
            id,
          ],
    )

    if (!rows.length) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    return res.json(rows[0])
  }),
)

router.delete(
  '/:id',
  requireAuth,
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params

    // Fetch appointment with payment / invoice data before deleting
    const { rows: apptRows } = await db.query(
      `SELECT a.status,
              a.sale_id,
              a.quotation_id,
              COALESCE(
                (SELECT SUM(p.amount) FROM payments p WHERE p.sale_id = a.sale_id),
                0
              )::NUMERIC AS total_paid,
              EXISTS(
                SELECT 1 FROM payments p WHERE p.sale_id = a.sale_id
              ) AS has_payments,
              EXISTS(
                SELECT 1 FROM quotations q
                WHERE q.id = a.quotation_id
                  AND q.status IS NOT NULL
              ) AS has_quotation
       FROM appointments a
       WHERE a.id = $1`,
      [id],
    )

    if (!apptRows.length) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    const appt = apptRows[0]

    // Block hard delete for Completed bookings — use Archive instead
    if (appt.status === 'Completed') {
      // Log the attempted deletion so admins can review it later
      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'DELETE_BLOCKED', 'appointments', $2,
                 'Attempted hard-delete of a Completed booking — blocked by system', NOW())`,
        [req.user?.id || null, id],
      ).catch(() => {})
      return res.status(409).json({ message: 'Completed schedules cannot be deleted.' })
    }

    // Block deletion if the booking has been paid (status or actual payment received)
    if (appt.status === 'Paid' || Number(appt.total_paid) > 0 || appt.has_payments) {
      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'DELETE_BLOCKED', 'appointments', $2,
                 'Attempted deletion of a paid booking — blocked. Total paid: ' || $3, NOW())`,
        [req.user?.id || null, id, String(appt.total_paid)],
      ).catch(() => {})
      return res.status(409).json({ message: 'Cannot delete schedule — customer has already paid.' })
    }

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // If appointment has a quotation, move it to History status and mark job order/payments as Deleted
      if (appt.quotation_id) {
        // Update quotation status to History
        await client.query(
          `UPDATE quotations SET status = 'History'
           WHERE id = $1`,
          [appt.quotation_id],
        )

        // Update associated job order status to Deleted
        await client.query(
          `UPDATE job_orders SET status = 'Deleted'
           WHERE quotation_id = $1`,
          [appt.quotation_id],
        )

        // Update associated payments status to History
        await client.query(
          `UPDATE payments SET status = 'History'
           WHERE quotation_id = $1`,
          [appt.quotation_id],
        )
      }

      // Delete the appointment
      await client.query('DELETE FROM appointments WHERE id = $1', [id])

      await client.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'DELETE_APPOINTMENT', 'appointments', $2, $3, NOW())`,
        [req.user?.id || null, id,
         `Deleted appointment ${id} — associated quotation moved to History${appt.quotation_id ? ` and job order marked as Deleted` : ''}`],
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

// ── Archive Endpoint ──────────────────────────────────────────────────────────
// POST /appointments/:id/archive  (SuperAdmin only)
// Soft-deletes a Completed booking without affecting financial records
router.post(
  '/:id/archive',
  requireAuth,
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const userId = req.user?.id

    // Fetch appointment
    const { rows: apptRows } = await db.query(
      `SELECT a.*,
              EXISTS(
                SELECT 1 FROM payments p WHERE p.sale_id = a.sale_id
              ) AS has_payments
       FROM appointments a
       WHERE a.id = $1`,
      [id],
    )

    if (!apptRows.length) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    const appt = apptRows[0]

    if (appt.status !== 'Completed') {
      return res.status(409).json({ message: 'Only Completed bookings can be archived.' })
    }

    if (appt.archived_at) {
      return res.status(409).json({ message: 'This booking is already archived.' })
    }

    // Soft delete — sets archived_at / archived_by, does NOT touch financial records
    await db.query(
      `UPDATE appointments
         SET archived_at = NOW(), archived_by = $1
       WHERE id = $2`,
      [userId, id],
    )

    // Write to activity_logs
    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
       VALUES ($1, 'ARCHIVE', 'appointments', $2, 'Booking archived by admin', NOW())`,
      [userId, id],
    )

    // Also write to audit_logs for cross-system consistency
    await writeAuditLog({
      userId,
      action: 'ARCHIVE',
      entity: 'appointments',
      entityId: id,
      meta: JSON.stringify({ archivedBy: userId, status: appt.status }),
    })

    return res.json({ message: 'Booking archived successfully.' })
  }),
)

// ── Cancel Preview (cascade check) ───────────────────────────────────────────
// GET /appointments/:id/cancel-preview  — returns all records that will be
// affected when this booking is cancelled, so the frontend can display them.
router.get(
  '/:id/cancel-preview',
  requireAuth,
  param('id').isInt({ min: 1 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const { rows: apptRows } = await db.query(
          `SELECT a.id, a.status, a.quotation_id, a.sale_id, a.schedule_start,
            a.down_payment_amount, a.down_payment_method, a.down_payment_ref,
              c.full_name AS customer_name, c.email AS customer_email,
              v.plate_number, v.make, v.model, v.year
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles  v ON v.id = a.vehicle_id
       WHERE a.id = $1`,
      [id],
    )
    if (!apptRows.length) return res.status(404).json({ message: 'Appointment not found' })
    const appt = apptRows[0]

    // Linked job orders that are not already terminal
    const { rows: joRows } = await db.query(
      `SELECT id, job_order_no, status
       FROM job_orders
       WHERE quotation_id = $1 AND status NOT IN ('Cancelled', 'Complete', 'Released', 'Completed')`,
      [appt.quotation_id || -1],
    )

    // Payment summary (includes portal down payment when applicable)
    let paymentSummary = { total_paid: 0, total_amount: 0, payment_status: 'UNPAID' }
    const dpPaid = (appt.down_payment_method && appt.down_payment_method !== 'cash' && Number(appt.down_payment_amount || 0) > 0)
      ? Number(appt.down_payment_amount || 0)
      : 0
    if (appt.quotation_id) {
      const { rows } = await db.query(
        'SELECT total_paid, total_amount, payment_status FROM quotation_payment_summary WHERE quotation_id = $1',
        [appt.quotation_id],
      )
      if (rows[0]) paymentSummary = rows[0]
    } else if (appt.sale_id) {
      const { rows } = await db.query(
        'SELECT total_paid, total_amount, payment_status FROM sale_financial_summary WHERE sale_id = $1',
        [appt.sale_id],
      )
      if (rows[0]) paymentSummary = rows[0]
    }

    // If a portal down payment exists, count it as at least PARTIAL even if no invoice exists yet.
    if (dpPaid > 0) {
      const nextPaid = Number(paymentSummary.total_paid || 0) + dpPaid
      const status = String(paymentSummary.payment_status || 'UNPAID')
      paymentSummary = {
        ...paymentSummary,
        total_paid: nextPaid,
        payment_status: (status === 'PAID' || status === 'SETTLED' || status === 'OVERPAID') ? status : 'PARTIAL',
      }
    }

    return res.json({
      appointment: { id: appt.id, status: appt.status, customer_name: appt.customer_name, schedule_start: appt.schedule_start },
      affectedJobOrders: joRows,
      paymentSummary,
      hasCustomerEmail: !!appt.customer_email,
    })
  }),
)

// ── Cancel-With-Action Endpoint ───────────────────────────────────────────────
// POST /appointments/:id/cancel-with-action  (Admin / SuperAdmin only)
// For bookings that have a partial or full payment — staff must choose a resolution
// before cancelling.  This endpoint cancels the appointment, all linked Job Orders,
// and the linked Quotation (removing it from Payments & POS) in a single transaction.
//
// Body: {
//   action:       'refund' | 'credit' | 'reschedule'
//   cancelReason: string (optional)
// }
//
// action = 'reschedule' → does NOT cancel; just returns a signal for the
//          frontend to open the booking form with pre-filled data.
router.post(
  '/:id/cancel-with-action',
  requireAuth,
  requireRole('SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('action').isIn(['refund', 'credit', 'reschedule']).withMessage('action must be refund, credit, or reschedule'),
  body('cancelReason').optional().isString(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { action, cancelReason } = req.body

    const { rows: apptRows } = await db.query(
      `SELECT a.id, a.status, a.quotation_id, a.sale_id,
              a.customer_id, a.vehicle_id, a.schedule_start, a.schedule_end,
              a.service_id, a.bay, a.installer_team AS assigned_team, a.notes,
              c.full_name AS customer_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       WHERE a.id = $1`,
      [id],
    )
    if (!apptRows.length) return res.status(404).json({ message: 'Appointment not found' })

    const appt = apptRows[0]

    if (['Completed', 'Cancelled'].includes(appt.status)) {
      return res.status(409).json({ message: `Appointment is already ${appt.status} — no action needed.` })
    }

    // Fetch payment totals for the log
    let payTotal = 0; let totalAmt = 0
    if (appt.quotation_id) {
      const { rows } = await db.query(
        'SELECT total_paid, total_amount FROM quotation_payment_summary WHERE quotation_id = $1',
        [appt.quotation_id],
      )
      if (rows[0]) { payTotal = Number(rows[0].total_paid || 0); totalAmt = Number(rows[0].total_amount || 0) }
    } else if (appt.sale_id) {
      const { rows } = await db.query(
        'SELECT total_paid, total_amount FROM sale_financial_summary WHERE sale_id = $1',
        [appt.sale_id],
      )
      if (rows[0]) { payTotal = Number(rows[0].total_paid || 0); totalAmt = Number(rows[0].total_amount || 0) }
    }

    const amtStr = `₱${payTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

    if (action === 'reschedule') {
      // Do not cancel — just log intent and return booking data for the frontend to prefill a new form
      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'CANCEL_RESCHEDULE_INITIATED', 'appointments', $2, $3, NOW())`,
        [req.user.id, id,
         `Reschedule initiated by ${req.user.email} — amount paid ${amtStr}${cancelReason ? ': ' + cancelReason : ''}`],
      ).catch(() => {})
      return res.json({
        action: 'reschedule',
        bookingTemplate: {
          customer_id:   appt.customer_id,
          vehicle_id:    appt.vehicle_id,
          service_id:    appt.service_id,
          bay:           appt.bay,
          assigned_team: appt.assigned_team,
          notes:         appt.notes,
        },
        message: `Reschedule initiated for ${appt.customer_name}. Original booking kept open — please set a new date.`,
      })
    }

    // refund or credit → cancel the booking in a single transaction
    const actionLabel = action === 'refund' ? 'REFUND_PENDING' : 'CREDIT_ISSUED'
    const actionNote  = action === 'refund'
      ? `Booking cancelled — refund of ${amtStr} pending manual processing`
      : `Booking cancelled — ${amtStr} applied as credit/voucher for future booking`

    const client = await db.pool.connect()
    let cancelledJoRows = []
    try {
      await client.query('BEGIN')

      // 1. Cancel the appointment
      await client.query(
        `UPDATE appointments SET status = 'Cancelled', cancel_reason = $2 WHERE id = $1`,
        [id, cancelReason || `${action} — ${amtStr} paid`],
      )

      // 2. Cancel all active linked Job Orders
      if (appt.quotation_id) {
        const { rows: joRows } = await client.query(
          `UPDATE job_orders
             SET status = 'Cancelled', previous_status = status,
                 cancel_reason = $2
           WHERE quotation_id = $1
             AND status NOT IN ('Cancelled', 'Complete', 'Released', 'Completed')
           RETURNING id, job_order_no, status AS prev_status`,
          [appt.quotation_id, cancelReason || `Booking cancelled (${action})`],
        )
        cancelledJoRows = joRows
        for (const jo of joRows) {
          await client.query(
            `INSERT INTO status_transitions
               (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
             VALUES ('job_order', $1, $2, 'Cancelled', $3, NOW(), $4)`,
            [jo.id, jo.prev_status, req.user.id,
             `Auto-cancelled — booking #${id} cancelled (${action})`],
          )
        }

        // 2b. Cancel the linked quotation so it disappears from Payments & POS
        await client.query(
          `UPDATE quotations
             SET status = 'Cancelled'
           WHERE id = $1 AND status NOT IN ('Cancelled', 'Completed')`,
          [appt.quotation_id],
        )
      }

      // 3. Audit logs
      await client.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, $2, 'appointments', $3, $4, NOW())`,
        [req.user.id, actionLabel, id, actionNote],
      )
      await client.query(
        `INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
         VALUES ('appointment', $1, $2, 'Cancelled', $3, NOW(), $4)`,
        [id, appt.status, req.user.id, actionNote],
      )

      await client.query('COMMIT')
    } catch (txErr) {
      await client.query('ROLLBACK')
      throw txErr
    } finally {
      client.release()
    }

    // 4. Send cancellation email (best-effort, outside transaction)
    try {
      const { rows: fullAppt } = await db.query(
        `SELECT c.email AS customer_email, v.plate_number, v.make, v.model, v.year,
                a.schedule_start, COALESCE(q.quotation_no, s.reference_no) AS reference_no
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         JOIN vehicles  v ON v.id = a.vehicle_id
         LEFT JOIN quotations q ON q.id = a.quotation_id
         LEFT JOIN sales s ON s.id = a.sale_id
         WHERE a.id = $1`,
        [id],
      )
      if (fullAppt[0]?.customer_email) {
        await sendCancellationEmail({
          to: fullAppt[0].customer_email,
          customerName: appt.customer_name,
          plateNumber: fullAppt[0].plate_number,
          make: fullAppt[0].make,
          model: fullAppt[0].model,
          year: fullAppt[0].year,
          referenceNo: fullAppt[0].reference_no,
          scheduledAt: appt.schedule_start,
          cancelledAt: new Date(),
          cancelReason,
          paymentAction: action,
          amountPaid: payTotal,
          refundNote: action === 'refund'
            ? 'Our team will contact you to process the refund within 3–5 business days.'
            : null,
        }).catch(() => {})
      }
    } catch (_) {/* email failure must not block the response */}

    return res.json({
      action,
      cancelledJobOrders: cancelledJoRows.length,
      message: action === 'refund'
        ? `Booking cancelled. A refund of ${amtStr} has been flagged for processing.`
        : `Booking cancelled. ${amtStr} logged as customer credit for future use.`,
    })
  }),
)

// ── Portal Cancellation Request Approval ─────────────────────────────────────
// Customers can request cancellation via portal; admin/staff approves/rejects.
router.post(
  '/:id/portal-cancel-request/approve',
  requireAuth,
  requireRole('Admin', 'Manager', 'SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const appointmentId = Number(req.params.id)

    const { rows: colRows } = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'appointments'
         AND column_name = 'cancel_request_status'
       LIMIT 1`,
    )
    if (!colRows.length) {
      return res.status(503).json({
        message: 'Portal cancellation-request workflow is not available on this server yet. Please apply migration: backend/sql/migrations/063_portal_cancellation_requests.sql',
      })
    }

    const client = await db.pool.connect()
    let appt
    let paymentAction = 'cancel'
    let payTotal = 0

    try {
      await client.query('BEGIN')

      const { rows: apptRows } = await client.query(
        `SELECT a.id, a.status, a.quotation_id, a.sale_id,
                a.customer_id, a.vehicle_id, a.schedule_start, a.schedule_end,
                a.cancel_request_status, a.cancel_request_action, a.cancel_request_reason,
                a.down_payment_amount, a.down_payment_method,
                c.full_name AS customer_name
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         WHERE a.id = $1
         FOR UPDATE`,
        [appointmentId],
      )
      if (!apptRows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ message: 'Appointment not found' })
      }

      appt = apptRows[0]

      if (String(appt.cancel_request_status || '').toUpperCase() !== 'PENDING') {
        await client.query('ROLLBACK')
        return res.status(409).json({ message: 'No pending cancellation request for this appointment.' })
      }

      if (['Completed', 'Cancelled'].includes(appt.status)) {
        await client.query(
          `UPDATE appointments
           SET cancel_request_status = 'APPROVED',
               cancel_request_resolved_at = NOW(),
               cancel_request_resolved_by = $2
           WHERE id = $1`,
          [appointmentId, req.user?.id || null],
        )
        await client.query('COMMIT')
        return res.json({ success: true, alreadyTerminal: true, status: appt.status })
      }

      const requested = String(appt.cancel_request_action || 'cancel').toLowerCase()
      paymentAction = (requested === 'refund' || requested === 'credit' || requested === 'cancel') ? requested : 'cancel'

      // Fetch payment totals for logging/email
      if (appt.quotation_id) {
        const { rows } = await client.query(
          'SELECT total_paid FROM quotation_payment_summary WHERE quotation_id = $1',
          [appt.quotation_id],
        )
        if (rows[0]) payTotal = Number(rows[0].total_paid || 0)
      } else if (appt.sale_id) {
        const { rows } = await client.query(
          'SELECT total_paid FROM sale_financial_summary WHERE sale_id = $1',
          [appt.sale_id],
        )
        if (rows[0]) payTotal = Number(rows[0].total_paid || 0)
      }

      // Include portal down payment when present (non-cash indicates paid already)
      const dpPaid = (appt?.down_payment_method && appt.down_payment_method !== 'cash' && Number(appt.down_payment_amount || 0) > 0)
        ? Number(appt.down_payment_amount || 0)
        : 0
      if (dpPaid > 0) payTotal += dpPaid

      const reasonText = appt.cancel_request_reason || 'portal cancellation request approved'

      await client.query(
        `UPDATE appointments
         SET status = 'Cancelled',
             cancelled_at = NOW(),
             cancel_reason = $2
         WHERE id = $1`,
        [appointmentId, reasonText],
      )

      // Cancel linked Job Orders and quotation (quotation-based workflow)
      let cancelledJobOrders = 0
      if (appt.quotation_id) {
        const { rows: joRows } = await client.query(
          `UPDATE job_orders
             SET status = 'Cancelled', previous_status = status,
                 cancel_reason = $2
           WHERE quotation_id = $1
             AND status NOT IN ('Cancelled', 'Complete', 'Released', 'Completed')
           RETURNING id, status AS prev_status`,
          [appt.quotation_id, reasonText],
        )
        cancelledJobOrders = joRows.length
        for (const jo of joRows) {
          await client.query(
            `INSERT INTO status_transitions
               (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
             VALUES ('job_order', $1, $2, 'Cancelled', $3, NOW(), $4)`,
            [jo.id, jo.prev_status, req.user?.id || null,
             `Approved portal cancellation — booking #${appointmentId}`],
          )
        }

        await client.query(
          `UPDATE quotations
             SET status = 'Cancelled'
           WHERE id = $1 AND status NOT IN ('Cancelled', 'Completed')`,
          [appt.quotation_id],
        )
      }

      await client.query(
        `INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
         VALUES ('appointment', $1, $2, 'Cancelled', $3, NOW(), $4)`,
        [appointmentId, appt.status, req.user?.id || null, reasonText],
      )

      await client.query(
        `UPDATE appointments
         SET cancel_request_status = 'APPROVED',
             cancel_request_resolved_at = NOW(),
             cancel_request_resolved_by = $2
         WHERE id = $1`,
        [appointmentId, req.user?.id || null],
      )

      await client.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'PORTAL_CANCEL_REQUEST_APPROVED', 'appointments', $2, $3, NOW())`,
        [req.user?.id || null, appointmentId, `action=${paymentAction}; total_paid=${payTotal}`],
      ).catch(() => {})

      await client.query('COMMIT')

      // best-effort email
      try {
        const { rows: fullAppt } = await db.query(
          `SELECT c.email AS customer_email, v.plate_number, v.make, v.model, v.year,
                  a.schedule_start, COALESCE(q.quotation_no, s.reference_no) AS reference_no
           FROM appointments a
           JOIN customers c ON c.id = a.customer_id
           JOIN vehicles  v ON v.id = a.vehicle_id
           LEFT JOIN quotations q ON q.id = a.quotation_id
           LEFT JOIN sales s ON s.id = a.sale_id
           WHERE a.id = $1`,
          [appointmentId],
        )
        if (fullAppt[0]?.customer_email) {
          await sendCancellationEmail({
            to: fullAppt[0].customer_email,
            customerName: appt.customer_name,
            plateNumber: fullAppt[0].plate_number,
            make: fullAppt[0].make,
            model: fullAppt[0].model,
            year: fullAppt[0].year,
            referenceNo: fullAppt[0].reference_no,
            scheduledAt: appt.schedule_start,
            cancelledAt: new Date(),
            cancelReason: appt.cancel_request_reason || null,
            paymentAction: paymentAction === 'cancel' ? null : paymentAction,
            amountPaid: payTotal,
            refundNote: paymentAction === 'refund'
              ? 'Our team will contact you to process the refund within 3–5 business days.'
              : null,
          }).catch(() => {})
        }
      } catch (_) {/* ignore */}

      return res.json({ success: true })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

router.post(
  '/:id/portal-cancel-request/reject',
  requireAuth,
  requireRole('Admin', 'Manager', 'SuperAdmin'),
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('reason').optional().isString().isLength({ max: 500 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const appointmentId = Number(req.params.id)
    const rejectReason = req.body?.reason ? String(req.body.reason).trim() : ''

    const { rows: colRows } = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'appointments'
         AND column_name = 'cancel_request_status'
       LIMIT 1`,
    )
    if (!colRows.length) {
      return res.status(503).json({
        message: 'Portal cancellation-request workflow is not available on this server yet. Please apply migration: backend/sql/migrations/063_portal_cancellation_requests.sql',
      })
    }

    const { rows } = await db.query(
      `UPDATE appointments
       SET cancel_request_status = 'REJECTED',
           cancel_request_resolved_at = NOW(),
           cancel_request_resolved_by = $2,
           cancel_request_reason = CASE
             WHEN $3 = '' OR $3 IS NULL THEN cancel_request_reason
             ELSE cancel_request_reason || ' — rejected: ' || $3
           END
       WHERE id = $1 AND cancel_request_status = 'PENDING'
       RETURNING id, cancel_request_status, cancel_request_reason, cancel_request_resolved_at`,
      [appointmentId, req.user?.id || null, rejectReason],
    )

    if (!rows.length) return res.status(409).json({ message: 'No pending cancellation request for this appointment.' })

    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
       VALUES ($1, 'PORTAL_CANCEL_REQUEST_REJECTED', 'appointments', $2, $3, NOW())`,
      [req.user?.id || null, appointmentId, rejectReason || '(no reason)'],
    ).catch(() => {})

    return res.json({ success: true, request: rows[0] })
  }),
)

// ── Status Transition Endpoint ────────────────────────────────────────────────
// POST /appointments/:id/transition
// Body: { status: 'Checked-In' | 'In Progress' | 'For QA' | 'Ready for Release' | 'Paid' | 'Released' | 'Completed' | 'Cancelled' }
// Optional body: { cancelReason, warrantyMonths (default 12) }
router.post(
  '/:id/transition',
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('status').isString().notEmpty().withMessage('status is required'),
  body('cancelReason').optional().isString(),
  body('warrantyMonths').optional().isInt({ min: 1 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { status: nextStatus, cancelReason, warrantyMonths = 12 } = req.body

    // 1. Fetch current appointment with linked sale info
    const { rows: apptRows } = await db.query(
      `SELECT a.*,
              c.full_name  AS customer_name,
              c.email      AS customer_email,
              v.plate_number,
              v.make, v.model, v.year,
              s.reference_no    AS sale_reference,
              s.service_package AS service_name,
              s.workflow_status AS sale_status,
              s.is_locked       AS sale_locked,
              (s.total_amount - COALESCE(SUM(p.amount),0))::NUMERIC AS outstanding_balance
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles  v ON v.id = a.vehicle_id
       LEFT JOIN sales    s ON s.id = a.sale_id
       LEFT JOIN payments p ON p.sale_id = s.id
       WHERE a.id = $1
       GROUP BY a.id, c.id, v.id, s.id`,
      [id],
    )

    if (!apptRows.length) {
      return res.status(404).json({ message: 'Appointment not found' })
    }

    const appt = apptRows[0]
    const currentStatus = appt.status

    // 2. Validate transition via workflowEngine
    //    - Enforces sequential order
    //    - Enforces role-based permissions per stage
    //    - Blocks transitions out of terminal statuses
    //    - Handles Cancelled path with MANAGEMENT-only restriction
    const userRole = req.user?.role || ''
    const validation = validateTransition(currentStatus, nextStatus, APPOINTMENT_WORKFLOW, userRole)
    if (!validation.valid) {
      return res
        .status(validation.httpStatus || 400)
        .json({ message: validation.message })
    }

    // 3. Business guards
    if (nextStatus === 'Ready for Release') {
      // If a linked invoice exists, payment must be complete before marking ready
      const hasInvoice = !!(appt.sale_id || appt.quotation_id)
      if (hasInvoice) {
        let fsRows
        if (appt.quotation_id) {
          const { rows } = await db.query(
            'SELECT payment_status, outstanding_balance FROM quotation_payment_summary WHERE quotation_id = $1',
            [appt.quotation_id],
          )
          fsRows = rows
        } else {
          const { rows } = await db.query(
            'SELECT payment_status, outstanding_balance FROM sale_financial_summary WHERE sale_id = $1',
            [appt.sale_id],
          )
          fsRows = rows
        }
        const fs = fsRows[0]
        const isFullyPaid = fs && (fs.payment_status === 'PAID' || fs.payment_status === 'SETTLED' || fs.payment_status === 'OVERPAID')
        if (!isFullyPaid) {
          const balance = fs ? Number(fs.outstanding_balance) : 0
          return res.status(400).json({
            message: `Cannot mark as Ready for Release — payment not complete. Outstanding balance: ₱${Number(balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
            payment_status: fs?.payment_status || 'UNPAID',
            outstanding_balance: balance,
          })
        }
      }
    }

    if (nextStatus === 'Released') {
      // Must have a linked invoice (quotation or legacy sale)
      if (!appt.sale_id && !appt.quotation_id) {
        return res.status(400).json({ message: 'Cannot release: no invoice linked to this appointment' })
      }
      // Re-query financial summary from the appropriate view
      let fsRows
      if (appt.quotation_id) {
        const { rows } = await db.query(
          'SELECT payment_status, outstanding_balance FROM quotation_payment_summary WHERE quotation_id = $1',
          [appt.quotation_id],
        )
        fsRows = rows
      } else {
        const { rows } = await db.query(
          'SELECT payment_status, outstanding_balance FROM sale_financial_summary WHERE sale_id = $1',
          [appt.sale_id],
        )
        fsRows = rows
      }
      const fs = fsRows[0]
      // Accept PAID, SETTLED, or PARTIALLY_PAID cases (PARTIALLY_PAID alias for exact-match edge)
      const isFullyPaid = fs && (fs.payment_status === 'PAID' || fs.payment_status === 'SETTLED' || fs.payment_status === 'OVERPAID')
      if (!isFullyPaid) {
        const balance = fs ? Number(fs.outstanding_balance) : 0
        return res.status(400).json({
          message: `Vehicle cannot be released. Remaining balance: ₱${Number(balance).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
          payment_status: fs?.payment_status || 'UNPAID',
          outstanding_balance: balance,
          requiresOverride: true,
        })
      }
    }

    // 3c. Cancellation payment guard
    // Direct cancellation is only allowed when the customer has paid nothing.
    // Partial / full payment requires going through cancel-with-action instead.
    if (nextStatus === 'Cancelled') {
      let payTotal = 0
      let totalAmt = 0
      let payStatus = null

      const dpPaid = (appt.down_payment_method && appt.down_payment_method !== 'cash' && Number(appt.down_payment_amount || 0) > 0)
        ? Number(appt.down_payment_amount || 0)
        : 0
      payTotal += dpPaid

      if (appt.quotation_id) {
        const { rows: fs } = await db.query(
          'SELECT total_paid, total_amount, payment_status FROM quotation_payment_summary WHERE quotation_id = $1',
          [appt.quotation_id],
        )
        if (fs[0]) {
          payTotal += Number(fs[0].total_paid || 0)
          totalAmt = Number(fs[0].total_amount || 0)
          payStatus = fs[0].payment_status
        }
      } else if (appt.sale_id) {
        const { rows: fs } = await db.query(
          'SELECT total_paid, total_amount, payment_status FROM sale_financial_summary WHERE sale_id = $1',
          [appt.sale_id],
        )
        if (fs[0]) {
          payTotal += Number(fs[0].total_paid || 0)
          totalAmt = Number(fs[0].total_amount || 0)
          payStatus = fs[0].payment_status
        }
      }

      if (payTotal > 0) {
        const ps = String(payStatus || '')
        const isFullyPaid = (ps === 'PAID' || ps === 'SETTLED' || ps === 'OVERPAID')
        const guard = isFullyPaid ? 'FULL' : 'PARTIAL'
        await db.query(
          `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
           VALUES ($1, 'CANCEL_BLOCKED', 'appointments', $2, $3, NOW())`,
          [req.user?.id || null, id,
           `Cancel blocked — ${guard} payment of ₱${payTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })} exists`],
        ).catch(() => {})
        return res.status(409).json({
          message: guard === 'FULL'
            ? 'Cannot cancel — customer has paid in full. Process a refund before cancelling.'
            : 'Cannot cancel directly — a partial payment exists. Choose a resolution: refund, credit, or reschedule.',
          paymentGuard: guard,
          total_paid: payTotal,
          total_amount: totalAmt,
        })
      }

      // Unpaid: log allowed cancellation
      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'CANCEL_ALLOWED', 'appointments', $2, $3, NOW())`,
        [req.user?.id || null, id,
         `Booking cancelled by ${req.user?.email || 'user'} — no payment on file${cancelReason ? ': ' + cancelReason : ''}`],
      ).catch(() => {})
    }

    // 4. Build UPDATE fields
    const now = new Date()
    const updates = ['status = $2']
    const values = [id, nextStatus]
    let idx = 3

    const tsCol = STATUS_TIMESTAMP[nextStatus]
    if (tsCol) {
      updates.push(`${tsCol} = $${idx}`)
      values.push(now)
      idx += 1
    }

    if (nextStatus === 'Cancelled' && cancelReason) {
      updates.push(`cancel_reason = $${idx}`)
      values.push(cancelReason)
      idx += 1
    }

    if (nextStatus === 'Checked-In') {
      updates.push(`checked_in_by = $${idx}`)
      values.push(req.user.id)
      idx += 1
    }

    if (nextStatus === 'Released') {
      updates.push(`released_by = $${idx}`)
      values.push(req.user.id)
      idx += 1

      // Set warranty expiry
      const warrantyExpiry = new Date(now)
      warrantyExpiry.setMonth(warrantyExpiry.getMonth() + warrantyMonths)
      updates.push(`warranty_expires_at = $${idx}`)
      values.push(warrantyExpiry)
      idx += 1

      // Set follow-up reminder 30 days after release
      const followUp = new Date(now)
      followUp.setDate(followUp.getDate() + 30)
      updates.push(`follow_up_date = $${idx}`)
      values.push(followUp.toISOString().split('T')[0])
      idx += 1
    }

    // 4b. For Cancelled: wrap in a single DB transaction that also archives Job Orders
    let cancelledJoRows = []
    const { rows } = await (async () => {
      if (nextStatus !== 'Cancelled') {
        return db.query(`UPDATE appointments SET ${updates.join(', ')} WHERE id = $1 RETURNING *`, values)
      }
      const client = await db.pool.connect()
      try {
        await client.query('BEGIN')
        const apptResult = await client.query(
          `UPDATE appointments SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
          values,
        )
        // Cancel all active linked Job Orders
        if (appt.quotation_id) {
          const { rows: joRows } = await client.query(
            `UPDATE job_orders
               SET status = 'Cancelled', previous_status = status,
                   cancel_reason = $2
             WHERE quotation_id = $1
               AND status NOT IN ('Cancelled', 'Complete', 'Released', 'Completed')
             RETURNING id, job_order_no, status AS prev_status`,
            [appt.quotation_id, cancelReason || 'Booking cancelled'],
          )
          cancelledJoRows = joRows
          for (const jo of joRows) {
            await client.query(
              `INSERT INTO status_transitions
                 (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
               VALUES ('job_order', $1, $2, 'Cancelled', $3, NOW(), $4)`,
              [jo.id, jo.prev_status, req.user.id,
               `Auto-cancelled — booking #${id} cancelled by ${req.user?.email || 'user'}`],
            )
          }

          // Also cancel the linked quotation so it disappears from Payments & POS
          await client.query(
            `UPDATE quotations
               SET status = 'Cancelled'
             WHERE id = $1 AND status NOT IN ('Cancelled', 'Completed')`,
            [appt.quotation_id],
          )
        }
        await client.query('COMMIT')
        return apptResult
      } catch (txErr) {
        await client.query('ROLLBACK')
        throw txErr
      } finally {
        client.release()
      }
    })()

    const updated = rows[0]
    let emailSent = false
    let notificationType = null

    // 5. Side effects
    // Ready for Release → email customer
    if (nextStatus === 'Ready for Release' && appt.customer_email) {
      try {
        const result = await sendReadyForReleaseEmail({
          to: appt.customer_email,
          customerName: appt.customer_name,
          plateNumber: appt.plate_number,
          make: appt.make,
          model: appt.model,
          year: appt.year,
          referenceNo: appt.sale_reference,
        })
        emailSent = !result.skipped
        notificationType = 'ready_for_release'
      } catch (err) {
        console.error('Ready-for-release email failed:', err.message)
      }
    }

    // Released → send receipt + thank-you email
    if (nextStatus === 'Released' && appt.customer_email) {
      try {
        const result = await sendReceiptEmail({
          to: appt.customer_email,
          customerName: appt.customer_name,
          plateNumber: appt.plate_number,
          make: appt.make,
          model: appt.model,
          year: appt.year,
          referenceNo: appt.sale_reference,
          warrantyExpiresAt: updated.warranty_expires_at,
          followUpDate: updated.follow_up_date,
        })
        emailSent = !result.skipped
        notificationType = 'released'
      } catch (err) {
        console.error('Receipt email failed:', err.message)
      }
    }

    // Completed → send completion confirmation email
    if (nextStatus === 'Completed' && appt.customer_email) {
      try {
        const result = await sendCompletionEmail({
          to: appt.customer_email,
          customerName: appt.customer_name,
          plateNumber: appt.plate_number,
          make: appt.make,
          model: appt.model,
          year: appt.year,
          referenceNo: appt.sale_reference,
          servicePackage: appt.service_name || null,
        })
        emailSent = !result.skipped
        notificationType = 'completed'
      } catch (err) {
        console.error('Completion email failed:', err.message)
      }
    }

    // Cancelled → send cancellation notification to customer
    if (nextStatus === 'Cancelled' && appt.customer_email) {
      try {
        const result = await sendCancellationEmail({
          to: appt.customer_email,
          customerName: appt.customer_name,
          plateNumber: appt.plate_number,
          make: appt.make,
          model: appt.model,
          year: appt.year,
          referenceNo: appt.sale_reference,
          scheduledAt: appt.schedule_start,
          cancelledAt: new Date(),
          cancelReason,
          paymentAction: null,
          amountPaid: 0,
        })
        emailSent = !result.skipped
        notificationType = 'cancelled'
      } catch (err) {
        console.error('Cancellation email failed:', err.message)
      }
    }

    // 6. Sync linked Job Order to the appropriate stage.
    //    For each appointment status, define what the JO SHOULD be at minimum.
    //    If the JO is behind that target, advance it directly (no role check — this is automatic).
    //    Cancelled JOs are never touched.
    const APPT_TO_JO_TARGET = {
      'In Progress':       'In Progress',
      'For QA':            'For QA',
      'Ready for Release': 'Completed',
      'Released':          'Released',
      'Completed':         'Released',
    }
    const JO_STATUS_ORDER = ['Pending', 'In Progress', 'For QA', 'Completed', 'Released']

    let jobOrderSynced = null
    if (appt.quotation_id && APPT_TO_JO_TARGET[nextStatus]) {
      try {
        const { rows: joRows } = await db.query(
          `SELECT id, status, job_order_no FROM job_orders
           WHERE quotation_id = $1 AND status != 'Cancelled' LIMIT 1`,
          [appt.quotation_id],
        )
        if (joRows.length) {
          const jo = joRows[0]
          const joTarget     = APPT_TO_JO_TARGET[nextStatus]
          const currentJoIdx = JO_STATUS_ORDER.indexOf(jo.status)
          const targetJoIdx  = JO_STATUS_ORDER.indexOf(joTarget)

          // Only advance if JO is strictly behind the target
          if (currentJoIdx !== -1 && targetJoIdx !== -1 && currentJoIdx < targetJoIdx) {
            const joTsCol   = JOB_ORDER_WORKFLOW.timestampColumn[joTarget]
            const joUpdates = ['status = $2', 'previous_status = $3']
            const joValues  = [jo.id, joTarget, jo.status]
            let joIdx = 4
            if (joTsCol)              { joUpdates.push(`${joTsCol} = $${joIdx}`);   joValues.push(now);          joIdx++ }
            if (joTarget === 'Completed') { joUpdates.push(`completed_by = $${joIdx}`); joValues.push(req.user.id); joIdx++ }
            if (joTarget === 'Released')  { joUpdates.push(`released_by  = $${joIdx}`); joValues.push(req.user.id); joIdx++ }
            await db.query(
              `UPDATE job_orders SET ${joUpdates.join(', ')} WHERE id = $1`,
              joValues,
            )
            await db.query(
              `INSERT INTO status_transitions
                 (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
               VALUES ('job_order', $1, $2, $3, $4, NOW(), $5)`,
              [jo.id, jo.status, joTarget, req.user.id,
               `Auto-synced from appointment #${id} → ${nextStatus}`],
            ).catch(() => {})
            jobOrderSynced = { id: jo.id, from: jo.status, to: joTarget }

            // Fire Job Order customer email notifications when the JO is advanced
            // via appointment workflow sync (since this bypasses /job-orders/:id/transition).
            // Non-blocking by design.
            if (joTarget === 'In Progress') {
              emailNotificationService.safeFireAndForget('JO Work Started (appt sync)', () =>
                emailNotificationService.notifyJobStarted(jo.id, req.user?.id)
              )
            }
            if (joTarget === 'Completed') {
              emailNotificationService.safeFireAndForget('JO Completed (appt sync)', () =>
                emailNotificationService.notifyJobCompleted(jo.id, req.user?.id)
              )
            }
            if (joTarget === 'Released') {
              emailNotificationService.safeFireAndForget('JO Released (appt sync)', () =>
                emailNotificationService.notifyJobReleased(jo.id, req.user?.id)
              )
            }
          }
        }
      } catch (syncErr) {
        console.error('[JO sync] Failed to sync job order status:', syncErr.message)
      }
    }

    // 7. Audit log + status_transitions record
    await writeAuditLog({
      userId: req.user.id,
      action: 'APPOINTMENT_TRANSITION',
      entity: 'appointments',
      entityId: Number(id),
      meta: { from: currentStatus, to: nextStatus, cancelReason, emailSent },
    })

    // Log Completed transitions to activity_logs for compliance tracking
    if (nextStatus === 'Completed') {
      await db.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES ($1, 'STATUS_COMPLETED', 'appointments', $2,
                 $3, NOW())`,
        [
          req.user.id,
          Number(id),
          `Booking marked Completed by ${req.user.role} (user #${req.user.id}). Ref: ${appt.sale_reference || 'N/A'}.`,
        ],
      ).catch((err) => console.error('[activity_logs] Insert failed:', err.message))
    }

    await db.query(
      `INSERT INTO status_transitions
         (entity_type, entity_id, from_status, to_status, changed_by, changed_at)
       VALUES ('appointment', $1, $2, $3, $4, NOW())`,
      [Number(id), currentStatus, nextStatus, req.user.id],
    ).catch((err) => console.error('[status_transitions] insert failed:', err.message))

    return res.json({
      appointment: updated,
      transition: { from: currentStatus, to: nextStatus },
      emailSent,
      notificationType,
      customerEmail: emailSent ? appt.customer_email : null,
      jobOrderSynced,
      cancelledJobOrders: cancelledJoRows.map(j => ({ id: j.id, job_order_no: j.job_order_no })),
    })
  }),
)

// ── Force Release (Conditional Release) ──────────────────────────────────────
// POST /appointments/:id/force-release
// Requires Manager or Admin. Logs to conditional_releases. Sets quotation WITH BALANCE.
router.post(
  '/:id/force-release',
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  body('overrideReason').isString().notEmpty().withMessage('overrideReason is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    // Role guard — only Management can force-release
    const userRole = req.user?.role || ''
    if (!['Admin', 'SuperAdmin'].includes(userRole)) {
      return res.status(403).json({ message: 'Only SuperAdmin and Admin can conditionally release a vehicle.' })
    }

    const { id } = req.params
    const { overrideReason } = req.body

    // Fetch appointment with full financial data from both views
    const { rows: apptRows } = await db.query(
      `SELECT a.*,
              c.full_name AS customer_name, c.email AS customer_email,
              v.plate_number, v.make, v.model, v.year,
              s.reference_no AS sale_reference,
              COALESCE(fs.payment_status, qfs.payment_status, 'UNPAID') AS payment_status,
              COALESCE(fs.total_amount,   q.total_amount,  s.total_amount, 0)::NUMERIC  AS total_amount,
              COALESCE(fs.total_paid,     qfs.total_paid,  0)::NUMERIC    AS total_paid,
              COALESCE(fs.outstanding_balance, qfs.outstanding_balance, 0)::NUMERIC AS outstanding_balance
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles  v ON v.id = a.vehicle_id
       LEFT JOIN sales s ON s.id = a.sale_id
       LEFT JOIN sale_financial_summary fs ON fs.sale_id = s.id
       LEFT JOIN quotations q ON q.id = a.quotation_id
       LEFT JOIN quotation_payment_summary qfs ON qfs.quotation_id = a.quotation_id
       WHERE a.id = $1`,
      [id],
    )

    if (!apptRows.length) return res.status(404).json({ message: 'Appointment not found' })
    const appt = apptRows[0]
    if (isTerminal(appt.status, APPOINTMENT_WORKFLOW)) {
      return res.status(409).json({ message: `Appointment is already in a terminal status (${appt.status}). No further transitions allowed.` })
    }

    const now = new Date()
    const warrantyExpiry = new Date(now)
    warrantyExpiry.setFullYear(warrantyExpiry.getFullYear() + 1)
    const followUp = new Date(now)
    followUp.setDate(followUp.getDate() + 30)

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Update appointment to Released
      const { rows } = await client.query(
        `UPDATE appointments
         SET status = 'Released', released_at = $2, released_by = $3,
             warranty_expires_at = $4, follow_up_date = $5
         WHERE id = $1 RETURNING *`,
        [id, now, req.user.id, warrantyExpiry, followUp.toISOString().split('T')[0]],
      )

      // 2. Mark linked quotation as WITH BALANCE
      if (appt.quotation_id) {
        await client.query(
          `UPDATE quotations SET status = 'WITH BALANCE' WHERE id = $1`,
          [appt.quotation_id],
        )
      }

      // 3. Log to conditional_releases
      await client.query(
        `INSERT INTO conditional_releases
           (entity_type, entity_id, quotation_id, customer_id, approved_by, approved_at,
            reason, total_amount, total_paid, outstanding_balance)
         VALUES ('appointment', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          Number(id),
          appt.quotation_id || null,
          appt.customer_id,
          req.user.id,
          now,
          overrideReason,
          appt.total_amount,
          appt.total_paid,
          appt.outstanding_balance,
        ],
      )

      await client.query('COMMIT')

      await writeAuditLog({
        userId: req.user.id,
        action: 'CONDITIONAL_RELEASE',
        entity: 'appointments',
        entityId: Number(id),
        meta: {
          overrideReason,
          paymentStatus: appt.payment_status,
          totalAmount: appt.total_amount,
          totalPaid: appt.total_paid,
          outstandingBalance: appt.outstanding_balance,
          previousStatus: appt.status,
        },
      })

      await db.query(
        `INSERT INTO status_transitions
           (entity_type, entity_id, from_status, to_status, changed_by, changed_at,
            is_override, override_reason)
         VALUES ('appointment', $1, $2, 'Released', $3, NOW(), TRUE, $4)`,
        [Number(id), appt.status, req.user.id, overrideReason],
      ).catch((err) => console.error('[status_transitions] insert failed:', err.message))

      // Send receipt email
      if (appt.customer_email) {
        try {
          await sendReceiptEmail({
            to: appt.customer_email,
            customerName: appt.customer_name,
            plateNumber: appt.plate_number,
            make: appt.make,
            model: appt.model,
            year: appt.year,
            referenceNo: appt.sale_reference,
            warrantyExpiresAt: warrantyExpiry,
            followUpDate: followUp.toISOString().split('T')[0],
          })
        } catch (emailErr) {
          console.error('Conditional release receipt email failed:', emailErr.message)
        }
      }

      return res.json({
        appointment: rows[0],
        override: true,
        overrideReason,
        totalAmount: appt.total_amount,
        totalPaid: appt.total_paid,
        outstandingBalance: appt.outstanding_balance,
        warning: `Vehicle released with outstanding balance of ₱${Number(appt.outstanding_balance || 0).toLocaleString()}`,
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

// ── Start Job ─────────────────────────────────────────────────────────────────
// POST /appointments/:id/start-job
// Single action that:
//   1. Validates the appointment is Scheduled or Checked-In and has an Approved quotation
//   2. Creates a Job Order linked to BOTH schedule_id (this appointment) and quotation_id
//   3. Advances the appointment to 'In Progress'
// Returns: { appointment, jobOrder }
router.post(
  '/:id/start-job',
  param('id').isInt({ min: 1 }).withMessage('Invalid appointment id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const userRole = req.user?.role || ''

    // ── 1. Fetch appointment ──────────────────────────────────────────────────
    const { rows: apptRows } = await db.query(
      `SELECT a.*,
              c.full_name  AS customer_name,
              c.email      AS customer_email,
              v.plate_number, v.make, v.model, v.year,
              q.status     AS quotation_status,
              q.customer_id AS q_customer_id,
              q.vehicle_id  AS q_vehicle_id,
              q.services    AS q_services,
              q.quotation_no,
              q.total_amount AS quotation_total
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN vehicles  v ON v.id = a.vehicle_id
       LEFT JOIN quotations q ON q.id = a.quotation_id
       WHERE a.id = $1`,
      [id],
    )

    if (!apptRows.length) return res.status(404).json({ message: 'Appointment not found' })
    const appt = apptRows[0]

    // ── 2. Guards ─────────────────────────────────────────────────────────────
    const startableStatuses = ['Scheduled', 'Checked-In']
    if (!startableStatuses.includes(appt.status)) {
      return res.status(409).json({
        message: `Cannot start job: appointment is currently "${appt.status}". Must be Scheduled or Checked-In.`,
      })
    }

    // If a quotation is linked, it must be Approved
    if (appt.quotation_id && appt.quotation_status && appt.quotation_status !== 'Approved') {
      return res.status(409).json({
        message: `Cannot start job: linked quotation is "${appt.quotation_status}". Quotation must be Approved.`,
      })
    }

    // Prevent duplicate Job Orders for the same schedule
    const dupCheckParams = appt.quotation_id
      ? [Number(id), appt.quotation_id]
      : [Number(id), -1]           // -1 never matches a real quotation_id
    const { rows: existingJO } = await db.query(
      `SELECT id, job_order_no FROM job_orders
       WHERE schedule_id = $1 OR (quotation_id = $2 AND $2 != -1 AND status != 'Cancelled')
       LIMIT 1`,
      dupCheckParams,
    )
    if (existingJO.length) {
      return res.status(409).json({
        message: `A Job Order (${existingJO[0].job_order_no}) already exists for this appointment or quotation.`,
        jobOrderId: existingJO[0].id,
      })
    }

    // Role check for starting work (matches 'In Progress' role gate)
    const inProgressRoles = APPOINTMENT_WORKFLOW.rolePermissions['In Progress'] || []
    if (!inProgressRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Role "${userRole}" cannot start a job. Required: ${inProgressRoles.join(', ')}.`,
      })
    }

    const { assignedInstallers, preparedBy, notes } = req.body
    const now = new Date()

    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // ── 3. Generate Job Order number ─────────────────────────────────────
      const { rows: custBayRows } = await client.query(
        `SELECT bay FROM customers WHERE id = $1`,
        [appt.customer_id],
      )
      const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
      const getBranchCode = (bay) => {
        if (!bay) return 'BR'
        return BRANCH_CODES[(bay || '').toLowerCase().trim()] || (bay || '').substring(0, 3).toUpperCase()
      }
      const branchCode = getBranchCode(custBayRows[0]?.bay)
      
      const year = now.getFullYear()
      const yearShort = String(year).slice(-3)
      const prefix = `JO-${branchCode}-${yearShort}-`
      
      const { rows: lastJO } = await client.query(
        `SELECT job_order_no FROM job_orders
         WHERE job_order_no LIKE $1 ORDER BY job_order_no DESC LIMIT 1`,
        [`${prefix}%`],
      )
      const lastSeq = lastJO[0]?.job_order_no
      const seq = lastSeq ? parseInt(lastSeq.split('-')[3], 10) + 1 : 1
      const jobOrderNo = `${prefix}${String(seq).padStart(4, '0')}`

      // ── 4. Create Job Order with schedule_id + quotation_id ───────────────
      // Payment-Based Auto-Approval (Option B)
      const { rows: qpsRows } = await client.query(
        `SELECT total_paid FROM quotation_payment_summary WHERE quotation_id = $1`,
        [appt.quotation_id]
      )
      const totalPaidOnQuotation = Number(qpsRows[0]?.total_paid || 0)
      const totalAmountOnQuotation = Number(appt.quotation_total || 0)
      const paidPercentage = totalAmountOnQuotation > 0 ? (totalPaidOnQuotation / totalAmountOnQuotation) * 100 : 0
      
      const initialStatus = paidPercentage >= 50 ? 'Pending' : 'Pending JO Approval'
      const pendingAt = paidPercentage >= 50 ? now : null

      const { rows: joRows } = await client.query(
        `INSERT INTO job_orders
           (job_order_no, quotation_id, schedule_id, customer_id, vehicle_id,
            services, assigned_installers, prepared_by, notes, status, created_by, pending_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          jobOrderNo,
          appt.quotation_id,
          Number(id),                             // schedule_id = this appointment
          appt.customer_id,
          appt.vehicle_id,
          JSON.stringify(appt.q_services || []),
          JSON.stringify(assignedInstallers || []),
          JSON.stringify(preparedBy || []),
          notes || null,
          initialStatus,
          req.user?.id || null,
          pendingAt,
        ],
      )
      const newJO = joRows[0]

      // ── 5. Advance appointment to 'In Progress' ───────────────────────────
      const tsCol = STATUS_TIMESTAMP['In Progress']
      const { rows: apptUpdated } = await client.query(
        `UPDATE appointments
         SET status = 'In Progress'${tsCol ? `, ${tsCol} = $2` : ''}
         WHERE id = $1
         RETURNING *`,
        tsCol ? [Number(id), now] : [Number(id)],
      )

      // ── 6. Seed status_transitions ───────────────────────────────────────
      await client.query(
        `INSERT INTO status_transitions
           (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
         VALUES ('appointment', $1, $2, 'In Progress', $3, NOW(), $4)`,
        [Number(id), appt.status, req.user?.id, `Start Job — JO ${jobOrderNo} created`],
      ).catch(() => {})

      await client.query('COMMIT')

      await writeAuditLog({
        userId: req.user?.id,
        action: 'START_JOB',
        entity: 'appointments',
        entityId: Number(id),
        meta: {
          from: appt.status,
          to: 'In Progress',
          jobOrderNo,
          jobOrderId: newJO.id,
          quotationId: appt.quotation_id,
        },
      })

      return res.status(201).json({
        appointment: apptUpdated[0],
        jobOrder: newJO,
        transition: { from: appt.status, to: 'In Progress' },
      })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }),
)

module.exports = router

