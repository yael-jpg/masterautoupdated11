/**
 * Vehicle Validation Utilities
 * Server-side and client-side validation for vehicle inputs
 */

import { VEHICLE_MAKES, isMakeValid, getModelsForMake } from '../data/vehicleMakes';

// ==========================================
// PLATE NUMBER VALIDATION
// ==========================================

/**
 * Philippine Plate Format Validation
 * Standard: 2 Letters + 2 Numbers + 4 Letters (e.g., ABC 1234 DEF)
 * Accepts with or without spaces/dashes
 */
export const validatePlateNumber = (plateNumber) => {
  if (!plateNumber) {
    return {
      valid: false,
      error: 'Plate number is required',
    };
  }

  // Normalize: remove spaces, dashes, convert to uppercase
  const normalized = plateNumber
    .toUpperCase()
    .replace(/[\s\-]/g, '')
    .trim();

  // Philippine format: 2 letters + 2 numbers + 4 letters
  const phPlateRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{4}$/;

  if (!phPlateRegex.test(normalized)) {
    return {
      valid: false,
      error: 'Invalid plate format. Expected: XX1234XXXX (e.g., AB1234CDEF)',
      suggestedFormat: 'XX1234XXXX',
    };
  }

  return {
    valid: true,
    normalized: normalized,
    formatted: `${normalized.substring(0, 2)} ${normalized.substring(2, 6)} ${normalized.substring(6)}`,
  };
};

/**
 * Normalize plate number (uppercase, no spaces/dashes)
 */
export const normalizePlateNumber = (plateNumber) => {
  return plateNumber
    .toUpperCase()
    .replace(/[\s\-]/g, '')
    .trim();
};

/**
 * Format plate number for display (XX 1234 XXXX)
 */
export const formatPlateNumber = (plateNumber) => {
  const normalized = normalizePlateNumber(plateNumber);
  if (normalized.length === 8) {
    return `${normalized.substring(0, 2)} ${normalized.substring(2, 6)} ${normalized.substring(6)}`;
  }
  return plateNumber;
};

// ==========================================
// VEHICLE MAKE VALIDATION
// ==========================================

/**
 * Validate vehicle make selection
 */
export const validateVehicleMake = (makeName, allowCustom = false) => {
  if (!makeName || makeName.trim() === '') {
    return {
      valid: false,
      error: 'Vehicle make is required',
    };
  }

  const trimmed = makeName.trim();

  // Check if it's in standard list
  if (isMakeValid(trimmed)) {
    return {
      valid: true,
      make: trimmed,
      isCustom: false,
    };
  }

  // If "Other (Specify)" is selected, allow custom input
  if (trimmed === 'Other (Specify)' || trimmed === 'Other') {
    return {
      valid: true,
      make: 'Other',
      isCustom: false,
      requiresCustomInput: true,
    };
  }

  // If custom is allowed and "Other" is selected
  if (allowCustom && (trimmed === 'Other' || trimmed === 'Other (Specify)')) {
    return {
      valid: true,
      make: trimmed,
      isCustom: true,
    };
  }

  return {
    valid: false,
    error: `"${trimmed}" is not a recognized vehicle make. Please select from the list or choose "Other (Specify)".`,
    suggestions: suggestMakes(trimmed),
  };
};

/**
 * Validate custom vehicle make input
 */
export const validateCustomMake = (customMake) => {
  if (!customMake) {
    return {
      valid: false,
      error: 'Please specify a vehicle make',
    };
  }

  const trimmed = customMake.trim();

  // Check length
  if (trimmed.length < 2) {
    return {
      valid: false,
      error: 'Vehicle make must be at least 2 characters',
    };
  }

  if (trimmed.length > 100) {
    return {
      valid: false,
      error: 'Vehicle make must not exceed 100 characters',
    };
  }

  // Check for invalid characters
  if (!/^[a-zA-Z0-9\s\-&.,']+$/i.test(trimmed)) {
    return {
      valid: false,
      error: 'Vehicle make contains invalid characters',
    };
  }

  // Check if it's already in the standard list
  if (isMakeValid(trimmed)) {
    return {
      valid: true,
      custom: trimmed.toUpperCase(),
      warning: 'This make is already in our system. Please select from the dropdown instead.',
    };
  }

  return {
    valid: true,
    custom: trimmed.toUpperCase(),
  };
};

// ==========================================
// VEHICLE MODEL VALIDATION
// ==========================================

/**
 * Validate vehicle model
 */
export const validateVehicleModel = (model, make) => {
  if (!model || model.trim() === '') {
    return {
      valid: false,
      error: 'Vehicle model is required',
    };
  }

  const trimmed = model.trim();

  // Get available models for the make
  const availableModels = getModelsForMake(make);

  if (availableModels.length > 0) {
    // If models are predefined for this make
    const isValidModel = availableModels.some(
      (m) => m.toLowerCase() === trimmed.toLowerCase()
    );

    if (!isValidModel) {
      return {
        valid: false,
        error: `"${trimmed}" is not a valid model for ${make}`,
        suggestedModels: availableModels.slice(0, 5),
      };
    }
  }

  // Generic model validation
  if (trimmed.length < 1 || trimmed.length > 100) {
    return {
      valid: false,
      error: 'Model name must be between 1 and 100 characters',
    };
  }

  return {
    valid: true,
    model: trimmed,
  };
};

// ==========================================
// COMPLETE VEHICLE VALIDATION
// ==========================================

/**
 * Validate entire vehicle entry
 */
export const validateVehicleEntry = (vehicle) => {
  const errors = {};

  // Validate make
  const makeValidation = validateVehicleMake(vehicle.make);
  if (!makeValidation.valid) {
    errors.make = makeValidation.error;
  } else if (makeValidation.requiresCustomInput && !vehicle.customMake) {
    errors.customMake = 'Please specify the vehicle make';
  }

  // Validate custom make if "Other" is selected
  if (vehicle.customMake) {
    const customValidation = validateCustomMake(vehicle.customMake);
    if (!customValidation.valid) {
      errors.customMake = customValidation.error;
    }
  }

  // Validate model
  if (vehicle.model) {
    const modelValidation = validateVehicleModel(vehicle.model, vehicle.make);
    if (!modelValidation.valid) {
      errors.model = modelValidation.error;
    }
  } else {
    errors.model = 'Vehicle model is required';
  }

  // Validate plate number
  if (vehicle.plateNumber) {
    const plateValidation = validatePlateNumber(vehicle.plateNumber);
    if (!plateValidation.valid) {
      errors.plateNumber = plateValidation.error;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Suggest similar makes based on keyword
 */
export const suggestMakes = (keyword, limit = 5) => {
  const lowercaseKeyword = keyword.toLowerCase();
  const suggestions = VEHICLE_MAKES.filter(
    (make) =>
      make.name.toLowerCase().startsWith(lowercaseKeyword) ||
      make.name.toLowerCase().includes(lowercaseKeyword)
  );

  return suggestions.slice(0, limit).map((m) => m.name);
};

/**
 * Get category from make name
 */
export const getCategoryForMake = (makeName) => {
  const make = VEHICLE_MAKES.find((m) => m.name.toLowerCase() === makeName.toLowerCase());
  return make ? make.category : null;
};

/**
 * Detect suspicious plate numbers
 */
export const flagSuspiciousPlate = (plateNumber) => {
  const normalized = normalizePlateNumber(plateNumber);

  // Check for sequential numbers (e.g., 1111)
  if (/1111|2222|3333|4444|5555|6666|7777|8888|9999|0000/.test(normalized)) {
    return {
      suspicious: true,
      reason: 'Plate has sequential digits',
      severity: 'low',
    };
  }

  // Check for all same letters
  const letters = normalized.substring(0, 2) + normalized.substring(6);
  if (letters === letters.charAt(0).repeat(6)) {
    return {
      suspicious: true,
      reason: 'Plate has all same letters',
      severity: 'low',
    };
  }

  return {
    suspicious: false,
  };
};

/**
 * Check for duplicate plate in existing vehicles
 * This would typically be called from backend
 */
export const checkDuplicatePlate = async (plateNumber, excludeVehicleId = null) => {
  const normalized = normalizePlateNumber(plateNumber);

  try {
    const params = new URLSearchParams({ plate: normalized });
    if (excludeVehicleId) {
      params.append('exclude', excludeVehicleId);
    }

    const response = await fetch(`/api/vehicles/check-plate?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('masterauto_token')}` },
    });

    if (!response.ok) {
      throw new Error('Failed to check plate');
    }

    const data = await response.json();
    return data.isDuplicate;
  } catch (error) {
    console.error('Error checking plate:', error);
    return false;
  }
};
