const express = require('express')
const { body, param } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireRole } = require('../middleware/auth')
const { writeAuditLog } = require('../utils/auditLog')
const { validateRequest } = require('../middleware/validateRequest')

const router = express.Router()

// ── GET /commissions ───────────────────────────────────────────────────────
// Summary per installer (optional: filter by month)
router.get(
  '/',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const month = req.query.month // YYYY-MM  e.g. 2026-02
    const userId = req.query.userId

    let where = ''
    const vals = []
    let idx = 1

    if (month) {
      where += `${where ? ' AND' : 'WHERE'} TO_CHAR(ic.created_at,'YYYY-MM') = $${idx}`
      vals.push(month)
      idx++
    }
    if (userId) {
      where += `${where ? ' AND' : 'WHERE'} ic.user_id = $${idx}`
      vals.push(Number(userId))
      idx++
    }

    const { rows } = await db.query(
      `SELECT ic.*,
              u.full_name     AS installer_name,
              jo.job_order_no
       FROM installer_commissions ic
       JOIN users u   ON u.id  = ic.user_id
       JOIN job_orders jo ON jo.id = ic.job_order_id
       ${where}
       ORDER BY ic.created_at DESC`,
      vals,
    )
    res.json(rows)
  }),
)

// ── GET /commissions/summary ───────────────────────────────────────────────
router.get(
  '/summary',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT * FROM installer_commission_summary ORDER BY full_name`)
    res.json(rows)
  }),
)

// ── GET /commissions/rates ─────────────────────────────────────────────────
router.get(
  '/rates',
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT r.*, u.full_name AS installer_name
       FROM installer_commission_rates r
       JOIN users u ON u.id = r.user_id
       ORDER BY u.full_name, r.service_code`,
    )
    res.json(rows)
  }),
)

// ── POST /commissions/rates ────────────────────────────────────────────────
router.post(
  '/rates',
  body('userId').isInt({ min: 1 }),
  body('rateType').isIn(['fixed', 'percent']),
  body('rateValue').isFloat({ gt: 0 }),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { userId, serviceCode, rateType, rateValue } = req.body
    const { rows } = await db.query(
      `INSERT INTO installer_commission_rates (user_id, service_code, rate_type, rate_value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, service_code) DO UPDATE
         SET rate_type = EXCLUDED.rate_type, rate_value = EXCLUDED.rate_value
       RETURNING *`,
      [userId, serviceCode || null, rateType, rateValue],
    )
    await writeAuditLog({ userId: req.user.id, action: 'SET_COMMISSION_RATE', entity: 'commission_rate', entityId: rows[0].id, meta: { userId, rateType, rateValue, serviceCode } })
    res.status(201).json(rows[0])
  }),
)

// ── DELETE /commissions/rates/:id ─────────────────────────────────────────
router.delete(
  '/rates/:id',
  param('id').isInt({ min: 1 }),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await db.query(`DELETE FROM installer_commission_rates WHERE id = $1`, [req.params.id])
    if (!rowCount) return res.status(404).json({ message: 'Rate not found' })
    res.status(204).send()
  }),
)

// ── POST /commissions/calculate/:jobOrderId ────────────────────────────────
// Triggered when Job Order status → Released. Calculates and persists commissions.
router.post(
  '/calculate/:jobOrderId',
  param('jobOrderId').isInt({ min: 1 }),
  validateRequest,
  requireRole('Admin', 'SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { jobOrderId } = req.params

    const { rows: joRows } = await db.query(
      `SELECT jo.*, q.total_amount AS quotation_total
       FROM job_orders jo
       JOIN quotations q ON q.id = jo.quotation_id
       WHERE jo.id = $1`,
      [jobOrderId],
    )
    if (!joRows.length) return res.status(404).json({ message: 'Job Order not found' })
    const jo = joRows[0]

    const installers = Array.isArray(jo.assigned_installers) ? jo.assigned_installers : []
    const services   = Array.isArray(jo.services)            ? jo.services            : []

    const created = []

    for (const installerId of installers) {
      // Fetch applicable commission rate(s) for this installer
      const { rows: rates } = await db.query(
        `SELECT * FROM installer_commission_rates
         WHERE user_id = $1
         ORDER BY service_code NULLS LAST`,
        [installerId],
      )

      for (const svc of services) {
        const serviceCode = svc.code || null
        // Find specific service rate first, then fallback to catch-all (NULL service_code)
        const rate = rates.find(r => r.service_code === serviceCode) || rates.find(r => !r.service_code)
        if (!rate) continue

        const laborValue = Number(svc.price || svc.total || jo.quotation_total || 0)
        const commissionAmount = rate.rate_type === 'fixed'
          ? Number(rate.rate_value)
          : Number(((laborValue * Number(rate.rate_value)) / 100).toFixed(2))

        const { rows: inserted } = await db.query(
          `INSERT INTO installer_commissions
             (job_order_id, user_id, service_code, service_name, labor_value, rate_type, rate_value, commission_amount, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'payable')
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [jobOrderId, installerId, serviceCode, svc.name || null, laborValue, rate.rate_type, rate.rate_value, commissionAmount],
        )
        if (inserted.length) created.push(inserted[0])
      }
    }

    await writeAuditLog({ userId: req.user.id, action: 'CALCULATE_COMMISSIONS', entity: 'job_order', entityId: Number(jobOrderId), meta: { count: created.length } })
    res.json({ calculated: created.length, commissions: created })
  }),
)

// ── PATCH /commissions/:id/pay ─────────────────────────────────────────────
router.patch(
  '/:id/pay',
  param('id').isInt({ min: 1 }),
  validateRequest,
  requireRole('SuperAdmin'),
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `UPDATE installer_commissions
       SET status = 'paid', paid_at = NOW()
       WHERE id = $1 AND status = 'payable'
       RETURNING *`,
      [req.params.id],
    )
    if (!rows.length) return res.status(404).json({ message: 'Commission not found or already paid' })
    await writeAuditLog({ userId: req.user.id, action: 'MARK_COMMISSION_PAID', entity: 'installer_commission', entityId: rows[0].id, meta: {} })
    res.json(rows[0])
  }),
)

module.exports = router


