/**
 * Portal API client
 * Wraps fetch with the portal base URL and the portal JWT token stored in
 * localStorage under "ma_portal_token".
 */

import { computeLoginProof } from '../utils/hashedLoginProof'

const RAW_API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')

// Normalize base URL so we always end up with ".../api/portal".
// Supports env values like:
// - DEV: http://localhost:5000
// - DEV: http://localhost:5000/api
// - DEV: http://localhost:5000/api/portal
// - PROD (Netlify drag-drop): /api (proxy via Netlify redirects)
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

function emitSessionExpired(message) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ma:session-expired', { detail: { scope: 'portal', message } }))
  }
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
    const message = data.message || data.error || 'Request failed'

    if (
      res.status === 401 &&
      token &&
      (data.code === 'SESSION_EXPIRED' || /expired/i.test(message)) &&
      !String(path).includes('/auth/login')
    ) {
      emitSessionExpired(message)
    }
    const err = new Error(message)
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

export async function portalLoginRequest(identifier, password) {
  const challenge = await portalPost('/auth/login/challenge', { identifier })
  if (challenge?.mode === 'verifier') {
    const proof = await computeLoginProof({
      password,
      salt: challenge.salt,
      iters: challenge.iters,
      nonce: challenge.nonce,
    })

    return portalPost('/auth/login/response', {
      identifier,
      challengeToken: challenge.challengeToken,
      proof,
    })
  }

  return portalPost('/auth/login', { identifier, password })
}
