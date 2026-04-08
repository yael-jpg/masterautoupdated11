const db = require('../config/db')
const { emitToRole, emitToAdminUser, emitToClientUser } = require('../realtime/hub')

class NotificationService {
  static async getColumnMap() {
    const { rows } = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'notifications'`,
    )

    const columns = new Set(rows.map((r) => r.column_name))
    return {
      hasNotifType: columns.has('notif_type'),
      hasData: columns.has('data'),
      hasPayload: columns.has('payload'),
      hasRole: columns.has('role'),
      hasRecipientRole: columns.has('recipient_role'),
    }
  }

  static async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT,
        role VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        payload JSONB,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)

    const map = await this.getColumnMap()

    if (!map.hasRole && map.hasRecipientRole) {
      await db.query('ALTER TABLE notifications RENAME COLUMN recipient_role TO role')
    }

    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INT')
    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS role VARCHAR(20)')
    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255)')
    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT')
    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB')
    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE')
    await db.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()')

    // Legacy schemas may enforce user_id NOT NULL, which conflicts with broadcast notifications.
    await db.query('ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL')

    await db.query("UPDATE notifications SET role = COALESCE(role, 'admin') WHERE role IS NULL")
    await db.query("UPDATE notifications SET title = COALESCE(NULLIF(TRIM(title), ''), 'Notification') WHERE title IS NULL OR TRIM(title) = ''")
    await db.query("UPDATE notifications SET message = COALESCE(NULLIF(TRIM(message), ''), title, 'Notification') WHERE message IS NULL OR TRIM(message) = ''")

    await db.query('ALTER TABLE notifications ALTER COLUMN role SET NOT NULL')
    await db.query('ALTER TABLE notifications ALTER COLUMN title SET NOT NULL')
    await db.query('ALTER TABLE notifications ALTER COLUMN message SET NOT NULL')

    const refreshed = await this.getColumnMap()
    if (refreshed.hasNotifType) {
      await db.query("ALTER TABLE notifications ALTER COLUMN notif_type SET DEFAULT 'config_updated'")
      await db.query("UPDATE notifications SET notif_type = COALESCE(NULLIF(TRIM(notif_type), ''), 'config_updated') WHERE notif_type IS NULL OR TRIM(notif_type) = ''")
      await db.query('ALTER TABLE notifications ALTER COLUMN notif_type SET NOT NULL')
    }

    await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_role_created ON notifications(role, created_at DESC)')
    await db.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)')
  }

  static async create({ userId = null, role, title, message, payload = null }) {
    await this.ensureTable()

    const map = await this.getColumnMap()
    const insertColumns = ['user_id', 'role', 'title', 'message']
    const placeholders = ['$1', '$2', '$3', '$4']
    const values = [userId, role, title, message]

    if (map.hasPayload) {
      insertColumns.push('payload')
      placeholders.push(`$${values.length + 1}::jsonb`)
      values.push(payload ? JSON.stringify(payload) : null)
    }

    if (map.hasNotifType) {
      insertColumns.push('notif_type')
      placeholders.push(`$${values.length + 1}`)
      values.push('config_updated')
    }

    if (map.hasData) {
      insertColumns.push('data')
      placeholders.push(`$${values.length + 1}::jsonb`)
      values.push(payload ? JSON.stringify(payload) : null)
    }

    const { rows } = await db.query(
      `INSERT INTO notifications (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING id, user_id, role, title, message, payload, is_read, created_at`,
      values,
    )

    const notif = rows[0]
    this.emitRealtime(notif)
    return notif
  }

  static emitRealtime(notification) {
    if (!notification) return

    if (notification.role === 'admin') {
      if (notification.user_id) emitToAdminUser(notification.user_id, 'notification:new', notification)
      else emitToRole('admin', 'notification:new', notification)
      return
    }

    if (notification.role === 'client') {
      if (notification.user_id) emitToClientUser(notification.user_id, 'notification:new', notification)
      else emitToRole('client', 'notification:new', notification)
    }
  }

  static async listForActor({ role, userId }) {
    await this.ensureTable()

    const { rows } = await db.query(
      `SELECT id, user_id, role, title, message, payload, is_read, created_at
       FROM notifications
       WHERE role = $1
         AND (user_id IS NULL OR user_id = $2)
       ORDER BY created_at DESC
       LIMIT 200`,
      [role, userId || null],
    )

    return rows
  }

  static async markAsRead({ role, userId, id }) {
    await this.ensureTable()

    const { rows } = await db.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1
         AND role = $2
         AND (user_id IS NULL OR user_id = $3)
       RETURNING id, user_id, role, title, message, payload, is_read, created_at`,
      [id, role, userId || null],
    )

    return rows[0] || null
  }
}

module.exports = NotificationService
