const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { asyncHandler } = require('../utils/asyncHandler')
const { getActorFromRequest } = require('../middleware/actorAuth')
const NotificationService = require('../services/notificationService')

const router = express.Router()

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = getActorFromRequest(req)
    if (!actor) return res.status(403).json({ message: 'Not allowed' })

    const rows = await NotificationService.listForActor(actor)
    return res.json(rows)
  }),
)

router.put(
  '/read/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const actor = getActorFromRequest(req)
    if (!actor) return res.status(403).json({ message: 'Not allowed' })

    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid notification id' })
    }

    const row = await NotificationService.markAsRead({ ...actor, id })
    if (!row) return res.status(404).json({ message: 'Notification not found' })
    return res.json(row)
  }),
)

module.exports = router
