const db = require('../config/db')

class SystemSettingsService {
  static async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key_name VARCHAR(255) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
  }

  static async getAll() {
    await this.ensureTable()
    const { rows } = await db.query(
      `SELECT id, key_name, value, updated_at
       FROM system_settings
       ORDER BY key_name ASC`,
    )

    const data = {}
    let latest = null
    for (const row of rows) {
      data[row.key_name] = row.value
      if (!latest || new Date(row.updated_at) > new Date(latest)) {
        latest = row.updated_at
      }
    }

    return {
      data,
      updatedAt: latest,
    }
  }

  static async upsertMany(settings = {}) {
    await this.ensureTable()
    const entries = Object.entries(settings || {})
    if (!entries.length) return []

    const updated = []
    for (const [keyName, value] of entries) {
      const { rows } = await db.query(
        `INSERT INTO system_settings (key_name, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key_name)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING id, key_name, value, updated_at`,
        [keyName, JSON.stringify(value)],
      )
      updated.push(rows[0])
    }

    return updated
  }
}

module.exports = SystemSettingsService
