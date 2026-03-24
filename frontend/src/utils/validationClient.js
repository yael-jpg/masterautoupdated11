export function normalizePlateClient(plate) {
  if (!plate) return ''
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function validateMakeClient({ selectedMake, customMake }) {
  if (selectedMake === null && (!customMake || !customMake.trim())) {
    return { ok: false, error: 'Please select or specify a vehicle make.' }
  }
  return { ok: true }
}
