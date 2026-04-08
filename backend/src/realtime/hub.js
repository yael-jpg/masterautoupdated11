const jwt = require('jsonwebtoken')
const env = require('../config/env')

let io = null

function normalizeRole(payload) {
  if (payload?.customerId) return 'client'
  if (payload?.role === 'Admin' || payload?.role === 'SuperAdmin') return 'admin'
  return 'unknown'
}

function initializeRealtimeHub(server) {
  const { Server } = require('socket.io')

  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  })

  io.use((socket, next) => {
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

module.exports = {
  initializeRealtimeHub,
  getIo,
  emitToRole,
  emitToAdminUser,
  emitToClientUser,
  emitSettingsUpdated,
  emitDataChanged,
}
