/**
 * emailNotificationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central dispatcher for automated workflow email notifications.
 *
 * Responsibilities:
 *   1. Deduplicate — checks email_notifications table before sending.
 *   2. Dispatch    — gathers required data, calls the appropriate mailer fn.
 *   3. Log         — writes result (sent / failed / skipped) to email_notifications.
 *   4. Audit       — appends an EMAIL_SENT / EMAIL_FAILED entry to audit_logs.
 *
 * Public API:
 *   notifyQuotationApproved(quotationId, actorUserId)  → called when quotation → Approved
 *   notifyJobStarted(jobOrderId, actorUserId)           → called when job order → In Progress
 *   notifyPaymentReceived(paymentId, actorUserId)       → called when payment recorded
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict'

const db          = require('../config/db')
const mailer      = require('./mailer')
const { writeAuditLog } = require('../utils/auditLog')
const ConfigurationService = require('./configurationService')

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns true if an email has already been sent for this (event_type, entity_id) pair.
 * Uses the UNIQUE constraint on email_notifications to determine deduplication.
 */
async function _alreadySent(eventType, entityId) {
  const { rows } = await db.query(
    `SELECT id FROM email_notifications
     WHERE event_type = $1 AND entity_id = $2 AND status = 'sent'
     LIMIT 1`,
    [eventType, entityId],
  )
  return rows.length > 0
}

/**
 * Persists the email attempt result.
 * ON CONFLICT DO NOTHING — if a concurrent request already inserted, we skip silently.
 */
async function _logNotification({
  eventType,
  entityType,
  entityId,
  recipientEmail,
  status,
  errorMessage,
  triggeredBy,
}) {
  await db.query(
    `INSERT INTO email_notifications
       (event_type, entity_type, entity_id, recipient_email, status, error_message, triggered_by, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (event_type, entity_id) DO UPDATE
       SET status        = EXCLUDED.status,
           error_message = EXCLUDED.error_message,
           recipient_email = EXCLUDED.recipient_email,
           sent_at       = EXCLUDED.sent_at`,
    [eventType, entityType, entityId, recipientEmail, status, errorMessage || null, triggeredBy || null],
  )
}

/**
 * Safe fire-and-forget wrapper.
 * Returns a Promise that NEVER rejects — any error is logged to console only.
 * Use this in route handlers so email failures never crash the HTTP response.
 */
function safeFireAndForget(label, promiseFn) {
  Promise.resolve()
    .then(promiseFn)
    .catch((err) => {
      console.error(`[EmailNotification] ${label} error:`, err.message)
    })
}

/**
 * Ensures a Job Order number includes the branch code for display (e.g. JO-CBO-026-0022).
 * If the JO number is in the old format (JO-YYYY-XXXX), it converts it using the customer's bay.
 */
function _formatDisplayJobOrderNo(joNo, bay) {
  if (!joNo) return joNo
  if (joNo.startsWith('JO-') && joNo.split('-').length === 3) {
    // Old format: JO-YYYY-SEQ
    const BRANCH_CODES = { cubao: 'CBO', manila: 'MNL' }
    const getBranchCode = (b) => {
      if (!b) return 'BR'
      return BRANCH_CODES[(b || '').toLowerCase().trim()] || (b || '').substring(0, 3).toUpperCase()
    }
    const branch = getBranchCode(bay)
    const parts = joNo.split('-')
    const year = parts[1]
    const seq = parts[2]
    // Convert JO-2026-0020 to JO-CBO-026-0020 (using last 3 digits of year)
    const yearShort = year.length > 3 ? year.slice(-3) : year
    return `JO-${branch}-${yearShort}-${seq}`
  }
  return joNo
}

// ── Event: Quotation Approved ────────────────────────────────────────────────

/**
 * Sends a "Service Confirmation" email when a quotation is approved.
 *
 * @param {number} quotationId
 * @param {number|null} actorUserId  — the staff member who approved
 */
async function notifyQuotationApproved(quotationId, actorUserId) {
  const EVENT_TYPE  = 'quotation_approved'
  const ENTITY_TYPE = 'quotation'

  // ── 1. Deduplication guard ────────────────────────────────────────────────
  if (await _alreadySent(EVENT_TYPE, quotationId)) {
    console.info(`[EmailNotification] Skipped duplicate: ${EVENT_TYPE} #${quotationId}`)
    return
  }

  // ── 2. Fetch quotation + customer + vehicle data ──────────────────────────
  const { rows } = await db.query(
    `SELECT q.id,
            q.quotation_no,
            q.services,
            q.total_amount,
            q.notes,
            c.full_name   AS customer_name,
            c.email       AS customer_email,
            v.plate_number,
            v.make,
            v.model,
            v.year        AS vehicle_year,
            v.color
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     JOIN vehicles  v ON v.id = q.vehicle_id
     WHERE q.id = $1`,
    [quotationId],
  )

  if (!rows.length) {
    console.warn(`[EmailNotification] ${EVENT_TYPE}: quotation ${quotationId} not found`)
    return
  }

  const q = rows[0]

  if (!q.customer_email) {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${quotationId}: customer has no email — skipping`)
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: quotationId,
      recipientEmail: '(no email)', status: 'skipped',
      errorMessage: 'Customer has no email address', triggeredBy: actorUserId,
    })
    return
  }

  // ── 2b. Fetch email config overrides ──────────────────────────────────────
  const [cfgEnabled, cfgSubject, cfgGreeting, cfgReminders, cfgClosing] = await Promise.all([
    ConfigurationService.get('quotation_email', 'enabled'),
    ConfigurationService.get('quotation_email', 'subject'),
    ConfigurationService.get('quotation_email', 'greeting'),
    ConfigurationService.get('quotation_email', 'reminders'),
    ConfigurationService.get('quotation_email', 'closing'),
  ])

  // If admin explicitly disabled the email, skip silently
  if (cfgEnabled === 'false') {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${quotationId}: disabled by configuration — skipping`)
    return
  }

  // ── 3. Parse services (JSONB comes back as object) ────────────────────────
  const services = Array.isArray(q.services) ? q.services : []
  const hasCoating = services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    return code.includes('coat-ceramic') || code.includes('coat-graphene')
  })
  const hasPpf = services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    const group = String(s.group || '').toLowerCase()
    return code.startsWith('ppf-') || group.includes('ppf')
  })
  const hasTint = services.some((s) => {
    const code = String(s.code || '').toLowerCase()
    const group = String(s.group || '').toLowerCase()
    return group.includes('window tint') || code.includes('tint')
  })
  const hasExteriorDetail = services.some((s) => String(s.code || '').toLowerCase() === 'detail-exterior')
  const hasInteriorDetail = services.some((s) => String(s.code || '').toLowerCase() === 'detail-interior')
  const subtotal  = services.reduce((sum, s) => sum + Number(s.total || s.unitPrice || 0), 0)
  const vatAmount = Math.round((Number(q.total_amount) - subtotal) * 100) / 100

  // ── 4. Send ───────────────────────────────────────────────────────────────
  let sendResult
  try {
    sendResult = await mailer.sendServiceConfirmationEmail({
      to:          q.customer_email,
      customerName: q.customer_name,
      quotationNo:  q.quotation_no,
      plateNumber:  q.plate_number,
      make:         q.make,
      model:        q.model,
      vehicleYear:  q.vehicle_year,
      color:        q.color,
      services,
      totalAmount:  q.total_amount,
      subtotal,
      vatAmount,
      notes:        q.notes,
      hasCoating,
      hasPpf,
      hasTint,
      hasExteriorDetail,
      hasInteriorDetail,
      configSubject:   cfgSubject   || undefined,
      configGreeting:  cfgGreeting  || undefined,
      configReminders: cfgReminders || undefined,
      configClosing:   cfgClosing   || undefined,
    })
  } catch (err) {
    // ── 4a. Log failure ───────────────────────────────────────────────────
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: quotationId,
      recipientEmail: q.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_FAILED', entity: ENTITY_TYPE, entityId: quotationId,
      meta: { event: EVENT_TYPE, to: q.customer_email, error: err.message },
    }).catch(() => {})
    console.error(`[EmailNotification] ${EVENT_TYPE} #${quotationId} FAILED:`, err.message)
    return
  }

  // ── 5. Log success ────────────────────────────────────────────────────────
  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: quotationId,
    recipientEmail: q.customer_email, status,
    triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: quotationId,
      meta: { event: EVENT_TYPE, to: q.customer_email, subject: `Service Confirmed: ${q.quotation_no}` },
    }).catch(() => {})
    console.info(`[EmailNotification] ${EVENT_TYPE} #${quotationId} → sent to ${q.customer_email}`)
  }
}

// ── Event: Job Order Started (→ In Progress) ─────────────────────────────────

/**
 * Sends a "Work Started" email when a job order transitions to In Progress.
 *
 * @param {number} jobOrderId
 * @param {number|null} actorUserId  — the staff member who started the job
 * @param {object}  [opts]
 * @param {boolean} [opts.resend=false]  — when true, clears the dedup record and re-sends
 *                                         (used when assigned installers are updated mid-job)
 */
async function notifyJobStarted(jobOrderId, actorUserId, { resend = false } = {}) {
  const EVENT_TYPE  = 'job_started'
  const ENTITY_TYPE = 'job_order'

  // ── 1. Deduplication guard ────────────────────────────────────────────────
  if (resend) {
    // Clear previous record so we can re-insert a fresh one
    await db.query(
      `DELETE FROM email_notifications WHERE event_type = $1 AND entity_id = $2`,
      [EVENT_TYPE, jobOrderId],
    ).catch(() => {})
  } else if (await _alreadySent(EVENT_TYPE, jobOrderId)) {
    console.info(`[EmailNotification] Skipped duplicate: ${EVENT_TYPE} #${jobOrderId}`)
    return
  }

  // ── 2. Fetch job order + related data ────────────────────────────────────
  const { rows } = await db.query(
    `SELECT jo.id,
            jo.job_order_no,
            jo.services,
            jo.assigned_installers,
            jo.started_at,
            q.quotation_no,
            c.full_name   AS customer_name,
            c.email       AS customer_email,
            c.bay         AS customer_bay,
            v.plate_number,
            v.make,
            v.model,
            v.year        AS vehicle_year,
            v.color,
            a.schedule_end,
            a.bay         AS schedule_bay
     FROM job_orders jo
     JOIN quotations    q ON q.id  = jo.quotation_id
     JOIN customers     c ON c.id  = jo.customer_id
     JOIN vehicles      v ON v.id  = jo.vehicle_id
     LEFT JOIN appointments a ON a.id = jo.schedule_id
     WHERE jo.id = $1`,
    [jobOrderId],
  )

  if (!rows.length) {
    console.warn(`[EmailNotification] ${EVENT_TYPE}: job_order ${jobOrderId} not found`)
    return
  }

  const jo = rows[0]

  if (!jo.customer_email) {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId}: customer has no email — skipping`)
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: '(no email)', status: 'skipped',
      errorMessage: 'Customer has no email address', triggeredBy: actorUserId,
    })
    return
  }

  // ── 3. Resolve technician names ───────────────────────────────────────────
  const installerIds = Array.isArray(jo.assigned_installers) ? jo.assigned_installers : []
  let technicianNames = []

  if (installerIds.length > 0) {
    try {
      // Cast to int array for the ANY() clause
      const { rows: userRows } = await db.query(
        `SELECT full_name FROM users WHERE id = ANY($1::int[])`,
        [installerIds],
      )
      technicianNames = userRows.map((u) => u.full_name)
    } catch (err) {
      console.warn('[EmailNotification] Could not resolve technician names:', err.message)
    }
  }

  // ── 4. Parse services ─────────────────────────────────────────────────────
  const services = Array.isArray(jo.services) ? jo.services : []

  // ── 5. Send ───────────────────────────────────────────────────────────────
  const displayJobOrderNo = _formatDisplayJobOrderNo(jo.job_order_no, jo.customer_bay)

  let sendResult
  try {
    sendResult = await mailer.sendWorkStartedEmail({
      to:             jo.customer_email,
      customerName:   jo.customer_name,
      jobOrderNo:     displayJobOrderNo,
      quotationNo:    jo.quotation_no,
      plateNumber:    jo.plate_number,
      make:           jo.make,
      model:          jo.model,
      vehicleYear:    jo.vehicle_year,
      color:          jo.color,
      services,
      technicianNames,
      startedAt:      jo.started_at || new Date(),
      scheduleEnd:    jo.schedule_end,
      scheduleBay:    jo.schedule_bay,
    })
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_FAILED', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, error: err.message },
    }).catch(() => {})
    console.error(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} FAILED:`, err.message)
    return
  }

  // ── 6. Log success ────────────────────────────────────────────────────────
  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
    recipientEmail: jo.customer_email, status,
    triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, subject: `Work Started: ${displayJobOrderNo}` },
    }).catch(() => {})
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} → sent to ${jo.customer_email}`)
  }
}

// ── Event: Technician Assigned (Pending job, installer list saved) ────────────

/**
 * Sends a "Technician Assigned" email when installers are saved on a Pending job.
 * Always re-sends on repeated saves so the customer sees the latest team.
 *
 * @param {number} jobOrderId
 * @param {number|null} actorUserId
 */
async function notifyTechnicianAssigned(jobOrderId, actorUserId) {
  const EVENT_TYPE  = 'technician_assigned'
  const ENTITY_TYPE = 'job_order'

  // Always clear the old record so each installer save sends a fresh email
  await db.query(
    `DELETE FROM email_notifications WHERE event_type = $1 AND entity_id = $2`,
    [EVENT_TYPE, jobOrderId],
  ).catch(() => {})

  // ── Fetch job order + related data ─────────────────────────────────────────
  const { rows } = await db.query(
    `SELECT jo.id,
            jo.job_order_no,
            jo.services,
            jo.assigned_installers,
            q.quotation_no,
            c.full_name   AS customer_name,
            c.email       AS customer_email,
            c.bay         AS customer_bay,
            v.plate_number,
            v.make,
            v.model,
            v.year        AS vehicle_year,
            v.color,
            a.schedule_start,
            a.schedule_end,
            a.bay         AS schedule_bay
     FROM job_orders jo
     JOIN quotations    q ON q.id  = jo.quotation_id
     JOIN customers     c ON c.id  = jo.customer_id
     JOIN vehicles      v ON v.id  = jo.vehicle_id
     LEFT JOIN appointments a ON a.id = jo.schedule_id
     WHERE jo.id = $1`,
    [jobOrderId],
  )

  if (!rows.length) {
    console.warn(`[EmailNotification] ${EVENT_TYPE}: job_order ${jobOrderId} not found`)
    return
  }

  const jo = rows[0]

  if (!jo.customer_email) {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId}: customer has no email — skipping`)
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: '(no email)', status: 'skipped',
      errorMessage: 'Customer has no email address', triggeredBy: actorUserId,
    })
    return
  }

  // Resolve technician names from users table
  const installerIds = Array.isArray(jo.assigned_installers) ? jo.assigned_installers : []
  let technicianNames = []

  if (installerIds.length > 0) {
    try {
      const { rows: userRows } = await db.query(
        `SELECT full_name FROM users WHERE id = ANY($1::int[])`,
        [installerIds],
      )
      technicianNames = userRows.map((u) => u.full_name)
    } catch (err) {
      console.warn('[EmailNotification] Could not resolve technician names:', err.message)
      // Fall back to raw IDs if name lookup fails — still send the email
      technicianNames = installerIds.map((id) => `Technician #${id}`)
    }
  }

  const services = Array.isArray(jo.services) ? jo.services : []

  const displayJobOrderNo = _formatDisplayJobOrderNo(jo.job_order_no, jo.customer_bay)

  let sendResult
  try {
    sendResult = await mailer.sendTechnicianAssignedEmail({
      to:             jo.customer_email,
      customerName:   jo.customer_name,
      jobOrderNo:     displayJobOrderNo,
      quotationNo:    jo.quotation_no,
      plateNumber:    jo.plate_number,
      make:           jo.make,
      model:          jo.model,
      vehicleYear:    jo.vehicle_year,
      color:          jo.color,
      services,
      technicianNames,
      scheduleStart:  jo.schedule_start,
      scheduleEnd:    jo.schedule_end,
      scheduleBay:    jo.schedule_bay,
    })
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_FAILED', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, error: err.message },
    }).catch(() => {})
    console.error(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} FAILED:`, err.message)
    return
  }

  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
    recipientEmail: jo.customer_email, status,
    triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, subject: `Technician Assigned: ${displayJobOrderNo}` },
    }).catch(() => {})
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} → sent to ${jo.customer_email}`)
  }
}

// ── Event: Job Completed (Job Order → Completed) ───────────────────────────────────

/**
 * Sends a "Job Completed" email when a job order transitions to Completed.
 * Includes a full service summary and ready-for-pickup notification.
 *
 * @param {number} jobOrderId
 * @param {number|null} actorUserId
 */
async function notifyJobCompleted(jobOrderId, actorUserId) {
  const EVENT_TYPE  = 'job_completed'
  const ENTITY_TYPE = 'job_order'

  // ── 1. Deduplication guard ────────────────────────────────────────────────
  if (await _alreadySent(EVENT_TYPE, jobOrderId)) {
    console.info(`[EmailNotification] Skipped duplicate: ${EVENT_TYPE} #${jobOrderId}`)
    return
  }

  // ── 2. Fetch all data (─────────────────────────────────────────────────
  const { rows } = await db.query(
    `SELECT jo.id,
            jo.job_order_no,
            jo.services,
            jo.assigned_installers,
            jo.completed_at,
            q.quotation_no,
            q.total_amount,
            c.full_name   AS customer_name,
            c.email       AS customer_email,
            c.mobile      AS customer_mobile,
            c.bay         AS customer_bay,
            v.plate_number,
            v.make,
            v.model,
            v.year        AS vehicle_year,
            v.color
     FROM job_orders jo
     JOIN quotations q ON q.id  = jo.quotation_id
     JOIN customers  c ON c.id  = jo.customer_id
     JOIN vehicles   v ON v.id  = jo.vehicle_id
     WHERE jo.id = $1`,
    [jobOrderId],
  )

  if (!rows.length) {
    console.warn(`[EmailNotification] ${EVENT_TYPE}: job_order ${jobOrderId} not found`)
    return
  }

  const jo = rows[0]
  
  const displayJobOrderNo = _formatDisplayJobOrderNo(jo.job_order_no, jo.customer_bay)

  if (!jo.customer_email) {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId}: customer has no email — skipping`)
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: '(no email)', status: 'skipped',
      errorMessage: 'Customer has no email address', triggeredBy: actorUserId,
    })
    return
  }

  // ── 3. Resolve technician names ───────────────────────────────────────────────
  const installerIds = Array.isArray(jo.assigned_installers) ? jo.assigned_installers : []
  let technicianNames = []

  if (installerIds.length > 0) {
    try {
      const { rows: userRows } = await db.query(
        `SELECT full_name FROM users WHERE id = ANY($1::int[])`,
        [installerIds],
      )
      technicianNames = userRows.map((u) => u.full_name)
    } catch (err) {
      console.warn('[EmailNotification] Could not resolve technician names:', err.message)
    }
  }

  const services = Array.isArray(jo.services) ? jo.services : []

  // ── 4. Send ───────────────────────────────────────────────────────────────────────
  let sendResult
  try {
    sendResult = await mailer.sendJobCompletedEmail({
      to:             jo.customer_email,
      customerName:   jo.customer_name,
      jobOrderNo:     displayJobOrderNo,
      quotationNo:    jo.quotation_no,
      plateNumber:    jo.plate_number,
      make:           jo.make,
      model:          jo.model,
      vehicleYear:    jo.vehicle_year,
      color:          jo.color,
      services,
      totalAmount:    jo.total_amount,
      technicianNames,
      completedAt:    jo.completed_at || new Date(),
      customerMobile: jo.customer_mobile,
      customerEmail:  jo.customer_email,
    })
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_FAILED', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, error: err.message },
    }).catch(() => {})
    console.error(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} FAILED:`, err.message)
    return
  }

  // ── 5. Log success ──────────────────────────────────────────────────────────────
  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
    recipientEmail: jo.customer_email, status,
    triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, subject: `Service Completed: ${displayJobOrderNo}` },
    }).catch(() => {})
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} → sent to ${jo.customer_email}`)
  }
}

// ── Event: Job Released (Job Order → Released) ───────────────────────────────────

/**
 * Sends a "Vehicle Released" email when a job order transitions to Released.
 * Confirms vehicle handover and payment receipt.
 *
 * @param {number} jobOrderId
 * @param {number|null} actorUserId
 */
async function notifyJobReleased(jobOrderId, actorUserId) {
  const EVENT_TYPE  = 'job_released'
  const ENTITY_TYPE = 'job_order'

  // ── 1. Deduplication guard ───────────────────────────────────────────
  if (await _alreadySent(EVENT_TYPE, jobOrderId)) {
    console.info(`[EmailNotification] Skipped duplicate: ${EVENT_TYPE} #${jobOrderId}`)
    return
  }

  // ── 2. Fetch all data ──────────────────────────────────────────────────────
  const { rows } = await db.query(
    `SELECT jo.id,
            jo.job_order_no,
            jo.services,
            jo.assigned_installers,
            jo.released_at,
            q.quotation_no,
            q.total_amount,
            c.full_name   AS customer_name,
            c.email       AS customer_email,
            c.mobile      AS customer_mobile,
            c.bay         AS customer_bay,
            v.plate_number,
            v.make,
            v.model,
            v.year        AS vehicle_year,
            v.color
     FROM job_orders jo
     JOIN quotations q ON q.id  = jo.quotation_id
     JOIN customers  c ON c.id  = jo.customer_id
     JOIN vehicles   v ON v.id  = jo.vehicle_id
     WHERE jo.id = $1`,
    [jobOrderId],
  )

  if (!rows.length) {
    console.warn(`[EmailNotification] ${EVENT_TYPE}: job_order ${jobOrderId} not found`)
    return
  }

  const jo = rows[0]

  if (!jo.customer_email) {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId}: customer has no email — skipping`)
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: '(no email)', status: 'skipped',
      errorMessage: 'Customer has no email address', triggeredBy: actorUserId,
    })
    return
  }

  // ── 3. Resolve technician names ──────────────────────────────────────────────
  const installerIds = Array.isArray(jo.assigned_installers) ? jo.assigned_installers : []
  let technicianNames = []

  if (installerIds.length > 0) {
    try {
      const { rows: userRows } = await db.query(
        `SELECT full_name FROM users WHERE id = ANY($1::int[])`,
        [installerIds],
      )
      technicianNames = userRows.map((u) => u.full_name)
    } catch (err) {
      console.warn('[EmailNotification] Could not resolve technician names:', err.message)
    }
  }

  const services = Array.isArray(jo.services) ? jo.services : []

  // ── 4. Send ──────────────────────────────────────────────────────────────────────────────
  const displayJobOrderNo = _formatDisplayJobOrderNo(jo.job_order_no, jo.customer_bay)

  let sendResult
  try {
    sendResult = await mailer.sendJobReleasedEmail({
      to:             jo.customer_email,
      customerName:   jo.customer_name,
      jobOrderNo:     displayJobOrderNo,
      quotationNo:    jo.quotation_no,
      plateNumber:    jo.plate_number,
      make:           jo.make,
      model:          jo.model,
      vehicleYear:    jo.vehicle_year,
      color:          jo.color,
      services,
      totalAmount:    jo.total_amount,
      technicianNames,
      releasedAt:     jo.released_at || new Date(),
    })
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_FAILED', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, error: err.message },
    }).catch(() => {})
    console.error(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} FAILED:`, err.message)
    return
  }

  // ── 5. Log success ──────────────────────────────────────────────────────────────────────
  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
    recipientEmail: jo.customer_email, status,
    triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: jobOrderId,
      meta: { event: EVENT_TYPE, to: jo.customer_email, subject: `Vehicle Released: ${displayJobOrderNo}` },
    }).catch(() => {})
    console.info(`[EmailNotification] ${EVENT_TYPE} #${jobOrderId} → sent to ${jo.customer_email}`)
  }
}

// ── Event: Payment Received ──────────────────────────────────────────────────

/**
 * Sends a "Payment Receipt" email when a payment is recorded.
 *
 * @param {number} paymentId
 * @param {number|null} actorUserId
 */
async function notifyPaymentReceived(paymentId, actorUserId) {
  const EVENT_TYPE  = 'payment_received'
  const ENTITY_TYPE = 'payment'

  // Fetch payment + quotation + customer + vehicle
  const { rows } = await db.query(
    `SELECT p.id,
            p.amount AS payment_amount,
            p.payment_type,
            p.reference_no AS payment_reference,
            p.created_at AS payment_date,
            q.id AS quotation_id,
            q.quotation_no,
            q.total_amount,
            qps.total_paid,
            qps.outstanding_balance,
            c.full_name AS customer_name,
            c.email AS customer_email,
            v.plate_number,
            v.make,
            v.model,
            v.year AS vehicle_year,
            v.color
     FROM payments p
     JOIN quotations q ON q.id = p.quotation_id
     JOIN customers c ON c.id = q.customer_id
     JOIN vehicles v ON v.id = q.vehicle_id
     LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = q.id
     WHERE p.id = $1`,
    [paymentId],
  )

  if (!rows.length) {
    console.warn(`[EmailNotification] ${EVENT_TYPE}: payment ${paymentId} not found`)
    return
  }

  const data = rows[0]

  if (!data.customer_email) {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${paymentId}: customer has no email — skipping`)
    return
  }

  let sendResult
  try {
    sendResult = await mailer.sendPaymentReceiptEmail({
      to: data.customer_email,
      customerName: data.customer_name,
      quotationNo: data.quotation_no,
      paymentAmount: data.payment_amount,
      totalPaid: data.total_paid,
      totalAmount: data.total_amount,
      outstandingBalance: data.outstanding_balance,
      paymentMethod: data.payment_type,
      paymentReference: data.payment_reference,
      paymentDate: data.payment_date,
      plateNumber: data.plate_number,
      make: data.make,
      model: data.model,
      vehicleYear: data.vehicle_year,
      color: data.color,
    })
  } catch (err) {
    console.error(`[EmailNotification] ${EVENT_TYPE} #${paymentId} FAILED:`, err.message)
    return
  }

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: paymentId,
      meta: { event: EVENT_TYPE, to: data.customer_email, subject: `Payment Receipt: ${data.quotation_no}` },
    }).catch(() => {})
    console.info(`[EmailNotification] ${EVENT_TYPE} #${paymentId} → sent to ${data.customer_email}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  notifyQuotationApproved,
  notifyJobStarted,
  notifyTechnicianAssigned,
  notifyJobCompleted,
  notifyJobReleased,
  notifyPaymentReceived,
  // Expose fire-and-forget wrapper for use in route handlers
  safeFireAndForget,
}
