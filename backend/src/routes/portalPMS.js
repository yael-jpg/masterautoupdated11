/**
 * /api/portal/pms/* — Customer PMS (Preventive Maintenance Service) routes
 */

const express = require('express')
const { asyncHandler } = require('../utils/asyncHandler')
const db = require('../config/db')

const router = express.Router()

// GET /api/portal/pms/packages - Get all available PMS packages
router.get('/packages', asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      id,
      name,
      description,
      price,
      odometer_interval as mileage_interval,
      CASE WHEN LOWER(COALESCE(interval_unit, '')) IN ('month', 'months') THEN interval_value ELSE NULL END as months_interval,
      created_at
    FROM pms_packages
    ORDER BY name ASC
  `

  const packages = await db.query(query, [])
  res.json(packages.rows || [])
}))

// GET /api/portal/pms/tracking - Get PMS service tracking for customer
router.get('/tracking', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      pst.id,
      pst.subscription_id,
      pst.status,
      pst.due_date,
      pst.completed_date,
      pst.notes,
      pst.created_at,
      s.vehicle_id,
      s.subscription_service_id as package_id,
      pp.name as package_name,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant
    FROM pms_service_tracking pst
    JOIN subscriptions s ON pst.subscription_id = s.id
    LEFT JOIN pms_packages pp ON s.subscription_service_id = pp.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.customer_id = $1
    ORDER BY pst.due_date ASC
  `

  const tracking = await db.query(query, [customerId])
  res.json(tracking.rows || [])
}))

// GET /api/portal/pms/stats - Get PMS stats for customer
router.get('/stats', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      COALESCE(SUM(CASE WHEN pst.status = 'Due' THEN 1 ELSE 0 END), 0) as due_count,
      COALESCE(SUM(CASE WHEN pst.status = 'In Progress' THEN 1 ELSE 0 END), 0) as in_progress_count,
      COALESCE(SUM(CASE WHEN pst.status = 'Completed' THEN 1 ELSE 0 END), 0) as completed_count,
      COUNT(DISTINCT s.id) as active_subscriptions,
      COALESCE(SUM(CASE WHEN pst.status = 'Due' AND pst.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 ELSE 0 END), 0) as due_this_week
    FROM pms_service_tracking pst
    JOIN subscriptions s ON pst.subscription_id = s.id
    WHERE s.customer_id = $1
  `

  const results = await db.query(query, [customerId])
  res.json(results.rows[0] || {})
}))

// GET /api/portal/pms/subscriptions - Get customer's PMS subscriptions
router.get('/subscriptions', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      s.id,
      s.vehicle_id,
      s.subscription_service_id as package_id,
      s.status,
      s.start_date,
      s.end_date,
      pp.name as package_name,
      pp.description as package_description,
      pp.price as package_price,
      pp.odometer_interval as mileage_interval,
      CASE WHEN LOWER(COALESCE(pp.interval_unit, '')) IN ('month', 'months') THEN pp.interval_value ELSE NULL END as months_interval,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant,
      COUNT(pst.id) as total_services,
      COALESCE(SUM(CASE WHEN pst.status = 'Completed' THEN 1 ELSE 0 END), 0) as completed_services,
      COALESCE(SUM(CASE WHEN pst.status = 'Due' THEN 1 ELSE 0 END), 0) as due_services
    FROM subscriptions s
    LEFT JOIN pms_packages pp ON s.subscription_service_id = pp.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    LEFT JOIN pms_service_tracking pst ON s.id = pst.subscription_id
    WHERE s.customer_id = $1
    GROUP BY s.id, pp.name, pp.description, pp.price, pp.odometer_interval, pp.interval_unit, pp.interval_value, v.plate_number, v.make, v.model, v.variant
    ORDER BY s.created_at DESC
  `

  const subs = await db.query(query, [customerId])
  res.json(subs.rows || [])
}))

module.exports = router
