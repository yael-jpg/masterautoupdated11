/**
 * Vehicle API Service
 * Handles all API calls for vehicle makes, models, and variants
 * Implements cascading dropdown logic: Make → Model → Variant
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

class VehicleApi {
  /**
   * Fetch all active vehicle makes
   * @returns {Promise<Array>} Array of makes with { id, name, category, is_active }
   */
  static async getAllMakes() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicle-makes`)
      if (!response.ok) {
        throw new Error(`Failed to fetch makes: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching makes:', error)
      throw error
    }
  }

  /**
   * Fetch all models for a specific make
   * @param {number} makeId - The vehicle make ID
   * @returns {Promise<Array>} Array of models with { id, name, year_from, year_to, is_active }
   */
  static async getModelsForMake(makeId) {
    if (!makeId) {
      throw new Error('Make ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicle-makes/${makeId}/models`)
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching models for make:', error)
      throw error
    }
  }

  /**
   * Fetch all variants for a specific model
   * @param {number} modelId - The vehicle model ID
   * @returns {Promise<Array>} Array of variants with { id, name, body_type, fuel_type, transmission, is_active }
   */
  static async getVariantsForModel(modelId) {
    if (!modelId) {
      throw new Error('Model ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicle-makes/models/${modelId}/variants`)
      if (!response.ok) {
        throw new Error(`Failed to fetch variants: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching variants for model:', error)
      throw error
    }
  }

  /**
   * Fetch all year models for a specific variant
   * @param {number} variantId - The vehicle variant ID
   * @returns {Promise<Array>} Array of years with { id, year_model }
   */
  static async getYearsForVariant(variantId) {
    if (!variantId) {
      throw new Error('Variant ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicle-makes/variants/${variantId}/years`)
      if (!response.ok) {
        throw new Error(`Failed to fetch years: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching years for variant:', error)
      throw error
    }
  }

  /**
   * Create a new vehicle make (Admin)
   * @param {Object} make - { name, category }
   * @returns {Promise<Object>} Created make
   */
  static async createMake(make) {
    if (!make || !make.name) {
      throw new Error('Make name is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicle-makes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
        body: JSON.stringify({ name: make.name, category: make.category || null }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to create make')
      }

      return await response.json()
    } catch (error) {
      console.error('Error creating make:', error)
      throw error
    }
  }

  /**
   * Create a new vehicle with relational data
   * @param {Object} vehicleData - Vehicle data with makeId, modelId, variantId
   * @returns {Promise<Object>} Created vehicle data
   */
  static async createVehicle(vehicleData) {
    if (!vehicleData.customerId || !vehicleData.plateNumber) {
      throw new Error('customerId and plateNumber are required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
        body: JSON.stringify(vehicleData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || 'Failed to create vehicle')
      }

      return await response.json()
    } catch (error) {
      console.error('Error creating vehicle:', error)
      throw error
    }
  }

  /**
   * Get vehicle by ID
   * @param {number} vehicleId - The vehicle ID
   * @returns {Promise<Object>} Vehicle data with all relationships
   */
  static async getVehicle(vehicleId) {
    if (!vehicleId) {
      throw new Error('Vehicle ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
        headers: {
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch vehicle: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching vehicle:', error)
      throw error
    }
  }

  /**
   * Get all vehicles for a customer
   * @param {number} customerId - The customer ID
   * @returns {Promise<Array>} Array of vehicles
   */
  static async getCustomerVehicles(customerId) {
    if (!customerId) {
      throw new Error('Customer ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/customer/${customerId}`, {
        headers: {
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch vehicles: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching customer vehicles:', error)
      throw error
    }
  }

  /**
   * Update a vehicle
   * @param {number} vehicleId - The vehicle ID
   * @param {Object} vehicleData - Updated vehicle data
   * @returns {Promise<Object>} Updated vehicle data
   */
  static async updateVehicle(vehicleId, vehicleData) {
    if (!vehicleId) {
      throw new Error('Vehicle ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
        body: JSON.stringify(vehicleData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || error.error || 'Failed to update vehicle')
      }

      return await response.json()
    } catch (error) {
      console.error('Error updating vehicle:', error)
      throw error
    }
  }

  /**
   * Delete a vehicle
   * @param {number} vehicleId - The vehicle ID
   * @returns {Promise<Object>} Delete response
   */
  static async deleteVehicle(vehicleId) {
    if (!vehicleId) {
      throw new Error('Vehicle ID is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/${vehicleId}`, {
        method: 'DELETE',
        headers: {
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to delete vehicle: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error deleting vehicle:', error)
      throw error
    }
  }

  /**
   * Check if a plate number is available
   * @param {string} plateNumber - The plate number to check
   * @returns {Promise<Object>} { available: boolean, isDuplicate: boolean }
   */
  static async checkPlateAvailability(plateNumber) {
    if (!plateNumber) {
      throw new Error('Plate number is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/check-plate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plateNumber }),
      })

      if (!response.ok) {
        throw new Error(`Failed to check plate: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error checking plate availability:', error)
      throw error
    }
  }

  /**
   * Search vehicles by plate number pattern
   * @param {string} pattern - The plate number pattern to search
   * @returns {Promise<Array>} Array of matching vehicles
   */
  static async searchByPlate(pattern) {
    if (!pattern) {
      throw new Error('Search pattern is required')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/search/plate?pattern=${encodeURIComponent(pattern)}`, {
        headers: {
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to search vehicles: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error searching vehicles:', error)
      throw error
    }
  }

  /**
   * Get vehicle statistics
   * @returns {Promise<Object>} Vehicle statistics
   */
  static async getVehicleStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/vehicles/stats`, {
        headers: {
           Authorization: `Bearer ${localStorage.getItem('masterauto_token')}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching vehicle stats:', error)
      throw error
    }
  }
}

export default VehicleApi
