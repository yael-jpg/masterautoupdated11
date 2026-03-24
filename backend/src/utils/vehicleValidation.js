/**
 * Server-Side Vehicle Validation
 * Node.js validation utilities for backend
 */

// ==========================================
// PLATE NUMBER VALIDATION
// ==========================================

/**
 * Validate Philippine plate number format
 * Standard: 2 Letters + 2 Numbers + 4 Letters
 */
function validatePlateNumber(plateNumber) {
  if (!plateNumber || typeof plateNumber !== 'string') {
    return {
      valid: false,
      error: 'Plate number must be a non-empty string',
    };
  }

  // Normalize
  const normalized = plateNumber
    .toUpperCase()
    .replace(/[\s\-]/g, '')
    .trim();

  // Philippine format
  const phPlateRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{4}$/;

  if (!phPlateRegex.test(normalized)) {
    return {
      valid: false,
      error: 'Invalid plate format. Expected: XX1234XXXX',
    };
  }

  return {
    valid: true,
    normalized,
  };
}

/**
 * Normalize plate number
 */
function normalizePlateNumber(plateNumber) {
  return plateNumber
    .toUpperCase()
    .replace(/[\s\-]/g, '')
    .trim();
}

// ==========================================
// VEHICLE MAKE VALIDATION
// ==========================================

/**
 * Validate vehicle make (check against database)
 */
async function validateVehicleMake(makeName, db) {
  if (!makeName || typeof makeName !== 'string') {
    return {
      valid: false,
      error: 'Vehicle make must be a non-empty string',
    };
  }

  const trimmed = makeName.trim();

  if (trimmed.length > 100) {
    return {
      valid: false,
      error: 'Vehicle make must not exceed 100 characters',
    };
  }

  // Check if make exists in database
  try {
    const [rows] = await db
      .promise()
      .query('SELECT id FROM vehicle_makes WHERE name = ? AND is_active = TRUE', [trimmed]);

    if (rows.length === 0) {
      return {
        valid: false,
        error: `Vehicle make "${trimmed}" not found or is inactive`,
      };
    }

    return {
      valid: true,
      makeId: rows[0].id,
      makeName: trimmed,
    };
  } catch (error) {
    throw new Error(`Database error validating make: ${error.message}`);
  }
}

/**
 * Validate custom vehicle make
 */
function validateCustomMake(customMake) {
  if (!customMake || typeof customMake !== 'string') {
    return {
      valid: false,
      error: 'Custom make must be a non-empty string',
    };
  }

  const trimmed = customMake.trim();

  if (trimmed.length < 2 || trimmed.length > 100) {
    return {
      valid: false,
      error: 'Custom make must be between 2 and 100 characters',
    };
  }

  // Safe characters for brand names
  if (!/^[a-zA-Z0-9\s\-&.,']+$/i.test(trimmed)) {
    return {
      valid: false,
      error: 'Custom make contains invalid characters',
    };
  }

  return {
    valid: true,
    custom: trimmed.toUpperCase(),
  };
}

// ==========================================
// VEHICLE MODEL VALIDATION
// ==========================================

/**
 * Validate vehicle model
 */
async function validateVehicleModel(modelName, makeId, db) {
  if (!modelName || typeof modelName !== 'string') {
    return {
      valid: false,
      error: 'Model name must be a non-empty string',
    };
  }

  const trimmed = modelName.trim();

  if (trimmed.length > 100) {
    return {
      valid: false,
      error: 'Model name must not exceed 100 characters',
    };
  }

  if (!/^[a-zA-Z0-9\s\-&.]+$/i.test(trimmed)) {
    return {
      valid: false,
      error: 'Model name contains invalid characters',
    };
  }

  return {
    valid: true,
    model: trimmed,
  };
}

/**
 * Check if model exists for a make
 */
async function checkModelExists(modelName, makeId, db) {
  try {
    const [rows] = await db
      .promise()
      .query(
        'SELECT id FROM vehicle_models WHERE name = ? AND make_id = ? AND is_active = TRUE',
        [modelName, makeId]
      );

    return rows.length > 0 ? rows[0].id : null;
  } catch (error) {
    throw new Error(`Database error checking model: ${error.message}`);
  }
}

// ==========================================
// COMPLETE VEHICLE VALIDATION
// ==========================================

/**
 * Comprehensive vehicle validation
 */
async function validateVehicleData(vehicleData, db) {
  const errors = {};
  const data = {};

  // 1. Validate make
  if (!vehicleData.make && !vehicleData.customMake) {
    errors.make = 'Vehicle make is required';
  } else if (vehicleData.make) {
    try {
      const makeValidation = await validateVehicleMake(vehicleData.make, db);
      if (!makeValidation.valid) {
        errors.make = makeValidation.error;
      } else {
        data.makeId = makeValidation.makeId;
        data.make = makeValidation.makeName;
      }
    } catch (error) {
      errors.make = error.message;
    }
  }

  // 2. Validate custom make
  if (vehicleData.customMake) {
    const customValidation = validateCustomMake(vehicleData.customMake);
    if (!customValidation.valid) {
      errors.customMake = customValidation.error;
    } else {
      data.customMake = customValidation.custom;
    }
  }

  // 3. Validate model
  if (!vehicleData.model) {
    errors.model = 'Vehicle model is required';
  } else {
    try {
      const modelValidation = await validateVehicleModel(vehicleData.model, data.makeId, db);
      if (!modelValidation.valid) {
        errors.model = modelValidation.error;
      } else {
        data.model = modelValidation.model;
      }
    } catch (error) {
      errors.model = error.message;
    }
  }

  // 4. Validate plate number (optional but if provided, must be valid)
  if (vehicleData.plateNumber) {
    const plateValidation = validatePlateNumber(vehicleData.plateNumber);
    if (!plateValidation.valid) {
      errors.plateNumber = plateValidation.error;
    } else {
      data.plateNumber = plateValidation.normalized;

      // Check for duplicates
      try {
        const [rows] = await db
          .promise()
          .query('SELECT id FROM vehicles WHERE plate_number = ?', [plateValidation.normalized]);

        if (rows.length > 0) {
          errors.plateNumber = 'This plate number is already registered';
        }
      } catch (error) {
        errors.plateNumber = `Database error checking plate: ${error.message}`;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data,
  };
}

// ==========================================
// DATABASE HELPER FUNCTIONS
// ==========================================

/**
 * Get vehicle make by ID
 */
async function getMakeById(makeId, db) {
  try {
    const [rows] = await db
      .promise()
      .query('SELECT id, name, category FROM vehicle_makes WHERE id = ? AND is_active = TRUE', [
        makeId,
      ]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Get models for a make
 */
async function getModelsForMake(makeId, db) {
  try {
    const [rows] = await db
      .promise()
      .query(
        'SELECT id, name FROM vehicle_models WHERE make_id = ? AND is_active = TRUE ORDER BY name',
        [makeId]
      );
    return rows;
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Get all active makes with count of models
 */
async function getAllMakesWithStats(db) {
  try {
    const [rows] = await db
      .promise()
      .query(
        `SELECT 
          vm.id, 
          vm.name, 
          vm.category, 
          COUNT(vmodel.id) as modelCount 
         FROM vehicle_makes vm
         LEFT JOIN vehicle_models vmodel ON vm.id = vmodel.make_id AND vmodel.is_active = TRUE
         WHERE vm.is_active = TRUE
         GROUP BY vm.id, vm.name, vm.category
         ORDER BY vm.category, vm.name`
      );
    return rows;
  } catch (error) {
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Check if plate exists
 */
async function checkPlateExists(plateNumber, db, excludeVehicleId = null) {
  try {
    const normalized = normalizePlateNumber(plateNumber);
    let query = 'SELECT id FROM vehicles WHERE plate_number = ?';
    const params = [normalized];

    if (excludeVehicleId) {
      query += ' AND id != ?';
      params.push(excludeVehicleId);
    }

    const [rows] = await db.promise().query(query, params);
    return rows.length > 0;
  } catch (error) {
    throw new Error(`Database error checking plate: ${error.message}`);
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Validation functions
  validatePlateNumber,
  normalizePlateNumber,
  validateVehicleMake,
  validateCustomMake,
  validateVehicleModel,
  checkModelExists,
  validateVehicleData,

  // Database helpers
  getMakeById,
  getModelsForMake,
  getAllMakesWithStats,
  checkPlateExists,
};
