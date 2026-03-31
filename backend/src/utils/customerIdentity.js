function normalizeEmail(email) {
  const v = String(email || '').trim().toLowerCase()
  return v || null
}

function normalizeMobileDigits(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '')
  return digits || null
}

function normalizeMobileForStorage(mobile) {
  const v = String(mobile || '').trim()
  return v
}

module.exports = { normalizeEmail, normalizeMobileDigits, normalizeMobileForStorage }
