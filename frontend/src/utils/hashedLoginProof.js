function base64urlEncode(bytes) {
  const bin = String.fromCharCode(...bytes)
  const b64 = btoa(bin)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64urlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

async function pbkdf2Bits(password, saltB64url, iterations, lengthBytes = 32) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password || '')),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const salt = base64urlDecode(saltB64url)
  const iters = Number(iterations)
  if (!Number.isFinite(iters) || iters < 1) throw new Error('Invalid iterations')

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: iters,
      hash: 'SHA-256',
    },
    keyMaterial,
    lengthBytes * 8,
  )

  return new Uint8Array(bits)
}

async function hmacSha256(keyBytes, message) {
  const enc = new TextEncoder()
  const msgBytes = enc.encode(String(message || ''))

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const sig = await crypto.subtle.sign('HMAC', key, msgBytes)
  return new Uint8Array(sig)
}

export async function computeLoginProof({ password, salt, iters, nonce }) {
  if (!crypto?.subtle) {
    throw new Error('Secure crypto is not available in this browser context.')
  }

  const keyBytes = await pbkdf2Bits(password, salt, iters, 32)
  const sig = await hmacSha256(keyBytes, nonce)
  return base64urlEncode(sig)
}
