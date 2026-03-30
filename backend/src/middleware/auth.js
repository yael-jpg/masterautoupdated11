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

module.exports = { requireAuth, requireRole }
