const jwt = require('jsonwebtoken')
const env = require('../config/env')

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret)
    req.user = payload
    return next()
  } catch (error) {
    if (error && error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please sign in again.', code: 'SESSION_EXPIRED' })
    }
    return res.status(401).json({ message: 'Invalid token', code: 'INVALID_TOKEN' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }
    return next()
  }
}

function enforceAdminAccessPolicy(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') return next()

  const normalize = (value) => {
    const base = String(value || '').trim()
    if (!base) return '/'
    const cleaned = base.replace(/\/+$/, '')
    return cleaned || '/'
  }

  const method = String(req.method || 'GET').toUpperCase()
  const path = normalize(req.path)

  if (path.startsWith('/settings') || path.startsWith('/config')) {
    return res.status(403).json({ message: 'Admin role cannot access Configuration settings' })
  }

  // Keep Admin blocked from Admin & Security endpoints.
  // Exception: module-access is used to load effective role permissions.
  if (path.startsWith('/admin') && path !== '/admin/module-access') {
    return res.status(403).json({ message: 'Admin role cannot access Admin & Security' })
  }

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()

  if (method === 'POST') {
    const allowedCreateEndpoints = new Set([
      '/customers',
      '/vehicles',
      '/quotations',
      '/appointments',
      '/job-orders',
    ])
    if (allowedCreateEndpoints.has(path)) {
      return next()
    }
  }

  return res.status(403).json({
    message: 'Admin role is limited to create-only for customers, vehicles, quotations, schedules, and job orders. Updates and deletes are restricted.',
  })
}

module.exports = { requireAuth, requireRole, enforceAdminAccessPolicy }
