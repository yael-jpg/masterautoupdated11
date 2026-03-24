const db = require('../config/db')

async function writeAuditLog({ userId, action, entity, entityId, meta }) {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, meta)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, entity, entityId || null, meta || null],
  )
}

module.exports = { writeAuditLog }
