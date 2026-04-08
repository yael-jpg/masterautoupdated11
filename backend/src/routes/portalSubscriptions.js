/**
 * /api/portal/subscriptions/* — Customer subscription routes
 */

const express = require('express')
const { asyncHandler } = require('../utils/asyncHandler')
const db = require('../config/db')

const router = express.Router()

// GET /api/portal/subscriptions/stats - Get subscription stats
router.get('/stats', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN s.status = 'Active' THEN 1 ELSE 0 END), 0) as active,
      COALESCE(SUM(CASE WHEN s.status = 'Expiring Soon' THEN 1 ELSE 0 END), 0) as expiring_soon,
      COALESCE(SUM(CASE WHEN s.status = 'Expired' THEN 1 ELSE 0 END), 0) as expired,
      COALESCE(SUM(CASE WHEN s.status = 'Cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
      COALESCE(SUM(s.price), 0) as total_revenue
    FROM subscriptions s
    INNER JOIN subscription_packages sp ON s.subscription_service_id = sp.id
    WHERE s.customer_id = $1
  `

  const results = await db.query(query, [customerId])
  res.json(results.rows[0] || {})
}))

// GET /api/portal/subscriptions - Get all subscriptions for customer
router.get('/', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      s.id,
      s.customer_id,
      s.vehicle_id,
      s.subscription_service_id as package_id,
      s.status,
      s.start_date,
      s.end_date,
      s.price as monthly_revenue,
      s.created_at,
      sp.name as package_name,
      sp.description as package_description,
      sp.price as package_price,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant
    FROM subscriptions s
    INNER JOIN subscription_packages sp ON s.subscription_service_id = sp.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.customer_id = $1
    ORDER BY s.created_at DESC
  `

  const subs = await db.query(query, [customerId])
  res.json(subs.rows || [])
}))

// GET /api/portal/subscriptions/:id - Get specific subscription
router.get('/:id', asyncHandler(async (req, res) => {
  const customerId = req.customerId
  const { id } = req.params
  if (!customerId) return res.status(401).json({ error: 'Unauthorized' })

  const query = `
    SELECT 
      s.*,
      sp.name as package_name,
      sp.description as package_description,
      sp.price as package_price,
      NULL::INT as mileage_interval,
      NULL::INT as months_interval,
      v.plate_number,
      TRIM(CONCAT_WS(' ', v.make, v.model, v.variant)) as make_model_variant
    FROM subscriptions s
    INNER JOIN subscription_packages sp ON s.subscription_service_id = sp.id
    LEFT JOIN vehicles v ON s.vehicle_id = v.id
    WHERE s.id = $1 AND s.customer_id = $2
  `

  const results = await db.query(query, [id, customerId])
  if (!results.rows || results.rows.length === 0) {
    return res.status(404).json({ error: 'Subscription not found' })
  }

  res.json(results.rows[0])
}))

module.exports = router
