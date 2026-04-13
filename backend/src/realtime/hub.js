const jwt = require('jsonwebtoken')
const env = require('../config/env')

let io = null

function normalizeRole(payload) {
  if (payload?.role === 'landing-visitor') return 'landing-visitor'
  if (payload?.customerId) return 'client'
  if (payload?.role === 'Admin' || payload?.role === 'SuperAdmin') return 'admin'
  return 'unknown'
}

function normalizeVisitorToken(raw) {
  const token = String(raw || '').trim()
  if (!token) return ''
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(token)) return ''
  return token
}

function initializeRealtimeHub(server) {
  const { Server } = require('socket.io')
  const allowed = new Set(env.corsOrigins)
  const isProduction = env.nodeEnv === 'production'

  const socketOriginCheck = (origin, callback) => {
    if (!origin) return callback(null, true)
    if (!isProduction) return callback(null, true)
    if (allowed.has(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed by CORS'))
  }

  io = new Server(server, {
    cors: {
      origin: socketOriginCheck,
      credentials: true,
    },
  })

  io.use((socket, next) => {
    const visitorToken = normalizeVisitorToken(socket.handshake?.auth?.visitorToken)
    const guestChatFlag = socket.handshake?.auth?.guestChat

    // Public landing page chat can connect with a visitor token (no JWT).
    if (visitorToken && (guestChatFlag === true || guestChatFlag === 'true' || guestChatFlag === 1 || guestChatFlag === '1')) {
      socket.user = { role: 'landing-visitor', visitorToken }
      return next()
    }

    const authToken = socket.handshake?.auth?.token
    const queryToken = socket.handshake?.query?.token
    const bearer = socket.handshake?.headers?.authorization
    const headerToken = typeof bearer === 'string' && bearer.startsWith('Bearer ')
      ? bearer.slice(7)
      : null

    const token = authToken || queryToken || headerToken
    if (!token) return next(new Error('Authentication required'))

    try {
      const payload = jwt.verify(token, env.jwtSecret)
      socket.user = payload
      return next()
    } catch (err) {
      return next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const payload = socket.user || {}
    const role = normalizeRole(payload)

    socket.join(`role:${role}`)

    if (role === 'admin' && payload.id) {
      socket.join(`admin:${payload.id}`)
    }

    if (role === 'client' && payload.customerId) {
      socket.join(`client:${payload.customerId}`)
    }

    if (role === 'landing-visitor' && payload.visitorToken) {
      socket.join(`landing-visitor:${payload.visitorToken}`)
    }
  })

  return io
}

function getIo() {
  return io
}

function emitToRole(role, event, payload) {
  if (!io) return
  io.to(`role:${role}`).emit(event, payload)
}

function emitToAdminUser(userId, event, payload) {
  if (!io || !userId) return
  io.to(`admin:${userId}`).emit(event, payload)
}

function emitToClientUser(customerId, event, payload) {
  if (!io || !customerId) return
  io.to(`client:${customerId}`).emit(event, payload)
}

function emitSettingsUpdated(payload = {}) {
  emitToRole('admin', 'settings:updated', payload)
  emitToRole('client', 'settings:updated', payload)
}

function emitDataChanged(payload = {}) {
  emitToRole('admin', 'data:changed', payload)
  emitToRole('client', 'data:changed', payload)
}

function emitToLandingVisitor(visitorToken, event, payload) {
  if (!io || !visitorToken) return
  io.to(`landing-visitor:${visitorToken}`).emit(event, payload)
}

module.exports = {
  initializeRealtimeHub,
  getIo,
  emitToRole,
  emitToAdminUser,
  emitToClientUser,
  emitToLandingVisitor,
  emitSettingsUpdated,
  emitDataChanged,
}
