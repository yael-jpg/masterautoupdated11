const db = require('../config/db')
const vehicleValidation = require('../utils/vehicleValidation')

class VehicleService {
  static async createVehicle(vehicleData, customerId) {
    try {
      const validation = await vehicleValidation.validateVehicleData(vehicleData, db)
      if (!validation.valid) return { success: false, errors: validation.errors }

      const {
        makeId = null,
        modelId = null,
        variantId = null,
        plateNumber,
        customMake = null,
        customModel = null,
        bodyType = null,
        fuelType = null,
        transmission = null,
        color = null,
        year = new Date().getFullYear(),
      } = { ...validation.data, ...vehicleData }

      if (modelId && makeId) {
        const modelsRes = await db.query('SELECT id FROM vehicle_models WHERE id = $1 AND make_id = $2', [modelId, makeId])
        if (modelsRes.rows.length === 0) throw new Error('Selected model does not belong to the selected make')
      }

      if (variantId && modelId) {
        const variantsRes = await db.query('SELECT id FROM vehicle_variants WHERE id = $1 AND model_id = $2', [variantId, modelId])
        if (variantsRes.rows.length === 0) throw new Error('Selected variant does not belong to the selected model')
      }

      const insertRes = await db.query(
        `INSERT INTO vehicles (customer_id, make_id, model_id, variant_id, plate_number, custom_make, custom_model, body_type, fuel_type, transmission, color, year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [customerId, makeId, modelId, variantId, plateNumber || null, customMake, customModel, bodyType, fuelType, transmission, color, year],
      )

      return { success: true, vehicleId: insertRes.rows[0].id, message: 'Vehicle created successfully' }
    } catch (error) {
      console.error('Error creating vehicle:', error)
      return { success: false, error: error.message }
    }
  }

  static async getVehicleById(vehicleId) {
    try {
      const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles'")).rows.map(r => r.column_name)
      const hasFKs = cols.includes('make_id') || cols.includes('model_id') || cols.includes('variant_id')
      const optional = (name) => cols.includes(name) ? `v.${name}` : `NULL AS ${name}`
      console.log('VehicleService.getCustomerVehicles - vehicles columns:', cols)
      console.log('VehicleService.getCustomerVehicles - hasFKs:', hasFKs)

      if (hasFKs) {
        const select = [
          'v.id',
          'v.customer_id',
          'v.make_id',
          'v.model_id',
          'v.variant_id',
          'v.plate_number',
          optional('custom_make'),
          optional('custom_model'),
          optional('body_type'),
          optional('fuel_type'),
          optional('transmission'),
          'v.color',
          'v.year',
          'v.odometer',
          'v.created_at',
          'v.updated_at',
          'vm.name as make_name',
          'vm.category as make_category',
          'vmod.name as model_name',
          'vmod.year_from',
          'vmod.year_to',
          'vvt.name as variant_name',
          'vvt.body_type as variant_body_type',
          'vvt.fuel_type as variant_fuel_type',
          'vvt.transmission as variant_transmission',
        ].join(',\n            ')

        const res = await db.query(`SELECT ${select} FROM vehicles v
           LEFT JOIN vehicle_makes vm ON v.make_id = vm.id
           LEFT JOIN vehicle_models vmod ON v.model_id = vmod.id
           LEFT JOIN vehicle_variants vvt ON v.variant_id = vvt.id
           WHERE v.id = $1`, [vehicleId])
        return res.rows.length ? res.rows[0] : null
      }

      const select = [
        'v.id',
        'v.customer_id',
        'v.make as make_name',
        'v.model as model_name',
        'v.variant as variant_name',
        'v.plate_number',
        optional('custom_make'),
        optional('custom_model'),
        optional('body_type'),
        optional('fuel_type'),
        optional('transmission'),
        'v.color',
        'v.year',
        'v.odometer',
        'v.created_at',
        'v.updated_at',
      ].join(',\n            ')

      const res = await db.query(`SELECT ${select} FROM vehicles v WHERE v.id = $1`, [vehicleId])
      return res.rows.length ? res.rows[0] : null
    } catch (error) {
      throw new Error(`Error fetching vehicle: ${error.message}`)
    }
  }

  static async getCustomerVehicles(customerId) {
    try {
      const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='vehicles' ORDER BY ordinal_position")).rows.map(r => r.column_name)

      const hasFKs = cols.includes('make_id') || cols.includes('model_id') || cols.includes('variant_id')
      const hasMake = cols.includes('make')
      const hasModel = cols.includes('model')
      const hasVariant = cols.includes('variant')
      const hasCustomMake = cols.includes('custom_make')

      // Build safe expressions for make/model/variant without referencing possibly-missing columns
      const makeExpr = hasMake && hasFKs ? `COALESCE(v.make, vm.name) AS make_name` : (hasMake ? `v.make AS make_name` : (hasFKs ? `vm.name AS make_name` : `NULL AS make_name`))
      const modelExpr = hasModel && hasFKs ? `COALESCE(v.model, vmod.name) AS model_name` : (hasModel ? `v.model AS model_name` : (hasFKs ? `vmod.name AS model_name` : `NULL AS model_name`))
      const variantExpr = hasVariant && hasFKs ? `COALESCE(v.variant, vvt.name) AS variant_name` : (hasVariant ? `v.variant AS variant_name` : (hasFKs ? `vvt.name AS variant_name` : `NULL AS variant_name`))
      const customMakeExpr = hasCustomMake ? `v.custom_make` : `NULL AS custom_make`

      const select = [
        'v.id',
        'v.customer_id',
        makeExpr,
        modelExpr,
        variantExpr,
        'v.plate_number',
        customMakeExpr,
        'v.color',
        'v.year',
        'v.odometer',
        'v.created_at'
      ].join(',\n            ')

       const joins = hasFKs ? `LEFT JOIN vehicle_makes vm ON v.make_id = vm.id
         LEFT JOIN vehicle_models vmod ON v.model_id = vmod.id
         LEFT JOIN vehicle_variants vvt ON v.variant_id = vvt.id` : ''

       const query = `SELECT ${select} FROM vehicles v
         ${joins}
         WHERE v.customer_id = $1
         ORDER BY v.created_at DESC`

      const res = await db.query(query, [customerId])
      return res.rows
    } catch (error) {
      throw new Error(`Error fetching customer vehicles: ${error.message}`)
    }
  }

  static async updateVehicle(vehicleId, vehicleData) {
    try {
      const existing = await this.getVehicleById(vehicleId)
      if (!existing) return { success: false, error: 'Vehicle not found' }

      const validation = await vehicleValidation.validateVehicleData(vehicleData, db)
      if (!validation.valid) return { success: false, errors: validation.errors }

      const {
        makeId = existing.make_id,
        modelId = existing.model_id,
        variantId = existing.variant_id,
        plateNumber = existing.plate_number,
        customMake = existing.custom_make,
        customModel = existing.custom_model,
      } = { ...validation.data, ...vehicleData }

      if (modelId && makeId) {
        const modelsRes = await db.query('SELECT id FROM vehicle_models WHERE id = $1 AND make_id = $2', [modelId, makeId])
        if (modelsRes.rows.length === 0) throw new Error('Selected model does not belong to the selected make')
      }

      if (variantId && modelId) {
        const variantsRes = await db.query('SELECT id FROM vehicle_variants WHERE id = $1 AND model_id = $2', [variantId, modelId])
        if (variantsRes.rows.length === 0) throw new Error('Selected variant does not belong to selected model')
      }

      const updateRes = await db.query(
        `UPDATE vehicles SET make_id = $1, model_id = $2, variant_id = $3, plate_number = $4, custom_make = $5, custom_model = $6 WHERE id = $7 RETURNING *`,
        [makeId, modelId, variantId, plateNumber, customMake, customModel, vehicleId],
      )

      if (!updateRes.rows.length) return { success: false, error: 'Failed to update vehicle' }
      return { success: true, message: 'Vehicle updated successfully', vehicleId }
    } catch (error) {
      console.error('Error updating vehicle:', error)
      return { success: false, error: error.message }
    }
  }

  static async deleteVehicle(vehicleId) {
    try {
      const delRes = await db.query('DELETE FROM vehicles WHERE id = $1 RETURNING id', [vehicleId])
      if (!delRes.rows.length) return { success: false, error: 'Vehicle not found' }
      return { success: true, message: 'Vehicle deleted successfully' }
    } catch (error) {
      console.error('Error deleting vehicle:', error)
      return { success: false, error: error.message }
    }
  }

  static async getAllMakes() {
    try {
      return await vehicleValidation.getAllMakesWithStats(db)
    } catch (error) {
      throw new Error(`Error fetching makes: ${error.message}`)
    }
  }

  static async getMakesByCategory(category) {
    try {
      const res = await db.query('SELECT id, name, category FROM vehicle_makes WHERE category = $1 AND is_active = TRUE ORDER BY name', [category])
      return res.rows
    } catch (error) {
      throw new Error(`Error fetching makes: ${error.message}`)
    }
  }

  static async getModelsForMake(makeId) {
    try {
      const res = await db.query(`SELECT id, name, year_from, year_to, is_active FROM vehicle_models WHERE make_id = $1 AND is_active = TRUE ORDER BY name`, [makeId])
      return res.rows
    } catch (error) {
      throw new Error(`Error fetching models: ${error.message}`)
    }
  }

  static async getVariantsForModel(modelId) {
    try {
      const res = await db.query(`SELECT id, name, body_type, fuel_type, transmission, is_active FROM vehicle_variants WHERE model_id = $1 AND is_active = TRUE ORDER BY name`, [modelId])
      return res.rows
    } catch (error) {
      throw new Error(`Error fetching variants: ${error.message}`)
    }
  }

  static async checkPlateAvailability(plateNumber, excludeVehicleId = null) {
    try {
      const exists = await vehicleValidation.checkPlateExists(plateNumber, db, excludeVehicleId)
      return { available: !exists, isDuplicate: exists }
    } catch (error) {
      throw new Error(`Error checking plate: ${error.message}`)
    }
  }

  static async searchByPlate(plateNumber) {
    try {
      const normalized = vehicleValidation.normalizePlateNumber(plateNumber)
      const res = await db.query(`SELECT v.*, c.full_name as customer_name, vm.name as make_name FROM vehicles v LEFT JOIN customers c ON v.customer_id = c.id LEFT JOIN vehicle_makes vm ON v.make_id = vm.id WHERE v.plate_number LIKE $1 LIMIT 10`, [`%${normalized}%`])
      return res.rows
    } catch (error) {
      throw new Error(`Error searching vehicles: ${error.message}`)
    }
  }

  static async getVehicleStats() {
    try {
      const statsRes = await db.query(`SELECT COUNT(DISTINCT v.id) as total_vehicles, COUNT(DISTINCT v.customer_id) as customers_with_vehicles, COUNT(DISTINCT v.make_id) as unique_makes FROM vehicles v`)
      const topMakesRes = await db.query(`SELECT vm.name, COUNT(v.id) as count FROM vehicles v LEFT JOIN vehicle_makes vm ON v.make_id = vm.id GROUP BY v.make_id, vm.name ORDER BY count DESC LIMIT 5`)
      return {
        total_vehicles: Number(statsRes.rows[0].total_vehicles) || 0,
        customers_with_vehicles: Number(statsRes.rows[0].customers_with_vehicles) || 0,
        unique_makes: Number(statsRes.rows[0].unique_makes) || 0,
        top_makes: topMakesRes.rows,
      }
    } catch (error) {
      throw new Error(`Error getting statistics: ${error.message}`)
    }
  }
}

module.exports = VehicleService
