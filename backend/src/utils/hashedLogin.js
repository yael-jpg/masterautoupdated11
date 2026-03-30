const crypto = require('crypto')
const { base64urlEncode, base64urlDecode } = require('./base64url')

function randomB64url(bytes = 32) {
  return base64urlEncode(crypto.randomBytes(bytes))
}

function deriveVerifierFromPassword({ password, saltB64url, iterations }) {
  const salt = base64urlDecode(saltB64url)
  const iters = Number(iterations)
  if (!Number.isFinite(iters) || iters < 1) throw new Error('Invalid iterations')

  const key = crypto.pbkdf2Sync(String(password || ''), salt, iters, 32, 'sha256')
  return base64urlEncode(key)
}

function computeProof({ verifierB64url, nonce }) {
  const key = base64urlDecode(verifierB64url)
  const msg = Buffer.from(String(nonce || ''), 'utf8')
  const mac = crypto.createHmac('sha256', key).update(msg).digest()
  return base64urlEncode(mac)
}

function timingSafeEqualB64url(a, b) {
  const ba = base64urlDecode(a)
  const bb = base64urlDecode(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

module.exports = {
  randomB64url,
  deriveVerifierFromPassword,
  computeProof,
  timingSafeEqualB64url,
}
