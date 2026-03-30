export function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt || '').split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function getJwtExpMs(jwt) {
  const payload = decodeJwtPayload(jwt)
  const expSec = Number(payload?.exp)
  if (!Number.isFinite(expSec) || expSec <= 0) return null
  return expSec * 1000
}
