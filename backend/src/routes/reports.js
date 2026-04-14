const express = require('express')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')

const router = express.Router()

router.get(
  '/sales-summary',
  asyncHandler(async (req, res) => {
    // Daily & monthly totals from quotations (approved/active records)
    const daily = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM quotations q
       WHERE q.created_at::date = CURRENT_DATE
         AND q.status NOT IN ('Not Approved', 'Cancelled')
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           JOIN sales s ON s.id = a.sale_id
           WHERE a.quotation_id = q.id
             AND COALESCE(s.workflow_status, '') = 'Voided'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM sales s
           WHERE COALESCE(s.workflow_status, '') = 'Voided'
             AND UPPER(COALESCE(s.reference_no, '')) = UPPER(COALESCE(q.quotation_no, ''))
         )`,
    )

    const monthly = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM quotations q
       WHERE date_trunc('month', q.created_at) = date_trunc('month', CURRENT_DATE)
         AND q.status NOT IN ('Not Approved', 'Cancelled')
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           JOIN sales s ON s.id = a.sale_id
           WHERE a.quotation_id = q.id
             AND COALESCE(s.workflow_status, '') = 'Voided'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM sales s
           WHERE COALESCE(s.workflow_status, '') = 'Voided'
             AND UPPER(COALESCE(s.reference_no, '')) = UPPER(COALESCE(q.quotation_no, ''))
         )`,
    )

    const byService = await db.query(
      `SELECT
         COALESCE(svc->>'name', 'Custom') AS service_package,
         COALESCE(SUM((svc->>'total')::NUMERIC), 0) AS total
       FROM quotations q,
            jsonb_array_elements(q.services) AS svc
        WHERE q.status NOT IN ('Not Approved', 'Cancelled')
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           JOIN sales s ON s.id = a.sale_id
           WHERE a.quotation_id = q.id
             AND COALESCE(s.workflow_status, '') = 'Voided'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM sales s
           WHERE COALESCE(s.workflow_status, '') = 'Voided'
             AND UPPER(COALESCE(s.reference_no, '')) = UPPER(COALESCE(q.quotation_no, ''))
         )
       GROUP BY svc->>'name'
       ORDER BY total DESC
       LIMIT 8`,
    )

    const trend = await db.query(
      `SELECT to_char(q.created_at, 'Mon DD') AS date, SUM(q.total_amount) AS total
       FROM quotations q
       WHERE q.created_at > CURRENT_DATE - INTERVAL '7 days'
         AND q.status NOT IN ('Not Approved', 'Cancelled')
         AND NOT EXISTS (
           SELECT 1
           FROM appointments a
           JOIN sales s ON s.id = a.sale_id
           WHERE a.quotation_id = q.id
             AND COALESCE(s.workflow_status, '') = 'Voided'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM sales s
           WHERE COALESCE(s.workflow_status, '') = 'Voided'
             AND UPPER(COALESCE(s.reference_no, '')) = UPPER(COALESCE(q.quotation_no, ''))
         )
       GROUP BY to_char(q.created_at, 'Mon DD'), q.created_at::date
       ORDER BY q.created_at::date ASC`,
    )

    let outstanding
    try {
      outstanding = await db.query(
        `SELECT COALESCE(SUM(outstanding_balance), 0) AS outstanding
        FROM quotation_payment_summary qps
        JOIN quotations q ON q.id = qps.quotation_id
        WHERE q.status NOT IN ('Not Approved', 'Cancelled')
          AND NOT EXISTS (
            SELECT 1
            FROM appointments a
            JOIN sales s ON s.id = a.sale_id
            WHERE a.quotation_id = q.id
              AND COALESCE(s.workflow_status, '') = 'Voided'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM sales s
            WHERE COALESCE(s.workflow_status, '') = 'Voided'
              AND UPPER(COALESCE(s.reference_no, '')) = UPPER(COALESCE(q.quotation_no, ''))
          )`,
      )
    } catch (err) {
      // Backward-compat: some deployments may not have migration 011 applied yet.
      // Fall back to computing outstanding from quotations + payments directly.
      if (String(err?.code) !== '42P01') throw err
      outstanding = await db.query(
        `SELECT COALESCE(SUM(GREATEST(q.total_amount - COALESCE(p.total_paid, 0), 0)), 0) AS outstanding
         FROM quotations q
         LEFT JOIN (
           SELECT quotation_id, SUM(amount) AS total_paid
           FROM payments
           WHERE quotation_id IS NOT NULL
           GROUP BY quotation_id
         ) p ON p.quotation_id = q.id
         WHERE q.status NOT IN ('Not Approved', 'Cancelled')
           AND NOT EXISTS (
             SELECT 1
             FROM appointments a
             JOIN sales s ON s.id = a.sale_id
             WHERE a.quotation_id = q.id
               AND COALESCE(s.workflow_status, '') = 'Voided'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM sales s
             WHERE COALESCE(s.workflow_status, '') = 'Voided'
               AND UPPER(COALESCE(s.reference_no, '')) = UPPER(COALESCE(q.quotation_no, ''))
           )`,
      )
    }

    res.json({
      dailyTotal: daily.rows[0].total,
      monthlyTotal: monthly.rows[0].total,
      byServiceType: byService.rows,
      salesTrend: trend.rows,
      outstandingBalance: outstanding.rows[0].outstanding,
    })
  }),
)

module.exports = router

