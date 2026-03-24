/**
 * useVehicleRegistration Hook
 * Manages vehicle registration form state with cascading Make → Model → Variant
 * Handles validation and API integration
 */

import { useState, useEffect, useCallback } from 'react'
import VehicleApi from '../services/vehicleApi'

export default function useVehicleRegistration(initialData = {}) {
  // Make state
  const [makes, setMakes] = useState([])
  const [selectedMakeId, setSelectedMakeId] = useState(initialData.makeId || null)
  const [makeLoading, setMakeLoading] = useState(true)
  const [makeError, setMakeError] = useState(null)

  // Model state
  const [models, setModels] = useState([])
  const [selectedModelId, setSelectedModelId] = useState(initialData.modelId || null)
  const [modelLoading, setModelLoading] = useState(false)
  const [modelError, setModelError] = useState(null)

  // Variant state
  const [variants, setVariants] = useState([])
  const [selectedVariantId, setSelectedVariantId] = useState(initialData.variantId || null)
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantError, setVariantError] = useState(null)

  // Year state (driven by selected variant)
  const [years, setYears] = useState([])
  const [yearLoading, setYearLoading] = useState(false)
  const [yearError, setYearError] = useState(null)

  // Other vehicle data
  const [plateNumber, setPlateNumber] = useState(initialData.plateNumber || '')
  const [customMake, setCustomMake] = useState(initialData.customMake || '')
  const [customModel, setCustomModel] = useState(initialData.customModel || '')
  const [year, setYear] = useState(initialData.year || new Date().getFullYear())
  const [color, setColor] = useState(initialData.color || '')
  const [bodyType, setBodyType] = useState(initialData.bodyType || '')
  const [fuelType, setFuelType] = useState(initialData.fuelType || '')
  const [transmission, setTransmission] = useState(initialData.transmission || '')

  // Validation errors
  const [errors, setErrors] = useState({})

  // Load makes on mount
  useEffect(() => {
    const loadMakes = async () => {
      try {
        setMakeLoading(true)
        setMakeError(null)
        const makesData = await VehicleApi.getAllMakes()
        setMakes(makesData)
      } catch (error) {
        setMakeError(error.message)
        console.error('Error loading makes:', error)
      } finally {
        setMakeLoading(false)
      }
    }

    loadMakes()
  }, [])

  // Load models when make changes
  useEffect(() => {
    const loadModels = async () => {
      if (!selectedMakeId) {
        setModels([])
        setSelectedModelId(null)
        return
      }

      try {
        setModelLoading(true)
        setModelError(null)
        const modelsData = await VehicleApi.getModelsForMake(selectedMakeId)
        setModels(modelsData)
        setSelectedModelId(null) // Reset model when make changes
        setSelectedVariantId(null) // Reset variant as well
        setYears([]) // Reset years as well
      } catch (error) {
        setModelError(error.message)
        console.error('Error loading models:', error)
      } finally {
        setModelLoading(false)
      }
    }

    loadModels()
  }, [selectedMakeId])

  // Load variants when model changes
  useEffect(() => {
    const loadVariants = async () => {
      if (!selectedModelId) {
        setVariants([])
        setSelectedVariantId(null)
        setYears([])
        return
      }

      try {
        setVariantLoading(true)
        setVariantError(null)
        const variantsData = await VehicleApi.getVariantsForModel(selectedModelId)
        setVariants(variantsData)
        setSelectedVariantId(null) // Reset variant when model changes
        setYears([])
      } catch (error) {
        setVariantError(error.message)
        console.error('Error loading variants:', error)
      } finally {
        setVariantLoading(false)
      }
    }

    loadVariants()
  }, [selectedModelId])

  // Load years and auto-fill transmission/fuelType when variant changes
  useEffect(() => {
    const loadYears = async () => {
      if (!selectedVariantId) {
        setYears([])
        return
      }

      // Auto-fill transmission & fuel type from already-loaded variant data
      const variant = variants.find((v) => v.id === selectedVariantId)
      if (variant) {
        if (variant.transmission) setTransmission(variant.transmission)
        if (variant.fuel_type) setFuelType(variant.fuel_type)
      }

      try {
        setYearLoading(true)
        setYearError(null)
        const yearsData = await VehicleApi.getYearsForVariant(selectedVariantId)
        setYears(yearsData)
        // Auto-fill year to the first (most recent) option if none set
        if (yearsData.length > 0) {
          setYear(yearsData[0].year_model)
        }
      } catch (error) {
        setYearError(error.message)
        console.error('Error loading years:', error)
      } finally {
        setYearLoading(false)
      }
    }

    loadYears()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantId])

  // Get selected make details
  const selectedMake = makes.find(m => m.id === selectedMakeId)

  // Get selected model details
  const selectedModel = models.find(m => m.id === selectedModelId)

  // Get selected variant details
  const selectedVariant = variants.find(v => v.id === selectedVariantId)

  // Validate plate number
  const validatePlateNumber = useCallback((plate) => {
    if (!plate) return { valid: true }

    // Philippine plate format: XX1234XXXX (with optional dashes/spaces)
    const normalized = plate.replace(/[\s\-]/g, '').trim().toUpperCase()
    const plateRegex = /^[A-Z]{2}[0-9]{4}[A-Z]{3}$/

    if (!plateRegex.test(normalized)) {
      return {
        valid: false,
        error: 'Invalid plate format. Expected: XX1234XXX (e.g., AB1234ABC)',
      }
    }

    return { valid: true }
  }, [])

  // Validate entire form
  const validateForm = useCallback(() => {
    const newErrors = {}

    // Make validation
    if (!selectedMakeId && !customMake) {
      newErrors.make = 'Select a vehicle make or specify a custom make'
    }

    // Model validation
    if (!selectedModelId && !customModel) {
      newErrors.model = 'Select a vehicle model or specify a custom model'
    }

    // Plate number validation
    if (!plateNumber) {
      newErrors.plateNumber = 'Plate number is required'
    } else {
      const plateValidation = validatePlateNumber(plateNumber)
      if (!plateValidation.valid) {
        newErrors.plateNumber = plateValidation.error
      }
    }

    // Year validation
    const currentYear = new Date().getFullYear()
    if (year && (year < 1900 || year > currentYear + 1)) {
      newErrors.year = `Year must be between 1900 and ${currentYear + 1}`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [selectedMakeId, customMake, selectedModelId, customModel, plateNumber, year, validatePlateNumber])

  // Prepare form data for submission
  const prepareFormData = useCallback(() => {
    return {
      makeId: selectedMakeId || null,
      modelId: selectedModelId || null,
      variantId: selectedVariantId || null,
      customMake: selectedMakeId ? null : customMake,
      customModel: selectedModelId ? null : customModel,
      plateNumber: plateNumber.replace(/[\s\-]/g, '').toUpperCase(),
      year: year ? parseInt(year) : null,
      color: color || null,
      bodyType: bodyType || null,
      fuelType: fuelType || selectedVariant?.fuel_type || null,
      transmission: transmission || selectedVariant?.transmission || null,
    }
  }, [
    selectedMakeId,
    selectedModelId,
    selectedVariantId,
    customMake,
    customModel,
    plateNumber,
    year,
    color,
    bodyType,
    fuelType,
    transmission,
    selectedVariant,
  ])

  // Clear form
  const clearForm = useCallback(() => {
    setSelectedMakeId(null)
    setSelectedModelId(null)
    setSelectedVariantId(null)
    setPlateNumber('')
    setCustomMake('')
    setCustomModel('')
    setYear(new Date().getFullYear())
    setColor('')
    setBodyType('')
    setFuelType('')
    setTransmission('')
    setYears([])
    setErrors({})
  }, [])

  // Create a new make and select it
  const createMake = useCallback(async (name, category = null) => {
    if (!name) throw new Error('Make name is required')
    try {
      setMakeLoading(true)
      const newMake = await VehicleApi.createMake({ name, category })
      // Append to local makes list and select
      setMakes((prev) => {
        // avoid duplicates
        if (prev.find(m => m.id === newMake.id)) return prev
        return [...prev, newMake]
      })
      setSelectedMakeId(newMake.id)
      setCustomMake('')
      return newMake
    } catch (error) {
      console.error('Failed to create make:', error)
      throw error
    } finally {
      setMakeLoading(false)
    }
  }, [setMakes])

  return {
    // Makes
    makes,
    selectedMakeId,
    setSelectedMakeId,
    selectedMake,
    makeLoading,
    makeError,

    // Models
    models,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    modelLoading,
    modelError,

    // Variants
    variants,
    selectedVariantId,
    setSelectedVariantId,
    selectedVariant,
    variantLoading,
    variantError,

    // Years (cascade from selected variant)
    years,
    yearLoading,
    yearError,

    // Other fields
    plateNumber,
    setPlateNumber,
    customMake,
    setCustomMake,
    customModel,
    setCustomModel,
    year,
    setYear,
    color,
    setColor,
    bodyType,
    setBodyType,
    fuelType,
    setFuelType,
    transmission,
    setTransmission,

    // Validation
    errors,
    setErrors,
    validateForm,
    validatePlateNumber,

    // Utilities
    prepareFormData,
    clearForm,
    createMake,
  }
}
