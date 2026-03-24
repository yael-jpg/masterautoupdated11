const express = require('express');
const router = express.Router();
const VehicleService = require('../services/vehicleService');
const { vehicleValidation } = require('../utils/vehicleValidation');
const { authenticateToken } = require('../middleware/authMiddleware');
const db = require('../config/db');

/**
 * POST /api/vehicles
 * Create a new vehicle for a customer with relational Make → Model → Variant
 * Required fields: customerId, makeId, modelId, plateNumber
 * Optional fields: variantId, year, color, customMake, customModel
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      customerId, 
      makeId, 
      modelId, 
      variantId = null,
      plateNumber, 
      year, 
      color, 
      customMake = null,
      customModel = null,
      bodyType, 
      fuelType, 
      transmission 
    } = req.body;

    // Validate required fields
    if (!customerId || !plateNumber) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'customerId and plateNumber are required'
      });
    }

    if (!makeId && !customMake) {
      return res.status(400).json({
        error: 'Missing vehicle make',
        details: 'Either makeId or customMake must be provided'
      });
    }

    if (!modelId && !customModel) {
      return res.status(400).json({
        error: 'Missing vehicle model',
        details: 'Either modelId or customModel must be provided'
      });
    }

    // Validate plate number
    const plateValidation = vehicleValidation.validatePlateNumber(plateNumber);
    if (!plateValidation.valid) {
      return res.status(400).json({
        error: 'Invalid plate number',
        details: plateValidation.errors
      });
    }

    // Validate relationships
    if (modelId && makeId) {
      const modelsRes = await db.query(
        'SELECT id FROM vehicle_models WHERE id = $1 AND make_id = $2 AND is_active = TRUE',
        [modelId, makeId]
      );
      if (modelsRes.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid model selection',
          details: 'Selected model does not belong to selected make'
        });
      }
    }

    if (variantId && modelId) {
      const variantsRes = await db.query(
        'SELECT id FROM vehicle_variants WHERE id = $1 AND model_id = $2 AND is_active = TRUE',
        [variantId, modelId]
      );
      if (variantsRes.rows.length === 0) {
        return res.status(400).json({
          error: 'Invalid variant selection',
          details: 'Selected variant does not belong to selected model'
        });
      }
    }

    // Create vehicle data object
    const vehicleData = {
      makeId: makeId || null,
      modelId: modelId || null,
      variantId: variantId || null,
      customMake: customMake || null,
      customModel: customModel || null,
      plateNumber: vehicleValidation.normalizePlateNumber(plateNumber),
      year: year ? parseInt(year) : null,
      color: color || null,
      bodyType: bodyType || null,
      fuelType: fuelType || null,
      transmission: transmission || null
    };

    // Validate entire vehicle entry
    const validation = await vehicleValidation.validateVehicleData(vehicleData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Check for duplicate plate
    const existingVehicle = await VehicleService.searchByPlate(vehicleData.plateNumber);
    if (existingVehicle && existingVehicle.length > 0) {
      return res.status(409).json({
        error: 'Duplicate plate number',
        details: 'A vehicle with this plate number already exists'
      });
    }

    // Create the vehicle
    const vehicle = await VehicleService.createVehicle(vehicleData, customerId);

    if (!vehicle.success) {
      return res.status(400).json(vehicle);
    }

    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    res.status(500).json({
      error: 'Failed to create vehicle',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/:vehicleId
 * Get a specific vehicle by ID
 */
router.get('/:vehicleId', authenticateToken, async (req, res) => {
  try {
    const { vehicleId } = req.params;

    if (!vehicleId) {
      return res.status(400).json({
        error: 'Missing vehicle ID'
      });
    }

    const vehicle = await VehicleService.getVehicleById(vehicleId);

    if (!vehicle) {
      return res.status(404).json({
        error: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({
      error: 'Failed to fetch vehicle',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/customer/:customerId
 * Get all vehicles for a specific customer
 */
router.get('/customer/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        error: 'Missing customer ID'
      });
    }

    const vehicles = await VehicleService.getCustomerVehicles(customerId);

    res.json({
      success: true,
      count: vehicles.length,
      data: vehicles
    });
  } catch (error) {
    console.error('Error fetching customer vehicles:', error);
    res.status(500).json({
      error: 'Failed to fetch vehicles',
      details: error.message
    });
  }
});

/**
 * PUT /api/vehicles/:vehicleId
 * Update a vehicle
 */
router.put('/:vehicleId', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'SuperAdmin access required' });
    }
    const { vehicleId } = req.params;
    const updateData = req.body;

    if (!vehicleId) {
      return res.status(400).json({
        error: 'Missing vehicle ID'
      });
    }

    // If plate number is being updated, validate it
    if (updateData.plateNumber) {
      const plateValidation = vehicleValidation.validatePlateNumber(updateData.plateNumber);
      if (!plateValidation.valid) {
        return res.status(400).json({
          error: 'Invalid plate number',
          details: plateValidation.errors
        });
      }
      updateData.plateNumber = vehicleValidation.normalizePlateNumber(updateData.plateNumber);
    }

    const vehicle = await VehicleService.updateVehicle(vehicleId, updateData);

    if (!vehicle) {
      return res.status(404).json({
        error: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      error: 'Failed to update vehicle',
      details: error.message
    });
  }
});

/**
 * DELETE /api/vehicles/:vehicleId
 * Delete a vehicle
 */
router.delete('/:vehicleId', authenticateToken, async (req, res) => {
  try {
    if (req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'SuperAdmin access required' });
    }
    const { vehicleId } = req.params;

    if (!vehicleId) {
      return res.status(400).json({
        error: 'Missing vehicle ID'
      });
    }

    const result = await VehicleService.deleteVehicle(vehicleId);

    if (!result) {
      return res.status(404).json({
        error: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      error: 'Failed to delete vehicle',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/makes/all
 * Get all available vehicle makes
 */
router.get('/makes/all', async (req, res) => {
  try {
    const makes = await VehicleService.getAllMakes();

    res.json({
      success: true,
      count: makes.length,
      data: makes
    });
  } catch (error) {
    console.error('Error fetching vehicle makes:', error);
    res.status(500).json({
      error: 'Failed to fetch vehicle makes',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/makes/category/:category
 * Get vehicle makes by category
 * Categories: Japanese, Korean, American, European, Chinese, Other
 */
router.get('/makes/category/:category', async (req, res) => {
  try {
    const { category } = req.params;

    if (!category) {
      return res.status(400).json({
        error: 'Missing category parameter'
      });
    }

    const makes = await VehicleService.getMakesByCategory(category);

    res.json({
      success: true,
      category,
      count: makes.length,
      data: makes
    });
  } catch (error) {
    console.error('Error fetching makes by category:', error);
    res.status(500).json({
      error: 'Failed to fetch vehicle makes',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/models/:makeId
 * Get models for a specific vehicle make
 */
router.get('/models/:makeId', async (req, res) => {
  try {
    const { makeId } = req.params;

    if (!makeId) {
      return res.status(400).json({
        error: 'Missing make ID'
      });
    }

    const models = await VehicleService.getModelsForMake(makeId);

    res.json({
      success: true,
      makeId,
      count: models.length,
      data: models
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      error: 'Failed to fetch models',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/variants/:modelId
 * Get variants for a specific vehicle model
 */
router.get('/variants/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;

    if (!modelId) {
      return res.status(400).json({
        error: 'Missing model ID'
      });
    }

    const variants = await VehicleService.getVariantsForModel(modelId);

    res.json({
      success: true,
      modelId,
      count: variants.length,
      data: variants
    });
  } catch (error) {
    console.error('Error fetching variants:', error);
    res.status(500).json({
      error: 'Failed to fetch variants',
      details: error.message
    });
  }
});

/**
 * POST /api/vehicles/check-plate
 * Check if a plate number is available
 */
router.post('/check-plate', async (req, res) => {
  try {
    const { plateNumber } = req.body;

    if (!plateNumber) {
      return res.status(400).json({
        error: 'Missing plate number'
      });
    }

    const normalized = vehicleValidation.normalizePlateNumber(plateNumber);
    const available = await VehicleService.checkPlateAvailability(normalized);

    res.json({
      success: true,
      plateNumber: normalized,
      available
    });
  } catch (error) {
    console.error('Error checking plate availability:', error);
    res.status(500).json({
      error: 'Failed to check plate availability',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/search/plate
 * Search vehicles by plate number pattern
 */
router.get('/search/plate', async (req, res) => {
  try {
    const { pattern } = req.query;

    if (!pattern) {
      return res.status(400).json({
        error: 'Missing search pattern'
      });
    }

    const vehicles = await VehicleService.searchByPlate(pattern);

    res.json({
      success: true,
      pattern,
      count: vehicles.length,
      data: vehicles
    });
  } catch (error) {
    console.error('Error searching vehicles:', error);
    res.status(500).json({
      error: 'Failed to search vehicles',
      details: error.message
    });
  }
});

/**
 * GET /api/vehicles/stats
 * Get vehicle statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await VehicleService.getVehicleStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching vehicle stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      details: error.message
    });
  }
});

module.exports = router;

