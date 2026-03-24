/**
 * autoCancelJob.js
 *
 * Scheduled job: reads `booking.auto_cancel_unpaid_hours` from system_config
 * and auto-cancels any Scheduled bookings that:
 *   - have no payment on file (UNPAID)
 *   - were created more than N hours ago
 *   - are not already terminal (Cancelled / Completed / Released)
 *
 * Runs every 30 minutes. If the setting is 0 (or missing), the job is skipped.
 *
 * Each cancellation cascades:
 *   1. appointment  → Cancelled
 *   2. job_orders   → Cancelled  (via quotation_id)
 *   3. quotations   → Cancelled  (removes from Payments & POS)
 * All three in one transaction per booking.
 */

const cron = require('node-cron')
const db = require('../config/db')

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAutoCancelHours() {
  try {
    const { rows } = await db.query(
      `SELECT value FROM system_config WHERE category = 'booking' AND key = 'auto_cancel_unpaid_hours' LIMIT 1`,
    )
    const raw = rows[0]?.value
    if (!raw) return 0
    const hours = parseInt(raw, 10)
    return Number.isFinite(hours) && hours > 0 ? hours : 0
  } catch {
    return 0
  }
}

async function runAutoCancelJob() {
  const hours = await getAutoCancelHours()
  if (!hours) return // disabled

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)

  // Find unpaid bookings older than cutoff. Use schedule_start when available,
  // otherwise fallback to created_at. Include 'Scheduled' and 'Pending' statuses
  // so that bookings that haven't progressed to a paid/completed state are
  // considered for auto-cancellation.
  const { rows: candidates } = await db.query(
    `SELECT
       a.id,
       a.quotation_id,
       a.status,
       a.created_at,
       a.schedule_start,
       c.full_name  AS customer_name,
       c.email      AS customer_email,
       v.plate_number,
       COALESCE(qps.total_paid, 0)::NUMERIC AS total_paid
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN vehicles  v ON v.id = a.vehicle_id
     LEFT JOIN quotation_payment_summary qps ON qps.quotation_id = a.quotation_id
     WHERE a.status IN ('Scheduled', 'Pending')
       AND COALESCE(a.schedule_start, a.created_at) < $1
       AND COALESCE(qps.total_paid, 0) = 0`,
    [cutoff],
  )

  if (!candidates.length) return

  console.log(`[AutoCancel] Running — cutoff: ${cutoff.toISOString()}, candidates: ${candidates.length}`)

  for (const appt of candidates) {
    const client = await db.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Cancel the appointment
      await client.query(
        `UPDATE appointments
           SET status = 'Cancelled',
               cancel_reason = $2
         WHERE id = $1`,
        [appt.id, `Auto-cancelled — no payment received within ${hours} hour${hours !== 1 ? 's' : ''}`],
      )

      // 2. Cancel linked Job Orders
      if (appt.quotation_id) {
        const { rows: joRows } = await client.query(
          `UPDATE job_orders
             SET status = 'Cancelled',
                 previous_status = status,
                 cancel_reason = $2
           WHERE quotation_id = $1
             AND status NOT IN ('Cancelled', 'Complete', 'Released', 'Completed')
           RETURNING id, job_order_no, status AS prev_status`,
          [appt.quotation_id, `Auto-cancelled — booking #${appt.id} auto-cancelled (no payment within ${hours}h)`],
        )
        for (const jo of joRows) {
          await client.query(
            `INSERT INTO status_transitions
               (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
             VALUES ('job_order', $1, $2, 'Cancelled', NULL, NOW(), $3)`,
            [jo.id, jo.prev_status,
             `Auto-cancelled — booking #${appt.id} auto-cancelled (no payment within ${hours}h)`],
          )
        }

        // 3. Cancel the linked quotation
        await client.query(
          `UPDATE quotations
             SET status = 'Cancelled'
           WHERE id = $1 AND status NOT IN ('Cancelled', 'Completed')`,
          [appt.quotation_id],
        )
      }

      // 4. Audit log
      await client.query(
        `INSERT INTO activity_logs (user_id, action, entity, entity_id, notes, created_at)
         VALUES (NULL, 'AUTO_CANCEL', 'appointments', $1, $2, NOW())`,
        [appt.id,
         `Auto-cancelled booking for ${appt.customer_name} (${appt.plate_number}) — no payment within ${hours}h of creation`],
      ).catch(() => {})

      await client.query(
        `INSERT INTO status_transitions
           (entity_type, entity_id, from_status, to_status, changed_by, changed_at, notes)
         VALUES ('appointment', $1, 'Scheduled', 'Cancelled', NULL, NOW(), $2)`,
        [appt.id, `Auto-cancelled — no payment within ${hours} hours`],
      ).catch(() => {})

      await client.query('COMMIT')
      console.log(`[AutoCancel] Cancelled booking #${appt.id} (${appt.customer_name} / ${appt.plate_number})`)
    } catch (err) {
      await client.query('ROLLBACK')
      console.error(`[AutoCancel] Failed to cancel booking #${appt.id}:`, err.message)
    } finally {
      client.release()
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

function startAutoCancelJob() {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runAutoCancelJob().catch((err) =>
      console.error('[AutoCancel] Unexpected error:', err.message),
    )
  })
  console.log('[AutoCancel] Scheduled — runs every 30 minutes')
}

module.exports = { startAutoCancelJob, runAutoCancelJob }
