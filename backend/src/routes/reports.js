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
       FROM quotations
       WHERE created_at::date = CURRENT_DATE
         AND status NOT IN ('Not Approved')`,
    )

    const monthly = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM quotations
       WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
         AND status NOT IN ('Not Approved')`,
    )

    const byService = await db.query(
      `SELECT
         COALESCE(svc->>'name', 'Custom') AS service_package,
         COALESCE(SUM((svc->>'total')::NUMERIC), 0) AS total
       FROM quotations q,
            jsonb_array_elements(q.services) AS svc
       WHERE q.status NOT IN ('Not Approved')
       GROUP BY svc->>'name'
       ORDER BY total DESC
       LIMIT 8`,
    )

    const trend = await db.query(
      `SELECT to_char(created_at, 'Mon DD') AS date, SUM(total_amount) AS total
       FROM quotations
       WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
         AND status NOT IN ('Not Approved')
       GROUP BY to_char(created_at, 'Mon DD'), created_at::date
       ORDER BY created_at::date ASC`,
    )

    const outstanding = await db.query(
      `SELECT COALESCE(SUM(outstanding_balance), 0) AS outstanding
       FROM quotation_payment_summary`,
    )

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

