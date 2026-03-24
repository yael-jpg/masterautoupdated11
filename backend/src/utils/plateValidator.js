/**
 * Philippine Plate Number Validation Utility
 * -------------------------------------------
 * 1. Normalises input (uppercase, strip spaces / dashes / special chars)
 * 2. Validates against PH plate formats (new, old, motorcycle)
 * 3. Detects suspicious patterns (repeating chars, sequential, etc.)
 */

// ── 1. Normalise ────────────────────────────────────────────────────────────
/**
 * Strips spaces, dashes, dots and other non-alphanumeric chars, then uppercases.
 * @param {string} raw
 * @returns {string} e.g. "abc-1234" → "ABC1234"
 */
function normalizePlate(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // keep only letters & digits (storage format: ABC1234)
}

/**
 * Format stored plate for display (inserts a space for private plates: ABC1234 -> ABC 1234)
 * @param {string} stored
 * @returns {string}
 */
function formatPlateForDisplay(stored) {
  if (!stored || typeof stored !== 'string') return ''
  const m = stored.match(/^([A-Z]{3})(\d{4})$/)
  if (m) return `${m[1]} ${m[2]}`
  return stored
}

// ── 2. Format validation ────────────────────────────────────────────────────
// Accepted Philippine plate formats:
//   New private   : 3 letters + 4 digits         → ABC1234
//   Old private   : 3 letters + 3 digits         → ABC123
//   Motorcycle    : 2–3 digits + 2–3 letters     → 12AB, 123ABC
//   Gov / diplo   : 1-3 digits + 1-4 letters     → flexible
//   Temporary     : alphanumeric 4-10 chars       → fallback

const PH_PLATE_PATTERNS = [
  /^[A-Z]{3}\d{4}$/,        // New format  — ABC1234
  /^[A-Z]{3}\d{3}$/,        // Old format  — ABC123
  /^[A-Z]{2}\d{4}$/,        // Old 2-letter format — AB1234
  /^\d{2,3}[A-Z]{2,3}$/,    // Motorcycle  — 12AB / 123ABC
  /^\d{1,4}[A-Z]{1,4}$/,    // Gov / diplomatic
  /^[A-Z]{1,3}\d{1,4}$/,    // Compact / older
]

// Strict private plate pattern (storage format without space): ABC1234
const STRICT_PRIVATE_PLATE = /^[A-Z]{3}\d{4}$/

/**
 * Validates a **normalised** plate string against PH formats.
 * Returns { valid, errors[] }
 */
function validatePlateFormat(normalised) {
  const errors = []

  if (!normalised) {
    errors.push('Plate number is required.')
    return { valid: false, errors }
  }

  // Length check
  if (normalised.length < 4) {
    errors.push('Plate number is too short.')
  }
  if (normalised.length > 10) {
    errors.push('Plate number is too long.')
  }

  // All letters only
  if (/^[A-Z]+$/.test(normalised)) {
    errors.push('Plate number cannot be all letters.')
  }

  // All digits only
  if (/^\d+$/.test(normalised)) {
    errors.push('Plate number cannot be all numbers.')
  }

  // Special chars (should already be stripped, but guard)
  if (/[^A-Z0-9]/.test(normalised)) {
    errors.push('Plate number contains invalid characters.')
  }

  if (errors.length) {
    return { valid: false, errors }
  }

  // Pattern matching
  const matchesAny = PH_PLATE_PATTERNS.some((re) => re.test(normalised))
  if (!matchesAny) {
    errors.push('Plate number must follow PH format (e.g. ABC1234, ABC123, 123ABC).')
    return { valid: false, errors }
  }

  return { valid: true, errors: [] }
}

/**
 * Validate strict private vehicle plate: ABC1234 (storage format)
 * Returns { valid, errors[] }
 */
function validatePrivatePlate(normalised) {
  const errors = []
  if (!normalised) {
    errors.push('Plate number is required.')
    return { valid: false, errors }
  }
  if (!STRICT_PRIVATE_PLATE.test(normalised)) {
    errors.push('Plate number must follow format: ABC 1234')
    return { valid: false, errors }
  }
  return { valid: true, errors: [] }
}

// ── 3. Suspicious-input detection ───────────────────────────────────────────
const SUSPICIOUS_RULES = [
  // All same character  → AAAAAAA, 1111111
  (p) => /^(.)\1+$/.test(p),
  // Repeating pairs     → ABABAB, 121212
  (p) => /^(.{1,2})\1{2,}$/.test(p),
  // Sequential digits   → 123456, 654321
  (p) => {
    const digits = p.replace(/[^0-9]/g, '')
    if (digits.length < 4) return false
    let asc = true
    let desc = true
    for (let i = 1; i < digits.length; i++) {
      if (Number(digits[i]) !== Number(digits[i - 1]) + 1) asc = false
      if (Number(digits[i]) !== Number(digits[i - 1]) - 1) desc = false
    }
    return asc || desc
  },
  // Common test / dummy patterns
  (p) => ['AAA1111', 'ABC1234', 'TEST123', 'XXX9999', 'ZZZ0000'].includes(p),
  // Repeating letter block + repeating digit block  → AAA1111
  (p) => {
    const m = p.match(/^([A-Z])\1{2,}(\d)\2{2,}$/)
    return !!m
  },
]

/**
 * Returns true if the plate looks suspicious (but not necessarily invalid).
 */
function isSuspiciousPlate(normalised) {
  return SUSPICIOUS_RULES.some((rule) => rule(normalised))
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  normalizePlate,
  validatePlateFormat,
  isSuspiciousPlate,
  formatPlateForDisplay,
  validatePrivatePlate,
}
