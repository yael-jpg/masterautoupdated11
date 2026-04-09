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
const NotificationService = require('./notificationService')
const env = require('../config/env')

const EMAIL_MAX_RETRIES = Number(process.env.EMAIL_MAX_RETRIES || 3)
const EMAIL_RETRY_BASE_MS = Number(process.env.EMAIL_RETRY_BASE_MS || 800)
const EMAIL_QUEUE_CONCURRENCY = Math.max(1, Number(process.env.EMAIL_QUEUE_CONCURRENCY || 2))

const _jobQueue = []
let _activeJobs = 0
let _emailLogsEnsured = false

function _isValidEmail(email) {
  if (!email) return false
  const value = String(email).trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function _drainEmailQueue() {
  while (_activeJobs < EMAIL_QUEUE_CONCURRENCY && _jobQueue.length > 0) {
    const next = _jobQueue.shift()
    _activeJobs += 1

    Promise.resolve()
      .then(next.job)
      .then((res) => next.resolve(res))
      .catch((err) => next.reject(err))
      .finally(() => {
        _activeJobs -= 1
        _drainEmailQueue()
      })
  }
}

function _enqueueEmailJob(job) {
  return new Promise((resolve, reject) => {
    _jobQueue.push({ job, resolve, reject })
    _drainEmailQueue()
  })
}

async function _sendWithRetry(label, sendFn) {
  let lastErr = null
  for (let attempt = 1; attempt <= EMAIL_MAX_RETRIES; attempt += 1) {
    try {
      return await sendFn()
    } catch (err) {
      lastErr = err
      if (attempt < EMAIL_MAX_RETRIES) {
        const waitMs = EMAIL_RETRY_BASE_MS * attempt
        console.warn(`[EmailNotification] ${label} failed (attempt ${attempt}/${EMAIL_MAX_RETRIES}), retrying in ${waitMs}ms: ${err.message}`)
        await _sleep(waitMs)
      }
    }
  }
  throw lastErr
}

async function _ensureEmailLogsTable() {
  if (_emailLogsEnsured) return
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id SERIAL PRIMARY KEY,
      user_id INT,
      email VARCHAR(255) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.query('CREATE INDEX IF NOT EXISTS idx_email_logs_user_created ON email_logs (user_id, created_at DESC)')
  await db.query('CREATE INDEX IF NOT EXISTS idx_email_logs_status_created ON email_logs (status, created_at DESC)')
  _emailLogsEnsured = true
}

async function _logEmailResult({ userId, email, subject, status, errorMessage }) {
  try {
    await _ensureEmailLogsTable()
    await db.query(
      `INSERT INTO email_logs (user_id, email, subject, status, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId || null, email || '', subject || 'Automated Email', status, errorMessage || null],
    )
  } catch (err) {
    console.warn('[EmailNotification] email_logs write failed:', err.message)
  }
}

function _buildClientNotification(eventType, payload = {}) {
  const mapping = {
    quotation_approved: {
      title: 'Quotation Approved',
      message: 'Your quotation has been approved.',
      page: 'appointments',
    },
    schedule_approved: {
      title: 'Schedule Approved',
      message: 'Your service schedule is confirmed.',
      page: 'appointments',
    },
    payment_received: {
      title: 'Payment Received',
      message: 'Payment received successfully.',
      page: 'receipts',
    },
    job_order_confirmed: {
      title: 'Job Order Confirmed',
      message: 'Your job order is confirmed.',
      page: 'jobs',
    },
    subscription_confirmed: {
      title: 'Subscription Confirmed',
      message: 'Your subscription is now active.',
      page: 'subscriptions',
    },
    pms_booking_confirmed: {
      title: 'PMS Booking Confirmed',
      message: 'Your PMS schedule is confirmed.',
      page: 'pms',
    },
  }

  const jobStatusEvent = eventType.startsWith('job_status_updated_')
    ? {
        title: 'Job Status Updated',
        message: `Your job order status is now ${payload.status || 'updated'}.`,
        page: 'jobs',
      }
    : null

  const base = mapping[eventType] || jobStatusEvent
  if (!base) return null

  return {
    title: base.title,
    message: base.message,
    payload: {
      ...payload,
      type: 'email-event',
      event_type: eventType,
      navigate: { page: base.page },
    },
  }
}

async function _syncClientNotification({ customerId, eventType, payload }) {
  if (!customerId) return
  const notif = _buildClientNotification(eventType, payload)
  if (!notif) return

  await NotificationService.create({
    role: 'client',
    userId: customerId,
    title: notif.title,
    message: notif.message,
    payload: notif.payload,
  }).catch(() => {})
}

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

function _round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function _computeSubtotalFromServices(services) {
  const list = Array.isArray(services) ? services : []
  return list.reduce((sum, s) => {
    const qty = Number(s?.qty ?? 1)
    const unitPrice = Number(s?.unitPrice ?? s?.unit_price ?? 0)
    const lineTotal = Number(s?.total ?? s?.lineTotal ?? s?.amount ?? s?.price ?? 0)
    const resolved = Number.isFinite(lineTotal) && lineTotal > 0
      ? lineTotal
      : (Number.isFinite(unitPrice) ? unitPrice * (Number.isFinite(qty) ? qty : 1) : 0)
    return sum + Number(resolved || 0)
  }, 0)
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
            q.apply_vat,
            q.vat_rate,
            q.vat_amount,
            q.notes,
          c.id          AS customer_id,
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

  if (!_isValidEmail(q.customer_email)) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: quotationId,
      recipientEmail: q.customer_email, status: 'failed',
      errorMessage: 'Invalid recipient email format', triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: q.customer_id,
      email: q.customer_email,
      subject: `Service Confirmed: ${q.quotation_no}`,
      status: 'failed',
      errorMessage: 'Invalid recipient email format',
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
  const hasExplicitVatFlag = typeof q.apply_vat === 'boolean'
  const applyVat = hasExplicitVatFlag ? !!q.apply_vat : (Math.round((Number(q.total_amount) - subtotal) * 100) / 100) > 0
  const vatRate = applyVat ? Number(q.vat_rate || 12) : 0
  const vatAmount = applyVat
    ? Math.max(Number(q.vat_amount || (Math.round((Number(q.total_amount) - subtotal) * 100) / 100)) || 0, 0)
    : 0

  // ── 4. Send ───────────────────────────────────────────────────────────────
  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${quotationId}`, () => mailer.sendServiceConfirmationEmail({
      to: q.customer_email,
      customerName: q.customer_name,
      quotationNo: q.quotation_no,
      plateNumber: q.plate_number,
      make: q.make,
      model: q.model,
      vehicleYear: q.vehicle_year,
      color: q.color,
      services,
      totalAmount: q.total_amount,
      subtotal,
      applyVat,
      vatRate,
      vatAmount,
      notes: q.notes,
      hasCoating,
      hasPpf,
      hasTint,
      hasExteriorDetail,
      hasInteriorDetail,
      configSubject: cfgSubject || undefined,
      configGreeting: cfgGreeting || undefined,
      configReminders: cfgReminders || undefined,
      configClosing: cfgClosing || undefined,
    })))
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
    await _logEmailResult({
      userId: q.customer_id,
      email: q.customer_email,
      subject: `Service Confirmed: ${q.quotation_no}`,
      status: 'failed',
      errorMessage: err.message,
    })
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
    await _logEmailResult({
      userId: q.customer_id,
      email: q.customer_email,
      subject: `Service Confirmed: ${q.quotation_no}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: q.customer_id,
      eventType: EVENT_TYPE,
      payload: { quotation_id: quotationId },
    })
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
          c.id          AS customer_id,
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

  if (!_isValidEmail(jo.customer_email)) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: 'Invalid recipient email format', triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Work Started: ${jo.job_order_no}`,
      status: 'failed',
      errorMessage: 'Invalid recipient email format',
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
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${jobOrderId}`, () => mailer.sendWorkStartedEmail({
      to: jo.customer_email,
      customerName: jo.customer_name,
      jobOrderNo: displayJobOrderNo,
      quotationNo: jo.quotation_no,
      plateNumber: jo.plate_number,
      make: jo.make,
      model: jo.model,
      vehicleYear: jo.vehicle_year,
      color: jo.color,
      services,
      technicianNames,
      startedAt: jo.started_at || new Date(),
      scheduleEnd: jo.schedule_end,
      scheduleBay: jo.schedule_bay,
    })))
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Work Started: ${displayJobOrderNo}`,
      status: 'failed',
      errorMessage: err.message,
    })
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Work Started: ${displayJobOrderNo}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: jo.customer_id,
      eventType: 'job_status_updated_in_progress',
      payload: { job_order_id: jobOrderId, status: 'In Progress' },
    })
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
          c.id          AS customer_id,
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

  if (!_isValidEmail(jo.customer_email)) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: 'Invalid recipient email format', triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Technician Assigned: ${jo.job_order_no}`,
      status: 'failed',
      errorMessage: 'Invalid recipient email format',
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
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${jobOrderId}`, () => mailer.sendTechnicianAssignedEmail({
      to: jo.customer_email,
      customerName: jo.customer_name,
      jobOrderNo: displayJobOrderNo,
      quotationNo: jo.quotation_no,
      plateNumber: jo.plate_number,
      make: jo.make,
      model: jo.model,
      vehicleYear: jo.vehicle_year,
      color: jo.color,
      services,
      technicianNames,
      scheduleStart: jo.schedule_start,
      scheduleEnd: jo.schedule_end,
      scheduleBay: jo.schedule_bay,
    })))
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Technician Assigned: ${displayJobOrderNo}`,
      status: 'failed',
      errorMessage: err.message,
    })
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Technician Assigned: ${displayJobOrderNo}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: jo.customer_id,
      eventType: 'job_order_confirmed',
      payload: { job_order_id: jobOrderId },
    })
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
          c.id          AS customer_id,
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

  if (!_isValidEmail(jo.customer_email)) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: 'Invalid recipient email format', triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Service Completed: ${displayJobOrderNo}`,
      status: 'failed',
      errorMessage: 'Invalid recipient email format',
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

  const subtotal  = _round2(_computeSubtotalFromServices(services))
  const vatAmount = _round2(Number(jo.total_amount || 0) - subtotal)

  // ── 4. Send ───────────────────────────────────────────────────────────────────────
  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${jobOrderId}`, () => mailer.sendJobCompletedEmail({
      to: jo.customer_email,
      customerName: jo.customer_name,
      jobOrderNo: displayJobOrderNo,
      quotationNo: jo.quotation_no,
      plateNumber: jo.plate_number,
      make: jo.make,
      model: jo.model,
      vehicleYear: jo.vehicle_year,
      color: jo.color,
      services,
      totalAmount: jo.total_amount,
      subtotal,
      vatAmount,
      technicianNames,
      completedAt: jo.completed_at || new Date(),
      customerMobile: jo.customer_mobile,
      customerEmail: jo.customer_email,
    })))
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Service Completed: ${displayJobOrderNo}`,
      status: 'failed',
      errorMessage: err.message,
    })
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Service Completed: ${displayJobOrderNo}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: jo.customer_id,
      eventType: 'job_status_updated_completed',
      payload: { job_order_id: jobOrderId, status: 'Completed' },
    })
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
          c.id          AS customer_id,
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

  if (!_isValidEmail(jo.customer_email)) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: jo.customer_email, status: 'failed',
      errorMessage: 'Invalid recipient email format', triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Vehicle Released: ${jo.job_order_no}`,
      status: 'failed',
      errorMessage: 'Invalid recipient email format',
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

  const subtotal  = _round2(_computeSubtotalFromServices(services))
  const vatAmount = _round2(Number(jo.total_amount || 0) - subtotal)

  // ── 4. Send ──────────────────────────────────────────────────────────────────────────────
  const displayJobOrderNo = _formatDisplayJobOrderNo(jo.job_order_no, jo.customer_bay)

  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${jobOrderId}`, () => mailer.sendJobReleasedEmail({
      to: jo.customer_email,
      customerName: jo.customer_name,
      jobOrderNo: displayJobOrderNo,
      quotationNo: jo.quotation_no,
      plateNumber: jo.plate_number,
      make: jo.make,
      model: jo.model,
      vehicleYear: jo.vehicle_year,
      color: jo.color,
      services,
      totalAmount: jo.total_amount,
      subtotal,
      vatAmount,
      technicianNames,
      releasedAt: jo.released_at || new Date(),
    })))
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Vehicle Released: ${displayJobOrderNo}`,
      status: 'failed',
      errorMessage: err.message,
    })
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
    await _logEmailResult({
      userId: jo.customer_id,
      email: jo.customer_email,
      subject: `Vehicle Released: ${displayJobOrderNo}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: jo.customer_id,
      eventType: 'job_status_updated_released',
      payload: { job_order_id: jobOrderId, status: 'Released' },
    })
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
async function notifyPaymentReceived(paymentId, actorUserId, { resend = false } = {}) {
  const EVENT_TYPE  = 'payment_received'
  const ENTITY_TYPE = 'payment'

  // ── 1. Deduplication guard ────────────────────────────────────────────────
  if (resend) {
    await db.query(
      `DELETE FROM email_notifications WHERE event_type = $1 AND entity_id = $2`,
      [EVENT_TYPE, paymentId],
    ).catch(() => {})
  } else if (await _alreadySent(EVENT_TYPE, paymentId)) {
    console.info(`[EmailNotification] Skipped duplicate: ${EVENT_TYPE} #${paymentId}`)
    return
  }

  // Fetch payment + quotation + customer + vehicle
  const { rows } = await db.query(
    `SELECT p.id,
            p.amount AS payment_amount,
            p.payment_type,
            p.reference_no AS payment_reference,
            p.created_at AS payment_date,
            q.id AS quotation_id,
            q.quotation_no,
            q.services,
            q.total_amount,
            qps.total_paid,
            qps.outstanding_balance,
            c.id AS customer_id,
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
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: paymentId,
      recipientEmail: '(no email)', status: 'skipped',
      errorMessage: 'Customer has no email address', triggeredBy: actorUserId,
    })
    return
  }

  if (!_isValidEmail(data.customer_email)) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: paymentId,
      recipientEmail: data.customer_email, status: 'failed',
      errorMessage: 'Invalid recipient email format', triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: data.customer_id,
      email: data.customer_email,
      subject: `Payment Receipt: ${data.quotation_no}`,
      status: 'failed',
      errorMessage: 'Invalid recipient email format',
    })
    return
  }

  // Optional config gate (if settings exist)
  const cfgEnabled = await ConfigurationService.get('payment_email', 'enabled').catch(() => null)
  if (String(cfgEnabled) === 'false') {
    console.info(`[EmailNotification] ${EVENT_TYPE} #${paymentId}: disabled by configuration — skipping`)
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: paymentId,
      recipientEmail: data.customer_email, status: 'skipped',
      errorMessage: 'Disabled by configuration', triggeredBy: actorUserId,
    })
    return
  }

  const services = Array.isArray(data.services) ? data.services : []
  const subtotal  = _round2(_computeSubtotalFromServices(services))
  const vatAmount = _round2(Number(data.total_amount || 0) - subtotal)

  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${paymentId}`, () => mailer.sendPaymentReceiptEmail({
      to: data.customer_email,
      customerName: data.customer_name,
      quotationNo: data.quotation_no,
      paymentAmount: data.payment_amount,
      totalPaid: data.total_paid,
      totalAmount: data.total_amount,
      subtotal,
      vatAmount,
      outstandingBalance: data.outstanding_balance,
      paymentMethod: data.payment_type,
      paymentReference: data.payment_reference,
      paymentDate: data.payment_date,
      plateNumber: data.plate_number,
      make: data.make,
      model: data.model,
      vehicleYear: data.vehicle_year,
      color: data.color,
    })))
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: paymentId,
      recipientEmail: data.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_FAILED', entity: ENTITY_TYPE, entityId: paymentId,
      meta: { event: EVENT_TYPE, to: data.customer_email, error: err.message },
    }).catch(() => {})
    await _logEmailResult({
      userId: data.customer_id,
      email: data.customer_email,
      subject: `Payment Receipt: ${data.quotation_no}`,
      status: 'failed',
      errorMessage: err.message,
    })
    console.error(`[EmailNotification] ${EVENT_TYPE} #${paymentId} FAILED:`, err.message)
    return
  }

  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: paymentId,
    recipientEmail: data.customer_email, status,
    triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await writeAuditLog({
      userId: actorUserId, action: 'EMAIL_SENT', entity: ENTITY_TYPE, entityId: paymentId,
      meta: { event: EVENT_TYPE, to: data.customer_email, subject: `Payment Receipt: ${data.quotation_no}` },
    }).catch(() => {})
    await _logEmailResult({
      userId: data.customer_id,
      email: data.customer_email,
      subject: `Payment Receipt: ${data.quotation_no}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: data.customer_id,
      eventType: EVENT_TYPE,
      payload: { payment_id: paymentId, quotation_id: data.quotation_id },
    })
    console.info(`[EmailNotification] ${EVENT_TYPE} #${paymentId} → sent to ${data.customer_email}`)
  }
}

async function notifyScheduleApproved(appointmentId, actorUserId, { resend = false } = {}) {
  const EVENT_TYPE = 'schedule_approved'
  const ENTITY_TYPE = 'appointment'

  if (resend) {
    await db.query(
      `DELETE FROM email_notifications WHERE event_type = $1 AND entity_id = $2`,
      [EVENT_TYPE, appointmentId],
    ).catch(() => {})
  } else if (await _alreadySent(EVENT_TYPE, appointmentId)) {
    return
  }

  const { rows } = await db.query(
    `SELECT a.id,
            a.customer_id,
            a.schedule_start,
            a.schedule_end,
            a.bay,
            a.installer_team,
            a.notes,
            c.full_name AS customer_name,
            c.email AS customer_email,
            v.plate_number,
            v.make,
            v.model,
            v.year AS vehicle_year,
            v.color,
            sv.name AS service_name,
            COALESCE(q.quotation_no, s.reference_no) AS reference_no,
            q.notes AS quotation_notes,
            q.created_by AS quotation_created_by
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN vehicles v ON v.id = a.vehicle_id
     LEFT JOIN services sv ON sv.id = a.service_id
     LEFT JOIN quotations q ON q.id = a.quotation_id
     LEFT JOIN sales s ON s.id = a.sale_id
     WHERE a.id = $1
     LIMIT 1`,
    [appointmentId],
  )

  if (!rows.length) return
  const row = rows[0]
  if (!row.customer_email || !_isValidEmail(row.customer_email)) return

  const isPortalQuotation =
    Boolean(row.reference_no) &&
    String(row.quotation_notes || '').includes('[PORTAL BOOKING REQUEST]') &&
    (row.quotation_created_by === null || row.quotation_created_by === undefined)

  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${appointmentId}`, () => {
      if (isPortalQuotation) {
        return mailer.sendQuotationApprovedScheduledEmail({
          to: row.customer_email,
          customerName: row.customer_name,
          plateNumber: row.plate_number,
          make: row.make,
          model: row.model,
          vehicleYear: row.vehicle_year,
          color: row.color,
          scheduleStart: row.schedule_start,
          scheduleEnd: row.schedule_end,
          bay: row.bay,
          installerTeam: row.installer_team,
          serviceName: row.service_name,
          referenceNo: row.reference_no,
        })
      }

      return mailer.sendBookingConfirmationEmail({
        to: row.customer_email,
        customerName: row.customer_name,
        plateNumber: row.plate_number,
        make: row.make,
        model: row.model,
        vehicleYear: row.vehicle_year,
        color: row.color,
        scheduleStart: row.schedule_start,
        scheduleEnd: row.schedule_end,
        bay: row.bay,
        installerTeam: row.installer_team,
        serviceName: row.service_name,
        referenceNo: row.reference_no,
        notes: row.notes,
      })
    }))
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: appointmentId,
      recipientEmail: row.customer_email, status: 'failed',
      errorMessage: err.message, triggeredBy: actorUserId,
    })
    await _logEmailResult({
      userId: row.customer_id,
      email: row.customer_email,
      subject: `Schedule Approved: ${row.reference_no || `APPT-${appointmentId}`}`,
      status: 'failed',
      errorMessage: err.message,
    })
    return
  }

  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: appointmentId,
    recipientEmail: row.customer_email, status, triggeredBy: actorUserId,
  })

  if (!sendResult?.skipped) {
    await _logEmailResult({
      userId: row.customer_id,
      email: row.customer_email,
      subject: `Schedule Approved: ${row.reference_no || `APPT-${appointmentId}`}`,
      status: 'sent',
    })
    await _syncClientNotification({
      customerId: row.customer_id,
      eventType: EVENT_TYPE,
      payload: { appointment_id: appointmentId, quotation_no: row.reference_no },
    })
  }
}

async function notifySubscriptionConfirmed(userId, actorUserId, data = {}) {
  const eventEntityId = Number(data.subscriptionId || 0) || Date.now()
  const EVENT_TYPE = 'subscription_confirmed'
  const ENTITY_TYPE = 'subscription'

  if (await _alreadySent(EVENT_TYPE, eventEntityId)) return
  if (!data.email || !_isValidEmail(data.email)) return

  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${eventEntityId}`, () => mailer.sendSubscriptionConfirmationEmail({
      to: data.email,
      customerName: data.customerName,
      packageName: data.packageName,
      frequency: data.frequency,
      startDate: data.startDate,
      endDate: data.endDate,
      amount: data.amount,
      plateNumber: data.plateNumber,
      ctaUrl: data.ctaUrl || env.portalUrl,
    })))
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: eventEntityId,
      recipientEmail: data.email, status: 'failed', errorMessage: err.message, triggeredBy: actorUserId,
    })
    await _logEmailResult({ userId, email: data.email, subject: 'Subscription Confirmation', status: 'failed', errorMessage: err.message })
    return
  }

  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: eventEntityId,
    recipientEmail: data.email, status, triggeredBy: actorUserId,
  })
  if (!sendResult?.skipped) {
    await _logEmailResult({ userId, email: data.email, subject: 'Subscription Confirmation', status: 'sent' })
    await _syncClientNotification({
      customerId: userId,
      eventType: EVENT_TYPE,
      payload: { subscription_id: data.subscriptionId || null },
    })
  }
}

async function notifyPmsBookingConfirmed(userId, actorUserId, data = {}) {
  const eventEntityId = Number(data.appointmentId || 0) || Date.now()
  const EVENT_TYPE = 'pms_booking_confirmed'
  const ENTITY_TYPE = 'appointment'

  if (await _alreadySent(EVENT_TYPE, eventEntityId)) return
  if (!data.email || !_isValidEmail(data.email)) return

  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${eventEntityId}`, () => mailer.sendPmsBookingConfirmationEmail({
      to: data.email,
      customerName: data.customerName,
      packageName: data.packageName,
      scheduleStart: data.scheduleStart,
      scheduleEnd: data.scheduleEnd,
      bay: data.bay,
      plateNumber: data.plateNumber,
      referenceNo: data.referenceNo,
      ctaUrl: data.ctaUrl || env.portalUrl,
    })))
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: eventEntityId,
      recipientEmail: data.email, status: 'failed', errorMessage: err.message, triggeredBy: actorUserId,
    })
    await _logEmailResult({ userId, email: data.email, subject: 'PMS Booking Confirmation', status: 'failed', errorMessage: err.message })
    return
  }

  const status = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: eventEntityId,
    recipientEmail: data.email, status, triggeredBy: actorUserId,
  })
  if (!sendResult?.skipped) {
    await _logEmailResult({ userId, email: data.email, subject: 'PMS Booking Confirmation', status: 'sent' })
    await _syncClientNotification({
      customerId: userId,
      eventType: EVENT_TYPE,
      payload: { appointment_id: data.appointmentId || null },
    })
  }
}

async function notifyJobStatusUpdated(jobOrderId, status, actorUserId, extra = {}) {
  const normalized = String(status || '').trim()
  const lower = normalized.toLowerCase().replace(/\s+/g, '_')
  if (!normalized) return

  if (normalized === 'In Progress') return notifyJobStarted(jobOrderId, actorUserId, extra)
  if (normalized === 'Completed') return notifyJobCompleted(jobOrderId, actorUserId)
  if (normalized === 'Released') return notifyJobReleased(jobOrderId, actorUserId)

  const EVENT_TYPE = `job_status_updated_${lower}`
  const ENTITY_TYPE = 'job_order'

  if (await _alreadySent(EVENT_TYPE, jobOrderId)) return

  const { rows } = await db.query(
    `SELECT jo.id,
            jo.job_order_no,
            q.quotation_no,
            c.id AS customer_id,
            c.full_name AS customer_name,
            c.email AS customer_email,
            v.plate_number,
            v.make,
            v.model,
            v.year AS vehicle_year,
            v.color
     FROM job_orders jo
     JOIN customers c ON c.id = jo.customer_id
     LEFT JOIN quotations q ON q.id = jo.quotation_id
     LEFT JOIN vehicles v ON v.id = jo.vehicle_id
     WHERE jo.id = $1`,
    [jobOrderId],
  )
  if (!rows.length) return
  const row = rows[0]
  if (!row.customer_email || !_isValidEmail(row.customer_email)) return

  let sendResult
  try {
    sendResult = await _enqueueEmailJob(() => _sendWithRetry(`${EVENT_TYPE}#${jobOrderId}`, () => mailer.sendJobStatusUpdateEmail({
      to: row.customer_email,
      customerName: row.customer_name,
      jobOrderNo: row.job_order_no,
      quotationNo: row.quotation_no,
      plateNumber: row.plate_number,
      make: row.make,
      model: row.model,
      vehicleYear: row.vehicle_year,
      color: row.color,
      status: normalized,
      statusAt: new Date(),
      notes: extra.cancelReason || null,
      ctaUrl: env.portalUrl,
    })))
  } catch (err) {
    await _logNotification({
      eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
      recipientEmail: row.customer_email, status: 'failed', errorMessage: err.message, triggeredBy: actorUserId,
    })
    await _logEmailResult({ userId: row.customer_id, email: row.customer_email, subject: `Job Status Update: ${normalized}`, status: 'failed', errorMessage: err.message })
    return
  }

  const statusResult = sendResult?.skipped ? 'skipped' : 'sent'
  await _logNotification({
    eventType: EVENT_TYPE, entityType: ENTITY_TYPE, entityId: jobOrderId,
    recipientEmail: row.customer_email, status: statusResult, triggeredBy: actorUserId,
  })
  if (!sendResult?.skipped) {
    await _logEmailResult({ userId: row.customer_id, email: row.customer_email, subject: `Job Status Update: ${normalized}`, status: 'sent' })
    await _syncClientNotification({
      customerId: row.customer_id,
      eventType: EVENT_TYPE,
      payload: { job_order_id: jobOrderId, status: normalized },
    })
  }
}

async function sendEmail(eventType, userId, data = {}) {
  const type = String(eventType || '').trim()
  switch (type) {
    case 'quotation_approved':
      return notifyQuotationApproved(Number(data.quotationId), userId)
    case 'schedule_approved':
      return notifyScheduleApproved(Number(data.appointmentId), userId, { resend: Boolean(data.resend) })
    case 'job_order_confirmed':
      return notifyTechnicianAssigned(Number(data.jobOrderId), userId)
    case 'payment_completed':
    case 'payment_received':
      return notifyPaymentReceived(Number(data.paymentId), userId, { resend: Boolean(data.resend) })
    case 'job_status_updated':
      return notifyJobStatusUpdated(Number(data.jobOrderId), data.status, userId, data)
    case 'subscription_confirmed':
      return notifySubscriptionConfirmed(Number(data.userId || userId), userId, data)
    case 'pms_booking_confirmed':
      return notifyPmsBookingConfirmed(Number(data.userId || userId), userId, data)
    default:
      throw new Error(`Unsupported email event type: ${type}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  sendEmail,
  notifyQuotationApproved,
  notifyScheduleApproved,
  notifyJobStarted,
  notifyJobStatusUpdated,
  notifySubscriptionConfirmed,
  notifyPmsBookingConfirmed,
  notifyTechnicianAssigned,
  notifyJobCompleted,
  notifyJobReleased,
  notifyPaymentReceived,
  // Expose fire-and-forget wrapper for use in route handlers
  safeFireAndForget,
}
