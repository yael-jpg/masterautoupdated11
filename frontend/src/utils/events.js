export const CONFIG_UPDATED_EVENT = 'ma:config-updated'
export const VEHICLE_MAKES_UPDATED_EVENT = 'ma:vehicle-makes-updated'
export const PACKAGES_UPDATED_EVENT = 'ma:packages-updated'
export const PACKAGES_UPDATED_STORAGE_KEY = 'ma:packages-updated-ts'

export function emitConfigUpdated(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(CONFIG_UPDATED_EVENT, { detail }))
  } catch {
    // ignore
  }
}

export function onConfigUpdated(handler) {
  window.addEventListener(CONFIG_UPDATED_EVENT, handler)
  return () => window.removeEventListener(CONFIG_UPDATED_EVENT, handler)
}

export function emitVehicleMakesUpdated(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(VEHICLE_MAKES_UPDATED_EVENT, { detail }))
  } catch {
    // ignore
  }
}

export function onVehicleMakesUpdated(handler) {
  window.addEventListener(VEHICLE_MAKES_UPDATED_EVENT, handler)
  return () => window.removeEventListener(VEHICLE_MAKES_UPDATED_EVENT, handler)
}

export function emitPackagesUpdated(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(PACKAGES_UPDATED_EVENT, { detail }))
  } catch {
    // ignore
  }

  try {
    const payload = JSON.stringify({ at: Date.now(), ...detail })
    localStorage.setItem(PACKAGES_UPDATED_STORAGE_KEY, payload)
  } catch {
    // ignore
  }
}

export function onPackagesUpdated(handler) {
  const onWindowEvent = (e) => handler(e?.detail || {})
  const onStorage = (e) => {
    if (e.key !== PACKAGES_UPDATED_STORAGE_KEY || !e.newValue) return
    try {
      handler(JSON.parse(e.newValue))
    } catch {
      handler({})
    }
  }

  window.addEventListener(PACKAGES_UPDATED_EVENT, onWindowEvent)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(PACKAGES_UPDATED_EVENT, onWindowEvent)
    window.removeEventListener('storage', onStorage)
  }
}
