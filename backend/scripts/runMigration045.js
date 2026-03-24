const path = require('path')
const fs   = require('fs')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'masterauto',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
})

async function run() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../sql/migrations/045_email_config_cta_url.sql'),
    'utf8'
  )
  const client = await pool.connect()
  try {
    console.log('Running migration 045 — email config cta_url …')
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('Migration 045 complete.')

    const { rows } = await client.query(
      `SELECT key, value FROM configuration_settings
       WHERE category = 'email'
       AND key IN ('default_cta_url','default_sender_name','default_sender_email','default_cta_label')
       ORDER BY key`
    )
    console.table(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration 045 failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
