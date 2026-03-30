import { computeLoginProof } from '../utils/hashedLoginProof'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
let activeRequests = 0

function emitNetwork() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ma:network', { detail: { activeRequests } }))
  }
}

function emitToast(type, message) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ma:toast', { detail: { type, message } }))
  }
}

function emitSessionExpired(message) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ma:session-expired', { detail: { scope: 'admin', message } }))
  }
}

async function request(path, { method = 'GET', token, body, responseType = 'json' } = {}) {
  activeRequests += 1
  emitNetwork()

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        ...(responseType === 'json' ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const message = data.message || data.error || 'Request failed'

      // If the token expired, force a logout flow in the app.
      // Skip login endpoints to avoid interfering with invalid-credential responses.
      if (
        response.status === 401 &&
        token &&
        (data.code === 'SESSION_EXPIRED' || /expired/i.test(message)) &&
        !String(path).includes('/auth/login')
      ) {
        emitSessionExpired(message)
      }

      emitToast('error', message)
      const err = new Error(message)
      // Attach all error body fields to the error object (e.g. requiresOverride, outstanding_balance)
      Object.assign(err, data)
      throw err
    }

    if (response.status === 204) {
      return null
    }

    if (responseType === 'blob') {
      return response.blob()
    }

    return response.json().catch(() => ({}))
  } finally {
    activeRequests -= 1
    emitNetwork()
  }
}

export async function loginRequest(email, password) {
  const challenge = await request('/auth/login/challenge', {
    method: 'POST',
    body: { email },
  })

  if (challenge?.mode === 'verifier') {
    const proof = await computeLoginProof({
      password,
      salt: challenge.salt,
      iters: challenge.iters,
      nonce: challenge.nonce,
    })

    return request('/auth/login/response', {
      method: 'POST',
      body: { email, challengeToken: challenge.challengeToken, proof },
    })
  }

  // Backwards-compat: plaintext login for accounts/servers not yet upgraded.
  return request('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

function appendQuery(path, query) {
  if (!query || Object.keys(query).length === 0) {
    return path
  }

  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  })

  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

export async function apiGet(path, token, query) {
  return request(appendQuery(path, query), { token })
}

export async function apiPost(path, token, body) {
  return request(path, { method: 'POST', token, body })
}

export async function apiPut(path, token, body) {
  return request(path, { method: 'PUT', token, body })
}

export async function apiPatch(path, token, body) {
  return request(path, { method: 'PATCH', token, body })
}

export async function apiDelete(path, token) {
  return request(path, { method: 'DELETE', token, responseType: 'json' })
}

export async function apiDownload(path, token, filename) {
  const blob = await request(path, { token, responseType: 'blob' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function pushToast(type, message) {
  emitToast(type, message)
}

export function buildApiUrl(path, token) {
  return {
    url: `${API_BASE_URL}${path}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }
}
