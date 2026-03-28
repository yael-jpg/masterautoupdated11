export function normalizePlateClient(plate) {
  if (!plate) return ''
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Prevent common typing issues in email inputs:
// - remove whitespace
// - keep only a single '@'
export function normalizeEmailClient(email) {
  if (!email) return ''
  let v = String(email).replace(/\s+/g, '')
  const firstAt = v.indexOf('@')
  if (firstAt >= 0) {
    v = v.slice(0, firstAt + 1) + v.slice(firstAt + 1).replace(/@/g, '')
  }
  return v
}

export function validateMakeClient({ selectedMake, customMake }) {
  if (selectedMake === null && (!customMake || !customMake.trim())) {
    return { ok: false, error: 'Please select or specify a vehicle make.' }
  }
  return { ok: true }
}
