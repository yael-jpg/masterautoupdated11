export const CONFIG_UPDATED_EVENT = 'ma:config-updated'
export const VEHICLE_MAKES_UPDATED_EVENT = 'ma:vehicle-makes-updated'

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
