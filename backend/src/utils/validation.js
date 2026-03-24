// Server-side validation helpers for vehicles and plate normalization

function normalizePlate(plate) {
  if (!plate) return null
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function validateMakeSelection({ makeId, customMake, allowedMakes = null }) {
  // allowedMakes may be an array of names (from DB)
  if (customMake && customMake.trim().length > 0) {
    // custom make allowed only when explicitly using 'Other'
    // additional checks could be applied here
    return { ok: true, normalizedCustom: customMake.trim() }
  }
  if (!makeId) return { ok: false, error: 'Make is required' }
  if (allowedMakes && !allowedMakes.find((m) => m.id === makeId)) return { ok: false, error: 'Invalid make' }
  return { ok: true }
}

// Ensure model belongs to make and variant belongs to model
async function validateMakeModelVariant(db, { makeId, modelId, variantId }) {
  if (!makeId) return { ok: false, error: 'Make is required' }
  if (!modelId) return { ok: false, error: 'Model is required' }
  // check model -> make
  const model = await db.query('SELECT id, make_id FROM vehicle_models WHERE id = $1', [modelId])
  if (model.rowCount === 0) return { ok: false, error: 'Invalid model' }
  if (model.rows[0].make_id !== makeId) return { ok: false, error: 'Model does not belong to selected make' }

  if (variantId) {
    const variant = await db.query('SELECT id, model_id FROM vehicle_variants WHERE id = $1', [variantId])
    if (variant.rowCount === 0) return { ok: false, error: 'Invalid variant' }
    if (variant.rows[0].model_id !== modelId) return { ok: false, error: 'Variant does not belong to selected model' }
  }

  return { ok: true }
}

module.exports = { normalizePlate, validateMakeSelection, validateMakeModelVariant }
