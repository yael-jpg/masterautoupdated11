import { io } from 'socket.io-client'

const RAW_API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : 'https://masterautoupdated21.onrender.com/api')

function toOrigin(base) {
  const trimmed = String(base || '').replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed.slice(0, -4)
  if (trimmed.endsWith('/api/portal')) return trimmed.slice(0, -11)
  return trimmed
}

const SOCKET_URL = toOrigin(RAW_API_BASE)

export function createRealtimeClient(token) {
  if (!token) return null

  return io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
  })
}
