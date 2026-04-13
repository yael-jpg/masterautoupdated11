const express = require('express')
const { body, param, query } = require('express-validator')
const db = require('../config/db')
const { asyncHandler } = require('../utils/asyncHandler')
const { validateRequest } = require('../middleware/validateRequest')
const { requireRole } = require('../middleware/auth')
const { emitToRole, emitToLandingVisitor } = require('../realtime/hub')

const router = express.Router()

function toChatMessage(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderType: row.sender_type,
    senderLabel: row.sender_label,
    message: row.message,
    isAuto: row.is_auto,
    createdAt: row.created_at,
  }
}

router.get(
  '/threads',
  requireRole('SuperAdmin'),
  query('status').optional().isIn(['open', 'closed']).withMessage('status must be open or closed'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || '').trim().toLowerCase()

    const values = []
    let whereSql = ''
    if (status) {
      values.push(status)
      whereSql = `WHERE t.status = $${values.length}`
    }

    const { rows } = await db.query(
      `SELECT t.id,
              t.visitor_token,
              t.visitor_name,
              t.status,
              t.last_message_at,
              t.created_at,
              m.id AS last_message_id,
              m.sender_type AS last_sender_type,
              m.sender_label AS last_sender_label,
              m.message AS last_message,
              m.is_auto AS last_message_auto,
              m.created_at AS last_message_at_exact
       FROM landing_chat_threads t
       LEFT JOIN LATERAL (
         SELECT id, sender_type, sender_label, message, is_auto, created_at
         FROM landing_chat_messages
         WHERE thread_id = t.id
         ORDER BY created_at DESC, id DESC
         LIMIT 1
       ) m ON TRUE
       ${whereSql}
       ORDER BY t.last_message_at DESC, t.id DESC
       LIMIT 200`,
      values,
    )

    return res.json(
      rows.map((r) => ({
        id: r.id,
        visitorToken: r.visitor_token,
        visitorName: r.visitor_name || 'Guest',
        status: r.status,
        createdAt: r.created_at,
        lastMessageAt: r.last_message_at,
        lastMessage: r.last_message
          ? {
              id: r.last_message_id,
              senderType: r.last_sender_type,
              senderLabel: r.last_sender_label,
              message: r.last_message,
              isAuto: r.last_message_auto,
              createdAt: r.last_message_at_exact,
            }
          : null,
      })),
    )
  }),
)

router.get(
  '/threads/:threadId/messages',
  requireRole('SuperAdmin'),
  param('threadId').isInt({ min: 1 }).withMessage('threadId must be a valid id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const threadId = Number(req.params.threadId)

    const threadResult = await db.query(
      `SELECT id, visitor_name, visitor_token, status, created_at, last_message_at
       FROM landing_chat_threads
       WHERE id = $1`,
      [threadId],
    )

    if (!threadResult.rows.length) {
      return res.status(404).json({ message: 'Thread not found' })
    }

    const { rows } = await db.query(
      `SELECT id, thread_id, sender_type, sender_label, message, is_auto, created_at
       FROM landing_chat_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC, id ASC`,
      [threadId],
    )

    return res.json({
      thread: threadResult.rows[0],
      messages: rows.map(toChatMessage),
    })
  }),
)

router.post(
  '/threads/:threadId/reply',
  requireRole('SuperAdmin'),
  param('threadId').isInt({ min: 1 }).withMessage('threadId must be a valid id'),
  body('message').isString().trim().notEmpty().withMessage('message is required'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const threadId = Number(req.params.threadId)
    const message = String(req.body.message || '').trim()
    const senderLabel = String(req.user?.fullName || req.user?.email || 'SuperAdmin')

    const threadResult = await db.query(
      `SELECT id, visitor_token, visitor_name FROM landing_chat_threads WHERE id = $1`,
      [threadId],
    )
    if (!threadResult.rows.length) {
      return res.status(404).json({ message: 'Thread not found' })
    }

    const { rows } = await db.query(
      `INSERT INTO landing_chat_messages (thread_id, sender_type, sender_label, message, is_auto)
       VALUES ($1, 'superadmin', $2, $3, FALSE)
       RETURNING id, thread_id, sender_type, sender_label, message, is_auto, created_at`,
      [threadId, senderLabel, message],
    )

    await db.query(
      `UPDATE landing_chat_threads
       SET status = 'open',
           last_message_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [threadId],
    )

    const thread = threadResult.rows[0]
    const payloadMessage = toChatMessage(rows[0])

    emitToRole('admin', 'landing-chat:new-message', {
      threadId,
      visitorToken: thread.visitor_token,
      message: payloadMessage,
      source: 'superadmin',
    })

    emitToLandingVisitor(thread.visitor_token, 'landing-chat:new-message', {
      threadId,
      visitorToken: thread.visitor_token,
      messages: [payloadMessage],
      source: 'superadmin',
    })

    return res.status(201).json({
      message: 'Reply sent',
      chatMessage: toChatMessage(rows[0]),
    })
  }),
)

router.patch(
  '/threads/:threadId/status',
  requireRole('SuperAdmin'),
  param('threadId').isInt({ min: 1 }).withMessage('threadId must be a valid id'),
  body('status').isIn(['open', 'closed']).withMessage('status must be open or closed'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const threadId = Number(req.params.threadId)
    const status = String(req.body.status || '').toLowerCase()

    const { rowCount, rows } = await db.query(
      `UPDATE landing_chat_threads
       SET status = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, visitor_name, visitor_token, status, created_at, updated_at, last_message_at`,
      [threadId, status],
    )

    if (!rowCount) {
      return res.status(404).json({ message: 'Thread not found' })
    }

    emitToRole('admin', 'landing-chat:thread-updated', {
      threadId,
      visitorToken: rows[0].visitor_token,
      visitorName: rows[0].visitor_name || 'Guest',
      status,
      source: 'superadmin',
      at: new Date().toISOString(),
    })

    return res.json({
      message: `Thread marked as ${status}`,
      thread: rows[0],
    })
  }),
)

module.exports = router
