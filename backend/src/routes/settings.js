const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { asyncHandler } = require('../utils/asyncHandler')
const SystemSettingsService = require('../services/systemSettingsService')
const { emitSettingsUpdated } = require('../realtime/hub')

const router = express.Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    if (_req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'SuperAdmin access required' })
    }
    const result = await SystemSettingsService.getAll()
    return res.json(result)
  }),
)

router.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ message: 'SuperAdmin access required' })
    }

    const settings = req.body?.settings && typeof req.body.settings === 'object'
      ? req.body.settings
      : (req.body && typeof req.body === 'object' ? req.body : null)

    if (!settings || Array.isArray(settings)) {
      return res.status(400).json({ message: 'Invalid payload. Expected an object of settings.' })
    }

    const updatedRows = await SystemSettingsService.upsertMany(settings)
    const latest = updatedRows.reduce((acc, row) => {
      if (!acc) return row.updated_at
      return new Date(row.updated_at) > new Date(acc) ? row.updated_at : acc
    }, null)

    emitSettingsUpdated({
      source: 'api/settings',
      updatedKeys: updatedRows.map((r) => r.key_name),
      updatedAt: latest,
    })

    return res.json({
      success: true,
      updated: updatedRows.length,
      data: updatedRows,
    })
  }),
)

module.exports = router
