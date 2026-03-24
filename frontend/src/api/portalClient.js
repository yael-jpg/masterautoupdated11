/**
 * Portal API client
 * Wraps fetch with the portal base URL and the portal JWT token stored in
 * localStorage under "ma_portal_token".
 */

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

// Normalize base URL so we always end up with ".../api/portal".
// Supports env values like:
// - http://localhost:5000
// - http://localhost:5000/api
// - http://localhost:5000/api/portal
const PORTAL_BASE_URL = (() => {
  const trimmed = String(RAW_API_BASE || '').replace(/\/+$/, '')
  if (trimmed.endsWith('/api/portal')) return trimmed
  if (trimmed.endsWith('/api')) return `${trimmed}/portal`
  return `${trimmed}/api/portal`
})()

// ─── Session helpers ──────────────────────────────────────────────────────────

export function getPortalToken() {
  return localStorage.getItem('ma_portal_token') || ''
}

export function getPortalCustomer() {
  try {
    return JSON.parse(localStorage.getItem('ma_portal_customer') || 'null')
  } catch {
    return null
  }
}

export function setPortalSession(token, customer) {
  localStorage.setItem('ma_portal_token', token)
  localStorage.setItem('ma_portal_customer', JSON.stringify(customer))
}

export function clearPortalSession() {
  localStorage.removeItem('ma_portal_token')
  localStorage.removeItem('ma_portal_customer')
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function portalRequest(path, { method = 'GET', body } = {}) {
  const token = getPortalToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${PORTAL_BASE_URL}${path}`, {
    method,
    cache: 'no-store',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.message || data.error || 'Request failed')
    Object.assign(err, data)
    throw err
  }

  if (res.status === 204) return null
  return res.json().catch(() => ({}))
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export const portalGet = (path) => portalRequest(path)
export const portalPost = (path, body) => portalRequest(path, { method: 'POST', body })
export const portalPut = (path, body) => portalRequest(path, { method: 'PUT', body })
export const portalDelete = (path) => portalRequest(path, { method: 'DELETE' })
